// Embedded development MongoDB: the official mongod binary (downloaded once by mongodb-memory-server),
// listening on 127.0.0.1:27017 and storing data in backend/data/mongo so it survives restarts.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_PORT = Number(process.env.MONGO_PORT || 27017);
export const DATA_DIR = process.env.MONGO_DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'mongo');

/** True if something (e.g. a MongoDB you installed, or `npm run db`) already listens on the port. */
export function portInUse(port = DEV_PORT) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' }, () => { socket.end(); resolve(true); });
    socket.on('error', () => resolve(false));
  });
}

/** Start the embedded server. Returns the MongoMemoryServer instance. */
export async function startEmbedded(port = DEV_PORT) {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // portGeneration: false — fail loudly rather than silently moving to a random port nobody connects to.
  return MongoMemoryServer.create({ instance: { port, ip: '127.0.0.1', dbPath: DATA_DIR, storageEngine: 'wiredTiger', portGeneration: false } });
}

/**
 * Shut mongod down cleanly so recent writes are flushed to disk.
 * (On Windows, MongoMemoryServer.stop() alone kills the process outright, which can lose the last writes.)
 */
export async function stopEmbedded(server) {
  const { MongoClient } = await import('mongodb');
  try {
    const client = await MongoClient.connect(server.getUri(), { directConnection: true, serverSelectionTimeoutMS: 3000 });
    await client.db('admin').command({ shutdown: 1, force: true, timeoutSecs: 5 }).catch(() => {}); // mongod drops the connection as it exits
    await client.close().catch(() => {});
  } catch { /* already stopped */ }
  await server.stop({ doCleanup: false });
}
