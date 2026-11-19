import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, CalendarClock, ChevronDown, Hash, KanbanSquare, Lock, LogOut, MessageSquarePlus, Moon,
  Plus, Search, Settings, Sun, Users, Video, CheckSquare, FolderOpen, StickyNote, Sparkles, X,
  Network, WifiOff, BarChart3, BellOff, CalendarDays, PanelLeftClose,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Avatar, Badge, IconButton } from './ui';

export function Sidebar({
  onOpenPalette, onClose, onCollapse, mobile,
}: {
  onOpenPalette: () => void;
  onClose?: () => void;
  onCollapse?: () => void;
  mobile?: boolean;
}) {
  const {
    teams, teamId, team, channels, members, selectTeam, createTeam, createChannel, can, logout, user,
    notifications, unreadTotal, theme, setTheme, online, refreshNotifications, markNotificationsRead,
    connection, dms, hiddenPeople,
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [teamMenu, setTeamMenu] = useState(false);
  const [newChannel, setNewChannel] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelTopic, setChannelTopic] = useState('');
  const [privateCh, setPrivateCh] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => { void refreshNotifications(); }, [refreshNotifications]);

  const publicChannels = useMemo(() => channels.filter((c) => !c.isPrivate && c.kind !== 'dm' && !c.hidden), [channels]);
  const privateChannels = useMemo(() => channels.filter((c) => c.isPrivate && c.kind !== 'dm' && !c.hidden), [channels]);
  const visibleDms = useMemo(() => dms.filter((d) => !d.channel.hidden), [dms]);

  const go = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const submitChannel = async () => {
    if (!channelName.trim()) return;
    setCreating(true);
    try {
      const ch = await createChannel({ name: channelName, topic: channelTopic, isPrivate: privateCh });
      setNewChannel(false);
      setChannelName('');
      setChannelTopic('');
      setPrivateCh(false);
      go(`/channel/${ch.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside className={cn('flex h-full w-[286px] shrink-0 flex-col border-r bg-[rgb(var(--surface))] bordered', mobile && 'w-full')}>
      {/* team switcher */}
      <div className="relative px-3 pt-3">
        <button
          type="button"
          onClick={() => setTeamMenu((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition hover:bg-ink-50 dark:hover:bg-white/[0.05] bordered"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-black text-white grad-brand">
            {team?.name?.slice(0, 2).toUpperCase() || 'EP'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold">{team?.name || 'Select a team'}</span>
            <span className="block truncate text-[11px] text-muted">
              {team?.role ? `${team.role} · ${team.memberCount} member${team.memberCount === 1 ? '' : 's'}` : 'No team'}
            </span>
          </span>
          <ChevronDown size={15} className={cn('shrink-0 text-muted transition', teamMenu && 'rotate-180')} />
        </button>

        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide sidebar"
            title="Hide sidebar (⌘B)"
            className="absolute -right-1 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg border bg-[rgb(var(--surface))] text-muted shadow-soft transition hover:text-ink-800 dark:hover:text-ink-100 lg:flex bordered"
          >
            <PanelLeftClose size={13} />
          </button>
        )}

        {teamMenu && (
          <>
            <button type="button" aria-label="close" className="fixed inset-0 z-20" onClick={() => setTeamMenu(false)} />
            <div className="absolute left-3 right-3 top-[62px] z-30 overflow-hidden rounded-xl border bg-[rgb(var(--surface))] py-1 shadow-lift animate-scale-in bordered">
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">Your teams</p>
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { selectTeam(t.id); setTeamMenu(false); go(`/team/${t.id}`); }}
                  className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] font-semibold transition hover:bg-ink-100 dark:hover:bg-white/[0.06]', t.id === teamId && 'text-brand-600 dark:text-brand-300')}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: t.avatarColor }} />
                  <span className="flex-1 truncate">{t.name}</span>
                  {t.id === teamId && <span className="text-[10px] text-muted">current</span>}
                </button>
              ))}
              <div className="my-1 h-px bg-[rgb(var(--border))]" />
              <button
                type="button"
                onClick={async () => {
                  setTeamMenu(false);
                  const name = window.prompt('Name your new team');
                  if (name) await createTeam(name);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] font-semibold text-brand-600 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
              >
                <Plus size={13} /> Create a team
              </button>
            </div>
          </>
        )}
      </div>

      <div className="px-3 py-2.5">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex w-full items-center gap-2 rounded-xl border bg-[rgb(var(--surface-2))] px-2.5 py-2 text-[12.5px] text-muted transition hover:border-brand-300 bordered"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="rounded border px-1 py-0.5 text-[10px] font-bold bordered">⌘K</kbd>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <Section label="Activity">
          <NavItem to="/home" icon={<Sparkles size={15} />} label="Home" active={location.pathname === '/home'} onClick={onClose} />
          <NavItem to="/threads" icon={<MessageSquarePlus size={15} />} label="Threads" onClick={onClose} />
          <NavItem to="/meetings" icon={<Video size={15} />} label="Meetings" onClick={onClose} />
          <NavItem to="/tasks" icon={<KanbanSquare size={15} />} label="Tasks" onClick={onClose} />
          <NavItem to="/people" icon={<Users size={15} />} label="People" badge={members.length} onClick={onClose} />
          <NavItem to="/org" icon={<Network size={15} />} label="Company hierarchy" onClick={onClose} />
          <NavItem to="/calendar" icon={<CalendarDays size={15} />} label="Calendar" onClick={onClose} />
          <NavItem to="/reports" icon={<BarChart3 size={15} />} label="Reports" onClick={onClose} />
        </Section>

        <div className="mb-1 mt-3 flex items-center justify-between px-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted">Channels</span>
          {can('channel.manage') && (
            <button type="button" onClick={() => setNewChannel(true)} title="New channel" className="text-muted transition hover:text-brand-600">
              <Plus size={14} />
            </button>
          )}
        </div>

        {publicChannels.map((c) => (
          <ChannelItem key={c.id} id={c.id} name={c.name} unread={c.unread} muted={c.muted} active={location.pathname === `/channel/${c.id}`} onClick={onClose} />
        ))}

        {visibleDms.length > 0 && (
          <>
            <p className="mb-1 mt-3 flex items-center justify-between px-2 text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted">
              Direct messages
              <span className="rounded-full bg-ink-100 px-1.5 text-[9.5px] dark:bg-white/10">{visibleDms.length}</span>
            </p>
            {visibleDms.map((dm) => (
              <Link
                key={dm.channel.id}
                to={`/channel/${dm.channel.id}`}
                onClick={onClose}
                className={cn(
                  'group flex items-center gap-2 rounded-xl px-2 py-[6px] text-[13px] transition',
                  location.pathname === `/channel/${dm.channel.id}`
                    ? 'bg-brand-50 font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                    : dm.channel.unread > 0
                      ? 'font-bold text-ink-900 hover:bg-ink-100 dark:text-white dark:hover:bg-white/[0.06]'
                      : 'font-medium text-ink-600 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-white/[0.06]',
                )}
              >
                <Avatar name={dm.partner?.name || 'Unknown'} color={dm.partner?.avatarColor} size={22} online={online.has(dm.partner?.id || '')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{dm.partner?.name || 'Unknown'}</span>
                  {dm.partner?.position && <span className="block truncate text-[10px] font-normal text-muted">{dm.partner.position}</span>}
                </span>
                {dm.channel.muted ? (
                  <BellOff size={11} className="shrink-0 text-muted" />
                ) : dm.channel.unread > 0 ? (
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {dm.channel.unread > 99 ? '99+' : dm.channel.unread}
                  </span>
                ) : null}
              </Link>
            ))}
          </>
        )}

        {privateChannels.length > 0 && (
          <>
            <p className="mb-1 mt-3 px-2 text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted">Private</p>
            {privateChannels.map((c) => (
              <ChannelItem key={c.id} id={c.id} name={c.name} unread={c.unread} muted={c.muted} active={location.pathname === `/channel/${c.id}`} locked onClick={onClose} />
            ))}
          </>
        )}

        {channels.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-muted">No channels yet.</p>
        )}
      </nav>

      {connection !== 'online' && (
        <div className="mx-2 mb-1 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[10.5px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          <WifiOff size={11} className="shrink-0" />
          {connection === 'connecting' ? 'Connecting to live updates…' : 'Reconnecting — messages may be delayed'}
        </div>
      )}

      {/* footer */}
      <div className="relative border-t p-2.5 bordered">
        {notifOpen && (
          <>
            <button type="button" aria-label="close" className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />
            <div className="absolute bottom-[74px] left-2 right-2 z-30 max-h-80 overflow-y-auto rounded-xl border bg-[rgb(var(--surface))] shadow-lift animate-scale-in bordered">
              <div className="sticky top-0 flex items-center justify-between border-b bg-[rgb(var(--surface))] px-3 py-2 bordered">
                <span className="text-[12px] font-bold">Notifications</span>
                <button type="button" onClick={() => { void markNotificationsRead(); }} className="text-[11px] font-semibold text-brand-600">Mark all read</button>
              </div>
              {notifications.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-muted">You’re all caught up 🎉</p>}
              {notifications.map((n) => (
                <Link key={n.id} to={n.link.replace(/^#/, '')} onClick={() => setNotifOpen(false)}
                  className={cn('block border-b px-3 py-2 text-left transition last:border-0 hover:bg-ink-50 dark:hover:bg-white/[0.05] bordered', !n.read && 'bg-brand-50/50 dark:bg-brand-500/10')}>
                  <p className="text-[12px] font-bold">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted">{n.body}</p>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go('/profile')} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1.5 text-left transition hover:bg-ink-100 dark:hover:bg-white/[0.06]">
            <Avatar name={user?.name || 'You'} color={user?.avatarColor} size={30} online={!!user && online.has(user.id)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-bold">{user?.name}</span>
              <span className="block truncate text-[10.5px] text-muted">{user?.statusText || user?.title || 'Available'}</span>
            </span>
          </button>
          <IconButton label="Notifications" onClick={() => setNotifOpen((v) => !v)} badge={unreadTotal}>
            <Bell size={16} />
          </IconButton>
          <IconButton label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
          <IconButton label="Settings" onClick={() => go('/settings')}>
            <Settings size={16} />
          </IconButton>
          <IconButton label="Sign out" tone="danger" onClick={() => { logout(); navigate('/login'); }}>
            <LogOut size={16} />
          </IconButton>
        </div>
      </div>

      {/* new channel modal */}
      {newChannel && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
          <button type="button" aria-label="close" className="absolute inset-0 bg-ink-950/60 backdrop-blur-[2px] animate-fade-in" onClick={() => setNewChannel(false)} />
          <div className="relative w-full rounded-t-3xl border bg-[rgb(var(--surface))] p-5 shadow-lift animate-slide-up sm:max-w-md sm:rounded-3xl bordered">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-bold">Create a channel</h3>
              <IconButton label="Close" onClick={() => setNewChannel(false)}><X size={16} /></IconButton>
            </div>
            <label className="label">Channel name</label>
            <input className="input" autoFocus value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="e.g. product-launch" />
            <label className="label mt-3">Topic (optional)</label>
            <input className="input" value={channelTopic} onChange={(e) => setChannelTopic(e.target.value)} placeholder="What is this channel about?" />
            <label className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold">
              <input type="checkbox" checked={privateCh} onChange={(e) => setPrivateCh(e.target.checked)} className="h-4 w-4 rounded" />
              <Lock size={13} /> Make it private
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setNewChannel(false)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={!channelName.trim() || creating} onClick={() => void submitChannel()}>
                {creating ? 'Creating…' : 'Create channel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="mb-1 px-2 text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted">{label}</p>
      {children}
    </div>
  );
}

function NavItem({ to, icon, label, badge, active, onClick }: { to: string; icon: React.ReactNode; label: string; badge?: number; active?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) => cn(
        'flex items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[13px] font-semibold transition',
        isActive || active
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
          : 'text-ink-700 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.06]',
      )}
    >
      <span className="text-current opacity-80">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {!!badge && <Badge tone="neutral">{badge}</Badge>}
    </NavLink>
  );
}

function ChannelItem({ id, name, unread, active, locked, muted, onClick }: { id: string; name: string; unread: number; active?: boolean; locked?: boolean; muted?: boolean; onClick?: () => void }) {
  return (
    <Link
      to={`/channel/${id}`}
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2 rounded-xl px-2.5 py-[6.5px] text-[13px] transition',
        active
          ? 'bg-brand-50 font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
          : unread > 0
            ? 'font-bold text-ink-900 hover:bg-ink-100 dark:text-white dark:hover:bg-white/[0.06]'
            : 'font-medium text-ink-600 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-white/[0.06]',
      )}
    >
      {locked ? <Lock size={13} className="shrink-0 opacity-70" /> : <Hash size={14} className="shrink-0 opacity-60" />}
      <span className="flex-1 truncate">{name}</span>
      {muted ? (
        <BellOff size={11} className="shrink-0 text-muted" />
      ) : unread > 0 ? (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}

export { CheckSquare, FolderOpen, StickyNote, CalendarClock };
