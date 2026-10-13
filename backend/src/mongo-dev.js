// `npm run db` — a development MongoDB with nothing to install.
// If something already listens on the port (for example a MongoDB you installed yourself), that one is used.
import path from 'node:path';
import { DATA_DIR, DEV_PORT, portInUse, startEmbedded, stopEmbedded } from './embedded.js';

if (await portInUse()) {
  console.log(`MongoDB is already running on port ${DEV_PORT}; using it.`);
  process.exit(0);
}

console.log('Starting embedded MongoDB (the first run downloads the MongoDB server once)…');
const server = await startEmbedded();
console.log(`MongoDB ready at mongodb://127.0.0.1:${DEV_PORT}  (data: ${path.relative(process.cwd(), DATA_DIR)})`);

const stop = async () => { await stopEmbedded(server); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30); // keep this process (and therefore mongod) alive
