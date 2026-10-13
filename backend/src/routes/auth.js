import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User, nextId } from '../models.js';
import { auth, validate, HttpError, JWT_SECRET } from '../middleware.js';
import { userOut } from '../serialize.js';

const r = Router();
const sign = (u) => jwt.sign({ id: u._id }, JWT_SECRET, { expiresIn: '7d' });
const publicUser = async (id) => userOut(await User.findById(id).lean());

const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(80);
const password = z.string().min(6, 'Password must be at least 6 characters').max(100);
const registerSchema = z.object({ name, email: z.string().trim().toLowerCase().email('Enter a valid email address'), password });
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address'), password: z.string().min(1, 'Enter your password') });
const profileSchema = z.object({ name });
const passwordSchema = z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: password });

r.post('/register', validate(registerSchema), async (req, res) => {
  const { name, email, password } = req.valid.body;
  if (await User.exists({ email })) throw new HttpError(409, 'That email is already registered', { email: ['That email is already registered'] });
  const isFirst = (await User.estimatedDocumentCount()) === 0;
  const user = await User.create({ _id: await nextId('users'), name, email, passwordHash: bcrypt.hashSync(password, 10), role: isFirst ? 'admin' : 'member' });
  res.status(201).json({ token: sign(user), user: userOut(user) });
});

r.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.valid.body;
  const u = await User.findOne({ email }).lean();
  if (!u || !bcrypt.compareSync(password, u.passwordHash)) throw new HttpError(401, 'Incorrect email or password');
  res.json({ token: sign(u), user: userOut(u) });
});

r.get('/me', auth, async (req, res) => res.json({ user: await publicUser(req.user.id) }));

r.patch('/me', auth, validate(profileSchema), async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $set: { name: req.valid.body.name } });
  res.json({ user: await publicUser(req.user.id) });
});

r.post('/password', auth, validate(passwordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.valid.body;
  const u = await User.findById(req.user.id, { passwordHash: 1 }).lean();
  if (!bcrypt.compareSync(currentPassword, u.passwordHash)) throw new HttpError(400, 'Current password is incorrect', { currentPassword: ['Current password is incorrect'] });
  await User.updateOne({ _id: req.user.id }, { $set: { passwordHash: bcrypt.hashSync(newPassword, 10) } });
  res.status(204).end();
});

export default r;
