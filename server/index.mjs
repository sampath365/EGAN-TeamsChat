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
  const prefs = db.channelPrefs.find((r) => r.channelId === ch.id && r.userId === userId);
  const muted = !!prefs?.muted;
  const hidden = !!prefs?.hidden;
  // A muted conversation still counts unread (the row is not lost), but the
  // client suppresses the badge and notifications — that is the point of mute.
  const unread = messages.filter(
    (m) => m.authorId !== userId && (!lastReadAt || m.createdAt > lastReadAt),
  ).length;
  return {
    ...ch,
    memberIds: channelMemberIds(ch.id),
    unread,
    muted,
    hidden,
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
  const { name, title, status, statusText, avatarUrl, outOfOffice } = req.body || {};
  if (typeof name === 'string' && name.trim()) req.user.name = name.trim();
  if (typeof title === 'string') req.user.title = title;
  if (typeof status === 'string') req.user.status = status;
  if (typeof statusText === 'string') req.user.statusText = statusText;
  if (typeof avatarUrl === 'string') req.user.avatarUrl = avatarUrl || null;

  if (outOfOffice !== undefined) {
    if (outOfOffice === null) {
      req.user.outOfOffice = null;
    } else if (typeof outOfOffice === 'object') {
      const startDate = outOfOffice.startDate ? String(outOfOffice.startDate) : null;
      const endDate = outOfOffice.endDate ? String(outOfOffice.endDate) : null;
      if (startDate && endDate && endDate < startDate) {
        throw fail(400, 'The out-of-office end date cannot be before the start date.');
      }
      const delegateId = outOfOffice.delegateId || null;
      if (delegateId && !db.users.some((u) => u.id === delegateId)) {
        throw fail(400, 'That delegate does not exist.');
      }
      req.user.outOfOffice = {
        enabled: !!outOfOffice.enabled,
        startDate,
        endDate,
        message: String(outOfOffice.message || ''),
        delegateId,
      };
    }
  }
  persist();
  broadcastToUsers([...new Set(db.memberships.filter((m) => db.teams.some((t) => t.id === m.teamId)).map((m) => m.userId))], {
    type: 'user.updated', user: publicUser(req.user),
  });
  res.json({ user: publicUser(req.user) });
}));

app.get('/api/users', authRequired, wrap(async (req, res) => {
  res.json({ users: db.users.filter((u) => !u.isBot || true).map(publicUser) });
}));

/* ------------------------------------------------- profile & org hierarchy */

// A user's full profile as seen by a teammate: identity, org placement, who
// they report to, who reports to them, and where they sit in the team.
app.get('/api/users/:userId', authRequired, wrap(async (req, res) => {
  const target = db.users.find((u) => u.id === req.params.userId);
  if (!target) throw fail(404, 'That person no longer exists.');

  const sharedTeamIds = db.memberships
    .filter((m) => m.userId === target.id && isMember(m.teamId, req.user.id))
    .map((m) => m.teamId);
  if (sharedTeamIds.length === 0 && target.id !== req.user.id) {
    throw fail(403, 'You do not share a team with this person.');
  }

  const manager = target.managerId ? db.users.find((u) => u.id === target.managerId) : null;
  const reports = db.users.filter((u) => u.managerId === target.id).map(publicUser);
  const teamRoles = db.memberships
    .filter((m) => m.userId === target.id && sharedTeamIds.includes(m.teamId))
    .map((m) => ({
      teamId: m.teamId,
      teamName: db.teams.find((t) => t.id === m.teamId)?.name || '',
      role: m.role,
      joinedAt: m.joinedAt,
    }));

  res.json({
    user: publicUser(target),
    manager: manager ? publicUser(manager) : null,
    reports,
    teamRoles,
  });
}));

// The reporting tree for a team. People without a manager (or whose manager is
// not on this team) become roots, so nobody is ever dropped from the chart.
app.get('/api/teams/:teamId/hierarchy', authRequired, wrap(async (req, res) => {
  const team = db.teams.find((t) => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found.');
  requireMember(team.id, req.user.id);

  const members = db.memberships
    .filter((m) => m.teamId === team.id)
    .map((m) => ({ membership: m, user: db.users.find((u) => u.id === m.userId) }))
    .filter((row) => row.user);

  const memberIds = new Set(members.map((r) => r.user.id));
  const nodes = new Map(
    members.map((r) => [r.user.id, {
      user: publicUser(r.user),
      role: r.membership.role,
      children: [],
    }]),
  );

  const roots = [];
  for (const [userId, node] of nodes) {
    const managerId = node.user.managerId;
    if (managerId && memberIds.has(managerId) && managerId !== userId) {
      nodes.get(managerId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Guard against a cycle (A reports to B who reports to A): such a pair has no
  // root, so hoist every node that is unreachable back to the top level.
  const reachable = new Set();
  const walk = (node) => {
    if (reachable.has(node.user.id)) return;
    reachable.add(node.user.id);
    node.children.forEach(walk);
  };
  roots.forEach(walk);
  for (const [userId, node] of nodes) {
    if (!reachable.has(userId)) roots.push(node);
  }

  const byDepartment = {};
  for (const r of members) {
    const dept = r.user.department || 'Unassigned';
    byDepartment[dept] = byDepartment[dept] || [];
    byDepartment[dept].push({ user: publicUser(r.user), role: r.membership.role });
  }

  res.json({
    team: teamView(team, req.user.id),
    roots,
    departments: Object.entries(byDepartment)
      .map(([name, people]) => ({ name, people }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    total: members.length,
  });
}));

// Update someone's org placement. Position/department/employeeId/managerId live
// on the User row; role and permission changes go through the member route.
app.patch('/api/teams/:teamId/members/:userId/org', authRequired, wrap(async (req, res) => {
  const { teamId, userId } = req.params;
  requireMember(teamId, req.user.id);
  if (!membershipFor(teamId, userId)) throw fail(404, 'That person is not in this team.');

  const isSelf = userId === req.user.id;
  if (!isSelf) requirePermission(teamId, req.user.id, 'member.manage');

  const target = db.users.find((u) => u.id === userId);
  if (!target) throw fail(404, 'That person no longer exists.');

  const { position, department, employeeId, managerId, phone, location, timezone, bio } = req.body || {};

  if (typeof position === 'string') {
    target.position = position;
    target.title = position; // keep the legacy field in step
  }
  if (typeof department === 'string') target.department = department;
  if (typeof employeeId === 'string') target.employeeId = employeeId;
  if (typeof phone === 'string') target.phone = phone;
  if (typeof location === 'string') target.location = location;
  if (typeof timezone === 'string') target.timezone = timezone;
  if (typeof bio === 'string') target.bio = bio;

  if ('managerId' in (req.body || {})) {
    const next = managerId || null;
    if (next === userId) throw fail(400, 'Nobody can report to themselves.');
    if (next) {
      const manager = db.users.find((u) => u.id === next);
      if (!manager) throw fail(400, 'That manager does not exist.');
      if (!membershipFor(teamId, next)) throw fail(400, 'The manager must be in this team.');
      // Refuse a cycle: walking up from the proposed manager must not reach us.
      let cursor = manager;
      const seen = new Set();
      while (cursor?.managerId && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        if (cursor.managerId === userId) throw fail(400, 'That would create a reporting loop.');
        cursor = db.users.find((u) => u.id === cursor.managerId);
      }
    }
    target.managerId = next;
  }

  persist();
  const view = publicUser(target);
  broadcastToUsers(
    db.memberships.filter((m) => m.teamId === teamId).map((m) => m.userId),
    { type: 'user.updated', user: view },
  );
  res.json({ user: view });
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

/* -------------------------------------------------------- direct messages */

// A DM is a channel of kind 'dm' with exactly two members. It is created on
// first use and reused afterwards, so two people never end up with a dozen
// separate threads.
app.get('/api/dms', authRequired, wrap(async (req, res) => {
  const mine = db.channels.filter(
    (c) => c.kind === 'dm'
      && !c.archived
      && db.channelMembers.some((cm) => cm.channelId === c.id && cm.userId === req.user.id),
  );

  const rows = mine.map((c) => {
    const partnerId = db.channelMembers
      .filter((cm) => cm.channelId === c.id && cm.userId !== req.user.id)
      .map((cm) => cm.userId)[0];
    const partner = db.users.find((u) => u.id === partnerId) || null;
    return {
      channel: channelView(c, req.user.id),
      partner: publicUser(partner),
    };
  });

  rows.sort((a, b) => {
    const at = a.channel.lastMessage?.createdAt || a.channel.createdAt;
    const bt = b.channel.lastMessage?.createdAt || b.channel.createdAt;
    return bt.localeCompare(at);
  });

  res.json({ dms: rows });
}));

// Get or create the DM with one other person.
app.post('/api/dms/:userId', authRequired, wrap(async (req, res) => {
  const partner = db.users.find((u) => u.id === req.params.userId);
  if (!partner) throw fail(404, 'That person no longer exists.');
  if (partner.id === req.user.id) throw fail(400, 'You cannot message yourself.');

  const sharedTeam = db.memberships.find(
    (m) => m.userId === partner.id && isMember(m.teamId, req.user.id),
  );
  if (!sharedTeam) throw fail(403, 'You do not share a team with this person.');

  const existing = db.channels.find((c) => {
    if (c.kind !== 'dm' || c.teamId !== sharedTeam.teamId) return false;
    const ids = db.channelMembers.filter((cm) => cm.channelId === c.id).map((cm) => cm.userId);
    return ids.length === 2 && ids.includes(req.user.id) && ids.includes(partner.id);
  });

  if (existing) {
    return res.json({ channel: channelView(existing, req.user.id), partner: publicUser(partner), created: false });
  }

  const ch = {
    id: id('c'),
    teamId: sharedTeam.teamId,
    name: `dm-${[req.user.id.slice(-6), partner.id.slice(-6)].sort().join('-')}`,
    topic: '',
    kind: 'dm',
    isPrivate: true,
    createdBy: req.user.id,
    createdAt: now(),
    archived: false,
  };
  db.channels.push(ch);
  db.channelMembers.push({ id: id('cm'), channelId: ch.id, userId: req.user.id });
  db.channelMembers.push({ id: id('cm'), channelId: ch.id, userId: partner.id });
  persist();

  const view = channelView(ch, req.user.id);
  broadcastToUsers([req.user.id, partner.id], { type: 'channel.created', channel: view });
  res.json({ channel: view, partner: publicUser(partner), created: true });
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

/* ------------------------------------------------- add people & preferences */

// Add a person straight to the team, without an invite link. If the email
// already belongs to an account we add that account; otherwise we create one
// with a starter password the operator can pass on.
app.post('/api/teams/:teamId/members', authRequired, wrap(async (req, res) => {
  const team = db.teams.find((t) => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found.');
  requireMember(team.id, req.user.id);
  requirePermission(team.id, req.user.id, 'member.invite');

  const {
    email, name = '', role = 'member', position = '', department = '', managerId = null, password,
  } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) throw fail(400, 'A valid email address is required.');
  if (!['member', 'admin', 'guest'].includes(role)) throw fail(400, 'Pick member, admin or guest.');

  let target = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
  let created = false;
  let temporaryPassword = null;

  if (!target) {
    const pw = String(password || '').trim() || crypto.randomBytes(6).toString('base64url');
    target = {
      id: id('u'),
      name: String(name || cleanEmail.split('@')[0]).trim(),
      email: cleanEmail,
      title: position || '',
      position: position || '',
      department: department || '',
      employeeId: '',
      managerId: managerId || null,
      phone: '',
      location: '',
      timezone: '',
      bio: '',
      joinedAt: now(),
      avatarColor: pickColor(cleanEmail),
      avatarUrl: null,
      passwordHash: hashPassword(pw),
      status: 'offline',
      statusText: '',
      isBot: false,
      createdAt: now(),
    };
    db.users.push(target);
    db.presence.push({ id: id('p'), userId: target.id, status: 'offline', lastSeen: now() });
    created = true;
    temporaryPassword = pw;
  } else {
    // Existing account: fill in any org detail the operator supplied.
    if (position) { target.position = position; target.title = position; }
    if (department) target.department = department;
    if (managerId) target.managerId = managerId;
  }

  const existing = membershipFor(team.id, target.id);
  if (existing) {
    existing.role = role;
  } else {
    db.memberships.push({
      id: id('m'), teamId: team.id, userId: target.id, role, joinedAt: now(), permissions: [],
    });
  }

  // Give them the team's public channels so the app is not empty on first load.
  for (const ch of db.channels.filter((c) => c.teamId === team.id && !c.isPrivate && !c.archived)) {
    if (!db.channelMembers.some((cm) => cm.channelId === ch.id && cm.userId === target.id)) {
      db.channelMembers.push({ id: id('cm'), channelId: ch.id, userId: target.id });
    }
  }

  persist();
  if (!existing) {
    notify(target.id, {
      kind: 'member',
      title: `${req.user.name} added you to ${team.name}`,
      body: `You joined as ${role}.`,
      link: `#/team/${team.id}`,
    });
  }
  broadcastToUsers(
    db.memberships.filter((m) => m.teamId === team.id).map((m) => m.userId),
    { type: 'member.added', teamId: team.id, user: publicUser(target) },
  );

  res.json({
    user: publicUser(target),
    role,
    created,
    temporaryPassword,
    alreadyMember: !!existing,
  });
}));

// Per-conversation preferences: mute (stop badges/notifications) and hide
// (take it out of the sidebar without leaving the conversation).
app.patch('/api/channels/:channelId/prefs', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');

  const { muted, hidden } = req.body || {};
  let row = db.channelPrefs.find((r) => r.channelId === ch.id && r.userId === req.user.id);
  if (!row) {
    row = { id: id('cp'), channelId: ch.id, userId: req.user.id, muted: false, hidden: false };
    db.channelPrefs.push(row);
  }
  if (typeof muted === 'boolean') row.muted = muted;
  if (typeof hidden === 'boolean') row.hidden = hidden;
  persist();

  res.json({ channel: channelView(ch, req.user.id) });
}));

// Hide / unhide a person in the People list. This is a personal view
// preference, never an access change: a hidden person keeps their membership,
// their messages and their permissions.
app.get('/api/hidden-people', authRequired, wrap(async (req, res) => {
  const teamId = String(req.query.teamId || '');
  const rows = db.hiddenPeople
    .filter((h) => h.userId === req.user.id && (!teamId || h.teamId === teamId))
    .map((h) => ({ ...h, user: publicUser(db.users.find((u) => u.id === h.targetUserId)) }));
  res.json({ hidden: rows });
}));

app.post('/api/teams/:teamId/people/:userId/hide', authRequired, wrap(async (req, res) => {
  const { teamId, userId } = req.params;
  requireMember(teamId, req.user.id);
  if (userId === req.user.id) throw fail(400, 'You cannot hide yourself.');
  const target = db.users.find((u) => u.id === userId);
  if (!target) throw fail(404, 'That person no longer exists.');

  if (!db.hiddenPeople.some((h) => h.userId === req.user.id && h.teamId === teamId && h.targetUserId === userId)) {
    db.hiddenPeople.push({ id: id('hp'), userId: req.user.id, teamId, targetUserId: userId, createdAt: now() });
    persist();
  }
  res.json({ ok: true, hidden: true });
}));

app.delete('/api/teams/:teamId/people/:userId/hide', authRequired, wrap(async (req, res) => {
  const { teamId, userId } = req.params;
  requireMember(teamId, req.user.id);
  db.hiddenPeople = db.hiddenPeople.filter(
    (h) => !(h.userId === req.user.id && h.teamId === teamId && h.targetUserId === userId),
  );
  persist();
  res.json({ ok: true, hidden: false });
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

/* ------------------------------------------- meeting email invites & reminders */

// Sends a meeting invite to each invitee and records an accept token. When no
// SMTP is configured we still create the tokens and log the mail, so the
// accept flow is testable without a mail server — the result says which
// happened rather than pretending delivery succeeded.
async function sendMeetingInvites(call, inviteeIds) {
  const team = db.teams.find((t) => t.id === call.teamId);
  const host = db.users.find((u) => u.id === call.hostId);
  const when = call.scheduledAt ? new Date(call.scheduledAt) : new Date();
  const results = [];

  for (const uid of inviteeIds) {
    const person = db.users.find((u) => u.id === uid);
    if (!person?.email) {
      results.push({ userId: uid, sent: false, reason: 'no email address' });
      continue;
    }

    const token = crypto.randomBytes(12).toString('hex');
    db.meetingInvites.push({
      id: id('mi'),
      callId: call.id,
      userId: uid,
      token,
      status: 'INVITED',
      createdAt: now(),
      respondedAt: null,
    });

    const acceptUrl = `${process.env.PUBLIC_APP_URL || ''}/#/invite/${token}`;
    const subject = `Invitation: ${call.title}`;
    const body = [
      `${host?.name || 'Someone'} invited you to “${call.title}”.`,
      '',
      `When: ${when.toLocaleString()}`,
      call.description ? `About: ${call.description}` : '',
      '',
      `Accept: ${acceptUrl}`,
      '',
      '— EGAN Pulse',
    ].filter(Boolean).join('\n');

    const sent = await trySendMail(person.email, subject, body);
    results.push({ userId: uid, email: person.email, sent: sent.sent, reason: sent.reason || null, acceptUrl });
  }

  persist();
  const delivered = results.filter((r) => r.sent).length;
  return {
    attempted: results.length,
    delivered,
    reason: delivered === 0 && results.length > 0 ? results[0].reason : null,
    results,
  };
}

// Real SMTP if it is configured; otherwise record the intent and say so.
async function trySendMail(to, subject, text) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.log(`[pulse] email (not configured) -> ${to}: ${subject}`);
    return { sent: false, reason: 'SMTP is not configured on this server' };
  }
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.default.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '') === 'true',
      auth: { user, pass },
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || user,
      to,
      subject,
      text,
    });
    return { sent: true };
  } catch (e) {
    console.log(`[pulse] email failed -> ${to}: ${e.message}`);
    return { sent: false, reason: e.message };
  }
}

// Accept / decline a meeting from the emailed link.
app.get('/api/meeting-invites/:token', wrap(async (req, res) => {
  const invite = db.meetingInvites.find((i) => i.token === req.params.token);
  if (!invite) throw fail(404, 'This invite link is not valid.');
  const call = db.calls.find((c) => c.id === invite.callId);
  const person = db.users.find((u) => u.id === invite.userId);
  const host = call ? db.users.find((u) => u.id === call.hostId) : null;
  res.json({
    invite: { status: invite.status, createdAt: invite.createdAt },
    call: call
      ? {
        id: call.id,
        title: call.title,
        description: call.description || '',
        scheduledAt: call.scheduledAt,
        status: call.status,
        hostName: host?.name || '',
      }
      : null,
    person: person ? { name: person.name, email: person.email } : null,
  });
}));

app.post('/api/meeting-invites/:token/:action', wrap(async (req, res) => {
  const invite = db.meetingInvites.find((i) => i.token === req.params.token);
  if (!invite) throw fail(404, 'This invite link is not valid.');
  const action = req.params.action;
  if (!['accept', 'decline'].includes(action)) throw fail(400, 'Unknown action.');

  invite.status = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
  invite.respondedAt = now();
  persist();

  const call = db.calls.find((c) => c.id === invite.callId);
  const person = db.users.find((u) => u.id === invite.userId);
  if (call) {
    call.participants = call.participants || [];
    if (action === 'accept' && !call.participants.includes(invite.userId)) {
      call.participants.push(invite.userId);
    }
    notify(call.hostId, {
      kind: 'meeting',
      title: `${person?.name || 'Someone'} ${action === 'accept' ? 'accepted' : 'declined'} “${call.title}”`,
      body: action === 'accept' ? 'They are on the guest list.' : 'They cannot attend.',
      link: `#/meeting/${call.id}`,
    });
  }
  res.json({ status: invite.status });
}));

/* ------------------------------------------------- scheduling availability */

// Working window used for slot suggestions. Deliberately a constant rather than
// a per-person schedule: EGAN runs one shift, and inventing per-person hours
// would produce slots nobody actually works.
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 19;
const SLOT_MINUTES = 30;

function busyBlocksFor(userIds, dayStart, dayEnd) {
  // A person is busy when they host or are invited to a meeting that overlaps
  // the window, or when they are out of office that day.
  const blocks = new Map(userIds.map((id) => [id, []]));

  for (const call of db.calls) {
    if (call.status === 'cancelled') continue;
    const at = call.scheduledAt || call.startedAt;
    if (!at) continue;
    const startMs = new Date(at).getTime();
    if (!Number.isFinite(startMs)) continue;
    const endMs = startMs + (call.durationMinutes || 30) * 60000;
    if (endMs <= dayStart.getTime() || startMs >= dayEnd.getTime()) continue;

    const involved = new Set([call.hostId, ...(call.inviteeIds || []), ...(call.participants || [])]);
    for (const uid of involved) {
      if (!blocks.has(uid)) continue;
      blocks.get(uid).push({ start: startMs, end: endMs, title: call.title });
    }
  }

  const dayKey = dayStart.toISOString().slice(0, 10);
  for (const uid of userIds) {
    const u = db.users.find((x) => x.id === uid);
    const ooo = u?.outOfOffice;
    if (!ooo?.enabled) continue;
    const start = ooo.startDate || dayKey;
    const end = ooo.endDate || start;
    if (dayKey >= start && dayKey <= end) {
      blocks.get(uid).push({ start: dayStart.getTime(), end: dayEnd.getTime(), title: 'Out of office' });
    }
  }

  return blocks;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// Per-person busy/free for one day, so the picker can show who is free when.
app.get('/api/teams/:teamId/availability', authRequired, wrap(async (req, res) => {
  const team = db.teams.find((t) => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found.');
  requireMember(team.id, req.user.id);

  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const duration = Math.max(15, Math.min(Number(req.query.duration || 30), 480));
  const dayStart = new Date(`${date}T${String(WORK_START_HOUR).padStart(2, '0')}:00:00`);
  const dayEnd = new Date(`${date}T${String(WORK_END_HOUR).padStart(2, '0')}:00:00`);

  const requested = String(req.query.userIds || '').split(',').filter(Boolean);
  const memberIds = db.memberships.filter((m) => m.teamId === team.id).map((m) => m.userId);
  const userIds = (requested.length ? requested : memberIds).filter((id) => memberIds.includes(id));

  const blocks = busyBlocksFor(userIds, dayStart, dayEnd);

  const slots = [];
  for (let t = dayStart.getTime(); t + duration * 60000 <= dayEnd.getTime(); t += SLOT_MINUTES * 60000) {
    const end = t + duration * 60000;
    const busy = userIds.filter((uid) =>
      (blocks.get(uid) || []).some((b) => overlaps(t, end, b.start, b.end)));
    slots.push({
      start: new Date(t).toISOString(),
      end: new Date(end).toISOString(),
      busyUserIds: busy,
      freeCount: userIds.length - busy.length,
      total: userIds.length,
    });
  }

  res.json({
    date,
    durationMinutes: duration,
    window: { start: dayStart.toISOString(), end: dayEnd.toISOString() },
    people: userIds.map((uid) => {
      const u = db.users.find((x) => x.id === uid);
      return {
        user: publicUser(u),
        busy: (blocks.get(uid) || []).sort((a, b) => a.start - b.start),
      };
    }),
    slots,
  });
}));

// Ranked suggestions: the earliest slots where EVERY invitee is free. This is
// what "find a time" means — a slot that suits you but not the invitees is not
// a suggestion.
app.get('/api/teams/:teamId/suggest-slots', authRequired, wrap(async (req, res) => {
  const team = db.teams.find((t) => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found.');
  requireMember(team.id, req.user.id);

  const duration = Math.max(15, Math.min(Number(req.query.duration || 30), 480));
  const days = Math.max(1, Math.min(Number(req.query.days || 5), 14));
  const requested = String(req.query.userIds || '').split(',').filter(Boolean);
  const memberIds = db.memberships.filter((m) => m.teamId === team.id).map((m) => m.userId);
  const userIds = (requested.length ? requested : memberIds).filter((id) => memberIds.includes(id));
  if (userIds.length === 0) throw fail(400, 'Nobody to schedule with.');

  const suggestions = [];
  const nowMs = Date.now();

  for (let d = 0; d < days && suggestions.length < 6; d += 1) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const dayStart = new Date(`${dayKey}T${String(WORK_START_HOUR).padStart(2, '0')}:00:00`);
    const dayEnd = new Date(`${dayKey}T${String(WORK_END_HOUR).padStart(2, '0')}:00:00`);
    const blocks = busyBlocksFor(userIds, dayStart, dayEnd);

    for (let t = dayStart.getTime(); t + duration * 60000 <= dayEnd.getTime(); t += SLOT_MINUTES * 60000) {
      if (suggestions.length >= 6) break;
      // Never suggest a slot in the past.
      if (t < nowMs + 5 * 60000) continue;
      const end = t + duration * 60000;
      const allFree = userIds.every((uid) =>
        !(blocks.get(uid) || []).some((b) => overlaps(t, end, b.start, b.end)));
      if (!allFree) continue;
      suggestions.push({
        start: new Date(t).toISOString(),
        end: new Date(end).toISOString(),
        date: dayKey,
        label: new Date(t).toLocaleString(undefined, {
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        }),
      });
    }
  }

  res.json({ durationMinutes: duration, userIds, suggestions });
}));

/* --------------------------------------------------------------- calendar */

// Everything that belongs on a calendar for a team in one read: meetings, task
// due dates and people's out-of-office ranges. The client renders a month grid
// from these entries, so no date arithmetic is duplicated on the server.
app.get('/api/teams/:teamId/calendar', authRequired, wrap(async (req, res) => {
  const team = db.teams.find((t) => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found.');
  requireMember(team.id, req.user.id);

  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const inRange = (iso) => {
    if (!iso) return true;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return true;
    if (from && t < from.getTime()) return false;
    if (to && t > to.getTime()) return false;
    return true;
  };

  const events = [];

  // The TEAM calendar is for shared commitments. A 1:1 call between two people
  // and a DM huddle are private, so they belong on the participants' own view,
  // not on everyone's team calendar. `scope=mine` shows those too.
  const scope = String(req.query.scope || 'team');
  for (const call of db.calls.filter((c) => c.teamId === team.id)) {
    const isPersonal = !!call.isDirect || !!call.channelId;
    const mine = call.hostId === req.user.id
      || (call.inviteeIds || []).includes(req.user.id)
      || (call.participants || []).includes(req.user.id);

    if (scope === 'team' && isPersonal) continue;
    if (scope === 'mine' && !mine) continue;
    // Ended meetings are history, not calendar commitments. `scope=all` keeps
    // them for anyone auditing the month.
    if (scope !== 'all' && call.status === 'ended') continue;

    const at = call.scheduledAt || call.startedAt || call.createdAt;
    if (!inRange(at)) continue;
    events.push({
      id: call.id,
      kind: 'meeting',
      title: call.title,
      at,
      allDay: false,
      status: call.status,
      link: `#/meeting/${call.id}`,
      hostName: db.users.find((u) => u.id === call.hostId)?.name || '',
      attendeeCount: (call.inviteeIds || []).length,
      description: call.description || '',
      isPersonal,
      reminders: call.reminders || [],
      remindersSent: call.remindersSent || [],
      inviteeNames: (call.inviteeIds || [])
        .map((id) => db.users.find((u) => u.id === id)?.name)
        .filter(Boolean),
    });
  }

  for (const task of db.tasks.filter((t) => t.teamId === team.id && t.dueDate)) {
    const at = `${task.dueDate}T17:00:00.000Z`;
    if (!inRange(at)) continue;
    events.push({
      id: task.id,
      kind: 'task',
      title: task.title,
      at,
      allDay: true,
      status: task.status,
      priority: task.priority,
      link: '#/tasks',
      assigneeName: db.users.find((u) => u.id === task.assigneeId)?.name || 'Unassigned',
    });
  }

  const memberIds = new Set(db.memberships.filter((m) => m.teamId === team.id).map((m) => m.userId));
  for (const u of db.users) {
    if (!memberIds.has(u.id)) continue;
    const ooo = u.outOfOffice;
    if (!ooo?.enabled || !ooo.startDate) continue;
    const at = `${ooo.startDate}T00:00:00.000Z`;
    if (!inRange(at)) continue;
    events.push({
      id: `ooo-${u.id}`,
      kind: 'ooo',
      title: `${u.name} is out of office`,
      at,
      endAt: ooo.endDate ? `${ooo.endDate}T23:59:59.000Z` : null,
      allDay: true,
      userId: u.id,
      link: `#/profile/${u.id}`,
      message: ooo.message || '',
      delegateName: ooo.delegateId ? db.users.find((x) => x.id === ooo.delegateId)?.name || '' : '',
    });
  }

  events.sort((a, b) => a.at.localeCompare(b.at));
  res.json({
    team: teamView(team, req.user.id),
    scope,
    events,
    counts: {
      meeting: events.filter((e) => e.kind === 'meeting').length,
      task: events.filter((e) => e.kind === 'task').length,
      ooo: events.filter((e) => e.kind === 'ooo').length,
    },
  });
}));

/* ------------------------------------------------------------------ polls */

function pollView(poll, userId) {
  const votes = db.pollVotes.filter((v) => v.pollId === poll.id);
  const totalVotes = votes.length;
  const myVotes = votes.filter((v) => v.userId === userId).map((v) => v.optionId);
  const options = poll.options.map((o) => {
    const count = votes.filter((v) => v.optionId === o.id).length;
    return {
      id: o.id,
      text: o.text,
      count,
      percent: totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100),
      voters: poll.anonymous ? [] : votes.filter((v) => v.optionId === o.id).map((v) => v.userId),
    };
  });
  return {
    ...poll,
    options,
    totalVotes,
    myVotes,
    votersCount: new Set(votes.map((v) => v.userId)).size,
    createdBy: publicUser(db.users.find((u) => u.id === poll.createdBy)),
  };
}

app.get('/api/channels/:channelId/polls', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  const rows = db.polls
    .filter((p) => p.channelId === ch.id)
    .map((p) => pollView(p, req.user.id));
  res.json({ polls: rows });
}));

app.post('/api/channels/:channelId/polls', authRequired, wrap(async (req, res) => {
  const ch = channelAccessible(req.params.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  const { question, options = [], allowMultiple = false, anonymous = false, closesAt = null } = req.body || {};
  if (!String(question || '').trim()) throw fail(400, 'A poll needs a question.');
  const texts = (Array.isArray(options) ? options : [])
    .map((o) => (typeof o === 'string' ? o : o?.text) || '')
    .map((t) => t.trim())
    .filter(Boolean);
  if (texts.length < 2) throw fail(400, 'A poll needs at least two options.');
  if (texts.length > 10) throw fail(400, 'A poll can have at most ten options.');

  const poll = {
    id: id('poll'),
    channelId: ch.id,
    teamId: ch.teamId,
    question: String(question).trim(),
    options: texts.map((t) => ({ id: id('opt'), text: t })),
    allowMultiple: !!allowMultiple,
    anonymous: !!anonymous,
    closesAt: closesAt || null,
    closed: false,
    createdBy: req.user.id,
    createdAt: now(),
  };
  db.polls.push(poll);
  persist();

  const view = pollView(poll, req.user.id);
  broadcastToUsers(channelMemberIds(ch.id), { type: 'poll.created', channelId: ch.id, poll: view });
  res.json({ poll: view });
}));

app.post('/api/polls/:pollId/vote', authRequired, wrap(async (req, res) => {
  const poll = db.polls.find((p) => p.id === req.params.pollId);
  if (!poll) throw fail(404, 'Poll not found.');
  const ch = channelAccessible(poll.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  if (poll.closed) throw fail(400, 'This poll is closed.');
  if (poll.closesAt && new Date(poll.closesAt).getTime() < Date.now()) throw fail(400, 'This poll has closed.');

  const { optionId } = req.body || {};
  const option = poll.options.find((o) => o.id === optionId);
  if (!option) throw fail(400, 'That option is not in this poll.');

  const already = db.pollVotes.find(
    (v) => v.pollId === poll.id && v.userId === req.user.id && v.optionId === optionId,
  );

  if (already) {
    // Clicking your own choice again clears it — the usual way to undo a vote.
    db.pollVotes = db.pollVotes.filter((v) => v.id !== already.id);
  } else {
    if (!poll.allowMultiple) {
      // Single choice: a new pick replaces the old one.
      db.pollVotes = db.pollVotes.filter((v) => !(v.pollId === poll.id && v.userId === req.user.id));
    }
    db.pollVotes.push({
      id: id('pv'), pollId: poll.id, optionId, userId: req.user.id, createdAt: now(),
    });
  }
  persist();

  const view = pollView(poll, req.user.id);
  broadcastToUsers(channelMemberIds(ch.id), { type: 'poll.updated', channelId: ch.id, poll: view });
  res.json({ poll: view });
}));

app.patch('/api/polls/:pollId', authRequired, wrap(async (req, res) => {
  const poll = db.polls.find((p) => p.id === req.params.pollId);
  if (!poll) throw fail(404, 'Poll not found.');
  const ch = channelAccessible(poll.channelId, req.user.id);
  if (!ch) throw fail(404, 'Channel not found.');
  if (poll.createdBy !== req.user.id && !can(ch.teamId, req.user.id, 'message.deleteAny')) {
    throw fail(403, 'Only the poll creator can close it.');
  }
  if (typeof req.body?.closed === 'boolean') poll.closed = req.body.closed;
  persist();
  const view = pollView(poll, req.user.id);
  broadcastToUsers(channelMemberIds(ch.id), { type: 'poll.updated', channelId: ch.id, poll: view });
  res.json({ poll: view });
}));

/* ---------------------------------------------------------------- reports */

// A team-level activity report. Deliberately computed from the rows we already
// have (no fabricated numbers): tasks assigned/open/done, messages sent, files
// uploaded, meetings hosted, and the reporting line for each person.
app.get('/api/teams/:teamId/reports', authRequired, wrap(async (req, res) => {
  const team = db.teams.find((t) => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found.');
  requireMember(team.id, req.user.id);

  const memberships = db.memberships.filter((m) => m.teamId === team.id);
  const teamChannelIds = new Set(db.channels.filter((c) => c.teamId === team.id).map((c) => c.id));
  const teamTasks = db.tasks.filter((t) => t.teamId === team.id);
  const teamCalls = db.calls.filter((c) => c.teamId === team.id);
  const teamFiles = db.files.filter((f) => f.teamId === team.id);

  const people = memberships.map((m) => {
    const u = db.users.find((x) => x.id === m.userId);
    const assigned = teamTasks.filter((t) => t.assigneeId === m.userId);
    const open = assigned.filter((t) => t.status !== 'done');
    const done = assigned.filter((t) => t.status === 'done');
    const overdue = open.filter((t) => t.dueDate && new Date(`${t.dueDate}T23:59:59`).getTime() < Date.now());
    const sent = db.messages.filter((msg) => msg.authorId === m.userId && teamChannelIds.has(msg.channelId) && !msg.deletedAt);
    const hosted = teamCalls.filter((c) => c.hostId === m.userId);
    const uploads = teamFiles.filter((f) => f.uploaderId === m.userId);
    return {
      user: publicUser(u),
      role: m.role,
      tasks: { total: assigned.length, open: open.length, done: done.length, overdue: overdue.length },
      messages: sent.length,
      meetingsHosted: hosted.length,
      filesUploaded: uploads.length,
      lastActiveAt: sent.length ? sent[sent.length - 1].createdAt : null,
    };
  });

  const totals = {
    people: people.length,
    tasks: teamTasks.length,
    tasksOpen: teamTasks.filter((t) => t.status !== 'done').length,
    tasksDone: teamTasks.filter((t) => t.status === 'done').length,
    tasksOverdue: teamTasks.filter(
      (t) => t.status !== 'done' && t.dueDate && new Date(`${t.dueDate}T23:59:59`).getTime() < Date.now(),
    ).length,
    messages: db.messages.filter((msg) => teamChannelIds.has(msg.channelId) && !msg.deletedAt).length,
    meetings: teamCalls.length,
    files: teamFiles.length,
  };

  // Workload by department, so a manager can see where the queue sits.
  const byDepartment = {};
  for (const p of people) {
    const dept = p.user?.department || 'Unassigned';
    byDepartment[dept] = byDepartment[dept] || { name: dept, people: 0, open: 0, done: 0, messages: 0 };
    byDepartment[dept].people += 1;
    byDepartment[dept].open += p.tasks.open;
    byDepartment[dept].done += p.tasks.done;
    byDepartment[dept].messages += p.messages;
  }

  const reportingLines = memberships
    .map((m) => {
      const u = db.users.find((x) => x.id === m.userId);
      const manager = u?.managerId ? db.users.find((x) => x.id === u.managerId) : null;
      return {
        userId: m.userId,
        name: u?.name || '',
        position: u?.position || '',
        managerId: manager?.id || null,
        managerName: manager?.name || null,
      };
    })
    .filter((r) => r.managerId);

  res.json({
    team: teamView(team, req.user.id),
    generatedAt: now(),
    totals,
    people: people.sort((a, b) => b.tasks.open - a.tasks.open || (a.user?.name || '').localeCompare(b.user?.name || '')),
    departments: Object.values(byDepartment).sort((a, b) => b.open - a.open),
    reportingLines,
  });
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
  const {
    title = 'Instant meeting', channelId = null, scheduledAt = null, inviteeIds = null,
    reminders = null, description = '', sendEmail = false, durationMinutes = 30,
  } = req.body || {};

  // A 1:1 call passes inviteeIds; a channel/team meeting passes none and rings
  // everybody in the team. An empty array is treated as "everyone" so a stale
  // client cannot accidentally create a meeting that notifies nobody.
  const teamMemberIds = db.memberships.filter((m) => m.teamId === req.params.teamId).map((m) => m.userId);
  const invitees = Array.isArray(inviteeIds) && inviteeIds.length > 0
    ? inviteeIds.filter((uid) => teamMemberIds.includes(uid) && uid !== req.user.id)
    : teamMemberIds.filter((uid) => uid !== req.user.id);

  const isDirect = Array.isArray(inviteeIds) && inviteeIds.length === 1;
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
    inviteeIds: invitees,
    isDirect,
    description: String(description || ''),
    // Reminders are minutes-before-start offsets, e.g. [10, 1] = 10 min and
    // 1 min before. Empty means no reminders.
    reminders: Array.isArray(reminders)
      ? reminders.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0).slice(0, 5)
      : [],
    // Offsets whose fire time has already passed are marked as sent up front.
    // Otherwise a meeting created 2 minutes out with a "10 min before"
    // reminder would fire the instant it is saved.
    remindersSent: [],
    durationMinutes: Number(durationMinutes) > 0 ? Math.min(Number(durationMinutes), 480) : 30,
  };
  if (call.scheduledAt) {
    const startMs = new Date(call.scheduledAt).getTime();
    if (Number.isFinite(startMs)) {
      call.remindersSent = call.reminders.filter((offset) => startMs - offset * 60000 <= Date.now());
    }
  }
  db.calls.push(call);
  persist();

  broadcastToUsers([...new Set([req.user.id, ...invitees])], { type: 'call.created', call });
  for (const uid of invitees) {
    notify(uid, {
      kind: 'meeting',
      title: isDirect ? `${req.user.name} is calling you` : `${req.user.name} started “${title}”`,
      body: isDirect ? 'Answer from the notification.' : 'Join the meeting from the Meetings tab.',
      link: `#/meeting/${call.id}`,
    });
  }
  // Email invites are best-effort: the meeting is already created, so a mail
  // failure must never fail the request. The reason is reported instead.
  let emailResult = null;
  if (sendEmail && invitees.length > 0) {
    emailResult = await sendMeetingInvites(call, invitees);
  }

  res.json({ call, emailResult });
}));

// Breakout rooms: split the room into named groups. Assignment is advisory —
// the client moves a peer's media by re-signalling, the server just keeps the
// roster so everyone sees the same rooms.
app.post('/api/calls/:callId/breakout', authRequired, wrap(async (req, res) => {
  const call = db.calls.find((c) => c.id === req.params.callId);
  if (!call) throw fail(404, 'Meeting not found.');
  requireMember(call.teamId, req.user.id);
  if (call.hostId !== req.user.id && !can(call.teamId, req.user.id, 'meeting.moderate')) {
    throw fail(403, 'Only the host can manage breakout rooms.');
  }

  const { rooms = [], open = true, durationMinutes = null } = req.body || {};
  if (!Array.isArray(rooms)) throw fail(400, 'rooms must be an array.');

  const clean = rooms
    .map((r, i) => ({
      id: r.id || id('room'),
      name: String(r.name || `Room ${i + 1}`).trim(),
      userIds: Array.isArray(r.userIds) ? r.userIds.filter((u) => typeof u === 'string') : [],
    }))
    .filter((r) => r.name)
    .slice(0, 12);

  call.breakout = {
    open: !!open,
    rooms: clean,
    durationMinutes: durationMinutes ? Number(durationMinutes) : null,
    startedAt: open ? now() : null,
    createdBy: req.user.id,
  };
  persist();

  const memberIds = db.memberships.filter((m) => m.teamId === call.teamId).map((m) => m.userId);
  broadcastToUsers(memberIds, { type: 'call.breakout', callId: call.id, breakout: call.breakout });
  if (open) {
    for (const uid of memberIds) {
      if (uid === req.user.id) continue;
      notify(uid, {
        kind: 'meeting',
        title: `${req.user.name} opened breakout rooms`,
        body: `${clean.length} rooms in “${call.title}”.`,
        link: `#/meeting/${call.id}`,
      });
    }
  }
  res.json({ breakout: call.breakout });
}));

app.delete('/api/calls/:callId/breakout', authRequired, wrap(async (req, res) => {
  const call = db.calls.find((c) => c.id === req.params.callId);
  if (!call) throw fail(404, 'Meeting not found.');
  requireMember(call.teamId, req.user.id);
  if (call.hostId !== req.user.id && !can(call.teamId, req.user.id, 'meeting.moderate')) {
    throw fail(403, 'Only the host can close breakout rooms.');
  }
  call.breakout = null;
  persist();
  const memberIds = db.memberships.filter((m) => m.teamId === call.teamId).map((m) => m.userId);
  broadcastToUsers(memberIds, { type: 'call.breakout', callId: call.id, breakout: null });
  res.json({ breakout: null });
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

// Reminder tick. Runs once a minute: a scheduled meeting whose reminder offset
// has been reached sends an in-app notification plus a WebSocket push, exactly
// once per offset. In-process on purpose — a single API instance, and a
// missed tick while the process is down simply fires late rather than never.
function reminderTick() {
  const nowMs = Date.now();
  let changed = false;

  for (const call of db.calls) {
    if (call.status !== 'scheduled' || !call.scheduledAt || !Array.isArray(call.reminders)) continue;
    const startMs = new Date(call.scheduledAt).getTime();
    if (!Number.isFinite(startMs)) continue;

    call.remindersSent = call.remindersSent || [];
    for (const offset of call.reminders) {
      if (call.remindersSent.includes(offset)) continue;
      const fireAt = startMs - offset * 60000;
      if (nowMs < fireAt) continue;
      // More than 15 minutes late means the reminder is no longer useful —
      // record it as handled rather than firing a stale "starts in 10 min".
      if (nowMs - fireAt > 15 * 60000) {
        call.remindersSent.push(offset);
        changed = true;
        continue;
      }

      call.remindersSent.push(offset);
      changed = true;

      const targets = new Set([call.hostId, ...(call.inviteeIds || [])]);
      for (const uid of targets) {
        const label = offset === 0 ? 'now' : `in ${offset} minute${offset === 1 ? '' : 's'}`;
        notify(uid, {
          kind: 'meeting',
          title: `“${call.title}” starts ${label}`,
          body: call.scheduledAt ? new Date(call.scheduledAt).toLocaleString() : '',
          link: `#/meeting/${call.id}`,
        });
      }
    }
  }
  if (changed) persist();
}

setInterval(reminderTick, 60000).unref?.();
setTimeout(reminderTick, 3000).unref?.();

server.listen(PORT, () => {
  console.log(`\n  EGAN Pulse API  →  http://localhost:${PORT}`);
  console.log(`  WebSocket       →  ws://localhost:${PORT}/ws`);
  console.log(`  Data            →  ${DATA_DIR}`);
  console.log(`  Demo logins     →  aarav@egan.in / pulse1234 (owner), priya@egan.in (admin), rohit@egan.in (member)\n`);
});
