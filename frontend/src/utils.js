/* Shared constants and formatting helpers. */

export const STATUSES = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));
export const STATUS_COLOR = { todo: '#98a2b3', in_progress: '#2563eb', review: '#f79009', done: '#12b76a' };

export const PRIORITIES = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.key, p.label]));
export const PRIORITY_COLOR = { urgent: '#f04438', high: '#f79009', medium: '#2e90fa', low: '#98a2b3' };

export const PROJECT_ROLES = {
  owner: { label: 'Owner', desc: 'Full control, including deleting the project.' },
  manager: { label: 'Manager', desc: 'Edits the project, manages members and deletes tasks.' },
  member: { label: 'Member', desc: 'Creates, edits and moves tasks, and comments.' },
  viewer: { label: 'Viewer', desc: 'Read-only access to tasks, comments and history.' },
};
const RANK = { viewer: 1, member: 2, manager: 3, owner: 4 };
export const atLeast = (role, min) => (RANK[role] || 0) >= RANK[min];
export const ROLE_BADGE = { owner: 'badge-blue', manager: 'badge-blue', member: 'badge-green', viewer: '', lead: 'badge-blue', admin: 'badge-amber' };

/* ---------- Dates ---------- */
export const todayISO = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const localDate = (d) => new Date(`${d}T00:00:00`);
/** API timestamps are ISO 8601 UTC; older "YYYY-MM-DD HH:MM:SS" UTC strings are accepted too. */
export const parseTs = (s) => new Date(s && !s.includes('T') ? `${s.replace(' ', 'T')}Z` : s);

export function fmtDate(d, { year } = {}) {
  if (!d) return '';
  const date = localDate(d);
  const showYear = year ?? date.getFullYear() !== new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}) });
}

export const fmtDateTime = (ts) => parseTs(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function timeAgo(ts) {
  if (!ts) return '';
  const s = (Date.now() - parseTs(ts).getTime()) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return parseTs(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Due-date presentation: label ("Today", "Oct 9") and urgency state. */
export function dueInfo(due, status) {
  if (!due) return null;
  const days = Math.round((localDate(due) - localDate(todayISO())) / 864e5);
  const label = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday' : fmtDate(due);
  const state = status === 'done' ? 'done' : days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 3 ? 'soon' : 'later';
  return { label, state, days };
}
export const isOverdue = (t) => dueInfo(t.due_date, t.status)?.state === 'overdue';

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/* ---------- People & colours ---------- */
export const initials = (n = '?') => n.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const hash = (s = '') => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const AVATAR_COLORS = [
  ['#dbe6fe', '#1e40af'], ['#d1fadf', '#05603a'], ['#fdead7', '#b93815'], ['#ebe9fe', '#5925dc'],
  ['#fce7f6', '#c11574'], ['#d1e9ff', '#175cd3'], ['#fef0c7', '#93370d'], ['#ccfbef', '#107569'],
];
export const avatarColors = (name) => AVATAR_COLORS[hash(name) % AVATAR_COLORS.length];
const PROJECT_COLORS = ['#2563eb', '#12b76a', '#f79009', '#7a5af8', '#ee46bc', '#06aed4', '#ef6820', '#0e9384'];
export const projectColor = (id) => PROJECT_COLORS[(Number(id) || 0) % PROJECT_COLORS.length];

/* ---------- Misc ---------- */
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const taskKey = (id) => `T-${id}`;

/** Parse "field: from → to" history details. */
export function parseChange(details = '') {
  const m = /^([^:]+): (.*) → (.*)$/s.exec(details);
  return m ? { field: m[1], from: m[2], to: m[3] } : null;
}

/* ---------- Labels ---------- */
export const LABEL_COLORS = {
  gray: { bg: '#f2f4f7', fg: '#344054', dot: '#98a2b3' },
  red: { bg: '#fef3f2', fg: '#b42318', dot: '#f04438' },
  orange: { bg: '#fef6ee', fg: '#b93815', dot: '#ef6820' },
  amber: { bg: '#fffaeb', fg: '#b54708', dot: '#f79009' },
  green: { bg: '#ecfdf3', fg: '#067647', dot: '#12b76a' },
  teal: { bg: '#f0fdf9', fg: '#107569', dot: '#15b79e' },
  blue: { bg: '#eff4ff', fg: '#1e40af', dot: '#2e90fa' },
  purple: { bg: '#f4f3ff', fg: '#5925dc', dot: '#7a5af8' },
  pink: { bg: '#fdf2fa', fg: '#c11574', dot: '#ee46bc' },
};
export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS);
/** A colour for a new label that isn't used yet in the project (cycles when all are taken). */
export const nextLabelColor = (labels) => LABEL_COLOR_KEYS.find((c) => c !== 'gray' && !labels.some((l) => l.color === c))
  || LABEL_COLOR_KEYS[(labels.length % (LABEL_COLOR_KEYS.length - 1)) + 1];

/* ---------- Mentions ---------- */
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Split comment text into plain parts and "@Full Name" mentions of known members. */
export function splitMentions(text, members = []) {
  const names = members.map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return [{ text }];
  const rx = new RegExp(`@(${names.map(escapeRx).join('|')})`, 'gi');
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(rx)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], mention: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
/** The "@partial name" being typed right before the caret, or null. */
export function mentionQuery(textBeforeCaret) {
  const m = /(?:^|\s)@([^\s@]*(?: [^\s@]*)?)$/.exec(textBeforeCaret);
  return m ? m[1] : null;
}

/* ---------- Chat ---------- */
export const fmtTime = (ts) => parseTs(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** "Today", "Yesterday", "Monday, October 6" (with the year when it isn't this year). */
export function dayLabel(ts, now = new Date()) {
  const d = parseTs(ts);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

/**
 * Lay out a chat: day dividers, a "New" divider before the first unread message from someone else,
 * and "compact" rows for follow-up messages by the same person within 5 minutes.
 */
export function groupMessages(messages, { lastReadId = null, meId = null } = {}) {
  const out = [];
  let prev = null;
  let day = null;
  let newShown = false;
  for (const m of messages) {
    const label = dayLabel(m.created_at);
    let divider = false;
    if (label !== day) { out.push({ type: 'day', key: `day-${label}`, label }); day = label; divider = true; }
    if (!newShown && lastReadId != null && !m.pending && m.id > lastReadId && m.user?.id !== meId) {
      out.push({ type: 'new', key: 'new' });
      newShown = true;
      divider = true;
    }
    const compact = !divider && !!prev && prev.user?.id === m.user?.id
      && parseTs(m.created_at) - parseTs(prev.created_at) < 5 * 60000;
    out.push({ type: 'message', key: m.client_id || m.id, m, compact });
    prev = m;
  }
  return out;
}

/** Split text into plain parts and http(s) links. Trailing punctuation stays outside the link. */
export function splitLinks(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+[^\s<>".,:;!?)\]'’]/g)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], href: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** "Leo is typing…", "Leo and Zara are typing…", "Several people are typing…" */
export function typingText(names) {
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}

/* ---------- Voice messages ---------- */
/** 75 → "1:15" */
export const fmtDuration = (seconds) => {
  const t = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Squash loudness samples (0–1) into `bars` levels from 0 to 100, scaled so the loudest bar is 100. */
export function toWaveform(samples, bars = 40) {
  if (!samples.length) return Array(bars).fill(10);
  const out = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * samples.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / bars));
    out.push(Math.max(...samples.slice(from, to)));
  }
  const peak = Math.max(...out) || 1;
  return out.map((v) => Math.max(8, Math.round((v / peak) * 100)));
}
