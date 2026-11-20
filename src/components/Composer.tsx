import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign, Bold, Code, Italic, Link2, List, Paperclip, Send, Smile, Strikethrough, X, Sparkles,
} from 'lucide-react';
import { cn, isEmojiOnly } from '@/lib/utils';
import type { Attachment, Membership } from '@/lib/types';
import { Avatar, IconButton } from './ui';

const EMOJIS = [
  '😀', '😄', '😁', '😆', '😅', '😂', '🙂', '🙃', '😉', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳',
  '😏', '😌', '😔', '😢', '😭', '😤', '😠', '🤯', '😱', '🤔', '🤗', '🤫', '😴', '🤤', '😷', '🤒',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '✌️', '🤞', '👋', '🫶', '👀', '🧠', '🔥', '✨', '⭐',
  '💯', '✅', '❌', '⚠️', '🚀', '🎉', '🎊', '💡', '📌', '📎', '📈', '📉', '⏰', '☕', '🍕', '🎯',
];

interface ComposerProps {
  channelName: string;
  members: Membership[];
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
  replyTo?: { name: string; body: string } | null;
  onCancelReply?: () => void;
  onSend: (body: string, opts: { mentions: string[]; attachments: Attachment[] }) => Promise<void> | void;
  onTyping?: (active: boolean) => void;
  onAttach?: (file: File, onProgress: (p: number) => void) => Promise<Attachment | null>;
  disabled?: boolean;
}

export function Composer({
  channelName, members, placeholder, compact, autoFocus, replyTo, onCancelReply, onSend, onTyping, onAttach, disabled,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number>(0);

  const filteredMentions = useMemo(() => {
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => m.user && m.user.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [members, mentionQuery]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const signalTyping = () => {
    if (!onTyping) return;
    onTyping(true);
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => onTyping(false), 2200);
  };

  const insertAtCursor = (text: string, wrap = false) => {
    const el = textareaRef.current;
    if (!el) {
      setValue((v) => v + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const next = wrap
      ? `${value.slice(0, start)}${text}${selected || 'text'}${text}${value.slice(end)}`
      : `${value.slice(0, start)}${text}${value.slice(end)}`;
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length + (wrap ? (selected || 'text').length : 0);
      el.setSelectionRange(pos, pos);
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    signalTyping();
    const cursor = e.target.selectionStart;
    const upto = next.slice(0, cursor);
    const match = /@([\w]*)$/.exec(upto);
    if (match) {
      setMentionQuery(match[1]);
      setMentionOpen(true);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
    }
  };

  const pickMention = (name: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const upto = value.slice(0, cursor);
    const replaced = upto.replace(/@([\w]*)$/, `@${name} `);
    setValue(replaced + value.slice(cursor));
    setMentionOpen(false);
    requestAnimationFrame(() => el.focus());
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !onAttach) return;
    for (const file of Array.from(files)) {
      setUploading({ name: file.name, pct: 0 });
      try {
        const att = await onAttach(file, (pct) => setUploading({ name: file.name, pct }));
        if (att) setAttachments((prev) => [...prev, att]);
      } finally {
        setUploading(null);
      }
    }
  };

  const submit = async () => {
    const body = value.trim();
    if ((!body && attachments.length === 0) || sending) return;
    setSending(true);
    const mentions = members
      .filter((m) => m.user && body.includes(`@${m.user.name}`))
      .map((m) => m.userId);
    try {
      await onSend(body, { mentions, attachments });
      setValue('');
      setAttachments([]);
      onTyping?.(false);
      textareaRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMentions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMentions.length) % filteredMentions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(filteredMentions[mentionIndex].user.name);
        return;
      }
      if (e.key === 'Escape') {
        setMentionOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className={cn('relative', compact ? 'px-0' : '')}>
      {replyTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border-l-2 border-brand-500 bg-brand-50/60 px-3 py-2 text-[12px] dark:bg-brand-500/10">
          <div className="min-w-0">
            <span className="font-semibold text-brand-700 dark:text-brand-200">Replying to {replyTo.name}</span>
            <p className="truncate text-muted">{replyTo.body}</p>
          </div>
          <IconButton label="Cancel reply" onClick={onCancelReply} className="h-7 w-7">
            <X size={14} />
          </IconButton>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <span key={`${a.url}-${i}`} className="chip max-w-[220px] bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
              <Paperclip size={12} />
              <span className="truncate">{a.name}</span>
              <button type="button" aria-label="Remove attachment" onClick={() => setAttachments((p) => p.filter((_, idx) => idx !== i))}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {uploading && (
        <div className="mb-2 rounded-xl border px-3 py-2 bordered">
          <div className="flex items-center justify-between text-[11.5px] font-semibold">
            <span className="truncate">{uploading.name}</span>
            <span className="text-muted">{uploading.pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${uploading.pct}%` }} />
          </div>
        </div>
      )}

      <div
        className={cn(
          'rounded-2xl border bg-[rgb(var(--surface))] shadow-soft transition focus-within:border-brand-400 focus-within:shadow-glow bordered',
        )}
      >
        <div className="flex items-end gap-1 px-2 pt-2">
          <div className="hidden items-center gap-0.5 pb-2 sm:flex">
            <IconButton label="Bold" onClick={() => insertAtCursor('**', true)} className="h-7 w-7"><Bold size={14} /></IconButton>
            <IconButton label="Italic" onClick={() => insertAtCursor('*', true)} className="h-7 w-7"><Italic size={14} /></IconButton>
            <IconButton label="Strikethrough" onClick={() => insertAtCursor('~~', true)} className="h-7 w-7"><Strikethrough size={14} /></IconButton>
            <IconButton label="Code" onClick={() => insertAtCursor('`', true)} className="h-7 w-7"><Code size={14} /></IconButton>
            <IconButton label="Bullet list" onClick={() => insertAtCursor('\n- ')} className="h-7 w-7"><List size={14} /></IconButton>
            <IconButton label="Link" onClick={() => insertAtCursor('https://')} className="h-7 w-7"><Link2 size={14} /></IconButton>
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={placeholder || `Message #${channelName}`}
            className="max-h-[200px] min-h-[38px] w-full resize-none bg-transparent px-1.5 py-2 text-[14.5px] leading-relaxed outline-none placeholder:text-ink-400"
          />
        </div>

        <div className="flex items-center justify-between gap-1 px-2 pb-2 pt-1">
          <div className="flex items-center gap-0.5">
            <div className="relative">
              <IconButton label="Emoji" onClick={() => setEmojiOpen((v) => !v)} active={emojiOpen} className="h-8 w-8">
                <Smile size={16} />
              </IconButton>
              {emojiOpen && (
                <>
                  <button type="button" aria-label="Close emoji picker" className="fixed inset-0 z-10 cursor-default" onClick={() => setEmojiOpen(false)} />
                  <div className="absolute bottom-11 left-0 z-20 w-[286px] rounded-2xl border bg-[rgb(var(--surface))] p-2 shadow-lift animate-scale-in bordered">
                    <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => {
                            insertAtCursor(e);
                            setEmojiOpen(false);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-ink-100 dark:hover:bg-white/10"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <IconButton label="Attach file" onClick={() => fileRef.current?.click()} className="h-8 w-8" disabled={!onAttach}>
              <Paperclip size={16} />
            </IconButton>
            <IconButton label="Mention someone" onClick={() => { insertAtCursor('@'); setMentionOpen(true); setMentionQuery(''); }} className="h-8 w-8">
              <AtSign size={16} />
            </IconButton>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }} />
            <span className="ml-1 hidden text-[11px] text-muted sm:inline">
              <kbd className="rounded border px-1 py-0.5 text-[10px] bordered">Enter</kbd> to send ·{' '}
              <kbd className="rounded border px-1 py-0.5 text-[10px] bordered">Shift+Enter</kbd> new line
            </span>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={(!value.trim() && attachments.length === 0) || sending || disabled}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-bold text-white transition active:scale-95',
              value.trim() || attachments.length ? 'bg-brand-600 hover:bg-brand-500 shadow-[0_10px_24px_-14px_rgba(32,68,245,0.95)]' : 'bg-ink-300 dark:bg-white/15',
            )}
          >
            {sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send size={15} />}
            Send
          </button>
        </div>
      </div>

      {mentionOpen && filteredMentions.length > 0 && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-2xl border bg-[rgb(var(--surface))] p-1 shadow-lift animate-scale-in bordered">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">Mention</p>
          {filteredMentions.map((m, i) => (
            <button
              key={m.userId}
              type="button"
              onMouseEnter={() => setMentionIndex(i)}
              onClick={() => pickMention(m.user.name)}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] transition',
                i === mentionIndex ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-ink-100 dark:hover:bg-white/[0.06]',
              )}
            >
              <Avatar name={m.user.name} color={m.user.avatarColor} size={22} />
              <span className="truncate font-semibold">{m.user.name}</span>
            </button>
          ))}
        </div>
      )}

      {isEmojiOnly(value) && (
        <span className="pointer-events-none absolute right-3 top-2 hidden items-center gap-1 text-[10px] font-semibold text-muted sm:flex">
          <Sparkles size={11} /> jumbo
        </span>
      )}
    </div>
  );
}

export { EMOJIS };
