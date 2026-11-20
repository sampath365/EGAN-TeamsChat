import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, Building2, CalendarDays, Clock, Mail, MapPin, MessageSquare, Phone,
  UserRound, X, ChevronRight, Users, Video, BarChart3,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { User, UserProfile } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { Avatar, Badge, IconButton, Spinner } from './ui';
import { useApp } from '@/context/AppContext';

const ROLE_TONE: Record<string, 'brand' | 'violet' | 'neutral' | 'amber'> = {
  owner: 'amber', admin: 'violet', member: 'brand', guest: 'neutral', bot: 'neutral',
};

export function PersonCard({
  userId, open, onClose,
}: {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    setError(null);
    setData(null);
    api.profile(userId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, userId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Profile">
      <button type="button" aria-label="Close profile" onClick={onClose} className="absolute inset-0 bg-ink-950/55 backdrop-blur-[3px] animate-fade-in" />
      <div className="relative w-full overflow-hidden rounded-t-3xl border bg-[rgb(var(--surface))] shadow-lift animate-slide-up sm:max-w-sm sm:rounded-3xl sm:animate-scale-in bordered">
        {loading ? (
          <div className="flex h-56 items-center justify-center"><Spinner size={22} /></div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-[13px] font-bold">{error}</p>
            <button type="button" className="btn-ghost mt-3" onClick={onClose}>Close</button>
          </div>
        ) : data ? (
          <PersonCardBody data={data} onClose={onClose} />
        ) : null}
      </div>
    </div>
  );
}

function PersonCardBody({ data, onClose }: { data: UserProfile; onClose: () => void }) {
  const { user, manager, reports, teamRoles } = data;
  const primaryRole = teamRoles[0]?.role;
  const navigate = useNavigate();
  const { user: me, team, openDm, createCall, can, toast } = useApp();
  const [busy, setBusy] = useState<'dm' | 'call' | null>(null);
  const isSelf = me?.id === user.id;

  const startDm = async () => {
    setBusy('dm');
    try {
      const channel = await openDm(user.id);
      onClose();
      navigate(`/channel/${channel.id}`);
    } catch (e: any) {
      toast({ title: 'Could not open the conversation', body: e.message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const startCall = async () => {
    if (!team) return;
    setBusy('call');
    try {
      const call = await createCall({
        title: `${me?.name || 'Someone'} & ${user.name}`,
        inviteeIds: [user.id],
      });
      onClose();
      navigate(`/meeting/${call.id}`);
    } catch (e: any) {
      toast({ title: 'Could not start the call', body: e.message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {/* header */}
      <div className="relative">
        <div className="h-20 grad-brand" />
        <button
          type="button"
          aria-label="Close profile"
          onClick={onClose}
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-xl bg-black/20 text-white backdrop-blur transition hover:bg-black/35"
        >
          <X size={15} />
        </button>
        <div className="px-4 pb-4">
          <div className="-mt-8 flex items-end justify-between gap-2">
            <div className="rounded-full ring-4 ring-[rgb(var(--surface))]">
              <Avatar name={user.name} color={user.avatarColor} url={user.avatarUrl} size={64} />
            </div>
            {primaryRole && <Badge tone={ROLE_TONE[primaryRole] || 'neutral'}>{primaryRole}</Badge>}
          </div>

          <h2 className="mt-2 text-[17px] font-extrabold leading-tight">{user.name}</h2>
          {user.position && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600 dark:text-brand-300">
              <Briefcase size={12} /> {user.position}
            </p>
          )}
          {user.department && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
              <Building2 size={12} /> {user.department}
              {user.employeeId && <span className="ml-1 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-white/10">{user.employeeId}</span>}
            </p>
          )}
          {user.statusText && (
            <p className="mt-1.5 rounded-lg bg-[rgb(var(--surface-2))] px-2 py-1.5 text-[11.5px] italic text-muted">“{user.statusText}”</p>
          )}
          {user.bio && <p className="mt-2 text-[12px] leading-relaxed text-ink-700 dark:text-ink-300">{user.bio}</p>}
        </div>
      </div>

      {/* contact */}
      <div className="space-y-1.5 border-t px-4 py-3 bordered">
        <Row icon={<Mail size={12} />} label="Email">
          <a href={`mailto:${user.email}`} className="truncate text-brand-600 hover:underline dark:text-brand-300">{user.email}</a>
        </Row>
        {user.phone && (
          <Row icon={<Phone size={12} />} label="Phone">
            <a href={`tel:${user.phone.replace(/\s/g, '')}`} className="text-brand-600 hover:underline dark:text-brand-300">{user.phone}</a>
          </Row>
        )}
        {user.location && <Row icon={<MapPin size={12} />} label="Location"><span>{user.location}</span></Row>}
        {user.timezone && <Row icon={<Clock size={12} />} label="Time zone"><span>{user.timezone}</span></Row>}
        {user.joinedAt && <Row icon={<CalendarDays size={12} />} label="Joined"><span>{new Date(user.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></Row>}
      </div>

      {/* reporting line */}
      {(manager || reports.length > 0) && (
        <div className="space-y-2 border-t px-4 py-3 bordered">
          {manager && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Reports to</p>
              <PersonRow user={manager} />
            </div>
          )}
          {reports.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted">
                <Users size={10} /> Direct reports ({reports.length})
              </p>
              <div className="space-y-0.5">
                {reports.slice(0, 4).map((r) => <PersonRow key={r.id} user={r} />)}
                {reports.length > 4 && <p className="pl-1 text-[10.5px] text-muted">+{reports.length - 4} more</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* teams */}
      {teamRoles.length > 0 && (
        <div className="border-t px-4 py-3 bordered">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Teams</p>
          <div className="flex flex-wrap gap-1">
            {teamRoles.map((t) => (
              <span key={t.teamId} className="chip">
                {t.teamName}
                <span className="text-muted">· {t.role}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* actions */}
      <div className="border-t px-4 py-3 bordered">
        {isSelf ? (
          <Link to="/profile" onClick={onClose} className="btn-primary w-full text-[12.5px]">
            <UserRound size={14} /> Edit my profile
          </Link>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-primary flex-1 text-[12.5px]" disabled={busy === 'dm'} onClick={() => void startDm()}>
                <MessageSquare size={14} /> {busy === 'dm' ? 'Opening…' : 'Message'}
              </button>
              <button
                type="button"
                className="btn-soft flex-1 text-[12.5px]"
                disabled={busy === 'call' || !can('meeting.host')}
                title={can('meeting.host') ? 'Start an audio/video call' : 'Your role cannot host calls'}
                onClick={() => void startCall()}
              >
                <Video size={14} /> {busy === 'call' ? 'Calling…' : 'Call'}
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Link to={`/profile/${user.id}`} onClick={onClose} className="btn-outline flex-1 text-[12px]">
                <UserRound size={13} /> Profile
              </Link>
              <Link to="/reports" onClick={onClose} className="btn-outline flex-1 text-[12px]">
                <BarChart3 size={13} /> Reports
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className="flex w-16 shrink-0 items-center gap-1 text-muted">{icon}{label}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{children}</span>
    </div>
  );
}

function PersonRow({ user }: { user: User }) {
  return (
    <Link
      to={`/profile/${user.id}`}
      className="flex items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-ink-100 dark:hover:bg-white/[0.06]"
    >
      <Avatar name={user.name} color={user.avatarColor} size={24} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold">{user.name}</span>
        <span className="block truncate text-[10px] text-muted">{user.position || user.email}</span>
      </span>
    </Link>
  );
}

/** Avatar + name that opens the profile popup. Use anywhere a person appears. */
export function PersonChip({
  user, size = 28, showPosition, onClick, className, online,
}: {
  user: User;
  size?: number;
  showPosition?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  online?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-ink-100 dark:hover:bg-white/[0.06]', className)}
    >
      <Avatar name={user.name} color={user.avatarColor} url={user.avatarUrl} size={size} online={online} />
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold">{user.name}</span>
        {showPosition && <span className="block truncate text-[10.5px] text-muted">{user.position || user.email}</span>}
      </span>
    </button>
  );
}
