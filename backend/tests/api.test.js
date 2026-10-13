import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, stopDb } from './setup.js';

const { app } = await import('../src/app.js');
const api = request(app);
let admin, member, viewer, projectId, taskId;

const reg = async (name, email) => (await api.post('/api/auth/register').send({ name, email, password: 'secret123' })).body;
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

before(async () => {
  await startDb();
  admin = await reg('Admin', 'a@t.dev');
  member = await reg('Member', 'm@t.dev');
  viewer = await reg('Viewer', 'v@t.dev');
});

after(stopDb);

test('first user is admin, others members', () => {
  assert.equal(admin.user.role, 'admin');
  assert.equal(member.user.role, 'member');
});

test('validation rejects bad registration', async () => {
  const r = await api.post('/api/auth/register').send({ name: 'x', email: 'bad', password: '1' });
  assert.equal(r.status, 400);
  assert.ok(r.body.details.email);
});

test('login works and rejects wrong password', async () => {
  assert.equal((await api.post('/api/auth/login').send({ email: 'm@t.dev', password: 'secret123' })).status, 200);
  assert.equal((await api.post('/api/auth/login').send({ email: 'm@t.dev', password: 'nope' })).status, 401);
});

test('requires auth', async () => {
  assert.equal((await api.get('/api/projects')).status, 401);
});

test('member creates project and becomes owner', async () => {
  const r = await api.post('/api/projects').set(as(member)).send({ name: 'Alpha' });
  assert.equal(r.status, 201);
  assert.equal(r.body.my_role, 'owner');
  projectId = r.body.id;
});

test('non-members cannot read project', async () => {
  assert.equal((await api.get(`/api/projects/${projectId}`).set(as(viewer))).status, 403);
});

test('owner adds viewer; viewer can read but not create tasks', async () => {
  await api.post(`/api/projects/${projectId}/members`).set(as(member)).send({ userId: viewer.user.id, role: 'viewer' }).expect(201);
  assert.equal((await api.get(`/api/projects/${projectId}`).set(as(viewer))).status, 200);
  assert.equal((await api.post(`/api/projects/${projectId}/tasks`).set(as(viewer)).send({ title: 'x' })).status, 403);
});

test('task CRUD, kanban move and activity', async () => {
  const c = await api.post(`/api/projects/${projectId}/tasks`).set(as(member))
    .send({ title: 'Build API', priority: 'high', assigneeId: member.user.id, dueDate: '2030-01-01' });
  assert.equal(c.status, 201);
  taskId = c.body.id;
  const m = await api.patch(`/api/tasks/${taskId}`).set(as(member)).send({ status: 'review' });
  assert.equal(m.body.status, 'review');
  const act = await api.get(`/api/tasks/${taskId}/activity`).set(as(member));
  assert.ok(act.body.data.some((a) => a.action === 'task.moved'));
});

test('task validation: invalid status / non-member assignee', async () => {
  assert.equal((await api.patch(`/api/tasks/${taskId}`).set(as(member)).send({ status: 'blocked' })).status, 400);
  assert.equal((await api.post(`/api/projects/${projectId}/tasks`).set(as(member)).send({ title: 'y', assigneeId: admin.user.id })).status, 400);
});

test('search, filter and pagination', async () => {
  for (let i = 0; i < 5; i++) await api.post(`/api/projects/${projectId}/tasks`).set(as(member)).send({ title: `Item ${i}` });
  const r = await api.get(`/api/projects/${projectId}/tasks?search=Item&limit=2&page=2`).set(as(member));
  assert.equal(r.body.pagination.total, 5);
  assert.equal(r.body.data.length, 2);
  const f = await api.get(`/api/projects/${projectId}/tasks?priority=high`).set(as(member));
  assert.equal(f.body.data.length, 1);
});

test('comments', async () => {
  await api.post(`/api/tasks/${taskId}/comments`).set(as(member)).send({ body: 'Hello' }).expect(201);
  assert.equal((await api.post(`/api/tasks/${taskId}/comments`).set(as(viewer)).send({ body: 'x' })).status, 403);
  const l = await api.get(`/api/tasks/${taskId}/comments`).set(as(viewer));
  assert.equal(l.body.data.length, 1);
});

test('admin bypasses RBAC; dashboard stats', async () => {
  assert.equal((await api.get(`/api/projects/${projectId}`).set(as(admin))).status, 200);
  const d = await api.get('/api/dashboard').set(as(member));
  assert.equal(d.body.totals.tasks, 6);
  assert.equal(d.body.byStatus.review, 1);
});

test('teams: create and add member; non-lead cannot manage', async () => {
  const t = await api.post('/api/teams').set(as(member)).send({ name: 'Core' });
  assert.equal(t.status, 201);
  await api.post(`/api/teams/${t.body.id}/members`).set(as(member)).send({ userId: viewer.user.id }).expect(201);
  assert.equal((await api.delete(`/api/teams/${t.body.id}`).set(as(viewer))).status, 403);
});

test('only owner can delete project; viewer cannot delete task', async () => {
  assert.equal((await api.delete(`/api/tasks/${taskId}`).set(as(viewer))).status, 403);
  assert.equal((await api.delete(`/api/projects/${projectId}`).set(as(viewer))).status, 403);
  assert.equal((await api.delete(`/api/projects/${projectId}`).set(as(member))).status, 204);
});
