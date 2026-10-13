import { useLocation, useNavigate } from 'react-router-dom';
import { Circle, CircleCheck } from 'lucide-react';
import { DueBadge, PriorityIcon, ProjectChip, StatusIcon, StatusPill } from './components';
import { PRIORITY_LABEL } from './utils';

/** Opens a task in the global drawer by adding ?task=<id> to the current URL. */
export function useOpenTask() {
  const navigate = useNavigate();
  const loc = useLocation();
  return (id) => {
    const params = new URLSearchParams(loc.search);
    params.set('task', id);
    navigate({ pathname: loc.pathname, search: `?${params}` });
  };
}

/** One task in a list (dashboard, My tasks). Optional quick "mark done" checkbox. */
export function TaskRow({ task, onToggleDone, showStatus = true, showProject = true }) {
  const openTask = useOpenTask();
  const done = task.status === 'done';
  return (
    <div className={`task-row ${done ? 'done' : ''}`} role="button" tabIndex={0}
      onClick={() => openTask(task.id)} onKeyDown={(e) => { if (e.key === 'Enter') openTask(task.id); }}>
      {onToggleDone ? (
        <button type="button" className={`check-btn ${done ? 'checked' : ''}`} aria-label={done ? 'Mark as not done' : 'Mark as done'}
          title={done ? 'Mark as not done' : 'Mark as done'} onClick={(e) => { e.stopPropagation(); onToggleDone(task); }}>
          {done ? <CircleCheck /> : <Circle />}
        </button>
      ) : <StatusIcon status={task.status} />}
      <div className="grow">
        <div className="title truncate">{task.title}</div>
        {showProject && task.project_name && <div className="meta"><ProjectChip id={task.project_id} name={task.project_name} /></div>}
      </div>
      <span className="row" style={{ gap: 12 }}>
        <span title={`${PRIORITY_LABEL[task.priority]} priority`}><PriorityIcon priority={task.priority} /></span>
        {showStatus && <span className="hide-sm"><StatusPill status={task.status} /></span>}
        {task.due_date ? <DueBadge date={task.due_date} status={task.status} /> : <span className="due due-chip faint hide-sm">No date</span>}
      </span>
    </div>
  );
}
