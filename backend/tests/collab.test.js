import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, stopDb } from './setup.js';

const { app } = await import('../src/app.js');
const api = request(app);
let owner, dev, viewer, outsider, projectId, taskId, server, base;

const reg = async (name, email) => (await api.post('/api/auth/register').send({ name, email, password: 'secret123' })).body;
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const unread = async (u) => (await api.get('/api/notifications').set(as(u))).body;

before(async () => {
  await startDb();
  owner = await reg('Olivia Owner', 'owner@c.dev');
  dev = await reg('Dev Member', 'dev@c.dev');
  viewer = await reg('Vic Viewer', 'viewer@c.dev');
  outsider = await reg('Out Sider', 'out@c.dev');
  projectId = (await api.post('/api/projects').set(as(owner)).send({ name: 'Collab' })).body.id;
  await api.post(`/api/projects/${projectId}/members`).set(as(owner)).send({ userId: dev.user.id, role: 'member' });
  await api.post(`/api/projects/${projectId}/members`).set(as(owner)).send({ userId: viewer.user.id, role: 'viewer' });
  taskId = (await api.post(`/api/projects/${projectId}/tasks`).set(as(owner)).send({ title: 'Launch page' })).body.id;
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(async () => { server.close(); await stopDb(); });

/* ---------------- Labels ---------------- */
test('labels: members create, duplicates are refused, viewers cannot, only managers delete', async () => {
  const bug = await api.post(`/api/projects/${projectId}/labels`).set(as(dev)).send({ name: 'Bug', color: 'red' });
  assert.equal(bug.status, 201);
  assert.deepEqual(Object.keys(bug.body).sort(), ['color', 'id', 'name']);
  assert.equal((await api.post(`/api/projects/${projectId}/labels`).set(as(dev)).send({ name: 'bug' })).status, 409);
  assert.equal((await api.post(`/api/projects/${projectId}/labels`).set(as(viewer)).send({ name: 'Docs' })).status, 403);
  assert.equal((await api.post(`/api/projects/${projectId}/labels`).set(as(dev)).send({ name: 'X', color: 'neon' })).status, 400);
  const renamed = await api.patch(`/api/projects/${projectId}/labels/${bug.body.id}`).set(as(dev)).send({ name: 'Defect', color: 'orange' });
  assert.deepEqual([renamed.body.name, renamed.body.color], ['Defect', 'orange']);
  const p = (await api.get(`/api/projects/${projectId}`).set(as(viewer))).body;
  assert.deepEqual(p.labels.map((l) => l.name), ['Defect']);
  assert.equal((await api.delete(`/api/projects/${projectId}/labels/${bug.body.id}`).set(as(dev))).status, 403);
});

test('labels on tasks: assign, history, filter, unknown ids refused, deleting a label removes it from tasks', async () => {
  const design = (await api.post(`/api/projects/${projectId}/labels`).set(as(owner)).send({ name: 'Design', color: 'purple' })).body;
  const defect = (await api.get(`/api/projects/${projectId}/labels`).set(as(owner))).body.data.find((l) => l.name === 'Defect');
  const t = await api.patch(`/api/tasks/${taskId}`).set(as(dev)).send({ labelIds: [design.id, defect.id] });
  assert.deepEqual(t.body.labels.map((l) => l.name), ['Defect', 'Design'], 'labels follow the project order');
  assert.equal((await api.patch(`/api/tasks/${taskId}`).set(as(dev)).send({ labelIds: [999] })).status, 400);
  const other = await api.post(`/api/projects/${projectId}/tasks`).set(as(dev)).send({ title: 'Unlabelled' });
  assert.deepEqual(other.body.labels, []);
  const filtered = (await api.get(`/api/projects/${projectId}/tasks?labelId=${design.id}`).set(as(viewer))).body.data;
  assert.deepEqual(filtered.map((x) => x.title), ['Launch page']);
  const hist = (await api.get(`/api/tasks/${taskId}/activity`).set(as(viewer))).body.data.map((a) => a.details);
  assert.ok(hist.includes('labels: none → Defect, Design'));
  const counts = (await api.get(`/api/projects/${projectId}/labels`).set(as(viewer))).body.data;
  assert.equal(counts.find((l) => l.id === design.id).task_count, 1);
  await api.delete(`/api/projects/${projectId}/labels/${design.id}`).set(as(owner)).expect(204);
  assert.deepEqual((await api.get(`/api/tasks/${taskId}`).set(as(dev))).body.labels.map((l) => l.name), ['Defect']);
});

/* ---------------- Checklist ---------------- */
test('checklist: add, tick, edit, remove; counts and history; viewers are refused', async () => {
  let t = (await api.post(`/api/tasks/${taskId}/checklist`).set(as(dev)).send({ text: 'Write copy' }).expect(201)).body;
  t = (await api.post(`/api/tasks/${taskId}/checklist`).set(as(dev)).send({ text: 'Add images' }).expect(201)).body;
  assert.equal(t.checklist_total, 2);
  const [first, second] = t.checklist;
  t = (await api.patch(`/api/tasks/${taskId}/checklist/${first.id}`).set(as(dev)).send({ done: true })).body;
  assert.equal(t.checklist_done, 1);
  t = (await api.patch(`/api/tasks/${taskId}/checklist/${second.id}`).set(as(dev)).send({ text: 'Add hero images' })).body;
  assert.equal(t.checklist[1].text, 'Add hero images');
  assert.equal((await api.post(`/api/tasks/${taskId}/checklist`).set(as(viewer)).send({ text: 'x' })).status, 403);
  assert.equal((await api.post(`/api/tasks/${taskId}/checklist`).set(as(dev)).send({ text: '   ' })).status, 400);
  assert.equal((await api.patch(`/api/tasks/${taskId}/checklist/987654`).set(as(dev)).send({ done: true })).status, 404);
  assert.equal((await api.patch(`/api/tasks/${taskId}/checklist/${first.id}`).set(as(dev)).send({})).status, 400);
  t = (await api.delete(`/api/tasks/${taskId}/checklist/${second.id}`).set(as(dev))).body;
  assert.deepEqual([t.checklist_done, t.checklist_total], [1, 1]);
  const actions = (await api.get(`/api/tasks/${taskId}/activity`).set(as(dev))).body.data.map((a) => `${a.action} ${a.details}`);
  for (const a of ['checklist.added Write copy', 'checklist.completed Write copy', 'checklist.removed Add hero images']) assert.ok(actions.includes(a), a);
  const list = (await api.get(`/api/projects/${projectId}/tasks`).set(as(viewer))).body.data.find((x) => x.id === taskId);
  assert.deepEqual([list.checklist_done, list.checklist_total], [1, 1]);
});

/* ---------------- Notifications ---------------- */
test('notifications: added to project, assigned (never for yourself), comments, mentions', async () => {
  // dev and viewer were added to the project by owner in before()
  const devN = await unread(dev);
  assert.ok(devN.data.some((n) => n.type === 'added' && n.project.name === 'Collab' && n.actor.name === 'Olivia Owner'));
  const before = devN.unread_count;

  await api.patch(`/api/tasks/${taskId}`).set(as(owner)).send({ assigneeId: dev.user.id });
  let n = await unread(dev);
  assert.equal(n.unread_count, before + 1);
  assert.deepEqual([n.data[0].type, n.data[0].task.title], ['assigned', 'Launch page']);

  await api.post(`/api/projects/${projectId}/tasks`).set(as(dev)).send({ title: 'Mine', assigneeId: dev.user.id });
  assert.equal((await unread(dev)).unread_count, before + 1, 'assigning yourself does not notify you');

  // Comment by the assignee: the creator (owner) gets "comment"; @Vic Viewer gets "mention"; the author gets nothing.
  const ownerBefore = (await unread(owner)).unread_count;
  await api.post(`/api/tasks/${taskId}/comments`).set(as(dev)).send({ body: 'Ready for a look, @Vic Viewer?' }).expect(201);
  const ownerN = await unread(owner);
  assert.equal(ownerN.unread_count, ownerBefore + 1);
  assert.equal(ownerN.data[0].type, 'comment');
  assert.equal((await unread(viewer)).data[0].type, 'mention');
  assert.equal((await unread(dev)).unread_count, before + 1);
  assert.equal((await unread(outsider)).pagination.total, 0);
});

test('notifications: mark one read, mark all read, others cannot touch them', async () => {
  const n = await unread(dev);
  const first = n.data.find((x) => !x.read);
  const r = await api.patch(`/api/notifications/${first.id}`).set(as(dev)).send({ read: true });
  assert.equal(r.body.read, true);
  assert.equal(r.body.unread_count, n.unread_count - 1);
  assert.equal((await api.patch(`/api/notifications/${first.id}`).set(as(owner)).send({ read: true })).status, 404);
  assert.equal((await api.get('/api/notifications?unread=true').set(as(dev))).body.data.every((x) => !x.read), true);
  assert.deepEqual((await api.post('/api/notifications/read-all').set(as(dev))).body, { unread_count: 0 });
  assert.equal((await unread(dev)).unread_count, 0);
  assert.equal((await api.get('/api/notifications')).status, 401);
});

test('notifications are pushed live only to their recipient', { timeout: 8000 }, async () => {
  const listen = async (token, ms) => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/events?token=${token}`, { signal: ctrl.signal });
    const reader = res.body.getReader();
    let text = '';
    const read = (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); } } catch { /* aborted */ } })();
    return async () => { await Promise.race([read, new Promise((r) => setTimeout(r, ms))]); ctrl.abort(); return text; };
  };
  const devDone = await listen(dev.token, 1500);
  const ownerDone = await listen(owner.token, 1500);
  await new Promise((r) => setTimeout(r, 100));
  await api.post(`/api/projects/${projectId}/tasks`).set(as(owner)).send({ title: 'Ping', assigneeId: dev.user.id });
  assert.match(await devDone(), /"kind":"notification"/);
  assert.doesNotMatch(await ownerDone(), /"kind":"notification"/);
});

test('deleting a project removes its notifications; a deleted task stays readable in notifications', async () => {
  const p2 = (await api.post('/api/projects').set(as(owner)).send({ name: 'Temp' })).body.id;
  await api.post(`/api/projects/${p2}/members`).set(as(owner)).send({ userId: dev.user.id, role: 'member' });
  const t = (await api.post(`/api/projects/${p2}/tasks`).set(as(owner)).send({ title: 'Soon gone', assigneeId: dev.user.id })).body;
  await api.delete(`/api/tasks/${t.id}`).set(as(owner)).expect(204);
  const gone = (await unread(dev)).data.find((n) => n.text === 'Soon gone');
  assert.equal(gone.task, null, 'task link cleared');
  await api.delete(`/api/projects/${p2}`).set(as(owner)).expect(204);
  assert.equal((await unread(dev)).data.some((n) => n.project?.id === p2 || n.text === 'Temp'), false);
});
