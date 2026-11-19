export type Role = 'owner' | 'admin' | 'member' | 'guest' | 'bot';

export interface User {
  id: string;
  name: string;
  email: string;
  title?: string;
  position?: string;
  department?: string;
  employeeId?: string;
  managerId?: string | null;
  phone?: string;
  location?: string;
  timezone?: string;
  bio?: string;
  joinedAt?: string;
  avatarColor: string;
  avatarUrl?: string | null;
  status?: 'online' | 'away' | 'busy' | 'offline';
  statusText?: string;
  isBot?: boolean;
  createdAt?: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
  users: string[];
}

export interface Attachment {
  name: string;
  url: string;
  size?: number;
  mime?: string;
}

export interface Message {
  id: string;
  channelId: string;
  teamId: string;
  authorId: string;
  author: User;
  body: string;
  parentId: string | null;
  attachments: Attachment[];
  mentions: string[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reactions: Reaction[];
  replyCount: number;
  clientId?: string | null;
  pending?: boolean;
  failed?: boolean;
}

export interface Channel {
  id: string;
  teamId: string;
  name: string;
  topic: string;
  kind: 'public' | 'private' | 'dm';
  isPrivate: boolean;
  createdBy: string;
  createdAt: string;
  archived: boolean;
  memberIds: string[];
  unread: number;
  lastMessage: { body: string; createdAt: string; authorName: string } | null;
}

export interface Membership {
  id: string;
  teamId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  permissions: string[];
  user: User;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatarColor: string;
  ownerId: string;
  createdAt: string;
  role: Role | null;
  permissions: string[];
  memberCount: number;
}

export interface PermissionDef {
  key: string;
  label: string;
  minRole: Role;
}

export interface TeamBundle {
  team: Team;
  members: Membership[];
  channels: Channel[];
  permissions: PermissionDef[];
  myPermissions: string[];
}

export interface TaskItem {
  id: string;
  teamId: string;
  channelId: string | null;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigneeId: string | null;
  createdBy: string;
  dueDate: string | null;
  tags: string[];
  checklist: { id: string; text: string; done: boolean }[];
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  teamId: string;
  channelId: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileRow {
  id: string;
  teamId: string;
  channelId: string;
  uploaderId: string;
  name: string;
  size: number;
  mime: string;
  url: string;
  createdAt: string;
}

export interface CallRow {
  id: string;
  teamId: string;
  channelId: string | null;
  title: string;
  hostId: string;
  host?: User;
  status: 'scheduled' | 'live' | 'ended';
  scheduledAt: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  participants?: string[];
}

export interface NotificationRow {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface InviteRow {
  id: string;
  teamId: string;
  code: string;
  role: Role;
  email: string;
  channelId: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedBy: string[];
  link?: string;
}

export interface OrgNode {
  user: User;
  role: Role;
  children: OrgNode[];
}

export interface Department {
  name: string;
  people: { user: User; role: Role }[];
}

export interface Hierarchy {
  team: Team;
  roots: OrgNode[];
  departments: Department[];
  total: number;
}

export interface UserProfile {
  user: User;
  manager: User | null;
  reports: User[];
  teamRoles: { teamId: string; teamName: string; role: Role; joinedAt: string }[];
}

export interface DirectMessage {
  channel: Channel;
  partner: User;
}

export interface ReportPerson {
  user: User;
  role: Role;
  tasks: { total: number; open: number; done: number; overdue: number };
  messages: number;
  meetingsHosted: number;
  filesUploaded: number;
  lastActiveAt: string | null;
}

export interface TeamReport {
  team: Team;
  generatedAt: string;
  totals: {
    people: number; tasks: number; tasksOpen: number; tasksDone: number;
    tasksOverdue: number; messages: number; meetings: number; files: number;
  };
  people: ReportPerson[];
  departments: { name: string; people: number; open: number; done: number; messages: number }[];
  reportingLines: { userId: string; name: string; position: string; managerId: string | null; managerName: string | null }[];
}

export interface SearchResults {
  messages: (Message & { channelName: string })[];
  channels: Channel[];
  people: User[];
  tasks: TaskItem[];
}
