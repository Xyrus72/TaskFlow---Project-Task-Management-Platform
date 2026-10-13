import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ListTodo, MessageSquare, Search } from 'lucide-react';
import { api } from '../../api';
import { useBoard, useUI, toast } from '../../store';
import { useFetch, useLiveEvents } from '../../hooks';
import { Avatar, Button, DueBadge, EmptyState, ErrorState, Pagination, Picker, PriorityIcon, Skeleton, StatusIcon } from '../../components';
import { useOpenTask } from '../../taskrow';
import { LabelList } from '../../labels';
import { ChecklistBadge } from './Board';
import { fmtDateTime, PRIORITIES, STATUSES, taskKey, timeAgo } from '../../utils';

const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s.key, label: s.label, icon: <StatusIcon status={s.key} /> }));
const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({ value: p.key, label: p.label, icon: <PriorityIcon priority={p.key} /> }));

/** Paginated, sortable table of a project's tasks. Shares search/filters with the board. */
export default function ListView({ project, canEdit }) {
  const filters = useBoard((s) => s.filters);
  const resetFilters = useBoard((s) => s.resetFilters);
  const openNewTask = useUI((s) => s.openNewTask);
  const openTask = useOpenTask();
  const [sort, setSort] = useState({ key: 'updated_at', order: 'desc' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const { data, error, loading, reload } = useFetch(`/projects/${project.id}/tasks`, { ...filters, sort: sort.key, order: sort.order, page, limit });
  useEffect(() => setPage(1), [filters, sort, limit]);
  useLiveEvents(() => reload({ silent: true }), { filter: (e) => e.projectId === project.id });

  const patch = async (task, body) => {
    try {
      const t = await api(`/tasks/${task.id}`, { method: 'PATCH', body });
      useBoard.getState().upsert(t);
      reload({ silent: true });
    } catch (e) { toast(e.message, 'error'); }
  };

  const Th = ({ k, children, style }) => (
    <th style={style} aria-sort={sort.key === k ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort((s) => ({ key: k, order: s.key === k && s.order === 'asc' ? 'desc' : 'asc' }))}>
        {children}
        {sort.key === k ? (sort.order === 'asc' ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />) : <ArrowUpDown aria-hidden style={{ opacity: 0.4 }} />}
      </button>
    </th>
  );
  const filtered = !!(filters.search || filters.priority || filters.assigneeId !== '' || filters.labelId);

  if (error) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>;
  return (
    <div className="card">
      {data && data.data.length === 0 ? (
        filtered
          ? <EmptyState icon={Search} title="No tasks match these filters" action={<Button onClick={resetFilters}>Clear filters</Button>}>Try a different search, priority, assignee or label.</EmptyState>
          : <EmptyState icon={ListTodo} title="No tasks yet" action={canEdit && <Button variant="primary" onClick={() => openNewTask({ projectId: project.id })}>Create the first task</Button>}>Tasks you create will be listed here.</EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <Th k="title" style={{ minWidth: 260 }}>Task</Th>
                  <Th k="status" style={{ width: 160 }}>Status</Th>
                  <Th k="priority" style={{ width: 130 }}>Priority</Th>
                  <Th k="assignee" style={{ width: 200 }}>Assignee</Th>
                  <Th k="due_date" style={{ width: 130 }}>Due date</Th>
                  <Th k="updated_at" style={{ width: 110 }}>Updated</Th>
                </tr>
              </thead>
              <tbody style={{ opacity: loading && data ? 0.6 : 1 }}>
                {!data && [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>{[0, 1, 2, 3, 4, 5].map((j) => <td key={j}><Skeleton w={j === 0 ? '70%' : '60%'} /></td>)}</tr>
                ))}
                {data?.data.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => openTask(t.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') openTask(t.id); }}>
                    <td>
                      <div className="strong" style={{ color: 'var(--text)' }}>{t.title}</div>
                      <div className="row text-xs faint" style={{ gap: 10, marginTop: 2 }}>
                        <span>{taskKey(t.id)}</span>
                        {t.comment_count > 0 && <span className="row" style={{ gap: 3 }}><MessageSquare width={12} height={12} aria-hidden />{t.comment_count}</span>}
                        {t.checklist_total > 0 && <ChecklistBadge task={t} />}
                        {t.labels?.length > 0 && <LabelList labels={t.labels} small max={3} />}
                      </div>
                    </td>
                    <td onClick={(e) => canEdit && e.stopPropagation()}>
                      <Picker size="sm" variant="ghost" value={t.status} options={STATUS_OPTIONS} disabled={!canEdit} label={`Status of ${t.title}`} onChange={(v) => patch(t, { status: v })} />
                    </td>
                    <td onClick={(e) => canEdit && e.stopPropagation()}>
                      <Picker size="sm" variant="ghost" value={t.priority} options={PRIORITY_OPTIONS} disabled={!canEdit} label={`Priority of ${t.title}`} onChange={(v) => patch(t, { priority: v })} />
                    </td>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <Avatar name={t.assignee_name} size="sm" />
                        <span className={t.assignee_name ? '' : 'faint'}>{t.assignee_name || 'Unassigned'}</span>
                      </span>
                    </td>
                    <td>{t.due_date ? <DueBadge date={t.due_date} status={t.status} /> : <span className="faint">—</span>}</td>
                    <td className="muted text-sm" title={fmtDateTime(t.updated_at)}>{timeAgo(t.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <div className="table-footer">
              <div className="grow"><Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={data.pagination.limit} onPage={setPage} noun="tasks" /></div>
              <label className="row text-sm muted hide-sm" style={{ padding: '0 16px', gap: 6 }}>
                Rows
                <select className="select input-sm" style={{ width: 76, minHeight: 32 }} value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Rows per page">
                  {[10, 15, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
