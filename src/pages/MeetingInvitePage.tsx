import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, User, Video, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, Spinner } from '@/components/ui';

export function MeetingInvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.meetingInvite>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [responded, setResponded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.meetingInvite(token)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const respond = async (action: 'accept' | 'decline') => {
    setBusy(action);
    try {
      const { status } = await api.respondMeetingInvite(token, action);
      setResponded(status);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center"><Spinner size={24} /></div>;

  const call = data?.call;

  return (
    <div className="flex h-full items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-6">
        {error ? (
          <div className="text-center">
            <XCircle size={34} className="mx-auto text-rose-500" />
            <h1 className="mt-3 text-[17px] font-bold">Invite not usable</h1>
            <p className="mt-1 text-[12.5px] text-muted">{error}</p>
            <button type="button" className="btn-primary mt-4" onClick={() => navigate('/meetings')}>Go to meetings</button>
          </div>
        ) : responded ? (
          <div className="text-center">
            {responded === 'ACCEPTED'
              ? <CheckCircle2 size={34} className="mx-auto text-emerald-500" />
              : <XCircle size={34} className="mx-auto text-ink-400" />}
            <h1 className="mt-3 text-[17px] font-bold">
              {responded === 'ACCEPTED' ? 'You are on the guest list' : 'Response recorded'}
            </h1>
            <p className="mt-1 text-[12.5px] text-muted">
              {responded === 'ACCEPTED'
                ? `The host of “${call?.title}” has been told you are coming.`
                : 'The host has been told you cannot attend.'}
            </p>
            {responded === 'ACCEPTED' && call && (
              <button type="button" className="btn-primary mt-4 w-full" onClick={() => navigate(`/meeting/${call.id}`)}>
                <Video size={15} /> Open the meeting room
              </button>
            )}
            <button type="button" className="btn-ghost mt-2 w-full text-[12px]" onClick={() => navigate('/meetings')}>
              All meetings
            </button>
          </div>
        ) : (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl grad-brand text-white">
              <CalendarDays size={22} />
            </span>
            <h1 className="mt-3 text-center text-[18px] font-extrabold">{call?.title || 'Meeting'}</h1>
            <p className="mt-1 text-center text-[12.5px] text-muted">
              {data?.call?.hostName ? `${data.call.hostName} invited you` : 'You have been invited'}
            </p>

            <div className="mt-4 space-y-2 rounded-xl bg-[rgb(var(--surface-2))] p-3">
              <p className="flex items-center gap-2 text-[12.5px]">
                <Clock size={13} className="text-muted" />
                {call?.scheduledAt
                  ? new Date(call.scheduledAt).toLocaleString(undefined, {
                    weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
                  })
                  : 'No time set'}
              </p>
              {call?.description && <p className="text-[12px] text-muted">{call.description}</p>}
              {data?.person && (
                <p className="flex items-center gap-2 text-[12px] text-muted">
                  <User size={13} /> Invite sent to {data.person.email}
                </p>
              )}
              {data?.invite.status !== 'INVITED' && (
                <Badge tone={data?.invite.status === 'ACCEPTED' ? 'green' : 'neutral'}>
                  already {data?.invite.status.toLowerCase()}
                </Badge>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={busy !== null}
                onClick={() => void respond('accept')}
              >
                <CheckCircle2 size={15} /> {busy === 'accept' ? 'Accepting…' : 'Accept'}
              </button>
              <button
                type="button"
                className="btn-outline flex-1"
                disabled={busy !== null}
                onClick={() => void respond('decline')}
              >
                {busy === 'decline' ? 'Sending…' : 'Decline'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
