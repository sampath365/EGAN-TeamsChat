import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock, Mail, Sparkles, User as UserIcon, Video, MessageSquare, ShieldCheck, KanbanSquare } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';

const DEMO = [
  { email: 'aarav@egan.in', label: 'Aarav Mehta', role: 'Owner' },
  { email: 'priya@egan.in', label: 'Priya Nair', role: 'Admin' },
  { email: 'rohit@egan.in', label: 'Rohit Verma', role: 'Member' },
];

export function LoginPage() {
  const { login, register } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('aarav@egan.in');
  const [password, setPassword] = useState('pulse1234');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register({ name, email, password, title });
      navigate('/home');
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const quickLogin = async (demoEmail: string) => {
    setError(null);
    setBusy(true);
    try {
      await login(demoEmail, 'pulse1234');
      navigate('/home');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* brand panel */}
      <div className="relative flex min-h-[38vh] flex-1 flex-col justify-between overflow-hidden p-7 text-white lg:min-h-full lg:p-12">
        <div className="absolute inset-0 grad-brand" />
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,.4), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,.3), transparent 40%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
              <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M8 36h9l5-13 6 24 5-16 4 5h13" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <p className="text-[17px] font-black leading-none tracking-tight">EGAN Pulse</p>
              <p className="text-[11px] font-medium text-white/75">Team collaboration, upgraded</p>
            </div>
          </div>
        </div>

        <div className="relative mt-8 lg:mt-0">
          <h1 className="max-w-md text-[26px] font-black leading-tight sm:text-[34px]">
            Chat, meet, share and ship — all in one place.
          </h1>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-white/85">
            Threaded conversations, live meetings with screen sharing, tasks, files and notes — with role-based access control your whole team can trust.
          </p>
          <div className="mt-6 grid max-w-md grid-cols-2 gap-2.5">
            {[
              { icon: <MessageSquare size={15} />, label: 'Threaded chat' },
              { icon: <Video size={15} />, label: 'HD meetings' },
              { icon: <KanbanSquare size={15} />, label: 'Task boards' },
              { icon: <ShieldCheck size={15} />, label: 'Access control' },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 rounded-xl bg-white/12 px-3 py-2 backdrop-blur-sm">
                <span className="text-white/90">{f.icon}</span>
                <span className="text-[12px] font-semibold">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative mt-8 hidden text-[11px] text-white/60 lg:block">© {new Date().getFullYear()} EGAN Technologies · Pulse</p>
      </div>

      {/* form panel */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-5 flex rounded-xl border p-1 bordered">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={cn(
                  'flex-1 rounded-lg py-2 text-[12.5px] font-bold transition',
                  mode === m ? 'bg-brand-600 text-white shadow-[0_8px_20px_-12px_rgba(32,68,245,.9)]' : 'text-muted hover:text-ink-800 dark:hover:text-ink-100',
                )}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <h2 className="text-[21px] font-extrabold">{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            {mode === 'login' ? 'Sign in to your team’s Pulse workspace.' : 'You get your own workspace and channels immediately.'}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === 'register' && (
              <>
                <div>
                  <label className="label" htmlFor="name">Full name</label>
                  <div className="relative">
                    <UserIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input id="name" required className="input pl-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aditi Sharma" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="title">Job title (optional)</label>
                  <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product Manager" />
                </div>
              </>
            )}
            <div>
              <label className="label" htmlFor="email">Work email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input id="email" type="email" required className="input pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  required
                  minLength={6}
                  className="input pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink-700 dark:hover:text-ink-200">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{error}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              {!busy && <ArrowRight size={15} />}
            </button>
          </form>

          {mode === 'login' && (
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-[rgb(var(--border))]" />
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted">Demo accounts</span>
                <div className="h-px flex-1 bg-[rgb(var(--border))]" />
              </div>
              <div className="mt-3 space-y-1.5">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    disabled={busy}
                    onClick={() => void quickLogin(d.email)}
                    className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/50 dark:hover:bg-brand-500/10 bordered"
                  >
                    <span>
                      <span className="block text-[12.5px] font-bold">{d.label}</span>
                      <span className="block text-[10.5px] text-muted">{d.email}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase text-brand-600 dark:text-brand-300">
                      <Sparkles size={11} /> {d.role}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-center text-[10.5px] text-muted">All demo accounts use the password <code className="rounded bg-ink-100 px-1 dark:bg-white/10">pulse1234</code></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
