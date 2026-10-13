// Each test file gets its own throwaway MongoDB (in memory), so tests never touch real data.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../src/db.js';

let server;

export async function startDb() {
  server = await MongoMemoryServer.create();
  await connectDb(server.getUri('taskflow-test'), { retries: 1, quiet: true });
}

export async function stopDb() {
  await disconnectDb();
  await server?.stop();
}
