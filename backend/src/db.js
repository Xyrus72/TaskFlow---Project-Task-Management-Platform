import mongoose from 'mongoose';
import { bus } from './bus.js';
import { Activity, models, nextId } from './models.js';

export const DEFAULT_URI = `mongodb://127.0.0.1:${process.env.MONGO_PORT || 27017}/taskflow`;
mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB (MONGODB_URI, or a local server by default) and build indexes.
 * Retries for a while so the API can start before the database is up (e.g. `npm run dev`).
 */
export async function connectDb(uri = process.env.MONGODB_URI || DEFAULT_URI, { retries = 60, quiet = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
      await Promise.all(Object.values(models).map((m) => m.init()));
      if (!quiet) console.log(`MongoDB connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
      return mongoose.connection;
    } catch (err) {
      if (attempt >= retries) {
        throw new Error(`Can't reach MongoDB at ${uri}. Start one with "npm run db" (embedded, no install) or set MONGODB_URI. (${err.message})`);
      }
      if (!quiet && attempt % 30 === 1) console.log('Waiting for MongoDB… (run "npm run db" for an embedded server, or set MONGODB_URI)');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export const disconnectDb = () => mongoose.disconnect();

/** Record an activity-history entry and publish it to realtime subscribers. */
export async function logActivity({ projectId, taskId = null, userId, action, details = '', eventTaskId }) {
  await Activity.create({ _id: await nextId('activities'), projectId, taskId, userId, action, details, createdAt: new Date() });
  // eventTaskId lets a deletion still tell open views which task disappeared.
  bus.emit('change', { projectId, taskId: eventTaskId ?? taskId, userId, action });
}

/** Case-insensitive "contains" match with regex metacharacters escaped, so user text is matched literally. */
export const containsRx = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

/** Today's date and today + n days as UTC YYYY-MM-DD strings (due dates are stored that way). */
export const today = () => new Date().toISOString().slice(0, 10);
export const plusDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
export const daysAgo = (n) => new Date(Date.now() - n * 864e5);
