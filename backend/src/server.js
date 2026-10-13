import { createServer } from 'node:http';
import { app } from './app.js';
import { attachSocket } from './socket.js';
import { connectDb } from './db.js';

const PORT = process.env.PORT || 4000;

try {
  // Keep waiting: on the very first `npm run dev` the embedded MongoDB may still be downloading.
  await connectDb(undefined, { retries: Infinity });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// One HTTP server for the REST API and Socket.IO (project chat).
const server = createServer(app);
attachSocket(server);
server.listen(PORT, () => {
  console.log(`TaskFlow API running on http://localhost:${PORT}`);
  console.log(`API docs:            http://localhost:${PORT}/api/docs`);
});
