import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  atLeast, dayLabel, dueInfo, groupMessages, initials, mentionQuery, nextLabelColor, parseChange, pct, plural, splitLinks, splitMentions,
  timeAgo, todayISO, typingText, fmtDuration, toWaveform,
} from './utils';
import { ApiError } from './api';

describe('dueInfo', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T10:00:00')); });
  afterEach(() => vi.useRealTimers());

  test('labels today, tomorrow and yesterday', () => {
    expect(todayISO()).toBe('2026-10-06');
    expect(dueInfo('2026-10-06', 'todo')).toMatchObject({ label: 'Today', state: 'today' });
    expect(dueInfo('2026-10-07', 'todo')).toMatchObject({ label: 'Tomorrow', state: 'soon' });
    expect(dueInfo('2026-10-05', 'todo')).toMatchObject({ label: 'Yesterday', state: 'overdue' });
  });

  test('marks overdue only for unfinished tasks', () => {
    expect(dueInfo('2026-09-01', 'in_progress').state).toBe('overdue');
    expect(dueInfo('2026-09-01', 'done').state).toBe('done');
    expect(dueInfo('2026-10-30', 'todo')).toMatchObject({ label: 'Oct 30', state: 'later' });
    expect(dueInfo(null, 'todo')).toBeNull();
  });

  test('shows the year for dates in another year', () => {
    expect(dueInfo('2027-01-15', 'todo').label).toBe('Jan 15, 2027');
  });
});

describe('timeAgo', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  test('reads ISO timestamps from the API', () => {
    expect(timeAgo('2026-10-06T11:30:00.000Z')).toBe('30m ago');
    expect(timeAgo('2026-10-04T12:00:00.000Z')).toBe('2d ago');
  });

  test('also reads zone-less UTC timestamps', () => {
    expect(timeAgo('2026-10-06 11:59:50')).toBe('just now');
    expect(timeAgo('2026-10-06 11:30:00')).toBe('30m ago');
    expect(timeAgo('2026-10-06 07:00:00')).toBe('5h ago');
    expect(timeAgo('2026-10-03 12:00:00')).toBe('3d ago');
  });
});

describe('parseChange', () => {
  test('splits "field: from → to" history details', () => {
    expect(parseChange('priority: Medium → High')).toEqual({ field: 'priority', from: 'Medium', to: 'High' });
    expect(parseChange('due date: none → Oct 9, 2026')).toEqual({ field: 'due date', from: 'none', to: 'Oct 9, 2026' });
    expect(parseChange('description')).toBeNull();
  });
});

describe('roles', () => {
  test('project role hierarchy', () => {
    expect(atLeast('owner', 'manager')).toBe(true);
    expect(atLeast('manager', 'member')).toBe(true);
    expect(atLeast('member', 'manager')).toBe(false);
    expect(atLeast('viewer', 'member')).toBe(false);
    expect(atLeast(undefined, 'viewer')).toBe(false);
  });
});

describe('small helpers', () => {
  test('pct, plural and initials', () => {
    expect(pct(3, 12)).toBe(25);
    expect(pct(1, 0)).toBe(0);
    expect(plural(1, 'task')).toBe('1 task');
    expect(plural(2, 'person', 'people')).toBe('2 people');
    expect(initials('Maya Manager')).toBe('MM');
    expect(initials('Cher')).toBe('C');
  });

  test('ApiError exposes the first message per field', () => {
    const e = new ApiError(400, 'Validation failed', { title: ['Title is required', 'Too short'], dueDate: ['Use YYYY-MM-DD'] });
    expect(e.fields).toEqual({ title: 'Title is required', dueDate: 'Use YYYY-MM-DD' });
    expect(new ApiError(500, 'x').fields).toEqual({});
  });
});

describe('mentions', () => {
  const members = [{ id: 1, name: 'Maya Manager' }, { id: 2, name: 'Noah' }, { id: 3, name: 'J. Smith (QA)' }];

  test('splitMentions highlights members only, case-insensitively, longest name first', () => {
    expect(splitMentions('Thanks @maya manager and @Noah!', members)).toEqual([
      { text: 'Thanks ' }, { text: '@maya manager', mention: true }, { text: ' and ' }, { text: '@Noah', mention: true }, { text: '!' },
    ]);
    expect(splitMentions('ping @Nobody', members)).toEqual([{ text: 'ping @Nobody' }]);
    expect(splitMentions('cc @J. Smith (QA)', members)[1]).toEqual({ text: '@J. Smith (QA)', mention: true });
    expect(splitMentions('no members', [])).toEqual([{ text: 'no members' }]);
  });

  test('mentionQuery finds the name being typed before the caret', () => {
    expect(mentionQuery('hello @ma')).toBe('ma');
    expect(mentionQuery('@')).toBe('');
    expect(mentionQuery('hi @Maya Ma')).toBe('Maya Ma');
    expect(mentionQuery('mail me at a@b.com')).toBeNull();
    expect(mentionQuery('done @Maya Manager and')).toBeNull();
  });
});

describe('nextLabelColor', () => {
  test('picks a colour not used yet, never grey first, and cycles when all are taken', () => {
    expect(nextLabelColor([])).toBe('red');
    expect(nextLabelColor([{ color: 'red' }, { color: 'orange' }])).toBe('amber');
    const all = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink'].map((color) => ({ color }));
    expect(nextLabelColor(all)).not.toBe('gray');
  });
});

describe('chat helpers', () => {
  const at = (iso) => new Date(iso).toISOString();
  const msg = (id, userId, iso, extra = {}) => ({ id, user: { id: userId, name: `U${userId}` }, created_at: at(iso), ...extra });

  test('dayLabel says Today, Yesterday, or the weekday and date', () => {
    const now = new Date('2026-10-08T15:00:00');
    expect(dayLabel(at('2026-10-08T08:00:00'), now)).toBe('Today');
    expect(dayLabel(at('2026-10-07T23:59:00'), now)).toBe('Yesterday');
    expect(dayLabel(at('2026-10-05T10:00:00'), now)).toBe('Monday, October 5');
    expect(dayLabel(at('2025-12-31T10:00:00'), now)).toBe('Wednesday, December 31, 2025');
  });

  test('groupMessages adds day and "New" dividers and compacts quick follow-ups', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T15:00:00'));
    const items = groupMessages([
      msg(1, 1, '2026-10-07T10:00:00'),
      msg(2, 1, '2026-10-07T10:03:00'), // same person within 5 minutes
      msg(3, 1, '2026-10-07T10:20:00'), // same person, later
      msg(4, 2, '2026-10-08T09:00:00'), // new day, unread
      msg(5, 3, '2026-10-08T09:01:00'),
    ], { lastReadId: 3, meId: 1 });
    vi.useRealTimers();
    expect(items.map((i) => (i.type === 'message' ? `${i.m.id}${i.compact ? 'c' : ''}` : i.type === 'day' ? i.label : 'NEW')))
      .toEqual(['Yesterday', '1', '2c', '3', 'Today', 'NEW', '4', '5']);
  });

  test('groupMessages never puts the "New" divider before your own messages', () => {
    const items = groupMessages([msg(1, 1, '2026-10-08T09:00:00'), msg(2, 2, '2026-10-08T09:01:00')], { lastReadId: 0, meId: 1 });
    expect(items.findIndex((i) => i.type === 'new')).toBe(items.findIndex((i) => i.m?.id === 2) - 1);
  });

  test('splitLinks finds links and leaves trailing punctuation out', () => {
    expect(splitLinks('See https://example.com/a?b=1, then reply.')).toEqual([
      { text: 'See ' }, { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' }, { text: ', then reply.' },
    ]);
    expect(splitLinks('no links here')).toEqual([{ text: 'no links here' }]);
    expect(splitLinks('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }]);
  });

  test('typingText', () => {
    expect(typingText([])).toBe('');
    expect(typingText(['Leo'])).toBe('Leo is typing…');
    expect(typingText(['Leo', 'Zara'])).toBe('Leo and Zara are typing…');
    expect(typingText(['Leo', 'Zara', 'Noah'])).toBe('Several people are typing…');
  });
});

describe('voice helpers', () => {
  test('fmtDuration', () => {
    expect(fmtDuration(0)).toBe('0:00');
    expect(fmtDuration(7.9)).toBe('0:07');
    expect(fmtDuration(75)).toBe('1:15');
    expect(fmtDuration(undefined)).toBe('0:00');
  });

  test('toWaveform scales the loudest bar to 100 and keeps quiet bars visible', () => {
    const w = toWaveform([0, 0.1, 0.5, 0.25, 0.05, 0], 3);
    expect(w).toEqual([20, 100, 10]);
    expect(toWaveform([], 4)).toEqual([10, 10, 10, 10]);
    expect(toWaveform(Array.from({ length: 500 }, (_, i) => (i % 50) / 50), 40)).toHaveLength(40);
  });
});
