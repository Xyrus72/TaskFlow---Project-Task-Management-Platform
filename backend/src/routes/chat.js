import express, { Router } from 'express';
import { z } from 'zod';
import { idParam, requirePerm, validate } from '../middleware.js';
import {
  createMessage, createVoiceMessage, deleteMessage, editMessage, getVoiceClip, lastReadId, listMessages, markRead, readMarkers, requireChat,
  setChatAccess, VOICE_MAX_BYTES,
} from '../chat.js';

// Project chat over REST: history, read markers, edit and delete.
// Sending normally happens over Socket.IO (socket.js); POST here does exactly the same thing.
const r = Router();

const historyQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const readSchema = z.object({ messageId: z.number().int().nonnegative() });

r.get('/projects/:projectId/messages', requirePerm('project:read'), validate(historyQuery, 'query'), async (req, res) => {
  await requireChat(req.user, req.projectId);
  const page = await listMessages(req.projectId, req.valid.query);
  res.json({ ...page, last_read_id: await lastReadId(req.user.id, req.projectId), reads: await readMarkers(req.projectId) });
});

r.post('/projects/:projectId/messages', requirePerm('project:read'), async (req, res) => {
  res.status(201).json(await createMessage(req.user, req.projectId, req.body, req.body?.clientId));
});

// Voice message: the raw recording is the request body (Content-Type audio/webm, audio/ogg, audio/mp4 …);
// ?duration=<seconds>&waveform=<comma-separated 0–100 levels>&clientId=<id>
r.post('/projects/:projectId/messages/voice', requirePerm('project:read'), express.raw({ type: 'audio/*', limit: VOICE_MAX_BYTES }), async (req, res) => {
  const { duration, waveform, clientId } = req.query;
  res.status(201).json(await createVoiceMessage(req.user, req.projectId, { data: req.body, mime: req.get('content-type') || '', duration, waveform }, clientId));
});

r.get('/messages/:id/audio', async (req, res) => {
  const { data, mime } = await getVoiceClip(req.user, idParam(req.params.id, 'Message'));
  res.set({ 'Content-Type': mime, 'Content-Length': data.length, 'Cache-Control': 'private, max-age=31536000, immutable' }).send(data);
});

r.post('/projects/:projectId/messages/read', requirePerm('project:read'), validate(readSchema), async (req, res) => {
  await requireChat(req.user, req.projectId);
  res.json({ unread: await markRead(req.user, req.projectId, req.valid.body.messageId) });
});

r.patch('/messages/:id', async (req, res) => res.json(await editMessage(req.user, idParam(req.params.id, 'Message'), req.body)));

r.delete('/messages/:id', async (req, res) => {
  await deleteMessage(req.user, idParam(req.params.id, 'Message'));
  res.status(204).end();
});

// Managers remove people from the chat (they keep the project) and add them back.
const removeSchema = z.object({ userId: z.number().int().positive() });
r.post('/projects/:projectId/chat/removed', requirePerm('project:read'), validate(removeSchema), async (req, res) => {
  await setChatAccess(req.user, req.projectId, req.valid.body.userId, false);
  res.status(204).end();
});
r.delete('/projects/:projectId/chat/removed/:userId', requirePerm('project:read'), async (req, res) => {
  await setChatAccess(req.user, req.projectId, idParam(req.params.userId, 'User'), true);
  res.status(204).end();
});

export default r;
