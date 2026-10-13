import { io } from 'socket.io-client';
import { create } from 'zustand';
import { api } from './api';
import { useAuth } from './store';

/* ==========================================================================
   Project chat: one Socket.IO connection per signed-in session, plus the chat state of the open project.
   Messages, edits, deletions, "is typing…" and who is online arrive over the socket.
   ========================================================================== */

let socket = null;
const joined = new Set(); // projects whose room we should be in (rejoined after a reconnect)
const typingTimers = new Map();
let liveDuringLoad = null; // messages received while the history request is in flight
let loading = null; // { pid, promise } of the history request in flight

export function openSocket(token) {
  closeSocket();
  socket = io({ auth: { token } });
  const chat = () => useChat.getState();
  socket.on('connect', () => {
    chat().setConnected(true);
    for (const id of joined) socket.emit('project:join', id);
  });
  socket.on('disconnect', () => chat().setConnected(false));
  socket.on('chat:message', (m) => chat().receive(m));
  socket.on('chat:updated', (m) => chat().update(m));
  socket.on('chat:deleted', ({ id, project_id: pid }) => chat().remove(id, pid));
  socket.on('chat:typing', ({ projectId, user }) => chat().typingFrom(projectId, user));
  socket.on('presence', ({ projectId, userIds }) => chat().setOnline(projectId, userIds));
  socket.on('chat:seen', (e) => chat().seen(e));
  socket.on('chat:removed', ({ projectId }) => chat().accessChanged(projectId, false));
  socket.on('chat:restored', ({ projectId }) => chat().accessChanged(projectId, true));
  socket.on('project:access-lost', ({ projectId }) => { joined.delete(projectId); chat().clear(projectId); });
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
  useChat.getState().setConnected(false);
}

/** Join a project's room while its page is open (any tab), so the Chat tab can count unread messages. */
export function joinProject(id) {
  joined.add(id);
  if (socket?.connected) socket.emit('project:join', id);
}
export function leaveProject(id) {
  joined.delete(id);
  if (socket?.connected) socket.emit('project:leave', id);
}
export function sendTyping(projectId) {
  if (socket?.connected) socket.emit('chat:typing', { projectId });
}

const visible = () => document.visibilityState === 'visible';

export const useChat = create((set, get) => ({
  projectId: null,
  messages: null, // null until the history is loaded
  hasMore: false,
  lastReadId: 0, // read marker when the chat was opened: the "New" divider goes after it
  readUpTo: 0, // newest message we have told the server we've read
  unread: 0,
  online: [],
  typing: {}, // userId -> name
  viewing: false, // the Chat tab is on screen
  connected: false,
  reads: {}, // userId -> newest message id they have seen ("Seen by")
  blockedLive: null, // set when a manager removes you from / adds you back to this chat while it's open

  setConnected: (connected) => set({ connected }),

  /** Switch to a project (keeps state if it is already the open one). */
  open(projectId, unread = 0) {
    if (get().projectId === projectId) return;
    set({ projectId, messages: null, hasMore: false, lastReadId: 0, readUpTo: 0, unread, online: [], typing: {}, reads: {}, blockedLive: null });
  },
  clear(projectId) {
    if (get().projectId === projectId) set({ messages: [], hasMore: false, online: [], typing: {}, unread: 0 });
  },
  setViewing(viewing) {
    // Coming back to the tab: messages that arrived meanwhile get the "New" divider.
    set(viewing ? { viewing, lastReadId: get().readUpTo } : { viewing });
  },

  /** Load the latest page of history (concurrent calls share one request). */
  load() {
    const pid = get().projectId;
    if (loading?.pid === pid) return loading.promise;
    liveDuringLoad = [];
    const promise = api(`/projects/${pid}/messages`, { params: { limit: 50 } }).then((r) => {
      if (get().projectId !== pid) return;
      // Messages that arrived over the socket while the history was loading may not be in it yet.
      const newest = r.data.at(-1)?.id ?? 0;
      const late = (liveDuringLoad || []).filter((m) => m.project_id === pid && m.id > newest);
      set({ messages: [...r.data, ...late], hasMore: r.has_more, lastReadId: r.last_read_id, readUpTo: r.last_read_id, reads: r.reads || {} });
    }).finally(() => { if (loading?.promise === promise) { loading = null; liveDuringLoad = null; } });
    loading = { pid, promise };
    return promise;
  },
  async loadOlder() {
    const { projectId: pid, messages } = get();
    const first = messages?.find((m) => !m.pending);
    if (!first) return;
    const r = await api(`/projects/${pid}/messages`, { params: { limit: 50, before: first.id } });
    if (get().projectId === pid) set({ messages: [...r.data, ...get().messages], hasMore: r.has_more });
  },

  /** A message from the server (live event or send acknowledgement). Safe to call twice for the same message. */
  receive(m) {
    const s = get();
    if (m.project_id !== s.projectId) return;
    const typing = { ...s.typing };
    if (m.user) { delete typing[m.user.id]; clearTimeout(typingTimers.get(m.user.id)); }
    const mine = m.user?.id === useAuth.getState().user?.id;
    const list = s.messages;
    if (list === null) liveDuringLoad?.push(m);
    if (list?.some((x) => x.id === m.id)) { set({ typing }); return; }
    const pendingIndex = m.client_id && list ? list.findIndex((x) => x.client_id === m.client_id) : -1;
    // Keep playing your own voice message from the local recording instead of downloading it again.
    const localUrl = pendingIndex >= 0 ? list[pendingIndex].voice?.localUrl : null;
    const incoming = localUrl && m.voice ? { ...m, voice: { ...m.voice, localUrl } } : m;
    const messages = list === null ? null : pendingIndex >= 0 ? list.map((x, i) => (i === pendingIndex ? incoming : x)) : [...list, m];
    const seen = mine || (s.viewing && visible());
    set({ messages, typing, unread: seen ? s.unread : s.unread + 1 });
    if (s.viewing && visible()) get().markRead();
  },
  update(m) {
    if (m.project_id === get().projectId && get().messages) set({ messages: get().messages.map((x) => (x.id === m.id ? { ...x, ...m } : x)) });
  },
  remove(id, projectId) {
    if (projectId === get().projectId && get().messages) set({ messages: get().messages.filter((x) => x.id !== id) });
  },
  typingFrom(projectId, user) {
    if (projectId !== get().projectId) return;
    set({ typing: { ...get().typing, [user.id]: user.name } });
    clearTimeout(typingTimers.get(user.id));
    typingTimers.set(user.id, setTimeout(() => {
      const { [user.id]: _gone, ...rest } = get().typing;
      set({ typing: rest });
    }, 4000));
  },
  seen({ projectId, userId, last_read_id: id }) {
    if (projectId !== get().projectId) return;
    const reads = get().reads;
    if ((reads[userId] || 0) < id) set({ reads: { ...reads, [userId]: id } });
  },
  /** A manager removed you from this chat (allowed = false) or let you back in. */
  accessChanged(projectId, allowed) {
    if (projectId !== get().projectId) return;
    set({ blockedLive: !allowed, messages: null, hasMore: false, typing: {}, online: allowed ? get().online : [], unread: 0 });
    if (allowed && get().viewing) get().load().catch(() => {});
  },
  setOnline(projectId, userIds) {
    if (Number(projectId) === get().projectId) set({ online: userIds });
  },

  /** Tell the server everything shown has been read. */
  async markRead() {
    const { projectId, messages, readUpTo } = get();
    const last = [...(messages || [])].reverse().find((m) => !m.pending);
    set({ unread: 0 });
    if (!last || last.id <= readUpTo) return;
    set({ readUpTo: last.id });
    try {
      if (socket?.connected) socket.emit('chat:read', { projectId, messageId: last.id });
      else await api(`/projects/${projectId}/messages/read`, { method: 'POST', body: { messageId: last.id } });
    } catch { /* the badge simply comes back on the next visit */ }
  },

  /** Show the message right away, then deliver it (socket when connected, REST otherwise). */
  send(body, extra = {}) {
    const me = useAuth.getState().user;
    const clientId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const pending = {
      id: clientId, client_id: clientId, project_id: get().projectId, user: { id: me.id, name: me.name },
      body, voice: null, created_at: new Date().toISOString(), edited_at: null, pending: true, ...extra,
    };
    set({ messages: [...(get().messages || []), pending] });
    return get().deliver(pending);
  },
  /** A recorded voice message: { blob, url, duration, waveform } from the recorder. */
  sendVoice({ blob, url, duration, waveform }) {
    return get().send('', { voice: { duration, waveform, localUrl: url }, blob });
  },
  async deliver(p) {
    const patch = (changes) => set({ messages: get().messages?.map((x) => (x.client_id === p.client_id && x.pending ? { ...x, ...changes } : x)) });
    patch({ failed: null });
    try {
      const payload = { projectId: p.project_id, body: p.body, clientId: p.client_id };
      const res = p.blob
        ? { message: await api(`/projects/${p.project_id}/messages/voice`, {
          method: 'POST', file: p.blob,
          params: { duration: p.voice.duration.toFixed(1), waveform: p.voice.waveform.join(','), clientId: p.client_id },
        }) }
        : socket?.connected
        ? await socket.timeout(10000).emitWithAck('chat:send', payload)
        : { message: await api(`/projects/${p.project_id}/messages`, { method: 'POST', body: { body: p.body, clientId: p.client_id } }) };
      if (res.error) throw new Error(res.error);
      get().receive(res.message);
    } catch (e) {
      patch({ failed: e.message && !/timed? ?out/i.test(e.message) ? e.message : 'Not sent' });
    }
  },
  discard(clientId) {
    set({ messages: get().messages.filter((x) => x.client_id !== clientId || !x.pending) });
  },
}));
