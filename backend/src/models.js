import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const STATUSES = ['todo', 'in_progress', 'review', 'done'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const PROJECT_ROLES = ['owner', 'manager', 'member', 'viewer'];
export const TEAM_ROLES = ['lead', 'member'];
export const LABEL_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink'];
export const NOTIFICATION_TYPES = ['assigned', 'comment', 'mention', 'added', 'chat'];

// Documents keep small numeric ids (1, 2, 3 …) issued by the counters collection,
// so URLs and API responses stay readable and identical to the earlier SQL version.
const opts = { versionKey: false };

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, opts);
export const Counter = model('Counter', counterSchema);

/** Atomically issue the next id for a collection. */
export async function nextId(name) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return c.seq;
}

const userSchema = new Schema({
  _id: Number,
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
  createdAt: { type: Date, default: Date.now },
}, opts);
export const User = model('User', userSchema);

/** Membership is embedded in its team / project: always read together, never queried alone. */
const member = (roles) => new Schema({
  userId: { type: Number, ref: 'User', required: true },
  role: { type: String, enum: roles, required: true },
}, { _id: false });

const teamSchema = new Schema({
  _id: Number,
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 500 },
  createdBy: { type: Number, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  members: { type: [member(TEAM_ROLES)], default: [] },
}, opts);
teamSchema.index({ 'members.userId': 1 });
export const Team = model('Team', teamSchema);

/** Project-specific labels, e.g. "Bug" (red). Tasks reference them by id. */
const labelSchema = new Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true, trim: true, maxlength: 30 },
  color: { type: String, enum: LABEL_COLORS, default: 'blue' },
}, { _id: false });

const projectSchema = new Schema({
  _id: Number,
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 2000 },
  teamId: { type: Number, ref: 'Team', default: null },
  ownerId: { type: Number, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  members: { type: [member(PROJECT_ROLES)], default: [] },
  labels: { type: [labelSchema], default: [] },
  chatBlocked: { type: [Number], default: [] }, // members a manager removed from the project chat (they keep the project)
}, opts);
projectSchema.index({ 'members.userId': 1 });
projectSchema.index({ teamId: 1 });
export const Project = model('Project', projectSchema);

/** A step inside a task (subtask checklist). */
const checklistItemSchema = new Schema({
  id: { type: Number, required: true },
  text: { type: String, required: true, trim: true, maxlength: 200 },
  done: { type: Boolean, default: false },
}, { _id: false });

const taskSchema = new Schema({
  _id: Number,
  projectId: { type: Number, ref: 'Project', required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '', maxlength: 5000 },
  status: { type: String, enum: STATUSES, default: 'todo' },
  priority: { type: String, enum: PRIORITIES, default: 'medium' },
  assigneeId: { type: Number, ref: 'User', default: null },
  dueDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ }, // calendar date, no time zone
  position: { type: Number, default: 0 }, // order inside a column; fractional so cards can go between two others
  createdBy: { type: Number, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  labelIds: { type: [Number], default: [] },
  checklist: { type: [checklistItemSchema], default: [] },
}, opts);
taskSchema.index({ projectId: 1, status: 1, position: 1 });
taskSchema.index({ projectId: 1, labelIds: 1 });
taskSchema.index({ assigneeId: 1, status: 1 });
export const Task = model('Task', taskSchema);

const commentSchema = new Schema({
  _id: Number,
  taskId: { type: Number, ref: 'Task', required: true },
  projectId: { type: Number, ref: 'Project', required: true }, // denormalised for permission checks
  userId: { type: Number, ref: 'User' },
  body: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: null },
}, opts);
commentSchema.index({ taskId: 1, _id: 1 });
export const Comment = model('Comment', commentSchema);

const activitySchema = new Schema({
  _id: Number,
  projectId: { type: Number, ref: 'Project', required: true },
  taskId: { type: Number, ref: 'Task', default: null },
  userId: { type: Number, ref: 'User' },
  action: { type: String, required: true },
  details: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
}, opts);
activitySchema.index({ projectId: 1, createdAt: -1, _id: -1 });
activitySchema.index({ taskId: 1, createdAt: -1, _id: -1 });
export const Activity = model('Activity', activitySchema);

/** Something the user should know about: assigned to them, a comment on their task, a mention, added to a project. */
const notificationSchema = new Schema({
  _id: Number,
  userId: { type: Number, ref: 'User', required: true }, // recipient
  actorId: { type: Number, ref: 'User' },
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  projectId: { type: Number, ref: 'Project' },
  taskId: { type: Number, ref: 'Task', default: null },
  text: { type: String, default: '' }, // task title / comment excerpt at the time, in case it is deleted later
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}, opts);
notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
export const Notification = model('Notification', notificationSchema);

/** A message in a project's chat. */
const chatMessageSchema = new Schema({
  _id: Number,
  projectId: { type: Number, ref: 'Project', required: true },
  userId: { type: Number, ref: 'User', required: true },
  body: { type: String, default: '', trim: true, maxlength: 2000 }, // empty for voice messages
  // Voice message details; the audio itself lives in VoiceClip so history queries stay small.
  voice: {
    type: new Schema({
      mime: { type: String, required: true },
      duration: { type: Number, required: true }, // seconds
      size: { type: Number, required: true }, // bytes
      waveform: { type: [Number], default: [] }, // 0–100 levels for drawing the bars
    }, { _id: false }),
    default: null,
  },
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date, default: null },
}, opts);
chatMessageSchema.index({ projectId: 1, _id: -1 });
export const ChatMessage = model('ChatMessage', chatMessageSchema);

/** Audio of a voice message (_id = the message id). */
const voiceClipSchema = new Schema({
  _id: Number,
  projectId: { type: Number, required: true, index: true },
  mime: { type: String, required: true },
  data: { type: Buffer, required: true },
}, opts);
export const VoiceClip = model('VoiceClip', voiceClipSchema);

/** How far each person has read a project's chat (drives the unread badge). _id is "<projectId>:<userId>". */
const chatReadSchema = new Schema({
  _id: String,
  projectId: { type: Number, required: true },
  userId: { type: Number, required: true },
  lastReadId: { type: Number, default: 0 },
}, opts);
export const ChatRead = model('ChatRead', chatReadSchema);

export const models = { Counter, User, Team, Project, Task, Comment, Activity, Notification, ChatMessage, ChatRead, VoiceClip };
