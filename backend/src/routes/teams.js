import { Router } from 'express';
import { z } from 'zod';
import { containsRx } from '../db.js';
import { Project, Team, User, nextId } from '../models.js';
import { validate, idParam, HttpError } from '../middleware.js';
import { iso, memberList, TEAM_RANK, taskCountsByProject } from '../serialize.js';

const r = Router();

// Users directory (for assignee / member pickers)
r.get('/users', async (req, res) => {
  const rx = containsRx((req.query.search || '').toString().trim());
  const users = await User.find({ $or: [{ name: rx }, { email: rx }] }, { name: 1, email: 1, role: 1 }).sort({ name: 1 }).limit(50).lean();
  res.json({ data: users.map((u) => ({ id: u._id, name: u.name, email: u.email, role: u.role })) });
});

/* ---------------- Teams ---------------- */
const teamSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().max(500).optional().default(''),
});
const memberSchema = z.object({ userId: z.number().int().positive(), role: z.enum(['lead', 'member']).default('member') });
const roleSchema = z.object({ role: z.enum(['lead', 'member']) });

const leadCount = (team) => team.members.filter((m) => m.role === 'lead').length;
/** Filter that only matches if someone other than uid is still a lead (makes the 'keep a lead' rule atomic). */
const otherLead = (uid) => ({ members: { $elemMatch: { userId: { $ne: uid }, role: 'lead' } } });
const roleOf = (team, userId) => team.members.find((m) => m.userId === userId)?.role || null;
const isLead = (user, team) => user.role === 'admin' || roleOf(team, user.id) === 'lead';

async function findTeam(id) {
  const team = await Team.findById(idParam(id, 'Team')).lean();
  if (!team) throw new HttpError(404, 'Team not found');
  return team;
}

/** Full team view: members (leads first), projects with task counts, the caller's role. */
async function teamOut(team, user) {
  const [members, projects] = await Promise.all([
    memberList(team.members, TEAM_RANK),
    Project.find({ teamId: team._id }, { name: 1, description: 1 }).sort({ name: 1 }).lean(),
  ]);
  const counts = await taskCountsByProject(projects.map((p) => p._id), '');
  return {
    id: team._id,
    name: team.name,
    description: team.description,
    created_by: team.createdBy ?? null,
    created_at: iso(team.createdAt),
    member_count: team.members.length,
    project_count: projects.length,
    members,
    projects: projects.map((p) => ({ id: p._id, name: p.name, description: p.description, task_count: counts.get(p._id)?.total || 0, done_count: counts.get(p._id)?.done || 0 })),
    ...(user ? { my_role: roleOf(team, user.id), can_manage: isLead(user, team) } : {}),
  };
}

r.get('/teams', async (req, res) => {
  const admin = req.user.role === 'admin';
  const teams = await Team.find(admin ? {} : { 'members.userId': req.user.id }).sort({ name: 1 }).lean();
  const projectCounts = new Map((await Project.aggregate([
    { $match: { teamId: { $in: teams.map((t) => t._id) } } }, { $group: { _id: '$teamId', n: { $sum: 1 } } },
  ])).map((x) => [x._id, x.n]));
  const data = await Promise.all(teams.map(async (t) => ({
    id: t._id,
    name: t.name,
    description: t.description,
    created_by: t.createdBy ?? null,
    created_at: iso(t.createdAt),
    member_count: t.members.length,
    project_count: projectCounts.get(t._id) || 0,
    my_role: roleOf(t, req.user.id),
    members_preview: (await memberList(t.members, TEAM_RANK)).slice(0, 5).map(({ id, name }) => ({ id, name })),
  })));
  res.json({ data });
});

r.post('/teams', validate(teamSchema), async (req, res) => {
  const { name, description } = req.valid.body;
  const team = await Team.create({ _id: await nextId('teams'), name, description, createdBy: req.user.id, members: [{ userId: req.user.id, role: 'lead' }] });
  res.status(201).json(await teamOut(team.toObject(), req.user));
});

r.get('/teams/:id', async (req, res) => {
  const team = await findTeam(req.params.id);
  if (req.user.role !== 'admin' && !roleOf(team, req.user.id)) throw new HttpError(403, 'You are not a member of this team');
  res.json(await teamOut(team, req.user));
});

r.patch('/teams/:id', validate(teamSchema.partial()), async (req, res) => {
  const team = await findTeam(req.params.id);
  if (!isLead(req.user, team)) throw new HttpError(403, 'Only team leads can edit the team');
  const { name, description } = req.valid.body;
  const set = {};
  if (name !== undefined) set.name = name;
  if (description !== undefined) set.description = description;
  const updated = await Team.findByIdAndUpdate(team._id, { $set: set }, { returnDocument: 'after' }).lean();
  res.json(await teamOut(updated, req.user));
});

r.delete('/teams/:id', async (req, res) => {
  const team = await findTeam(req.params.id);
  if (!isLead(req.user, team)) throw new HttpError(403, 'Only team leads can delete the team');
  // Projects survive without a team and keep their members.
  await Project.updateMany({ teamId: team._id }, { $set: { teamId: null } });
  await Team.deleteOne({ _id: team._id });
  res.status(204).end();
});

/* Add a member, or change an existing member's role (upsert). */
r.post('/teams/:id/members', validate(memberSchema), async (req, res) => {
  const team = await findTeam(req.params.id);
  if (!isLead(req.user, team)) throw new HttpError(403, 'Only team leads can manage members');
  const { userId, role } = req.valid.body;
  if (!(await User.exists({ _id: userId }))) throw new HttpError(404, 'User not found');
  const current = roleOf(team, userId);
  if (current === 'lead' && role !== 'lead' && leadCount(team) <= 1) throw new HttpError(400, 'A team needs at least one lead');
  if (current) await Team.updateOne({ _id: team._id, 'members.userId': userId }, { $set: { 'members.$.role': role } });
  else await Team.updateOne({ _id: team._id, 'members.userId': { $ne: userId } }, { $push: { members: { userId, role } } });
  res.status(current ? 200 : 201).json(await teamOut(await Team.findById(team._id).lean(), req.user));
});

r.patch('/teams/:id/members/:userId', validate(roleSchema), async (req, res) => {
  const team = await findTeam(req.params.id);
  if (!isLead(req.user, team)) throw new HttpError(403, 'Only team leads can manage members');
  const uid = idParam(req.params.userId, 'Member');
  const current = roleOf(team, uid);
  if (!current) throw new HttpError(404, 'User is not a member of this team');
  if (current === 'lead' && req.valid.body.role !== 'lead' && leadCount(team) <= 1) throw new HttpError(400, 'A team needs at least one lead');
  const res2 = await Team.updateOne({ _id: team._id, 'members.userId': uid, ...(current === 'lead' && req.valid.body.role !== 'lead' ? otherLead(uid) : {}) }, { $set: { 'members.$.role': req.valid.body.role } });
  if (!res2.matchedCount) throw new HttpError(400, 'A team needs at least one lead');
  res.json(await teamOut(await Team.findById(team._id).lean(), req.user));
});

/* Leads remove members; any member can remove themselves (leave the team). */
r.delete('/teams/:id/members/:userId', async (req, res) => {
  const team = await findTeam(req.params.id);
  const uid = idParam(req.params.userId, 'Member');
  if (uid !== req.user.id && !isLead(req.user, team)) throw new HttpError(403, 'Only team leads can manage members');
  const current = roleOf(team, uid);
  if (!current) throw new HttpError(404, 'User is not a member of this team');
  if (current === 'lead' && leadCount(team) <= 1) throw new HttpError(400, 'A team needs at least one lead. Promote someone else first.');
  const res3 = await Team.updateOne({ _id: team._id, ...(current === 'lead' ? otherLead(uid) : {}) }, { $pull: { members: { userId: uid } } });
  if (!res3.matchedCount) throw new HttpError(400, 'A team needs at least one lead. Promote someone else first.');
  res.json(await teamOut(await Team.findById(team._id).lean(), req.user));
});

export default r;
