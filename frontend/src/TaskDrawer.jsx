import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock, CircleDot, Clock, Copy, Ellipsis, Flag, Link2, MessageSquare, Pencil, Trash2, UserRound, X, History, FolderKanban, CircleCheck, Tag,
} from 'lucide-react';
import { api } from './api';
import { useAuth, useBoard, toast, confirmDialog } from './store';
import { useLiveEvents } from './hooks';
import {
  Avatar, Button, Drawer, DueBadge, EmptyState, ErrorState, Menu, Picker, PriorityIcon, ProjectChip, Skeleton, StatusIcon, Tabs,
} from './components';
import { TimelineItem } from './activity';
import { LabelField } from './labels';
import Checklist from './checklist';
import { MentionText, MentionTextarea } from './mentions';
import { fmtDateTime, PRIORITIES, STATUSES, taskKey, timeAgo } from './utils';

const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s.key, label: s.label, icon: <StatusIcon status={s.key} /> }));
const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({ value: p.key, label: p.label, icon: <PriorityIcon priority={p.key} /> }));

/** Textarea that grows with its content. */
function AutoTextarea({ value, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} {...props} />;
}

function Comment({ c, me, members, canManage, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const mine = c.user_id === me.id;

  const save = async () => {
    if (!body.trim()) return toast('A comment cannot be empty', 'error');
    setBusy(true);
    try { onSaved(await api(`/comments/${c.id}`, { method: 'PATCH', body: { body } })); setEditing(false); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete comment?', message: 'This comment will be removed for everyone.', confirmLabel: 'Delete comment', danger: true }))) return;
    try { await api(`/comments/${c.id}`, { method: 'DELETE' }); onDeleted(c.id); toast('Comment deleted'); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="comment">
      <Avatar name={c.user_name || 'Unknown'} size="md" />
      <div className="grow">
        <div className="c-head">
          <b>{c.user_name || 'Deleted user'}</b>
          <span className="time" title={fmtDateTime(c.created_at)}>{timeAgo(c.created_at)}{c.updated_at && ' · edited'}</span>
          {!editing && (mine || canManage) && (
            <span className="c-actions">
              {mine && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => { setBody(c.body); setEditing(true); }} aria-label="Edit comment" />}
              <Button variant="ghost" size="sm" icon={Trash2} onClick={remove} aria-label="Delete comment" />
            </span>
          )}
        </div>
        {editing ? (
          <div style={{ marginTop: 8 }}>
            <MentionTextarea className="textarea" style={{ minHeight: 72 }} value={body} autoFocus onChange={setBody} members={members.filter((m) => m.id !== me.id)}
              aria-label="Edit comment" maxLength={2000}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }} />
            <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
              <Button size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy} onClick={save}>Save</Button>
            </div>
          </div>
        ) : <div className="c-body"><MentionText text={c.body} members={members} /></div>}
      </div>
    </div>
  );
}

export default function TaskDrawer({ taskId, onClose }) {
  const me = useAuth((s) => s.user);
  const [task, setTask] = useState(null);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [comments, setComments] = useState(null);
  const [history, setHistory] = useState(null);
  const [tab, setTab] = useState('comments');
  const [title, setTitle] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState('');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const titleFocused = useRef(false);
  const skipTitleSave = useRef(false);

  const loadTask = useCallback(async () => {
    try {
      const t = await api(`/tasks/${taskId}`);
      setTask(t);
      setError(null);
      if (!titleFocused.current) setTitle(t.title);
      return t;
    } catch (e) { setError(e); return null; }
  }, [taskId]);
  const loadComments = useCallback(() => api(`/tasks/${taskId}/comments`).then((r) => setComments(r.data)).catch(() => {}), [taskId]);
  const loadHistory = useCallback(() => api(`/tasks/${taskId}/activity`).then((r) => setHistory(r.data)).catch(() => {}), [taskId]);
  const loadLabels = useCallback((pid) => api(`/projects/${pid}/labels`).then((r) => setLabels(r.data)).catch(() => {}), []);

  useEffect(() => {
    loadTask().then((t) => {
      if (!t) return;
      api(`/projects/${t.project_id}/members`).then((r) => setMembers(r.data)).catch(() => {});
      loadLabels(t.project_id);
    });
    loadComments();
    loadHistory();
  }, [loadTask, loadComments, loadHistory, loadLabels]);

  // Someone else changed this task: refresh everything shown.
  useLiveEvents(() => { loadTask(); loadComments(); loadHistory(); }, { filter: (e) => e.taskId === taskId && e.userId !== me.id, delay: 200 });
  // The project's labels were renamed, recoloured or deleted.
  useLiveEvents(() => { loadLabels(task.project_id); loadTask(); }, { filter: (e) => e.action === 'project.labels' && e.projectId === task?.project_id, delay: 200 });

  /** Apply a task returned by the server (checklist changes) everywhere it is shown. */
  const applyTask = (t) => {
    setTask((cur) => ({ ...cur, ...t }));
    useBoard.getState().upsert(t);
    loadHistory();
  };

  const update = async (patch, optimistic = {}) => {
    const prev = task;
    setTask((t) => ({ ...t, ...optimistic }));
    try {
      const t = await api(`/tasks/${taskId}`, { method: 'PATCH', body: patch });
      setTask((cur) => ({ ...cur, ...t }));
      useBoard.getState().upsert(t);
      loadHistory();
      return true;
    } catch (e) {
      setTask(prev);
      toast(e.message, 'error');
      return false;
    }
  };

  const saveTitle = () => {
    titleFocused.current = false;
    if (skipTitleSave.current) { skipTitleSave.current = false; return; }
    const value = title.trim();
    if (!value) { setTitle(task.title); toast('A task needs a title', 'error'); return; }
    if (value !== task.title) update({ title: value }, { title: value });
  };

  const saveDesc = async () => {
    if (desc === (task.description || '')) { setEditingDesc(false); return; }
    if (await update({ description: desc }, { description: desc })) setEditingDesc(false);
  };

  const postComment = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const c = await api(`/tasks/${taskId}/comments`, { method: 'POST', body: { body: draft } });
      setComments((list) => [...(list || []), c]);
      setDraft('');
      setTask((t) => ({ ...t, comment_count: (t.comment_count || 0) + 1 }));
      useBoard.getState().upsert({ ...task, comment_count: (task.comment_count || 0) + 1 });
      loadHistory();
    } catch (e) { toast(e.message, 'error'); } finally { setPosting(false); }
  };

  const removeTask = async () => {
    const ok = await confirmDialog({ title: 'Delete this task?', message: `“${task.title}” and its comments will be permanently deleted.`, confirmLabel: 'Delete task', danger: true });
    if (!ok) return;
    try {
      await api(`/tasks/${taskId}`, { method: 'DELETE' });
      useBoard.getState().removeLocal(taskId);
      toast('Task deleted');
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/projects/${task.project_id}?task=${taskId}`;
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url, 'info'); }
  };

  const canEdit = !!task?.can_edit;
  const memberOptions = [
    { value: '', label: 'Unassigned', icon: <Avatar size="xs" /> },
    ...members.map((m) => ({ value: m.id, label: m.name, icon: <Avatar name={m.name} size="xs" />, hint: m.id === me.id ? 'you' : undefined })),
  ];

  const header = (
    <>
      {task ? (
        <span className="row grow" style={{ minWidth: 0 }}>
          <Link to={`/projects/${task.project_id}`} className="truncate" onClick={onClose}><ProjectChip id={task.project_id} name={task.project_name} /></Link>
          <span className="faint">/</span>
          <span className="text-sm muted strong">{taskKey(task.id)}</span>
        </span>
      ) : <span className="grow" />}
      {task && <Button variant="ghost" size="sm" icon={Link2} onClick={copyLink} aria-label="Copy link to task" title="Copy link" />}
      {task && (
        <Menu
          trigger={(p) => <Button variant="ghost" size="sm" icon={Ellipsis} aria-label="More actions" {...p} />}
          items={[
            { label: 'Copy link', icon: Copy, onSelect: copyLink },
            task.can_delete && { divider: true },
            task.can_delete && { label: 'Delete task', icon: Trash2, danger: true, onSelect: removeTask },
          ]}
        />
      )}
      <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close" />
    </>
  );

  let body;
  if (error) {
    body = error.status === 404
      ? <EmptyState icon={Trash2} title="This task no longer exists">It may have been deleted by someone on your team.</EmptyState>
      : <ErrorState error={error} onRetry={loadTask} />;
  } else if (!task) {
    body = (
      <div className="td-body stack">
        <Skeleton h={28} w="70%" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={18} w={`${60 - i * 8}%`} />)}
        <Skeleton h={80} />
      </div>
    );
  } else {
    body = (
      <div className="td-body">
        <AutoTextarea className="td-title" value={title} disabled={!canEdit} aria-label="Task title" maxLength={200}
          onFocus={() => { titleFocused.current = true; }} onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
          onBlur={saveTitle} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { e.stopPropagation(); skipTitleSave.current = true; setTitle(task.title); e.currentTarget.blur(); } }} />

        {!canEdit && <div className="alert alert-info" style={{ marginTop: 12 }}><CircleDot aria-hidden />You have view-only access to this project.</div>}

        <div className="props">
          <span className="prop-label"><CircleDot aria-hidden />Status</span>
          <div className="prop-value">
            <Picker variant="ghost" value={task.status} options={STATUS_OPTIONS} disabled={!canEdit} label="Status"
              onChange={(v) => update({ status: v }, { status: v })} />
          </div>
          <span className="prop-label"><Flag aria-hidden />Priority</span>
          <div className="prop-value">
            <Picker variant="ghost" value={task.priority} options={PRIORITY_OPTIONS} disabled={!canEdit} label="Priority"
              onChange={(v) => update({ priority: v }, { priority: v })} />
          </div>
          <span className="prop-label"><UserRound aria-hidden />Assignee</span>
          <div className="prop-value">
            <Picker variant="ghost" value={task.assignee_id ?? ''} options={memberOptions} disabled={!canEdit} label="Assignee" searchable={members.length > 6}
              onChange={(v) => update({ assigneeId: v || null }, { assignee_id: v || null, assignee_name: members.find((m) => m.id === v)?.name || null })} />
          </div>
          <span className="prop-label"><CalendarClock aria-hidden />Due date</span>
          <div className="prop-value row">
            <input type="date" className="input" value={task.due_date || ''} disabled={!canEdit} aria-label="Due date"
              onChange={(e) => update({ dueDate: e.target.value || null }, { due_date: e.target.value || null })} />
            {task.due_date && <DueBadge date={task.due_date} status={task.status} showIcon={false} />}
            {canEdit && task.due_date && <Button variant="ghost" size="sm" onClick={() => update({ dueDate: null }, { due_date: null })}>Clear</Button>}
          </div>
          <span className="prop-label"><Tag aria-hidden />Labels</span>
          <div className="prop-value">
            <LabelField projectId={task.project_id} labels={labels} value={task.label_ids || []} canEdit={canEdit} canCreate={canEdit}
              onCreated={(l) => setLabels((ls) => [...ls, l])}
              onChange={(ids) => update({ labelIds: ids }, { label_ids: ids, labels: labels.filter((l) => ids.includes(l.id)) })} />
          </div>
          <span className="prop-label"><FolderKanban aria-hidden />Created</span>
          <div className="prop-value muted text-sm" title={fmtDateTime(task.created_at)}>{task.creator_name || 'Someone'} · {timeAgo(task.created_at)}</div>
          <span className="prop-label"><Clock aria-hidden />Updated</span>
          <div className="prop-value muted text-sm" title={fmtDateTime(task.updated_at)}>{timeAgo(task.updated_at)}</div>
          {task.completed_at && (
            <>
              <span className="prop-label"><CircleCheck aria-hidden />Completed</span>
              <div className="prop-value muted text-sm" title={fmtDateTime(task.completed_at)}>{timeAgo(task.completed_at)}</div>
            </>
          )}
        </div>

        <div className="td-section">
          <h3>Description</h3>
          {editingDesc ? (
            <div>
              <textarea className="textarea" value={desc} autoFocus onChange={(e) => setDesc(e.target.value)} placeholder="Add more detail…" maxLength={5000}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveDesc(); if (e.key === 'Escape') { e.stopPropagation(); setEditingDesc(false); } }} />
              <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
                <span className="hint grow">Ctrl + Enter to save</span>
                <Button size="sm" onClick={() => setEditingDesc(false)}>Cancel</Button>
                <Button size="sm" variant="primary" onClick={saveDesc}>Save</Button>
              </div>
            </div>
          ) : (
            <div className={`desc-view ${task.description ? '' : 'empty-desc'}`} role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : undefined}
              onClick={() => { if (canEdit) { setDesc(task.description || ''); setEditingDesc(true); } }}
              onKeyDown={(e) => { if (canEdit && e.key === 'Enter') { setDesc(task.description || ''); setEditingDesc(true); } }}>
              {task.description || (canEdit ? 'Add a description…' : 'No description')}
            </div>
          )}
        </div>

        <Checklist task={task} canEdit={canEdit} onTask={applyTask} />

        <div className="td-section">
          <Tabs active={tab} onChange={setTab} tabs={[
            { key: 'comments', label: 'Comments', icon: MessageSquare, count: comments?.length ?? task.comment_count },
            { key: 'history', label: 'History', icon: History },
          ]} />
          {tab === 'comments' ? (
            <div>
              {comments === null && <div style={{ padding: '16px 0' }}><Skeleton h={40} /></div>}
              {comments?.length === 0 && <p className="muted text-sm" style={{ padding: '16px 0 4px' }}>No comments yet.{task.can_comment && ' Start the conversation below.'}</p>}
              {comments?.map((c) => (
                <Comment key={c.id} c={c} me={me} members={members} canManage={task.can_delete}
                  onSaved={(nc) => { setComments((l) => l.map((x) => (x.id === nc.id ? nc : x))); loadHistory(); }}
                  onDeleted={(id) => { setComments((l) => l.filter((x) => x.id !== id)); setTask((t) => ({ ...t, comment_count: t.comment_count - 1 })); loadHistory(); }} />
              ))}
              {task.can_comment && (
                <div className="composer">
                  <Avatar name={me.name} size="md" />
                  <div className="box">
                    <MentionTextarea value={draft} onChange={setDraft} members={members.filter((m) => m.id !== me.id)}
                      placeholder="Write a comment… Type @ to mention someone" aria-label="Write a comment" maxLength={2000}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); postComment(); } }} />
                    <div className="box-foot">
                      <span className="hint">Ctrl + Enter to send</span>
                      <Button size="sm" variant="primary" loading={posting} disabled={!draft.trim()} onClick={postComment}>Comment</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="timeline" style={{ paddingTop: 16 }}>
              {history === null && <Skeleton h={40} />}
              {history?.map((a) => <TimelineItem key={a.id} a={a} />)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return <Drawer open onClose={onClose} header={header} label={task ? task.title : 'Task'}>{body}</Drawer>;
}
