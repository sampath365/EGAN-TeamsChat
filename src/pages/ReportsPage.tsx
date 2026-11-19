import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, CheckCircle2, Download, FileText, Mail, MessageSquare,
  RefreshCw, Search, Users, Video, ListTree, Building2, Clock,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { ReportPerson, TeamReport } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { Avatar, Badge, EmptyState, IconButton, Spinner, Tabs } from '@/components/ui';
import { PersonCard } from '@/components/PersonCard';

const ROLE_TONE: Record<string, 'brand' | 'violet' | 'neutral' | 'amber'> = {
  owner: 'amber', admin: 'violet', member: 'brand', guest: 'neutral', bot: 'neutral',
};

export function ReportsPage() {
  const { team, toast } = useApp();
  const [data, setData] = useState<TeamReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'people' | 'departments' | 'structure'>('people');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'open' | 'done' | 'messages'>('open');
  const [profileId, setProfileId] = useState<string | null>(null);

  const load = async () => {
    if (!team) return;
    setLoading(true);
    try {
      setData(await api.reports(team.id));
    } catch (e: any) {
      toast({ title: 'Could not load reports', body: e.message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [team?.id]);

  const people = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? data.people.filter(
        (p) => (p.user?.name || '').toLowerCase().includes(q)
          || (p.user?.position || '').toLowerCase().includes(q)
          || (p.user?.department || '').toLowerCase().includes(q),
      )
      : data.people;
    const key = sort === 'open' ? (p: ReportPerson) => p.tasks.open
      : sort === 'done' ? (p: ReportPerson) => p.tasks.done
        : (p: ReportPerson) => p.messages;
    return [...rows].sort((a, b) => key(b) - key(a));
  }, [data, query, sort]);

  const exportCsv = () => {
    if (!data) return;
    const header = ['Name', 'Position', 'Department', 'Role', 'Open tasks', 'Done', 'Overdue', 'Messages', 'Meetings hosted', 'Files'];
    const lines = data.people.map((p) => [
      p.user?.name || '', p.user?.position || '', p.user?.department || '', p.role,
      p.tasks.open, p.tasks.done, p.tasks.overdue, p.messages, p.meetingsHosted, p.filesUploaded,
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(team?.name || 'team').replace(/\s+/g, '-').toLowerCase()}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Report downloaded', tone: 'success' });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-[20px] font-black">
              <BarChart3 size={19} className="text-brand-600 dark:text-brand-300" />
              Reports
            </h1>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {data ? `Team activity and reporting structure · generated ${timeAgo(data.generatedAt)}` : 'Team activity and reporting structure.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton label="Refresh" onClick={() => void load()}><RefreshCw size={15} /></IconButton>
            <button type="button" className="btn-outline text-[12px]" onClick={exportCsv} disabled={!data}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16" />)}</div>
        ) : !data ? (
          <EmptyState icon={<BarChart3 size={20} />} title="No report yet" body="Try refreshing in a moment." />
        ) : (
          <>
            {/* totals */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="People" value={data.totals.people} icon={<Users size={13} />} tone="brand" />
              <StatTile label="Open tasks" value={data.totals.tasksOpen} icon={<Clock size={13} />} tone="violet" />
              <StatTile label="Done" value={data.totals.tasksDone} icon={<CheckCircle2 size={13} />} tone="green" />
              <StatTile label="Overdue" value={data.totals.tasksOverdue} icon={<AlertTriangle size={13} />} tone={data.totals.tasksOverdue > 0 ? 'rose' : 'neutral'} />
              <StatTile label="Messages" value={data.totals.messages} icon={<MessageSquare size={13} />} tone="neutral" />
              <StatTile label="Meetings" value={data.totals.meetings} icon={<Video size={13} />} tone="neutral" />
              <StatTile label="Files" value={data.totals.files} icon={<FileText size={13} />} tone="neutral" />
              <StatTile label="Reporting lines" value={data.reportingLines.length} icon={<ListTree size={13} />} tone="neutral" />
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { key: 'people', label: 'By person', icon: <Users size={13} />, badge: data.people.length },
                  { key: 'departments', label: 'By department', icon: <Building2 size={13} />, badge: data.departments.length },
                  { key: 'structure', label: 'Reporting structure', icon: <ListTree size={13} />, badge: data.reportingLines.length },
                ]}
              />
              {tab === 'people' && (
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input className="input h-8 w-40 pl-7 text-[12px] sm:w-52" placeholder="Search people…" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                  <select className="input h-8 py-0 text-[12px]" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort by">
                    <option value="open">Sort: open tasks</option>
                    <option value="done">Sort: completed</option>
                    <option value="messages">Sort: messages</option>
                  </select>
                </div>
              )}
            </div>

            {tab === 'people' && (
              <div className="overflow-hidden rounded-2xl border bordered">
                <div className="hidden grid-cols-12 gap-2 border-b bg-[rgb(var(--surface-2))] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted bordered sm:grid">
                  <span className="col-span-5">Person</span>
                  <span className="col-span-2 text-center">Open</span>
                  <span className="col-span-2 text-center">Done</span>
                  <span className="col-span-1 text-center">Msg</span>
                  <span className="col-span-2 text-right">Last active</span>
                </div>
                {people.length === 0 && <p className="py-10 text-center text-[12.5px] text-muted">No one matches that search.</p>}
                {people.map((p, i) => (
                  <button
                    key={p.user?.id || i}
                    type="button"
                    onClick={() => setProfileId(p.user?.id || null)}
                    className={cn(
                      'grid w-full grid-cols-1 items-center gap-2 px-3 py-2.5 text-left transition hover:bg-ink-50 dark:hover:bg-white/[0.04] sm:grid-cols-12',
                      i > 0 && 'border-t bordered',
                    )}
                  >
                    <span className="col-span-5 flex min-w-0 items-center gap-2">
                      <Avatar name={p.user?.name || 'Unknown'} color={p.user?.avatarColor} size={30} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-bold">{p.user?.name || 'Unknown'}</span>
                          <Badge tone={ROLE_TONE[p.role] || 'neutral'}>{p.role}</Badge>
                        </span>
                        <span className="block truncate text-[10.5px] text-muted">
                          {p.user?.position || '—'}{p.user?.department ? ` · ${p.user.department}` : ''}
                        </span>
                      </span>
                    </span>
                    <span className="col-span-2 flex items-center gap-1 text-[12px] font-bold sm:justify-center">
                      {p.tasks.open}
                      {p.tasks.overdue > 0 && <span className="rounded bg-rose-100 px-1 text-[9.5px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">{p.tasks.overdue} late</span>}
                    </span>
                    <span className="col-span-2 text-[12px] font-bold text-emerald-600 dark:text-emerald-400 sm:text-center">{p.tasks.done}</span>
                    <span className="col-span-1 text-[12px] text-muted sm:text-center">{p.messages}</span>
                    <span className="col-span-2 text-[10.5px] text-muted sm:text-right">
                      {p.lastActiveAt ? timeAgo(p.lastActiveAt) : 'No activity'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {tab === 'departments' && (
              <div className="space-y-2">
                {data.departments.map((d) => (
                  <div key={d.name} className="card p-3.5">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 text-[13px] font-bold">
                        <Building2 size={14} className="text-brand-600 dark:text-brand-300" /> {d.name}
                      </h3>
                      <Badge tone="neutral">{d.people} {d.people === 1 ? 'person' : 'people'}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <MiniStat label="Open tasks" value={d.open} tone={d.open > 0 ? 'violet' : 'neutral'} />
                      <MiniStat label="Completed" value={d.done} tone="green" />
                      <MiniStat label="Messages" value={d.messages} tone="neutral" />
                    </div>
                  </div>
                ))}
                {data.departments.length === 0 && <EmptyState title="No departments set" body="Add a department to each person's profile to group them here." />}
              </div>
            )}

            {tab === 'structure' && (
              <div className="overflow-hidden rounded-2xl border bordered">
                {data.reportingLines.length === 0 && (
                  <p className="px-4 py-10 text-center text-[12.5px] text-muted">No reporting lines set yet — assign managers from a person's profile.</p>
                )}
                {data.reportingLines.map((r, i) => (
                  <div key={r.userId} className={cn('flex items-center gap-2 px-3 py-2.5', i > 0 && 'border-t bordered')}>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{r.name}</span>
                    <span className="text-[10.5px] text-muted">{r.position}</span>
                    <span className="text-muted">→</span>
                    <Link to={`/profile/${r.managerId}`} className="shrink-0 rounded-lg px-1.5 py-0.5 text-[12px] font-bold text-brand-600 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/15">
                      {r.managerName}
                    </Link>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-4 flex items-start gap-1.5 text-[10.5px] text-muted">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              Every figure is counted from real rows — tasks, messages, files and meetings in this team. Nothing here is estimated.
            </p>
          </>
        )}
      </div>

      <PersonCard userId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}

function StatTile({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'brand' | 'violet' | 'green' | 'rose' | 'neutral' }) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    neutral: 'bg-ink-100 text-ink-600 dark:bg-white/10 dark:text-ink-300',
  };
  return (
    <div className={cn('rounded-xl px-3 py-2.5', tones[tone])}>
      <div className="flex items-center gap-1 opacity-80">{icon}<span className="text-[10px] font-bold uppercase tracking-wide">{label}</span></div>
      <p className="mt-0.5 text-[19px] font-black leading-none">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: 'violet' | 'green' | 'neutral' }) {
  const tones: Record<string, string> = {
    violet: 'text-violet-700 dark:text-violet-300',
    green: 'text-emerald-600 dark:text-emerald-400',
    neutral: 'text-ink-600 dark:text-ink-300',
  };
  return (
    <div className="rounded-lg bg-[rgb(var(--surface-2))] px-2 py-1.5">
      <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('text-[15px] font-black leading-tight', tones[tone])}>{value}</p>
    </div>
  );
}
