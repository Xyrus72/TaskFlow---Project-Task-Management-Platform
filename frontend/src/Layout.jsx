import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen, ChevronDown, FolderKanban, LayoutDashboard, ListTodo, LogOut, Menu as MenuIcon, Moon, Plus, Search, Shield, Sun, UserRound, Users,
} from 'lucide-react';
import { Avatar, Button, ErrorBoundary, LoadingBlock, Logo, Menu } from './components';
import { useAuth, useLive, useUI, toast } from './store';
import { useFetch, useHotkey, useLiveEvents } from './hooks';
import { projectColor } from './utils';
import CommandPalette from './CommandPalette';
import TaskDrawer from './TaskDrawer';
import NewTaskModal from './pages/TaskModal';
import { NewProjectModal } from './modals';
import { NotificationBell, NotificationsHost } from './notifications';
import { closeSocket, openSocket } from './chat';
import { useIsDark, useTheme } from './theme';

/** Keep one Server-Sent Events connection open and re-broadcast messages as window events. */
function useRealtime() {
  const token = useAuth((s) => s.token);
  const setConnected = useLive((s) => s.setConnected);
  useEffect(() => {
    if (!token) return undefined;
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // the browser reconnects automatically
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // Personal notifications and project changes are delivered as two different window events.
        window.dispatchEvent(new CustomEvent(msg.kind === 'notification' ? 'tf:notification' : 'tf:change', { detail: msg }));
      } catch { /* ignore malformed */ }
    };
    return () => { es.close(); setConnected(false); };
  }, [token, setConnected]);
}

/** Sun / moon button that switches between light and dark mode. */
function ThemeButton() {
  const dark = useIsDark();
  const setTheme = useTheme((s) => s.setTheme);
  const Icon = dark ? Sun : Moon;
  return (
    <button type="button" className="bell" onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      <Icon aria-hidden />
    </button>
  );
}

/** The Socket.IO connection used by project chat, open while signed in. */
function useChatSocket() {
  const token = useAuth((s) => s.token);
  useEffect(() => {
    if (!token) return undefined;
    openSocket(token);
    return closeSocket;
  }, [token]);
}

function Sidebar({ onNavigate }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const connected = useLive((s) => s.connected);
  const { setPalette, openNewProject } = useUI();
  const navigate = useNavigate();
  const dark = useIsDark();
  const setTheme = useTheme((s) => s.setTheme);
  const projects = useFetch('/projects', { limit: 50, sort: 'name', order: 'asc' });
  const mine = useFetch('/tasks/mine', { limit: 1 });

  useLiveEvents((e) => {
    if (e.action.startsWith('project.') || e.action.startsWith('member.')) projects.reload({ silent: true });
    if (e.action.startsWith('task.')) mine.reload({ silent: true });
  }, { delay: 600 });
  useEffect(() => {
    const refresh = () => { projects.reload({ silent: true }); mine.reload({ silent: true }); };
    window.addEventListener('tf:projects-changed', refresh);
    return () => window.removeEventListener('tf:projects-changed', refresh);
  }, [projects.reload, mine.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = projects.data?.data || [];
  const openCount = mine.data?.counts?.open;

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-top"><Logo /><span className="row" style={{ gap: 2 }}><ThemeButton /><NotificationBell /></span></div>
      <button type="button" className="search-trigger" onClick={() => setPalette(true)}>
        <Search aria-hidden /> Search <span className="kbd">Ctrl K</span>
      </button>
      <nav className="nav" onClick={onNavigate}>
        <NavLink to="/" end className="nav-item"><LayoutDashboard aria-hidden />Dashboard</NavLink>
        <NavLink to="/my-tasks" className="nav-item"><ListTodo aria-hidden />My tasks{openCount > 0 && <span className="nav-count">{openCount}</span>}</NavLink>
        <NavLink to="/projects" end className="nav-item"><FolderKanban aria-hidden />Projects</NavLink>
        <NavLink to="/teams" className="nav-item"><Users aria-hidden />Teams</NavLink>
        {user.role === 'admin' && <NavLink to="/admin/users" className="nav-item"><Shield aria-hidden />Users</NavLink>}
      </nav>

      <div className="nav-section">
        <span>Your projects</span>
        <button type="button" onClick={() => openNewProject()} aria-label="New project" title="New project"><Plus /></button>
      </div>
      <nav className="nav" onClick={onNavigate}>
        {list.map((p) => (
          <NavLink key={p.id} to={`/projects/${p.id}`} className="nav-item nav-project">
            <span className="project-dot" style={{ background: projectColor(p.id) }} />
            <span className="truncate">{p.name}</span>
          </NavLink>
        ))}
        {projects.data && list.length === 0 && <span className="nav-empty">No projects yet</span>}
      </nav>

      <div className="sidebar-foot">
        <div className={`live ${connected ? 'on' : ''}`} title={connected ? 'Changes from your team appear instantly' : 'Reconnecting…'}>
          <span className="dot" />{connected ? 'Live updates on' : 'Connecting…'}
        </div>
        <Menu
          align="start"
          trigger={(props) => (
            <button type="button" className="user-button" {...props}>
              <Avatar name={user.name} size="md" />
              <span className="grow">
                <span className="strong truncate" style={{ display: 'block' }}>{user.name}</span>
                <span className="text-xs muted truncate" style={{ display: 'block' }}>{user.email}</span>
              </span>
              <ChevronDown className="chev" aria-hidden />
            </button>
          )}
          items={[
            { label: 'Profile and settings', icon: UserRound, onSelect: () => navigate('/settings/profile') },
            { label: dark ? 'Light mode' : 'Dark mode', icon: dark ? Sun : Moon, onSelect: () => setTheme(dark ? 'light' : 'dark') },
            { label: 'API documentation', icon: BookOpen, onSelect: () => window.open('/api/docs', '_blank', 'noopener') },
            { divider: true },
            { label: 'Sign out', icon: LogOut, onSelect: () => { logout(); toast('Signed out', 'info'); navigate('/'); } },
          ]}
        />
      </div>
    </aside>
  );
}

/** Opens the task drawer whenever the URL has ?task=<id>, on any page. */
function TaskDrawerHost() {
  const [params, setParams] = useSearchParams();
  const taskId = Number(params.get('task')) || null;
  const close = () => setParams((p) => { p.delete('task'); return p; }, { replace: false });
  return taskId ? <TaskDrawer key={taskId} taskId={taskId} onClose={close} /> : null;
}

function NewTaskHost() {
  const { newTask, closeNewTask } = useUI();
  return <NewTaskModal open={!!newTask} onClose={closeNewTask} projectId={newTask?.projectId} defaultStatus={newTask?.status} />;
}

function NewProjectHost() {
  const { newProject, closeNewProject } = useUI();
  const navigate = useNavigate();
  return (
    <NewProjectModal open={!!newProject} onClose={closeNewProject} defaultTeamId={newProject?.teamId}
      onCreated={(p) => { closeNewProject(); window.dispatchEvent(new Event('tf:projects-changed')); navigate(`/projects/${p.id}`); }} />
  );
}

export default function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const setPalette = useUI((s) => s.setPalette);
  const openNewTask = useUI((s) => s.openNewTask);
  useRealtime();
  useChatSocket();
  useHotkey('mod+k', () => setPalette(true));
  // "C" creates a task, like Linear and Jira. Project pages handle it themselves (they know your role there).
  useHotkey('c', () => {
    if (document.querySelector('[role="dialog"]') || /^\/projects\/\d+/.test(location.pathname)) return;
    openNewTask({});
  });
  useEffect(() => setNavOpen(false), [location.pathname]);

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <Button variant="ghost" icon={MenuIcon} onClick={() => setNavOpen(true)} aria-label="Open menu" />
          <Logo />
          <Button variant="ghost" icon={Search} onClick={() => setPalette(true)} aria-label="Search" />
          <ThemeButton />
          <NotificationBell align="end" />
        </header>
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<LoadingBlock />}><Outlet /></Suspense>
        </ErrorBoundary>
      </div>
      <CommandPalette />
      <NotificationsHost />
      <TaskDrawerHost />
      <NewTaskHost />
      <NewProjectHost />
    </div>
  );
}
