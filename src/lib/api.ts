import type {
  AddPersonResult, Breakout, CalendarEvent, CallRow, Channel, DirectMessage, FileRow,
  HiddenPerson, Hierarchy, InviteRow, Message, Note, NotificationRow, OutOfOffice, Poll,
  SearchResults, TaskItem, Team, TeamBundle, TeamReport, User, UserProfile,
} from './types';

const TOKEN_KEY = 'egan.pulse.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(res.status, data?.message || `Request failed (${res.status}).`);
  }
  return data as T;
}

const get = <T>(p: string) => request<T>(p);
const post = <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
const del = <T>(p: string) => request<T>(p, { method: 'DELETE' });

export const api = {
  // auth
  login: (email: string, password: string) => post<{ token: string; user: User }>('/auth/login', { email, password }),
  register: (input: { name: string; email: string; password: string; title?: string }) =>
    post<{ token: string; user: User; teamId: string }>('/auth/register', input),
  me: () => get<{ user: User }>('/auth/me'),
  updateMe: (input: Partial<Pick<User, 'name' | 'title' | 'status' | 'statusText' | 'avatarUrl'>> & { outOfOffice?: OutOfOffice | null }) =>
    patch<{ user: User }>('/auth/me', input),
  calendar: (teamId: string, range: { from?: string; to?: string; scope?: 'team' | 'mine' | 'all' } = {}) => {
    const q = new URLSearchParams();
    if (range.from) q.set('from', range.from);
    if (range.to) q.set('to', range.to);
    if (range.scope) q.set('scope', range.scope);
    const s = q.toString();
    return get<{ scope: string; events: CalendarEvent[]; counts: { meeting: number; task: number; ooo: number } }>(`/teams/${teamId}/calendar${s ? `?${s}` : ''}`);
  },
  users: () => get<{ users: User[] }>('/users'),
  profile: (userId: string) => get<UserProfile>(`/users/${userId}`),
  hierarchy: (teamId: string) => get<Hierarchy>(`/teams/${teamId}/hierarchy`),
  addMember: (teamId: string, input: { email: string; name?: string; role?: string; position?: string; department?: string; managerId?: string | null; password?: string }) =>
    post<AddPersonResult>(`/teams/${teamId}/members`, input),
  setChannelPrefs: (channelId: string, input: { muted?: boolean; hidden?: boolean }) =>
    patch<{ channel: Channel }>(`/channels/${channelId}/prefs`, input),
  hiddenPeople: (teamId: string) => get<{ hidden: HiddenPerson[] }>(`/hidden-people?teamId=${encodeURIComponent(teamId)}`),
  hidePerson: (teamId: string, userId: string) => post<{ ok: true; hidden: boolean }>(`/teams/${teamId}/people/${userId}/hide`),
  unhidePerson: (teamId: string, userId: string) => del<{ ok: true; hidden: boolean }>(`/teams/${teamId}/people/${userId}/hide`),
  dms: () => get<{ dms: DirectMessage[] }>('/dms'),
  openDm: (userId: string) => post<{ channel: Channel; partner: User; created: boolean }>(`/dms/${userId}`),
  reports: (teamId: string) => get<TeamReport>(`/teams/${teamId}/reports`),
  updateOrg: (teamId: string, userId: string, input: Partial<Pick<User, 'position' | 'department' | 'employeeId' | 'managerId' | 'phone' | 'location' | 'timezone' | 'bio'>>) =>
    patch<{ user: User }>(`/teams/${teamId}/members/${userId}/org`, input),

  // teams
  teams: () => get<{ teams: Team[] }>('/teams'),
  createTeam: (input: { name: string; description?: string }) => post<{ team: Team }>('/teams', input),
  team: (teamId: string) => get<TeamBundle>(`/teams/${teamId}`),
  updateTeam: (teamId: string, input: { name?: string; description?: string }) =>
    patch<{ team: Team }>(`/teams/${teamId}`, input),

  // members
  updateMember: (teamId: string, userId: string, input: { role?: string; permissions?: string[] }) =>
    patch<{ membership: unknown }>(`/teams/${teamId}/members/${userId}`, input),
  removeMember: (teamId: string, userId: string) => del<{ ok: true }>(`/teams/${teamId}/members/${userId}`),

  // invites
  createInvite: (teamId: string, input: { role?: string; email?: string; channelId?: string | null }) =>
    post<{ invite: InviteRow; link: string }>(`/teams/${teamId}/invites`, input),
  invites: (teamId: string) => get<{ invites: InviteRow[] }>(`/teams/${teamId}/invites`),
  inviteInfo: (code: string) =>
    get<{ invite: { code: string; role: string; expiresAt: string }; team: { id: string; name: string; description: string; avatarColor: string } | null }>(`/invites/${code}`),
  acceptInvite: (code: string) => post<{ teamId: string }>(`/invites/${code}/accept`),

  // channels
  createChannel: (teamId: string, input: { name: string; topic?: string; isPrivate?: boolean; memberIds?: string[] }) =>
    post<{ channel: Channel }>(`/teams/${teamId}/channels`, input),
  updateChannel: (channelId: string, input: { name?: string; topic?: string; archived?: boolean }) =>
    patch<{ channel: Channel }>(`/channels/${channelId}`, input),
  addChannelMembers: (channelId: string, userIds: string[]) =>
    post<{ channel: Channel }>(`/channels/${channelId}/members`, { userIds }),

  // messages
  messages: (channelId: string, opts: { before?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.before) q.set('before', opts.before);
    if (opts.limit) q.set('limit', String(opts.limit));
    const s = q.toString();
    return get<{ messages: Message[] }>(`/channels/${channelId}/messages${s ? `?${s}` : ''}`);
  },
  sendMessage: (channelId: string, input: { body: string; parentId?: string | null; attachments?: unknown[]; mentions?: string[]; clientId?: string }) =>
    post<{ message: Message }>(`/channels/${channelId}/messages`, input),
  thread: (messageId: string) => get<{ parent: Message; replies: Message[] }>(`/messages/${messageId}/thread`),
  editMessage: (messageId: string, body: string) => patch<{ message: Message }>(`/messages/${messageId}`, { body }),
  deleteMessage: (messageId: string) => del<{ ok: true }>(`/messages/${messageId}`),
  react: (messageId: string, emoji: string) => post<{ message: Message }>(`/messages/${messageId}/reactions`, { emoji }),
  markRead: (channelId: string) => post<{ ok: true }>(`/channels/${channelId}/read`),

  // search
  search: (q: string) => get<SearchResults>(`/search?q=${encodeURIComponent(q)}`),

  // tasks
  tasks: (teamId: string) => get<{ tasks: TaskItem[] }>(`/teams/${teamId}/tasks`),
  createTask: (teamId: string, input: Partial<TaskItem> & { title: string }) =>
    post<{ task: TaskItem }>(`/teams/${teamId}/tasks`, input),
  updateTask: (taskId: string, input: Partial<TaskItem>) => patch<{ task: TaskItem }>(`/tasks/${taskId}`, input),
  deleteTask: (taskId: string) => del<{ ok: true }>(`/tasks/${taskId}`),

  // notes
  notes: (channelId: string) => get<{ notes: Note[] }>(`/channels/${channelId}/notes`),
  createNote: (channelId: string, input: { title?: string; body?: string }) =>
    post<{ note: Note }>(`/channels/${channelId}/notes`, input),
  updateNote: (noteId: string, input: { title?: string; body?: string }) =>
    patch<{ note: Note }>(`/notes/${noteId}`, input),

  // files
  files: (channelId: string) => get<{ files: FileRow[] }>(`/channels/${channelId}/files`),
  upload: (channelId: string, file: File, onProgress?: (pct: number) => void) =>
    new Promise<{ file: FileRow }>((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/channels/${channelId}/files`);
      const token = tokenStore.get();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new ApiError(xhr.status, data.message || 'Upload failed.'));
        } catch {
          reject(new ApiError(xhr.status, 'Upload failed.'));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, 'Upload failed — check your connection.'));
      xhr.send(form);
    }),

  // meetings
  calls: (teamId: string) => get<{ calls: CallRow[] }>(`/teams/${teamId}/calls`),
  createCall: (teamId: string, input: {
    title?: string; channelId?: string | null; scheduledAt?: string | null;
    inviteeIds?: string[] | null; reminders?: number[] | null;
    description?: string; sendEmail?: boolean;
  }) =>
    post<{ call: CallRow; emailResult?: { attempted: number; delivered: number; reason: string | null } | null }>(`/teams/${teamId}/calls`, input),

  // polls
  polls: (channelId: string) => get<{ polls: Poll[] }>(`/channels/${channelId}/polls`),
  createPoll: (channelId: string, input: { question: string; options: string[]; allowMultiple?: boolean; anonymous?: boolean; closesAt?: string | null }) =>
    post<{ poll: Poll }>(`/channels/${channelId}/polls`, input),
  votePoll: (pollId: string, optionId: string) => post<{ poll: Poll }>(`/polls/${pollId}/vote`, { optionId }),
  closePoll: (pollId: string, closed: boolean) => patch<{ poll: Poll }>(`/polls/${pollId}`, { closed }),

  // breakout rooms
  setBreakout: (callId: string, input: { rooms: { id?: string; name: string; userIds: string[] }[]; open?: boolean; durationMinutes?: number | null }) =>
    post<{ breakout: Breakout }>(`/calls/${callId}/breakout`, input),
  closeBreakout: (callId: string) => del<{ breakout: null }>(`/calls/${callId}/breakout`),

  // meeting invites (emailed links)
  meetingInvite: (token: string) =>
    get<{ invite: { status: string; createdAt: string }; call: { id: string; title: string; description: string; scheduledAt: string | null; status: string; hostName: string } | null; person: { name: string; email: string } | null }>(`/meeting-invites/${token}`),
  respondMeetingInvite: (token: string, action: 'accept' | 'decline') =>
    post<{ status: string }>(`/meeting-invites/${token}/${action}`),
  call: (callId: string) => get<{ call: CallRow; team: Team }>(`/calls/${callId}`),
  updateCall: (callId: string, input: { status?: string }) => patch<{ call: CallRow }>(`/calls/${callId}`, input),

  // notifications
  notifications: () => get<{ notifications: NotificationRow[] }>('/notifications'),
  markNotificationsRead: (ids?: string[]) => post<{ ok: true }>('/notifications/read', { ids }),
};

export function wsUrl(token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}
