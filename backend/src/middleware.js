import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Project, User } from './models.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

/** Parse a numeric route id; anything else is treated as "not found". */
export function idParam(value, what = 'Resource') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, `${what} not found`);
  return id;
}

// Express 5 forwards errors thrown by async handlers and middleware to the error handler.
export async function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  // EventSource cannot send headers, so the SSE stream passes the token as ?token=
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.path.endsWith('/events') ? req.query.token : null;
  if (!token) throw new HttpError(401, 'Authentication required');
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); } catch { throw new HttpError(401, 'Invalid or expired token'); }
  const user = await User.findById(payload.id, { name: 1, email: 1, role: 1 }).lean();
  if (!user) throw new HttpError(401, 'Invalid or expired token');
  req.user = { id: user._id, name: user.name, email: user.email, role: user.role };
  next();
}

/** Validate req[source] against a zod schema; the parsed data is stored on req.valid[source]. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const r = schema.safeParse(source === 'body' ? (req.body ?? {}) : req[source]);
  if (!r.success) return next(new HttpError(400, 'Validation failed', r.error.flatten().fieldErrors));
  req.valid = { ...(req.valid || {}), [source]: r.data };
  next();
};

/* ---------------- RBAC ---------------- */
// Project-level role hierarchy. Global admins bypass all checks.
const RANK = { viewer: 1, member: 2, manager: 3, owner: 4 };
export const PERMISSIONS = {
  'project:read': 'viewer',
  'task:create': 'member',
  'task:update': 'member',
  'comment:create': 'member',
  'chat:write': 'member',
  'chat:moderate': 'manager',
  'task:delete': 'manager',
  'project:update': 'manager',
  'member:manage': 'manager',
  'project:delete': 'owner',
};

export const roleAllows = (role, permission) => !!role && RANK[role] >= RANK[PERMISSIONS[permission]];

/** The user's role in a project (admins count as owner), or null if they are not a member. */
export async function projectRole(user, projectId) {
  if (user.role === 'admin') return 'owner';
  const p = await Project.findOne({ _id: projectId, 'members.userId': user.id }, { 'members.$': 1 }).lean();
  return p?.members?.[0]?.role || null;
}

export async function can(user, projectId, permission) {
  return roleAllows(await projectRole(user, projectId), permission);
}

/** Ids of every project the user can read (null = all, for admins). */
export async function accessibleProjectIds(user) {
  if (user.role === 'admin') return null;
  return Project.distinct('_id', { 'members.userId': user.id });
}

/** Query fragment restricting a `projectId`-style field to projects the user can read. */
export async function accessScope(user, field = 'projectId') {
  const ids = await accessibleProjectIds(user);
  return ids === null ? {} : { [field]: { $in: ids } };
}

/** Middleware: resolve the project id via getter and enforce a permission. */
export const requirePerm = (permission, getProjectId = (req) => req.params.projectId) => async (req, _res, next) => {
  const projectId = idParam(await getProjectId(req), 'Project');
  if (!(await Project.exists({ _id: projectId }))) throw new HttpError(404, 'Project not found');
  const role = await projectRole(req.user, projectId);
  if (!roleAllows(role, permission)) {
    throw new HttpError(403, permission === 'project:read'
      ? "You don't have access to this project"
      : `You need the ${PERMISSIONS[permission]} role on this project to do that`);
  }
  req.projectId = projectId;
  req.projectRole = role;
  next();
};

export function errorHandler(err, _req, res, _next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large' });
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(Object.entries(err.errors).map(([k, e]) => [k, [e.message]]));
    return res.status(400).json({ error: 'Validation failed', details });
  }
  if (err instanceof mongoose.Error.CastError) return res.status(400).json({ error: `Invalid value for ${err.path}` });
  if (err.code === 11000) return res.status(409).json({ error: 'That value is already taken' });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Internal error' : err.message, ...(err.details ? { details: err.details } : {}) });
}
