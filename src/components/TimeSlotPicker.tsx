import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Sparkles, Users, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Avatar, Badge, Spinner } from './ui';

interface SlotInfo {
  start: string;
  end: string;
  busyUserIds: string[];
  freeCount: number;
  total: number;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DURATIONS = [15, 30, 45, 60, 90];

export function TimeSlotPicker({
  open, onClose, invitees, duration, onPick,
}: {
  open: boolean;
  onClose: () => void;
  invitees: string[];
  duration: number;
  onPick: (isoStart: string, minutes: number) => void;
}) {
  const { team, members, user, toast } = useApp();
  const [day, setDay] = useState(() => new Date());
  const [minutes, setMinutes] = useState(duration || 30);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [people, setPeople] = useState<{ user: User; busy: { start: number; end: number; title: string }[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<{ start: string; label: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showWho, setShowWho] = useState(false);

  // Everyone invited, plus you — the slot is only useful if it suits you too.
  const attendeeIds = useMemo(() => {
    const ids = invitees.length > 0 ? [...invitees] : members.map((m) => m.userId);
    if (user?.id && !ids.includes(user.id)) ids.push(user.id);
    return ids;
  }, [invitees, members, user?.id]);

  // Seven days starting from the selected day's week start, Teams-style strip.
  const week = useMemo(() => {
    const start = new Date(day);
    start.setDate(start.getDate() - 3);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [day]);

  useEffect(() => {
    if (!open || !team) return;
    setLoading(true);
    setSelected(null);
    api.availability(team.id, isoDay(day), minutes, attendeeIds)
      .then((res) => {
        setSlots(res.slots);
        setPeople(res.people);
      })
      .catch((e) => toast({ title: 'Could not load availability', body: e.message, tone: 'error' }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team?.id, day, minutes, attendeeIds.join(',')]);

  useEffect(() => {
    if (!open || !team) return;
    api.suggestSlots(team.id, attendeeIds, minutes, 10)
      .then(({ suggestions: rows }) => setSuggestions(rows))
      .catch(() => setSuggestions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team?.id, minutes, attendeeIds.join(',')]);

  if (!open) return null;

  const now = Date.now();
  const isPast = (iso: string) => new Date(iso).getTime() < now;
  const allFree = slots.filter((s) => s.freeCount === s.total && !isPast(s.start));

  const pick = (iso: string) => {
    onPick(iso, minutes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Pick a time">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink-950/55 backdrop-blur-[3px] animate-fade-in" />
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border bg-[rgb(var(--surface))] shadow-lift animate-slide-up sm:max-w-2xl sm:rounded-3xl bordered">
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 bordered">
          <div>
            <h2 className="flex items-center gap-1.5 text-[15px] font-bold">
              <CalendarDays size={15} className="text-brand-600 dark:text-brand-300" /> Pick a time
            </h2>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {attendeeIds.length} {attendeeIds.length === 1 ? 'person' : 'people'} · times shown where everyone is free
            </p>
          </div>
          <div className="flex items-center gap-1">
            <select
              className="input h-8 py-0 text-[11.5px]"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              aria-label="Meeting length"
            >
              {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-ink-100 dark:hover:bg-white/10">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* suggested times */}
          {suggestions.length > 0 && (
            <div className="border-b px-4 py-2.5 bordered">
              <p className="mb-1.5 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-muted">
                <Sparkles size={10} className="text-brand-500" /> Suggested times
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => pick(s.start)}
                    className="rounded-lg border border-brand-200 bg-brand-50/70 px-2 py-1 text-[11px] font-bold text-brand-700 transition hover:border-brand-400 dark:border-brand-400/30 dark:bg-brand-500/15 dark:text-brand-200"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* day strip */}
          <div className="flex items-center gap-1 border-b px-2 py-2 bordered">
            <button type="button" aria-label="Previous days" onClick={() => { const d = new Date(day); d.setDate(d.getDate() - 7); setDay(d); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink-100 dark:hover:bg-white/10">
              <ChevronLeft size={15} />
            </button>
            <div className="flex min-w-0 flex-1 gap-1">
              {week.map((d) => {
                const active = isoDay(d) === isoDay(day);
                const today = isoDay(d) === isoDay(new Date());
                return (
                  <button
                    key={isoDay(d)}
                    type="button"
                    onClick={() => setDay(d)}
                    className={cn(
                      'flex min-w-0 flex-1 flex-col items-center rounded-xl px-1 py-1.5 transition',
                      active ? 'bg-brand-600 text-white' : 'text-muted hover:bg-ink-100 dark:hover:bg-white/[0.06]',
                    )}
                  >
                    <span className="text-[9.5px] font-bold uppercase">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    <span className={cn('text-[14px] font-extrabold leading-tight', !active && today && 'text-brand-600 dark:text-brand-300')}>{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" aria-label="Next days" onClick={() => { const d = new Date(day); d.setDate(d.getDate() + 7); setDay(d); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink-100 dark:hover:bg-white/10">
              <ChevronRight size={15} />
            </button>
          </div>

          {/* slot grid */}
          <div className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11.5px] font-semibold">
                {day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-[10.5px] text-muted">{allFree.length} free · {slots.length} slots</p>
            </div>

            {loading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : slots.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-muted">No working hours on this day.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {slots.map((s) => {
                  const past = isPast(s.start);
                  const free = s.freeCount === s.total;
                  const partial = s.freeCount > 0 && !free;
                  const isSel = selected === s.start;
                  return (
                    <button
                      key={s.start}
                      type="button"
                      disabled={past}
                      onClick={() => setSelected(s.start)}
                      onDoubleClick={() => !past && pick(s.start)}
                      className={cn(
                        'rounded-xl border px-1.5 py-1.5 text-center transition bordered',
                        past && 'cursor-not-allowed opacity-35',
                        isSel
                          ? 'border-brand-500 bg-brand-600 text-white'
                          : free
                            ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:border-emerald-400 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                            : partial
                              ? 'border-amber-200 bg-amber-50/50 text-amber-800 hover:border-amber-400 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                              : 'border-[rgb(var(--border))] text-muted',
                      )}
                    >
                      <span className="block text-[12px] font-bold leading-tight">
                        {new Date(s.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span className={cn('block text-[9px] font-semibold', isSel ? 'text-white/80' : 'opacity-75')}>
                        {free ? 'everyone free' : partial ? `${s.freeCount}/${s.total} free` : 'busy'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {allFree.length === 0 && !loading && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                Nobody is free on this day. Try another day, or pick a slot with a partial match and the invitees will see it as tentative.
              </p>
            )}
          </div>

          {/* who is busy */}
          <div className="border-t px-4 py-2.5 bordered">
            <button type="button" onClick={() => setShowWho((v) => !v)} className="flex w-full items-center justify-between text-[11.5px] font-bold text-muted">
              <span className="flex items-center gap-1"><Users size={11} /> Availability by person</span>
              <span>{showWho ? 'Hide' : 'Show'}</span>
            </button>
            {showWho && (
              <div className="mt-2 space-y-1">
                {people.map((p) => (
                  <div key={p.user.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                    <Avatar name={p.user.name} color={p.user.avatarColor} size={20} />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold">{p.user.name}</span>
                    {p.busy.length === 0
                      ? <Badge tone="green">free all day</Badge>
                      : <span className="truncate text-[10px] text-muted">
                        {p.busy.map((b) => new Date(b.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })).join(', ')}
                      </span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 border-t px-4 py-3 bordered">
          <p className="text-[11px] text-muted">
            {selected
              ? new Date(selected).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : 'Tap a slot to select it'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!selected} onClick={() => selected && pick(selected)}>
              <Check size={14} /> Use this time
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
