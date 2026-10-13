import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { bus } from './bus.js';
import { Project, User } from './models.js';
import { JWT_SECRET, projectRole } from './middleware.js';
import { createMessage, isChatBlocked, markRead, requireRole, room } from './chat.js';

/**
 * Socket.IO server for project chat: live messages, "is typing…" and who has the project open.
 *
 * Client → server (each takes an acknowledgement callback where noted):
 *   project:join  (projectId, ack)          start receiving a project's chat (viewer+)
 *   project:leave (projectId)
 *   chat:send     ({ projectId, body, clientId }, ack)   ack({ message }) or ack({ error })
 *   chat:typing   ({ projectId })
 *   chat:read     ({ projectId, messageId }, ack)        ack({ unread })
 * Server → client:
 *   chat:message, chat:updated, chat:deleted, chat:typing, presence { projectId, userIds }, project:access-lost { projectId }
 */
export function attachSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: true }, serveClient: false });

  // Same JWT as the REST API, sent in the handshake: io({ auth: { token } }).
  io.use(async (socket, next) => {
    try {
      const { id } = jwt.verify(socket.handshake.auth?.token || '', JWT_SECRET);
      const user = await User.findById(id, { name: 1, role: 1 }).lean();
      if (!user) throw new Error('unknown user');
      socket.data.user = { id: user._id, name: user.name, role: user.role };
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  });

  /** Tell a project's room who is currently connected to it. */
  const presence = async (projectId) => {
    const sockets = await io.in(room(projectId)).fetchSockets();
    io.to(room(projectId)).emit('presence', { projectId, userIds: [...new Set(sockets.map((s) => s.data.user.id))] });
  };

  /** Run a handler and turn thrown errors into { error } for the acknowledgement. */
  const handle = (fn) => async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try { reply(await fn(payload)); } catch (err) {
      if (!err.status) console.error('Socket handler failed:', err);
      reply({ error: err.status ? err.message : 'Something went wrong', details: err.details });
    }
  };

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.data.projects = new Set();
    const inRoom = (projectId) => socket.rooms.has(room(projectId));

    socket.on('project:join', handle(async (projectId) => {
      const id = Number(projectId);
      const role = await requireRole(user, id);
      socket.data.projects.add(id);
      // Removed from this chat: keep watching the project (to be let back in live) but don't receive the chat.
      if (await isChatBlocked(user.id, id)) return { ok: true, role, chat: false };
      socket.join(room(id));
      presence(id);
      return { ok: true, role, chat: true };
    }));

    socket.on('project:leave', (projectId) => {
      const id = Number(projectId);
      if (!socket.data.projects.delete(id)) return;
      socket.leave(room(id));
      presence(id);
    });

    socket.on('chat:send', handle(async ({ projectId, body, clientId } = {}) => (
      { message: await createMessage(user, Number(projectId), { body }, clientId) }
    )));

    socket.on('chat:typing', ({ projectId } = {}) => {
      if (inRoom(projectId)) socket.to(room(projectId)).emit('chat:typing', { projectId, user: { id: user.id, name: user.name } });
    });

    socket.on('chat:read', handle(async ({ projectId, messageId } = {}) => {
      if (!inRoom(projectId)) throw Object.assign(new Error('Open the project first'), { status: 403 });
      return { unread: await markRead(user, Number(projectId), Number(messageId) || 0) };
    }));

    socket.on('disconnect', () => { for (const id of socket.data.projects) presence(id); });
  });

  // Messages created or changed (via REST or a socket) go to everyone with the project open.
  bus.on('chat', ({ projectId, event, payload }) => io.to(room(projectId)).emit(event, payload));

  // A manager removed someone from the chat, or let them back in: move their open tabs out of / into the room.
  bus.on('chat-access', async ({ projectId, userId, allowed }) => {
    try {
      const sockets = (await io.fetchSockets()).filter((s) => s.data.user.id === userId && s.data.projects?.has(projectId));
      for (const s of sockets) {
        if (allowed) s.join(room(projectId)); else s.leave(room(projectId));
        s.emit(allowed ? 'chat:restored' : 'chat:removed', { projectId });
      }
      presence(projectId);
    } catch (err) {
      console.error('Chat access change failed:', err.message);
    }
  });

  // Someone lost access (removed from the project, or it was deleted): take them out of the room.
  bus.on('change', async ({ projectId, action }) => {
    if (action !== 'member.removed' && action !== 'project.deleted') return;
    try {
      const sockets = await io.in(room(projectId)).fetchSockets();
      if (!sockets.length) return;
      const exists = await Project.exists({ _id: projectId });
      for (const s of sockets) {
        if (exists && (await projectRole(s.data.user, projectId))) continue;
        s.leave(room(projectId));
        s.data.projects?.delete(projectId);
        s.emit('project:access-lost', { projectId });
      }
      if (exists) presence(projectId);
    } catch (err) {
      console.error('Chat access check failed:', err.message);
    }
  });

  return io;
}
