// Turn documents into the API's JSON shape (snake_case, numeric ids, joined names),
// keeping responses identical to what clients already expect.
import { Comment, Project, Task, Team, User } from './models.js';

export const iso = (d) => (d ? new Date(d).toISOString() : null);

const uniq = (xs) => [...new Set(xs.filter((x) => x != null))];

/** Map of id → user for the given ids (one query). */
export async function usersById(ids, projection = { name: 1, email: 1, role: 1 }) {
  const list = uniq(ids);
  if (!list.length) return new Map();
  const users = await User.find({ _id: { $in: list } }, projection).lean();
  return new Map(users.map((u) => [u._id, u]));
}

export async function namesById(Model, ids) {
  const list = uniq(ids);
  if (!list.length) return new Map();
  return new Map((await Model.find({ _id: { $in: list } }, { name: 1, title: 1 }).lean()).map((d) => [d._id, d.name ?? d.title]));
}

export const userOut = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, created_at: iso(u.createdAt) });

/** Task documents → API rows with assignee / creator / project names and comment counts. */
export async function hydrateTasks(tasks) {
  if (!tasks.length) return [];
  const [users, projectList, counts] = await Promise.all([
    usersById(tasks.flatMap((t) => [t.assigneeId, t.createdBy]), { name: 1 }),
    Project.find({ _id: { $in: uniq(tasks.map((t) => t.projectId)) } }, { name: 1, labels: 1 }).lean(),
    Comment.aggregate([{ $match: { taskId: { $in: tasks.map((t) => t._id) } } }, { $group: { _id: '$taskId', n: { $sum: 1 } } }]),
  ]);
  const commentCount = new Map(counts.map((c) => [c._id, c.n]));
  const projects = new Map(projectList.map((p) => [p._id, p]));
  return tasks.map((t) => {
    const project = projects.get(t.projectId);
    const ids = t.labelIds || [];
    const checklist = (t.checklist || []).map(({ id, text, done }) => ({ id, text, done }));
    return {
      id: t._id,
      project_id: t.projectId,
      title: t.title,
      description: t.description ?? '',
      status: t.status,
      priority: t.priority,
      assignee_id: t.assigneeId ?? null,
      due_date: t.dueDate ?? null,
      position: t.position,
      created_by: t.createdBy ?? null,
      created_at: iso(t.createdAt),
      updated_at: iso(t.updatedAt),
      completed_at: iso(t.completedAt),
      assignee_name: users.get(t.assigneeId)?.name ?? null,
      creator_name: users.get(t.createdBy)?.name ?? null,
      project_name: project?.name ?? null,
      comment_count: commentCount.get(t._id) || 0,
      label_ids: ids,
      // In the project's label order, so chips always appear in the same order.
      labels: (project?.labels || []).filter((l) => ids.includes(l.id)).map(({ id, name, color }) => ({ id, name, color })),
      checklist,
      checklist_total: checklist.length,
      checklist_done: checklist.filter((i) => i.done).length,
    };
  });
}

export async function hydrateTask(task) {
  return task ? (await hydrateTasks([task]))[0] : null;
}

export async function hydrateComments(comments) {
  const users = await usersById(comments.map((c) => c.userId), { name: 1 });
  return comments.map((c) => ({
    id: c._id,
    task_id: c.taskId,
    user_id: c.userId ?? null,
    body: c.body,
    created_at: iso(c.createdAt),
    updated_at: iso(c.updatedAt),
    user_name: users.get(c.userId)?.name ?? null,
  }));
}

/** Activity rows with the actor's name, plus project name and current task title when asked. */
export async function hydrateActivities(rows, { project = false, task = false } = {}) {
  const [users, projects, tasks] = await Promise.all([
    usersById(rows.map((a) => a.userId), { name: 1 }),
    project ? namesById(Project, rows.map((a) => a.projectId)) : new Map(),
    task ? namesById(Task, rows.map((a) => a.taskId)) : new Map(),
  ]);
  return rows.map((a) => ({
    id: a._id,
    project_id: a.projectId,
    task_id: a.taskId ?? null,
    user_id: a.userId ?? null,
    action: a.action,
    details: a.details ?? '',
    created_at: iso(a.createdAt),
    user_name: users.get(a.userId)?.name ?? null,
    ...(project ? { project_name: projects.get(a.projectId) ?? null } : {}),
    ...(task ? { task_title: tasks.get(a.taskId) ?? null } : {}),
  }));
}

/**
 * Embedded members → [{ id, name, email, role }] ordered by role, then name.
 * `rank` maps each role to its sort position (equal numbers sort by name).
 */
export async function memberList(members, rank) {
  const users = await usersById(members.map((m) => m.userId), { name: 1, email: 1 });
  return members
    .filter((m) => users.has(m.userId))
    .map((m) => ({ id: m.userId, name: users.get(m.userId).name, email: users.get(m.userId).email, role: m.role }))
    .sort((a, b) => (rank[a.role] ?? 99) - (rank[b.role] ?? 99) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export const PROJECT_RANK = { owner: 0, manager: 1, member: 2, viewer: 3 };
export const TEAM_RANK = { lead: 0, member: 1 };

/** Task totals per project: { total, done, overdue } keyed by project id. */
export async function taskCountsByProject(projectIds, todayStr) {
  if (!projectIds.length) return new Map();
  const rows = await Task.aggregate([
    { $match: { projectId: { $in: projectIds } } },
    {
      $group: {
        _id: '$projectId',
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        overdue: {
          $sum: {
            $cond: [{ $and: [{ $ne: ['$status', 'done'] }, { $gt: ['$dueDate', null] }, { $lt: ['$dueDate', todayStr] }] }, 1, 0],
          },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r]));
}

export const teamNames = (ids) => namesById(Team, ids);

/** Notification documents → API rows with actor, project and (still existing) task. */
export async function hydrateNotifications(rows) {
  const [users, projects, tasks] = await Promise.all([
    usersById(rows.map((n) => n.actorId), { name: 1 }),
    namesById(Project, rows.map((n) => n.projectId)),
    namesById(Task, rows.map((n) => n.taskId)),
  ]);
  return rows.map((n) => ({
    id: n._id,
    type: n.type,
    read: !!n.readAt,
    created_at: iso(n.createdAt),
    text: n.text,
    actor: n.actorId && users.get(n.actorId) ? { id: n.actorId, name: users.get(n.actorId).name } : null,
    project: n.projectId && projects.get(n.projectId) ? { id: n.projectId, name: projects.get(n.projectId) } : null,
    task: n.taskId && tasks.get(n.taskId) ? { id: n.taskId, title: tasks.get(n.taskId) } : null,
  }));
}
