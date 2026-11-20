import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarClock, CalendarDays, Clock, Copy, Mail, Monitor, Plus, Radio, Trash2, Users, Video, X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { CallRow } from '@/lib/types';
import { cn, copyText, timeAgo } from '@/lib/utils';
import { Avatar, Badge, EmptyState, IconButton, Modal, Tabs } from '@/components/ui';
import { TimeSlotPicker } from '@/components/TimeSlotPicker';

export function MeetingsPage() {
  const { calls, members, user, createCall, updateCall, can, toast, online } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'upcoming' | 'live' | 'past'>('upcoming');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [description, setDescription] = useState('');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [reminders, setReminders] = useState<number[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState(30);
  const [slotOpen, setSlotOpen] = useState(false);

  const REMINDER_CHOICES = [0, 5, 10, 30, 60];

  const live = calls.filter((c) => c.status === 'live');
  const upcoming = calls.filter((c) => c.status === 'scheduled');
  const past = calls.filter((c) => c.status === 'ended');
  const list = tab === 'live' ? live : tab === 'past' ? past : upcoming;

  const start = async () => {
    setBusy(true);
    try {
      const call = await createCall({
        title: title || 'Instant meeting',
        scheduledAt: when ? new Date(when).toISOString() : null,
        description,
        inviteeIds: invitees.length > 0 ? invitees : null,
        reminders: when ? reminders : [],
        sendEmail: !!when && sendEmail && invitees.length > 0,
        durationMinutes: duration,
      });
      setOpen(false);
      setTitle('');
      setWhen('');
      setDescription('');
      setInvitees([]);
      if (call.status === 'live') {
        navigate(`/meeting/${call.id}`);
      } else {
        toast({ title: 'Meeting scheduled', body: new Date(when).toLocaleString(), tone: 'success' });
      }
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

        <label className="label mt-3">When</label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSlotOpen(true)}
            className="input flex flex-1 items-center gap-2 text-left"
          >
            <CalendarClock size={14} className="shrink-0 text-brand-600 dark:text-brand-300" />
            <span className={cn('min-w-0 flex-1 truncate', !when && 'text-muted')}>
              {when
                ? new Date(when).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                : 'Find a time that works for everyone'}
            </span>
            <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
              {duration} min
            </span>
          </button>
          {when && (
            <IconButton label="Clear the time" onClick={() => setWhen('')}><X size={14} /></IconButton>
          )}
        </div>
        <p className="mt-1 text-[10.5px] text-muted">
          Leave blank to start immediately. The picker only offers slots where everyone invited is free.
        </p>

        <label className="label mt-3">Agenda (optional)</label>
        <textarea className="input min-h-[56px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What we will cover" />

        <label className="label mt-3">Invite</label>
        <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-xl border p-1.5 bordered">
          {members.filter((m) => m.userId !== user?.id).map((m) => (
            <label key={m.userId} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-ink-50 dark:hover:bg-white/[0.05]">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded"
                checked={invitees.includes(m.userId)}
                onChange={(e) => setInvitees((prev) => (e.target.checked ? [...prev, m.userId] : prev.filter((id) => id !== m.userId)))}
              />
              <Avatar name={m.user.name} color={m.user.avatarColor} size={20} />
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{m.user.name}</span>
              <span className="truncate text-[10px] text-muted">{m.user.position || ''}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-[10.5px] text-muted">Leave everyone unticked to ring the whole team.</p>

        {!!when && (
          <>
            <label className="label mt-3">Remind invitees</label>
            <p className="mb-1.5 text-[10.5px] text-muted">
              {reminders.length === 0
                ? 'No reminders — the meeting is on the calendar only.'
                : `${reminders.length} reminder${reminders.length === 1 ? '' : 's'} set.`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_CHOICES.map((mins) => {
                const on = reminders.includes(mins);
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setReminders((prev) => (on ? prev.filter((m) => m !== mins) : [...prev, mins].sort((a, b) => a - b)))}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-[11px] font-bold transition bordered',
                      on ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200' : 'text-muted hover:bg-ink-50 dark:hover:bg-white/[0.05]',
                    )}
                  >
                    {mins === 0 ? 'At start' : `${mins} min before`}
                  </button>
                );
              })}
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
              <input type="checkbox" className="h-4 w-4 rounded" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              <Mail size={13} /> Email the invite so they can accept
            </label>
          </>
        )}
      </Modal>

      <TimeSlotPicker
        open={slotOpen}
        onClose={() => setSlotOpen(false)}
        invitees={invitees}
        duration={duration}
        onPick={(iso, minutes) => {
          setWhen(iso.slice(0, 16));
          setDuration(minutes);
        }}
      />
    </div>
  );
}
