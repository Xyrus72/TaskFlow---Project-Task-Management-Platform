import { forwardRef, useEffect, useMemo, useState } from 'react';
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ListChecks, MessageSquare, Plus } from 'lucide-react';
import { useBoard, toast } from '../../store';
import { Avatar, Button, DueBadge, PriorityIcon, StatusIcon } from '../../components';
import { useOpenTask } from '../../taskrow';
import { LabelList } from '../../labels';
import { PRIORITY_LABEL, STATUS_LABEL, STATUSES, taskKey } from '../../utils';

export function ChecklistBadge({ task }) {
  const complete = task.checklist_done === task.checklist_total;
  return (
    <span className={`tc-check ${complete ? 'complete' : ''}`} title={`${task.checklist_done} of ${task.checklist_total} checklist steps done`}>
      <ListChecks aria-hidden />{task.checklist_done}/{task.checklist_total}
    </span>
  );
}

/** Presentational card; also rendered inside the drag overlay. */
export const TaskCard = forwardRef(function TaskCard({ task, overlay, dragging, ...props }, ref) {
  return (
    <div ref={ref} className={`task-card ${dragging ? 'is-dragging' : ''} ${overlay ? 'is-overlay' : ''}`} {...props}>
      <div className="tc-title">{task.title}</div>
      {task.labels?.length > 0 && <LabelList labels={task.labels} small max={3} />}
      <div className="tc-meta">
        <span title={`${PRIORITY_LABEL[task.priority]} priority`}><PriorityIcon priority={task.priority} /></span>
        <span className="tc-id">{taskKey(task.id)}</span>
        {task.due_date && <DueBadge date={task.due_date} status={task.status} />}
        <span className="spacer" />
        {task.checklist_total > 0 && <ChecklistBadge task={task} />}
        {task.comment_count > 0 && <span className="tc-comments" title={`${task.comment_count} comments`}><MessageSquare aria-hidden />{task.comment_count}</span>}
        <Avatar name={task.assignee_name} size="sm" />
      </div>
    </div>
  );
});

function SortableCard({ task, canEdit, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !canEdit });
  return (
    <TaskCard ref={setNodeRef} task={task} dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes} {...listeners}
      aria-label={`${task.title}, ${PRIORITY_LABEL[task.priority]} priority${task.assignee_name ? `, assigned to ${task.assignee_name}` : ''}`}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => { listeners?.onKeyDown?.(e); if (e.key === 'Enter') onOpen(task.id); }} />
  );
}

function QuickAdd({ status, onDone }) {
  const create = useBoard((s) => s.create);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!title.trim()) { onDone(); return; }
    setBusy(true);
    try { await create({ title: title.trim(), status }); setTitle(''); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="quick-add">
      <textarea autoFocus value={title} placeholder="Task title, then press Enter" aria-label="New task title" maxLength={200}
        onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (!title.trim()) onDone(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.stopPropagation(); onDone(); }
        }} />
      <div className="qa-actions">
        <Button size="sm" variant="primary" loading={busy} onMouseDown={(e) => e.preventDefault()} onClick={submit}>Add task</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function Column({ status, ids, tasksById, canEdit, onOpen, highlighted }) {
  const { setNodeRef } = useDroppable({ id: status });
  const [adding, setAdding] = useState(false);
  const label = STATUS_LABEL[status];
  return (
    <section className={`column ${highlighted ? 'drop-target' : ''}`} aria-label={`${label} column`}>
      <header className="column-header">
        <StatusIcon status={status} />
        <h3>{label}</h3>
        <span className="count">{ids.length}</span>
        {canEdit && <Button variant="ghost" size="sm" icon={Plus} onClick={() => setAdding(true)} aria-label={`Add a task to ${label}`} title={`Add a task to ${label}`} />}
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="column-body">
          {ids.map((id) => tasksById[id] && <SortableCard key={id} task={tasksById[id]} canEdit={canEdit} onOpen={onOpen} />)}
          {ids.length === 0 && !adding && <div className="column-empty">{canEdit ? 'Drop tasks here' : 'No tasks'}</div>}
        </div>
      </SortableContext>
      {canEdit && (adding
        ? <QuickAdd status={status} onDone={() => setAdding(false)} />
        : <div className="quick-add"><button type="button" className="add-card" onClick={() => setAdding(true)}><Plus aria-hidden />Add task</button></div>)}
    </section>
  );
}

export default function Board({ canEdit }) {
  const tasks = useBoard((s) => s.tasks);
  const sort = useBoard((s) => s.sort);
  const loading = useBoard((s) => s.loading);
  const move = useBoard((s) => s.move);
  const openTask = useOpenTask();

  const tasksById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);
  const columns = useMemo(() => {
    const cols = Object.fromEntries(STATUSES.map((s) => [s.key, []]));
    const list = sort === 'position' ? [...tasks].sort((a, b) => a.position - b.position || a.id - b.id) : tasks;
    list.forEach((t) => cols[t.status]?.push(t.id));
    return cols;
  }, [tasks, sort]);

  // Working copy of the columns while a card is being dragged.
  const [items, setItems] = useState(columns);
  const [activeId, setActiveId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  useEffect(() => { if (activeId == null) setItems(columns); }, [columns, activeId]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );
  const findContainer = (id) => (id in items ? id : Object.keys(items).find((k) => items[k].includes(id)));
  const titleOf = (id) => tasksById[id]?.title || 'task';

  const onDragOver = ({ active, over }) => {
    if (!over) return;
    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (!from || !to) return;
    setOverCol(to);
    if (from === to) return;
    setItems((prev) => {
      const fromItems = prev[from].filter((i) => i !== active.id);
      const toItems = [...prev[to]];
      let index = toItems.length;
      if (!(over.id in prev)) {
        const overIndex = toItems.indexOf(over.id);
        const below = active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
        index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : toItems.length;
      }
      toItems.splice(index, 0, active.id);
      return { ...prev, [from]: fromItems, [to]: toItems };
    });
  };

  const onDragEnd = ({ active, over }) => {
    const id = active.id;
    setActiveId(null);
    setOverCol(null);
    if (!over) { setItems(columns); return; }
    const container = findContainer(id);
    let col = items[container];
    if (container === findContainer(over.id) && !(over.id in items)) {
      const from = col.indexOf(id);
      const to = col.indexOf(over.id);
      if (from !== to) col = arrayMove(col, from, to);
    }
    setItems((prev) => ({ ...prev, [container]: col }));

    const task = tasksById[id];
    const index = col.indexOf(id);
    const statusChanged = task.status !== container;
    if (!statusChanged && columns[container].indexOf(id) === index) return;
    let position;
    if (sort !== 'position') {
      if (!statusChanged) return; // the list is ordered by another field, so manual reordering does not apply
      position = Math.max(0, ...tasks.filter((t) => t.status === container).map((t) => t.position)) + 1000;
    } else {
      const prev = tasksById[col[index - 1]];
      const next = tasksById[col[index + 1]];
      position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1000 : next ? next.position - 1000 : 1000;
    }
    move(id, container, position);
  };

  if (loading && tasks.length === 0) {
    return <div className="board">{STATUSES.map((s) => <div key={s.key} className="column" style={{ height: 360 }} />)}</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={({ active }) => { setActiveId(active.id); setOverCol(findContainer(active.id)); }}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); setOverCol(null); setItems(columns); }}
      accessibility={{
        screenReaderInstructions: { draggable: 'To move a task, press Space, use the arrow keys, then press Space again to drop it. Press Escape to cancel, or Enter to open the task.' },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
          onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is over ${STATUS_LABEL[findContainer(over.id)]}.` : undefined),
          onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} moved to ${STATUS_LABEL[findContainer(over.id)]}.` : `${titleOf(active.id)} was not moved.`),
          onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
        },
      }}
    >
      <div className="board">
        {STATUSES.map((s) => (
          <Column key={s.key} status={s.key} ids={items[s.key]} tasksById={tasksById} canEdit={canEdit} onOpen={openTask}
            highlighted={activeId != null && overCol === s.key} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
        {activeId != null && tasksById[activeId] ? <TaskCard task={tasksById[activeId]} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
