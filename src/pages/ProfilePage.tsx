import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Briefcase, Building2, CalendarDays, Check, Clock, Mail, MapPin, MessageSquare,
  Network, Pencil, Phone, Save, UserRound, Users, X, Crown, Video,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { User, UserProfile } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { Avatar, Badge, EmptyState, IconButton, Spinner } from '@/components/ui';

const ROLE_TONE: Record<string, 'brand' | 'violet' | 'neutral' | 'amber'> = {
  owner: 'amber', admin: 'violet', member: 'brand', guest: 'neutral', bot: 'neutral',
};

const DEPARTMENTS = [
  'Leadership', 'Operations', 'Engineering', 'Design', 'Customer Support',
  'Marketing', 'Sales', 'Finance', 'Human Resources', 'Logistics', 'Quality',
];

export function ProfilePage() {
  const { userId } = useParams();
  const { user, team, members, can, online, toast, refreshTeam, updateProfile, openDm, createCall } = useApp();
  const navigate = useNavigate();

  const targetId = userId || user?.id || '';
  const isSelf = targetId === user?.id;
  const [data, setData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<'dm' | 'call' | null>(null);
  const [form, setForm] = useState({
    position: '', department: '', employeeId: '', managerId: '',
    phone: '', location: '', timezone: '', bio: '',
  });

  const load = useMemo(() => async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const profile = await api.profile(targetId);
      setData(profile);
      setForm({
        position: profile.user.position || '',
        department: profile.user.department || '',
        employeeId: profile.user.employeeId || '',
        managerId: profile.user.managerId || '',
        phone: profile.user.phone || '',
        location: profile.user.location || '',
        timezone: profile.user.timezone || '',
        bio: profile.user.bio || '',
      });
    } catch (e: any) {
      toast({ title: 'Could not load profile', body: e.message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [targetId, toast]);

  useEffect(() => { void load(); }, [load]);

  const canEdit = isSelf || can('member.manage');
  const managerCandidates = useMemo(
    () => members.filter((m) => m.userId !== targetId),
    [members, targetId],
  );

  const save = async () => {
    if (!team) return;
    setBusy(true);
    try {
      if (isSelf) {
        // Name/status live on the auth route; org fields go through the team route.
        await updateProfile({ title: form.position });
      }
      await api.updateOrg(team.id, targetId, {
        position: form.position,
        department: form.department,
        employeeId: form.employeeId,
        managerId: form.managerId || null,
        phone: form.phone,
        location: form.location,
        timezone: form.timezone,
        bio: form.bio,
      });
      await load();
      await refreshTeam();
      setEditing(false);
      toast({ title: 'Profile updated', tone: 'success' });
    } catch (e: any) {
      toast({ title: 'Could not save', body: e.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Spinner size={24} /></div>;
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState icon={<UserRound size={20} />} title="Profile unavailable" body="You may not share a team with this person." action={<Link to="/people" className="btn-soft">Back to people</Link>} />
      </div>
    );
  }

  const { user: person, manager, reports, teamRoles } = data;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        <button type="button" onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted transition hover:text-brand-600">
          <ArrowLeft size={14} /> Back
        </button>

        {/* identity card */}
        <div className="card overflow-hidden">
          <div className="relative h-24 grad-brand">
            <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(circle at 25% 30%, rgba(255,255,255,.5), transparent 45%), radial-gradient(circle at 75% 60%, rgba(255,255,255,.35), transparent 40%)' }} />
          </div>
          <div className="px-4 pb-4 sm:px-5">
            <div className="-mt-10 flex flex-wrap items-end justify-between gap-3">
              <div className="rounded-full ring-4 ring-[rgb(var(--surface))]">
                <Avatar name={person.name} color={person.avatarColor} url={person.avatarUrl} size={78} />
              </div>
              <div className="flex flex-wrap items-center gap-2 pb-1">
                {!isSelf && (
                  <>
                    <button
                      type="button"
                      className="btn-primary text-[12px]"
                      disabled={acting === 'dm'}
                      onClick={async () => {
                        setActing('dm');
                        try {
                          const channel = await openDm(person.id);
                          navigate(`/channel/${channel.id}`);
                        } catch (e: any) {
                          toast({ title: 'Could not open the conversation', body: e.message, tone: 'error' });
                        } finally {
                          setActing(null);
                        }
                      }}
                    >
                      <MessageSquare size={13} /> {acting === 'dm' ? 'Opening…' : 'Message'}
                    </button>
                    <button
                      type="button"
                      className="btn-soft text-[12px]"
                      disabled={acting === 'call' || !can('meeting.host')}
                      title={can('meeting.host') ? 'Start an audio/video call' : 'Your role cannot host calls'}
                      onClick={async () => {
                        if (!team) return;
                        setActing('call');
                        try {
                          const call = await createCall({
                            title: `${user?.name || 'Someone'} & ${person.name}`,
                            inviteeIds: [person.id],
                          });
                          navigate(`/meeting/${call.id}`);
                        } catch (e: any) {
                          toast({ title: 'Could not start the call', body: e.message, tone: 'error' });
                        } finally {
                          setActing(null);
                        }
                      }}
                    >
                      <Video size={13} /> {acting === 'call' ? 'Calling…' : 'Call'}
                    </button>
                  </>
                )}
                {isSelf && (
                  <button type="button" className="btn-outline text-[12px]" onClick={() => setEditing((v) => !v)}>
                    {editing ? <X size={13} /> : <Pencil size={13} />} {editing ? 'Cancel' : 'Edit profile'}
                  </button>
                )}
                {!isSelf && canEdit && (
                  <button type="button" className="btn-outline text-[12px]" onClick={() => setEditing((v) => !v)}>
                    {editing ? <X size={13} /> : <Pencil size={13} />} {editing ? 'Cancel' : 'Edit'}
                  </button>
                )}
                <Link to="/org" className="btn-soft text-[12px]"><Network size={13} /> Org chart</Link>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <h1 className="text-[21px] font-black leading-tight">{person.name}</h1>
              {teamRoles[0]?.role === "owner" && <Crown size={15} className="text-amber-500" />}
              {teamRoles[0] && <Badge tone={ROLE_TONE[teamRoles[0].role] || 'neutral'}>{teamRoles[0].role}</Badge>}
              {person.isBot && <Badge tone="neutral">bot</Badge>}
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold', online.has(person.id) ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-ink-100 text-ink-500 dark:bg-white/10 dark:text-ink-400')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', online.has(person.id) ? 'bg-emerald-500' : 'bg-ink-400')} />
                {online.has(person.id) ? 'Online' : 'Offline'}
              </span>
            </div>

            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
              {person.position && (
                <span className="flex items-center gap-1.5 font-semibold text-brand-600 dark:text-brand-300">
                  <Briefcase size={13} /> {person.position}
                </span>
              )}
              {person.department && (
                <span className="flex items-center gap-1.5 text-muted"><Building2 size={13} /> {person.department}</span>
              )}
              {person.employeeId && (
                <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10.5px] text-muted dark:bg-white/10">{person.employeeId}</span>
              )}
            </p>

            {person.statusText && (
              <p className="mt-2 rounded-xl bg-[rgb(var(--surface-2))] px-3 py-2 text-[12px] italic text-muted">“{person.statusText}”</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {editing ? (
              <section className="card p-4">
                <h2 className="mb-3 text-[13px] font-bold">Edit profile & position</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Position / job title</label>
                    <input className="input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Senior Product Designer" />
                  </div>
                  <div>
                    <label className="label">Department</label>
                    <input className="input" list="dept-list" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Design" />
                    <datalist id="dept-list">
                      {DEPARTMENTS.map((d) => <option key={d} value={d} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="label">Employee ID</label>
                    <input className="input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="EGN-0007" />
                  </div>
                  <div>
                    <label className="label">Reports to</label>
                    <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                      <option value="">No manager</option>
                      {managerCandidates.map((m) => (
                        <option key={m.userId} value={m.userId}>{m.user.name} — {m.user.position || m.role}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 90000 00000" />
                  </div>
                  <div>
                    <label className="label">Location</label>
                    <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Bengaluru, India" />
                  </div>
                  <div>
                    <label className="label">Time zone</label>
                    <input className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Asia/Kolkata" />
                  </div>
                </div>
                <label className="label mt-3">About</label>
                <textarea className="input min-h-[76px]" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="What you work on, how you like to be reached" />
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                  <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
                    <Save size={14} /> {busy ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              </section>
            ) : (
              <>
                {person.bio && (
                  <section className="card p-4">
                    <h2 className="mb-1.5 text-[12.5px] font-bold">About</h2>
                    <p className="text-[12.5px] leading-relaxed text-ink-700 dark:text-ink-300">{person.bio}</p>
                  </section>
                )}

                <section className="card p-4">
                  <h2 className="mb-2.5 text-[12.5px] font-bold">Contact & details</h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Detail icon={<Mail size={13} />} label="Email">
                      <a href={`mailto:${person.email}`} className="text-brand-600 hover:underline dark:text-brand-300">{person.email}</a>
                    </Detail>
                    {person.phone && <Detail icon={<Phone size={13} />} label="Phone"><a href={`tel:${person.phone.replace(/\s/g, '')}`} className="text-brand-600 hover:underline dark:text-brand-300">{person.phone}</a></Detail>}
                    {person.location && <Detail icon={<MapPin size={13} />} label="Location">{person.location}</Detail>}
                    {person.timezone && <Detail icon={<Clock size={13} />} label="Time zone">{person.timezone}</Detail>}
                    {person.joinedAt && <Detail icon={<CalendarDays size={13} />} label="Joined">{new Date(person.joinedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</Detail>}
                    {person.employeeId && <Detail icon={<UserRound size={13} />} label="Employee ID">{person.employeeId}</Detail>}
                  </div>
                </section>

                {reports.length > 0 && (
                  <section className="card p-4">
                    <h2 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold">
                      <Users size={13} className="text-brand-600 dark:text-brand-300" /> Direct reports ({reports.length})
                    </h2>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {reports.map((r) => (
                        <Link key={r.id} to={`/profile/${r.id}`} className="flex items-center gap-2 rounded-xl border p-2 transition hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-500/10 bordered">
                          <Avatar name={r.name} color={r.avatarColor} size={28} online={online.has(r.id)} />
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] font-semibold">{r.name}</span>
                            <span className="block truncate text-[10.5px] text-muted">{r.position || '—'}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>

          <div className="space-y-4">
            <section className="card p-4">
              <h2 className="mb-2 text-[12.5px] font-bold">Reporting line</h2>
              {manager ? (
                <Link to={`/profile/${manager.id}`} className="flex items-center gap-2 rounded-xl border p-2 transition hover:border-brand-300 bordered">
                  <Avatar name={manager.name} color={manager.avatarColor} size={30} online={online.has(manager.id)} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold">{manager.name}</span>
                    <span className="block truncate text-[10.5px] text-muted">{manager.position || 'Manager'}</span>
                  </span>
                </Link>
              ) : (
                <p className="rounded-xl border border-dashed px-3 py-3 text-center text-[11.5px] text-muted bordered">
                  {reports.length > 0 ? 'Top of the reporting line' : 'No manager set'}
                </p>
              )}
            </section>

            <section className="card p-4">
              <h2 className="mb-2 text-[12.5px] font-bold">Teams</h2>
              <div className="space-y-1.5">
                {teamRoles.map((t) => (
                  <div key={t.teamId} className="flex items-center justify-between rounded-lg px-1 py-1">
                    <span className="truncate text-[12px] font-semibold">{t.teamName}</span>
                    <Badge tone={ROLE_TONE[t.role] || 'neutral'}>{t.role}</Badge>
                  </div>
                ))}
                {teamRoles.length === 0 && <p className="text-[11.5px] text-muted">No shared teams.</p>}
              </div>
            </section>

            <section className="card p-4">
              <h2 className="mb-2 text-[12.5px] font-bold">Quick actions</h2>
              <div className="space-y-1.5">
                <Link to="/org" className="btn-outline w-full justify-start text-[12px]"><Network size={13} /> View company hierarchy</Link>
                <Link to="/people" className="btn-outline w-full justify-start text-[12px]"><Users size={13} /> All people</Link>
                {!isSelf && <a href={`mailto:${person.email}`} className="btn-outline w-full justify-start text-[12px]"><Mail size={13} /> Send an email</a>}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[rgb(var(--surface-2))] px-2.5 py-2">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted">{icon}{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-semibold">{children}</p>
    </div>
  );
}
