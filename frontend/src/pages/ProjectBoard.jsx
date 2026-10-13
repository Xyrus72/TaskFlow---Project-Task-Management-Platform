import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChartColumn, ChevronRight, Columns3, History, List, MessagesSquare, Plus, Search, Settings, Users, X } from 'lucide-react';
import { useAuth, useBoard, useUI, toast } from '../store';
import { useDebounced, useDocumentTitle, useFetch, useHotkey, useLiveEvents } from '../hooks';
import { Avatar, AvatarStack, Button, ErrorState, Picker, PriorityIcon, ProjectIcon, RoleBadge, Skeleton, Tabs } from '../components';
import { atLeast, LABEL_COLORS, plural, PRIORITIES } from '../utils';
import Board from './project/Board';
import ListView from './project/ListView';
import Overview from './project/Overview';
import ActivityTab from './project/ActivityTab';
import Members from './project/Members';
import ProjectSettings from './project/Settings';
import ProjectChat from './project/Chat';
import { joinProject, leaveProject, useChat } from '../chat';

const BOARD_SORTS = [
  { value: 'position', label: 'Sort: Manual' },
  { value: 'priority', label: 'Sort: Priority' },
  { value: 'due_date', label: 'Sort: Due date' },
  { value: 'created_at', label: 'Sort: Newest' },
];

/** Search + priority + assignee filters shared by the board and list views (kept in the board store). */
function FilterBar({ project, mode }) {
  const me = useAuth((s) => s.user);
  const { filters, setFilter, resetFilters, sort, setSort, tasks } = useBoard();
  const [search, setSearch] = useState(filters.search);
  const q = useDebounced(search, 250);
  useEffect(() => { if (q !== useBoard.getState().filters.search) setFilter('search', q); }, [q, setFilter]);
  const active = !!(filters.search || filters.priority || filters.assigneeId !== '' || filters.labelId);
  const labels = project.labels || [];
  // A label that was deleted can't stay selected as a filter.
  useEffect(() => { if (filters.labelId && !labels.some((l) => l.id === filters.labelId)) setFilter('labelId', ''); }, [labels, filters.labelId, setFilter]);

  const assignees = [
    { value: '', label: 'Any assignee' },
    { value: me.id, label: 'Assigned to me', icon: <Avatar name={me.name} size="xs" /> },
    { value: 0, label: 'Unassigned', icon: <Avatar size="xs" /> },
    ...project.members.filter((m) => m.id !== me.id).map((m) => ({ value: m.id, label: m.name, icon: <Avatar name={m.name} size="xs" /> })),
  ];

  return (
    <div className="filters">
      <div className="input-icon">
        <Search aria-hidden />
        <input className="input input-sm" placeholder="Search tasks" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search tasks" />
      </div>
      <Picker size="sm" value={filters.priority} onChange={(v) => setFilter('priority', v)} label="Priority" highlightActive
        options={[{ value: '', label: 'Any priority' }, ...PRIORITIES.map((p) => ({ value: p.key, label: p.label, icon: <PriorityIcon priority={p.key} /> }))]} />
      <Picker size="sm" value={filters.assigneeId} onChange={(v) => setFilter('assigneeId', v)} label="Assignee" highlightActive searchable={assignees.length > 8} options={assignees} />
      {labels.length > 0 && (
        <Picker size="sm" value={filters.labelId} onChange={(v) => setFilter('labelId', v)} label="Label" highlightActive searchable={labels.length > 8}
          options={[{ value: '', label: 'Any label' }, ...labels.map((l) => ({ value: l.id, label: l.name, icon: <span className="label-dot" style={{ background: (LABEL_COLORS[l.color] || LABEL_COLORS.gray).dot }} /> }))]} />
      )}
      {mode === 'board' && <Picker size="sm" value={sort} onChange={setSort} label="Sort" options={BOARD_SORTS} />}
      {active && <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearch(''); resetFilters(); }}>Clear filters</Button>}
      {mode === 'board' && <span className="text-sm muted" style={{ marginLeft: 'auto' }}>{plural(tasks.length, 'task')}{active ? ' match' : ''}</span>}
    </div>
  );
}

export default function ProjectPage() {
  const { id, tab = 'board' } = useParams();
  const projectId = Number(id);
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const openNewTask = useUI((s) => s.openNewTask);
  const { data: project, error, reload, setData } = useFetch(`/projects/${projectId}`);
  useDocumentTitle(project?.name);

  useEffect(() => { useBoard.getState().open(projectId); }, [projectId]);
  // Live chat: be in the project's room on every tab, so the Chat tab can show unread messages.
  useEffect(() => { joinProject(projectId); return () => leaveProject(projectId); }, [projectId]);
  useEffect(() => { if (project?.id === projectId) useChat.getState().open(projectId, project.chat_unread); }, [project?.id, projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const chatUnread = useChat((s) => (s.projectId === projectId ? s.unread : 0));
  // "C" adds a task to this project, for people who can edit it.
  useHotkey('c', () => { if (!document.querySelector('[role="dialog"]')) openNewTask({ projectId, status: 'todo' }); },
    { enabled: !!project && atLeast(project.my_role, 'member') });

  // Realtime: someone else changed this project.
  useLiveEvents((e) => {
    if (e.action === 'project.deleted') {
      if (e.userId !== me.id) { toast('This project was deleted by its owner', 'info'); navigate('/projects'); }
      return;
    }
    if (e.action.startsWith('project.') || e.action.startsWith('member.')) reload({ silent: true });
    if (e.userId !== me.id || e.action.startsWith('comment.')) useBoard.getState().load({ silent: true });
  }, { filter: (e) => e.projectId === projectId, delay: 250 });

  if (error && !project) {
    return <div className="page"><div className="card"><ErrorState error={error} onRetry={reload} /></div><p style={{ marginTop: 16 }}><Link className="link" to="/projects">Back to projects</Link></p></div>;
  }
  if (!project) {
    return (
      <div className="page">
        <Skeleton w={160} h={12} /><div className="row" style={{ marginTop: 14, gap: 14 }}><Skeleton w={44} h={44} r={11} /><div><Skeleton w={260} h={24} /><Skeleton w={380} h={14} style={{ marginTop: 8 }} /></div></div>
        <div className="board" style={{ marginTop: 80 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="column" style={{ height: 360 }} />)}</div>
      </div>
    );
  }

  const role = project.my_role;
  const canEdit = atLeast(role, 'member');
  const isManager = atLeast(role, 'manager');
  const base = `/projects/${projectId}`;
  const tabs = [
    { key: 'board', label: 'Board', icon: Columns3, to: base },
    { key: 'list', label: 'List', icon: List, to: `${base}/list` },
    { key: 'chat', label: 'Chat', icon: MessagesSquare, unread: tab === 'chat' ? 0 : chatUnread, to: `${base}/chat` },
    { key: 'overview', label: 'Overview', icon: ChartColumn, to: `${base}/overview` },
    { key: 'activity', label: 'Activity', icon: History, to: `${base}/activity` },
    { key: 'members', label: 'Members', icon: Users, count: project.members.length, to: `${base}/members` },
    isManager && { key: 'settings', label: 'Settings', icon: Settings, to: `${base}/settings` },
  ].filter(Boolean);
  if (!tabs.some((t) => t.key === tab)) return <Navigate to={base} replace />;

  return (
    <div className="page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/projects">Projects</Link><ChevronRight aria-hidden />
        {project.team_name ? <Link to={`/teams/${project.team_id}`}>{project.team_name}</Link> : <span>No team</span>}
      </nav>
      <div className="page-header project-header">
        <div className="row" style={{ gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
          <ProjectIcon id={project.id} name={project.name} size={44} />
          <div style={{ minWidth: 0 }}>
            <div className="page-title"><h1>{project.name}</h1><RoleBadge role={role} /></div>
            <p className="page-desc">{project.description || 'No description yet.'}</p>
          </div>
        </div>
        <div className="actions">
          <Link to={`${base}/members`} title="Members" aria-label="Project members"><AvatarStack users={project.members} max={5} size="md" /></Link>
          {canEdit && <Button variant="primary" icon={Plus} onClick={() => openNewTask({ projectId, status: 'todo' })}>New task</Button>}
        </div>
      </div>

      <Tabs className="project-tabs" tabs={tabs} active={tab} />

      {tab === 'board' && <><FilterBar key={projectId} project={project} mode="board" /><Board canEdit={canEdit} /></>}
      {tab === 'list' && <><FilterBar key={projectId} project={project} mode="list" /><ListView project={project} canEdit={canEdit} /></>}
      {tab === 'chat' && <ProjectChat project={project} onProjectChange={setData} />}
      {tab === 'overview' && <Overview projectId={projectId} />}
      {tab === 'activity' && <ActivityTab projectId={projectId} />}
      {tab === 'members' && <Members project={project} onChange={setData} />}
      {tab === 'settings' && <ProjectSettings project={project} onSaved={setData} />}
    </div>
  );
}
