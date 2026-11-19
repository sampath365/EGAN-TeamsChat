import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, CalendarClock, Hash, KanbanSquare, MessageSquare, Sparkles, Video, Users,
  TrendingUp, Clock, CheckCircle2, AlertTriangle, Plus, Search, ChevronRight,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn, dueLabel, timeAgo } from '@/lib/utils';
import { Avatar, Badge, EmptyState, IconButton, Modal } from '@/components/ui';

export function HomePage() {
  const { team, channels, members, tasks, calls, user, messages, online, createCall, toast, notifications } = useApp();
  const navigate = useNavigate();
  const [newMeeting, setNewMeeting] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const myTasks = useMemo(() => tasks.filter((t) => t.assigneeId === user?.id && t.status !== 'done'), [tasks, user?.id]);
  const openTasks = useMemo(() => tasks.filter((t) => t.status !== 'done'), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((t) => t.status === 'done'), [tasks]);
  const overdue = useMemo(() => openTasks.filter((t) => t.dueDate && new Date(`${t.dueDate}T23:59:59`).getTime() < Date.now()), [openTasks]);
  const liveCalls = calls.filter((c) => c.status === 'live');
  const upcoming = calls.filter((c) => c.status === 'scheduled');
  const recentChannels = useMemo(
    () => [...channels].sort((a, b) => (b.lastMessage?.createdAt || '').localeCompare(a.lastMessage?.createdAt || '')).slice(0, 5),
    [channels],
  );

  const startMeeting = async () => {
    setBusy(true);
    try {
      const call = await createCall({ title: meetingTitle || 'Instant meeting' });
      setNewMeeting(false);
      navigate(`/meeting/${call.id}`);
    } catch (e: any) {
      toast({ title: 'Could not start meeting', body: e.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        {/* hero */}
        <div className="relative overflow-hidden rounded-3xl p-5 text-white sm:p-7">
          <div className="absolute inset-0 grad-brand" />
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/70">{greeting}, {user?.name?.split(' ')[0]}</p>
              <h1 className="mt-1 text-[24px] font-black leading-tight sm:text-[30px]">{team?.name || 'Your workspace'}</h1>
              <p className="mt-1.5 max-w-lg text-[12.5px] leading-relaxed text-white/80">{team?.description || 'Pick a channel and get going.'}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setNewMeeting(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[12.5px] font-bold text-brand-700 transition hover:bg-white/90">
                  <Video size={14} /> Start a meeting
                </button>
                {channels[0] && (
                  <Link to={`/channel/${channels[0].id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3.5 py-2 text-[12.5px] font-bold backdrop-blur transition hover:bg-white/25">
                    <Hash size={14} /> Open #{channels[0].name}
                  </Link>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {[
                { label: 'Online', value: members.filter((m) => online.has(m.userId)).length, icon: <Users size={14} /> },
                { label: 'Open tasks', value: openTasks.length, icon: <KanbanSquare size={14} /> },
                { label: 'Meetings', value: liveCalls.length + upcoming.length, icon: <Video size={14} /> },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl bg-white/12 px-3 py-2 backdrop-blur-sm">
                  <div className="flex items-center gap-1 text-white/70">{s.icon}<span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span></div>
                  <p className="mt-0.5 text-[19px] font-black leading-none">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* live now */}
        {liveCalls.length > 0 && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 animate-pulse-ring" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <p className="text-[12.5px] font-bold text-emerald-800 dark:text-emerald-200">
                  {liveCalls.length} meeting{liveCalls.length === 1 ? '' : 's'} live now
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {liveCalls.map((c) => (
                <Link key={c.id} to={`/meeting/${c.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-[12px] font-bold text-emerald-700 shadow-soft dark:bg-emerald-500/20 dark:text-emerald-200">
                  <Video size={12} /> {c.title} <ChevronRight size={12} />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {/* left column */}
          <div className="space-y-4 lg:col-span-2">
            <Card title="Your channels" icon={<Hash size={14} />} action={<Link to="/tasks" className="text-[11.5px] font-bold text-brand-600 dark:text-brand-300">View tasks</Link>}>
              {recentChannels.length === 0 ? (
                <EmptyState title="No channels yet" body="Create one from the sidebar to get started." />
              ) : (
                <div className="space-y-1">
                  {recentChannels.map((c) => (
                    <Link key={c.id} to={`/channel/${c.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-ink-50 dark:hover:bg-white/[0.05]">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                        <Hash size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-bold">{c.name}</p>
                        <p className="truncate text-[11px] text-muted">
                          {c.lastMessage ? `${c.lastMessage.authorName}: ${c.lastMessage.body}` : c.topic || 'No messages yet'}
                        </p>
                      </div>
                      {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{c.unread}</span>}
                      <span className="shrink-0 text-[10.5px] text-muted">{c.lastMessage ? timeAgo(c.lastMessage.createdAt) : ''}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Your tasks" icon={<KanbanSquare size={14} />} action={<Link to="/tasks" className="text-[11.5px] font-bold text-brand-600 dark:text-brand-300">Open board</Link>}>
              {myTasks.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-muted">Nothing assigned to you right now 🎉</p>
              ) : (
                <div className="space-y-1.5">
                  {myTasks.slice(0, 5).map((t) => {
                    const due = dueLabel(t.dueDate);
                    return (
                      <div key={t.id} className="flex items-center gap-2.5 rounded-xl border px-2.5 py-2 bordered">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', t.priority === 'critical' ? 'bg-rose-500' : t.priority === 'high' ? 'bg-amber-500' : t.priority === 'medium' ? 'bg-brand-500' : 'bg-ink-400')} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-semibold">{t.title}</p>
                          <p className={cn('text-[10.5px]', due.tone === 'danger' ? 'font-semibold text-rose-500' : due.tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-muted')}>{due.text}</p>
                        </div>
                        <Badge tone={t.status === 'in_progress' ? 'brand' : t.status === 'review' ? 'violet' : 'neutral'}>{t.status.replace('_', ' ')}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* right column */}
          <div className="space-y-4">
            <Card title="Team pulse" icon={<TrendingUp size={14} />}>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Done" value={doneTasks.length} icon={<CheckCircle2 size={13} />} tone="green" />
                <Stat label="Open" value={openTasks.length} icon={<Clock size={13} />} tone="brand" />
                <Stat label="Overdue" value={overdue.length} icon={<AlertTriangle size={13} />} tone={overdue.length ? 'rose' : 'neutral'} />
                <Stat label="Unread" value={notifications.filter((n) => !n.read).length} icon={<MessageSquare size={13} />} tone="violet" />
              </div>
            </Card>

            <Card title="Meetings" icon={<Video size={14} />} action={<Link to="/meetings" className="text-[11.5px] font-bold text-brand-600 dark:text-brand-300">All</Link>}>
              {upcoming.length === 0 && liveCalls.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-[12px] text-muted">No meetings scheduled.</p>
                  <button type="button" onClick={() => setNewMeeting(true)} className="btn-soft mt-2.5 text-[12px]"><Plus size={13} /> Schedule one</button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[...liveCalls, ...upcoming].slice(0, 4).map((c) => (
                    <Link key={c.id} to={`/meeting/${c.id}`} className="flex items-center gap-2 rounded-xl px-1.5 py-1.5 transition hover:bg-ink-50 dark:hover:bg-white/[0.05]">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Video size={13} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold">{c.title}</p>
                        <p className="text-[10.5px] text-muted">{c.status === 'live' ? 'Live now' : c.scheduledAt ? new Date(c.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Scheduled'}</p>
                      </div>
                      {c.status === 'live' && <Badge tone="green">live</Badge>}
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card title="People" icon={<Users size={14} />} action={<Link to="/people" className="text-[11.5px] font-bold text-brand-600 dark:text-brand-300">All</Link>}>
              <div className="space-y-1">
                {members.slice(0, 6).map((m) => (
                  <div key={m.userId} className="flex items-center gap-2 rounded-lg px-1 py-1">
                    <Avatar name={m.user.name} color={m.user.avatarColor} size={26} online={online.has(m.userId)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold">{m.user.name}</p>
                      <p className="truncate text-[10.5px] text-muted">{m.user.title || m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={newMeeting}
        onClose={() => setNewMeeting(false)}
        title="Start a meeting"
        subtitle="Audio, video and screen sharing are included."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setNewMeeting(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void startMeeting()}>
              <Video size={15} /> {busy ? 'Starting…' : 'Start now'}
            </button>
          </>
        }
      >
        <label className="label">Meeting title</label>
        <input className="input" autoFocus value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} placeholder="Daily standup" />
        <p className="mt-3 text-[11.5px] text-muted">Everyone in {team?.name} gets notified and can join from the Meetings tab.</p>
      </Modal>
    </div>
  );
}

function Card({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[12.5px] font-bold">
          <span className="text-brand-600 dark:text-brand-300">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'green' | 'brand' | 'rose' | 'violet' | 'neutral' }) {
  const tones: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    neutral: 'bg-ink-100 text-ink-600 dark:bg-white/10 dark:text-ink-300',
  };
  return (
    <div className={cn('rounded-xl px-2.5 py-2', tones[tone])}>
      <div className="flex items-center gap-1 opacity-80">{icon}<span className="text-[10px] font-bold uppercase tracking-wide">{label}</span></div>
      <p className="mt-0.5 text-[17px] font-black leading-none">{value}</p>
    </div>
  );
}
