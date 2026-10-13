import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth, useNotifications, toast } from './store';
import { Avatar, Button, Popover, Spinner } from './components';
import { fmtDateTime, timeAgo } from './utils';

/** One-line description of a notification. */
export function notificationText(n) {
  const who = n.actor?.name || 'Someone';
  const task = n.task?.title || n.text;
  switch (n.type) {
    case 'assigned': return { who, text: <>assigned you <b>{task}</b></>, plain: `${who} assigned you “${task}”` };
    case 'comment': return { who, text: <>commented on <b>{n.task?.title || 'a task'}</b></>, quote: n.text, plain: `${who} commented on “${n.task?.title || 'a task'}”` };
    case 'mention': return { who, text: <>mentioned you on <b>{n.task?.title || 'a task'}</b></>, quote: n.text, plain: `${who} mentioned you on “${n.task?.title || 'a task'}”` };
    case 'chat': return { who, text: <>mentioned you in the <b>{n.project?.name || 'project'}</b> chat</>, quote: n.text, plain: `${who} mentioned you in the ${n.project?.name || 'project'} chat` };
    case 'added': return { who, text: <>added you to <b>{n.project?.name || n.text}</b></>, plain: `${who} added you to “${n.project?.name || n.text}”` };
    default: return { who, text: <>{n.text}</>, plain: n.text };
  }
}

const target = (n) => {
  if (!n.project) return null;
  if (n.type === 'chat') return `/projects/${n.project.id}/chat`;
  return n.task ? `/projects/${n.project.id}?task=${n.task.id}` : `/projects/${n.project.id}`;
};
/** Is the thing this notification is about already on screen? */
const onScreen = (n) => (n.type === 'chat'
  ? !!n.project && window.location.pathname === `/projects/${n.project.id}/chat`
  : !!n.task && Number(new URLSearchParams(window.location.search).get('task')) === n.task.id);

/** Keeps notifications fresh: loads on sign-in, refreshes on live events and announces new ones with a toast. */
export function NotificationsHost() {
  const token = useAuth((s) => s.token);
  const navigate = useNavigate();
  const { refresh, reset } = useNotifications();
  useEffect(() => {
    if (!token) { reset(); return undefined; }
    refresh().catch(() => {});
    const onNew = async () => {
      const fresh = await refresh().catch(() => null);
      const viewing = fresh && onScreen(fresh);
      // Already on screen (the task or the chat is open): count it as read instead of showing a toast.
      if (viewing) useNotifications.getState().markRead(fresh.id);
      else if (fresh) {
        const link = target(fresh);
        toast(notificationText(fresh).plain, 'info', link ? { label: 'Open', onClick: () => { useNotifications.getState().markRead(fresh.id); navigate(link); } } : undefined);
      }
    };
    window.addEventListener('tf:notification', onNew);
    return () => window.removeEventListener('tf:notification', onNew);
  }, [token, refresh, reset, navigate]);
  return null;
}

export function NotificationBell({ align = 'start' }) {
  const { items, unread, hasMore, loaded, markRead, markAllRead, loadMore } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [more, setMore] = useState(false);
  const anchor = useRef(null);
  const navigate = useNavigate();
  const shown = filter === 'unread' ? items.filter((n) => !n.read) : items;

  const openItem = (n) => {
    if (!n.read) markRead(n.id);
    const link = target(n);
    setOpen(false);
    if (link) navigate(link);
  };

  return (
    <>
      <button ref={anchor} type="button" className="bell" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications">
        <Bell aria-hidden />
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} align={align} className="notif-panel">
        <div className="notif-head">
          <h2>Notifications</h2>
          <Button variant="ghost" size="sm" icon={CheckCheck} disabled={!unread} onClick={markAllRead}>Mark all as read</Button>
        </div>
        <div className="notif-tabs segmented" role="tablist">
          <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
          <button type="button" role="tab" aria-selected={filter === 'unread'} className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>
            Unread{unread > 0 && <span className="count">{unread}</span>}
          </button>
        </div>
        <div className="notif-list">
          {!loaded && <div className="loading-block" style={{ padding: 32 }}><Spinner /></div>}
          {loaded && shown.length === 0 && (
            <div className="notif-empty"><Bell aria-hidden /><b>{filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}</b><span>You’ll hear about assignments, comments on your tasks and mentions here.</span></div>
          )}
          {shown.map((n) => {
            const t = notificationText(n);
            return (
              <button key={n.id} type="button" className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                <Avatar name={n.actor?.name || 'Someone'} size="md" />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="notif-text"><b>{t.who}</b> {t.text}</span>
                  {t.quote && <span className="notif-quote">{t.quote}</span>}
                  <span className="notif-meta" title={fmtDateTime(n.created_at)}>{timeAgo(n.created_at)}{n.project && <> · {n.project.name}</>}</span>
                </span>
                {!n.read && <span className="notif-dot" aria-label="Unread" />}
              </button>
            );
          })}
          {hasMore && filter === 'all' && (
            <div style={{ padding: 8 }}>
              <Button block size="sm" variant="ghost" loading={more} onClick={async () => { setMore(true); await loadMore().catch(() => {}); setMore(false); }}>Show older</Button>
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
