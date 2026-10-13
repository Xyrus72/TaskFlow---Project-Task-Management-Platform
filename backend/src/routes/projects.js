import { Router } from 'express';
import { z } from 'zod';
import { containsRx, logActivity, today, plusDays, daysAgo } from '../db.js';
import { bus } from '../bus.js';
import { Activity, ChatMessage, ChatRead, VoiceClip, Comment, Notification, Project, Task, Team, User, nextId, LABEL_COLORS } from '../models.js';
import { unreadCount } from '../chat.js';
import { notify } from '../notify.js';
import { validate, requirePerm, HttpError } from '../middleware.js';
import { hydrateActivities, iso, memberList, PROJECT_RANK, taskCountsByProject, usersById } from '../serialize.js';

const r = Router();

const projectSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(2000).optional().default(''),
  teamId: z.number().int().positive().nullable().optional(),
});
const listQuery = z.object({
  search: z.string().trim().max(100).optional().default(''),
  teamId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  sort: z.enum(['name', 'created_at', 'task_count', 'progress']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const labelSchema = z.object({
  name: z.string().trim().min(1, 'Give the label a name').max(30, 'Keep label names under 30 characters'),
  color: z.enum(LABEL_COLORS).default('blue'),
});
const memberSchema = z.object({ userId: z.number().int().positive(), role: z.enum(['manager', 'member', 'viewer']).default('member') });

const myRole = (project, user) => (user.role === 'admin' ? 'owner' : project.members.find((m) => m.userId === user.id)?.role || null);

/** Shared project columns + task counts, exactly as the API has always returned them. */
function projectRow(p, { counts, teams, users }) {
  const c = counts.get(p._id) || {};
  return {
    id: p._id,
    name: p.name,
    description: p.description,
    team_id: p.teamId ?? null,
    owner_id: p.ownerId,
    created_at: iso(p.createdAt),
    team_name: teams.get(p.teamId)?.name ?? null,
    owner_name: users.get(p.ownerId)?.name ?? null,
    task_count: c.total || 0,
    done_count: c.done || 0,
    overdue_count: c.overdue || 0,
    member_count: p.members.length,
  };
}

async function lookups(projects) {
  const [counts, teamList, users] = await Promise.all([
    taskCountsByProject(projects.map((p) => p._id), today()),
    Team.find({ _id: { $in: projects.map((p) => p.teamId).filter(Boolean) } }, { name: 1 }).lean(),
    usersById(projects.map((p) => p.ownerId), { name: 1 }),
  ]);
  return { counts, teams: new Map(teamList.map((t) => [t._id, t])), users };
}

async function getProject(id, user) {
  const p = await Project.findById(id).lean();
  return {
    ...projectRow(p, await lookups([p])),
    members: await memberList(p.members, PROJECT_RANK),
    labels: (p.labels || []).map(({ id, name, color }) => ({ id, name, color })),
    my_role: myRole(p, user),
    chat_blocked: p.chatBlocked || [],
    chat_unread: (p.chatBlocked || []).includes(user.id) ? 0 : await unreadCount(user.id, id),
  };
}

r.get('/', validate(listQuery, 'query'), async (req, res) => {
  const { search, teamId, page, limit, sort, order } = req.valid.query;
  const rx = containsRx(search);
  const filter = { $or: [{ name: rx }, { description: rx }] };
  if (req.user.role !== 'admin') filter['members.userId'] = req.user.id;
  if (teamId) filter.teamId = teamId;
  // A user only ever sees a handful of projects, so sorting by computed task stats in memory is fine.
  const projects = await Project.find(filter).lean();
  const ctx = await lookups(projects);
  const rows = projects.map((p) => ({ p, row: projectRow(p, ctx) }));
  const key = {
    name: ({ row }) => row.name.toLowerCase(),
    created_at: ({ p }) => p.createdAt.getTime(),
    task_count: ({ row }) => row.task_count,
    progress: ({ row }) => (row.task_count ? row.done_count / row.task_count : 0),
  }[sort];
  const dir = order === 'asc' ? 1 : -1;
  rows.sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : b.p._id - a.p._id));
  const pageRows = rows.slice((page - 1) * limit, page * limit);
  const data = await Promise.all(pageRows.map(async ({ p, row }) => ({
    ...row,
    my_role: myRole(p, req.user),
    members_preview: (await memberList(p.members, { owner: 0, manager: 1, member: 2, viewer: 2 })).slice(0, 5).map(({ id, name }) => ({ id, name })),
  })));
  res.json({ data, pagination: { page, limit, total: rows.length, pages: Math.ceil(rows.length / limit) || 1 } });
});

r.post('/', validate(projectSchema), async (req, res) => {
  const { name, description, teamId = null } = req.valid.body;
  let team = null;
  if (teamId) {
    team = await Team.findById(teamId).lean();
    if (!team) throw new HttpError(404, 'Team not found');
    if (req.user.role !== 'admin' && !team.members.some((m) => m.userId === req.user.id))
      throw new HttpError(403, 'You can only create projects in teams you belong to');
  }
  // The creator is the owner; everyone in the team joins as a member.
  const members = [{ userId: req.user.id, role: 'owner' }];
  for (const m of team?.members || []) if (!members.some((x) => x.userId === m.userId)) members.push({ userId: m.userId, role: 'member' });
  const project = await Project.create({ _id: await nextId('projects'), name, description, teamId, ownerId: req.user.id, members });
  await logActivity({ projectId: project._id, userId: req.user.id, action: 'project.created', details: name });
  await notify({ userIds: members.map((m) => m.userId), actorId: req.user.id, type: 'added', projectId: project._id, text: name });
  res.status(201).json(await getProject(project._id, req.user));
});

r.get('/:projectId', requirePerm('project:read'), async (req, res) => res.json(await getProject(req.projectId, req.user)));

r.patch('/:projectId', requirePerm('project:update'), validate(projectSchema.partial()), async (req, res) => {
  const { name, description, teamId } = req.valid.body;
  const before = await getProject(req.projectId, req.user);
  if (teamId && !(await Team.exists({ _id: teamId }))) throw new HttpError(404, 'Team not found');
  const set = {};
  if (name !== undefined) set.name = name;
  if (description !== undefined) set.description = description;
  if (teamId !== undefined) set.teamId = teamId;
  await Project.updateOne({ _id: req.projectId }, { $set: set });
  const after = await getProject(req.projectId, req.user);
  const log = (details) => logActivity({ projectId: req.projectId, userId: req.user.id, action: 'project.updated', details });
  if (after.name !== before.name) await log(`name: ${before.name} → ${after.name}`);
  if ((after.description || '') !== (before.description || '')) await log('description');
  if (after.team_id !== before.team_id) await log(`team: ${before.team_name || 'none'} → ${after.team_name || 'none'}`);
  res.json(after);
});

r.delete('/:projectId', requirePerm('project:delete'), async (req, res) => {
  const project = await Project.findById(req.projectId, { members: 1 }).lean();
  const recipients = project.members.map((m) => m.userId);
  // No foreign keys in MongoDB: remove everything that belongs to the project explicitly.
  await Promise.all([
    Task.deleteMany({ projectId: req.projectId }),
    Comment.deleteMany({ projectId: req.projectId }),
    Activity.deleteMany({ projectId: req.projectId }),
    Notification.deleteMany({ projectId: req.projectId }),
    ChatMessage.deleteMany({ projectId: req.projectId }),
    ChatRead.deleteMany({ projectId: req.projectId }),
    VoiceClip.deleteMany({ projectId: req.projectId }),
  ]);
  await Project.deleteOne({ _id: req.projectId });
  bus.emit('change', { projectId: req.projectId, userId: req.user.id, action: 'project.deleted', recipients });
  res.status(204).end();
});

/* ------------- Project members (project-level permissions) ------------- */
r.get('/:projectId/members', requirePerm('project:read'), async (req, res) => {
  const p = await Project.findById(req.projectId, { members: 1 }).lean();
  res.json({ data: await memberList(p.members, PROJECT_RANK) });
});

r.post('/:projectId/members', requirePerm('member:manage'), validate(memberSchema), async (req, res) => {
  const { userId, role } = req.valid.body;
  const u = await User.findById(userId, { name: 1 }).lean();
  if (!u) throw new HttpError(404, 'User not found');
  const project = await Project.findById(req.projectId, { members: 1 }).lean();
  const current = project.members.find((m) => m.userId === userId)?.role;
  if (current === 'owner') throw new HttpError(400, 'The project owner’s role cannot be changed');
  if (current === role) return res.json(await getProject(req.projectId, req.user));
  if (current) await Project.updateOne({ _id: req.projectId, 'members.userId': userId }, { $set: { 'members.$.role': role } });
  else await Project.updateOne({ _id: req.projectId, 'members.userId': { $ne: userId } }, { $push: { members: { userId, role } } });
  await logActivity(current
    ? { projectId: req.projectId, userId: req.user.id, action: 'member.role_changed', details: `${u.name}: ${current} → ${role}` }
    : { projectId: req.projectId, userId: req.user.id, action: 'member.added', details: `${u.name} as ${role}` });
  if (!current) {
    const p = await Project.findById(req.projectId, { name: 1 }).lean();
    await notify({ userIds: [userId], actorId: req.user.id, type: 'added', projectId: req.projectId, text: p.name });
  }
  res.status(current ? 200 : 201).json(await getProject(req.projectId, req.user));
});

r.delete('/:projectId/members/:userId', requirePerm('member:manage'), async (req, res) => {
  const uid = Number(req.params.userId);
  const project = await Project.findById(req.projectId, { members: 1 }).lean();
  const current = project.members.find((m) => m.userId === uid)?.role;
  if (!current) throw new HttpError(404, 'User is not a member of this project');
  if (current === 'owner') throw new HttpError(400, 'The project owner cannot be removed');
  const u = await User.findById(uid, { name: 1 }).lean();
  await Project.updateOne({ _id: req.projectId }, { $pull: { members: { userId: uid }, chatBlocked: uid } });
  // Open tasks assigned to someone who left the project become unassigned.
  await Task.updateMany({ projectId: req.projectId, assigneeId: uid }, { $set: { assigneeId: null } });
  await logActivity({ projectId: req.projectId, userId: req.user.id, action: 'member.removed', details: u?.name || '' });
  res.json(await getProject(req.projectId, req.user));
});

/* ------------- Labels ------------- */
const labelOut = ({ id, name, color }) => ({ id, name, color });
const sameName = (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
const labelChanged = (req) => bus.emit('change', { projectId: req.projectId, userId: req.user.id, action: 'project.labels' });

r.get('/:projectId/labels', requirePerm('project:read'), async (req, res) => {
  const [p, counts] = await Promise.all([
    Project.findById(req.projectId, { labels: 1 }).lean(),
    Task.aggregate([{ $match: { projectId: req.projectId } }, { $unwind: '$labelIds' }, { $group: { _id: '$labelIds', n: { $sum: 1 } } }]),
  ]);
  const n = new Map(counts.map((c) => [c._id, c.n]));
  res.json({ data: p.labels.map((l) => ({ ...labelOut(l), task_count: n.get(l.id) || 0 })) });
});

// Members can create and edit labels while they work; deleting one (it disappears from every task) needs a manager.
r.post('/:projectId/labels', requirePerm('task:update'), validate(labelSchema), async (req, res) => {
  const { name, color } = req.valid.body;
  const label = { id: await nextId('labels'), name, color };
  const added = await Project.updateOne(
    { _id: req.projectId, labels: { $not: { $elemMatch: { name: sameName(name) } } }, 'labels.29': { $exists: false } },
    { $push: { labels: label } },
  );
  if (!added.matchedCount) {
    const p = await Project.findById(req.projectId, { labels: 1 }).lean();
    if (p.labels.length >= 30) throw new HttpError(400, 'A project can have at most 30 labels');
    throw new HttpError(409, 'A label with that name already exists', { name: ['A label with that name already exists'] });
  }
  labelChanged(req);
  res.status(201).json(labelOut(label));
});

r.patch('/:projectId/labels/:labelId', requirePerm('task:update'), validate(labelSchema.partial()), async (req, res) => {
  const labelId = Number(req.params.labelId);
  const { name, color } = req.valid.body;
  const p = await Project.findById(req.projectId, { labels: 1 }).lean();
  if (!p.labels.some((l) => l.id === labelId)) throw new HttpError(404, 'Label not found');
  if (name !== undefined && p.labels.some((l) => l.id !== labelId && l.name.toLowerCase() === name.toLowerCase()))
    throw new HttpError(409, 'A label with that name already exists', { name: ['A label with that name already exists'] });
  const set = {};
  if (name !== undefined) set['labels.$.name'] = name;
  if (color !== undefined) set['labels.$.color'] = color;
  if (Object.keys(set).length) await Project.updateOne({ _id: req.projectId, 'labels.id': labelId }, { $set: set });
  labelChanged(req);
  const updated = (await Project.findById(req.projectId, { labels: 1 }).lean()).labels.find((l) => l.id === labelId);
  res.json(labelOut(updated));
});

r.delete('/:projectId/labels/:labelId', requirePerm('project:update'), async (req, res) => {
  const labelId = Number(req.params.labelId);
  const removed = await Project.updateOne({ _id: req.projectId, 'labels.id': labelId }, { $pull: { labels: { id: labelId } } });
  if (!removed.matchedCount) throw new HttpError(404, 'Label not found');
  await Task.updateMany({ projectId: req.projectId, labelIds: labelId }, { $pull: { labelIds: labelId } });
  labelChanged(req);
  res.status(204).end();
});

/* ------------- Activity history & statistics ------------- */
r.get('/:projectId/activity', requirePerm('project:read'), validate(pageQuery, 'query'), async (req, res) => {
  const { page, limit } = req.valid.query;
  const filter = { projectId: req.projectId };
  const [total, rows] = await Promise.all([
    Activity.countDocuments(filter),
    Activity.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({ data: await hydrateActivities(rows, { task: true }), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

r.get('/:projectId/stats', requirePerm('project:read'), async (req, res) => {
  const projectId = req.projectId;
  const t = today();
  const open = { projectId, status: { $ne: 'done' } };
  const byStatus = { todo: 0, in_progress: 0, review: 0, done: 0 };
  const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
  const [statusRows, priorityRows, overdue, dueSoon, completedThisWeek, unassigned, workloadRows, upcoming] = await Promise.all([
    Task.aggregate([{ $match: { projectId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Task.aggregate([{ $match: open }, { $group: { _id: '$priority', n: { $sum: 1 } } }]),
    Task.countDocuments({ ...open, dueDate: { $ne: null, $lt: t } }),
    Task.countDocuments({ ...open, dueDate: { $gte: t, $lte: plusDays(7) } }),
    Task.countDocuments({ projectId, completedAt: { $gte: daysAgo(7) } }),
    Task.countDocuments({ ...open, assigneeId: null }),
    Task.aggregate([
      { $match: { projectId } },
      {
        $group: {
          _id: '$assigneeId',
          open: { $sum: { $cond: [{ $ne: ['$status', 'done'] }, 1, 0] } },
          done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'done'] }, { $gt: ['$dueDate', null] }, { $lt: ['$dueDate', t] }] }, 1, 0] } },
        },
      },
    ]),
    Task.find({ ...open, dueDate: { $ne: null } }).sort({ dueDate: 1, _id: 1 }).limit(6).lean(),
  ]);
  statusRows.forEach((x) => (byStatus[x._id] = x.n));
  priorityRows.forEach((x) => (byPriority[x._id] = x.n));
  const users = await usersById([...workloadRows.map((w) => w._id), ...upcoming.map((u) => u.assigneeId)], { name: 1 });
  const workload = workloadRows
    .map((w) => ({ id: w._id ?? null, name: users.get(w._id)?.name || 'Unassigned', open: w.open, done: w.done, overdue: w.overdue }))
    .sort((a, b) => b.open - a.open || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  res.json({
    totals: { tasks: total, open: total - byStatus.done, completed: byStatus.done, overdue, dueSoon, completedThisWeek, unassigned },
    byStatus,
    byPriority,
    workload,
    upcoming: upcoming.map((u) => ({
      id: u._id, title: u.title, status: u.status, priority: u.priority, due_date: u.dueDate, assignee_name: users.get(u.assigneeId)?.name ?? null,
    })),
  });
});

export default r;
