import { Router } from 'express';
import { z } from 'zod';
import { containsRx, logActivity, today, plusDays } from '../db.js';
import { bus } from '../bus.js';
import { Activity, Comment, Project, Task, nextId, PRIORITIES, STATUSES } from '../models.js';
import { mentionedIds, notify } from '../notify.js';
import { validate, requirePerm, accessScope, projectRole, roleAllows, idParam, HttpError } from '../middleware.js';
import { hydrateActivities, hydrateComments, hydrateTask, hydrateTasks, memberList, PROJECT_RANK } from '../serialize.js';

const r = Router();

const LABEL = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' };
const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

const taskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(5000).optional().default(''),
  status: z.enum(STATUSES).optional().default('todo'),
  priority: z.enum(PRIORITIES).optional().default('medium'),
  assigneeId: z.number().int().positive().nullable().optional(),
  dueDate: dateStr.nullable().optional(),
  labelIds: z.array(z.number().int().positive()).max(10, 'Use at most 10 labels').optional().default([]),
});
const updateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  dueDate: dateStr.nullable().optional(),
  position: z.number().finite().optional(),
  labelIds: z.array(z.number().int().positive()).max(10, 'Use at most 10 labels').optional(),
});
const page = { page: z.coerce.number().int().min(1).default(1), order: z.enum(['asc', 'desc']).default('asc') };
const filters = {
  search: z.string().trim().max(100).optional().default(''),
  priority: z.enum(PRIORITIES).optional(),
  due: z.enum(['overdue', 'week', 'none']).optional(),
  labelId: z.coerce.number().int().positive().optional(),
};
const listQuery = z.object({
  ...filters, ...page,
  status: z.enum(STATUSES).optional(),
  assigneeId: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  sort: z.enum(['position', 'created_at', 'updated_at', 'due_date', 'priority', 'title', 'status', 'assignee']).default('position'),
});
const mineQuery = z.object({
  ...filters, ...page,
  status: z.enum([...STATUSES, 'open', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['due_date', 'priority', 'updated_at', 'created_at', 'title', 'project', 'status']).default('due_date'),
});

/* ---------- Query building ---------- */
const OPEN = { status: { $ne: 'done' } };
const overdueQ = () => ({ ...OPEN, dueDate: { $ne: null, $lt: today() } });
const weekQ = () => ({ ...OPEN, dueDate: { $gte: today(), $lte: plusDays(7) } });

/** Search / priority / due-date filters shared by the project list and My tasks. */
function applyFilters(match, q) {
  const and = [];
  if (q.search) { const rx = containsRx(q.search); and.push({ $or: [{ title: rx }, { description: rx }] }); }
  if (q.priority) and.push({ priority: q.priority });
  if (q.labelId) and.push({ labelIds: q.labelId });
  if (q.due === 'overdue') and.push(overdueQ());
  if (q.due === 'week') and.push(weekQ());
  if (q.due === 'none') and.push({ dueDate: null });
  return and.length ? { $and: [match, ...and] } : match;
}

const missingLast = (field) => ({ $cond: [{ $eq: [{ $ifNull: [field, null] }, null] }, 1, 0] });

/** Sort stages for every supported sort key; ties always fall back to id. */
function sortStages(sort, order) {
  const dir = order === 'desc' ? -1 : 1;
  const lookupName = (from, localField) => [
    { $lookup: { from, localField, foreignField: '_id', as: '_ref', pipeline: [{ $project: { name: 1 } }] } },
    { $addFields: { _name: { $first: '$_ref.name' } } },
  ];
  switch (sort) {
    case 'priority': return [{ $addFields: { _k: { $indexOfArray: [PRIORITIES, '$priority'] } } }, { $sort: { _k: dir, _id: 1 } }];
    case 'status': return [{ $addFields: { _k: { $indexOfArray: [STATUSES, '$status'] } } }, { $sort: { _k: dir, _id: 1 } }];
    case 'due_date': return [{ $addFields: { _n: missingLast('$dueDate') } }, { $sort: { _n: 1, dueDate: dir, _id: 1 } }];
    case 'title': return [{ $addFields: { _k: { $toLower: '$title' } } }, { $sort: { _k: dir, _id: 1 } }];
    case 'assignee': return [...lookupName('users', 'assigneeId'), { $addFields: { _n: missingLast('$_name'), _k: { $toLower: { $ifNull: ['$_name', ''] } } } }, { $sort: { _n: 1, _k: dir, _id: 1 } }];
    case 'project': return [...lookupName('projects', 'projectId'), { $addFields: { _k: { $toLower: { $ifNull: ['$_name', ''] } } } }, { $sort: { _k: dir, _id: 1 } }];
    default: return [{ $sort: { [{ position: 'position', created_at: 'createdAt', updated_at: 'updatedAt' }[sort]]: dir, _id: 1 } }];
  }
}

/** Run a filtered, sorted, paginated task query and return the API envelope. */
async function paginate(match, q) {
  const [result] = await Task.aggregate([
    { $match: match },
    { $facet: { total: [{ $count: 'n' }], data: [...sortStages(q.sort, q.order), { $skip: (q.page - 1) * q.limit }, { $limit: q.limit }] } },
  ]);
  const total = result.total[0]?.n || 0;
  return { data: await hydrateTasks(result.data), pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) || 1 } };
}

async function assertAssignee(projectId, assigneeId) {
  if (assigneeId && !(await Project.exists({ _id: projectId, 'members.userId': assigneeId })))
    throw new HttpError(400, 'Assignee must be a project member', { assigneeId: ['Assignee must be a member of this project'] });
}

/** Label ids must belong to the task's project; returns them de-duplicated. */
async function assertLabels(projectId, labelIds) {
  if (!labelIds?.length) return [];
  const project = await Project.findById(projectId, { labels: 1 }).lean();
  const known = new Set(project.labels.map((l) => l.id));
  if (labelIds.some((id) => !known.has(id))) throw new HttpError(400, 'Unknown label', { labelIds: ['Choose labels from this project'] });
  return [...new Set(labelIds)];
}

/** Position after the last card in a column. */
async function endOfColumn(projectId, status) {
  const last = await Task.findOne({ projectId, status }, { position: 1 }).sort({ position: -1 }).lean();
  return (last?.position || 0) + 1000;
}

/* Tasks assigned to the current user across every project they can access. */
r.get('/tasks/mine', validate(mineQuery, 'query'), async (req, res) => {
  const q = req.valid.query;
  const base = { assigneeId: req.user.id, ...(await accessScope(req.user)) };
  const match = { ...base };
  if (q.status === 'open') Object.assign(match, OPEN);
  else if (q.status !== 'all') match.status = q.status;
  const [envelope, open, overdue, week, done] = await Promise.all([
    paginate(applyFilters(match, q), q),
    Task.countDocuments({ ...base, ...OPEN }),
    Task.countDocuments({ ...base, ...overdueQ() }),
    Task.countDocuments({ ...base, ...weekQ() }),
    Task.countDocuments({ ...base, status: 'done' }),
  ]);
  res.json({ ...envelope, counts: { open, overdue, week, done } });
});

/* List tasks of a project: search, filter, sort, paginate */
r.get('/projects/:projectId/tasks', requirePerm('project:read'), validate(listQuery, 'query'), async (req, res) => {
  const q = req.valid.query;
  const match = { projectId: req.projectId };
  if (q.status) match.status = q.status;
  if (q.assigneeId !== undefined) match.assigneeId = q.assigneeId === 0 ? null : q.assigneeId;
  res.json(await paginate(applyFilters(match, q), q));
});

r.post('/projects/:projectId/tasks', requirePerm('task:create'), validate(taskSchema), async (req, res) => {
  const { title, description, status, priority, assigneeId = null, dueDate = null } = req.valid.body;
  await assertAssignee(req.projectId, assigneeId);
  const labelIds = await assertLabels(req.projectId, req.valid.body.labelIds);
  const now = new Date();
  const task = await Task.create({
    _id: await nextId('tasks'), projectId: req.projectId, title, description, status, priority, assigneeId, dueDate, labelIds,
    position: await endOfColumn(req.projectId, status), createdBy: req.user.id, createdAt: now, updatedAt: now,
    completedAt: status === 'done' ? now : null,
  });
  await logActivity({ projectId: req.projectId, taskId: task._id, userId: req.user.id, action: 'task.created', details: title });
  if (assigneeId) await notify({ userIds: [assigneeId], actorId: req.user.id, type: 'assigned', projectId: req.projectId, taskId: task._id, text: title });
  res.status(201).json(await hydrateTask(task.toObject()));
});

/* Resolve the project of a task for RBAC */
const taskProject = async (req) => {
  const t = await Task.findById(idParam(req.params.id, 'Task'), { projectId: 1 }).lean();
  if (!t) throw new HttpError(404, 'Task not found');
  return t.projectId;
};
const wrap = (perm) => requirePerm(perm, taskProject);

r.get('/tasks/:id', wrap('project:read'), async (req, res) => {
  const task = await hydrateTask(await Task.findById(Number(req.params.id)).lean());
  res.json({
    ...task,
    my_role: req.projectRole,
    can_edit: roleAllows(req.projectRole, 'task:update'),
    can_delete: roleAllows(req.projectRole, 'task:delete'),
    can_comment: roleAllows(req.projectRole, 'comment:create'),
  });
});

const fmtDate = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'none');

r.patch('/tasks/:id', wrap('task:update'), validate(updateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const before = await hydrateTask(await Task.findById(id).lean());
  const b = req.valid.body;
  if (b.assigneeId !== undefined) await assertAssignee(before.project_id, b.assigneeId);
  if (b.labelIds !== undefined) b.labelIds = await assertLabels(before.project_id, b.labelIds);
  // A status change without an explicit position (e.g. from the task drawer) puts the card at the bottom of its new column.
  if (b.status && b.status !== before.status && b.position === undefined) b.position = await endOfColumn(before.project_id, b.status);
  const fields = { title: 'title', description: 'description', status: 'status', priority: 'priority', assigneeId: 'assigneeId', dueDate: 'dueDate', position: 'position', labelIds: 'labelIds' };
  const set = {};
  for (const [k, field] of Object.entries(fields)) if (b[k] !== undefined) set[field] = b[k];
  if (!Object.keys(set).length) return res.json(before);
  set.updatedAt = new Date();
  if (b.status && b.status !== before.status) set.completedAt = b.status === 'done' ? new Date() : null;
  await Task.updateOne({ _id: id }, { $set: set });
  const after = await hydrateTask(await Task.findById(id).lean());

  // One history entry per changed field, with before → after values.
  const log = (action, details) => logActivity({ projectId: before.project_id, taskId: id, userId: req.user.id, action, details });
  if (b.status && b.status !== before.status) await log('task.moved', `${LABEL[before.status]} → ${LABEL[b.status]}`);
  if (b.assigneeId !== undefined && b.assigneeId !== before.assignee_id) await log('task.assigned', after.assignee_name || 'Unassigned');
  if (b.priority && b.priority !== before.priority) await log('task.updated', `priority: ${PRIORITY_LABEL[before.priority]} → ${PRIORITY_LABEL[b.priority]}`);
  if (b.dueDate !== undefined && b.dueDate !== before.due_date) await log('task.updated', `due date: ${fmtDate(before.due_date)} → ${fmtDate(b.dueDate)}`);
  if (b.title !== undefined && b.title !== before.title) await log('task.updated', `title: ${before.title} → ${b.title}`);
  if (b.description !== undefined && b.description !== (before.description || '')) await log('task.updated', 'description');
  const labelNames = (t) => t.labels.map((l) => l.name).join(', ') || 'none';
  if (b.labelIds !== undefined && labelNames(before) !== labelNames(after)) await log('task.updated', `labels: ${labelNames(before)} → ${labelNames(after)}`);
  if (b.assigneeId && b.assigneeId !== before.assignee_id) {
    await notify({ userIds: [b.assigneeId], actorId: req.user.id, type: 'assigned', projectId: before.project_id, taskId: id, text: after.title });
  }
  // Reordering inside a column is not history-worthy, but other viewers still need the new order.
  if (b.position !== undefined && (!b.status || b.status === before.status)) {
    bus.emit('change', { projectId: before.project_id, taskId: id, userId: req.user.id, action: 'task.reordered' });
  }
  res.json(after);
});

r.delete('/tasks/:id', wrap('task:delete'), async (req, res) => {
  const t = await Task.findById(Number(req.params.id), { title: 1, projectId: 1 }).lean();
  // Comments go with the task; history entries stay (unlinked) so the project feed still shows the deletion.
  await Promise.all([Comment.deleteMany({ taskId: t._id }), Activity.updateMany({ taskId: t._id }, { $set: { taskId: null } })]);
  await Task.deleteOne({ _id: t._id });
  await logActivity({ projectId: t.projectId, userId: req.user.id, action: 'task.deleted', details: t.title, eventTaskId: t._id });
  res.status(204).end();
});

/* ---------------- Comments ---------------- */
const commentBody = z.object({ body: z.string().trim().min(1, 'Comment cannot be empty').max(2000) });
const excerpt = (s) => (s.length > 80 ? `${s.slice(0, 77)}…` : s);
const commentOut = async (c) => (await hydrateComments([c]))[0];

r.get('/tasks/:id/comments', wrap('project:read'), async (req, res) => {
  const comments = await Comment.find({ taskId: Number(req.params.id) }).sort({ _id: 1 }).lean();
  res.json({ data: await hydrateComments(comments) });
});

r.post('/tasks/:id/comments', wrap('comment:create'), validate(commentBody), async (req, res) => {
  const id = Number(req.params.id);
  const c = await Comment.create({ _id: await nextId('comments'), taskId: id, projectId: req.projectId, userId: req.user.id, body: req.valid.body.body });
  await logActivity({ projectId: req.projectId, taskId: id, userId: req.user.id, action: 'comment.added', details: excerpt(req.valid.body.body) });
  // People @mentioned get a "mention"; the assignee and the creator get a "comment" notification.
  const [task, project] = await Promise.all([
    Task.findById(id, { assigneeId: 1, createdBy: 1 }).lean(),
    Project.findById(req.projectId, { members: 1 }).lean(),
  ]);
  const mentioned = mentionedIds(req.valid.body.body, await memberList(project.members, PROJECT_RANK));
  const text = excerpt(req.valid.body.body);
  await notify({ userIds: mentioned, actorId: req.user.id, type: 'mention', projectId: req.projectId, taskId: id, text });
  await notify({ userIds: [task.assigneeId, task.createdBy].filter((u) => !mentioned.includes(u)), actorId: req.user.id, type: 'comment', projectId: req.projectId, taskId: id, text });
  res.status(201).json(await commentOut(c.toObject()));
});

/** Load a comment the user can see (others get 404) together with their role in its project. */
async function loadComment(req) {
  const c = await Comment.findById(idParam(req.params.commentId, 'Comment')).lean();
  const role = c && (await projectRole(req.user, c.projectId));
  if (!role) throw new HttpError(404, 'Comment not found');
  return { c, role };
}

r.patch('/comments/:commentId', validate(commentBody), async (req, res) => {
  const { c, role } = await loadComment(req);
  if (c.userId !== req.user.id || !roleAllows(role, 'comment:create')) throw new HttpError(403, 'You can only edit your own comments');
  const updated = await Comment.findByIdAndUpdate(c._id, { $set: { body: req.valid.body.body, updatedAt: new Date() } }, { returnDocument: 'after' }).lean();
  await logActivity({ projectId: c.projectId, taskId: c.taskId, userId: req.user.id, action: 'comment.edited', details: excerpt(req.valid.body.body) });
  res.json(await commentOut(updated));
});

r.delete('/comments/:commentId', async (req, res) => {
  const { c, role } = await loadComment(req);
  const own = c.userId === req.user.id && roleAllows(role, 'comment:create');
  if (!own && !roleAllows(role, 'task:delete')) throw new HttpError(403, 'Only the author or a project manager can delete this comment');
  await Comment.deleteOne({ _id: c._id });
  await logActivity({ projectId: c.projectId, taskId: c.taskId, userId: req.user.id, action: 'comment.deleted', details: excerpt(c.body) });
  res.status(204).end();
});

/* ---------------- Checklist (subtasks) ---------------- */
const itemCreate = z.object({ text: z.string().trim().min(1, 'Write the step first').max(200) });
const itemUpdate = z.object({ text: z.string().trim().min(1, 'A step cannot be empty').max(200).optional(), done: z.boolean().optional() })
  .refine((o) => o.text !== undefined || o.done !== undefined, 'Nothing to update');
const MAX_ITEMS = 50;

async function loadItem(req) {
  const task = await Task.findById(Number(req.params.id), { checklist: 1, projectId: 1 }).lean();
  const itemId = idParam(req.params.itemId, 'Checklist item');
  const item = task.checklist.find((i) => i.id === itemId);
  if (!item) throw new HttpError(404, 'Checklist item not found');
  return { task, item };
}

r.post('/tasks/:id/checklist', wrap('task:update'), validate(itemCreate), async (req, res) => {
  const id = Number(req.params.id);
  const { text } = req.valid.body;
  // The filter only matches while the list is below the limit, so the cap holds even for simultaneous requests.
  const added = await Task.updateOne(
    { _id: id, [`checklist.${MAX_ITEMS - 1}`]: { $exists: false } },
    { $push: { checklist: { id: await nextId('checklist'), text, done: false } }, $set: { updatedAt: new Date() } },
  );
  if (!added.matchedCount) throw new HttpError(400, `A checklist can have at most ${MAX_ITEMS} steps`);
  await logActivity({ projectId: req.projectId, taskId: id, userId: req.user.id, action: 'checklist.added', details: text });
  res.status(201).json(await hydrateTask(await Task.findById(id).lean()));
});

r.patch('/tasks/:id/checklist/:itemId', wrap('task:update'), validate(itemUpdate), async (req, res) => {
  const { task, item } = await loadItem(req);
  const { text, done } = req.valid.body;
  const set = { updatedAt: new Date() };
  if (text !== undefined) set['checklist.$.text'] = text;
  if (done !== undefined) set['checklist.$.done'] = done;
  await Task.updateOne({ _id: task._id, 'checklist.id': item.id }, { $set: set });
  if (done === true && !item.done) {
    await logActivity({ projectId: task.projectId, taskId: task._id, userId: req.user.id, action: 'checklist.completed', details: text ?? item.text });
  } else {
    bus.emit('change', { projectId: task.projectId, taskId: task._id, userId: req.user.id, action: 'task.checklist' });
  }
  res.json(await hydrateTask(await Task.findById(task._id).lean()));
});

r.delete('/tasks/:id/checklist/:itemId', wrap('task:update'), async (req, res) => {
  const { task, item } = await loadItem(req);
  await Task.updateOne({ _id: task._id }, { $pull: { checklist: { id: item.id } }, $set: { updatedAt: new Date() } });
  await logActivity({ projectId: task.projectId, taskId: task._id, userId: req.user.id, action: 'checklist.removed', details: item.text });
  res.json(await hydrateTask(await Task.findById(task._id).lean()));
});

r.get('/tasks/:id/activity', wrap('project:read'), async (req, res) => {
  const rows = await Activity.find({ taskId: Number(req.params.id) }).sort({ createdAt: -1, _id: -1 }).lean();
  res.json({ data: await hydrateActivities(rows) });
});

export default r;
