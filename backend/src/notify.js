import { bus } from './bus.js';
import { Notification, Project, User, nextId } from './models.js';

/**
 * Create one notification per recipient and push a live update to each of them.
 * Never notifies the person who did the action, and only notifies people who can still see the project.
 */
export async function notify({ userIds, actorId, type, projectId, taskId = null, text = '' }) {
  const candidates = [...new Set(userIds.filter((id) => id && id !== actorId))];
  if (!candidates.length) return;
  const [project, admins] = await Promise.all([
    Project.findById(projectId, { members: 1 }).lean(),
    User.find({ _id: { $in: candidates }, role: 'admin' }, { _id: 1 }).lean(),
  ]);
  const allowed = new Set([...(project?.members || []).map((m) => m.userId), ...admins.map((a) => a._id)]);
  for (const userId of candidates.filter((id) => allowed.has(id))) {
    await Notification.create({ _id: await nextId('notifications'), userId, actorId, type, projectId, taskId, text });
    bus.emit('notify', { userId });
  }
}

/** Ids of the members mentioned as "@Full Name" in a comment (case-insensitive). */
export function mentionedIds(body, members) {
  const text = body.toLowerCase();
  return members.filter((m) => text.includes(`@${m.name.toLowerCase()}`)).map((m) => m.id);
}
