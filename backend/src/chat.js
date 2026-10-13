import { z } from 'zod';
import { bus } from './bus.js';
import { ChatMessage, ChatRead, Project, User, VoiceClip, nextId } from './models.js';
import { logActivity } from './db.js';
import { HttpError, PERMISSIONS, projectRole, roleAllows } from './middleware.js';
import { mentionedIds, notify } from './notify.js';
import { iso, memberList, PROJECT_RANK, usersById } from './serialize.js';

// Project chat. Used by both the REST routes (routes/chat.js) and the Socket.IO server (socket.js),
// so permissions, validation and side effects are identical whichever way a message arrives.

export const messageSchema = z.object({
  body: z.string({ required_error: 'Write a message first' }).trim().min(1, 'Write a message first').max(2000, 'Keep messages under 2000 characters'),
});

export const room = (projectId) => `project:${projectId}`;

/** Publish a chat event to everyone who has the project open (socket.js forwards it to the room). */
const publish = (projectId, event, payload) => bus.emit('chat', { projectId, event, payload });

/** Chat message documents → API rows with the author's name. */
export async function hydrateMessages(rows) {
  const users = await usersById(rows.map((m) => m.userId), { name: 1 });
  return rows.map((m) => ({
    id: m._id,
    project_id: m.projectId,
    user: users.has(m.userId) ? { id: m.userId, name: users.get(m.userId).name } : null,
    body: m.body,
    voice: m.voice ? { duration: m.voice.duration, waveform: m.voice.waveform, mime: m.voice.mime, size: m.voice.size, url: `/api/messages/${m._id}/audio` } : null,
    created_at: iso(m.createdAt),
    edited_at: iso(m.editedAt),
  }));
}

function parse(input) {
  const r = messageSchema.safeParse(input ?? {});
  if (!r.success) throw new HttpError(400, 'Validation failed', r.error.flatten().fieldErrors);
  return r.data;
}

/** The caller's role in the project, or a 404/403 like the REST middleware gives. */
export async function requireRole(user, projectId, permission = 'project:read') {
  if (!Number.isInteger(projectId) || !(await Project.exists({ _id: projectId }))) throw new HttpError(404, 'Project not found');
  const role = await projectRole(user, projectId);
  if (!role) throw new HttpError(403, "You don't have access to this project");
  if (!roleAllows(role, permission)) {
    throw new HttpError(403, permission === 'chat:write'
      ? 'Viewers can read the chat but not post in it'
      : `You need the ${PERMISSIONS[permission]} role on this project to do that`);
  }
  return role;
}

/** Like requireRole, plus: people a manager removed from this project's chat can't use it. */
export async function requireChat(user, projectId, permission = 'project:read') {
  const role = await requireRole(user, projectId, permission);
  if (await isChatBlocked(user.id, projectId)) throw new HttpError(403, 'You were removed from this project’s chat');
  return role;
}
export const isChatBlocked = async (userId, projectId) => !!(await Project.exists({ _id: projectId, chatBlocked: userId }));

/** Everyone's read marker in a project: { userId: newest message id they have seen }. Powers "Seen by". */
export async function readMarkers(projectId) {
  const rows = await ChatRead.find({ projectId }, { userId: 1, lastReadId: 1 }).lean();
  return Object.fromEntries(rows.map((r) => [r.userId, r.lastReadId]));
}

/** A page of messages, oldest first. `before` is a message id (load older history). */
export async function listMessages(projectId, { before, limit = 50 } = {}) {
  const rows = await ChatMessage.find({ projectId, ...(before ? { _id: { $lt: before } } : {}) }).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  return { data: await hydrateMessages(rows.slice(0, limit).reverse()), has_more: hasMore };
}

export async function lastReadId(userId, projectId) {
  return (await ChatRead.findById(`${projectId}:${userId}`, { lastReadId: 1 }).lean())?.lastReadId ?? 0;
}

/** Messages from other people after the user's read marker. */
export async function unreadCount(userId, projectId) {
  return ChatMessage.countDocuments({ projectId, _id: { $gt: await lastReadId(userId, projectId) }, userId: { $ne: userId } });
}

/** Move the read marker forward (never back) and return the remaining unread count. */
export async function markRead(user, projectId, messageId) {
  const r = await ChatRead.updateOne(
    { _id: `${projectId}:${user.id}` },
    { $max: { lastReadId: messageId }, $setOnInsert: { projectId, userId: user.id } },
    { upsert: true },
  );
  // Tell everyone with the chat open, so "Seen by" updates live.
  if (r.modifiedCount || r.upsertedCount) publish(projectId, 'chat:seen', { projectId, userId: user.id, last_read_id: await lastReadId(user.id, projectId) });
  return unreadCount(user.id, projectId);
}

/** Post a message (member+). `clientId` is echoed back so the sender can match its optimistic copy. */
export async function createMessage(user, projectId, input, clientId) {
  await requireChat(user, projectId, 'chat:write');
  const { body } = parse(input);
  const doc = await ChatMessage.create({ _id: await nextId('messages'), projectId, userId: user.id, body });
  await markRead(user, projectId, doc._id); // writing in the chat means you've seen it
  const [message] = await hydrateMessages([doc.toObject()]);
  const out = clientId ? { ...message, client_id: String(clientId).slice(0, 64) } : message;
  publish(projectId, 'chat:message', out);

  if (body.includes('@')) {
    const project = await Project.findById(projectId, { members: 1, chatBlocked: 1 }).lean();
    const members = (await memberList(project.members, PROJECT_RANK)).filter((m) => !(project.chatBlocked || []).includes(m.id));
    await notify({ userIds: mentionedIds(body, members), actorId: user.id, type: 'chat', projectId, text: body.slice(0, 300) });
  }
  return out;
}

/* ---------- Voice messages ---------- */
export const VOICE_MAX_SECONDS = 120;
export const VOICE_MAX_BYTES = 3 * 1024 * 1024;
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|aac|wav|x-m4a)$/;

const voiceSchema = z.object({
  duration: z.coerce.number({ invalid_type_error: 'Send the duration in seconds' })
    .min(0.5, 'The recording is too short').max(VOICE_MAX_SECONDS + 1, 'Voice messages can be up to 2 minutes long'),
  waveform: z.string().max(400).optional().default('')
    .transform((s) => s.split(',').filter(Boolean).slice(0, 64).map((n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0))))),
});

/** Post a voice message (member+). `data` is the raw audio, `mime` its content type. */
export async function createVoiceMessage(user, projectId, { data, mime = '', ...meta }, clientId) {
  await requireChat(user, projectId, 'chat:write');
  const type = mime.split(';')[0].trim().toLowerCase();
  if (!AUDIO_TYPES.test(type)) throw new HttpError(400, 'Send the recording as audio (webm, ogg, mp4, mpeg, aac or wav)');
  if (!Buffer.isBuffer(data) || !data.length) throw new HttpError(400, 'The recording is empty');
  if (data.length > VOICE_MAX_BYTES) throw new HttpError(413, 'Voice messages can be up to 3 MB');
  const r = voiceSchema.safeParse(meta);
  if (!r.success) throw new HttpError(400, 'Validation failed', r.error.flatten().fieldErrors);
  const { duration, waveform } = r.data;

  const id = await nextId('messages');
  await VoiceClip.create({ _id: id, projectId, mime: type, data });
  const doc = await ChatMessage.create({
    _id: id, projectId, userId: user.id, body: '',
    voice: { mime: type, duration: Math.round(duration * 10) / 10, size: data.length, waveform },
  });
  await markRead(user, projectId, id);
  const [message] = await hydrateMessages([doc.toObject()]);
  const out = clientId ? { ...message, client_id: String(clientId).slice(0, 64) } : message;
  publish(projectId, 'chat:message', out);
  return out;
}

/** The audio of a voice message, for anyone who can read the project. */
export async function getVoiceClip(user, id) {
  const m = await findMessage(id);
  await requireChat(user, m.projectId);
  const clip = m.voice ? await VoiceClip.findById(id).lean() : null;
  if (!clip) throw new HttpError(404, 'This message has no recording');
  const data = Buffer.isBuffer(clip.data) ? clip.data : Buffer.from(clip.data.buffer ?? clip.data);
  return { data, mime: clip.mime };
}

async function findMessage(id) {
  const m = Number.isInteger(id) ? await ChatMessage.findById(id).lean() : null;
  if (!m) throw new HttpError(404, 'Message not found');
  return m;
}

/** Edit your own message. */
export async function editMessage(user, id, input) {
  const m = await findMessage(id);
  await requireChat(user, m.projectId);
  if (m.userId !== user.id) throw new HttpError(403, 'You can only edit your own messages');
  if (m.voice) throw new HttpError(400, 'Voice messages can’t be edited');
  const { body } = parse(input);
  const doc = await ChatMessage.findByIdAndUpdate(id, { body, editedAt: new Date() }, { returnDocument: 'after' }).lean();
  const [message] = await hydrateMessages([doc]);
  publish(m.projectId, 'chat:updated', message);
  return message;
}

/** Delete your own message, or anyone's as a manager. */
export async function deleteMessage(user, id) {
  const m = await findMessage(id);
  const role = await requireChat(user, m.projectId);
  if (m.userId !== user.id && !roleAllows(role, 'chat:moderate')) throw new HttpError(403, 'Only managers can delete other people’s messages');
  await Promise.all([ChatMessage.deleteOne({ _id: id }), VoiceClip.deleteOne({ _id: id })]);
  publish(m.projectId, 'chat:deleted', { id, project_id: m.projectId });
}

/**
 * Remove someone from the project chat (allowed = false) or add them back (true). Managers, the owner and admins.
 * They keep the project itself. The owner can't be removed, and only the owner (or an admin) can remove a manager.
 */
export async function setChatAccess(actor, projectId, userId, allowed) {
  const actorRole = await requireRole(actor, projectId, 'member:manage');
  const p = await Project.findById(projectId, { members: 1, chatBlocked: 1 }).lean();
  const target = p.members.find((m) => m.userId === userId);
  if (!target) throw new HttpError(404, 'User is not a member of this project');
  if (userId === actor.id) throw new HttpError(400, 'You can’t remove yourself from the chat');
  if (target.role === 'owner') throw new HttpError(400, 'The project owner can’t be removed from the chat');
  if (target.role === 'manager' && actorRole !== 'owner') throw new HttpError(403, 'Only the project owner or an admin can remove a manager from the chat');
  const blocked = (p.chatBlocked || []).includes(userId);
  if (blocked === !allowed) return; // nothing to change
  await Project.updateOne({ _id: projectId }, allowed ? { $pull: { chatBlocked: userId } } : { $addToSet: { chatBlocked: userId } });
  const u = await User.findById(userId, { name: 1 }).lean();
  await logActivity({ projectId, userId: actor.id, action: allowed ? 'member.chat_restored' : 'member.chat_removed', details: u?.name || '' });
  bus.emit('chat-access', { projectId, userId, allowed });
}
