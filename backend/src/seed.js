// Seeds realistic demo data into MongoDB. Run: npm run seed  (wipes existing data)
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from './db.js';
import { portInUse, startEmbedded, stopEmbedded } from './embedded.js';
import { models, Activity, ChatMessage, ChatRead, Comment, Counter, Notification, Project, Task, Team, User } from './models.js';

/** Date `minutes` ago, and YYYY-MM-DD `n` days from today. */
const ago = (minutes) => new Date(Date.now() - minutes * 60000);
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const H = 60; const D = 24 * H;
const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// Everything is built in memory with sequential ids, then inserted collection by collection.
const ids = { users: 0, teams: 0, projects: 0, tasks: 0, comments: 0, activities: 0, labels: 0, checklist: 0, notifications: 0, messages: 0 };
const next = (name) => ++ids[name];
const docs = { users: [], teams: [], projects: [], tasks: [], comments: [], activities: [], notifications: [], messages: [], chatReads: [] };
const names = new Map();

const hash = bcrypt.hashSync('password123', 10);
const user = (name, email, role = 'member', joinedDaysAgo = 40) => {
  const _id = next('users');
  docs.users.push({ _id, name, email, passwordHash: hash, role, createdAt: ago(joinedDaysAgo * D) });
  names.set(_id, name);
  return _id;
};
const ava = user('Ava Admin', 'admin@taskflow.dev', 'admin', 60);
const maya = user('Maya Manager', 'maya@taskflow.dev');
const leo = user('Leo Developer', 'leo@taskflow.dev');
const zara = user('Zara Designer', 'zara@taskflow.dev');
const victor = user('Victor Viewer', 'victor@taskflow.dev', 'member', 20);
const noah = user('Noah Tester', 'noah@taskflow.dev', 'member', 30);
const priya = user('Priya Patel', 'priya@taskflow.dev', 'member', 25);

const team = (name, description, lead, members) => {
  const _id = next('teams');
  docs.teams.push({
    _id, name, description, createdBy: lead, createdAt: ago(35 * D),
    members: [{ userId: lead, role: 'lead' }, ...members.map((userId) => ({ userId, role: 'member' }))],
  });
  return _id;
};
const product = team('Product Engineering', 'Builds and runs the customer-facing web and mobile apps.', maya, [leo, zara, victor, noah]);
const growth = team('Growth & Marketing', 'Campaigns, content and analytics.', ava, [zara, priya]);

const activity = (projectId, taskId, userId, action, details, minutesAgo) => docs.activities.push({
  _id: next('activities'), projectId, taskId, userId, action, details, createdAt: ago(minutesAgo),
});

function project(name, description, teamId, owner, members, createdDaysAgo) {
  const _id = next('projects');
  docs.projects.push({
    _id, name, description, teamId, ownerId: owner, createdAt: ago(createdDaysAgo * D),
    members: [{ userId: owner, role: 'owner' }, ...members.map(([userId, role]) => ({ userId, role }))],
  });
  activity(_id, null, owner, 'project.created', name, createdDaysAgo * D);
  members.forEach(([u, role], i) => activity(_id, null, owner, 'member.added', `${names.get(u)} as ${role}`, createdDaysAgo * D - 10 - i));
  return _id;
}

const web = project('Website Redesign', 'Rebuild the marketing site on the new design system, with faster pages and better SEO.', product, maya,
  [[leo, 'member'], [zara, 'member'], [noah, 'member'], [victor, 'viewer']], 28);
const mobile = project('Mobile App v2', 'Rebuild the iOS and Android apps with offline support and a new onboarding flow.', product, maya,
  [[leo, 'manager'], [zara, 'member'], [noah, 'member']], 24);
const campaign = project('Q4 Holiday Campaign', 'Plan and launch the holiday campaign across email, social and paid ads.', growth, ava,
  [[zara, 'manager'], [priya, 'member']], 18);
const tools = project('Internal Tools', 'Small admin tools that save the support team time.', null, leo,
  [[noah, 'member'], [maya, 'viewer']], 12);

const LABEL = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' };
const positions = {};
/**
 * [title, status, priority, assignee, due (days from today or null), description, createdDaysAgo]
 * Each task gets a creation entry; tasks past "To Do" also get a realistic move history.
 */
function tasks(projectId, creator, rows) {
  return rows.map(([title, status, priority, assignee, due, description, createdDaysAgo]) => {
    const key = `${projectId}:${status}`;
    positions[key] = (positions[key] || 0) + 1000;
    const created = createdDaysAgo * D;
    const _id = next('tasks');
    docs.tasks.push({
      _id, projectId, title, description, status, priority, assigneeId: assignee, dueDate: due === null ? null : day(due),
      position: positions[key], createdBy: creator, createdAt: ago(created), updatedAt: ago(Math.max(30, created - 2 * D)),
      // Spread completions over the last ~9 days (never before the task was created).
      completedAt: status === 'done' ? ago(Math.min(created - D, (2 + ((title.length * 7) % 216)) * H)) : null,
    });
    activity(projectId, _id, creator, 'task.created', title, created);
    if (assignee && assignee !== creator) activity(projectId, _id, creator, 'task.assigned', names.get(assignee), created - 5);
    const steps = ['todo', 'in_progress', 'review', 'done'];
    for (let i = 1; i <= steps.indexOf(status); i++) {
      activity(projectId, _id, assignee || creator, 'task.moved', `${LABEL[steps[i - 1]]} → ${LABEL[steps[i]]}`, Math.max(20, created - i * (created / 4)));
    }
    return _id;
  });
}

const [hero, nav, tokens, seo, a11y, , , , perf, , blog] = tasks(web, maya, [
  ['Homepage hero section', 'in_progress', 'urgent', leo, 1, 'Build the new hero with the product video, headline and two calls to action. Must look right from 360px to 1440px.', 9],
  ['Build header and navigation', 'in_progress', 'high', leo, 4, 'Sticky header with mobile menu, active states and keyboard support.', 12],
  ['Design system tokens', 'review', 'high', zara, 2, 'Colours, type scale, spacing and radius tokens exported for CSS.', 15],
  ['Write SEO copy for landing pages', 'todo', 'medium', null, 9, 'Meta titles and descriptions for the 8 landing pages. Keep titles under 60 characters.', 6],
  ['Accessibility review', 'todo', 'high', noah, -1, 'Run axe and a keyboard-only pass on the new templates. File issues for anything below WCAG AA.', 8],
  ['Set up analytics events', 'todo', 'low', leo, 14, 'Track sign-up clicks, demo requests and scroll depth.', 4],
  ['Audit current site pages', 'done', 'medium', leo, -10, 'List every page, its traffic and whether it survives the redesign.', 26],
  ['Create moodboard', 'done', 'low', zara, -7, 'Collect references for layout, colour and photography.', 25],
  ['Performance budget', 'review', 'medium', noah, 3, 'Largest Contentful Paint under 2.5s on a mid-range phone. Add Lighthouse to CI.', 10],
  ['Contact form validation', 'todo', 'medium', zara, 6, 'Inline errors, disabled submit while sending, success state.', 3],
  ['Migrate blog posts', 'done', 'low', noah, -4, 'Move 42 posts and keep their URLs. Add redirects where slugs changed.', 20],
  ['Pricing page layout', 'todo', 'high', zara, 5, 'Three plans side by side, comparison table below.', 2],
  ['Approve final page designs', 'review', 'high', maya, 0, 'Sign off on the desktop and mobile designs so the build can start.', 5],
  ['Plan launch announcement', 'todo', 'medium', maya, 8, 'Blog post and an email to existing customers.', 3],
  ['Sign off on the sitemap', 'todo', 'high', maya, -2, 'Confirm which pages survive and the new URL structure.', 7],
]);

const [offline, onboarding, push, , settings, release] = tasks(mobile, maya, [
  ['Offline sync architecture', 'in_progress', 'urgent', leo, 3, 'Queue writes locally and replay them when the connection returns. Handle conflicts last-write-wins for now.', 14],
  ['Onboarding screens', 'review', 'medium', zara, 5, 'Three screens plus permissions prompt. Designs are in the shared file.', 12],
  ['Push notifications', 'todo', 'high', null, 12, 'Reminders for due tasks and mentions. Respect quiet hours.', 9],
  ['Crash reporting', 'done', 'medium', leo, -3, 'Wire up crash reporting with source maps for both platforms.', 20],
  ['Settings screen', 'todo', 'low', noah, 15, 'Notification preferences, sign out, app version.', 5],
  ['Beta release checklist', 'in_progress', 'high', maya, 7, 'Store listings, screenshots, test accounts and the rollout plan.', 6],
  ['Login with magic link', 'review', 'high', leo, 2, 'Email link sign-in with a 15 minute expiry.', 8],
  ['Fix keyboard covering inputs', 'todo', 'urgent', leo, -2, 'On small Android screens the keyboard hides the password field.', 3],
  ['Write release notes', 'todo', 'low', maya, 10, 'Short, plain-language notes for the store listing.', 2],
]);

const [, creatives, emails, landing] = tasks(campaign, ava, [
  ['Campaign brief', 'done', 'high', ava, -5, 'Goals, audience, budget and timeline signed off.', 16],
  ['Ad creatives', 'in_progress', 'high', zara, 6, 'Six static ads and two short videos in three sizes.', 10],
  ['Email sequence', 'todo', 'medium', priya, 10, 'Four emails: teaser, launch, reminder and last chance.', 8],
  ['Campaign landing page', 'review', 'urgent', zara, 1, 'Single page with offer, countdown and sign-up form.', 7],
  ['Budget tracking sheet', 'done', 'low', priya, -6, 'Daily spend per channel against plan.', 14],
  ['Social media calendar', 'todo', 'medium', priya, 4, 'Two posts a day across three networks for the launch week.', 5],
]);

tasks(tools, leo, [
  ['Refund lookup tool', 'in_progress', 'high', leo, 3, 'Search refunds by order number or email.', 9],
  ['Bulk user import', 'todo', 'medium', noah, 11, 'Upload a CSV and preview the rows before importing.', 6],
  ['Audit log viewer', 'done', 'medium', leo, -2, 'Filter by user, action and date.', 11],
  ['Slow query alerts', 'review', 'high', noah, 2, 'Post to the team channel when a query takes longer than 2 seconds.', 7],
]);

// Labels for each project, then labels and checklists on some tasks.
const labelIds = {};
function labels(projectId, list) {
  const p = docs.projects.find((x) => x._id === projectId);
  p.labels = list.map(([name, color]) => ({ id: next('labels'), name, color }));
  labelIds[projectId] = Object.fromEntries(p.labels.map((l) => [l.name, l.id]));
}
labels(web, [['Bug', 'red'], ['Design', 'purple'], ['Frontend', 'blue'], ['Content', 'amber'], ['SEO', 'green']]);
labels(mobile, [['Bug', 'red'], ['iOS', 'gray'], ['Android', 'green'], ['Release', 'orange']]);
labels(campaign, [['Email', 'blue'], ['Social', 'pink'], ['Paid ads', 'orange'], ['Creative', 'purple']]);
labels(tools, [['Support', 'teal'], ['Backend', 'blue']]);

/** Attach labels (by name) and checklist steps ([text, done]) to a seeded task. */
function decorate(taskId, { tags = [], steps = [] }) {
  const t = docs.tasks.find((x) => x._id === taskId);
  t.labelIds = tags.map((n) => labelIds[t.projectId][n]);
  t.checklist = steps.map(([text, done]) => ({ id: next('checklist'), text, done }));
}
decorate(hero, { tags: ['Design', 'Frontend'], steps: [['Final copy from marketing', true], ['Video compressed under 3 MB', true], ['Mobile layout below 900px', true], ['Hover and focus states', false], ['Lighthouse score above 90', false]] });
decorate(nav, { tags: ['Frontend'], steps: [['Desktop menu', true], ['Mobile menu', true], ['Keyboard navigation', false]] });
decorate(tokens, { tags: ['Design'], steps: [['Colours', true], ['Type scale', true], ['Spacing', true], ['Export to CSS variables', true]] });
decorate(seo, { tags: ['Content', 'SEO'] });
decorate(a11y, { tags: ['Bug', 'Frontend'], steps: [['Run axe on every template', false], ['Keyboard-only pass', false], ['Screen reader spot check', false]] });
decorate(perf, { tags: ['Frontend'], steps: [['Measure current LCP', true], ['Convert images to AVIF', true], ['Add Lighthouse to CI', false]] });
decorate(blog, { tags: ['Content', 'SEO'] });
decorate(offline, { tags: ['iOS', 'Android'], steps: [['Local write queue', true], ['Replay on reconnect', false], ['Conflict handling', false]] });
decorate(onboarding, { tags: ['iOS', 'Android'] });
decorate(push, { tags: ['iOS', 'Android'] });
decorate(release, { tags: ['Release'], steps: [['Store listing text', true], ['Screenshots', false], ['Test accounts for review', false], ['Staged rollout plan', false]] });
decorate(creatives, { tags: ['Creative', 'Paid ads'] });
decorate(emails, { tags: ['Email'], steps: [['Teaser', true], ['Launch', false], ['Reminder', false], ['Last chance', false]] });
decorate(landing, { tags: ['Creative'] });
for (const t of docs.tasks) { t.labelIds ??= []; t.checklist ??= []; }

// Comments and field-level history so task timelines look lived-in.
/** A notification for `userId` (never for the person who acted); anything older than a day counts as read. */
function notification(userId, actorId, type, projectId, taskId, text, minutesAgo) {
  if (!userId || userId === actorId) return;
  docs.notifications.push({
    _id: next('notifications'), userId, actorId, type, projectId, taskId, text,
    createdAt: ago(minutesAgo), readAt: minutesAgo > D ? ago(minutesAgo - 30) : null,
  });
}
for (const t of docs.tasks) {
  const created = (Date.now() - t.createdAt.getTime()) / 60000;
  if (t.assigneeId) notification(t.assigneeId, t.createdBy, 'assigned', t.projectId, t._id, t.title, created - 5);
}

const comment = (projectId, taskId, userId, body, minutesAgo) => {
  docs.comments.push({ _id: next('comments'), taskId, projectId, userId, body, createdAt: ago(minutesAgo), updatedAt: null });
  // Same rules as the API: @mentions get a "mention", the task's assignee and creator get a "comment".
  const t = docs.tasks.find((x) => x._id === taskId);
  const excerpt = body.length > 80 ? `${body.slice(0, 77)}…` : body;
  const mentioned = [...names].filter(([, n]) => body.toLowerCase().includes(`@${n.toLowerCase()}`)).map(([id]) => id);
  mentioned.forEach((u) => notification(u, userId, 'mention', projectId, taskId, excerpt, minutesAgo));
  [...new Set([t.assigneeId, t.createdBy])].filter((u) => u && !mentioned.includes(u)).forEach((u) => notification(u, userId, 'comment', projectId, taskId, excerpt, minutesAgo));
  activity(projectId, taskId, userId, 'comment.added', body.length > 80 ? `${body.slice(0, 77)}…` : body, minutesAgo);
};
comment(web, hero, maya, 'The video looks great. Can we make sure the headline still reads well on small phones?', 26 * H);
comment(web, hero, leo, 'Yes, it stacks under the video below 900px. Pushing a preview link this afternoon.', 25 * H);
comment(web, hero, zara, 'Preview looks good. One thing: the secondary button needs more contrast on hover.', 3 * H);
comment(web, tokens, maya, 'Can we try a slightly deeper primary blue? The current one feels a bit light on buttons.', 2 * D);
comment(web, tokens, zara, 'Updated to the deeper blue and checked contrast. Ready for review.', 30 * H);
comment(web, a11y, noah, 'Starting tomorrow. I will use the staging build.', 2 * D + 3 * H);
comment(web, a11y, noah, '@Maya Manager should the blog templates be part of this review too?', 40);
comment(web, perf, leo, 'Images were the main problem. Switching to AVIF cut 600 KB from the homepage.', 20 * H);
comment(web, nav, victor, 'Is the mobile menu going to include the search?', 8 * H);
comment(web, nav, leo, 'Not in the first version. It is in the backlog.', 7 * H);
comment(mobile, offline, maya, 'How are we handling edits made on two devices while offline?', 3 * D);
comment(mobile, offline, leo, 'Last write wins for now. Proper merging is a follow-up task.', 3 * D - 2 * H);
comment(mobile, onboarding, noah, 'Tested on three Android devices. The permissions screen skips on Android 14, filed a bug.', 18 * H);
comment(mobile, release, leo, 'Store screenshots need the new onboarding, so this waits on that review.', 5 * H);
comment(campaign, creatives, ava, 'Love the direction. Can we get a version without the price for the teaser week?', 22 * H);
comment(campaign, landing, priya, 'Form is connected to the email tool. Countdown needs the final launch time.', 4 * H);

activity(web, tokens, zara, 'task.updated', 'priority: Medium → High', 4 * D);
activity(web, hero, maya, 'task.updated', 'priority: High → Urgent', 2 * D);
activity(web, hero, maya, 'task.updated', `due date: ${fmt(day(4))} → ${fmt(day(1))}`, 2 * D - 30);
activity(web, seo, maya, 'task.assigned', 'Unassigned', 3 * D);
activity(mobile, push, maya, 'task.updated', 'priority: Medium → High', 4 * D);
activity(campaign, emails, ava, 'task.updated', 'description', 2 * D);
activity(web, blog, noah, 'task.updated', 'title: Move blog posts → Migrate blog posts', 6 * D);
activity(mobile, settings, noah, 'task.updated', `due date: none → ${fmt(day(15))}`, 4 * D);

// Project chat, oldest first so message ids follow time. @mentions notify like the API does.
const chat = (projectId, userId, body, minutesAgo) => {
  docs.messages.push({ _id: next('messages'), projectId, userId, body, createdAt: ago(minutesAgo), editedAt: null });
  const mentioned = [...names].filter(([, n]) => body.toLowerCase().includes(`@${n.toLowerCase()}`)).map(([id]) => id);
  mentioned.forEach((u) => notification(u, userId, 'chat', projectId, null, body, minutesAgo));
};
chat(web, maya, 'Morning all. Goal for this week: hero, navigation and design tokens in review by Friday.', 2 * D + 2 * H);
chat(web, zara, 'Tokens are nearly there. I will share the updated colour scale after lunch.', 2 * D + H);
chat(web, leo, 'Hero video is in. It is about 2 MB, so I will lazy-load it below the fold on mobile.', 2 * D);
chat(web, noah, 'I will start the accessibility pass on staging tomorrow morning.', 30 * H);
chat(web, maya, 'Thanks Noah. Please include keyboard navigation for the new menu.', 29 * H);
chat(web, zara, 'Updated colour scale is on the tokens task. The primary blue is a touch deeper now.', 26 * H);
chat(web, leo, 'Performance check: homepage is down to 1.4 s on 4G after switching images to AVIF.', 20 * H);
chat(web, maya, 'Great work. @Leo Developer can you post the before and after numbers on the performance task?', 19 * H);
chat(web, leo, 'Done, added them as a comment.', 18 * H);
chat(web, noah, 'Found two contrast issues on the footer links, filing them on the accessibility review.', 70);
chat(web, zara, '@Maya Manager the new footer design is ready whenever you have five minutes to look.', 25);
chat(mobile, leo, 'Offline sync is working on iOS. Android build next.', 3 * D);
chat(mobile, maya, 'Nice. Are we still on track for the beta at the end of the month?', 3 * D - H);
chat(mobile, leo, 'Yes, as long as onboarding review lands this week.', 3 * D - 2 * H);
chat(mobile, noah, 'Heads up: Android 14 skips the permissions screen. Bug is on the onboarding task.', 18 * H);
chat(mobile, zara, 'I can adjust the onboarding screens tomorrow if the flow changes.', 16 * H);
chat(campaign, ava, 'Kick-off notes are in the project description. Teaser week starts in two weeks.', 5 * D);
chat(campaign, priya, 'Landing page form is connected. Waiting on the final launch time for the countdown.', 4 * H);
chat(tools, leo, 'The refund lookup tool is live for the support team. Feedback welcome here.', 2 * D);
chat(tools, noah, 'Tested it with ten real tickets, all good.', 30 * H);

// Everyone has read their project chats up to an hour and a half ago (and their own messages), so recent ones show as unread.
for (const p of docs.projects) {
  const msgs = docs.messages.filter((m) => m.projectId === p._id);
  for (const { userId } of p.members) {
    const seen = msgs.filter((m) => m.userId === userId || m.createdAt < ago(90)).map((m) => m._id);
    if (seen.length) docs.chatReads.push({ _id: `${p._id}:${userId}`, projectId: p._id, userId, lastReadId: Math.max(...seen) });
  }
}

// No MONGODB_URI and nothing on the local port? Start the embedded server just for seeding.
let embedded = null;
if (!process.env.MONGODB_URI && !(await portInUse())) {
  console.log('No MongoDB running; starting the embedded one for seeding…');
  embedded = await startEmbedded();
}
await connectDb(undefined, { retries: 15 });
await Promise.all(Object.values(models).map((m) => m.deleteMany({})));
await User.insertMany(docs.users);
await Team.insertMany(docs.teams);
await Project.insertMany(docs.projects);
await Task.insertMany(docs.tasks);
await Comment.insertMany(docs.comments);
await Activity.insertMany(docs.activities);
await Notification.insertMany(docs.notifications);
await ChatMessage.insertMany(docs.messages);
await ChatRead.insertMany(docs.chatReads);
// Continue numbering after the seeded ids.
await Counter.bulkWrite(Object.entries(ids).map(([_id, seq]) => ({ updateOne: { filter: { _id }, update: { $set: { seq } }, upsert: true } })));
await disconnectDb();
if (embedded) await stopEmbedded(embedded);

console.log(`Seeded ${docs.users.length} users, ${docs.teams.length} teams, ${docs.projects.length} projects, ${docs.tasks.length} tasks, ${docs.comments.length} comments, ${docs.activities.length} history entries, ${docs.notifications.length} notifications, ${docs.messages.length} chat messages.`);
console.log('Sign in with admin@taskflow.dev / password123 (also maya@, leo@, zara@, victor@, noah@, priya@taskflow.dev)');
