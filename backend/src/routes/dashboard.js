import { Router } from 'express';
import { today, plusDays, daysAgo } from '../db.js';
import { Activity, Project, Task, Team, PRIORITIES } from '../models.js';
import { accessScope } from '../middleware.js';
import { hydrateActivities, hydrateTasks, taskCountsByProject } from '../serialize.js';

const r = Router();

/* Workspace statistics across every project the user can access, plus their personal queue. */
r.get('/', async (req, res) => {
  const admin = req.user.role === 'admin';
  const scope = await accessScope(req.user);
  const projectScope = admin ? {} : { 'members.userId': req.user.id };
  const t = today();
  const open = { ...scope, status: { $ne: 'done' } };
  const mineOpen = { ...open, assigneeId: req.user.id };

  const [statusRows, priorityRows, overdue, dueSoon, completedThisWeek, myOpen, myTaskRows, projects, projectCount, teams, activityRows] = await Promise.all([
    Task.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Task.aggregate([{ $match: open }, { $group: { _id: '$priority', n: { $sum: 1 } } }]),
    Task.countDocuments({ ...open, dueDate: { $ne: null, $lt: t } }),
    Task.countDocuments({ ...open, dueDate: { $gte: t, $lte: plusDays(7) } }),
    Task.countDocuments({ ...scope, completedAt: { $gte: daysAgo(7) } }),
    Task.countDocuments(mineOpen),
    // Soonest due first (no date last), then most urgent.
    Task.aggregate([
      { $match: mineOpen },
      {
        $addFields: {
          _noDate: { $cond: [{ $eq: [{ $ifNull: ['$dueDate', null] }, null] }, 1, 0] },
          _prio: { $indexOfArray: [PRIORITIES, '$priority'] },
        },
      },
      { $sort: { _noDate: 1, dueDate: 1, _prio: -1, _id: 1 } },
      { $limit: 6 },
    ]),
    Project.find(projectScope, { name: 1 }).sort({ createdAt: -1, _id: -1 }).limit(6).lean(),
    Project.countDocuments(projectScope),
    admin ? Team.estimatedDocumentCount() : Team.countDocuments({ 'members.userId': req.user.id }),
    Activity.find(scope).sort({ createdAt: -1, _id: -1 }).limit(12).lean(),
  ]);

  const byStatus = { todo: 0, in_progress: 0, review: 0, done: 0 };
  statusRows.forEach((x) => (byStatus[x._id] = x.n));
  const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
  priorityRows.forEach((x) => (byPriority[x._id] = x.n));
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  const [myTasks, counts, activity] = await Promise.all([
    hydrateTasks(myTaskRows),
    taskCountsByProject(projects.map((p) => p._id), t),
    hydrateActivities(activityRows, { project: true, task: true }),
  ]);

  res.json({
    totals: { projects: projectCount, teams, tasks: total, open: total - byStatus.done, completed: byStatus.done, overdue, dueSoon, completedThisWeek, myOpen },
    byStatus,
    byPriority,
    myTasks: myTasks.map(({ id, title, status, priority, due_date, project_id, project_name }) => ({ id, title, status, priority, due_date, project_id, project_name })),
    projectProgress: projects.map((p) => ({ id: p._id, name: p.name, total: counts.get(p._id)?.total || 0, done: counts.get(p._id)?.done || 0, overdue: counts.get(p._id)?.overdue || 0 })),
    activity,
  });
});

export default r;
