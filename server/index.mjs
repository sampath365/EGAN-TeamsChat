import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { WebSocketServer } from 'ws';

import {
  db, id, now, persist, verifyToken, signToken, verifyPassword, hashPassword, UPLOAD_DIR, DATA_DIR,
} from './store.mjs';
import { seedDemo, publicUser, pickColor } from './seed.mjs';
import {
  PERMISSIONS, can, membershipFor, roleFor, requireMember, requirePermission,
  channelAccessible, channelMemberIds, isMember,
} from './access.mjs';

const PORT = Number(process.env.PORT || 4100);
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '4mb' }));

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ------------------------------------------------------------------ helpers */

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function authOptional(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  const payload = verifyToken(token);
  req.user = payload ? db.users.find((u) => u.id === payload.sub) || null : null;
  next();
}

function authRequired(req, _res, next) {
  authOptional(req, _res, () => {
    if (!req.user) return next(fail(401, 'Please sign in.'));
    next();
  });
}

const socketHub = new Map(); // userId -> Set<WebSocket>

function broadcastToUsers(userIds, payload) {
  const seen = new Set();
  for (const uid of userIds) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    const sockets = socketHub.get(uid);
    if (!sockets) continue;
    const data = JSON.stringify(payload);
    for (const ws of sockets) {
      if (ws.readyState === 1) ws.send(data);
    }
  }
}

function messageView(m, viewerId) {
  const author = db.users.find((u) => u.id === m.authorId);
  const reactions = db.reactions.filter((r) => r.messageId === m.id);
  const grouped = {};
  for (const r of reactions) {
    grouped[r.emoji] = grouped[r.emoji] || { emoji: r.emoji, count: 0, mine: false, users: [] };
    grouped[r.emoji].count += 1;
    grouped[r.emoji].users.push(r.userId);
    if (r.userId === viewerId) grouped[r.emoji].mine = true;
  }
  return {
    ...m,
    author: publicUser(author),
    reactions: Object.values(grouped),
    replyCount: db.messages.filter((x) => x.parentId === m.id && !x.deletedAt).length,
  };
}

function channelView(ch, userId) {
  const messages = db.messages.filter((m) => m.channelId === ch.id && !m.deletedAt);
  const last = messages[messages.length - 1];
  const readRow = db.readState.find((r) => r.channelId === ch.id && r.userId === userId);
  const lastReadAt = readRow ? readRow.lastReadAt : null;
  const unread = messages.filter(
    (m) => m.authorId !== userId && (!lastReadAt || m.createdAt > lastReadAt),
  ).length;
  return {
    ...ch,
    memberIds: channelMemberIds(ch.id),
    unread,
    lastMessage: last
      ? { body: last.body.slice(0, 140), createdAt: last.createdAt, authorName: db.users.find((u) => u.id === last.authorId)?.name || '' }
      : null,
  };
}

function teamView(team, userId) {
  const membership = membershipFor(team.id, userId);
  return {
    ...team,
    role: membership ? membership.role : null,
    permissions: membership ? membership.permissions || [] : [],
    memberCount: db.memberships.filter((m) => m.teamId === team.id).length,
  };
}

function notify(userId, payload) {
  const row = {
    id: id('notif'),
    userId,
    read: false,
    createdAt: now(),
    ...payload,
  };
  db.notifications.push(row);
  persist();
  broadcastToUsers([userId], { type: 'notification', notification: row });
  return row;
}

/* --------------------------------------------------------------------- auth */

app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password, title } = req.body || {};
  if (!name || !email || !password) throw fail(400, 'Name, email and password are required.');
  if (String(password).length < 6) throw fail(400, 'Password must be at least 6 characters.');
  const exists = db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (exists) throw fail(409, 'An account with that email already exists.');

  const user = {
    id: id('u'),
    name: String(name).trim(),
    email: String(email).trim(),
    title: title || '',
    avatarColor: pickColor(String(email)),
    avatarUrl: null,
    passwordHash: hashPassword(password),
    status: 'online',
    statusText: '',
    isBot: false,
    createdAt: now(),
  };
  db.users.push(user);
  db.presence.push({ id: id('p'), userId: user.id, status: 'online', lastSeen: now() });

  // Every new account gets its own starter team so the app is usable immediately.
  const team = {
    id: id('t'),
    name: `${user.name.split(' ')[0]}'s workspace`,
    slug: `ws-${user.id.slice(-6)}`,
    description: 'Your private workspace. Invite your team when you are ready.',
    avatarColor: pickColor(user.email),
    ownerId: user.id,
    createdAt: now(),
  };
  db.teams.push(team);
  db.memberships.push({ id: id('m'), teamId: team.id, userId: user.id, role: 'owner', joinedAt: now(), permissions: [] });

  for (const [name2, topic] of [['general', 'Team-wide announcements'], ['random', 'Off-topic and fun']]) {
    const ch = {
      id: id('c'), teamId: team.id, name: name2, topic, kind: 'public',
      isPrivate: false, createdBy: user.id, createdAt: now(), archived: false,
    };
    db.channels.push(ch);
    db.channelMembers.push({ id: id('cm'), channelId: ch.id, userId: user.id });
  }
  persist();

  res.json({ token: signToken({ sub: user.id }), user: publicUser(user), teamId: team.id });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !verifyPassword(String(password || ''), user.passwordHash)) {
    throw fail(401, 'Email or password is incorrect.');
  }
  user.status = 'online';
  persist();
  res.json({ token: signToken({ sub: user.id }), user: publicUser(user) });
}));

app.get('/api/auth/me', authRequired, wrap(async (req, res) => {
  res.json({ user: publicUser(req.user) });
}));

app.patch('/api/auth/me', authRequired, wrap(async (req, res) => {
  const { name, title, status, statusText, avatarUrl } = req.body || {};
  if (typeof name === 'string' && name.trim()) req.user.name = name.trim();
  if (typeof title === 'string') req.user.title = title;
  if (typeof status === 'string') req.user.status = status;
  if (typeof statusText === 'string') req.user.statusText = statusText;
  if (typeof avatarUrl === 'string') req.user.avatarUrl = avatarUrl || null;
  persist();
  broadcastToUsers([...new Set(db.memberships.filter((m) => db.teams.some((t) => t.id === m.teamId)).map((m) => m.userId))], {
    type: 'user.updated', user: publicUser(req.user),
  });
  res.json({ user: publicUser(req.user) });
}));

app.get('/api/users', authRequired, wrap(async (req, res) => {
  res.json({ users: db.users.filter((u) => !u.isBot || true).map(publicUser) });
}));

/* -------------------------------------------------------------------- teams */

app.get('/api/teams', authRequired, wrap(async (req, res) => {
  const teams = db.teams.filter((t) => isMember(t.id, req.user.id));
  res.json({ teams: teams.map((t) => teamView(t, req.user.id)) });
}));

app.post('/api/teams', authRequired, wrap(async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) throw fail(400, 'Team name is required.');
  const team = {
    id: id('t'), name, slug: `team-${id('s').slice(-6)}`, description: description || '',
    avatarColor: pickColor(name), ownerId: req.user.id, createdAt: now(),
  };
  db.teams.push(team);
  db.memberships.push({ id: id('m'), teamId: team.id, userId: req.user.id, role: 'owner', joinedAt: now(), permissions: [] });
  for (const [n, topic] of [['general', 'Everything starts here'], ['announcements', 'News and updates']]) {
    const ch = {
      id: id('c'), teamId: team.id, name: n, topic, kind: 'public',
      isPrivate: false, createdBy: req.user.id, createdAt: now(), archived: false,
    };
    db.channels.push(ch);
    db.channelMembers.push({ id: id('cm'), channelId: ch.id, userId: req.user.id });
  }
  persist();
  res.json({ team: teamView(team, req.user.id) });
}));

app.get('/api/teams/:teamId', authRequired, wrap(async (req, res) => {
  const team = db.teams.find((t) => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found.');
  requireMember(team.id, req.user.id);
  const members = db.memberships
    .filter((m) => m.teamId === team.id)
    .map((m) => ({ ...m, user: publicUser(db.users.find((u) => u.id === m.userId)) }));
  const channels = db.channels
    .filter((c) => c.teamId === team.id && !c.archived && channelAccessible(c.id, req.user.id))
    .map((c) => channelView(c, req.user.id))
    .sort((a, b) => (a.kind === 'public' ? 0 : 1) - (b.kind === 'public' ? 0 : 1) || a.name.localeCompare(b.name));
  res.json({
    team: teamView(team, req.user.id),
    members,
    channels,
    permissions: PERMISSIONS,
    myPermissions: PERMISSIONS.filter((p) => can(team.id, req.user.id, p.key)).map((p) => p.key),
  });
}));

app.patch('/api/teams/:teamId', authRequired, wrap(async (req, res) => {
  const team = db.teams.find((t) => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found.');
  requireMember(team.id, req.user.id);
  requirePermission(team.id, req.user.id, 'team.settings');
  const { name, description } = req.body || {};
  if (typeof name === 'string' && name.trim()) team.name = name.trim();
  if (typeof description === 'string') team.description = description;
  persist();
  res.json({ team: teamView(team, req.user.id) });
}));

/* ----------------------------------------------------------------- members */

app.patch('/api/teams/:teamId/members/:userId', authRequired, wrap(async (req, res) => {
  const { teamId, userId } = req.params;
  requireMember(teamId, req.user.id);
  requirePermission(teamId, req.user.id, 'member.manage');
  const target = membershipFor(teamId, userId);
  if (!target) throw fail(404, 'That person is not in this team.');
  if (target.role === 'owner') throw fail(400, 'The owner’s role cannot be changed.');

  const { role, permissions } = req.body || {};
  if (role && ['member', 'admin', 'guest'].includes(role)) target.role = role;
  if (Array.isArray(permissions)) {
    target.permissions = permissions.filter((p) => PERMISSIONS.some((d) => d.key === p));
  }
  persist();
  broadcastToUsers([userId], { type: 'team.role-changed', teamId, role: target.role });
  res.json({ membership: target });
}));

app.delete('/api/teams/:teamId/members/:userId', authRequired, wrap(async (req, res) => {
  const { teamId, userId } = req.params;
  requireMember(teamId, req.user.id);
  requirePermission(teamId, req.user.id, 'member.manage');
  const target = membershipFor(teamId, userId);
  if (!target) throw fail(404, 'That person is not in this team.');
  if (target.role === 'owner') throw fail(400, 'The owner cannot be removed.');
  db.memberships = db.memberships.filter((m) => m.id !== target.id);
  persist();
  broadcastToUsers([userId], { type: 'team.removed', teamId });
  res.json({ ok: true });
}));

/* ----------------------------------------------------------------- invites */

app.post('/api/teams/:teamId/invites', authRequired, wrap(async (req, res) => {
  const team = db.teams.find((t) => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found.');
  requireMember(team.id, req.user.id);
  requirePermission(team.id, req.user.id, 'member.invite');
  const { role = 'member', email = '', channelId = null } = req.body || {};
  const invite = {
    id: id('inv'),
    teamId: team.id,
    code: crypto.randomBytes(6).toString('hex'),
    role: ['member', 'guest', 'admin'].includes(role) ? role : 'member',
    email,
    channelId,
    createdBy: req.user.id,
    createdAt: now(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    usedBy: [],
  };
  db.invites.push(invite);
  persist();
  res.json({ invite, link: `/join/${invite.code}` });
}));

app.get('/api/teams/:teamId/invites', authRequired, wrap(async (req, res) => {
  requireMember(req.params.teamId, req.user.id);
  requirePermission(req.params.teamId, req.user.id, 'member.invite');
  const invites = db.invites
    .filter((i) => i.teamId === req.params.teamId)
    .map((i) => ({ ...i, link: `/join/${i.code}` }));
  res.json({ invites });
}));

app.get('/api/invites/:code', wrap(async (req, res) => {
  const invite = db.invites.find((i) => i.code === req.params.code);
  if (!invite) throw fail(404, 'This invite link is not valid.');
  const team = db.teams.find((t) => t.id === invite.teamId);
  res.json({
    invite: { code: invite.code, role: invite.role, expiresAt: invite.expiresAt },
    team: team ? { id: team.id, name: team.name, description: team.description, avatarColor: team.avatarColor } : null,
  });
}));

app.post('/api/invites/:code/accept', authRequired, wrap(async (req, res) => {
  const invite = db.invites.find((i) => i.code === req.params.code);
  if (!invite) throw fail(404, 'This invite link is not valid.');
  if (new Date(invite.expiresAt).getTime() < Date.now()) throw fail(410, 'This invite has expired.');
  const existing = membershipFor(invite.teamId, req.user.id);
  if (!existing) {
    db.memberships.push({
      id: id('m'), teamId: invite.teamId, userId: req.user.id, role: invite.role,
      joinedAt: now(), permissions: [],
    });
    if (invite.channelId) {
      db.channelMembers.push({ id: id('cm'), channelId: invite.channelId, userId: req.user.id });
    }
    if (!invite.usedBy.includes(req.user.id)) invite.usedBy.push(req.user.id);
    const team = db.teams.find((t) => t.id === invite.teamId);
    if (team) {
      notify(team.ownerId, {
        kind: 'member',
        title: `${req.user.name} joined ${team.name}`,
        body: `Joined via invite as ${invite.role}.`,
        link: `#/team/${team.id}`,
      });
    }
  }
  persist();
  res.json({ teamId: invite.teamId });
}));

/* ---------------------------------------------------------------- channels */

app.post('/api/teams/:teamId/channels', authRequired, wrap(async (req, res) => {
  const team = db.teams.find((t) => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found.');
  requireMember(team.id, req.user.id);
  requirePermission(team.id, req.user.id, 'channel.manage');
  const { name, topic = '', isPrivate = false, memberIds = [] } = req.body || {};
  const clean = String(name || '').trim().toLowerCase().replace(/[^a-z0-9-_ ]/g, '').replace(/\s+/g, '-');
  if (!clean) throw fail(400, 'Channel name is required.');
  if (db.channels.some((c) => c.teamId === team.id && c.name === clean && !c.archived)) {
    throw fail(409, 'A channel with that name already exists.');
  }
  const ch = {
    id: id('c'), teamId: team.id, name: clean, topic, kind: isPrivate ? 'private' : 'public',
    isPrivate: !!isPrivate, createdBy: req.user.id, createdAt: now(), archived: false,
  };
  db.channels.push(ch);
  const ids = new Set([req.user.id, ...memberIds]);
  for (const uid of ids) db.channelMembers.push({ id: id('cm'), channelId: ch.id, userId: uid });
  persist();
  for (const uid of ids) {
    broadcastToUsers([uid], { type: 'channel.created', channel: channelView(ch, uid) });
  }
  res.json({ channel: channelView(ch, req.user.id) });
}));

app.patch('/api/channels/:channelId', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  const { topic, name, archived } = req.body || {};
  if (typeof topic === 'string') ch.topic = topic;
  if (typeof archived === 'boolean') {
    requirePermission(ch.teamId, req.user.id, 'channel.manage');
    ch.archived = archived;
  }
  if (typeof name === 'string' && name.trim() && name !== ch.name) {
    requirePermission(ch.teamId, req.user.id, 'channel.manage');
    ch.name = name.trim().toLowerCase().replace(/\s+/g, '-');
  }
  persist();
  broadcastToUsers(channelMemberIds(ch.id), { type: 'channel.updated', channel: channelView(ch, req.user.id) });
  res.json({ channel: channelView(ch, req.user.id) });
}));

app.post('/api/channels/:channelId/members', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  requirePermission(ch.teamId, req.user.id, 'member.invite');
  const { userIds = [] } = req.body || {};
  for (const uid of userIds) {
    if (!isMember(ch.teamId, uid)) continue;
    if (db.channelMembers.some((cm) => cm.channelId === ch.id && cm.userId === uid)) continue;
    db.channelMembers.push({ id: id('cm'), channelId: ch.id, userId: uid });
  }
  persist();
  broadcastToUsers(channelMemberIds(ch.id), { type: 'channel.updated', channel: channelView(ch, req.user.id) });
  res.json({ channel: channelView(ch, req.user.id) });
}));

app.get('/api/channels/:channelId/messages', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  const limit = Math.min(Number(req.query.limit || 60), 200);
  const before = req.query.before ? String(req.query.before) : null;
  let list = db.messages.filter((m) => m.channelId === ch.id && !m.deletedAt && !m.parentId);
  if (before) list = list.filter((m) => m.createdAt < before);
  list = list.slice(-limit);
  res.json({ messages: list.map((m) => messageView(m, req.user.id)) });
}));

app.post('/api/channels/:channelId/messages', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  const { body = '', parentId = null, attachments = [], mentions = [], clientId = null } = req.body || {};
  if (!String(body).trim() && !attachments.length) throw fail(400, 'Write something first.');

  const msg = {
    id: id('msg'),
    channelId: ch.id,
    teamId: ch.teamId,
    authorId: req.user.id,
    body: String(body),
    parentId,
    attachments,
    mentions: Array.isArray(mentions) ? mentions : [],
    clientId,
    editedAt: null,
    deletedAt: null,
    createdAt: now(),
  };
  db.messages.push(msg);
  persist();

  const view = messageView(msg, req.user.id);
  broadcastToUsers(channelMemberIds(ch.id), { type: 'message.created', channelId: ch.id, message: view });

  for (const uid of msg.mentions) {
    if (uid === req.user.id) continue;
    notify(uid, {
      kind: 'mention',
      title: `${req.user.name} mentioned you in #${ch.name}`,
      body: msg.body.slice(0, 160),
      link: `#/channel/${ch.id}?message=${msg.id}`,
    });
  }
  const parent = parentId ? db.messages.find((m) => m.id === parentId) : null;
  if (parent && parent.authorId !== req.user.id) {
    notify(parent.authorId, {
      kind: 'reply',
      title: `${req.user.name} replied in #${ch.name}`,
      body: msg.body.slice(0, 160),
      link: `#/channel/${ch.id}?thread=${parentId}`,
    });
  }
  res.json({ message: view });
}));

app.get('/api/messages/:messageId/thread', authRequired, wrap(async (req, res) => {
  const parent = db.messages.find((m) => m.id === req.params.messageId);
  if (!parent) throw fail(404, 'Message not found.');
  const ch = channelAccessible(parent.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  const replies = db.messages
    .filter((m) => m.parentId === parent.id && !m.deletedAt)
    .map((m) => messageView(m, req.user.id));
  res.json({ parent: messageView(parent, req.user.id), replies });
}));

app.patch('/api/messages/:messageId', authRequired, wrap(async (req, res) => {
  const msg = db.messages.find((m) => m.id === req.params.messageId);
  if (!msg || msg.deletedAt) throw fail(404, 'Message not found.');
  const ch = channelAccessible(msg.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  const isAuthor = msg.authorId === req.user.id;
  const canEditAny = can(ch.teamId, req.user.id, 'message.deleteAny');
  if (!isAuthor && !canEditAny) throw fail(403, 'You can only edit your own messages.');
  const { body } = req.body || {};
  if (typeof body === 'string') msg.body = body;
  msg.editedAt = now();
  persist();
  const view = messageView(msg, req.user.id);
  broadcastToUsers(channelMemberIds(ch.id), { type: 'message.updated', channelId: ch.id, message: view });
  res.json({ message: view });
}));

app.delete('/api/messages/:messageId', authRequired, wrap(async (req, res) => {
  const msg = db.messages.find((m) => m.id === req.params.messageId);
  if (!msg) throw fail(404, 'Message not found.');
  const ch = channelAccessible(msg.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  const isAuthor = msg.authorId === req.user.id;
  if (!isAuthor && !can(ch.teamId, req.user.id, 'message.deleteAny')) {
    throw fail(403, 'You can only delete your own messages.');
  }
  msg.deletedAt = now();
  db.reactions = db.reactions.filter((r) => r.messageId !== msg.id);
  persist();
  broadcastToUsers(channelMemberIds(ch.id), { type: 'message.deleted', channelId: ch.id, messageId: msg.id });
  res.json({ ok: true });
}));

app.post('/api/messages/:messageId/reactions', authRequired, wrap(async (req, res) => {
  const msg = db.messages.find((m) => m.id === req.params.messageId);
  if (!msg || msg.deletedAt) throw fail(404, 'Message not found.');
  const ch = channelAccessible(msg.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  const { emoji } = req.body || {};
  if (!emoji) throw fail(400, 'Pick an emoji.');
  const existing = db.reactions.find(
    (r) => r.messageId === msg.id && r.userId === req.user.id && r.emoji === emoji,
  );
  if (existing) {
    db.reactions = db.reactions.filter((r) => r.id !== existing.id);
  } else {
    db.reactions.push({ id: id('r'), messageId: msg.id, userId: req.user.id, emoji });
  }
  persist();
  const view = messageView(msg, req.user.id);
  broadcastToUsers(channelMemberIds(ch.id), { type: 'message.updated', channelId: ch.id, message: view });
  res.json({ message: view });
}));

app.post('/api/channels/:channelId/read', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  const row = db.readState.find((r) => r.channelId === ch.id && r.userId === req.user.id);
  if (row) row.lastReadAt = now();
  else db.readState.push({ id: id('rs'), channelId: ch.id, userId: req.user.id, lastReadAt: now() });
  persist();
  res.json({ ok: true });
}));

app.get('/api/search', authRequired, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ messages: [], channels: [], people: [], tasks: [] });
  const myChannels = db.channels.filter((c) => channelAccessible(c.id, req.user.id)).map((c) => c.id);
  const messages = db.messages
    .filter((m) => myChannels.includes(m.channelId) && !m.deletedAt && m.body.toLowerCase().includes(q))
    .slice(-25)
    .reverse()
    .map((m) => ({
      ...messageView(m, req.user.id),
      channelName: db.channels.find((c) => c.id === m.channelId)?.name || '',
    }));
  const channels = db.channels
    .filter((c) => myChannels.includes(c.id) && (c.name.includes(q) || (c.topic || '').toLowerCase().includes(q)))
    .slice(0, 10)
    .map((c) => channelView(c, req.user.id));
  const myTeams = db.memberships.filter((m) => m.userId === req.user.id).map((m) => m.teamId);
  const people = db.users
    .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    .slice(0, 10)
    .map(publicUser);
  const tasks = db.tasks
    .filter((t) => myTeams.includes(t.teamId) && t.title.toLowerCase().includes(q))
    .slice(0, 10);
  res.json({ messages, channels, people, tasks });
}));

/* -------------------------------------------------------------------- tasks */

app.get('/api/teams/:teamId/tasks', authRequired, wrap(async (req, res) => {
  requireMember(req.params.teamId, req.user.id);
  const tasks = db.tasks.filter((t) => t.teamId === req.params.teamId);
  res.json({ tasks });
}));

app.post('/api/teams/:teamId/tasks', authRequired, wrap(async (req, res) => {
  requireMember(req.params.teamId, req.user.id);
  requirePermission(req.params.teamId, req.user.id, 'task.manage');
  const { title, description = '', status = 'todo', priority = 'medium', assigneeId = null, dueDate = null, tags = [], channelId = null, checklist = [] } = req.body || {};
  if (!title) throw fail(400, 'Task title is required.');
  const task = {
    id: id('task'),
    teamId: req.params.teamId,
    channelId,
    title,
    description,
    status,
    priority,
    assigneeId,
    createdBy: req.user.id,
    dueDate,
    tags,
    checklist,
    createdAt: now(),
    updatedAt: now(),
  };
  db.tasks.push(task);
  persist();
  broadcastToUsers(
    db.memberships.filter((m) => m.teamId === task.teamId).map((m) => m.userId),
    { type: 'task.created', task },
  );
  if (assigneeId && assigneeId !== req.user.id) {
    notify(assigneeId, {
      kind: 'task',
      title: `${req.user.name} assigned you a task`,
      body: task.title,
      link: `#/team/${task.teamId}/tasks`,
    });
  }
  res.json({ task });
}));

app.patch('/api/tasks/:taskId', authRequired, wrap(async (req, res) => {
  const task = db.tasks.find((t) => t.id === req.params.taskId);
  if (!task) throw fail(404, 'Task not found.');
  requireMember(task.teamId, req.user.id);
  const fields = ['title', 'description', 'status', 'priority', 'assigneeId', 'dueDate', 'tags', 'checklist', 'channelId'];
  for (const f of fields) if (f in (req.body || {})) task[f] = req.body[f];
  task.updatedAt = now();
  persist();
  broadcastToUsers(
    db.memberships.filter((m) => m.teamId === task.teamId).map((m) => m.userId),
    { type: 'task.updated', task },
  );
  res.json({ task });
}));

app.delete('/api/tasks/:taskId', authRequired, wrap(async (req, res) => {
  const task = db.tasks.find((t) => t.id === req.params.taskId);
  if (!task) throw fail(404, 'Task not found.');
  requireMember(task.teamId, req.user.id);
  db.tasks = db.tasks.filter((t) => t.id !== task.id);
  persist();
  broadcastToUsers(
    db.memberships.filter((m) => m.teamId === task.teamId).map((m) => m.userId),
    { type: 'task.deleted', taskId: task.id },
  );
  res.json({ ok: true });
}));

/* -------------------------------------------------------------------- notes */

app.get('/api/channels/:channelId/notes', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  res.json({ notes: db.notes.filter((n) => n.channelId === ch.id) });
}));

app.post('/api/channels/:channelId/notes', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  requirePermission(ch.teamId, req.user.id, 'note.edit');
  const { title = 'Untitled note', body = '' } = req.body || {};
  const note = {
    id: id('n'), teamId: ch.teamId, channelId: ch.id, title, body,
    createdBy: req.user.id, createdAt: now(), updatedAt: now(),
  };
  db.notes.push(note);
  persist();
  broadcastToUsers(channelMemberIds(ch.id), { type: 'note.created', channelId: ch.id, note });
  res.json({ note });
}));

app.patch('/api/notes/:noteId', authRequired, wrap(async (req, res) => {
  const note = db.notes.find((n) => n.id === req.params.noteId);
  if (!note) throw fail(404, 'Note not found.');
  const ch = channelAccessible(note.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  requirePermission(ch.teamId, req.user.id, 'note.edit');
  const { title, body } = req.body || {};
  if (typeof title === 'string') note.title = title;
  if (typeof body === 'string') note.body = body;
  note.updatedAt = now();
  persist();
  broadcastToUsers(channelMemberIds(ch.id), { type: 'note.updated', channelId: ch.id, note });
  res.json({ note });
}));

/* -------------------------------------------------------------------- files */

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-80);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.post('/api/channels/:channelId/files', authRequired, upload.single('file'), wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  requirePermission(ch.teamId, req.user.id, 'file.upload');
  if (!req.file) throw fail(400, 'No file received.');
  const row = {
    id: id('f'),
    teamId: ch.teamId,
    channelId: ch.id,
    uploaderId: req.user.id,
    name: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype,
    url: `/uploads/${req.file.filename}`,
    createdAt: now(),
  };
  db.files.push(row);
  persist();
  broadcastToUsers(channelMemberIds(ch.id), { type: 'file.created', channelId: ch.id, file: row });
  res.json({ file: row });
}));

app.get('/api/channels/:channelId/files', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  res.json({ files: db.files.filter((f) => f.channelId === ch.id).reverse() });
}));

/* ----------------------------------------------------------------- meetings */

app.get('/api/teams/:teamId/calls', authRequired, wrap(async (req, res) => {
  requireMember(req.params.teamId, req.user.id);
  const calls = db.calls
    .filter((c) => c.teamId === req.params.teamId)
    .map((c) => ({ ...c, host: publicUser(db.users.find((u) => u.id === c.hostId)) }));
  res.json({ calls });
}));

app.post('/api/teams/:teamId/calls', authRequired, wrap(async (req, res) => {
  requireMember(req.params.teamId, req.user.id);
  requirePermission(req.params.teamId, req.user.id, 'meeting.host');
  const { title = 'Instant meeting', channelId = null, scheduledAt = null } = req.body || {};
  const call = {
    id: id('call'),
    teamId: req.params.teamId,
    channelId,
    title,
    hostId: req.user.id,
    status: scheduledAt ? 'scheduled' : 'live',
    scheduledAt,
    createdAt: now(),
    startedAt: scheduledAt ? null : now(),
    participants: [],
  };
  db.calls.push(call);
  persist();
  const memberIds = db.memberships.filter((m) => m.teamId === call.teamId).map((m) => m.userId);
  broadcastToUsers(memberIds, { type: 'call.created', call });
  for (const uid of memberIds) {
    if (uid === req.user.id) continue;
    notify(uid, {
      kind: 'meeting',
      title: `${req.user.name} started “${title}”`,
      body: 'Join the meeting from the Meetings tab.',
      link: `#/meeting/${call.id}`,
    });
  }
  res.json({ call });
}));

app.get('/api/calls/:callId', authRequired, wrap(async (req, res) => {
  const call = db.calls.find((c) => c.id === req.params.callId);
  if (!call) throw fail(404, 'Meeting not found.');
  requireMember(call.teamId, req.user.id);
  res.json({
    call: { ...call, host: publicUser(db.users.find((u) => u.id === call.hostId)) },
    team: teamView(db.teams.find((t) => t.id === call.teamId), req.user.id),
  });
}));

app.patch('/api/calls/:callId', authRequired, wrap(async (req, res) => {
  const call = db.calls.find((c) => c.id === req.params.callId);
  if (!call) throw fail(404, 'Meeting not found.');
  requireMember(call.teamId, req.user.id);
  const { status } = req.body || {};
  if (status && ['live', 'scheduled', 'ended'].includes(status)) {
    call.status = status;
    if (status === 'live' && !call.startedAt) call.startedAt = now();
    if (status === 'ended') call.endedAt = now();
  }
  persist();
  broadcastToUsers(
    db.memberships.filter((m) => m.teamId === call.teamId).map((m) => m.userId),
    { type: 'call.updated', call },
  );
  res.json({ call });
}));

/* ------------------------------------------------------------ notifications */

app.get('/api/notifications', authRequired, wrap(async (req, res) => {
  const rows = db.notifications.filter((n) => n.userId === req.user.id).slice(-50).reverse();
  res.json({ notifications: rows });
}));

app.post('/api/notifications/read', authRequired, wrap(async (req, res) => {
  const { ids } = req.body || {};
  for (const n of db.notifications) {
    if (n.userId !== req.user.id) continue;
    if (!ids || ids.includes(n.id)) n.read = true;
  }
  persist();
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------- health */

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'EGAN Pulse',
    version: '1.0.0',
    users: db.users.length,
    teams: db.teams.length,
    channels: db.channels.length,
    messages: db.messages.length,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '365d', immutable: true }));

/* ------------------------------------------------------------------ static */

const distDir = path.resolve(process.cwd(), 'dist');
if (process.argv.includes('--serve-dist') && fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[pulse] error:', err);
  res.status(status).json({ message: err.message || 'Something went wrong.' });
});

/* ---------------------------------------------------------------- websocket */

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/ws', 'http://localhost');
  const payload = verifyToken(url.searchParams.get('token'));
  const user = payload ? db.users.find((u) => u.id === payload.sub) : null;
  if (!user) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  ws.userId = user.id;
  ws.rooms = new Set();
  if (!socketHub.has(user.id)) socketHub.set(user.id, new Set());
  socketHub.get(user.id).add(ws);

  user.status = 'online';
  persist();
  broadcastToUsers(
    [...new Set(db.memberships.filter((m) => isMember(m.teamId, user.id)).map((m) => m.userId))],
    { type: 'presence', userId: user.id, status: 'online' },
  );

  ws.send(JSON.stringify({ type: 'ready', userId: user.id, online: [...socketHub.keys()] }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    handleSocketMessage(ws, user, msg);
  });

  ws.on('close', () => {
    const set = socketHub.get(user.id);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        socketHub.delete(user.id);
        user.status = 'offline';
        persist();
        broadcastToUsers(
          [...new Set(db.memberships.filter((m) => isMember(m.teamId, user.id)).map((m) => m.userId))],
          { type: 'presence', userId: user.id, status: 'offline' },
        );
      }
    }
  });
});

const meetingRooms = new Map(); // callId -> Map<peerId, {ws, userId, name, muted, cameraOn, sharing}>

function meetingRoom(callId) {
  if (!meetingRooms.has(callId)) meetingRooms.set(callId, new Map());
  return meetingRooms.get(callId);
}

function handleSocketMessage(ws, user, msg) {
  switch (msg.type) {
    case 'typing': {
      const ch = channelAccessible(msg.channelId, user.id);
      if (!ch) return;
      broadcastToUsers(
        channelMemberIds(ch.id).filter((uid) => uid !== user.id),
        { type: 'typing', channelId: ch.id, userId: user.id, name: user.name, active: !!msg.active },
      );
      break;
    }

    case 'meeting.join': {
      const call = db.calls.find((c) => c.id === msg.callId);
      if (!call || !isMember(call.teamId, user.id)) return;
      const room = meetingRoom(call.id);
      const peerId = msg.peerId || `${user.id}-${crypto.randomBytes(3).toString('hex')}`;
      room.set(peerId, {
        ws,
        userId: user.id,
        name: user.name,
        avatarColor: user.avatarColor,
        muted: !!msg.muted,
        cameraOn: !!msg.cameraOn,
        sharing: false,
        handRaised: false,
      });
      ws.meetingPeer = { callId: call.id, peerId };
      call.status = 'live';
      if (!call.startedAt) call.startedAt = now();
      persist();

      const peers = [...room.entries()].map(([pid, p]) => ({
        peerId: pid,
        userId: p.userId,
        name: p.name,
        avatarColor: p.avatarColor,
        muted: p.muted,
        cameraOn: p.cameraOn,
        sharing: p.sharing,
        handRaised: p.handRaised,
      }));
      ws.send(JSON.stringify({ type: 'meeting.joined', callId: call.id, peerId, peers }));
      for (const [pid, p] of room.entries()) {
        if (pid === peerId) continue;
        if (p.ws.readyState === 1) {
          p.ws.send(JSON.stringify({ type: 'meeting.peer-joined', callId: call.id, peer: peers.find((x) => x.peerId === peerId) }));
        }
      }
      broadcastToUsers(
        db.memberships.filter((m) => m.teamId === call.teamId).map((m) => m.userId),
        { type: 'call.updated', call: { ...call, participantCount: room.size } },
      );
      break;
    }

    case 'meeting.signal': {
      const target = msg.targetPeerId ? meetingRoom(msg.callId).get(msg.targetPeerId) : null;
      if (!target) return;
      if (target.ws.readyState === 1) {
        target.ws.send(JSON.stringify({
          type: 'meeting.signal',
          callId: msg.callId,
          fromPeerId: ws.meetingPeer?.peerId,
          data: msg.data,
        }));
      }
      break;
    }

    case 'meeting.state': {
      const info = ws.meetingPeer;
      if (!info) return;
      const room = meetingRoom(info.callId);
      const peer = room.get(info.peerId);
      if (!peer) return;
      if (typeof msg.muted === 'boolean') peer.muted = msg.muted;
      if (typeof msg.cameraOn === 'boolean') peer.cameraOn = msg.cameraOn;
      if (typeof msg.sharing === 'boolean') peer.sharing = msg.sharing;
      if (typeof msg.handRaised === 'boolean') peer.handRaised = msg.handRaised;
      for (const [pid, p] of room.entries()) {
        if (pid === info.peerId) continue;
        if (p.ws.readyState === 1) {
          p.ws.send(JSON.stringify({
            type: 'meeting.peer-state',
            callId: info.callId,
            peerId: info.peerId,
            muted: peer.muted,
            cameraOn: peer.cameraOn,
            sharing: peer.sharing,
            handRaised: peer.handRaised,
          }));
        }
      }
      break;
    }

    case 'meeting.leave': {
      const info = ws.meetingPeer;
      if (!info) return;
      const room = meetingRoom(info.callId);
      room.delete(info.peerId);
      for (const [, p] of room.entries()) {
        if (p.ws.readyState === 1) {
          p.ws.send(JSON.stringify({ type: 'meeting.peer-left', callId: info.callId, peerId: info.peerId }));
        }
      }
      const call = db.calls.find((c) => c.id === info.callId);
      if (call && room.size === 0) {
        call.status = 'ended';
        call.endedAt = now();
        persist();
      }
      ws.meetingPeer = null;
      break;
    }

    default:
      break;
  }
}

seedDemo();

server.listen(PORT, () => {
  console.log(`\n  EGAN Pulse API  →  http://localhost:${PORT}`);
  console.log(`  WebSocket       →  ws://localhost:${PORT}/ws`);
  console.log(`  Data            →  ${DATA_DIR}`);
  console.log(`  Demo logins     →  aarav@egan.in / pulse1234 (owner), priya@egan.in (admin), rohit@egan.in (member)\n`);
});
