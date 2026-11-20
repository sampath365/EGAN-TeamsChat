import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Avatar({
  name, color, size = 36, url, online, ring, className,
}: {
  name: string;
  color?: string;
  size?: number;
  url?: string | null;
  online?: boolean;
  ring?: boolean;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
        background: url ? undefined : `linear-gradient(135deg, ${color || '#3665ff'}, ${shade(color || '#3665ff')})`,
        boxShadow: ring ? `0 0 0 2px rgb(var(--surface)), 0 0 0 3.5px ${color || '#3665ff'}66` : undefined,
      }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" decoding="async" /> : initials}
      {online !== undefined && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2',
            online ? 'bg-emerald-400' : 'bg-ink-400',
          )}
          style={{
            width: Math.max(8, size * 0.28),
            height: Math.max(8, size * 0.28),
            borderColor: 'rgb(var(--surface))',
          }}
        />
      )}
    </span>
  );
}

function shade(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#1b2b89';
  const r = Math.max(0, parseInt(h.slice(0, 2), 16) - 42);
  const g = Math.max(0, parseInt(h.slice(2, 4), 16) - 42);
  const b = Math.max(0, parseInt(h.slice(4, 6), 16) - 42);
  return `rgb(${r}, ${g}, ${b})`;
}

export function IconButton({
  label, onClick, children, active, tone = 'default', className, badge, disabled,
}: {
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  children: ReactNode;
  active?: boolean;
  tone?: 'default' | 'danger' | 'primary';
  className?: string;
  badge?: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-xl transition active:scale-95',
        tone === 'danger'
          ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15'
          : tone === 'primary'
            ? 'bg-brand-600 text-white hover:bg-brand-500'
            : active
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200'
              : 'text-muted hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-white/[0.07] dark:hover:text-ink-100',
        'disabled:opacity-40',
        className,
      )}
    >
      {children}
      {!!badge && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'green' | 'amber' | 'rose' | 'violet'; className?: string }) {
  const tones: Record<string, string> = {
    neutral: 'bg-ink-100 text-ink-600 dark:bg-white/10 dark:text-ink-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Modal({
  open, onClose, title, subtitle, children, footer, wide, sheetOnMobile = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  sheetOnMobile?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/55 backdrop-blur-[3px] animate-fade-in"
      />
      <div
        className={cn(
          'relative flex w-full flex-col overflow-hidden border bg-[rgb(var(--surface))] shadow-lift animate-slide-up sm:animate-scale-in',
          sheetOnMobile ? 'max-h-[92vh] rounded-t-3xl sm:rounded-3xl' : 'rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
          'bordered',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4 bordered">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-1 -mt-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5 bordered">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon, title, body, action,
}: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center bordered">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</div>}
      <p className="text-sm font-bold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[12.5px] text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition',
        checked ? 'bg-brand-600' : 'bg-ink-300 dark:bg-white/15',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          checked ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

export function Tabs<T extends string>({
  tabs, value, onChange,
}: { tabs: { key: T; label: string; icon?: ReactNode; badge?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition',
            value === t.key
              ? 'bg-brand-600 text-white shadow-[0_8px_20px_-12px_rgba(32,68,245,0.9)]'
              : 'text-muted hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-white/[0.07] dark:hover:text-ink-100',
          )}
        >
          {t.icon}
          {t.label}
          {!!t.badge && (
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', value === t.key ? 'bg-white/25' : 'bg-ink-200 text-ink-600 dark:bg-white/10 dark:text-ink-300')}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
