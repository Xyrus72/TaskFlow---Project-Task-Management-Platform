import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import request from 'supertest';
import { io as connectClient } from 'socket.io-client';
import { startDb, stopDb } from './setup.js';

const { app } = await import('../src/app.js');
const { attachSocket } = await import('../src/socket.js');
const { ChatMessage } = await import('../src/models.js');
const api = request(app);
let owner, dev, viewer, outsider, projectId, server, url;
const sockets = [];

const reg = async (name, email) => (await api.post('/api/auth/register').send({ name, email, password: 'secret123' })).body;
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const post = (u, body, pid = projectId) => api.post(`/api/projects/${pid}/messages`).set(as(u)).send({ body });

/** Connect a Socket.IO client as a user (or without a token). */
const connect = (u) => new Promise((resolve, reject) => {
  const s = connectClient(url, { auth: { token: u?.token }, transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(s);
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const call = (s, event, data) => new Promise((resolve) => s.emit(event, data, resolve));
const next = (s, event, ms = 2000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`no ${event} received`)), ms);
  s.once(event, (d) => { clearTimeout(t); resolve(d); });
});
/** Wait for the first `event` whose payload passes `pred`. */
const until = (s, event, pred, ms = 2000) => new Promise((resolve, reject) => {
  const h = (d) => { if (pred(d)) { clearTimeout(t); s.off(event, h); resolve(d); } };
  const t = setTimeout(() => { s.off(event, h); reject(new Error(`no matching ${event}`)); }, ms);
  s.on(event, h);
});
const nothing = (s, event, ms = 400) => new Promise((resolve, reject) => {
  const h = (d) => reject(new Error(`unexpected ${event}: ${JSON.stringify(d)}`));
  s.once(event, h);
  setTimeout(() => { s.off(event, h); resolve(); }, ms);
});

before(async () => {
  await startDb();
  owner = await reg('Olivia Owner', 'owner@chat.dev');
  dev = await reg('Dev Member', 'dev@chat.dev');
  viewer = await reg('Vic Viewer', 'viewer@chat.dev');
  outsider = await reg('Out Sider', 'out@chat.dev');
  projectId = (await api.post('/api/projects').set(as(owner)).send({ name: 'Chatty' })).body.id;
  await api.post(`/api/projects/${projectId}/members`).set(as(owner)).send({ userId: dev.user.id, role: 'member' });
  await api.post(`/api/projects/${projectId}/members`).set(as(owner)).send({ userId: viewer.user.id, role: 'viewer' });
  server = createServer(app);
  attachSocket(server);
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});
after(async () => {
  for (const s of sockets) s.disconnect();
  await new Promise((r) => server.close(r));
  await stopDb();
});

test('chat over REST: members post, viewers only read, outsiders are refused, input is validated', async () => {
  const res = await post(dev, '  Hello team  ');
  assert.equal(res.status, 201);
  assert.equal(res.body.body, 'Hello team');
  assert.deepEqual(res.body.user, { id: dev.user.id, name: 'Dev Member' });
  assert.equal(res.body.edited_at, null);

  const v = await post(viewer, 'Can I talk?');
  assert.equal(v.status, 403);
  assert.match(v.body.error, /Viewers can read/);
  const read = await api.get(`/api/projects/${projectId}/messages`).set(as(viewer));
  assert.equal(read.status, 200);
  assert.equal(read.body.data.at(-1).body, 'Hello team');

  assert.equal((await api.get(`/api/projects/${projectId}/messages`).set(as(outsider))).status, 403);
  assert.equal((await post(outsider, 'hi')).status, 403);
  assert.equal((await post(dev, 'hi', 9999)).status, 404);
  const empty = await post(dev, '   ');
  assert.equal(empty.status, 400);
  assert.ok(empty.body.details.body);
  assert.equal((await post(dev, 'x'.repeat(2001))).status, 400);
  assert.equal((await api.get(`/api/projects/${projectId}/messages`)).status, 401);
});

test('history comes back oldest first and pages backwards with a "before" cursor', async () => {
  for (let i = 1; i <= 5; i++) await post(owner, `Message ${i}`);
  const first = (await api.get(`/api/projects/${projectId}/messages?limit=3`).set(as(dev))).body;
  assert.deepEqual(first.data.map((m) => m.body), ['Message 3', 'Message 4', 'Message 5']);
  assert.equal(first.has_more, true);
  const older = (await api.get(`/api/projects/${projectId}/messages?limit=3&before=${first.data[0].id}`).set(as(dev))).body;
  assert.deepEqual(older.data.map((m) => m.body), ['Hello team', 'Message 1', 'Message 2']);
  assert.equal(older.has_more, false);
  assert.equal((await api.get(`/api/projects/${projectId}/messages?limit=500`).set(as(dev))).status, 400);
});

test('edit and delete: your own messages; managers can delete anyone’s', async () => {
  const a = (await post(dev, 'Typo hree')).body;
  const b = (await post(dev, 'Off-topic')).body;
  const edited = await api.patch(`/api/messages/${a.id}`).set(as(dev)).send({ body: 'Typo here' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.body, 'Typo here');
  assert.ok(edited.body.edited_at);
  assert.equal((await api.patch(`/api/messages/${a.id}`).set(as(owner)).send({ body: 'Not mine' })).status, 403);
  assert.equal((await api.patch(`/api/messages/${a.id}`).set(as(dev)).send({ body: '' })).status, 400);
  assert.equal((await api.delete(`/api/messages/${a.id}`).set(as(viewer))).status, 403);
  assert.equal((await api.delete(`/api/messages/${a.id}`).set(as(outsider))).status, 403);
  assert.equal((await api.delete(`/api/messages/${a.id}`).set(as(dev))).status, 204);
  assert.equal((await api.delete(`/api/messages/${b.id}`).set(as(owner))).status, 204);
  assert.equal((await api.patch(`/api/messages/${a.id}`).set(as(dev)).send({ body: 'gone' })).status, 404);
});

test('unread counts: only other people’s messages, read markers only move forward', async () => {
  const latest = (await api.get(`/api/projects/${projectId}/messages?limit=1`).set(as(owner))).body.data[0].id;
  const r0 = await api.post(`/api/projects/${projectId}/messages/read`).set(as(owner)).send({ messageId: latest });
  assert.deepEqual(r0.body, { unread: 0 });
  const m1 = (await post(dev, 'One')).body;
  await post(dev, 'Two');
  assert.equal((await api.get(`/api/projects/${projectId}`).set(as(owner))).body.chat_unread, 2);
  assert.equal((await api.get(`/api/projects/${projectId}`).set(as(dev))).body.chat_unread, 0);
  const r1 = await api.post(`/api/projects/${projectId}/messages/read`).set(as(owner)).send({ messageId: m1.id });
  assert.equal(r1.body.unread, 1);
  const back = await api.post(`/api/projects/${projectId}/messages/read`).set(as(owner)).send({ messageId: 0 });
  assert.equal(back.body.unread, 1);
  const page = (await api.get(`/api/projects/${projectId}/messages`).set(as(owner))).body;
  assert.equal(page.last_read_id, m1.id);
});

test('Socket.IO: sign-in required, outsiders cannot join, messages and typing reach the room live', { timeout: 10000 }, async () => {
  await assert.rejects(connect(null), /Authentication required/);
  await assert.rejects(connect({ token: 'not-a-token' }), /Authentication required/);

  const out = await connect(outsider);
  assert.match((await call(out, 'project:join', projectId)).error, /don't have access/);

  const o = await connect(owner);
  const d = await connect(dev);
  const v = await connect(viewer);
  assert.deepEqual(await call(o, 'project:join', projectId), { ok: true, role: 'owner', chat: true });
  assert.equal((await call(d, 'project:join', projectId)).role, 'member');
  const everyone = until(o, 'presence', (p) => p.userIds.length === 3);
  await call(v, 'project:join', projectId);
  assert.deepEqual((await everyone).userIds.sort(), [owner.user.id, dev.user.id, viewer.user.id].sort());
  const left = until(o, 'presence', (p) => p.userIds.length === 2);
  v.emit('project:leave', projectId);
  assert.ok(!(await left).userIds.includes(viewer.user.id));
  await call(v, 'project:join', projectId);

  // A message sent over the socket reaches everyone in the room (sender included, with its clientId), never outsiders.
  const toOwner = next(o, 'chat:message');
  const toDev = next(d, 'chat:message');
  const quiet = nothing(out, 'chat:message');
  const ack = await call(d, 'chat:send', { projectId, body: 'Live hello', clientId: 'tmp-1' });
  assert.equal(ack.message.body, 'Live hello');
  assert.equal((await toOwner).id, ack.message.id);
  assert.equal((await toDev).client_id, 'tmp-1');
  await quiet;

  assert.match((await call(v, 'chat:send', { projectId, body: 'Me too' })).error, /Viewers can read/);
  assert.ok((await call(d, 'chat:send', { projectId, body: '' })).details.body);

  // Typing goes to the others, not back to the typist.
  const typing = next(o, 'chat:typing');
  const notBack = nothing(d, 'chat:typing');
  d.emit('chat:typing', { projectId });
  assert.deepEqual((await typing).user, { id: dev.user.id, name: 'Dev Member' });
  await notBack;

  // REST and sockets share one pipeline: a REST post is pushed live too; edits and deletes as well.
  const viaRest = next(d, 'chat:message');
  const created = (await post(owner, 'Posted over REST')).body;
  assert.equal((await viaRest).id, created.id);
  const updated = next(d, 'chat:updated');
  await api.patch(`/api/messages/${created.id}`).set(as(owner)).send({ body: 'Edited over REST' });
  assert.equal((await updated).body, 'Edited over REST');
  const deleted = next(d, 'chat:deleted');
  await api.delete(`/api/messages/${created.id}`).set(as(owner));
  assert.equal((await deleted).id, created.id);

  assert.equal((await call(d, 'chat:read', { projectId, messageId: ack.message.id })).unread, 0);
  assert.match((await call(out, 'chat:read', { projectId, messageId: 1 })).error, /Open the project/);
  for (const s of [o, d, v, out]) s.disconnect();
});

test('chat @mentions notify; removed members leave the room; deleting the project removes the chat', { timeout: 10000 }, async () => {
  await post(dev, '@Olivia Owner can you check the copy? @Out Sider too');
  const notes = (await api.get('/api/notifications').set(as(owner))).body.data;
  const chat = notes.find((n) => n.type === 'chat');
  assert.ok(chat);
  assert.equal(chat.actor.name, 'Dev Member');
  assert.equal(chat.task, null);
  assert.match(chat.text, /can you check the copy/);
  assert.equal((await api.get('/api/notifications').set(as(outsider))).body.data.filter((n) => n.type === 'chat').length, 0);

  const v = await connect(viewer);
  const o = await connect(owner);
  await call(v, 'project:join', projectId);
  await call(o, 'project:join', projectId);
  const lost = next(v, 'project:access-lost');
  await api.delete(`/api/projects/${projectId}/members/${viewer.user.id}`).set(as(owner));
  assert.equal((await lost).projectId, projectId);
  const quiet = nothing(v, 'chat:message');
  await post(owner, 'Viewer is gone');
  await quiet;

  assert.ok(await ChatMessage.countDocuments({ projectId }));
  assert.equal((await api.delete(`/api/projects/${projectId}`).set(as(owner))).status, 204);
  assert.equal(await ChatMessage.countDocuments({ projectId }), 0);
  assert.equal((await api.get(`/api/projects/${projectId}/messages`).set(as(owner))).status, 404);
  v.disconnect();
  o.disconnect();
});

test('voice messages: upload, play back, permissions, limits, delete', async () => {
  const pid = (await api.post('/api/projects').set(as(owner)).send({ name: 'Voices' })).body.id;
  await api.post(`/api/projects/${pid}/members`).set(as(owner)).send({ userId: dev.user.id, role: 'member' });
  await api.post(`/api/projects/${pid}/members`).set(as(owner)).send({ userId: viewer.user.id, role: 'viewer' });
  const audio = Buffer.from('OggS fake opus bytes for the test');
  const upload = (u, { type = 'audio/webm;codecs=opus', duration = 3.24, body = audio, project = pid } = {}) => api
    .post(`/api/projects/${project}/messages/voice?duration=${duration}&waveform=10,50,120,-5,abc&clientId=v1`)
    .set(as(u)).set('Content-Type', type).send(body);

  const res = await upload(dev);
  assert.equal(res.status, 201);
  assert.equal(res.body.body, '');
  assert.equal(res.body.client_id, 'v1');
  assert.deepEqual(res.body.voice, { duration: 3.2, waveform: [10, 50, 100, 0, 0], mime: 'audio/webm', size: audio.length, url: `/api/messages/${res.body.id}/audio` });
  const history = (await api.get(`/api/projects/${pid}/messages`).set(as(viewer))).body.data;
  assert.equal(history.at(-1).voice.duration, 3.2);

  const play = await api.get(`/api/messages/${res.body.id}/audio`).set(as(viewer)).buffer(true).parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
  assert.equal(play.status, 200);
  assert.equal(play.headers['content-type'], 'audio/webm');
  assert.ok(play.body.equals(audio));
  assert.equal((await api.get(`/api/messages/${res.body.id}/audio`).set(as(outsider))).status, 403);
  const text = (await post(dev, 'not a voice note', pid)).body;
  assert.equal((await api.get(`/api/messages/${text.id}/audio`).set(as(dev))).status, 404);

  assert.equal((await upload(viewer)).status, 403);
  assert.equal((await upload(outsider)).status, 403);
  assert.equal((await upload(dev, { type: 'text/plain' })).status, 400);
  assert.equal((await upload(dev, { duration: 300 })).status, 400);
  assert.equal((await upload(dev, { duration: 0.1 })).status, 400);
  assert.equal((await upload(dev, { body: Buffer.alloc(3 * 1024 * 1024 + 10) })).status, 413);
  assert.equal((await api.patch(`/api/messages/${res.body.id}`).set(as(dev)).send({ body: 'edit?' })).status, 400);

  assert.equal((await api.delete(`/api/messages/${res.body.id}`).set(as(dev))).status, 204);
  assert.equal((await api.get(`/api/messages/${res.body.id}/audio`).set(as(dev))).status, 404);
  const again = (await upload(dev)).body;
  await api.delete(`/api/projects/${pid}`).set(as(owner));
  const { VoiceClip } = await import('../src/models.js');
  assert.equal(await VoiceClip.countDocuments({ _id: again.id }), 0);
});

test('seen by: read markers come with the history and are pushed live', { timeout: 10000 }, async () => {
  const pid = (await api.post('/api/projects').set(as(owner)).send({ name: 'Receipts' })).body.id;
  await api.post(`/api/projects/${pid}/members`).set(as(owner)).send({ userId: dev.user.id, role: 'member' });
  const msg = (await post(dev, 'Did everyone see this?', pid)).body;
  let reads = (await api.get(`/api/projects/${pid}/messages`).set(as(owner))).body.reads;
  assert.equal(reads[dev.user.id], msg.id); // writing a message means you've seen it
  assert.equal(reads[owner.user.id], undefined);

  const d = await connect(dev);
  await call(d, 'project:join', pid);
  const seen = until(d, 'chat:seen', (e) => e.userId === owner.user.id);
  await api.post(`/api/projects/${pid}/messages/read`).set(as(owner)).send({ messageId: msg.id });
  assert.deepEqual(await seen, { projectId: pid, userId: owner.user.id, last_read_id: msg.id });
  reads = (await api.get(`/api/projects/${pid}/messages`).set(as(dev))).body.reads;
  assert.equal(reads[owner.user.id], msg.id);
  // Reading the same message again changes nothing, so nothing is broadcast.
  const quiet = nothing(d, 'chat:seen');
  await api.post(`/api/projects/${pid}/messages/read`).set(as(owner)).send({ messageId: msg.id });
  await quiet;
  d.disconnect();
});

test('managers remove people from the chat (they keep the project) and add them back; rules and live updates', { timeout: 10000 }, async () => {
  const mia = await reg('Mia Manager', 'mia@chat.dev');
  const pid = (await api.post('/api/projects').set(as(owner)).send({ name: 'Moderated' })).body.id;
  for (const [u, role] of [[dev, 'member'], [viewer, 'viewer'], [mia, 'manager']]) {
    await api.post(`/api/projects/${pid}/members`).set(as(owner)).send({ userId: u.user.id, role });
  }
  const remove = (actor, u) => api.post(`/api/projects/${pid}/chat/removed`).set(as(actor)).send({ userId: u.user.id });
  const restore = (actor, u) => api.delete(`/api/projects/${pid}/chat/removed/${u.user.id}`).set(as(actor));

  assert.equal((await remove(dev, viewer)).status, 403); // members can't
  assert.equal((await remove(mia, owner)).status, 400); // never the owner
  assert.equal((await remove(mia, mia)).status, 400); // not yourself
  assert.equal((await remove(owner, outsider)).status, 404); // not a member
  const otherManager = await reg('Max Manager', 'max@chat.dev');
  await api.post(`/api/projects/${pid}/members`).set(as(owner)).send({ userId: otherManager.user.id, role: 'manager' });
  assert.equal((await remove(mia, otherManager)).status, 403); // a manager can't remove another manager…
  assert.equal((await remove(owner, otherManager)).status, 204); // …the owner can

  // Dev is in the chat, then a manager removes them: their open tab is told live and stops receiving messages.
  const d = await connect(dev);
  assert.equal((await call(d, 'project:join', pid)).chat, true);
  const removed = next(d, 'chat:removed');
  assert.equal((await remove(mia, dev)).status, 204);
  assert.deepEqual(await removed, { projectId: pid });
  const quiet = nothing(d, 'chat:message');
  await post(owner, '@Dev Member are you there?', pid);
  await quiet;
  assert.equal((await api.get(`/api/projects/${pid}/messages`).set(as(dev))).status, 403);
  assert.equal((await post(dev, 'let me in', pid)).status, 403);
  assert.match((await call(d, 'chat:send', { projectId: pid, body: 'hi' })).error, /removed from this project’s chat/);
  const project = (await api.get(`/api/projects/${pid}`).set(as(dev))).body;
  assert.ok(project.chat_blocked.includes(dev.user.id));
  assert.equal(project.chat_unread, 0);
  assert.equal(project.my_role, 'member'); // still in the project
  assert.equal((await api.post(`/api/projects/${pid}/tasks`).set(as(dev)).send({ title: 'Still can work' })).status, 201);
  const notes = (await api.get('/api/notifications').set(as(dev))).body.data;
  assert.ok(!notes.some((n) => n.type === 'chat' && n.project?.id === pid)); // removed people aren't pinged by mentions
  const history = (await api.get(`/api/projects/${pid}/activity`).set(as(owner))).body.data.map((a) => `${a.action} ${a.details}`);
  assert.ok(history.includes('member.chat_removed Dev Member'));

  // Added back: live, and the chat works again.
  const back = next(d, 'chat:restored');
  assert.equal((await restore(mia, dev)).status, 204);
  await back;
  const again = next(d, 'chat:message');
  await post(owner, 'Welcome back', pid);
  assert.equal((await again).body, 'Welcome back');
  assert.equal((await api.get(`/api/projects/${pid}/messages`).set(as(dev))).status, 200);

  // Removing someone from the project also clears their chat block.
  await remove(mia, viewer);
  await api.delete(`/api/projects/${pid}/members/${viewer.user.id}`).set(as(mia));
  await api.post(`/api/projects/${pid}/members`).set(as(owner)).send({ userId: viewer.user.id, role: 'viewer' });
  assert.equal((await api.get(`/api/projects/${pid}/messages`).set(as(viewer))).status, 200);
  d.disconnect();
});
