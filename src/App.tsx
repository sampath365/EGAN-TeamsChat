import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, CheckSquare, Hash, Home, KanbanSquare, Menu, MessageSquare, Search, Users, Video, X,
} from 'lucide-react';
import { useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { Spinner } from './components/ui';
import { cn } from './lib/utils';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { ChannelPage } from './pages/ChannelPage';
import { TasksPage } from './pages/TasksPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { MeetingPage } from './pages/MeetingPage';
import { PeoplePage } from './pages/PeoplePage';
import { ThreadsPage } from './pages/ThreadsPage';
import { SettingsPage } from './pages/SettingsPage';
import { JoinPage } from './pages/JoinPage';
import { ProfilePage } from './pages/ProfilePage';
import { OrgChartPage } from './pages/OrgChartPage';
import { ReportsPage } from './pages/ReportsPage';
import { CalendarPage } from './pages/CalendarPage';
import { MeetingInvitePage } from './pages/MeetingInvitePage';

export default function App() {
  const { ready, user, channels, unreadTotal, theme } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K palette, ⌘/ focuses it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl grad-brand text-white shadow-glow">
            <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
              <path d="M8 36h9l5-13 6 24 5-16 4 5h13" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
            <Spinner size={14} /> Loading EGAN Pulse…
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/invite/:token" element={<MeetingInvitePage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  const isMeeting = location.pathname.startsWith('/meeting/');
  const firstChannel = channels[0];

  return (
    <div className="flex h-full overflow-hidden">
      {/* desktop sidebar */}
      {!isMeeting && (
        <div className="hidden lg:flex">
          <Sidebar onOpenPalette={() => setPaletteOpen(true)} />
        </div>
      )}

      {/* mobile drawer */}
      {!isMeeting && sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink-950/55 backdrop-blur-[2px] animate-fade-in" onClick={() => setSidebarOpen(false)} />
          <div className="relative h-full w-[286px] max-w-[85vw] animate-slide-left">
            <Sidebar onOpenPalette={() => { setSidebarOpen(false); setPaletteOpen(true); }} onClose={() => setSidebarOpen(false)} mobile />
            <button type="button" aria-label="Close menu" onClick={() => setSidebarOpen(false)} className="absolute -right-11 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-ink-800 shadow-lift">
              <X size={17} />
            </button>
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {/* mobile top bar */}
        {!isMeeting && (
          <header className="flex items-center justify-between gap-2 border-b px-2.5 py-2 lg:hidden bordered">
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-ink-100 dark:hover:bg-white/[0.07]">
              <Menu size={18} />
            </button>
            <button type="button" onClick={() => setPaletteOpen(true)} className="flex flex-1 items-center gap-2 rounded-xl border bg-[rgb(var(--surface-2))] px-2.5 py-1.5 text-[12px] text-muted bordered">
              <Search size={13} /> Search…
            </button>
            <button type="button" onClick={() => navigate('/settings')} aria-label="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-ink-100 dark:hover:bg-white/[0.07]">
              <Bell size={17} />
              {unreadTotal > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />}
            </button>
          </header>
        )}

        <div className="min-h-0 flex-1">
          <Routes>
            <Route path="/" element={<Navigate to={firstChannel ? `/channel/${firstChannel.id}` : '/home'} replace />} />
            <Route path="/login" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/channel/:channelId" element={<ChannelPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/meetings" element={<MeetingsPage />} />
            <Route path="/meeting/:callId" element={<MeetingPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:userId" element={<ProfilePage />} />
            <Route path="/org" element={<OrgChartPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/invite/:token" element={<MeetingInvitePage />} />
            <Route path="/threads" element={<ThreadsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/join/:code" element={<JoinPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>

        {/* mobile bottom nav */}
        {!isMeeting && (
          <nav className="flex items-center justify-around border-t px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 lg:hidden bordered bg-[rgb(var(--surface))]">
            {[
              { to: '/home', icon: <Home size={18} />, label: 'Home' },
              { to: firstChannel ? `/channel/${firstChannel.id}` : '/home', icon: <Hash size={18} />, label: 'Chat' },
              { to: '/tasks', icon: <KanbanSquare size={18} />, label: 'Tasks' },
              { to: '/meetings', icon: <Video size={18} />, label: 'Meet' },
              { to: '/people', icon: <Users size={18} />, label: 'People' },
            ].map((item) => {
              const active = location.pathname === item.to;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item.to)}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-bold transition',
                    active ? 'text-brand-600 dark:text-brand-300' : 'text-muted',
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>
        )}
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toasts />
    </div>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[110] flex w-[min(92vw,340px)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-2xl border px-3 py-2.5 shadow-lift animate-slide-up',
            t.tone === 'error'
              ? 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-950/70'
              : t.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/70'
                : 'bg-[rgb(var(--surface))] bordered',
          )}
        >
          <span className="mt-0.5 shrink-0">
            {t.tone === 'success' ? <CheckSquare size={15} className="text-emerald-600 dark:text-emerald-400" /> : t.tone === 'error' ? <X size={15} className="text-rose-600 dark:text-rose-400" /> : <MessageSquare size={15} className="text-brand-600 dark:text-brand-300" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold">{t.title}</p>
            {t.body && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted">{t.body}</p>}
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="shrink-0 text-muted hover:text-ink-700 dark:hover:text-ink-200">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
