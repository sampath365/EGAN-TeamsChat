import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type { ReactNode } from 'react';
import { api, tokenStore, wsUrl } from '@/lib/api';
import type {
  CallRow, Channel, FileRow, Message, Membership, Note, NotificationRow, PermissionDef,
  TaskItem, Team, User,
} from '@/lib/types';

type Toast = { id: string; title: string; body?: string; tone?: 'info' | 'success' | 'error' };

interface AppState {
  ready: boolean;
  user: User | null;
  token: string | null;
  teams: Team[];
  teamId: string | null;
  team: Team | null;
  members: Membership[];
  channels: Channel[];
  permissionDefs: PermissionDef[];
  myPermissions: string[];
  messages: Record<string, Message[]>;
  tasks: TaskItem[];
  calls: CallRow[];
  notifications: NotificationRow[];
  online: Set<string>;
  connection: 'online' | 'connecting' | 'offline';
  typing: Record<string, { name: string; at: number }[]>;
  unreadTotal: number;
  theme: 'dark' | 'light';

  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; title?: string }) => Promise<void>;
  logout: () => void;
  setTheme: (t: 'dark' | 'light') => void;
  selectTeam: (teamId: string) => void;
  refreshTeam: (teamId?: string) => Promise<void>;
  createTeam: (name: string, description?: string) => Promise<Team>;

  loadMessages: (channelId: string, before?: string) => Promise<void>;
  sendMessage: (channelId: string, body: string, opts?: { parentId?: string | null; mentions?: string[]; attachments?: { name: string; url: string; size?: number; mime?: string }[] }) => Promise<Message | null>;
  editMessage: (messageId: string, channelId: string, body: string) => Promise<void>;
  deleteMessage: (messageId: string, channelId: string) => Promise<void>;
  react: (messageId: string, channelId: string, emoji: string) => Promise<void>;
  markChannelRead: (channelId: string) => void;
  sendTyping: (channelId: string, active: boolean) => void;

  createChannel: (input: { name: string; topic?: string; isPrivate?: boolean; memberIds?: string[] }) => Promise<Channel>;
  updateChannel: (channelId: string, input: { name?: string; topic?: string; archived?: boolean }) => Promise<void>;
  addChannelMembers: (channelId: string, userIds: string[]) => Promise<void>;

  createTask: (input: Partial<TaskItem> & { title: string }) => Promise<void>;
  updateTask: (taskId: string, input: Partial<TaskItem>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  channelNotes: (channelId: string) => Promise<Note[]>;
  createNote: (channelId: string, input: { title?: string; body?: string }) => Promise<Note>;
  updateNote: (noteId: string, input: { title?: string; body?: string }) => Promise<Note>;

  channelFiles: (channelId: string) => Promise<FileRow[]>;

  createCall: (input: { title?: string; channelId?: string | null; scheduledAt?: string | null }) => Promise<CallRow>;
  updateCall: (callId: string, input: { status?: string }) => Promise<void>;

  can: (permission: string) => boolean;
  toast: (t: Omit<Toast, 'id'>) => void;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  refreshNotifications: () => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  updateProfile: (input: Partial<Pick<User, 'name' | 'title' | 'status' | 'statusText'>>) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(tokenStore.get());
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(localStorage.getItem('egan.pulse.team'));
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [permissionDefs, setPermissionDefs] = useState<PermissionDef[]>([]);
  const [myPermissions, setMyPermissions] = useState<string[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [connection, setConnection] = useState<'online' | 'connecting' | 'offline'>('connecting');
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }[]>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<'dark' | 'light'>(
    (localStorage.getItem('egan.pulse.theme') as 'dark' | 'light') || 'dark',
  );

  const socketRef = useRef<WebSocket | null>(null);
  const typingTimers = useRef<Record<string, number>>({});
  const currentChannel = useRef<string | null>(null);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  const setTheme = useCallback((t: 'dark' | 'light') => {
    setThemeState(t);
    localStorage.setItem('egan.pulse.theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  /* ------------------------------------------------------------ boot/auth */

  const loadTeams = useCallback(async () => {
    const { teams: rows } = await api.teams();
    setTeams(rows);
    return rows;
  }, []);

  const refreshTeam = useCallback(async (id?: string) => {
    const target = id || teamId || team?.id;
    if (!target) return;
    const bundle = await api.team(target);
    setTeam(bundle.team);
    setMembers(bundle.members);
    setChannels(bundle.channels);
    setPermissionDefs(bundle.permissions);
    setMyPermissions(bundle.myPermissions);
    const [{ calls: callRows }, { tasks: taskRows }] = await Promise.all([
      api.calls(target).catch(() => ({ calls: [] as CallRow[] })),
      api.tasks(target).catch(() => ({ tasks: [] as TaskItem[] })),
    ]);
    setCalls(callRows);
    setTasks(taskRows);
  }, [teamId, team?.id]);

  const refreshNotifications = useCallback(async () => {
    try {
      const { notifications: rows } = await api.notifications();
      setNotifications(rows);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    (async () => {
      const stored = tokenStore.get();
      if (!stored) {
        setReady(true);
        return;
      }
      try {
        const { user: me } = await api.me();
        setUser(me);
        setToken(stored);
        const rows = await loadTeams();
        const chosen = rows.find((t) => t.id === teamId)?.id || rows[0]?.id || null;
        if (chosen) {
          setTeamId(chosen);
          localStorage.setItem('egan.pulse.team', chosen);
          await refreshTeam(chosen);
        }
        await refreshNotifications();
      } catch {
        tokenStore.clear();
        setToken(null);
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------- realtime */

  const applyIncomingMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      const list = prev[message.channelId];
      if (!list) return prev;
      const withoutPending = list.filter((m) => !(message.clientId && m.clientId === message.clientId));
      if (withoutPending.some((m) => m.id === message.id)) return prev;
      return { ...prev, [message.channelId]: [...withoutPending, message] };
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    let closed = false;
    let retry = 0;
    let socket: WebSocket | null = null;
    let timer: number | undefined;

    const connect = () => {
      if (closed) return;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

      try {
        socket = new WebSocket(wsUrl(token));
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;
      setConnection('connecting');

      socket.onopen = () => {
        retry = 0;
        setConnection('online');
      };
      socket.onmessage = (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        switch (data.type) {
          case 'ready':
            setOnline(new Set<string>(data.online || []));
            break;
          case 'presence':
            setOnline((prev) => {
              const next = new Set(prev);
              if (data.status === 'online') next.add(data.userId);
              else next.delete(data.userId);
              return next;
            });
            break;
          case 'user.updated':
            setMembers((prev) => prev.map((m) => (m.userId === data.user.id ? { ...m, user: data.user } : m)));
            break;
          case 'message.created':
            applyIncomingMessage(data.message);
            if (data.message.authorId !== user?.id && currentChannel.current !== data.channelId) {
              setChannels((prev) => prev.map((c) => (c.id === data.channelId ? { ...c, unread: c.unread + 1 } : c)));
            }
            break;
          case 'message.updated':
            setMessages((prev) => {
              const list = prev[data.channelId];
              if (!list) return prev;
              return { ...prev, [data.channelId]: list.map((m) => (m.id === data.message.id ? data.message : m)) };
            });
            break;
          case 'message.deleted':
            setMessages((prev) => {
              const list = prev[data.channelId];
              if (!list) return prev;
              return { ...prev, [data.channelId]: list.filter((m) => m.id !== data.messageId) };
            });
            break;
          case 'typing': {
            setTyping((prev) => {
              const list = (prev[data.channelId] || []).filter((t) => t.name !== data.name);
              if (data.active) list.push({ name: data.name, at: Date.now() });
              return { ...prev, [data.channelId]: list };
            });
            window.clearTimeout(typingTimers.current[`${data.channelId}:${data.name}`]);
            typingTimers.current[`${data.channelId}:${data.name}`] = window.setTimeout(() => {
              setTyping((prev) => ({
                ...prev,
                [data.channelId]: (prev[data.channelId] || []).filter((t) => t.name !== data.name),
              }));
            }, 4000);
            break;
          }
          case 'notification':
            setNotifications((prev) => [data.notification, ...prev].slice(0, 50));
            toast({ title: data.notification.title, body: data.notification.body, tone: 'info' });
            break;
          case 'channel.created':
            setChannels((prev) => (prev.some((c) => c.id === data.channel.id) ? prev : [...prev, data.channel]));
            break;
          case 'channel.updated':
            setChannels((prev) => prev.map((c) => (c.id === data.channel.id ? { ...c, ...data.channel } : c)));
            break;
          case 'task.created':
            setTasks((prev) => (prev.some((t) => t.id === data.task.id) ? prev : [...prev, data.task]));
            break;
          case 'task.updated':
            setTasks((prev) => prev.map((t) => (t.id === data.task.id ? data.task : t)));
            break;
          case 'task.deleted':
            setTasks((prev) => prev.filter((t) => t.id !== data.taskId));
            break;
          case 'call.created':
            setCalls((prev) => (prev.some((c) => c.id === data.call.id) ? prev : [data.call, ...prev]));
            break;
          case 'call.updated':
            setCalls((prev) => prev.map((c) => (c.id === data.call.id ? { ...c, ...data.call } : c)));
            break;
          case 'team.role-changed':
            refreshTeam().catch(() => undefined);
            break;
          default:
            break;
        }
      };
      socket.onclose = () => {
        if (closed) return;
        socketRef.current = null;
        setConnection('offline');
        scheduleReconnect();
      };
      socket.onerror = () => socket?.close();
    };

    function scheduleReconnect() {
      if (closed) return;
      retry = Math.min(retry + 1, 7);
      window.clearTimeout(timer);
      // Backoff tops out at 10s so a phone waking from sleep recovers quickly.
      timer = window.setTimeout(connect, Math.min(600 * 2 ** retry, 10000));
    }

    // A backgrounded tab has its socket dropped by the OS/browser. Retrying
    // blindly is not enough — reconnect the moment the tab is visible again,
    // and drop the stale socket so `connect` is not skipped by its guard.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || closed) return;
      const state = socket?.readyState;
      if (state === WebSocket.OPEN) return;
      if (state === WebSocket.CONNECTING) return;
      window.clearTimeout(timer);
      retry = 0;
      socket = null;
      connect();
    };
    const onOnline = () => onVisible();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onVisible);

    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onVisible);
      socket?.close();
      socketRef.current = null;
    };
  }, [token, user?.id, applyIncomingMessage, refreshTeam, toast]);

  // Polling fallback: when the socket is not open, refresh the open channel on a
  // timer so a dropped connection degrades to "slightly delayed" instead of
  // "chat is dead". Deliberately skipped while the socket is healthy so we do
  // not double up on traffic.
  useEffect(() => {
    if (!token) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      const channelId = currentChannel.current;
      if (!channelId) return;
      try {
        const { messages: rows } = await api.messages(channelId, { limit: 60 });
        setMessages((prev) => {
          const existing = prev[channelId] || [];
          const pending = existing.filter((m) => m.pending);
          const seen = new Set(existing.map((m) => m.id));
          const merged = rows.filter((m) => !seen.has(m.id));
          if (merged.length === 0 && pending.length === 0) return prev;
          return { ...prev, [channelId]: [...existing.filter((m) => !m.pending), ...merged, ...pending] };
        });
      } catch {
        /* the socket reconnect loop owns recovery */
      }
    };
    const timer = window.setInterval(tick, 6000);
    return () => window.clearInterval(timer);
  }, [token]);

  /* ----------------------------------------------------------------- auth */

  const login = useCallback(async (email: string, password: string) => {
    const { token: t, user: me } = await api.login(email, password);
    tokenStore.set(t);
    setToken(t);
    setUser(me);
    const rows = await loadTeams();
    const chosen = rows[0]?.id || null;
    if (chosen) {
      setTeamId(chosen);
      localStorage.setItem('egan.pulse.team', chosen);
      await refreshTeam(chosen);
    }
    await refreshNotifications();
  }, [loadTeams, refreshTeam, refreshNotifications]);

  const register = useCallback(async (input: { name: string; email: string; password: string; title?: string }) => {
    const { token: t, user: me, teamId: newTeamId } = await api.register(input);
    tokenStore.set(t);
    setToken(t);
    setUser(me);
    await loadTeams();
    setTeamId(newTeamId);
    localStorage.setItem('egan.pulse.team', newTeamId);
    await refreshTeam(newTeamId);
  }, [loadTeams, refreshTeam]);

  const logout = useCallback(() => {
    setConnection('offline');
    tokenStore.clear();
    socketRef.current?.close();
    setToken(null);
    setUser(null);
    setTeams([]);
    setTeam(null);
    setChannels([]);
    setMembers([]);
    setMessages({});
    setTasks([]);
    setCalls([]);
    setNotifications([]);
  }, []);

  const selectTeam = useCallback((id: string) => {
    setTeamId(id);
    localStorage.setItem('egan.pulse.team', id);
    setMessages({});
    refreshTeam(id).catch((e) => toast({ title: 'Could not load team', body: e.message, tone: 'error' }));
  }, [refreshTeam, toast]);

  const createTeam = useCallback(async (name: string, description?: string) => {
    const { team: created } = await api.createTeam({ name, description });
    await loadTeams();
    setTeamId(created.id);
    localStorage.setItem('egan.pulse.team', created.id);
    await refreshTeam(created.id);
    toast({ title: 'Team created', body: name, tone: 'success' });
    return created;
  }, [loadTeams, refreshTeam, toast]);

  /* ------------------------------------------------------------- messages */

  const loadMessages = useCallback(async (channelId: string, before?: string) => {
    currentChannel.current = channelId;
    const { messages: rows } = await api.messages(channelId, { before, limit: 60 });
    setMessages((prev) => {
      const existing = before ? prev[channelId] || [] : [];
      const seen = new Set(existing.map((m) => m.id));
      const merged = [...rows.filter((m) => !seen.has(m.id)), ...existing];
      return { ...prev, [channelId]: merged };
    });
    if (!before) {
      api.markRead(channelId).catch(() => undefined);
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, unread: 0 } : c)));
    }
  }, []);

  const sendMessage = useCallback(async (
    channelId: string,
    body: string,
    opts: { parentId?: string | null; mentions?: string[]; attachments?: { name: string; url: string; size?: number; mime?: string }[] } = {},
  ) => {
    if (!user) return null;
    const clientId = `c_${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: clientId,
      channelId,
      teamId: team?.id || '',
      authorId: user.id,
      author: user,
      body,
      parentId: opts.parentId ?? null,
      attachments: opts.attachments || [],
      mentions: opts.mentions || [],
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      reactions: [],
      replyCount: 0,
      clientId,
      pending: true,
    };
    if (!opts.parentId) {
      setMessages((prev) => ({ ...prev, [channelId]: [...(prev[channelId] || []), optimistic] }));
    }
    try {
      const { message } = await api.sendMessage(channelId, {
        body,
        parentId: opts.parentId ?? null,
        attachments: opts.attachments || [],
        mentions: opts.mentions || [],
        clientId,
      });
      if (!opts.parentId) applyIncomingMessage(message);
      return message;
    } catch (e: any) {
      setMessages((prev) => ({
        ...prev,
        [channelId]: (prev[channelId] || []).map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)),
      }));
      toast({ title: 'Message not sent', body: e.message, tone: 'error' });
      return null;
    }
  }, [user, team?.id, applyIncomingMessage, toast]);

  const editMessage = useCallback(async (messageId: string, channelId: string, body: string) => {
    const { message } = await api.editMessage(messageId, body);
    setMessages((prev) => ({ ...prev, [channelId]: (prev[channelId] || []).map((m) => (m.id === message.id ? message : m)) }));
  }, []);

  const deleteMessage = useCallback(async (messageId: string, channelId: string) => {
    await api.deleteMessage(messageId);
    setMessages((prev) => ({ ...prev, [channelId]: (prev[channelId] || []).filter((m) => m.id !== messageId) }));
  }, []);

  const react = useCallback(async (messageId: string, channelId: string, emoji: string) => {
    const { message } = await api.react(messageId, emoji);
    setMessages((prev) => ({ ...prev, [channelId]: (prev[channelId] || []).map((m) => (m.id === message.id ? message : m)) }));
  }, []);

  const markChannelRead = useCallback((channelId: string) => {
    api.markRead(channelId).catch(() => undefined);
    setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, unread: 0 } : c)));
  }, []);

  const sendTyping = useCallback((channelId: string, active: boolean) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'typing', channelId, active }));
    }
  }, []);

  /* ------------------------------------------------------------- channels */

  const createChannel = useCallback(async (input: { name: string; topic?: string; isPrivate?: boolean; memberIds?: string[] }) => {
    if (!teamId) throw new Error('No team selected');
    const { channel } = await api.createChannel(teamId, input);
    setChannels((prev) => (prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]));
    toast({ title: `#${channel.name} created`, tone: 'success' });
    return channel;
  }, [teamId, toast]);

  const updateChannel = useCallback(async (channelId: string, input: { name?: string; topic?: string; archived?: boolean }) => {
    const { channel } = await api.updateChannel(channelId, input);
    setChannels((prev) => (input.archived && input.archived ? prev.filter((c) => c.id !== channelId) : prev.map((c) => (c.id === channel.id ? { ...c, ...channel } : c))));
  }, []);

  const addChannelMembers = useCallback(async (channelId: string, userIds: string[]) => {
    const { channel } = await api.addChannelMembers(channelId, userIds);
    setChannels((prev) => prev.map((c) => (c.id === channel.id ? { ...c, ...channel } : c)));
  }, []);

  /* ---------------------------------------------------------------- tasks */

  const createTask = useCallback(async (input: Partial<TaskItem> & { title: string }) => {
    if (!teamId) return;
    const { task } = await api.createTask(teamId, input);
    setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task]));
  }, [teamId]);

  const updateTask = useCallback(async (taskId: string, input: Partial<TaskItem>) => {
    const { task } = await api.updateTask(taskId, input);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    await api.deleteTask(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  /* ---------------------------------------------------------------- notes */

  const channelNotes = useCallback(async (channelId: string) => {
    const { notes } = await api.notes(channelId);
    return notes;
  }, []);

  const createNote = useCallback(async (channelId: string, input: { title?: string; body?: string }) => {
    const { note } = await api.createNote(channelId, input);
    return note;
  }, []);

  const updateNote = useCallback(async (noteId: string, input: { title?: string; body?: string }) => {
    const { note } = await api.updateNote(noteId, input);
    return note;
  }, []);

  /* ---------------------------------------------------------------- files */

  const channelFiles = useCallback(async (channelId: string) => {
    const { files } = await api.files(channelId);
    return files;
  }, []);

  /* ------------------------------------------------------------- meetings */

  const createCall = useCallback(async (input: { title?: string; channelId?: string | null; scheduledAt?: string | null }) => {
    if (!teamId) throw new Error('No team selected');
    const { call } = await api.createCall(teamId, input);
    setCalls((prev) => (prev.some((c) => c.id === call.id) ? prev : [call, ...prev]));
    return call;
  }, [teamId]);

  const updateCall = useCallback(async (callId: string, input: { status?: string }) => {
    const { call } = await api.updateCall(callId, input);
    setCalls((prev) => prev.map((c) => (c.id === call.id ? { ...c, ...call } : c)));
  }, []);

  /* -------------------------------------------------------------- profile */

  const updateProfile = useCallback(async (input: Partial<Pick<User, 'name' | 'title' | 'status' | 'statusText'>>) => {
    const { user: updated } = await api.updateMe(input);
    setUser(updated);
  }, []);

  const markNotificationsRead = useCallback(async () => {
    await api.markNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const can = useCallback((permission: string) => {
    if (team?.role === 'owner') return true;
    if (myPermissions.includes(permission)) return true;
    return false;
  }, [team?.role, myPermissions]);

  const unreadTotal = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value: AppState = {
    ready,
    user,
    token,
    teams,
    teamId,
    team,
    members,
    channels,
    permissionDefs,
    myPermissions,
    messages,
    tasks,
    calls,
    notifications,
    online,
    connection,
    typing,
    unreadTotal,
    theme,
    login,
    register,
    logout,
    setTheme,
    selectTeam,
    refreshTeam,
    createTeam,
    loadMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    react,
    markChannelRead,
    sendTyping,
    createChannel,
    updateChannel,
    addChannelMembers,
    createTask,
    updateTask,
    deleteTask,
    channelNotes,
    createNote,
    updateNote,
    channelFiles,
    createCall,
    updateCall,
    can,
    toast,
    toasts,
    dismissToast,
    refreshNotifications,
    markNotificationsRead,
    updateProfile,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
