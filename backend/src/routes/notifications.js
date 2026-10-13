import { Router } from 'express';
import { z } from 'zod';
import { Notification } from '../models.js';
import { validate, idParam, HttpError } from '../middleware.js';
import { hydrateNotifications } from '../serialize.js';

const r = Router();

const listQuery = z.object({
  unread: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const readSchema = z.object({ read: z.boolean() });

const unreadCount = (userId) => Notification.countDocuments({ userId, readAt: null });

/* Your notifications, newest first, plus how many are unread. */
r.get('/', validate(listQuery, 'query'), async (req, res) => {
  const { unread, page, limit } = req.valid.query;
  const filter = { userId: req.user.id, ...(unread === 'true' ? { readAt: null } : {}) };
  const [total, rows, unread_count] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    unreadCount(req.user.id),
  ]);
  res.json({ data: await hydrateNotifications(rows), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }, unread_count });
});

r.post('/read-all', async (req, res) => {
  await Notification.updateMany({ userId: req.user.id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ unread_count: 0 });
});

r.patch('/:id', validate(readSchema), async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: idParam(req.params.id, 'Notification'), userId: req.user.id },
    { $set: { readAt: req.valid.body.read ? new Date() : null } },
    { returnDocument: 'after' },
  ).lean();
  if (!n) throw new HttpError(404, 'Notification not found');
  res.json({ ...(await hydrateNotifications([n]))[0], unread_count: await unreadCount(req.user.id) });
});

export default r;
