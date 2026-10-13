import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight, FolderPlus, ListChecks, ListPlus, ListX, MessageSquare, MessageSquareOff, MessageSquarePlus, Pencil, Plus, Tag, Trash2, UserMinus, UserPlus, Users, Settings, ArrowUpDown,
} from 'lucide-react';
import { Avatar } from './components';
import { parseChange, timeAgo, fmtDateTime } from './utils';

/** Link that opens a task in the drawer without leaving the current page. */
export function TaskLink({ id, children, className = 'task-ref' }) {
  const loc = useLocation();
  const params = new URLSearchParams(loc.search);
  params.set('task', id);
  return <Link to={{ pathname: loc.pathname, search: `?${params}` }} className={className}>{children}</Link>;
}

const ICONS = {
  'task.created': Plus, 'task.moved': ArrowRight, 'task.assigned': UserPlus, 'task.updated': Pencil, 'task.deleted': Trash2,
  'comment.added': MessageSquare, 'comment.edited': MessageSquare, 'comment.deleted': Trash2,
  'member.added': UserPlus, 'member.removed': UserMinus, 'member.role_changed': Users,
  'project.created': FolderPlus, 'project.updated': Settings,
  'member.chat_removed': MessageSquareOff, 'member.chat_restored': MessageSquarePlus,
  'checklist.added': ListPlus, 'checklist.completed': ListChecks, 'checklist.removed': ListX,
};
const iconFor = (a) => (a.action === 'task.updated' && a.details?.startsWith('labels:') ? Tag : ICONS[a.action] || ArrowUpDown);

const Change = ({ from, to }) => (
  <div className="feed-change"><span>{from}</span><ArrowRight className="arrow" width={12} height={12} aria-hidden /><span>{to}</span></div>
);

/**
 * Turn an activity row into a readable sentence (+ an optional detail line).
 * `inTask` phrases it for the task's own history ("moved this task").
 */
export function describe(a, { inTask = false } = {}) {
  const title = a.task_title;
  const task = inTask ? 'this task'
    : title && a.task_id ? <TaskLink id={a.task_id}>{title}</TaskLink>
      : <b>{a.details}</b>;
  const change = parseChange(a.details);
  switch (a.action) {
    case 'project.created': return { text: <>created the project <b>{a.details}</b></> };
    case 'project.updated':
      return a.details === 'description'
        ? { text: <>updated the project description</> }
        : { text: <>changed the project {change?.field}</>, extra: change && <Change {...change} /> };
    case 'task.created': return { text: <>created {inTask ? 'this task' : title ? task : <b>{a.details}</b>}</> };
    case 'task.deleted': return { text: <>deleted <b>{a.details}</b></> };
    case 'task.moved': {
      const [from, to] = a.details.split(' → ');
      return { text: <>moved {task}</>, extra: <Change from={from} to={to} /> };
    }
    case 'task.assigned':
      return a.details === 'Unassigned'
        ? { text: <>unassigned {task}</> }
        : { text: <>assigned {task} to <b>{a.details}</b></> };
    case 'task.updated':
      if (a.details === 'description') return { text: <>updated the description of {task}</> };
      return { text: <>changed the {change?.field || 'details'} of {task}</>, extra: change && <Change {...change} /> };
    case 'checklist.added': return { text: <>added a step to {inTask ? 'the checklist' : task}</>, extra: <div className="feed-quote">{a.details}</div> };
    case 'checklist.completed': return { text: <>completed a step{inTask ? '' : <> on {task}</>}</>, extra: <div className="feed-quote">{a.details}</div> };
    case 'checklist.removed': return { text: <>removed a step from {inTask ? 'the checklist' : task}</>, extra: <div className="feed-quote">{a.details}</div> };
    case 'comment.added': return { text: <>commented on {task}</>, extra: <div className="feed-quote">{a.details}</div> };
    case 'comment.edited': return { text: <>edited a comment on {task}</> };
    case 'comment.deleted': return { text: <>deleted a comment on {task}</> };
    case 'member.added': {
      const [name, role] = a.details.split(' as ');
      return { text: <>added <b>{name}</b> to the project as {role}</> };
    }
    case 'member.role_changed':
      return { text: <>changed <b>{change?.field}</b>’s role</>, extra: change && <Change from={change.from} to={change.to} /> };
    case 'member.removed': return { text: <>removed <b>{a.details}</b> from the project</> };
    case 'member.chat_removed': return { text: <>removed <b>{a.details}</b> from the project chat</> };
    case 'member.chat_restored': return { text: <>added <b>{a.details}</b> back to the project chat</> };
    default: return { text: <>{a.action.replace('.', ' ')} {a.details}</> };
  }
}

export function FeedItem({ a, showProject }) {
  const { text, extra } = describe(a);
  return (
    <div className="feed-item">
      <Avatar name={a.user_name || 'Unknown'} size="md" />
      <div className="grow">
        <div className="feed-text"><b>{a.user_name || 'Someone'}</b> {text}</div>
        {extra}
        <div className="feed-time" title={fmtDateTime(a.created_at)}>
          {timeAgo(a.created_at)}{showProject && a.project_name && <> · {a.project_name}</>}
        </div>
      </div>
    </div>
  );
}

export function TimelineItem({ a }) {
  const Icon = iconFor(a);
  const { text, extra } = describe(a, { inTask: true });
  return (
    <div className="timeline-item">
      <span className="ti-icon"><Icon aria-hidden /></span>
      <div className="grow">
        <div><b>{a.user_name || 'Someone'}</b> {text} <span className="time" title={fmtDateTime(a.created_at)}>· {timeAgo(a.created_at)}</span></div>
        {extra}
      </div>
    </div>
  );
}
