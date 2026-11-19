import { useMemo, useState } from 'react';
import { Check, Copy, Crown, Link2, Mail, Search, Shield, ShieldCheck, UserMinus, Users, UserPlus, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { Membership, Role } from '@/lib/types';
import { cn, copyText, timeAgo } from '@/lib/utils';
import { Avatar, Badge, IconButton, Modal, Spinner } from '@/components/ui';

const ROLE_TONE: Record<string, 'brand' | 'violet' | 'neutral' | 'amber'> = {
  owner: 'amber', admin: 'violet', member: 'brand', guest: 'neutral', bot: 'neutral',
};

export function PeoplePage() {
  const {
    members, online, team, can, permissionDefs, toast, refreshTeam, user, myPermissions,
  } = useApp();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [managing, setManaging] = useState<Membership | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (!q) return true;
      return m.user?.name.toLowerCase().includes(q) || m.user?.email.toLowerCase().includes(q) || (m.user?.title || '').toLowerCase().includes(q);
    });
  }, [members, query, roleFilter]);

  const onlineCount = members.filter((m) => online.has(m.userId)).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[20px] font-black">People</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">{members.length} members · {onlineCount} online now</p>
          </div>
          {can('member.invite') && (
            <button type="button" className="btn-primary" onClick={() => setInviteOpen(true)}>
              <UserPlus size={15} /> Invite people
            </button>
          )}
        </div>

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

        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((m) => (
            <div key={m.userId} className="card flex items-center gap-3 p-3">
              <Avatar name={m.user.name} color={m.user.avatarColor} url={m.user.avatarUrl} size={42} online={online.has(m.userId)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13px] font-bold">{m.user.name}</p>
                  {m.role === 'owner' && <Crown size={12} className="shrink-0 text-amber-500" />}
                  <Badge tone={ROLE_TONE[m.role] || 'neutral'}>{m.role}</Badge>
                </div>
                <p className="truncate text-[11px] text-muted">{m.user.title || '—'}</p>
                <p className="truncate text-[10.5px] text-muted">{m.user.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
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
