// Spaced-repetition scheduler based on the FSRS-4.5 memory model
// (Free Spaced Repetition Scheduler, Ye et al.). Each card tracks
//   stability  S — days until recall probability decays to 90%
//   difficulty D — 1..10, how hard the item is for this learner
// Ratings: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
//
// New and lapsed cards first go through short "learning steps" (minutes) so
// that the first retrievals happen while the memory trace is fresh — the
// classic Ebbinghaus/Pimsleur expanding-interval idea — then graduate to
// day-scale intervals computed from S and the desired retention.

export const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const MINUTE = 60_000;
const DAY = 86_400_000;

export const LEARNING_STEPS_MIN = [1, 10];
export const RELEARNING_STEPS_MIN = [10];
export const MAX_INTERVAL_DAYS = 365;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

export function intervalFor(stability, retention = 0.9) {
  const days = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(days), 1, MAX_INTERVAL_DAYS);
}

const initStability = (g) => Math.max(W[g - 1], 0.1);
const initDifficulty = (g) => clamp(W[4] - (g - 3) * W[5], 1, 10);

function nextDifficulty(d, g) {
  const next = d - W[6] * (g - 3);
  return clamp(W[7] * initDifficulty(3) + (1 - W[7]) * next, 1, 10);
}

function recallStability(d, s, r, g) {
  const hardPenalty = g === 2 ? W[15] : 1;
  const easyBonus = g === 4 ? W[16] : 1;
  return (
    s *
    (Math.exp(W[8]) *
      (11 - d) *
      Math.pow(s, -W[9]) *
      (Math.exp(W[10] * (1 - r)) - 1) *
      hardPenalty *
      easyBonus +
      1)
  );
}

function forgetStability(d, s, r) {
  const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(sf, s);
}

// Short-term (same-day) stability update used during learning steps
// (FSRS-5: S' = S · e^{w17·(G − 3 + w18)}).
const W17 = 0.5425;
const W18 = 0.0912;
function shortTermStability(s, g) {
  return Math.max(0.1, s * Math.exp(W17 * (g - 3 + W18)));
}

/**
 * A card state:
 * { state: 'new'|'learning'|'review'|'relearning', step, stability, difficulty,
 *   due (ms), last_review (ms|null), reps, lapses }
 */
export function newCardState(now = Date.now()) {
  return {
    state: 'new',
    step: 0,
    stability: 0,
    difficulty: 0,
    due: now,
    last_review: null,
    reps: 0,
    lapses: 0,
  };
}

/** Returns the next card state after answering with `grade` at time `now`. */
export function schedule(card, grade, now = Date.now(), retention = 0.9) {
  if (![1, 2, 3, 4].includes(grade)) throw new Error('grade must be 1..4');
  const c = { ...card };
  const elapsedDays = c.last_review != null ? Math.max(0, (now - c.last_review) / DAY) : 0;
  c.reps += 1;

  if (c.state === 'new') {
    c.stability = initStability(grade);
    c.difficulty = initDifficulty(grade);
    if (grade === 4) return graduate(c, now, retention, true);
    c.state = 'learning';
    c.step = grade === 1 ? 0 : grade === 2 ? 0 : 1;
    if (c.step >= LEARNING_STEPS_MIN.length) return graduate(c, now, retention);
    c.due = now + stepDelay(LEARNING_STEPS_MIN, c.step, grade);
    c.last_review = now;
    return c;
  }

  if (c.state === 'learning' || c.state === 'relearning') {
    const steps = c.state === 'learning' ? LEARNING_STEPS_MIN : RELEARNING_STEPS_MIN;
    c.difficulty = nextDifficulty(c.difficulty, grade);
    c.stability = shortTermStability(c.stability, grade);
    if (grade === 4) return graduate(c, now, retention, true);
    if (grade === 1) c.step = 0;
    else if (grade === 3) c.step += 1;
    if (c.step >= steps.length) return graduate(c, now, retention);
    c.due = now + stepDelay(steps, c.step, grade);
    c.last_review = now;
    return c;
  }

  // review state
  const r = retrievability(elapsedDays, c.stability);
  c.difficulty = nextDifficulty(c.difficulty, grade);
  if (grade === 1) {
    c.lapses += 1;
    c.stability = forgetStability(c.difficulty, c.stability, r);
    c.state = 'relearning';
    c.step = 0;
    c.due = now + RELEARNING_STEPS_MIN[0] * MINUTE;
    c.last_review = now;
    return c;
  }
  c.stability = recallStability(c.difficulty, c.stability, r, grade);
  return graduate(c, now, retention, false, true);
}

function stepDelay(steps, step, grade) {
  const base = steps[Math.min(step, steps.length - 1)];
  // "Hard" on a step repeats it at 1.5x (capped by next step) to add a little spacing.
  if (grade === 2) {
    const next = steps[step + 1] ?? base * 1.5;
    return Math.min(base * 1.5, next) * MINUTE;
  }
  return base * MINUTE;
}

function graduate(c, now, retention, easy = false, fromReview = false) {
  let days = intervalFor(c.stability, retention);
  if (!fromReview && easy) days = Math.max(days, 4);
  c.state = 'review';
  c.step = 0;
  c.due = now + days * DAY;
  c.last_review = now;
  return c;
}

/** Human-readable preview of the interval each grade would produce. */
export function previewIntervals(card, now = Date.now(), retention = 0.9) {
  const out = {};
  for (const g of [1, 2, 3, 4]) {
    out[g] = formatInterval(schedule(card, g, now, retention).due - now);
  }
  return out;
}

export function formatInterval(ms) {
  const min = Math.round(ms / MINUTE);
  if (min < 60) return `${Math.max(1, min)}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(ms / DAY);
  if (d < 30) return `${d}d`;
  const mo = d / 30;
  if (mo < 12) return `${mo.toFixed(mo < 3 ? 1 : 0)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

/** A word is considered "known" once its recognition card is mature-ish. */
export const KNOWN_STABILITY_DAYS = 7;
export const MATURE_STABILITY_DAYS = 21;
