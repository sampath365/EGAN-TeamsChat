import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CornerDownLeft, Hash, KanbanSquare, Search, User as UserIcon, Video } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { SearchResults } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Avatar } from './ui';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type Item =
  | { kind: 'channel'; id: string; label: string; sub: string }
  | { kind: 'message'; id: string; label: string; sub: string; channelId: string }
  | { kind: 'person'; id: string; label: string; sub: string; color: string }
  | { kind: 'task'; id: string; label: string; sub: string }
  | { kind: 'nav'; id: string; label: string; sub: string; to: string };

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { channels, members, user } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const t = window.setTimeout(() => {
      api.search(q).then(setResults).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(t);
  }, [query, open]);

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nav = ([
      { kind: 'nav' as const, id: 'home', label: 'Home', sub: 'Your workspace overview', to: '/home' },
      { kind: 'nav' as const, id: 'tasks', label: 'Tasks', sub: 'Kanban board', to: '/tasks' },
      { kind: 'nav' as const, id: 'meetings', label: 'Meetings', sub: 'Calls and screen sharing', to: '/meetings' },
      { kind: 'nav' as const, id: 'people', label: 'People', sub: 'Team directory', to: '/people' },
    ] satisfies Item[]).filter((n) => !q || n.label.toLowerCase().includes(q));

    if (!q) {
      const chans: Item[] = channels.slice(0, 6).map((c) => ({
        kind: 'channel', id: c.id, label: `#${c.name}`, sub: c.topic || 'Channel',
      }));
      return [...nav, ...chans];
    }

    const channelItems: Item[] = (results?.channels || []).map((c) => ({
      kind: 'channel', id: c.id, label: `#${c.name}`, sub: c.topic || 'Channel',
    }));
    const messageItems: Item[] = (results?.messages || []).slice(0, 6).map((m) => ({
      kind: 'message', id: m.id, label: m.body.slice(0, 70), sub: `${m.author.name} in #${m.channelName}`, channelId: m.channelId,
    }));
    const peopleItems: Item[] = (results?.people || []).slice(0, 5).map((p) => ({
      kind: 'person', id: p.id, label: p.name, sub: p.title || p.email, color: p.avatarColor,
    }));
    const taskItems: Item[] = (results?.tasks || []).slice(0, 5).map((t) => ({
      kind: 'task', id: t.id, label: t.title, sub: `${t.status.replace('_', ' ')} · ${t.priority}`,
    }));
    return [...channelItems, ...messageItems, ...peopleItems, ...taskItems, ...nav];
  }, [query, results, channels]);

  useEffect(() => setActive(0), [items.length]);

  const choose = (item: Item) => {
    onClose();
    switch (item.kind) {
      case 'channel': navigate(`/channel/${item.id}`); break;
      case 'message': navigate(`/channel/${item.channelId}?message=${item.id}`); break;
      case 'person': navigate('/people'); break;
      case 'task': navigate('/tasks'); break;
      case 'nav': navigate(item.to); break;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" aria-label="Close search" onClick={onClose} className="absolute inset-0 bg-ink-950/55 backdrop-blur-[3px] animate-fade-in" />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border bg-[rgb(var(--surface))] shadow-lift animate-scale-in bordered">
        <div className="flex items-center gap-2 border-b px-3.5 py-3 bordered">
          <Search size={16} className="text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter' && items[active]) choose(items[active]);
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search channels, messages, people and tasks…"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-ink-400"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] font-bold text-muted bordered">esc</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-[12.5px] text-muted">
              {query ? 'No matches. Try a different word.' : 'Type to search.'}
            </p>
          )}
          {items.map((item, i) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(item)}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left transition',
                i === active ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-ink-100 dark:hover:bg-white/[0.05]',
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--surface-3))] text-muted">
                {item.kind === 'channel' && <Hash size={13} />}
                {item.kind === 'message' && <Search size={13} />}
                {item.kind === 'person' && <Avatar name={item.label} color={(item as any).color} size={22} />}
                {item.kind === 'task' && <KanbanSquare size={13} />}
                {item.kind === 'nav' && <ArrowRight size={13} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{item.label}</span>
                <span className="block truncate text-[10.5px] text-muted">{item.sub}</span>
              </span>
              {i === active && <CornerDownLeft size={12} className="shrink-0 text-muted" />}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-[10.5px] text-muted bordered">
          <span className="flex items-center gap-2">
            <kbd className="rounded border px-1 py-0.5 bordered">↑</kbd>
            <kbd className="rounded border px-1 py-0.5 bordered">↓</kbd> navigate
            <kbd className="rounded border px-1 py-0.5 bordered">↵</kbd> open
          </span>
          <span>Signed in as {user?.name}</span>
        </div>
      </div>
    </div>
  );
}

export { UserIcon, Video };
