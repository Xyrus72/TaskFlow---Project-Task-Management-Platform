import { useEffect, useState } from 'react';
import { CircleCheck, ListTodo, Plus, Search, X } from 'lucide-react';
import { api } from '../api';
import { toast, useAuth, useUI } from '../store';
import { useDebounced, useDocumentTitle, useFetch, useLiveEvents } from '../hooks';
import { Button, EmptyState, ErrorState, Pagination, Picker, PriorityIcon, Skeleton } from '../components';
import { TaskRow } from '../taskrow';
import { PRIORITIES } from '../utils';

const VIEWS = [
  { key: 'open', label: 'Open', params: { status: 'open' } },
  { key: 'week', label: 'Due this week', params: { status: 'open', due: 'week' } },
  { key: 'overdue', label: 'Overdue', params: { status: 'open', due: 'overdue' } },
  { key: 'done', label: 'Completed', params: { status: 'done' } },
];
const SORTS = [
  { value: 'due_date', label: 'Sort: Due date' },
  { value: 'priority', label: 'Sort: Priority' },
  { value: 'updated_at', label: 'Sort: Recently updated' },
  { value: 'project', label: 'Sort: Project' },
  { value: 'title', label: 'Sort: Title' },
];
const EMPTY = {
  open: ['Nothing on your plate', 'No open tasks are assigned to you. New assignments will show up here.'],
  week: ['Nothing due this week', 'None of your open tasks are due in the next 7 days.'],
  overdue: ['Nothing overdue', 'Every task assigned to you is on schedule.'],
  done: ['No completed tasks yet', 'Tasks you finish will be listed here.'],
};

export default function MyTasks() {
  useDocumentTitle('My tasks');
  const me = useAuth((s) => s.user);
  const openNewTask = useUI((s) => s.openNewTask);
  const [view, setView] = useState('open');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [sort, setSort] = useState('due_date');
  const [page, setPage] = useState(1);
  const q = useDebounced(search, 250);
  const current = VIEWS.find((v) => v.key === view);
  const order = sort === 'priority' || sort === 'updated_at' ? 'desc' : 'asc';
  const { data, error, loading, reload } = useFetch('/tasks/mine', { ...current.params, search: q, priority, sort, order, page, limit: 15 });
  useEffect(() => setPage(1), [view, q, priority, sort]);
  useLiveEvents(() => reload({ silent: true }));

  const toggleDone = async (task) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: next } });
      reload({ silent: true });
      window.dispatchEvent(new Event('tf:projects-changed'));
      toast(next === 'done' ? `Marked “${task.title}” as done` : `Reopened “${task.title}”`, 'success', {
        label: 'Undo',
        onClick: async () => { await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: task.status } }); reload({ silent: true }); },
      });
    } catch (e) { toast(e.message, 'error'); }
  };

  const counts = data?.counts;
  const filtered = !!(q || priority);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>My tasks</h1>
          <p className="page-desc">Everything assigned to you, {me.name.split(' ')[0]}, across all your projects.</p>
        </div>
        <div className="actions"><Button variant="primary" icon={Plus} onClick={() => openNewTask()}>New task</Button></div>
      </div>

      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Filter by due date">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? 'active' : ''} onClick={() => setView(v.key)}>
              {v.label}{counts && <span className="count">{counts[v.key]}</span>}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <div className="input-icon">
          <Search aria-hidden />
          <input className="input input-sm" placeholder="Search your tasks" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search your tasks" />
        </div>
        <Picker size="sm" value={priority} onChange={setPriority} label="Priority" highlightActive
          options={[{ value: '', label: 'Any priority' }, ...PRIORITIES.map((p) => ({ value: p.key, label: p.label, icon: <PriorityIcon priority={p.key} /> }))]} />
        <Picker size="sm" value={sort} onChange={setSort} label="Sort" options={SORTS} />
        {filtered && <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearch(''); setPriority(''); }}>Clear</Button>}
      </div>

      <div className="card">
        {error && <ErrorState error={error} onRetry={reload} />}
        {!data && loading && (
          <div className="task-list">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="task-row"><Skeleton w={20} h={20} r={10} /><div className="grow"><Skeleton w="45%" /><Skeleton w="20%" h={10} style={{ marginTop: 8 }} /></div><Skeleton w={80} /></div>)}</div>
        )}
        {data && data.data.length === 0 && (
          filtered
            ? <EmptyState icon={Search} title="No tasks match these filters" action={<Button onClick={() => { setSearch(''); setPriority(''); }}>Clear filters</Button>}>Try a different search or priority.</EmptyState>
            : <EmptyState icon={view === 'done' ? ListTodo : CircleCheck} title={EMPTY[view][0]}>{EMPTY[view][1]}</EmptyState>
        )}
        {data && data.data.length > 0 && (
          <>
            <div className="task-list" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
              {data.data.map((t) => <TaskRow key={t.id} task={t} onToggleDone={toggleDone} />)}
            </div>
            <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={data.pagination.limit} onPage={setPage} noun="tasks" />
          </>
        )}
      </div>
    </div>
  );
}
