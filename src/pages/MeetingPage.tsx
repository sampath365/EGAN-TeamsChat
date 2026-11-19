import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Copy, Hand, Mic, MicOff, Monitor, MonitorOff, PhoneOff, Send, Settings2, Users, Video, VideoOff, X, Maximize2, Grid2x2, ShieldCheck,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api, tokenStore, wsUrl } from '@/lib/api';
import type { CallRow, Message } from '@/lib/types';
import { cn, copyText, timeAgo } from '@/lib/utils';
import { Avatar, Badge, IconButton, Spinner } from '@/components/ui';

interface PeerInfo {
  peerId: string;
  userId: string;
  name: string;
  avatarColor: string;
  muted: boolean;
  cameraOn: boolean;
  sharing: boolean;
  handRaised: boolean;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function MeetingPage() {
  const { callId = '' } = useParams();
  const navigate = useNavigate();
  const { user, toast, can, members, sendMessage } = useApp();

  const [call, setCall] = useState<CallRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'spotlight'>('grid');
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<{ id: string; name: string; body: string; at: string }[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [screenError, setScreenError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const peerIdRef = useRef<string>('');
  const [remoteVersion, setRemoteVersion] = useState(0);
  const localStreamRef2 = useRef<MediaStream | null>(null);

  /* --------------------------------------------------------------- bootstrap */

  useEffect(() => {
    (async () => {
      try {
        const { call: row } = await api.call(callId);
        setCall(row);
        if (row.status === 'scheduled') await api.updateCall(callId, { status: 'live' });
      } catch (e: any) {
        toast({ title: 'Could not open meeting', body: e.message, tone: 'error' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  useEffect(() => {
    const t = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  /* ------------------------------------------------------------ local media */

  const ensureLocalStream = useCallback(async (withVideo: boolean) => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (withVideo && !track) {
        try {
          const extra = await navigator.mediaDevices.getUserMedia({ video: true });
          extra.getVideoTracks().forEach((t) => localStreamRef.current!.addTrack(t));
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        } catch {
          setCamOn(false);
          toast({ title: 'Camera unavailable', body: 'Check browser permissions.', tone: 'error' });
        }
      }
      return localStreamRef.current;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (e: any) {
      // Audio-only fallback — a meeting without a camera is still useful.
      try {
        const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audio;
        setLocalStream(audio);
        setCamOn(false);
        toast({ title: 'Joined with audio only', body: 'Camera or mic was blocked.', tone: 'info' });
        return audio;
      } catch {
        toast({ title: 'No microphone or camera', body: 'You joined in view-only mode.', tone: 'error' });
        return null;
      }
    }
  }, [toast]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, camOn]);

  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  /* -------------------------------------------------------------- signalling */

  const createPeer = useCallback((targetPeerId: string, initiator: boolean) => {
    const existing = pcsRef.current.get(targetPeerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current.set(targetPeerId, pc);

    const stream = screenStreamRef.current || localStreamRef.current;
    if (stream) stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'meeting.signal',
          callId,
          targetPeerId,
          data: { candidate: event.candidate },
        }));
      }
    };

    pc.ontrack = (event) => {
      const [remote] = event.streams;
      if (!remote) return;
      remoteStreamsRef.current.set(targetPeerId, remote);
      setRemoteVersion((v) => v + 1);
    };

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsRef.current?.send(JSON.stringify({
            type: 'meeting.signal', callId, targetPeerId, data: { sdp: pc.localDescription },
          }));
        } catch {
          /* renegotiation can fail if the peer left */
        }
      };
    }
    return pc;
  }, [callId]);

  const connectSocket = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) return;
    const stream = await ensureLocalStream(camOn);
    const peerId = `${user?.id || 'peer'}-${Math.random().toString(36).slice(2, 7)}`;
    peerIdRef.current = peerId;

    const ws = new WebSocket(wsUrl(token));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'meeting.join',
        callId,
        peerId,
        muted: !micOn,
        cameraOn: camOn,
      }));
    };

    ws.onmessage = async (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'meeting.joined') {
        setPeers(data.peers.filter((p: PeerInfo) => p.peerId !== peerId));
        // Existing peers initiate to us; we initiate to nobody (avoids double offers).
        return;
      }
      if (data.type === 'meeting.peer-joined') {
        setPeers((prev) => (prev.some((p) => p.peerId === data.peer.peerId) ? prev : [...prev, data.peer]));
        return;
      }
      if (data.type === 'meeting.peer-left') {
        setPeers((prev) => prev.filter((p) => p.peerId !== data.peerId));
        pcsRef.current.get(data.peerId)?.close();
        pcsRef.current.delete(data.peerId);
        remoteStreamsRef.current.delete(data.peerId);
        setRemoteVersion((v) => v + 1);
        return;
      }
      if (data.type === 'meeting.peer-state') {
        setPeers((prev) => prev.map((p) => (p.peerId === data.peerId ? { ...p, muted: data.muted, cameraOn: data.cameraOn, sharing: data.sharing, handRaised: data.handRaised } : p)));
        return;
      }
      if (data.type === 'meeting.signal') {
        const from = data.fromPeerId as string;
        if (!from) return;
        let pc = pcsRef.current.get(from);
        if (!pc) pc = createPeer(from, false);

        if (data.data?.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.data.sdp));
          if (data.data.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'meeting.signal', callId, targetPeerId: from, data: { sdp: pc.localDescription } }));
          }
        } else if (data.data?.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.data.candidate));
          } catch {
            /* candidate may arrive before the remote description */
          }
        }
      }
      if (data.type === 'meeting.chat') {
        setChat((prev) => [...prev, { id: data.id, name: data.name, body: data.body, at: data.at }]);
      }
    };

    ws.onclose = () => {
      setPeers([]);
    };
  }, [callId, camOn, createPeer, ensureLocalStream, micOn, user?.id]);

  // Once peers are known, the newest joiner initiates to each existing peer.
  useEffect(() => {
    if (!wsRef.current) return;
    for (const peer of peers) {
      const pc = pcsRef.current.get(peer.peerId);
      if (!pc && peerIdRef.current > peer.peerId) {
        createPeer(peer.peerId, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers.length]);

  useEffect(() => {
    if (!loading) void connectSocket();
    return () => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'meeting.leave', callId }));
      ws?.close();
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  /* --------------------------------------------------------------- controls */

  const broadcastState = (patch: Partial<PeerInfo>) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'meeting.state', callId, ...patch }));
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
    broadcastState({ muted: !next });
  };

  const toggleCam = async () => {
    const next = !camOn;
    if (next) {
      await ensureLocalStream(true);
    }
    setCamOn(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
    broadcastState({ cameraOn: next });
  };

  const replaceOutgoingTrack = async (kind: 'video' | 'audio', track: MediaStreamTrack | null) => {
    const senders: RTCRtpSender[] = [];
    pcsRef.current.forEach((pc) => {
      pc.getSenders().forEach((s) => { if (s.track?.kind === kind) senders.push(s); });
    });
    for (const sender of senders) {
      try {
        await sender.replaceTrack(track);
      } catch {
        /* ignore */
      }
    }
  };

  const toggleShare = async () => {
    if (sharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setSharing(false);
      const camTrack = localStreamRef.current?.getVideoTracks()[0] || null;
      await replaceOutgoingTrack('video', camTrack);
      broadcastState({ sharing: false });
      return;
    }
    setScreenError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setSharing(true);
      await replaceOutgoingTrack('video', stream.getVideoTracks()[0]);
      broadcastState({ sharing: true });
      stream.getVideoTracks()[0].onended = () => {
        void toggleShare();
      };
    } catch (e: any) {
      setScreenError(
        e?.name === 'NotAllowedError'
          ? 'Screen sharing was blocked. Allow it in your browser prompt, then try again.'
          : 'Screen sharing is not available in this browser.',
      );
    }
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    broadcastState({ handRaised: next });
    if (next) toast({ title: 'Hand raised', body: 'The host can see your raised hand.', tone: 'info' });
  };

  const leave = async () => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'meeting.leave', callId }));
    ws?.close();
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      if (peers.length === 0) await api.updateCall(callId, { status: 'ended' });
    } catch {
      /* ignore */
    }
    navigate(-1);
  };

  const copyLink = async () => {
    const ok = await copyText(`${window.location.origin}/#/meeting/${callId}`);
    toast({ title: ok ? 'Invite link copied' : 'Copy failed', tone: ok ? 'success' : 'error' });
  };

  const sendChat = () => {
    const body = chatDraft.trim();
    if (!body) return;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'meeting.chat', callId, id: `mc_${Date.now()}`, name: user?.name, body, at: new Date().toISOString() }));
    }
    setChat((prev) => [...prev, { id: `mc_${Date.now()}`, name: user?.name || 'You', body, at: new Date().toISOString() }]);
    setChatDraft('');
  };

  const tiles = useMemo(() => {
    const list = peers.map((p) => ({
      key: p.peerId,
      name: p.name,
      color: p.avatarColor,
      stream: remoteStreamsRef.current.get(p.peerId) || null,
      muted: p.muted,
      cameraOn: p.cameraOn,
      sharing: p.sharing,
      handRaised: p.handRaised,
      isSelf: false,
    }));
    return [
      {
        key: 'self',
        name: `${user?.name || 'You'} (you)`,
        color: user?.avatarColor || '#3665ff',
        stream: screenStream || localStream,
        muted: !micOn,
        cameraOn: camOn || sharing,
        sharing,
        handRaised,
        isSelf: true,
      },
      ...list,
    ];
    // remoteVersion forces a re-read of the ref-held streams
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers, screenStream, localStream, micOn, camOn, sharing, handRaised, user, remoteVersion]);

  const spotlight = sharing ? tiles.find((t) => t.sharing) || tiles[0] : tiles[0];
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Spinner size={24} /></div>;
  }

  return (
    <div className="flex h-full flex-col bg-ink-950 text-ink-100">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl grad-brand">
            <Video size={15} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[13.5px] font-bold">{call?.title || 'Meeting'}</h1>
            <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {mmss} · {tiles.length} in the room
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={copyLink} className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-300 transition hover:bg-white/10 sm:flex">
            <Copy size={13} /> Copy invite
          </button>
          <IconButton label="Toggle layout" onClick={() => setLayout(layout === 'grid' ? 'spotlight' : 'grid')} className="text-ink-300 hover:bg-white/10">
            {layout === 'grid' ? <Maximize2 size={15} /> : <Grid2x2 size={15} />}
          </IconButton>
          <IconButton label="In-call chat" onClick={() => setChatOpen((v) => !v)} active={chatOpen} className="text-ink-300 hover:bg-white/10" badge={chat.length}>
            <Send size={15} />
          </IconButton>
          <IconButton label="Leave" tone="danger" onClick={() => void leave()} className="text-rose-400 hover:bg-rose-500/20">
            <PhoneOff size={16} />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col p-2 sm:p-3">
          {screenError && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-amber-500/15 px-3 py-2 text-[12px] text-amber-200">
              <span>{screenError}</span>
              <button type="button" onClick={() => setScreenError(null)}><X size={13} /></button>
            </div>
          )}

          {layout === 'spotlight' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <VideoTile tile={spotlight} large />
              <div className="flex gap-2 overflow-x-auto pb-1">
                {tiles.map((t) => <VideoTile key={t.key} tile={t} small />)}
              </div>
            </div>
          ) : (
            <div className={cn(
              'grid min-h-0 flex-1 gap-2',
              tiles.length === 1 ? 'grid-cols-1' : tiles.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            )}>
              {tiles.map((t) => <VideoTile key={t.key} tile={t} />)}
            </div>
          )}
        </div>

        {chatOpen && (
          <aside className="flex w-full shrink-0 flex-col border-l border-white/10 bg-ink-900 sm:w-72">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <span className="text-[12px] font-bold">In-call chat</span>
              <button type="button" onClick={() => setChatOpen(false)} className="text-ink-400 hover:text-white"><X size={14} /></button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
              {chat.length === 0 && <p className="py-6 text-center text-[11.5px] text-ink-500">Say something to the room.</p>}
              {chat.map((c) => (
                <div key={c.id}>
                  <p className="text-[10.5px] font-bold text-brand-300">{c.name}</p>
                  <p className="text-[12px] text-ink-200">{c.body}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 border-t border-white/10 p-2">
              <input
                className="w-full rounded-lg bg-white/10 px-2.5 py-1.5 text-[12px] text-white outline-none placeholder:text-ink-500"
                placeholder="Message…"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              />
              <button type="button" onClick={sendChat} className="rounded-lg bg-brand-600 p-2 text-white"><Send size={13} /></button>
            </div>
          </aside>
        )}
      </div>

      <footer className="flex items-center justify-center gap-2 border-t border-white/10 px-3 py-3">
        <CallButton active={micOn} onClick={toggleMic} onIcon={<Mic size={17} />} offIcon={<MicOff size={17} />} label={micOn ? 'Mute' : 'Unmute'} />
        <CallButton active={camOn} onClick={() => void toggleCam()} onIcon={<Video size={17} />} offIcon={<VideoOff size={17} />} label={camOn ? 'Stop video' : 'Start video'} />
        <CallButton active={sharing} onClick={() => void toggleShare()} onIcon={<Monitor size={17} />} offIcon={<MonitorOff size={17} />} label={sharing ? 'Stop sharing' : 'Share screen'} highlight />
        <CallButton active={handRaised} onClick={toggleHand} onIcon={<Hand size={17} />} offIcon={<Hand size={17} />} label={handRaised ? 'Lower hand' : 'Raise hand'} />
        <button type="button" onClick={() => void leave()} className="ml-1 flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2.5 text-[12.5px] font-bold text-white transition hover:bg-rose-500">
          <PhoneOff size={16} /> Leave
        </button>
      </footer>
    </div>
  );
}

function CallButton({
  active, onClick, onIcon, offIcon, label, highlight,
}: { active: boolean; onClick: () => void; onIcon: React.ReactNode; offIcon: React.ReactNode; label: string; highlight?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-xl transition active:scale-95',
        active
          ? highlight
            ? 'bg-brand-600 text-white shadow-[0_10px_24px_-10px_rgba(54,101,255,0.9)]'
            : 'bg-white/15 text-white'
          : 'bg-white/5 text-ink-400 hover:bg-white/10 hover:text-white',
      )}
    >
      {active ? onIcon : offIcon}
    </button>
  );
}

function VideoTile({
  tile, large, small,
}: {
  tile: { key: string; name: string; color: string; stream: MediaStream | null; muted: boolean; cameraOn: boolean; sharing: boolean; handRaised: boolean; isSelf: boolean };
  large?: boolean;
  small?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && tile.stream) {
      ref.current.srcObject = tile.stream;
    }
  }, [tile.stream]);

  const showVideo = tile.cameraOn && !!tile.stream;

  return (
    <div className={cn(
      'relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-ink-900',
      large ? 'min-h-0 flex-1' : small ? 'h-20 w-28 shrink-0' : 'min-h-[140px]',
    )}>
      {showVideo ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={tile.isSelf}
          className={cn('h-full w-full object-cover', tile.isSelf && !tile.sharing && '-scale-x-100')}
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Avatar name={tile.name} color={tile.color} size={small ? 30 : 56} />
          {!small && <span className="text-[11.5px] text-ink-400">{tile.isSelf ? 'Camera off' : 'Camera off'}</span>}
        </div>
      )}

      <div className={cn('absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4', small && 'pb-1 pt-3')}>
        <span className={cn('truncate font-semibold text-white', small ? 'text-[10px]' : 'text-[11.5px]')}>{tile.name}</span>
        <span className="flex shrink-0 items-center gap-1">
          {tile.sharing && <Badge tone="green" className="!px-1.5 !py-0 !text-[9px]">sharing</Badge>}
          {tile.handRaised && <span className="text-[13px]">✋</span>}
          {tile.muted ? <MicOff size={small ? 10 : 12} className="text-rose-400" /> : <Mic size={small ? 10 : 12} className="text-emerald-400" />}
        </span>
      </div>
    </div>
  );
}

export { Settings2, Users, ShieldCheck };
