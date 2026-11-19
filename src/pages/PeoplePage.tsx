import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, Copy, Crown, Link2, Mail, Search, Shield, ShieldCheck, UserMinus, Users, UserPlus, X,
  Video, EyeOff, Eye, BellOff, BellRing, UserRoundPlus, CheckSquare, Square, MessageSquare,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { Membership, Role } from '@/lib/types';
import { cn, copyText, timeAgo } from '@/lib/utils';
import { Avatar, Badge, IconButton, Modal, Spinner, Switch } from '@/components/ui';
import { PersonCard } from '@/components/PersonCard';

const ROLE_TONE: Record<string, 'brand' | 'violet' | 'neutral' | 'amber'> = {
  owner: 'amber', admin: 'violet', member: 'brand', guest: 'neutral', bot: 'neutral',
};

export function PeoplePage() {
  const {
    members, online, team, can, permissionDefs, toast, refreshTeam, user, myPermissions,
    addMember, hiddenPeople, hidePerson, unhidePerson, startGroupCall,
  } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [managing, setManaging] = useState<Membership | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [calling, setCalling] = useState(false);

  const hiddenIds = useMemo(() => new Set(hiddenPeople.map((h) => h.targetUserId)), [hiddenPeople]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return members.filter((m) => {
      if (hiddenIds.has(m.userId)) return false;
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (!q) return true;
      return m.user?.name.toLowerCase().includes(q) || m.user?.email.toLowerCase().includes(q) || (m.user?.title || '').toLowerCase().includes(q);
    });
  }, [members, query, roleFilter, hiddenIds]);

  const onlineCount = members.filter((m) => online.has(m.userId)).length;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const m of filtered) {
      const dept = m.user?.department || 'Unassigned';
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(m);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[20px] font-black">People</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">{members.length} members · {onlineCount} online now</p>
            <a href="#/org" className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-600 hover:underline dark:text-brand-300">
              View company hierarchy →
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {can('member.invite') && (
              <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
                <UserRoundPlus size={15} /> Add person
              </button>
            )}
            {can('member.invite') && (
              <button type="button" className="btn-outline text-[12.5px]" onClick={() => setInviteOpen(true)}>
                <Link2 size={14} /> Invite link
              </button>
            )}
            <button
              type="button"
              className={selectMode ? 'btn-soft text-[12.5px]' : 'btn-outline text-[12.5px]'}
              onClick={() => { setSelectMode((v) => !v); setSelected([]); }}
            >
              {selectMode ? <X size={14} /> : <CheckSquare size={14} />} {selectMode ? 'Cancel' : 'Select'}
            </button>
            {hiddenPeople.length > 0 && (
              <button type="button" className="btn-outline text-[12.5px]" onClick={() => setShowHidden(true)}>
                <EyeOff size={14} /> Hidden ({hiddenPeople.length})
              </button>
            )}
          </div>
        </div>

        {selectMode && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-200 bg-brand-50/70 px-3 py-2.5 dark:border-brand-400/30 dark:bg-brand-500/10 bordered">
            <p className="text-[12.5px] font-semibold">
              {selected.length === 0
                ? 'Select people to start a group call'
                : `${selected.length} selected — ${selected.length + 1} in the call with you`}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="btn-ghost h-8 px-2.5 text-[12px]"
                onClick={() => setSelected(selected.length === filtered.length ? [] : filtered.map((m) => m.userId))}
              >
                {selected.length === filtered.length ? 'Clear all' : 'Select all'}
              </button>
              <button
                type="button"
                className="btn-primary h-8 px-3 text-[12px]"
                disabled={selected.length === 0 || calling || !can('meeting.host')}
                onClick={async () => {
                  setCalling(true);
                  try {
                    const call = await startGroupCall(selected);
                    setSelectMode(false);
                    setSelected([]);
                    navigate(`/meeting/${call.id}`);
                  } catch (e: any) {
                    toast({ title: 'Could not start the group call', body: e.message, tone: 'error' });
                  } finally {
                    setCalling(false);
                  }
                }}
              >
                <Video size={14} /> {calling ? 'Starting…' : `Group call${selected.length ? ` (${selected.length + 1})` : ''}`}
              </button>
            </div>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-8" placeholder="Search by name, email or title" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1">
            {(['all', 'owner', 'admin', 'member', 'guest'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold capitalize transition',
                  roleFilter === r ? 'bg-brand-600 text-white' : 'text-muted hover:bg-ink-100 dark:hover:bg-white/[0.06]',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {grouped.map(([dept, people]) => (
            <section key={dept}>
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[10.5px] font-bold uppercase tracking-wider text-muted">
                {dept}
                <span className="rounded-full bg-ink-100 px-1.5 text-[9.5px] dark:bg-white/10">{people.length}</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
          {people.map((m) => (
            <div key={m.userId} className="card flex items-center gap-3 p-3">
              <button type="button" onClick={() => setProfileId(m.userId)} aria-label={`Open ${m.user.name}'s profile`}>
                <Avatar name={m.user.name} color={m.user.avatarColor} url={m.user.avatarUrl} size={42} online={online.has(m.userId)} />
              </button>
              <button type="button" onClick={() => setProfileId(m.userId)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13px] font-bold">{m.user.name}</p>
                  {m.role === 'owner' && <Crown size={12} className="shrink-0 text-amber-500" />}
                  <Badge tone={ROLE_TONE[m.role] || 'neutral'}>{m.role}</Badge>
                </div>
                <p className="truncate text-[11px] font-semibold text-brand-600 dark:text-brand-300">{m.user.position || m.user.title || '—'}</p>
                <p className="truncate text-[10.5px] text-muted">
                  {m.user.department ? `${m.user.department} · ` : ''}{m.user.email}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {selectMode && (
                  <button
                    type="button"
                    aria-label={selected.includes(m.userId) ? 'Deselect' : 'Select'}
                    onClick={() => setSelected((prev) => (prev.includes(m.userId) ? prev.filter((id) => id !== m.userId) : [...prev, m.userId]))}
                    className={cn('flex h-7 w-7 items-center justify-center rounded-lg transition', selected.includes(m.userId) ? 'bg-brand-600 text-white' : 'text-muted hover:bg-ink-100 dark:hover:bg-white/10')}
                  >
                    {selected.includes(m.userId) ? <Check size={14} /> : <Square size={14} />}
                  </button>
                )}
                {!selectMode && m.userId !== user?.id && (
                  <>
                    <IconButton label="Message this person" onClick={() => setProfileId(m.userId)}>
                      <MessageSquare size={14} />
                    </IconButton>
                    <IconButton
                      label="Hide from my list"
                      onClick={async () => {
                        await hidePerson(m.userId);
                        toast({ title: `${m.user.name} hidden`, body: 'Restore them from Hidden.', tone: 'success' });
                      }}
                    >
                      <EyeOff size={14} />
                    </IconButton>
                  </>
                )}
                {m.permissions?.length > 0 && (
                  <span title={`${m.permissions.length} extra permissions`} className="text-[10px] font-bold text-violet-600 dark:text-violet-300">
                    +{m.permissions.length}
                  </span>
                )}
                {can('member.manage') && m.role !== 'owner' && (
                  <IconButton label="Manage member" onClick={() => setManaging(m)}>
                    <Shield size={15} />
                  </IconButton>
                )}
              </div>
            </div>
          ))}
              </div>
            </section>
          ))}
        </div>
        {filtered.length === 0 && <p className="py-10 text-center text-[12.5px] text-muted">No one matches that search.</p>}
      </div>

      {managing && (
        <ManageMemberModal
          membership={managing}
          permissionDefs={permissionDefs}
          onClose={() => setManaging(null)}
          onSaved={async () => { await refreshTeam(); setManaging(null); toast({ title: 'Member updated', tone: 'success' }); }}
          teamId={team?.id || ''}
        />
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} teamId={team?.id || ''} />

      <PersonCard userId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />

      <AddPersonModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        members={members}
        onAdd={async (payload) => {
          const result = await addMember(payload);
          toast({
            title: result.created ? `${result.user.name} added` : `${result.user.name} added to the team`,
            body: result.temporaryPassword
              ? `Temporary password: ${result.temporaryPassword}`
              : undefined,
            tone: 'success',
          });
          setAddOpen(false);
        }}
      />

      <HiddenPeopleModal
        open={showHidden}
        onClose={() => setShowHidden(false)}
        hidden={hiddenPeople}
        onRestore={async (id) => {
          await unhidePerson(id);
          toast({ title: 'Restored', tone: 'success' });
        }}
      />
    </div>
  );
}

function ManageMemberModal({
  membership, permissionDefs, onClose, onSaved, teamId,
}: {
  membership: Membership;
  permissionDefs: ReturnType<typeof useApp>['permissionDefs'];
  onClose: () => void;
  onSaved: () => Promise<void>;
  teamId: string;
}) {
  const { toast } = useApp();
  const [role, setRole] = useState<string>(membership.role);
  const [perms, setPerms] = useState<string[]>(membership.permissions || []);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateMember(teamId, membership.userId, { role, permissions: perms });
      await onSaved();
    } catch (e: any) {
      toast({ title: 'Could not update member', body: e.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Manage ${membership.user.name}`}
      subtitle="Role decides the baseline. Extra permissions can be granted individually."
      footer={
        <>
          <button
            type="button"
            className="btn-danger mr-auto"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Remove ${membership.user.name} from the team?`)) return;
              setBusy(true);
              try {
                await api.removeMember(teamId, membership.userId);
                await onSaved();
              } catch (e: any) {
                toast({ title: 'Could not remove member', body: e.message, tone: 'error' });
              } finally {
                setBusy(false);
              }
            }}
          >
            <UserMinus size={14} /> Remove
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
            <Check size={14} /> Save
          </button>
        </>
      }
    >
      <label className="label">Role</label>
      <div className="grid grid-cols-3 gap-2">
        {(['member', 'admin', 'guest'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={cn(
              'rounded-xl border px-2 py-2 text-[12px] font-bold capitalize transition bordered',
              role === r ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'hover:bg-ink-50 dark:hover:bg-white/[0.05]',
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <label className="label mt-4">Extra permissions</label>
      <div className="space-y-1">
        {permissionDefs.map((p) => (
          <label key={p.key} className="flex cursor-pointer items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-ink-50 dark:hover:bg-white/[0.05]">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 rounded"
              checked={perms.includes(p.key)}
              onChange={(e) => setPerms((prev) => (e.target.checked ? [...prev, p.key] : prev.filter((k) => k !== p.key)))}
            />
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold">{p.label}</span>
              <span className="block text-[10.5px] text-muted">Baseline: {p.minRole} and above</span>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function InviteModal({ open, onClose, teamId }: { open: boolean; onClose: () => void; teamId: string }) {
  const { toast } = useApp();
  const [role, setRole] = useState<'member' | 'guest' | 'admin'>('member');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const { link: path } = await api.createInvite(teamId, { role, email });
      setLink(`${window.location.origin}/#${path}`);
    } catch (e: any) {
      toast({ title: 'Could not create invite', body: e.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { setLink(null); setEmail(''); onClose(); }}
      title="Invite people"
      subtitle="Share a link or send an email invite. Links expire in 7 days."
      footer={
        link ? (
          <button type="button" className="btn-primary" onClick={() => { setLink(null); setEmail(''); onClose(); }}>Done</button>
        ) : (
          <>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void create()}>
              <Link2 size={14} /> {busy ? 'Creating…' : 'Create invite link'}
            </button>
          </>
        )
      }
    >
      {link ? (
        <div>
          <p className="mb-2 text-[12.5px] font-semibold">Your invite link is ready</p>
          <div className="flex items-center gap-2 rounded-xl border bg-[rgb(var(--surface-2))] p-2 bordered">
            <code className="min-w-0 flex-1 truncate text-[11.5px]">{link}</code>
            <button
              type="button"
              className="btn-soft h-7 px-2 text-[11px]"
              onClick={async () => {
                const ok = await copyText(link);
                toast({ title: ok ? 'Link copied' : 'Copy failed', tone: ok ? 'success' : 'error' });
              }}
            >
              <Copy size={12} /> Copy
            </button>
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11.5px] text-muted">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            Anyone with this link joins as <b className="mx-1">{role}</b>. They can only see channels their role allows.
          </p>
        </div>
      ) : (
        <>
          <label className="label">Invite as</label>
          <div className="grid grid-cols-3 gap-2">
            {(['member', 'admin', 'guest'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  'rounded-xl border px-2 py-2 text-[12px] font-bold capitalize transition bordered',
                  role === r ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'hover:bg-ink-50 dark:hover:bg-white/[0.05]',
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] text-muted">
            {role === 'guest' ? 'Guests can read channels they are added to but cannot post or host.' : role === 'admin' ? 'Admins can manage channels, members and meetings.' : 'Members can chat, upload, create tasks and host meetings.'}
          </p>
          <label className="label mt-3">Email (optional)</label>
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-8" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
          </div>
        </>
      )}
    </Modal>
  );
}

/* --------------------------------------------------------- add a person */

function AddPersonModal({
  open, onClose, members, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  members: Membership[];
  onAdd: (payload: { email: string; name?: string; role?: string; position?: string; department?: string; managerId?: string | null; password?: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'member' | 'admin' | 'guest'>('member');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [managerId, setManagerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await onAdd({ email, name, role, position, department, managerId: managerId || null });
      setEmail(''); setName(''); setPosition(''); setDepartment(''); setManagerId(''); setRole('member');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a person"
      subtitle="They are added to this team straight away — no invite link needed."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!email.trim() || busy} onClick={() => void submit()}>
            <UserPlus size={14} /> {busy ? 'Adding…' : 'Add person'}
          </button>
        </>
      }
    >
      <label className="label">Email address</label>
      <input className="input" autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
      <p className="mt-1 text-[10.5px] text-muted">
        If this email already has an account, that person is added to the team. Otherwise an account is created.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aditi Sharma" />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="guest">Guest</option>
          </select>
        </div>
        <div>
          <label className="label">Position</label>
          <input className="input" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Support Executive" />
        </div>
        <div>
          <label className="label">Department</label>
          <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Customer Support" />
        </div>
      </div>

      <label className="label mt-3">Reports to</label>
      <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
        <option value="">No manager</option>
        {members.map((m) => <option key={m.userId} value={m.userId}>{m.user.name} — {m.user.position || m.role}</option>)}
      </select>

      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{error}</p>}
    </Modal>
  );
}

/* ------------------------------------------------------ hidden people */

function HiddenPeopleModal({
  open, onClose, hidden, onRestore,
}: {
  open: boolean;
  onClose: () => void;
  hidden: { targetUserId: string; user: { name: string; position?: string; avatarColor: string } }[];
  onRestore: (userId: string) => Promise<void>;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Hidden people" subtitle="They still exist in the team — this only hides them from your list.">
      {hidden.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-muted">Nobody is hidden.</p>
      ) : (
        <div className="space-y-1.5">
          {hidden.map((h) => (
            <div key={h.targetUserId} className="flex items-center gap-2.5 rounded-xl border px-2.5 py-2 bordered">
              <Avatar name={h.user.name} color={h.user.avatarColor} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{h.user.name}</span>
                <span className="block truncate text-[10.5px] text-muted">{h.user.position || ''}</span>
              </span>
              <button type="button" className="btn-soft h-7 px-2.5 text-[11.5px]" onClick={() => void onRestore(h.targetUserId)}>
                <Eye size={12} /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
