import { bus } from './bus.js';
import { Project } from './models.js';

// Server-Sent Events hub: every activity is pushed to connected users who can see that project,
// so boards, dashboards and open tasks refresh in real time.
const clients = new Set();

export function stream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const client = { res, user: req.user };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

// Personal events (a new notification) go only to that user's open tabs.
bus.on('notify', ({ userId }) => {
  const data = `data: ${JSON.stringify({ kind: 'notification', userId, at: Date.now() })}\n\n`;
  for (const c of clients) if (c.user.id === userId) c.res.write(data);
});

bus.on('change', async ({ recipients, ...event }) => {
  if (!clients.size) return;
  try {
    // Deletions pass their recipients explicitly (resolved before the project disappeared).
    const members = recipients ?? (await Project.findById(event.projectId, { members: 1 }).lean())?.members.map((m) => m.userId) ?? [];
    const data = `data: ${JSON.stringify({ ...event, at: Date.now() })}\n\n`;
    for (const c of clients) {
      if (c.user.role === 'admin' || members.includes(c.user.id)) c.res.write(data);
    }
  } catch (err) {
    console.error('Realtime broadcast failed:', err.message);
  }
});
