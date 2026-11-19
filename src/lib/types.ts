export type Role = 'owner' | 'admin' | 'member' | 'guest' | 'bot';

export interface OutOfOffice {
  enabled: boolean;
  startDate: string | null;
  endDate: string | null;
  message: string;
  delegateId: string | null;
}

export interface CalendarEvent {
  id: string;
  kind: 'meeting' | 'task' | 'ooo';
  title: string;
  at: string;
  endAt?: string | null;
  allDay: boolean;
  status?: string;
  link: string;
  hostName?: string;
  attendeeCount?: number;
  description?: string;
  assigneeName?: string;
  priority?: string;
  userId?: string;
  message?: string;
  delegateName?: string;
  isPersonal?: boolean;
  reminders?: number[];
  remindersSent?: number[];
  inviteeNames?: string[];
}

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
  outOfOffice?: OutOfOffice | null;
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
  muted?: boolean;
  hidden?: boolean;
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
  description?: string;
  reminders?: number[];
  remindersSent?: number[];
  inviteeIds?: string[];
  isDirect?: boolean;
  breakout?: Breakout | null;
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

export interface PollOption {
  id: string;
  text: string;
  count: number;
  percent: number;
  voters: string[];
}

export interface Poll {
  id: string;
  channelId: string;
  teamId: string;
  question: string;
  options: PollOption[];
  allowMultiple: boolean;
  anonymous: boolean;
  closesAt: string | null;
  closed: boolean;
  createdBy: User;
  createdAt: string;
  totalVotes: number;
  votersCount: number;
  myVotes: string[];
}

export interface BreakoutRoom {
  id: string;
  name: string;
  userIds: string[];
}

export interface Breakout {
  open: boolean;
  rooms: BreakoutRoom[];
  durationMinutes: number | null;
  startedAt: string | null;
  createdBy: string;
}

export interface MeetingInvite {
  status: 'INVITED' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}

export interface HiddenPerson {
  id: string;
  userId: string;
  teamId: string;
  targetUserId: string;
  createdAt: string;
  user: User;
}

export interface AddPersonResult {
  user: User;
  role: Role;
  created: boolean;
  temporaryPassword: string | null;
  alreadyMember: boolean;
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
