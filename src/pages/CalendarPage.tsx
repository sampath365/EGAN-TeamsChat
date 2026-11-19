import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, KanbanSquare, Palmtree, Plus, Users, Video,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { CalendarEvent } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { Avatar, Badge, EmptyState, IconButton, Modal, Spinner, Tabs } from '@/components/ui';

const KIND_META = {
  meeting: { label: 'Meeting', icon: <Video size={11} />, tone: 'brand' as const, dot: 'bg-brand-500' },
  task: { label: 'Task due', icon: <KanbanSquare size={11} />, tone: 'amber' as const, dot: 'bg-amber-500' },
  ooo: { label: 'Out of office', icon: <Palmtree size={11} />, tone: 'violet' as const, dot: 'bg-violet-500' },
};

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function CalendarPage() {
  const { team, toast, members, online } = useApp();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(new Date());
  const [filter, setFilter] = useState<'all' | 'meeting' | 'task' | 'ooo'>('all');
  const [detail, setDetail] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    if (!team) return;
    setLoading(true);
    api.calendar(team.id)
      .then(({ events: rows }) => setEvents(rows))
      .catch((e) => toast({ title: 'Could not load the calendar', body: e.message, tone: 'error' }))
      .finally(() => setLoading(false));
  }, [team?.id, toast]);

  const filtered = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.kind === filter)),
    [events, filter],
  );

  // Build the month grid: 6 weeks so the layout never jumps between months.
  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const startWeekday = first.getDay();
    const start = new Date(first);
    start.setDate(first.getDate() - startWeekday);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      const key = isoDay(new Date(e.at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filtered]);

  const selectedEvents = useMemo(
    () => eventsByDay.get(isoDay(selected)) || [],
    [eventsByDay, selected],
  );

  const upcoming = useMemo(
    () => filtered
      .filter((e) => new Date(e.at).getTime() >= Date.now() - 86400000)
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(0, 8),
    [filtered],
  );

  const counts = useMemo(() => ({
    meeting: events.filter((e) => e.kind === 'meeting').length,
    task: events.filter((e) => e.kind === 'task').length,
    ooo: events.filter((e) => e.kind === 'ooo').length,
  }), [events]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-[20px] font-black">
              <CalendarDays size={19} className="text-brand-600 dark:text-brand-300" />
              Calendar
            </h1>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {counts.meeting} meetings · {counts.task} task due dates · {counts.ooo} out of office
            </p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft size={16} />
            </IconButton>
            <button type="button" onClick={() => { setCursor(startOfMonth(new Date())); setSelected(new Date()); }} className="btn-outline h-9 px-3 text-[12px]">
              Today
            </button>
            <IconButton label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-extrabold">{monthLabel}</h2>
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { key: 'all', label: 'All', icon: <CalendarDays size={12} /> },
              { key: 'meeting', label: 'Meetings', icon: <Video size={12} />, badge: counts.meeting },
              { key: 'task', label: 'Tasks', icon: <KanbanSquare size={12} />, badge: counts.task },
              { key: 'ooo', label: 'Out of office', icon: <Palmtree size={12} />, badge: counts.ooo },
            ]}
          />
        </div>

        {loading ? (
          <div className="skeleton h-80" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            {/* month grid */}
            <div className="overflow-hidden rounded-2xl border bordered">
              <div className="grid grid-cols-7 border-b bg-[rgb(var(--surface-2))] bordered">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {grid.map((day, i) => {
                  const key = isoDay(day);
                  const dayEvents = eventsByDay.get(key) || [];
                  const isThisMonth = day.getMonth() === cursor.getMonth();
                  const isToday = sameDay(day, new Date());
                  const isSelected = sameDay(day, selected);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelected(day)}
                      className={cn(
                        'relative flex min-h-[76px] flex-col gap-0.5 border-b border-r p-1 text-left transition bordered',
                        !isThisMonth && 'bg-[rgb(var(--surface-2))] opacity-55',
                        isSelected && 'ring-2 ring-inset ring-brand-400',
                        'hover:bg-brand-50/50 dark:hover:bg-brand-500/10',
                      )}
                    >
                      <span className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold',
                        isToday ? 'bg-brand-600 text-white' : 'text-ink-700 dark:text-ink-200',
                      )}>
                        {day.getDate()}
                      </span>
                      <span className="flex flex-col gap-0.5">
                        {dayEvents.slice(0, 2).map((e) => (
                          <span key={e.id} className="flex items-center gap-1 truncate text-[9.5px] font-semibold">
                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', KIND_META[e.kind].dot)} />
                            <span className="truncate">{e.title}</span>
                          </span>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="pl-2.5 text-[9px] font-bold text-muted">+{dayEvents.length - 2} more</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* day + upcoming */}
            <div className="space-y-3">
              <section className="card p-3.5">
                <h3 className="text-[12.5px] font-bold">
                  {selected.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {selectedEvents.length === 0 ? (
                  <p className="mt-2 rounded-xl border border-dashed px-3 py-4 text-center text-[11.5px] text-muted bordered">Nothing on this day.</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {selectedEvents.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setDetail(e)}
                        className="flex w-full items-start gap-2 rounded-xl border p-2 text-left transition hover:border-brand-300 bordered"
                      >
                        <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white', KIND_META[e.kind].dot)}>
                          {KIND_META[e.kind].icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold">{e.title}</span>
                          <span className="block text-[10px] text-muted">
                            {e.allDay ? 'All day' : new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                            {e.kind === 'meeting' && e.hostName ? ` · ${e.hostName}` : ''}
                            {e.kind === 'task' && e.assigneeName ? ` · ${e.assigneeName}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="card p-3.5">
                <h3 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold"><Clock size={13} className="text-brand-600 dark:text-brand-300" /> Coming up</h3>
                {upcoming.length === 0 ? (
                  <p className="text-[11.5px] text-muted">Nothing scheduled.</p>
                ) : (
                  <div className="space-y-1">
                    {upcoming.map((e) => (
                      <button key={`u-${e.id}`} type="button" onClick={() => setDetail(e)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-ink-100 dark:hover:bg-white/[0.05]">
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', KIND_META[e.kind].dot)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11.5px] font-semibold">{e.title}</span>
                          <span className="block text-[10px] text-muted">{timeAgo(e.at)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || ''} subtitle={detail ? KIND_META[detail.kind].label : ''}>
        {detail && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Badge tone={KIND_META[detail.kind].tone}>{KIND_META[detail.kind].label}</Badge>
              {detail.status && <Badge tone="neutral">{detail.status}</Badge>}
            </div>
            <p className="flex items-center gap-1.5 text-[12.5px]">
              <CalendarDays size={13} className="text-muted" />
              {new Date(detail.at).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: detail.allDay ? undefined : 'numeric', minute: detail.allDay ? undefined : '2-digit' })}
            </p>
            {detail.kind === 'meeting' && (
              <>
                {detail.hostName && <p className="flex items-center gap-1.5 text-[12.5px]"><Avatar name={detail.hostName} size={18} /> Hosted by {detail.hostName}</p>}
                {!!detail.attendeeCount && <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><Users size={13} /> {detail.attendeeCount} invited</p>}
                {detail.description && <p className="rounded-xl bg-[rgb(var(--surface-2))] px-3 py-2 text-[12px]">{detail.description}</p>}
                <Link to={detail.link.replace('#', '')} className="btn-primary w-full text-[12.5px]"><Video size={14} /> Open meeting</Link>
              </>
            )}
            {detail.kind === 'task' && (
              <>
                <p className="text-[12.5px] text-muted">Assigned to {detail.assigneeName}</p>
                <Link to="/tasks" className="btn-primary w-full text-[12.5px]"><KanbanSquare size={14} /> Open the board</Link>
              </>
            )}
            {detail.kind === 'ooo' && (
              <>
                {detail.message && <p className="rounded-xl bg-[rgb(var(--surface-2))] px-3 py-2 text-[12px] italic">“{detail.message}”</p>}
                {detail.delegateName && <p className="text-[12.5px] text-muted">Covered by {detail.delegateName}</p>}
                <Link to={detail.link.replace('#', '')} className="btn-primary w-full text-[12.5px]">View profile</Link>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
