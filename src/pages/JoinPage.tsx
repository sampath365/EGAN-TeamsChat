import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, Users, XCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { Avatar, Badge, Spinner } from '@/components/ui';

export function JoinPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { user, token, selectTeam, refreshTeam, toast } = useApp();
  const [info, setInfo] = useState<{ team: { id: string; name: string; description: string; avatarColor: string } | null; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(true);

  useEffect(() => {
    api.inviteInfo(code)
      .then(({ team, invite }) => setInfo({ team, role: invite.role }))
      .catch((e) => setError(e.message))
      .finally(() => setJoining(false));
  }, [code]);

  const accept = async () => {
    if (!token) {
      sessionStorage.setItem('egan.pulse.pendingInvite', code);
      navigate('/login');
      return;
    }
    setBusy(true);
    try {
      const { teamId } = await api.acceptInvite(code);
      selectTeam(teamId);
      await refreshTeam(teamId);
      toast({ title: 'Welcome to the team', tone: 'success' });
      navigate('/home');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (joining) return <div className="flex h-full items-center justify-center"><Spinner size={24} /></div>;

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="card w-full max-w-md p-6 text-center">
        {error ? (
          <>
            <XCircle size={34} className="mx-auto text-rose-500" />
            <h1 className="mt-3 text-[17px] font-bold">Invite not usable</h1>
            <p className="mt-1 text-[12.5px] text-muted">{error}</p>
            <button type="button" className="btn-primary mt-4" onClick={() => navigate('/home')}>Go to home</button>
          </>
        ) : (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-[18px] font-black text-white" style={{ background: info?.team?.avatarColor || '#3665ff' }}>
              {info?.team?.name.slice(0, 2).toUpperCase() || 'EP'}
            </span>
            <h1 className="mt-3 text-[18px] font-extrabold">{info?.team?.name}</h1>
            <p className="mt-1 text-[12.5px] text-muted">{info?.team?.description}</p>
            <div className="mt-3 flex justify-center gap-2">
              <Badge tone="brand"><Users size={11} /> Join as {info?.role}</Badge>
              <Badge tone="green"><ShieldCheck size={11} /> Role-scoped access</Badge>
            </div>
            {user && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[rgb(var(--surface-2))] px-3 py-2">
                <Avatar name={user.name} color={user.avatarColor} size={24} />
                <span className="text-[12px] font-semibold">{user.name}</span>
                <CheckCircle2 size={14} className="text-emerald-500" />
              </div>
            )}
            <button type="button" className="btn-primary mt-4 w-full" disabled={busy} onClick={() => void accept()}>
              {busy ? 'Joining…' : token ? 'Accept invite' : 'Sign in to join'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
