import { db } from './store.mjs';

export const ROLE_RANK = { guest: 0, bot: 1, member: 2, admin: 3, owner: 4 };

export const PERMISSIONS = [
  { key: 'channel.manage', label: 'Create, rename and archive channels', minRole: 'admin' },
  { key: 'member.invite', label: 'Invite people and manage guests', minRole: 'admin' },
  { key: 'member.manage', label: 'Change member roles and remove members', minRole: 'admin' },
  { key: 'meeting.host', label: 'Start and host meetings with screen sharing', minRole: 'member' },
  { key: 'meeting.moderate', label: 'Mute others and remove meeting participants', minRole: 'admin' },
  { key: 'task.manage', label: 'Create and assign tasks to anyone', minRole: 'member' },
  { key: 'file.upload', label: 'Upload files to channels', minRole: 'member' },
  { key: 'note.edit', label: 'Create and edit channel notes', minRole: 'member' },
  { key: 'message.deleteAny', label: 'Delete anyone’s message', minRole: 'admin' },
  { key: 'team.settings', label: 'Edit team name, description and danger zone', minRole: 'owner' },
];

export function membershipFor(teamId, userId) {
  return db.memberships.find((m) => m.teamId === teamId && m.userId === userId) || null;
}

export function roleFor(teamId, userId) {
  const m = membershipFor(teamId, userId);
  return m ? m.role : null;
}

export function isMember(teamId, userId) {
  return !!membershipFor(teamId, userId);
}

export function can(teamId, userId, permission) {
  const m = membershipFor(teamId, userId);
  if (!m) return false;
  if (m.role === 'owner') return true;
  const def = PERMISSIONS.find((p) => p.key === permission);
  if (!def) return false;
  // Explicit per-member grant overrides the role minimum.
  if (Array.isArray(m.permissions) && m.permissions.includes(permission)) return true;
  return ROLE_RANK[m.role] >= ROLE_RANK[def.minRole];
}

export function requirePermission(teamId, userId, permission) {
  if (can(teamId, userId, permission)) return;
  const err = new Error(`Your role cannot perform this action (${permission}).`);
  err.status = 403;
  throw err;
}

export function requireMember(teamId, userId) {
  if (isMember(teamId, userId)) return;
  const err = new Error('You are not a member of this team.');
  err.status = 403;
  throw err;
}

export function channelAccessible(channelId, userId) {
  const ch = db.channels.find((c) => c.id === channelId);
  if (!ch) return null;
  if (!isMember(ch.teamId, userId)) return null;
  if (!ch.isPrivate) return ch;
  const inChannel = db.channelMembers.some((cm) => cm.channelId === ch.id && cm.userId === userId);
  if (inChannel) return ch;
  if (can(ch.teamId, userId, 'channel.manage')) return ch;
  return null;
}

export function channelMemberIds(channelId) {
  const ch = db.channels.find((c) => c.id === channelId);
  if (!ch) return [];
  if (!ch.isPrivate) {
    return db.memberships.filter((m) => m.teamId === ch.teamId).map((m) => m.userId);
  }
  return db.channelMembers.filter((cm) => cm.channelId === ch.id).map((cm) => cm.userId);
}
