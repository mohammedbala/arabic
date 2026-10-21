import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, newCardState, retrievability, intervalFor, formatInterval } from '../server/core/srs.js';
import { buildPlan, LESSONS } from '../server/core/curriculum.js';

const DAY = 86_400_000;
const MIN = 60_000;
const t0 = Date.UTC(2026, 0, 1);

test('retrievability is 90% after S days and decays monotonically', () => {
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
  assert.equal(retrievability(0, 5), 1);
  assert.ok(retrievability(20, 10) < retrievability(10, 10));
  assert.equal(intervalFor(10, 0.9), 10);
  assert.ok(intervalFor(10, 0.95) < 10);
});

test('new card: Good enters learning step, second Good graduates to days', () => {
  let c = schedule(newCardState(t0), 3, t0);
  assert.equal(c.state, 'learning');
  assert.equal(c.due - t0, 10 * MIN);
  c = schedule(c, 3, t0 + 10 * MIN);
  assert.equal(c.state, 'review');
  assert.ok(c.due - (t0 + 10 * MIN) >= DAY);
});

test('Again restarts learning; Easy graduates immediately', () => {
  const again = schedule(newCardState(t0), 1, t0);
  assert.equal(again.state, 'learning');
  assert.equal(again.due - t0, MIN);
  const easy = schedule(newCardState(t0), 4, t0);
  assert.equal(easy.state, 'review');
  assert.ok(easy.due - t0 >= 4 * DAY);
});

test('successful reviews grow intervals; a lapse shrinks stability and relearns', () => {
  let c = schedule(newCardState(t0), 4, t0);
  let now = c.due;
  const intervals = [];
  for (let i = 0; i < 3; i++) {
    const before = now;
    c = schedule(c, 3, now);
    intervals.push(c.due - before);
    now = c.due;
  }
  for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i] > intervals[i - 1], 'intervals expand');
  const s = c.stability;
  const lapsed = schedule(c, 1, now);
  assert.equal(lapsed.state, 'relearning');
  assert.equal(lapsed.lapses, 1);
  assert.ok(lapsed.stability < s);
});

test('difficulty stays within 1..10 under repeated grading', () => {
  let c = newCardState(t0);
  let now = t0;
  for (let i = 0; i < 30; i++) {
    c = schedule(c, i % 3 === 0 ? 1 : 2, now);
    now = c.due;
    assert.ok(c.difficulty >= 1 && c.difficulty <= 10);
    assert.ok(c.stability > 0);
  }
});

test('rejects invalid grades', () => {
  assert.throws(() => schedule(newCardState(t0), 5, t0));
});

test('formatInterval', () => {
  assert.equal(formatInterval(10 * MIN), '10m');
  assert.equal(formatInterval(3 * DAY), '3d');
});

test('plan spreads the 1000 core words over the target', () => {
  const p = buildPlan({ totalWords: 1662, introduced: 0, startedAt: t0, targetDays: 42, now: t0 });
  assert.equal(p.newPerDay, Math.ceil(1000 / 42));
  assert.equal(p.currentWeek, 1);
  assert.equal(p.weeks.length, 6);
  assert.equal(p.weeks[5].wordTarget, 1000);
  const late = buildPlan({ totalWords: 1662, introduced: 1000, startedAt: t0, targetDays: 42, now: t0 + 41 * DAY });
  assert.equal(late.newPerDay, 15);
  assert.equal(late.currentWeek, 6);
  const done = buildPlan({ totalWords: 1662, introduced: 1662, startedAt: t0, targetDays: 42, now: t0 });
  assert.equal(done.newPerDay, 0);
});

test('every lesson quiz has a valid answer index', () => {
  for (const l of LESSONS) {
    assert.ok(l.quiz.length > 0, l.id);
    for (const q of l.quiz) assert.ok(q.answer >= 0 && q.answer < q.options.length, `${l.id}: ${q.q}`);
  }
});
