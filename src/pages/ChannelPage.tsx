import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FolderOpen, Hash, Info, Lock, Pin, Plus, Search, StickyNote, Users, X, FileText, Download,
  Trash2, Video, Check, Edit3, Sparkles,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { Attachment, FileRow, Message, Note } from '@/lib/types';
import { cn, formatBytes, timeAgo } from '@/lib/utils';
import { Avatar, Badge, EmptyState, IconButton, Modal, Spinner, Tabs } from '@/components/ui';
import { MessageList } from '@/components/MessageList';
import { Composer } from '@/components/Composer';
import { RichText } from '@/components/RichText';

type Tab = 'chat' | 'files' | 'notes';

export function ChannelPage() {
  const { channelId = '' } = useParams();
  const {
    channels, members, messages, user, typing, online, loadMessages, sendMessage, sendTyping,
    addChannelMembers, updateChannel, can, toast, createNote, updateNote, channelNotes, channelFiles,
    createCall, team,
  } = useApp();

  const [tab, setTab] = useState<Tab>('chat');
  const [thread, setThread] = useState<Message | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [editTopic, setEditTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');
  const [callOpen, setCallOpen] = useState(false);
  const [callTitle, setCallTitle] = useState('');

  const channel = channels.find((c) => c.id === channelId);
  const list = messages[channelId] || [];
  const typingHere = (typing[channelId] || []).filter((t) => t.name !== user?.name);

  useEffect(() => {
    setTab('chat');
    setThread(null);
    setLoading(true);
    loadMessages(channelId)
      .catch((e) => toast({ title: 'Could not load messages', body: e.message, tone: 'error' }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    if (channel) setTopicDraft(channel.topic || '');
  }, [channel?.id, channel?.topic]);

  const uploadFile = useCallback(async (file: File, onProgress: (p: number) => void): Promise<Attachment | null> => {
    try {
      const { file: row } = await api.upload(channelId, file, onProgress);
      return { name: row.name, url: row.url, size: row.size, mime: row.mime };
    } catch (e: any) {
      toast({ title: 'Upload failed', body: e.message, tone: 'error' });
      return null;
    }
  }, [channelId, toast]);

  const handleSend = async (body: string, opts: { mentions: string[]; attachments: Attachment[] }) => {
    await sendMessage(channelId, body, opts);
  };

  if (!channel) {
    return (
      <div className="flex h-full items-center justify-center">
        {loading ? <Spinner size={22} /> : <EmptyState title="Channel not found" body="It may have been archived or you no longer have access." />}
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5 backdrop-blur sm:px-4 bordered">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {channel.isPrivate ? <Lock size={15} className="text-muted" /> : <Hash size={16} className="text-muted" />}
              <h1 className="truncate text-[15px] font-extrabold">{channel.name}</h1>
              {channel.isPrivate && <Badge tone="violet">private</Badge>}
            </div>
            {editTopic ? (
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void updateChannel(channelId, { topic: topicDraft }).then(() => setEditTopic(false));
                    }
                    if (e.key === 'Escape') setEditTopic(false);
                  }}
                  className="input h-7 py-1 text-[12px]"
                  placeholder="Add a topic for this channel"
                />
                <IconButton label="Save topic" onClick={() => void updateChannel(channelId, { topic: topicDraft }).then(() => setEditTopic(false))} className="h-7 w-7">
                  <Check size={14} />
                </IconButton>
              </div>
            ) : (
              <button type="button" onClick={() => can('channel.manage') && setEditTopic(true)} className="mt-0.5 block max-w-full truncate text-left text-[11.5px] text-muted hover:text-ink-700 dark:hover:text-ink-200">
                {channel.topic || 'Add a topic'}
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <div className="mr-1 hidden items-center -space-x-1.5 sm:flex">
              {channel.memberIds.slice(0, 3).map((id) => {
                const m = members.find((x) => x.userId === id);
                if (!m) return null;
                return <Avatar key={id} name={m.user.name} color={m.user.avatarColor} size={22} online={online.has(id)} ring />;
              })}
              {channel.memberIds.length > 3 && <span className="pl-2 text-[11px] font-semibold text-muted">+{channel.memberIds.length - 3}</span>}
            </div>
            <IconButton label="Start a meeting" onClick={() => { setCallTitle(`${channel.name} huddle`); setCallOpen(true); }}><Video size={16} /></IconButton>
            <IconButton label="Add people" onClick={() => setAddPeopleOpen(true)}><Users size={16} /></IconButton>
            <IconButton label="Channel details" onClick={() => setDetailsOpen((v) => !v)} active={detailsOpen}><Info size={16} /></IconButton>
          </div>
        </header>

        <div className="border-b px-3 py-1.5 bordered">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v)}
            tabs={[
              { key: 'chat', label: 'Chat', icon: <Hash size={13} /> },
              { key: 'files', label: 'Files', icon: <FolderOpen size={13} /> },
              { key: 'notes', label: 'Notes', icon: <StickyNote size={13} /> },
            ]}
          />
        </div>

        {tab === 'chat' && (
          <>
            <div className="flex-1 overflow-hidden">
              {loading ? (
                <div className="flex h-full items-center justify-center"><Spinner size={22} /></div>
              ) : list.length === 0 ? (
                <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center px-6 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl grad-brand text-white">
                    {channel.isPrivate ? <Lock size={24} /> : <Hash size={26} />}
                  </div>
                  <p className="text-base font-extrabold">This is the start of #{channel.name}</p>
                  <p className="mt-1 text-[12.5px] text-muted">{channel.topic || 'Say hi and set the tone for the channel.'}</p>
                </div>
              ) : (
                <MessageList channelId={channelId} messages={list} members={members} onOpenThread={setThread} />
              )}
            </div>

            <div className="border-t px-2 py-2 sm:px-4 bordered">
              <div className="mx-auto max-w-4xl">
                <div className="mb-1.5 h-4 px-1 text-[11px] text-muted">
                  {typingHere.length > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="flex gap-0.5">
                        {[0, 1, 2].map((i) => <span key={i} className="h-1 w-1 rounded-full bg-brand-500 animate-bounce-dot" style={{ animationDelay: `${i * 0.12}s` }} />)}
                      </span>
                      {typingHere.length === 1 ? `${typingHere[0].name} is typing…` : `${typingHere.length} people are typing…`}
                    </span>
                  )}
                </div>
                <Composer
                  channelName={channel.name}
                  members={members}
                  onSend={handleSend}
                  onTyping={(active) => sendTyping(channelId, active)}
                  onAttach={uploadFile}
                  autoFocus
                />
              </div>
            </div>
          </>
        )}

        {tab === 'files' && <FilesTab channelId={channelId} members={members} load={channelFiles} />}
        {tab === 'notes' && <NotesTab channelId={channelId} load={channelNotes} create={createNote} update={updateNote} members={members} />}
      </div>

      {/* details rail */}
      {detailsOpen && (
        <aside className="hidden w-[290px] shrink-0 overflow-y-auto border-l bg-[rgb(var(--surface-2))] p-4 lg:block bordered animate-slide-left">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[13px] font-bold">Channel details</h3>
            <IconButton label="Close" onClick={() => setDetailsOpen(false)}><X size={15} /></IconButton>
          </div>
          <div className="card p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Topic</p>
            <p className="mt-1 text-[12.5px]">{channel.topic || 'No topic yet'}</p>
            <div className="mt-3 flex items-center justify-between text-[11.5px]">
              <span className="text-muted">Created</span>
              <span className="font-semibold">{timeAgo(channel.createdAt)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11.5px]">
              <span className="text-muted">Members</span>
              <span className="font-semibold">{channel.memberIds.length}</span>
            </div>
          </div>
          <p className="mb-2 mt-4 px-1 text-[10.5px] font-bold uppercase tracking-wider text-muted">Members</p>
          <div className="space-y-0.5">
            {channel.memberIds.map((id) => {
              const m = members.find((x) => x.userId === id);
              if (!m) return null;
              return (
                <div key={id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-ink-100 dark:hover:bg-white/[0.05]">
                  <Avatar name={m.user.name} color={m.user.avatarColor} size={26} online={online.has(id)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold">{m.user.name}</p>
                    <p className="truncate text-[10.5px] text-muted">{m.user.title || m.role}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {thread && <ThreadPanel parent={thread} onClose={() => setThread(null)} members={members} />}

      <Modal
        open={addPeopleOpen}
        onClose={() => setAddPeopleOpen(false)}
        title={`Add people to #${channel.name}`}
        subtitle="Everyone in the team can be added to this channel."
      >
        <AddPeopleList
          members={members}
          exclude={channel.memberIds}
          onAdd={async (ids) => {
            await addChannelMembers(channelId, ids);
            toast({ title: 'People added', tone: 'success' });
            setAddPeopleOpen(false);
          }}
        />
      </Modal>

      <Modal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        title="Start a meeting"
        subtitle="Audio, video and screen sharing included."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setCallOpen(false)}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                try {
                  const call = await createCall({ title: callTitle || `${channel.name} huddle`, channelId });
                  setCallOpen(false);
                  window.location.hash = `#/meeting/${call.id}`;
                } catch (e: any) {
                  toast({ title: 'Could not start meeting', body: e.message, tone: 'error' });
                }
              }}
            >
              <Video size={15} /> Start meeting
            </button>
          </>
        }
      >
        <label className="label">Meeting title</label>
        <input className="input" value={callTitle} onChange={(e) => setCallTitle(e.target.value)} placeholder="Weekly sync" />
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50/60 px-3 py-2 text-[11.5px] text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
          <Sparkles size={13} className="mt-0.5 shrink-0" />
          Everyone in {team?.name} gets a notification. Screen sharing and participant tiles are on by default.
        </p>
      </Modal>
    </div>
  );
}

/* --------------------------------------------------------------- threads */

function ThreadPanel({ parent, onClose, members }: { parent: Message; onClose: () => void; members: ReturnType<typeof useApp>['members'] }) {
  const { sendMessage, toast } = useApp();
  const [replies, setReplies] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [parentState, setParentState] = useState(parent);

  const load = useCallback(async () => {
    try {
      const { parent: p, replies: rows } = await api.thread(parent.id);
      setParentState(p);
      setReplies(rows);
    } catch (e: any) {
      toast({ title: 'Could not load thread', body: e.message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [parent.id, toast]);

  useEffect(() => { void load(); }, [load]);

  const author = members.find((m) => m.userId === parentState.authorId)?.user || parentState.author;

  return (
    <aside className="fixed inset-0 z-40 flex flex-col border-l bg-[rgb(var(--surface))] sm:static sm:inset-auto sm:z-auto sm:w-[380px] sm:shrink-0 bordered animate-slide-left">
      <header className="flex items-center justify-between border-b px-3 py-2.5 bordered">
        <div className="flex items-center gap-2">
          <h3 className="text-[13.5px] font-bold">Thread</h3>
          <Badge tone="brand">{replies.length + 1} messages</Badge>
        </div>
        <IconButton label="Close thread" onClick={onClose}><X size={16} /></IconButton>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="rounded-xl border bg-[rgb(var(--surface-2))] p-2.5 bordered">
          <div className="flex items-center gap-2">
            <Avatar name={author.name} color={author.avatarColor} size={26} />
            <span className="text-[12.5px] font-bold">{author.name}</span>
            <span className="text-[10.5px] text-muted">{timeAgo(parentState.createdAt)}</span>
          </div>
          <div className="mt-1.5"><RichText body={parentState.body} mentionNames={members.map((m) => m.user?.name || '')} /></div>
        </div>

        <div className="my-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-[rgb(var(--border))]" />
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
          <div className="h-px flex-1 bg-[rgb(var(--border))]" />
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : replies.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-muted">No replies yet — start the conversation.</p>
        ) : (
          <div className="space-y-3">
            {replies.map((r) => {
              const ra = members.find((m) => m.userId === r.authorId)?.user || r.author;
              return (
                <div key={r.id} className="flex gap-2">
                  <Avatar name={ra.name} color={ra.avatarColor} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-bold">{ra.name}</span>
                      <span className="text-[10px] text-muted">{timeAgo(r.createdAt)}</span>
                    </div>
                    <RichText body={r.body} mentionNames={members.map((m) => m.user?.name || '')} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t p-2.5 bordered">
        <Composer
          channelName="thread"
          members={members}
          placeholder="Reply to thread…"
          compact
          autoFocus
          onSend={async (body, opts) => {
            const msg = await sendMessage(parent.channelId, body, { ...opts, parentId: parent.id });
            if (msg) {
              setReplies((prev) => [...prev, msg]);
              setParentState((p) => ({ ...p, replyCount: p.replyCount + 1 }));
            }
          }}
        />
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ files */

function FilesTab({ channelId, members, load }: { channelId: string; members: ReturnType<typeof useApp>['members']; load: (id: string) => Promise<FileRow[]> }) {
  const { user, toast } = useApp();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setFiles(await load(channelId));
    } finally {
      setLoading(false);
    }
  }, [channelId, load]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-8" placeholder="Search files…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
            <Plus size={15} /> Upload
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={async (e) => {
              const list = e.target.files;
              if (!list) return;
              for (const file of Array.from(list)) {
                try {
                  await api.upload(channelId, file);
                } catch (err: any) {
                  toast({ title: 'Upload failed', body: err.message, tone: 'error' });
                }
              }
              e.target.value = '';
              await refresh();
            }}
          />
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<FolderOpen size={20} />} title="No files yet" body="Drop in a spec, a design or a report — everyone in the channel can download it." />
        ) : (
          <div className="overflow-hidden rounded-2xl border bordered">
            {filtered.map((f, i) => {
              const uploader = members.find((m) => m.userId === f.uploaderId)?.user;
              return (
                <div key={f.id} className={cn('flex items-center gap-3 px-3 py-2.5 transition hover:bg-ink-50 dark:hover:bg-white/[0.04]', i > 0 && 'border-t bordered')}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                    <FileText size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{f.name}</p>
                    <p className="text-[11px] text-muted">{formatBytes(f.size)} · {uploader?.name || 'Someone'} · {timeAgo(f.createdAt)}</p>
                  </div>
                  <a href={f.url} download target="_blank" rel="noreferrer" className="btn-outline h-8 px-2.5 text-[11.5px]">
                    <Download size={13} /> Download
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ notes */

function NotesTab({
  channelId, load, create, update, members,
}: {
  channelId: string;
  load: (id: string) => Promise<Note[]>;
  create: (id: string, input: { title?: string; body?: string }) => Promise<Note>;
  update: (id: string, input: { title?: string; body?: string }) => Promise<Note>;
  members: ReturnType<typeof useApp>['members'];
}) {
  const { user, toast } = useApp();
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await load(channelId);
      setNotes(rows);
      if (rows[0] && !activeId) {
        setActiveId(rows[0].id);
        setTitle(rows[0].title);
        setBody(rows[0].body);
      }
    } finally {
      setLoading(false);
    }
  }, [channelId, load, activeId]);

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [channelId]);

  const active = notes.find((n) => n.id === activeId) || null;

  const save = async () => {
    setSaving(true);
    try {
      if (active) {
        const updated = await update(active.id, { title, body });
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      } else {
        const created = await create(channelId, { title: title || 'Untitled note', body });
        setNotes((prev) => [created, ...prev]);
        setActiveId(created.id);
      }
      toast({ title: 'Note saved', tone: 'success' });
    } catch (e: any) {
      toast({ title: 'Could not save note', body: e.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="hidden w-56 shrink-0 overflow-y-auto border-r p-2 sm:block bordered">
        <button
          type="button"
          onClick={() => { setActiveId(null); setTitle(''); setBody(''); }}
          className="mb-2 flex w-full items-center gap-1.5 rounded-xl bg-brand-600 px-2.5 py-2 text-[12px] font-bold text-white"
        >
          <Plus size={13} /> New note
        </button>
        {loading ? (
          <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-9" />)}</div>
        ) : (
          notes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => { setActiveId(n.id); setTitle(n.title); setBody(n.body); }}
              className={cn(
                'block w-full truncate rounded-xl px-2.5 py-2 text-left text-[12.5px] font-semibold transition',
                activeId === n.id ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'hover:bg-ink-100 dark:hover:bg-white/[0.06]',
              )}
            >
              {n.title}
            </button>
          ))
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          <input
            className="mb-2 border-0 bg-transparent text-[19px] font-extrabold outline-none placeholder:text-ink-400"
            placeholder="Note title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="mb-2 flex items-center gap-2 text-[11px] text-muted">
            <Edit3 size={12} />
            {active ? `Last edited ${timeAgo(active.updatedAt)}` : 'New note — markdown supported'}
          </div>
          <textarea
            className="min-h-0 flex-1 resize-none rounded-2xl border bg-[rgb(var(--surface-2))] p-3 font-mono text-[12.5px] leading-relaxed outline-none focus:border-brand-400 bordered"
            placeholder={'# Heading\n\nWrite your team knowledge here. Markdown works.'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted">Markdown supported</span>
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : active ? 'Save changes' : 'Create note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ add people */

function AddPeopleList({ members, exclude, onAdd }: { members: ReturnType<typeof useApp>['members']; exclude: string[]; onAdd: (ids: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const candidates = members.filter(
    (m) => !exclude.includes(m.userId) && m.user?.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-8" placeholder="Search people…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="max-h-64 space-y-0.5 overflow-y-auto">
        {candidates.length === 0 && <p className="py-6 text-center text-[12px] text-muted">Everyone is already here.</p>}
        {candidates.map((m) => (
          <label key={m.userId} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-ink-100 dark:hover:bg-white/[0.06]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded"
              checked={selected.includes(m.userId)}
              onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, m.userId] : prev.filter((id) => id !== m.userId)))}
            />
            <Avatar name={m.user.name} color={m.user.avatarColor} size={28} />
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold">{m.user.name}</p>
              <p className="truncate text-[10.5px] text-muted">{m.user.title || m.role}</p>
            </div>
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="btn-primary"
          disabled={selected.length === 0 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onAdd(selected);
            } finally {
              setBusy(false);
            }
          }}
        >
          Add {selected.length > 0 ? selected.length : ''} {selected.length === 1 ? 'person' : 'people'}
        </button>
      </div>
    </div>
  );
}

export { Trash2, Pin };
