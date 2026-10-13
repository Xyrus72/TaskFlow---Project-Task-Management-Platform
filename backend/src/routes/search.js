import { Router } from 'express';
import { z } from 'zod';
import { containsRx } from '../db.js';
import { Project, Task } from '../models.js';
import { validate, accessScope } from '../middleware.js';
import { hydrateTasks, teamNames } from '../serialize.js';

const r = Router();
const query = z.object({ q: z.string().trim().min(1, 'Enter something to search for').max(100) });

/* Quick search across the projects and tasks the user can access (powers the Ctrl+K palette). */
r.get('/', validate(query, 'query'), async (req, res) => {
  const { q } = req.valid.query;
  const rx = containsRx(q);
  const startsWith = new RegExp(`^${rx.source}`, 'i');
  const [projectScope, taskScope] = await Promise.all([accessScope(req.user, '_id'), accessScope(req.user)]);

  const projects = await Project.find({ ...projectScope, $or: [{ name: rx }, { description: rx }] }, { name: 1, description: 1, teamId: 1 }).lean();
  // Names that start with the query first, then alphabetical.
  projects.sort((a, b) => (startsWith.test(b.name) - startsWith.test(a.name)) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const top = projects.slice(0, 5);
  const teams = await teamNames(top.map((p) => p.teamId));

  // Open tasks first, most recently updated first.
  const taskRows = await Task.aggregate([
    { $match: { ...taskScope, $or: [{ title: rx }, { description: rx }] } },
    { $addFields: { _done: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } },
    { $sort: { _done: 1, updatedAt: -1, _id: -1 } },
    { $limit: 8 },
  ]);
  const tasks = await hydrateTasks(taskRows);

  res.json({
    projects: top.map((p) => ({ id: p._id, name: p.name, description: p.description, team_name: teams.get(p.teamId) ?? null })),
    tasks: tasks.map(({ id, title, status, priority, due_date, project_id, project_name, assignee_name }) => ({ id, title, status, priority, due_date, project_id, project_name, assignee_name })),
  });
});

export default r;
