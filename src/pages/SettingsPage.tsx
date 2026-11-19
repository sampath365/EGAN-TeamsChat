import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Hash, KeyRound, Lock, LogOut, Moon, Shield, Sun, Trash2, User, UserCog } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { InviteRow } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { Avatar, Badge, IconButton, Spinner, Switch } from '@/components/ui';

type Tab = 'profile' | 'team' | 'access' | 'invites';

export function SettingsPage() {
  const {
    user, team, can, theme, setTheme, updateProfile, toast, myPermissions,
    permissionDefs, refreshTeam, logout,
  } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        <h1 className="text-[20px] font-black">Settings</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">Your profile, this team and what your role can do.</p>

        <div className="mt-4 flex gap-1 overflow-x-auto no-scrollbar">
          {([
            { key: 'profile', label: 'Profile', icon: <User size={13} /> },
            { key: 'team', label: 'Team', icon: <UserCog size={13} /> },
            { key: 'access', label: 'Access', icon: <Shield size={13} /> },
            { key: 'invites', label: 'Invites', icon: <KeyRound size={13} /> },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition',
                tab === t.key ? 'bg-brand-600 text-white' : 'text-muted hover:bg-ink-100 dark:hover:bg-white/[0.06]',
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'team' && <TeamTab />}
          {tab === 'access' && (
            <div className="card p-4">
              <h2 className="text-[13px] font-bold">Your access in {team?.name}</h2>
              <p className="mt-0.5 text-[11.5px] text-muted">Role: <b className="capitalize">{team?.role}</b></p>
              <div className="mt-3 space-y-1.5">
                {permissionDefs.map((p) => {
                  const granted = myPermissions.includes(p.key);
                  return (
                    <div key={p.key} className={cn('flex items-start gap-2 rounded-xl border px-2.5 py-2 bordered', granted ? 'bg-emerald-50/50 dark:bg-emerald-500/10' : 'opacity-60')}>
                      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full', granted ? 'bg-emerald-500 text-white' : 'bg-ink-200 dark:bg-white/15')}>
                        {granted ? <Check size={10} /> : <Lock size={9} />}
                      </span>
                      <span>
                        <span className="block text-[12px] font-semibold">{p.label}</span>
                        <span className="block text-[10.5px] text-muted">Requires {p.minRole}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {tab === 'invites' && <InvitesTab />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user, updateProfile, theme, setTheme, toast, logout } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [title, setTitle] = useState(user?.title || '');
  const [statusText, setStatusText] = useState(user?.statusText || '');
  const [status, setStatus] = useState<string>(user?.status || 'online');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({ name, title, status: status as any, statusText });
      toast({ title: 'Profile saved', tone: 'success' });
    } catch (e: any) {
      toast({ title: 'Could not save', body: e.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <Avatar name={name || 'You'} color={user?.avatarColor} size={56} />
          <div>
            <p className="text-[14px] font-bold">{user?.name}</p>
            <p className="text-[11.5px] text-muted">{user?.email}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Display name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Job title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Product Designer" />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="online">Available</option>
              <option value="busy">Busy</option>
              <option value="away">Away</option>
              <option value="offline">Appear offline</option>
            </select>
          </div>
          <div>
            <label className="label">Status message</label>
            <input className="input" value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder="In a meeting until 3pm" />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
            <Check size={14} /> {busy ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>

      <div className="card flex items-center justify-between p-4">
        <div>
          <p className="text-[13px] font-bold">Appearance</p>
          <p className="text-[11.5px] text-muted">Switch between dark and light.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setTheme('light')} className={cn('flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition', theme === 'light' ? 'bg-brand-600 text-white' : 'text-muted hover:bg-ink-100 dark:hover:bg-white/[0.06]')}>
            <Sun size={14} /> Light
          </button>
          <button type="button" onClick={() => setTheme('dark')} className={cn('flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition', theme === 'dark' ? 'bg-brand-600 text-white' : 'text-muted hover:bg-ink-100 dark:hover:bg-white/[0.06]')}>
            <Moon size={14} /> Dark
          </button>
        </div>
      </div>

      <div className="card p-4">
        <p className="text-[13px] font-bold">Session</p>
        <p className="mt-0.5 text-[11.5px] text-muted">Sign out of this device.</p>
        <button type="button" className="btn-outline mt-2.5 text-[12px]" onClick={() => { logout(); navigate('/login'); }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </>
  );
}

function TeamTab() {
  const { team, can, toast, refreshTeam } = useApp();
  const [name, setName] = useState(team?.name || '');
  const [description, setDescription] = useState(team?.description || '');
  const [busy, setBusy] = useState(false);
  const editable = can('team.settings');

  const save = async () => {
    if (!team) return;
    setBusy(true);
    try {
      await api.updateTeam(team.id, { name, description });
      await refreshTeam();
      toast({ title: 'Team updated', tone: 'success' });
    } catch (e: any) {
      toast({ title: 'Could not update team', body: e.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <h2 className="text-[13px] font-bold">Team details</h2>
      {!editable && <p className="mt-1 text-[11.5px] text-amber-600 dark:text-amber-400">Only the owner can edit team settings.</p>}
      <label className="label mt-3">Team name</label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} />
      <label className="label mt-3">Description</label>
      <textarea className="input min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!editable} />
      {editable && (
        <div className="mt-3 flex justify-end">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save team'}</button>
        </div>
      )}
    </div>
  );
}

function InvitesTab() {
  const { team, can, toast } = useApp();
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!team || !can('member.invite')) {
      setLoading(false);
      return;
    }
    api.invites(team.id)
      .then(({ invites: rows }) => setInvites(rows))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [team?.id, can]);

  if (!can('member.invite')) {
    return <div className="card p-4 text-[12.5px] text-muted">Your role cannot manage invites.</div>;
  }

  return (
    <div className="card p-4">
      <h2 className="text-[13px] font-bold">Invite links</h2>
      <p className="mt-0.5 text-[11.5px] text-muted">Each link joins as the role shown and expires after 7 days.</p>
      {loading ? (
        <div className="mt-3 space-y-1.5">{[0, 1].map((i) => <div key={i} className="skeleton h-12" />)}</div>
      ) : invites.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed px-3 py-6 text-center text-[12px] text-muted bordered">No invite links yet. Create one from People → Invite people.</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {invites.map((i) => (
            <div key={i.id} className="flex items-center gap-2 rounded-xl border px-2.5 py-2 bordered">
              <code className="min-w-0 flex-1 truncate text-[11.5px]">{window.location.origin}/#/join/{i.code}</code>
              <Badge tone={i.role === 'admin' ? 'violet' : i.role === 'guest' ? 'neutral' : 'brand'}>{i.role}</Badge>
              <span className="text-[10.5px] text-muted">{i.usedBy.length} used · {timeAgo(i.createdAt)}</span>
              <button
                type="button"
                className="btn-soft h-7 px-2 text-[11px]"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}/#/join/${i.code}`);
                    toast({ title: 'Copied', tone: 'success' });
                  } catch {
                    toast({ title: 'Copy failed', tone: 'error' });
                  }
                }}
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
