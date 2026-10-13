import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CircleCheck, FolderPlus, ListTodo, Plus, Users } from 'lucide-react';
import { useAuth, useUI } from '../store';
import { useDocumentTitle, useFetch, useLiveEvents } from '../hooks';
import { Button, EmptyState, ErrorState, PriorityIcon, ProgressBar, ProjectIcon, Skeleton } from '../components';
import { FeedItem } from '../activity';
import { TaskRow } from '../taskrow';
import { greeting, pct, plural, PRIORITIES, STATUS_COLOR, STATUSES, PRIORITY_COLOR } from '../utils';

function StatCard({ label, value, sub, icon: Icon, tone, alert }) {
  return (
    <div className="card stat-card">
      <div className="stat-top">{label}<span className={`stat-icon ${tone}`}><Icon aria-hidden /></span></div>
      <div className={`stat-value ${alert ? 'red' : ''}`}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="page">
      <Skeleton w={280} h={30} /><Skeleton w={360} h={16} style={{ marginTop: 10 }} />
      <div className="stat-grid" style={{ marginTop: 28 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="card stat-card"><Skeleton h={14} w="50%" /><Skeleton h={30} w="40%" style={{ marginTop: 14 }} /></div>)}</div>
      <div className="dash-grid"><div className="card" style={{ height: 320 }} /><div className="card" style={{ height: 320 }} /></div>
    </div>
  );
}

/** Latest updates in a fixed-height box that scrolls on its own, so the dashboard stays short. */
function RecentActivity({ activity }) {
  return (
    <section className="card">
      <div className="card-header"><div><h2>Recent activity</h2><p>Updates appear here as they happen</p></div></div>
      <div className="feed feed-compact feed-scroll" tabIndex={0} aria-label="Recent activity">
        {activity.length === 0 && <p className="muted text-sm" style={{ padding: 16 }}>No activity yet.</p>}
        {activity.map((a) => <FeedItem key={a.id} a={a} showProject />)}
      </div>
    </section>
  );
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const user = useAuth((s) => s.user);
  const { openNewTask, openNewProject } = useUI();
  const { data, error, reload } = useFetch('/dashboard');
  useLiveEvents(() => reload({ silent: true }));

  if (error && !data) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <DashboardSkeleton />;
  const t = data.totals;
  const first = user.name.split(' ')[0];

  if (t.projects === 0) {
    return (
      <div className="page">
        <div className="page-header"><div><h1>{greeting()}, {first}</h1><p className="page-desc">Let's get your first project set up.</p></div></div>
        <div className="card">
          <EmptyState icon={FolderPlus} title="Create your first project"
            action={<div className="row" style={{ marginTop: 20 }}><Button variant="primary" icon={Plus} onClick={() => openNewProject()}>New project</Button><Link to="/teams" className="btn btn-secondary"><Users />Create a team</Link></div>}>
            A project gives you a Kanban board, members with roles and a history of every change. You can invite a whole team at once.
          </EmptyState>
        </div>
      </div>
    );
  }

  const totalStatus = Object.values(data.byStatus).reduce((a, b) => a + b, 0);
  const maxPriority = Math.max(1, ...Object.values(data.byPriority));
  const openTotal = Object.values(data.byPriority).reduce((a, b) => a + b, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{greeting()}, {first}</h1>
          <p className="page-desc">
            {t.myOpen ? <>You have {plural(t.myOpen, 'open task')}{t.overdue ? <> and your projects have {plural(t.overdue, 'overdue task')}</> : ''}.</> : 'You have no open tasks assigned to you.'}
          </p>
        </div>
        <div className="actions">
          <Button icon={FolderPlus} onClick={() => openNewProject()}>New project</Button>
          <Button variant="primary" icon={Plus} onClick={() => openNewTask()}>New task</Button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Open tasks" value={t.open} sub={`${t.myOpen} assigned to you`} icon={ListTodo} tone="blue" />
        <StatCard label="Due in the next 7 days" value={t.dueSoon} sub={`Across ${plural(t.projects, 'project')}`} icon={CalendarClock} tone="amber" />
        <StatCard label="Overdue" value={t.overdue} sub={t.overdue ? 'Past their due date' : 'Nothing is late'} icon={AlertTriangle} tone="red" alert={t.overdue > 0} />
        <StatCard label="Completed this week" value={t.completedThisWeek} sub={`${pct(t.completed, t.tasks)}% of all tasks are done`} icon={CircleCheck} tone="green" />
      </div>

      <div className="dash-grid">
        <div className="stack" style={{ gap: 20 }}>
          <section className="card">
            <div className="card-header">
              <div><h2>My tasks</h2><p>Open work assigned to you, soonest first</p></div>
              <Link to="/my-tasks" className="link text-sm">View all</Link>
            </div>
            {data.myTasks.length === 0
              ? <EmptyState small icon={CircleCheck} title="You're all caught up">Nothing open is assigned to you right now.</EmptyState>
              : <div className="task-list">{data.myTasks.map((task) => <TaskRow key={task.id} task={task} showStatus />)}</div>}
          </section>

          <section className="card">
            <div className="card-header">
              <div><h2>Projects</h2><p>Progress across your most recent projects</p></div>
              <Link to="/projects" className="link text-sm">All projects</Link>
            </div>
            <div>
              {data.projectProgress.map((p) => {
                const v = pct(p.done, p.total);
                return (
                  <Link key={p.id} to={`/projects/${p.id}`} className="project-row">
                    <span className="row" style={{ gap: 12, minWidth: 0 }}>
                      <ProjectIcon id={p.id} name={p.name} size={34} />
                      <span style={{ minWidth: 0 }}>
                        <span className="strong truncate" style={{ display: 'block' }}>{p.name}</span>
                        <span className="text-xs muted">{p.done} of {plural(p.total, 'task')} done{p.overdue ? <span style={{ color: 'var(--red-700)' }}> · {p.overdue} overdue</span> : ''}</span>
                      </span>
                    </span>
                    <span><span className="progress-label"><span /><b>{v}%</b></span><ProgressBar value={v} tone={v === 100 ? 'green' : ''} /></span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <div className="stack" style={{ gap: 20 }}>
          <section className="card">
            <div className="card-header"><div><h2>Tasks by status</h2><p>{plural(totalStatus, 'task')} in total</p></div></div>
            <div className="card-body">
              <div className="stacked" aria-hidden>
                {STATUSES.map((s) => data.byStatus[s.key] > 0 && <span key={s.key} style={{ width: `${pct(data.byStatus[s.key], totalStatus)}%`, background: STATUS_COLOR[s.key] }} />)}
              </div>
              <div className="legend">
                {STATUSES.map((s) => (
                  <div key={s.key} className="legend-row">
                    <span className="dot" style={{ color: STATUS_COLOR[s.key] }} />{s.label}
                    <span className="val">{data.byStatus[s.key]}</span><span className="pct">{pct(data.byStatus[s.key], totalStatus)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header"><div><h2>Open tasks by priority</h2><p>{plural(openTotal, 'open task')}</p></div></div>
            <div className="card-body bar-list">
              {PRIORITIES.map((p) => (
                <div key={p.key} className="bar-item">
                  <div className="bar-head"><span className="row" style={{ gap: 6 }}><PriorityIcon priority={p.key} />{p.label}</span><span className="val">{data.byPriority[p.key]}</span></div>
                  <div className="bar-track"><span style={{ width: `${(data.byPriority[p.key] / maxPriority) * 100}%`, background: PRIORITY_COLOR[p.key] }} /></div>
                </div>
              ))}
            </div>
          </section>

          <RecentActivity activity={data.activity} />
        </div>
      </div>
    </div>
  );
}
