import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, stopDb } from './setup.js';

const { app } = await import('../src/app.js');
const api = request(app);
let admin, owner, dev, viewer, outsider, projectId, taskId, server, base;

const reg = async (name, email) => (await api.post('/api/auth/register').send({ name, email, password: 'secret123' })).body;
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

before(async () => {
  await startDb();
  admin = await reg('Admin', 'admin@t.dev');
  owner = await reg('Olivia Owner', 'owner@t.dev');
  dev = await reg('Dev Member', 'dev@t.dev');
  viewer = await reg('Vic Viewer', 'viewer@t.dev');
  outsider = await reg('Out Sider', 'out@t.dev');
  projectId = (await api.post('/api/projects').set(as(owner)).send({ name: 'Realtime Project' })).body.id;
  await api.post(`/api/projects/${projectId}/members`).set(as(owner)).send({ userId: dev.user.id, role: 'member' });
  await api.post(`/api/projects/${projectId}/members`).set(as(owner)).send({ userId: viewer.user.id, role: 'viewer' });
  taskId = (await api.post(`/api/projects/${projectId}/tasks`).set(as(owner))
    .send({ title: 'Ship the release', priority: 'high', assigneeId: dev.user.id, dueDate: '2020-01-01' })).body.id;
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(async () => { server.close(); await stopDb(); });

/** Read an SSE stream until `match` appears or `ms` elapses; returns everything received. */
async function readStream(token, ms, match) {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/events?token=${token}`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  let text = '';
  const deadline = Date.now() + ms;
  const pending = (async () => {
    try {
      while (!match || !text.includes(match)) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
      }
    } catch { /* aborted */ }
  })();
  return { status: res.status, done: (async () => { await Promise.race([pending, new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now())))]); ctrl.abort(); return text; })() };
}

test('realtime: project members receive live events, outsiders do not', { timeout: 8000 }, async () => {
  const member = await readStream(dev.token, 3000, '"action":"task.created"');
  const stranger = await readStream(outsider.token, 800, '"action":"task.created"');
  assert.equal(member.status, 200);
  await new Promise((r) => setTimeout(r, 100));
  await api.post(`/api/projects/${projectId}/tasks`).set(as(owner)).send({ title: 'Live task' }).expect(201);
  assert.match(await member.done, /"action":"task.created"/);
  assert.doesNotMatch(await stranger.done, /task\.created/);
});

test('realtime: stream rejects missing token', async () => {
  assert.equal((await fetch(`${base}/events`)).status, 401);
});

test('history records each changed field with before and after values', async () => {
  await api.patch(`/api/tasks/${taskId}`).set(as(dev)).send({ priority: 'low', dueDate: '2030-05-01', status: 'in_progress' }).expect(200);
  const { body } = await api.get(`/api/tasks/${taskId}/activity`).set(as(viewer));
  const details = body.data.map((a) => `${a.action} ${a.details}`);
  assert.ok(details.includes('task.updated priority: High → Low'));
  assert.ok(details.some((d) => d.startsWith('task.updated due date: Jan 1, 2020 → May 1, 2030')));
  assert.ok(details.includes('task.moved To Do → In Progress'));
});

test('completed_at is set when a task reaches Done and cleared when it leaves', async () => {
  const done = await api.patch(`/api/tasks/${taskId}`).set(as(dev)).send({ status: 'done' });
  assert.ok(done.body.completed_at);
  const back = await api.patch(`/api/tasks/${taskId}`).set(as(dev)).send({ status: 'review' });
  assert.equal(back.body.completed_at, null);
});

test('comments: authors edit their own, managers delete any, others are refused', async () => {
  const c = (await api.post(`/api/tasks/${taskId}/comments`).set(as(dev)).send({ body: 'First draft' }).expect(201)).body;
  assert.equal((await api.patch(`/api/comments/${c.id}`).set(as(owner)).send({ body: 'hijack' })).status, 403);
  const edited = await api.patch(`/api/comments/${c.id}`).set(as(dev)).send({ body: 'Second draft' });
  assert.equal(edited.body.body, 'Second draft');
  assert.ok(edited.body.updated_at);
  assert.equal((await api.patch(`/api/comments/${c.id}`).set(as(dev)).send({ body: '   ' })).status, 400);
  assert.equal((await api.delete(`/api/comments/${c.id}`).set(as(viewer))).status, 403);
  assert.equal((await api.delete(`/api/comments/${c.id}`).set(as(outsider))).status, 404);
  assert.equal((await api.delete(`/api/comments/${c.id}`).set(as(owner))).status, 204);
});

test('my tasks: only tasks assigned to me, with tab counts and filters', async () => {
  await api.post(`/api/projects/${projectId}/tasks`).set(as(owner)).send({ title: 'Overdue chore', assigneeId: dev.user.id, dueDate: '2021-01-01' });
  await api.post(`/api/projects/${projectId}/tasks`).set(as(owner)).send({ title: 'Not mine', assigneeId: viewer.user.id });
  const { body } = await api.get('/api/tasks/mine?status=all').set(as(dev)).expect(200);
  assert.ok(body.data.every((t) => t.assignee_id === dev.user.id));
  assert.equal(body.counts.overdue, 1);
  assert.ok(body.data[0].project_name);
  const overdue = await api.get('/api/tasks/mine?due=overdue').set(as(dev));
  assert.deepEqual(overdue.body.data.map((t) => t.title), ['Overdue chore']);
  assert.equal((await api.get('/api/tasks/mine?sort=bogus').set(as(dev))).status, 400);
});

test('search is scoped to projects the user can access', async () => {
  const mine = await api.get('/api/search?q=release').set(as(viewer)).expect(200);
  assert.equal(mine.body.tasks[0].title, 'Ship the release');
  const theirs = await api.get('/api/search?q=release').set(as(outsider));
  assert.equal(theirs.body.tasks.length, 0);
  assert.equal(theirs.body.projects.length, 0);
  assert.equal((await api.get('/api/search?q=%25').set(as(viewer))).body.tasks.length, 0, 'LIKE wildcards are escaped');
  assert.equal((await api.get('/api/search').set(as(viewer))).status, 400);
});

test('project stats and paginated activity', async () => {
  const s = (await api.get(`/api/projects/${projectId}/stats`).set(as(viewer)).expect(200)).body;
  assert.equal(s.totals.tasks, Object.values(s.byStatus).reduce((a, b) => a + b, 0));
  assert.ok(s.workload.some((w) => w.name === 'Dev Member'));
  const a = (await api.get(`/api/projects/${projectId}/activity?limit=3&page=1`).set(as(viewer))).body;
  assert.equal(a.data.length, 3);
  assert.ok(a.pagination.total > 3);
  assert.equal((await api.get(`/api/projects/${projectId}/stats`).set(as(outsider))).status, 403);
});

test('member changes are recorded and removing a member unassigns their tasks', async () => {
  await api.post(`/api/projects/${projectId}/members`).set(as(owner)).send({ userId: viewer.user.id, role: 'member' }).expect(200);
  const assigned = (await api.post(`/api/projects/${projectId}/tasks`).set(as(owner)).send({ title: 'Viewer task', assigneeId: viewer.user.id })).body;
  await api.delete(`/api/projects/${projectId}/members/${viewer.user.id}`).set(as(owner)).expect(200);
  assert.equal((await api.get(`/api/tasks/${assigned.id}`).set(as(owner))).body.assignee_id, null);
  const feed = (await api.get(`/api/projects/${projectId}/activity?limit=50`).set(as(owner))).body.data.map((x) => x.action);
  assert.ok(feed.includes('member.role_changed') && feed.includes('member.removed'));
  assert.equal((await api.delete(`/api/projects/${projectId}/members/${owner.user.id}`).set(as(owner))).status, 400);
});

test('profile: rename and change password', async () => {
  const r = await api.patch('/api/auth/me').set(as(dev)).send({ name: 'Dev Renamed' }).expect(200);
  assert.equal(r.body.user.name, 'Dev Renamed');
  assert.equal((await api.post('/api/auth/password').set(as(dev)).send({ currentPassword: 'wrong', newPassword: 'newsecret1' })).status, 400);
  await api.post('/api/auth/password').set(as(dev)).send({ currentPassword: 'secret123', newPassword: 'newsecret1' }).expect(204);
  assert.equal((await api.post('/api/auth/login').send({ email: 'dev@t.dev', password: 'newsecret1' })).status, 200);
});

test('admin: list users and change roles; last admin is protected', async () => {
  assert.equal((await api.get('/api/admin/users').set(as(dev))).status, 403);
  const list = await api.get('/api/admin/users?search=owner').set(as(admin)).expect(200);
  assert.equal(list.body.data[0].email, 'owner@t.dev');
  assert.equal((await api.patch(`/api/admin/users/${admin.user.id}`).set(as(admin)).send({ role: 'member' })).status, 400);
  const promoted = await api.patch(`/api/admin/users/${owner.user.id}`).set(as(admin)).send({ role: 'admin' }).expect(200);
  assert.equal(promoted.body.role, 'admin');
});

test('teams: last lead is protected and members can leave', async () => {
  const team = (await api.post('/api/teams').set(as(dev)).send({ name: 'Leavers' })).body;
  await api.post(`/api/teams/${team.id}/members`).set(as(dev)).send({ userId: viewer.user.id }).expect(201);
  assert.equal((await api.patch(`/api/teams/${team.id}/members/${dev.user.id}`).set(as(dev)).send({ role: 'member' })).status, 400);
  assert.equal((await api.delete(`/api/teams/${team.id}/members/${dev.user.id}`).set(as(dev))).status, 400);
  await api.delete(`/api/teams/${team.id}/members/${viewer.user.id}`).set(as(viewer)).expect(200);
  const list = (await api.get('/api/teams').set(as(dev))).body.data.find((t) => t.id === team.id);
  assert.equal(list.member_count, 1);
  assert.equal(list.my_role, 'lead');
});

test('malformed JSON gets a clean 400', async () => {
  const r = await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Malformed JSON body');
});
