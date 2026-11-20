import { useEffect, useState } from 'react';
import { BarChart3, Check, Clock, Lock, Plus, Trash2, Users, X } from 'lucide-react';

import type { Poll } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { Badge, IconButton, Spinner } from './ui';

export function PollCard({
  poll, onVote, canClose, onClose,
}: {
  poll: Poll;
  onVote: (optionId: string) => Promise<void>;
  canClose: boolean;
  onClose: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const closed = poll.closed || (poll.closesAt ? new Date(poll.closesAt).getTime() < Date.now() : false);
  const hasVoted = poll.myVotes.length > 0;
  const showResults = hasVoted || closed;

  return (
    <div className="my-1.5 rounded-2xl border bg-[rgb(var(--surface))] p-3 shadow-soft bordered">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <BarChart3 size={13} />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold leading-snug">{poll.question}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted">
              <span>{poll.createdBy?.name}</span>
              <span>·</span>
              <span>{timeAgo(poll.createdAt)}</span>
              {poll.allowMultiple && <Badge tone="brand">multi-choice</Badge>}
              {poll.anonymous && <Badge tone="violet">anonymous</Badge>}
              {closed && <Badge tone="neutral">closed</Badge>}
            </p>
          </div>
        </div>
        {canClose && !closed && (
          <IconButton label="Close poll" onClick={() => void onClose()} className="h-7 w-7">
            <Lock size={13} />
          </IconButton>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5">
        {poll.options.map((o) => {
          const mine = poll.myVotes.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              disabled={closed || busy !== null}
              onClick={async () => {
                setBusy(o.id);
                try {
                  await onVote(o.id);
                } finally {
                  setBusy(null);
                }
              }}
              className={cn(
                'relative flex w-full items-center gap-2 overflow-hidden rounded-xl border px-2.5 py-2 text-left transition bordered',
                mine ? 'border-brand-400 bg-brand-50/70 dark:border-brand-400/40 dark:bg-brand-500/15' : 'hover:border-brand-300 hover:bg-ink-50 dark:hover:bg-white/[0.05]',
                closed && 'cursor-default opacity-90',
              )}
            >
              {showResults && (
                <span
                  className={cn('absolute inset-y-0 left-0 transition-all', mine ? 'bg-brand-200/50 dark:bg-brand-400/20' : 'bg-ink-100 dark:bg-white/[0.06]')}
                  style={{ width: `${o.percent}%` }}
                />
              )}
              <span className={cn('relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', mine ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300 dark:border-white/25')}>
                {(mine || busy === o.id) && (busy === o.id ? <Spinner size={9} /> : <Check size={10} />)}
              </span>
              <span className="relative min-w-0 flex-1 truncate text-[12.5px] font-semibold">{o.text}</span>
              {showResults && (
                <span className="relative shrink-0 text-[11.5px] font-bold text-muted">
                  {o.percent}% <span className="font-normal">({o.count})</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-[10.5px] text-muted">
        <span className="flex items-center gap-1"><Users size={10} /> {poll.votersCount} {poll.votersCount === 1 ? 'voter' : 'voters'}</span>
        {poll.closesAt && !closed && (
          <span className="flex items-center gap-1"><Clock size={10} /> closes {new Date(poll.closesAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        )}
        {!hasVoted && !closed && <span>Tap an option to vote</span>}
      </div>
    </div>
  );
}

export function PollComposer({
  open, onClose, onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { question: string; options: string[]; allowMultiple: boolean; anonymous: boolean }) => Promise<void>;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setOptions(['', '']);
      setAllowMultiple(false);
      setAnonymous(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const clean = options.map((o) => o.trim()).filter(Boolean);

  const submit = async () => {
    setError(null);
    if (!question.trim()) return setError('Add a question.');
    if (clean.length < 2) return setError('Add at least two options.');
    setBusy(true);
    try {
      await onCreate({ question: question.trim(), options: clean, allowMultiple, anonymous });
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink-950/55 backdrop-blur-[3px] animate-fade-in" />
      <div className="relative w-full overflow-hidden rounded-t-3xl border bg-[rgb(var(--surface))] shadow-lift animate-slide-up sm:max-w-md sm:rounded-3xl bordered">
        <div className="flex items-center justify-between border-b px-4 py-3 bordered">
          <div>
            <h3 className="text-[14px] font-bold">Create a poll</h3>
            <p className="text-[11.5px] text-muted">Ask the channel and see results live.</p>
          </div>
          <IconButton label="Close" onClick={onClose}><X size={16} /></IconButton>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          <label className="label">Question</label>
          <input className="input" autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Where should we do the offsite?" />

          <label className="label mt-3">Options</label>
          <div className="space-y-1.5">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  className="input"
                  value={o}
                  onChange={(e) => setOptions((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                  placeholder={`Option ${i + 1}`}
                />
                {options.length > 2 && (
                  <IconButton label="Remove option" tone="danger" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button type="button" onClick={() => setOptions((prev) => [...prev, ''])} className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-600 dark:text-brand-300">
              <Plus size={12} /> Add option
            </button>
          )}

          <div className="mt-3 space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
              <input type="checkbox" className="h-4 w-4 rounded" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />
              Allow multiple choices
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
              <input type="checkbox" className="h-4 w-4 rounded" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Hide who voted for what
            </label>
          </div>

          {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3 bordered">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void submit()}>
            <BarChart3 size={14} /> {busy ? 'Creating…' : 'Create poll'}
          </button>
        </div>
      </div>
    </div>
  );
}


