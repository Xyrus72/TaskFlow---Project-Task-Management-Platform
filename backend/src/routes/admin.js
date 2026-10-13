import { Router } from 'express';
import { z } from 'zod';
import { containsRx } from '../db.js';
import { Project, Task, Team, User } from '../models.js';
import { validate, idParam, HttpError } from '../middleware.js';
import { iso } from '../serialize.js';

const r = Router();

r.use((req, _res, next) => next(req.user.role === 'admin' ? undefined : new HttpError(403, 'Admins only')));

const listQuery = z.object({
  search: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const roleSchema = z.object({ role: z.enum(['admin', 'member']) });

/** Users with how many teams, projects and open tasks they have. */
async function withCounts(users) {
  const ids = users.map((u) => u._id);
  const countBy = async (Model, match, field) => new Map((await Model.aggregate([
    { $match: match }, ...(field.startsWith('members.') ? [{ $unwind: '$members' }, { $match: { 'members.userId': { $in: ids } } }] : []),
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
  ])).map((x) => [x._id, x.n]));
  const [teams, projects, open] = await Promise.all([
    countBy(Team, { 'members.userId': { $in: ids } }, 'members.userId'),
    countBy(Project, { 'members.userId': { $in: ids } }, 'members.userId'),
    countBy(Task, { assigneeId: { $in: ids }, status: { $ne: 'done' } }, 'assigneeId'),
  ]);
  return users.map((u) => ({
    id: u._id, name: u.name, email: u.email, role: u.role, created_at: iso(u.createdAt),
    team_count: teams.get(u._id) || 0, project_count: projects.get(u._id) || 0, open_tasks: open.get(u._id) || 0,
  }));
}

r.get('/users', validate(listQuery, 'query'), async (req, res) => {
  const { search, page, limit } = req.valid.query;
  const rx = containsRx(search);
  const filter = { $or: [{ name: rx }, { email: rx }] };
  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    // Admins first, then by name (case-insensitive).
    User.aggregate([
      { $match: filter },
      { $addFields: { _admin: { $cond: [{ $eq: ['$role', 'admin'] }, 0, 1] }, _name: { $toLower: '$name' } } },
      { $sort: { _admin: 1, _name: 1, _id: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
  ]);
  res.json({ data: await withCounts(users), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

r.patch('/users/:id', validate(roleSchema), async (req, res) => {
  const id = idParam(req.params.id, 'User');
  const user = await User.findById(id, { role: 1 }).lean();
  if (!user) throw new HttpError(404, 'User not found');
  const { role } = req.valid.body;
  if (user.role === 'admin' && role !== 'admin' && (await User.countDocuments({ role: 'admin' })) <= 1)
    throw new HttpError(400, 'The workspace needs at least one admin');
  await User.updateOne({ _id: id }, { $set: { role } });
  if (role !== 'admin' && (await User.countDocuments({ role: 'admin' })) === 0) {
    await User.updateOne({ _id: id }, { $set: { role: 'admin' } }); // a concurrent demotion got there first
    throw new HttpError(400, 'The workspace needs at least one admin');
  }
  res.json((await withCounts([await User.findById(id).lean()]))[0]);
});

export default r;
