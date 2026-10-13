import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, CornerDownLeft, FolderKanban, FolderPlus, LayoutDashboard, ListTodo, Plus, Search, UserRound, Users,
} from 'lucide-react';
import { api } from './api';
import { useUI } from './store';
import { useDebounced } from './hooks';
import { ProjectIcon, StatusIcon, Spinner, useLayer } from './components';
import { STATUS_LABEL, taskKey } from './utils';

/** Ctrl+K palette: jump to pages, projects and tasks. */
export default function CommandPalette() {
  const { paletteOpen, setPalette, openNewTask, openNewProject } = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ projects: [], tasks: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const query = useDebounced(q.trim(), 150);
  const close = () => setPalette(false);

  useEffect(() => {
    if (!paletteOpen) return undefined;
    setQ('');
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [paletteOpen]);
  useLayer(paletteOpen, () => setPalette(false)); // Escape closes the palette before any dialog underneath
  // Close when navigating away (e.g. browser back).
  useEffect(() => { setPalette(false); }, [location.pathname, setPalette]);

  useEffect(() => {
    if (!paletteOpen || !query) { setResults({ projects: [], tasks: [] }); return undefined; }
    let cancelled = false;
    setLoading(true);
    api('/search', { params: { q: query } })
      .then((r) => { if (!cancelled) { setResults(r); setActive(0); } })
      .catch(() => { if (!cancelled) setResults({ projects: [], tasks: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query, paletteOpen]);

  const groups = useMemo(() => {
    if (!q.trim()) {
      return [
        {
          title: 'Go to',
          items: [
            { key: 'dash', icon: <LayoutDashboard />, title: 'Dashboard', run: () => navigate('/') },
            { key: 'mine', icon: <ListTodo />, title: 'My tasks', run: () => navigate('/my-tasks') },
            { key: 'projects', icon: <FolderKanban />, title: 'Projects', run: () => navigate('/projects') },
            { key: 'teams', icon: <Users />, title: 'Teams', run: () => navigate('/teams') },
            { key: 'profile', icon: <UserRound />, title: 'Profile and password', run: () => navigate('/settings/profile') },
          ],
        },
        {
          title: 'Create',
          items: [
            { key: 'new-task', icon: <Plus />, title: 'New task', run: () => openNewTask() },
            { key: 'new-project', icon: <FolderPlus />, title: 'New project', run: () => openNewProject() },
          ],
        },
      ];
    }
    return [
      {
        title: 'Projects',
        items: results.projects.map((p) => ({
          key: `p${p.id}`, icon: <ProjectIcon id={p.id} name={p.name} size={30} />, title: p.name, sub: p.team_name || 'No team',
          run: () => navigate(`/projects/${p.id}`),
        })),
      },
      {
        title: 'Tasks',
        items: results.tasks.map((t) => ({
          key: `t${t.id}`, icon: <StatusIcon status={t.status} />, title: t.title,
          sub: `${taskKey(t.id)} · ${t.project_name} · ${STATUS_LABEL[t.status]}${t.assignee_name ? ` · ${t.assignee_name}` : ''}`,
          run: () => navigate(`/projects/${t.project_id}?task=${t.id}`),
        })),
      },
    ].filter((g) => g.items.length);
  }, [q, results, navigate, openNewTask, openNewProject]);

  const flat = groups.flatMap((g) => g.items);
  useEffect(() => { listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  if (!paletteOpen) return null;
  const run = (item) => { close(); item.run(); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && flat[active]) { e.preventDefault(); run(flat[active]); }
  };

  let index = -1;
  return createPortal(
    <>
      <div className="overlay" />
      <div className="palette" onMouseDown={(e) => e.target === e.currentTarget && close()}>
        <div className="palette-panel" role="dialog" aria-modal="true" aria-label="Search">
          <div className="palette-input">
            <Search aria-hidden />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Search projects and tasks, or jump to a page…" aria-label="Search" />
            {loading && <Spinner size={16} />}
          </div>
          <div className="palette-results" ref={listRef}>
            {groups.map((g) => (
              <div key={g.title}>
                <div className="palette-group">{g.title}</div>
                {g.items.map((item) => {
                  index += 1;
                  const i = index;
                  return (
                    <button key={item.key} type="button" className={`palette-item ${i === active ? 'active' : ''}`}
                      onMouseMove={() => setActive(i)} onClick={() => run(item)}>
                      <span className="pi-icon">{item.icon}</span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="pi-title truncate" style={{ display: 'block' }}>{item.title}</span>
                        {item.sub && <span className="pi-sub truncate" style={{ display: 'block' }}>{item.sub}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {q.trim() && !loading && query === q.trim() && flat.length === 0 && (
              <div className="menu-empty" style={{ padding: '28px 16px', textAlign: 'center' }}>No projects or tasks match “{q.trim()}”.</div>
            )}
          </div>
          <div className="palette-footer">
            <span><span className="kbd"><ArrowUp width={11} /></span><span className="kbd"><ArrowDown width={11} /></span> to navigate</span>
            <span><span className="kbd"><CornerDownLeft width={11} /></span> to open</span>
            <span><span className="kbd">Esc</span> to close</span>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
