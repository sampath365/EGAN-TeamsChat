import { clsx } from 'clsx';

export const cn = (...parts: Parameters<typeof clsx>) => clsx(...parts);

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (diff < 45000) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function dueLabel(date: string | null): { text: string; tone: 'muted' | 'warn' | 'danger' | 'ok' } {
  if (!date) return { text: 'No due date', tone: 'muted' };
  const due = new Date(`${date}T23:59:59`).getTime();
  const days = Math.ceil((due - Date.now()) / 86400000);
  if (days < 0) return { text: `Overdue by ${Math.abs(days)}d`, tone: 'danger' };
  if (days === 0) return { text: 'Due today', tone: 'danger' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'warn' };
  if (days <= 3) return { text: `Due in ${days}d`, tone: 'warn' };
  return { text: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), tone: 'ok' };
}

export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s)+$/u.test(trimmed) && trimmed.length <= 12;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function uid(prefix = 'tmp'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
