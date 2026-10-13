import { AlertTriangle, CalendarClock, CircleCheck, ListTodo, UserRound } from 'lucide-react';
import { useFetch, useLiveEvents } from '../../hooks';
import { Avatar, DueBadge, EmptyState, ErrorState, LoadingBlock, PriorityIcon, StatusIcon } from '../../components';
import { useOpenTask } from '../../taskrow';
import { pct, plural, PRIORITIES, PRIORITY_COLOR, STATUS_COLOR, STATUSES } from '../../utils';

function Stat({ label, value, sub, icon: Icon, tone, alert }) {
  return (
    <div className="card stat-card">
      <div className="stat-top">{label}<span className={`stat-icon ${tone}`}><Icon aria-hidden /></span></div>
      <div className={`stat-value ${alert ? 'red' : ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Project statistics: totals, status mix, open work by priority, workload per person, upcoming deadlines. */
export default function Overview({ projectId }) {
  const { data, error, reload } = useFetch(`/projects/${projectId}/stats`);
  useLiveEvents(() => reload({ silent: true }), { filter: (e) => e.projectId === projectId });
  const openTask = useOpenTask();
  if (error) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <LoadingBlock />;

  const t = data.totals;
  const maxPriority = Math.max(1, ...Object.values(data.byPriority));
  const maxLoad = Math.max(1, ...data.workload.map((w) => w.open + w.done));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="stat-grid">
        <Stat label="Completion" value={`${pct(t.completed, t.tasks)}%`} sub={`${t.completed} of ${plural(t.tasks, 'task')} done`} icon={CircleCheck} tone="green" />
        <Stat label="Open tasks" value={t.open} sub={t.unassigned ? `${t.unassigned} unassigned` : 'All assigned'} icon={ListTodo} tone="blue" />
        <Stat label="Due in the next 7 days" value={t.dueSoon} sub={`${t.completedThisWeek} completed this week`} icon={CalendarClock} tone="amber" />
        <Stat label="Overdue" value={t.overdue} sub={t.overdue ? 'Past their due date' : 'Nothing is late'} icon={AlertTriangle} tone="red" alert={t.overdue > 0} />
      </div>

      <div className="dash-grid" style={{ marginTop: 0 }}>
        <section className="card">
          <div className="card-header"><div><h2>Workload</h2><p>Open and completed tasks per person</p></div></div>
          {data.workload.length === 0 ? <EmptyState small icon={UserRound} title="No tasks yet">Assigned work will show up here.</EmptyState> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Person</th><th style={{ width: '40%' }}>Progress</th><th>Open</th><th>Done</th><th>Overdue</th></tr></thead>
                <tbody>
                  {data.workload.map((w) => (
                    <tr key={w.id ?? 'none'}>
                      <td><span className="row" style={{ gap: 10 }}><Avatar name={w.id ? w.name : null} size="sm" /><span className={w.id ? 'strong' : 'muted'}>{w.name}</span></span></td>
                      <td>
                        <div className="stacked" style={{ height: 8, width: `${((w.open + w.done) / maxLoad) * 100}%`, minWidth: 24 }}>
                          {w.done > 0 && <span style={{ width: `${pct(w.done, w.open + w.done)}%`, background: 'var(--green)' }} />}
                          {w.open > 0 && <span style={{ width: `${pct(w.open, w.open + w.done)}%`, background: 'var(--primary)' }} />}
                        </div>
                      </td>
                      <td className="nums">{w.open}</td>
                      <td className="nums">{w.done}</td>
                      <td className="nums" style={{ color: w.overdue ? 'var(--red-700)' : 'var(--faint)', fontWeight: w.overdue ? 600 : 400 }}>{w.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="stack" style={{ gap: 20 }}>
          <section className="card">
            <div className="card-header"><div><h2>Tasks by status</h2><p>{plural(t.tasks, 'task')}</p></div></div>
            <div className="card-body">
              <div className="stacked" aria-hidden>
                {STATUSES.map((s) => data.byStatus[s.key] > 0 && <span key={s.key} style={{ width: `${pct(data.byStatus[s.key], t.tasks)}%`, background: STATUS_COLOR[s.key] }} />)}
              </div>
              <div className="legend">
                {STATUSES.map((s) => (
                  <div key={s.key} className="legend-row"><StatusIcon status={s.key} />{s.label}<span className="val">{data.byStatus[s.key]}</span><span className="pct">{pct(data.byStatus[s.key], t.tasks)}%</span></div>
                ))}
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-header"><div><h2>Open tasks by priority</h2></div></div>
            <div className="card-body bar-list">
              {PRIORITIES.map((p) => (
                <div key={p.key} className="bar-item">
                  <div className="bar-head"><span className="row" style={{ gap: 6 }}><PriorityIcon priority={p.key} />{p.label}</span><span className="val">{data.byPriority[p.key]}</span></div>
                  <div className="bar-track"><span style={{ width: `${(data.byPriority[p.key] / maxPriority) * 100}%`, background: PRIORITY_COLOR[p.key] }} /></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="card">
        <div className="card-header"><div><h2>Upcoming deadlines</h2><p>Open tasks with the nearest due dates</p></div></div>
        {data.upcoming.length === 0 ? <EmptyState small icon={CalendarClock} title="No upcoming deadlines">Open tasks with due dates will appear here.</EmptyState> : (
          <div className="task-list">
            {data.upcoming.map((u) => (
              <div key={u.id} className="task-row" role="button" tabIndex={0} onClick={() => openTask(u.id)} onKeyDown={(e) => { if (e.key === 'Enter') openTask(u.id); }}>
                <StatusIcon status={u.status} />
                <div className="grow"><div className="title truncate">{u.title}</div></div>
                <PriorityIcon priority={u.priority} />
                <span className="row hide-sm" style={{ gap: 6, minWidth: 140 }}><Avatar name={u.assignee_name} size="xs" /><span className="text-sm muted truncate">{u.assignee_name || 'Unassigned'}</span></span>
                <DueBadge date={u.due_date} status={u.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
