import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight, Check, Copy, CornerUpLeft, Download, FileText, MoreHorizontal, Pencil, Pin,
  Reply, SmilePlus, Trash2, X,
} from 'lucide-react';
import type { Membership, Message } from '@/lib/types';
import { cn, clockTime, copyText, dayLabel, isEmojiOnly } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { Avatar, IconButton } from './ui';
import { RichText } from './RichText';
import { EMOJIS } from './Composer';

interface MessageListProps {
  channelId: string;
  messages: Message[];
  members: Membership[];
  onOpenThread: (message: Message) => void;
}

const QUICK_REACTIONS = ['👍', '🎉', '❤️', '😄', '🚀', '👀'];

export function MessageList({ channelId, messages, members, onOpenThread }: MessageListProps) {
  const { user, can, editMessage, deleteMessage, react, toast } = useApp();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem('egan.pulse.pins') || '[]')));

  const mentionNames = useMemo(() => members.map((m) => m.user?.name || '').filter(Boolean), [members]);
  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.userId, m.user])), [members]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 260;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [channelId]);

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('egan.pulse.pins', JSON.stringify([...next]));
      return next;
    });
  };

  let lastDay = '';
  let lastAuthor = '';

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-2 py-4 sm:px-4">
      <div className="mx-auto max-w-4xl">
        {messages.map((m, idx) => {
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const grouped = !showDay && lastAuthor === m.authorId && m.parentId === null && idx > 0
            && new Date(m.createdAt).getTime() - new Date(messages[idx - 1].createdAt).getTime() < 5 * 60000;
          lastAuthor = m.authorId;

          const isMine = m.authorId === user?.id;
          const canEditAny = can('message.deleteAny');
          const canModify = isMine || canEditAny;
          const author = m.author || memberById[m.authorId] || { name: 'Unknown', avatarColor: '#717c97' };
          const editing = editingId === m.id;
          const pinned = pinnedIds.has(m.id);
          const jumbo = isEmojiOnly(m.body) && m.attachments.length === 0;

          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-[rgb(var(--border))]" />
                  <span className="rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-muted bordered">{day}</span>
                  <div className="h-px flex-1 bg-[rgb(var(--border))]" />
                </div>
              )}

              <div
                className={cn(
                  'group relative rounded-xl px-2 transition-colors sm:px-3',
                  grouped ? 'py-0.5' : 'pt-2 pb-1',
                  'hover:bg-ink-100/60 dark:hover:bg-white/[0.035]',
                )}
              >
                <div className="flex gap-2.5">
                  <div className="w-9 shrink-0 pt-0.5">
                    {!grouped ? (
                      <Avatar name={author.name} color={author.avatarColor} url={author.avatarUrl} size={36} />
                    ) : (
                      <span className="hidden select-none pt-1 text-[10px] text-muted group-hover:inline">{clockTime(m.createdAt)}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {!grouped && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[13.5px] font-bold">{author.name}</span>
                        {author.isBot && <span className="rounded bg-brand-50 px-1.5 text-[9.5px] font-bold uppercase text-brand-600 dark:bg-brand-500/20 dark:text-brand-300">bot</span>}
                        <span className="text-[11px] text-muted">{clockTime(m.createdAt)}</span>
                        {pinned && <Pin size={11} className="text-amber-500" />}
                        {m.editedAt && <span className="text-[10.5px] text-muted">(edited)</span>}
                        {m.pending && <span className="text-[10.5px] text-muted">sending…</span>}
                        {m.failed && <span className="text-[10.5px] font-semibold text-rose-500">not sent</span>}
                      </div>
                    )}

                    {editing ? (
                      <div className="mt-1">
                        <textarea
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingId(null);
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (draft.trim()) void editMessage(m.id, channelId, draft.trim());
                              setEditingId(null);
                            }
                          }}
                          rows={Math.min(8, draft.split('\n').length + 1)}
                          className="input text-[14px]"
                        />
                        <div className="mt-1.5 flex items-center gap-2">
                          <button type="button" className="btn-primary h-8 px-3 text-[12px]" onClick={() => { if (draft.trim()) void editMessage(m.id, channelId, draft.trim()); setEditingId(null); }}>
                            <Check size={13} /> Save
                          </button>
                          <button type="button" className="btn-ghost h-8 px-2.5 text-[12px]" onClick={() => setEditingId(null)}>Cancel</button>
                          <span className="text-[11px] text-muted">Esc to cancel</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.body && (
                          jumbo
                            ? <p className="text-[30px] leading-tight">{m.body}</p>
                            : <RichText body={m.body} mentionNames={mentionNames} />
                        )}
                        {m.attachments.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {m.attachments.map((a, i) => {
                              const isImage = a.mime?.startsWith('image/');
                              return isImage ? (
                                <a key={`${a.url}-${i}`} href={a.url} target="_blank" rel="noreferrer" className="group/img block overflow-hidden rounded-xl border bordered">
                                  <img src={a.url} alt={a.name} loading="lazy" decoding="async" className="max-h-52 max-w-full object-cover transition group-hover/img:scale-[1.02]" />
                                </a>
                              ) : (
                                <a key={`${a.url}-${i}`} href={a.url} target="_blank" rel="noreferrer" download
                                  className="flex items-center gap-2 rounded-xl border bg-[rgb(var(--surface-2))] px-3 py-2 text-[12px] font-semibold transition hover:border-brand-300 bordered">
                                  <FileText size={15} className="text-brand-600" />
                                  <span className="max-w-[180px] truncate">{a.name}</span>
                                  <Download size={13} className="text-muted" />
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}

                    {(m.reactions.length > 0 || m.replyCount > 0) && !editing && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {m.reactions.map((r) => (
                          <button
                            key={r.emoji}
                            type="button"
                            onClick={() => void react(m.id, channelId, r.emoji)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold transition',
                              r.mine
                                ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-400/40 dark:bg-brand-500/20 dark:text-brand-200'
                                : 'border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-muted hover:border-brand-300',
                            )}
                          >
                            <span className="text-[13px]">{r.emoji}</span>
                            {r.count}
                          </button>
                        ))}
                        {m.replyCount > 0 && (
                          <button
                            type="button"
                            onClick={() => onOpenThread(m)}
                            className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50/70 px-2 py-0.5 text-[11.5px] font-bold text-brand-700 transition hover:bg-brand-100 dark:border-brand-400/30 dark:bg-brand-500/15 dark:text-brand-200"
                          >
                            <Reply size={11} />
                            {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
                            <ArrowUpRight size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* hover actions */}
                {!editing && (
                  <div className={cn(
                    'absolute right-1 -top-3 z-10 hidden items-center gap-0.5 rounded-xl border bg-[rgb(var(--surface))] p-0.5 shadow-soft group-hover:flex bordered',
                  )}>
                    {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        title={`React ${emoji}`}
                        onClick={() => void react(m.id, channelId, emoji)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[14px] transition hover:bg-ink-100 dark:hover:bg-white/10"
                      >
                        {emoji}
                      </button>
                    ))}
                    <div className="relative">
                      <IconButton label="More reactions" onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)} className="h-7 w-7">
                        <SmilePlus size={14} />
                      </IconButton>
                      {pickerFor === m.id && (
                        <>
                          <button type="button" aria-label="close" className="fixed inset-0 z-10" onClick={() => setPickerFor(null)} />
                          <div className="absolute right-0 top-8 z-20 w-[232px] rounded-xl border bg-[rgb(var(--surface))] p-1.5 shadow-lift bordered">
                            <div className="grid grid-cols-8 gap-0.5">
                              {EMOJIS.slice(0, 40).map((e) => (
                                <button key={e} type="button" onClick={() => { void react(m.id, channelId, e); setPickerFor(null); }}
                                  className="flex h-6 w-6 items-center justify-center rounded text-[13px] hover:bg-ink-100 dark:hover:bg-white/10">{e}</button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <IconButton label="Reply in thread" onClick={() => onOpenThread(m)} className="h-7 w-7"><Reply size={14} /></IconButton>
                    <IconButton label={pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(m.id)} className="h-7 w-7" active={pinned}><Pin size={14} /></IconButton>
                    <div className="relative">
                      <IconButton label="More actions" onClick={() => setMenuFor(menuFor === m.id ? null : m.id)} className="h-7 w-7">
                        <MoreHorizontal size={14} />
                      </IconButton>
                      {menuFor === m.id && (
                        <>
                          <button type="button" aria-label="close" className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                          <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-xl border bg-[rgb(var(--surface))] py-1 shadow-lift bordered">
                            <MenuItem icon={<Copy size={13} />} label="Copy text" onClick={() => { void copyText(m.body); setMenuFor(null); toast({ title: 'Copied', tone: 'success' }); }} />
                            <MenuItem icon={<CornerUpLeft size={13} />} label="Reply in thread" onClick={() => { onOpenThread(m); setMenuFor(null); }} />
                            {isMine && <MenuItem icon={<Pencil size={13} />} label="Edit message" onClick={() => { setDraft(m.body); setEditingId(m.id); setMenuFor(null); }} />}
                            {canModify && (
                              <MenuItem
                                icon={<Trash2 size={13} />}
                                label="Delete message"
                                danger
                                onClick={() => { void deleteMessage(m.id, channelId); setMenuFor(null); }}
                              />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} className="h-2" />
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] font-semibold transition',
        danger ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/15' : 'hover:bg-ink-100 dark:hover:bg-white/[0.06]',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export { X };
