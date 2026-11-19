import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarClock, CalendarDays, Clock, Copy, Monitor, Plus, Radio, Trash2, Users, Video, X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { CallRow } from '@/lib/types';
import { cn, copyText, timeAgo } from '@/lib/utils';
import { Avatar, Badge, EmptyState, IconButton, Modal, Tabs } from '@/components/ui';

export function MeetingsPage() {
  const { calls, members, user, createCall, updateCall, can, toast, online } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'upcoming' | 'live' | 'past'>('upcoming');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);

  const live = calls.filter((c) => c.status === 'live');
  const upcoming = calls.filter((c) => c.status === 'scheduled');
  const past = calls.filter((c) => c.status === 'ended');
  const list = tab === 'live' ? live : tab === 'past' ? past : upcoming;

  const start = async () => {
    setBusy(true);
    try {
      const call = await createCall({ title: title || 'Instant meeting', scheduledAt: when ? new Date(when).toISOString() : null });
      setOpen(false);
      setTitle('');
      setWhen('');
      if (call.status === 'live') navigate(`/meeting/${call.id}`);
      else toast({ title: 'Meeting scheduled', body: new Date(when).toLocaleString(), tone: 'success' });
    } catch (e: any) {
      toast({ title: 'Could not create meeting', body: e.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[20px] font-black">Meetings</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">Audio, video, screen sharing and participant tiles.</p>
          </div>
          {can('meeting.host') && (
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              <Plus size={15} /> New meeting
            </button>
          )}
        </div>

        <div className="mb-4">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'upcoming', label: 'Upcoming', icon: <CalendarDays size={13} />, badge: upcoming.length },
              { key: 'live', label: 'Live now', icon: <Radio size={13} />, badge: live.length },
              { key: 'past', label: 'Past', icon: <Clock size={13} />, badge: past.length },
            ]}
          />
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={<Video size={20} />}
            title={tab === 'live' ? 'No meetings running' : tab === 'past' ? 'No past meetings' : 'Nothing scheduled'}
            body={tab === 'upcoming' ? 'Start an instant meeting or schedule one for later.' : undefined}
            action={can('meeting.host') && tab === 'upcoming' ? <button type="button" className="btn-soft" onClick={() => setOpen(true)}><Plus size={14} /> New meeting</button> : undefined}
          />
        ) : (
          <div className="space-y-2">
            {list.map((c) => {
              const host = c.host || members.find((m) => m.userId === c.hostId)?.user;
              return (
                <div key={c.id} className={cn('card flex flex-wrap items-center gap-3 p-3.5', c.status === 'live' && 'border-emerald-300 dark:border-emerald-500/30')}>
                  <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', c.status === 'live' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300')}>
                    <Video size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[13.5px] font-bold">{c.title}</p>
                      {c.status === 'live' && <Badge tone="green">live</Badge>}
                      {c.status === 'scheduled' && <Badge tone="brand">scheduled</Badge>}
                      {c.status === 'ended' && <Badge tone="neutral">ended</Badge>}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                      {host && <span className="flex items-center gap-1"><Avatar name={host.name} color={host.avatarColor} size={14} /> {host.name}</span>}
                      <span>·</span>
                      <span>
                        {c.status === 'scheduled' && c.scheduledAt
                          ? new Date(c.scheduledAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                          : c.status === 'live'
                            ? `Started ${timeAgo(c.startedAt || c.createdAt)}`
                            : `Ended ${timeAgo(c.endedAt || c.createdAt)}`}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <IconButton
                      label="Copy invite link"
                      onClick={async () => {
                        const ok = await copyText(`${window.location.origin}/#/meeting/${c.id}`);
                        toast({ title: ok ? 'Invite copied' : 'Copy failed', tone: ok ? 'success' : 'error' });
                      }}
                    >
                      <Copy size={15} />
                    </IconButton>
                    {c.status !== 'ended' ? (
                      <Link to={`/meeting/${c.id}`} className="btn-primary h-8 px-3 text-[12px]">
                        {c.status === 'live' ? 'Join now' : 'Start'}
                      </Link>
                    ) : (
                      <span className="text-[11px] text-muted">{c.participants?.length || 0} attended</span>
                    )}
                    {c.hostId === user?.id && c.status !== 'ended' && (
                      <IconButton label="End meeting" tone="danger" onClick={() => void updateCall(c.id, { status: 'ended' })}>
                        <X size={15} />
                      </IconButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 rounded-2xl border bg-[rgb(var(--surface-2))] p-4 bordered">
          <h2 className="flex items-center gap-1.5 text-[12.5px] font-bold"><Monitor size={14} className="text-brand-600 dark:text-brand-300" /> Meeting features</h2>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Screen sharing', body: 'Share a tab, window or your whole screen.' },
              { title: 'Participant tiles', body: 'Grid or spotlight layout, auto-sized.' },
              { title: 'Mute & camera', body: 'Toggle per person, raise a hand to speak.' },
              { title: 'In-call chat', body: 'Send links and notes without leaving.' },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border bg-[rgb(var(--surface))] p-3 bordered">
                <p className="text-[12px] font-bold">{f.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New meeting"
        subtitle="Leave the time blank to start immediately."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void start()}>
              <Video size={15} /> {busy ? 'Creating…' : when ? 'Schedule' : 'Start now'}
            </button>
          </>
        }
      >
        <label className="label">Title</label>
        <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sprint planning" />
        <label className="label mt-3">Start time (optional)</label>
        <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
      </Modal>
    </div>
  );
}
