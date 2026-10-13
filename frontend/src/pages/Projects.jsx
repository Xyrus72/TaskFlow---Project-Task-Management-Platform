import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, FolderKanban, Plus, Search, X } from 'lucide-react';
import { useUI } from '../store';
import { useDebounced, useDocumentTitle, useFetch, useLiveEvents } from '../hooks';
import { AvatarStack, Badge, Button, EmptyState, ErrorState, Pagination, Picker, ProgressBar, ProjectIcon, RoleBadge, Skeleton } from '../components';
import { pct, plural } from '../utils';

const SORTS = [
  { value: 'created_at:desc', label: 'Sort: Newest' },
  { value: 'name:asc', label: 'Sort: Name' },
  { value: 'task_count:desc', label: 'Sort: Most tasks' },
  { value: 'progress:desc', label: 'Sort: Most complete' },
  { value: 'progress:asc', label: 'Sort: Least complete' },
];

export function ProjectCard({ p }) {
  const v = pct(p.done_count, p.task_count);
  const open = p.task_count - p.done_count;
  return (
    <Link to={`/projects/${p.id}`} className="card project-card">
      <div className="pc-head">
        <ProjectIcon id={p.id} name={p.name} />
        <div className="grow">
          <h3 className="truncate">{p.name}</h3>
          <div className="text-sm muted truncate">{p.team_name || 'No team'}</div>
        </div>
        <RoleBadge role={p.my_role} />
      </div>
      <p className="desc">{p.description || 'No description yet.'}</p>
      <div>
        <div className="progress-label"><span>{p.done_count} of {plural(p.task_count, 'task')} done</span><b>{v}%</b></div>
        <ProgressBar value={v} tone={v === 100 ? 'green' : ''} />
      </div>
      <div className="pc-foot">
        <AvatarStack users={p.members_preview} total={p.member_count} size="sm" />
        {p.overdue_count > 0
          ? <Badge tone="red"><AlertTriangle />{p.overdue_count} overdue</Badge>
          : <span className="text-xs muted">{open ? `${open} open` : 'All done'}</span>}
      </div>
    </Link>
  );
}

export default function Projects() {
  useDocumentTitle('Projects');
  const openNewProject = useUI((s) => s.openNewProject);
  const [search, setSearch] = useState('');
  const [teamId, setTeamId] = useState('');
  const [sortKey, setSortKey] = useState('created_at:desc');
  const [page, setPage] = useState(1);
  const q = useDebounced(search, 250);
  const [sort, order] = sortKey.split(':');
  const teams = useFetch('/teams');
  const { data, error, loading, reload } = useFetch('/projects', { search: q, teamId, sort, order, page, limit: 12 });
  useEffect(() => setPage(1), [q, teamId, sortKey]);
  useLiveEvents(() => reload({ silent: true }));
  useEffect(() => {
    const refresh = () => reload({ silent: true });
    window.addEventListener('tf:projects-changed', refresh);
    return () => window.removeEventListener('tf:projects-changed', refresh);
  }, [reload]);

  const filtered = !!(q || teamId);
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="page-desc">{data ? `${plural(data.pagination.total, 'project')} you can access.` : 'Projects you can access.'}</p>
        </div>
        <div className="actions"><Button variant="primary" icon={Plus} onClick={() => openNewProject()}>New project</Button></div>
      </div>

      <div className="toolbar">
        <div className="input-icon">
          <Search aria-hidden />
          <input className="input input-sm" placeholder="Search projects" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search projects" />
        </div>
        <Picker size="sm" value={teamId} onChange={setTeamId} label="Team" highlightActive
          options={[{ value: '', label: 'All teams' }, ...(teams.data?.data || []).map((t) => ({ value: t.id, label: t.name }))]} />
        <Picker size="sm" value={sortKey} onChange={setSortKey} label="Sort" options={SORTS} />
        {filtered && <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearch(''); setTeamId(''); }}>Clear</Button>}
      </div>

      {error && <div className="card"><ErrorState error={error} onRetry={reload} /></div>}
      {!data && loading && (
        <div className="project-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card project-card">
              <div className="pc-head"><Skeleton w={40} h={40} r={10} /><div className="grow"><Skeleton w="60%" /><Skeleton w="35%" h={10} style={{ marginTop: 8 }} /></div></div>
              <Skeleton h={36} /><Skeleton h={6} />
            </div>
          ))}
        </div>
      )}
      {data && data.data.length === 0 && (
        <div className="card">
          {filtered
            ? <EmptyState icon={Search} title="No projects match" action={<Button onClick={() => { setSearch(''); setTeamId(''); }}>Clear filters</Button>}>Try a different search or team.</EmptyState>
            : <EmptyState icon={FolderKanban} title="Start your first project" action={<Button variant="primary" icon={Plus} onClick={() => openNewProject()}>New project</Button>}>Projects give your team a Kanban board, roles and a full history of changes.</EmptyState>}
        </div>
      )}
      {data && data.data.length > 0 && (
        <>
          <div className="project-grid" style={{ opacity: loading ? 0.6 : 1 }}>
            {data.data.map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
          {data.pagination.pages > 1 && (
            <div className="card" style={{ marginTop: 16 }}>
              <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={data.pagination.limit} onPage={setPage} noun="projects" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
