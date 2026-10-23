import { tx } from './schema.js';
import { schedule, newCardState, previewIntervals, KNOWN_STABILITY_DAYS, MATURE_STABILITY_DAYS } from './srs.js';
import { buildPlan, LESSONS, lessonById } from './curriculum.js';
import { present } from './vocab-core.js';

const DAY = 86_400_000;
// Learning-step cards due within this window are shown now rather than making
// the learner wait out a 1–10 minute step (Anki's "learn ahead limit").
export const LEARN_AHEAD_MS = 20 * 60_000;

export const XP = { newWord: 15, reviewCorrect: 10, reviewAgain: 2, drillCorrect: 3, gameCorrect: 2, gameWin: 20, lessonBase: 40, lessonPerPoint: 5 };

/** 'YYYY-MM-DD' in the user's local time zone. */
export function localDay(user, ts = Date.now()) {
  return new Date(ts + (user.tz_offset_min || 0) * 60_000).toISOString().slice(0, 10);
}

function bumpActivity(db, user, fields, ts = Date.now()) {
  const day = localDay(user, ts);
  const cols = Object.keys(fields);
  db.prepare(
    `INSERT INTO activity (user_id, day, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})
     ON CONFLICT(user_id, day) DO UPDATE SET ${cols.map((c) => `${c} = ${c} + excluded.${c}`).join(', ')}`,
  ).run(user.id, day, ...cols.map((c) => fields[c]));
}

export function logEvent(db, userId, kind, data = {}, ts = Date.now()) {
  db.prepare('INSERT INTO events (user_id, kind, data, ts) VALUES (?, ?, ?, ?)').run(userId, kind, JSON.stringify(data), ts);
}

const cardRow = (db, userId, wordId, dir) =>
  db.prepare('SELECT * FROM cards WHERE user_id = ? AND word_id = ? AND direction = ?').get(userId, wordId, dir);

function introducedCount(db, userId) {
  return db.prepare("SELECT COUNT(*) n FROM cards WHERE user_id = ? AND direction = 'r'").get(userId).n;
}

function introducedToday(db, user, now) {
  return db.prepare('SELECT new_words n FROM activity WHERE user_id = ? AND day = ?').get(user.id, localDay(user, now))?.n ?? 0;
}

export function planFor(db, vocab, user, now = Date.now()) {
  return buildPlan({
    totalWords: vocab.words.length,
    introduced: introducedCount(db, user.id),
    startedAt: user.started_at,
    targetDays: user.target_days,
    now,
  });
}

/**
 * The study queue: due reviews first (learning cards whose step is up, then
 * day-scale reviews), followed by today's allowance of new words in
 * frequency rank order.
 */
export function getQueue(db, vocab, user, { limit = 50, now = Date.now() } = {}) {
  const plan = planFor(db, vocab, user, now);
  const due = db
    .prepare(
      `SELECT * FROM cards WHERE user_id = ? AND (due <= ? OR (state IN ('learning','relearning') AND due <= ?))
       ORDER BY CASE state WHEN 'learning' THEN 0 WHEN 'relearning' THEN 0 ELSE 1 END, due LIMIT ?`,
    )
    .all(user.id, now, now + LEARN_AHEAD_MS, limit);
  const dueTotal = db
    .prepare("SELECT COUNT(*) n FROM cards WHERE user_id = ? AND (due <= ? OR (state IN ('learning','relearning') AND due <= ?))")
    .get(user.id, now, now + LEARN_AHEAD_MS).n;
  const nextLearning = db
    .prepare("SELECT MIN(due) d FROM cards WHERE user_id = ? AND due > ? AND state IN ('learning','relearning','new')")
    .get(user.id, now + LEARN_AHEAD_MS).d;

  const allowance = Math.max(0, plan.newPerDay - introducedToday(db, user, now));
  const known = new Set(
    db.prepare("SELECT word_id FROM cards WHERE user_id = ? AND direction = 'r'").all(user.id).map((r) => r.word_id),
  );
  const fresh = [];
  for (const w of vocab.byRank) {
    if (fresh.length >= allowance) break;
    if (!known.has(w.id)) fresh.push(w);
  }

  const items = due.map((c) => ({
    kind: 'review',
    direction: c.direction,
    state: c.state,
    word: present(vocab.byId.get(c.word_id), user.dialect),
    intervals: previewIntervals(c, now, user.retention),
  }));
  for (const w of fresh) {
    items.push({
      kind: 'new',
      direction: 'r',
      state: 'new',
      word: present(w, user.dialect),
      intervals: previewIntervals(newCardState(now), now, user.retention),
    });
  }
  return {
    items: items.filter((i) => i.word).slice(0, limit),
    counts: { due: dueTotal, new: fresh.length, newAllowance: allowance },
    nextLearningAt: nextLearning ?? null,
    plan,
  };
}

/** Grades one card. Creates the card for a brand-new word. Returns rewards. */
export function answerCard(db, vocab, user, { wordId, direction = 'r', grade, msTaken = null, now = Date.now() }) {
  const word = vocab.byId.get(wordId);
  if (!word) throw httpError(404, 'Unknown word');
  if (!['r', 'p'].includes(direction)) throw httpError(400, 'Bad direction');
  grade = Number(grade);
  if (![1, 2, 3, 4].includes(grade)) throw httpError(400, 'Grade must be 1–4');
  const ms = msTaken == null ? null : Math.max(0, Math.min(Number(msTaken) || 0, 120_000));

  return tx(db, () => {
    const existing = cardRow(db, user.id, wordId, direction);
    if (!existing && direction === 'p') throw httpError(400, 'Production card not unlocked yet');
    const isNewWord = !existing;
    const before = existing ?? { ...newCardState(now) };
    const after = schedule(before, grade, now, user.retention);

    if (existing) {
      db.prepare(
        `UPDATE cards SET state=?, step=?, stability=?, difficulty=?, due=?, last_review=?, reps=?, lapses=?
         WHERE user_id=? AND word_id=? AND direction=?`,
      ).run(after.state, after.step, after.stability, after.difficulty, after.due, after.last_review, after.reps, after.lapses, user.id, wordId, direction);
    } else {
      db.prepare(
        `INSERT INTO cards (user_id, word_id, direction, state, step, stability, difficulty, due, last_review, reps, lapses, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(user.id, wordId, direction, after.state, after.step, after.stability, after.difficulty, after.due, after.last_review, after.reps, after.lapses, now);
    }

    db.prepare(
      'INSERT INTO review_log (user_id, word_id, direction, grade, prev_state, stability, ms_taken, ts) VALUES (?,?,?,?,?,?,?,?)',
    ).run(user.id, wordId, direction, grade, before.state, after.stability, ms, now);

    // Generation effect: once you can recognise a word, start producing it.
    let unlockedProduction = false;
    if (direction === 'r' && after.state === 'review' && !cardRow(db, user.id, wordId, 'p')) {
      const p = newCardState(now + DAY);
      db.prepare(
        `INSERT INTO cards (user_id, word_id, direction, state, step, stability, difficulty, due, last_review, reps, lapses, created_at)
         VALUES (?,?,'p',?,?,?,?,?,?,?,?,?)`,
      ).run(user.id, wordId, p.state, p.step, p.stability, p.difficulty, p.due, p.last_review, p.reps, p.lapses, now);
      unlockedProduction = true;
    }

    const xp = isNewWord ? XP.newWord : grade === 1 ? XP.reviewAgain : XP.reviewCorrect;
    bumpActivity(
      db,
      user,
      { reviews: 1, correct: grade > 1 ? 1 : 0, new_words: isNewWord ? 1 : 0, xp, ms_spent: ms ?? 0 },
      now,
    );

    if (isNewWord) {
      const n = introducedCount(db, user.id);
      if ([1, 25, 50, 100, 250, 500, 750, 1000].includes(n) || (n > 1000 && n % 250 === 0)) {
        logEvent(db, user.id, 'milestone', { words: n }, now);
      }
    }
    const unlocked = checkAchievements(db, vocab, user, now);
    return {
      xp,
      card: { state: after.state, due: after.due, stability: after.stability },
      intervals: previewIntervals(after, now, user.retention),
      unlockedProduction,
      achievements: unlocked,
    };
  });
}

export function recordDrill(db, vocab, user, { correct, total, msTaken = 0, now = Date.now() }) {
  correct = Math.max(0, Math.min(50, Number(correct) || 0));
  total = Math.max(correct, Math.min(50, Number(total) || 0));
  const ms = Math.max(0, Math.min(Number(msTaken) || 0, 30 * 60_000));
  const xp = correct * XP.drillCorrect;
  bumpActivity(db, user, { drills: total, xp, ms_spent: ms }, now);
  return { xp, achievements: checkAchievements(db, vocab, user, now) };
}

export const GAME_ID_RE = /^[a-z0-9-]{2,24}$/;

/**
 * Records one finished arcade-game round: XP and activity for the
 * contribution graph, the score for leaderboards, and a feed event when it
 * is a new personal best.
 */
export function recordGame(db, vocab, user, { game, score, correct, total, msTaken = 0, daily = false, won = false, meta = {}, now = Date.now() }) {
  if (!GAME_ID_RE.test(String(game ?? ''))) throw httpError(400, 'Unknown game');
  score = Math.max(0, Math.min(1_000_000, Math.round(Number(score) || 0)));
  correct = Math.max(0, Math.min(300, Math.round(Number(correct) || 0)));
  total = Math.max(correct, Math.min(300, Math.round(Number(total) || 0)));
  const ms = Math.max(0, Math.min(Number(msTaken) || 0, 30 * 60_000));
  daily = daily ? 1 : 0;
  won = won ? 1 : 0;
  const metaJson = JSON.stringify(meta && typeof meta === 'object' ? meta : {}).slice(0, 2000);
  return tx(db, () => {
    const prevBest = db.prepare('SELECT MAX(score) b FROM game_scores WHERE user_id = ? AND game = ?').get(user.id, game).b;
    const day = localDay(user, now);
    db.prepare(
      'INSERT INTO game_scores (user_id, game, score, correct, total, daily, won, day, meta, ts) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(user.id, game, score, correct, total, daily, won, day, metaJson, now);
    const xp = correct * XP.gameCorrect + (won ? XP.gameWin : 0);
    bumpActivity(db, user, { drills: total, xp, ms_spent: ms }, now);
    const isBest = score > 0 && (prevBest == null || score > prevBest);
    const best = Math.max(score, prevBest ?? 0);
    if (isBest) logEvent(db, user.id, 'game-best', { game, score }, now);
    const rank =
      db
        .prepare('SELECT COUNT(*) n FROM (SELECT user_id, MAX(score) s FROM game_scores WHERE game = ? GROUP BY user_id) WHERE s > ?')
        .get(game, best).n + 1;
    return { xp, best, isBest, prevBest: prevBest ?? null, rank, achievements: checkAchievements(db, vocab, user, now) };
  });
}

export function completeLesson(db, vocab, user, { lessonId, score, now = Date.now() }) {
  const lesson = lessonById.get(lessonId);
  if (!lesson) throw httpError(404, 'Unknown lesson');
  const s = Math.max(0, Math.min(lesson.quiz.length, Number(score) || 0));
  return tx(db, () => {
    const prev = db.prepare('SELECT score FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(user.id, lessonId);
    let xp = 0;
    if (!prev) {
      xp = XP.lessonBase + s * XP.lessonPerPoint;
      db.prepare('INSERT INTO lesson_progress (user_id, lesson_id, completed_at, score) VALUES (?,?,?,?)').run(user.id, lessonId, now, s);
      bumpActivity(db, user, { lessons: 1, xp }, now);
      logEvent(db, user.id, 'lesson', { id: lessonId, title: lesson.title, score: s, of: lesson.quiz.length }, now);
    } else if (s > (prev.score ?? 0)) {
      db.prepare('UPDATE lesson_progress SET score = ? WHERE user_id = ? AND lesson_id = ?').run(s, user.id, lessonId);
    }
    return { xp, achievements: checkAchievements(db, vocab, user, now) };
  });
}

// ---------------------------------------------------------------- stats

export function streaks(db, user, now = Date.now()) {
  const days = db
    .prepare('SELECT day FROM activity WHERE user_id = ? AND xp > 0 ORDER BY day')
    .all(user.id)
    .map((r) => r.day);
  const set = new Set(days);
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const today = localDay(user, now);
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  return { current, longest, activeToday: set.has(today) };
}

const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const shiftDay = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

export function contributions(db, user, now = Date.now()) {
  const today = localDay(user, now);
  const from = shiftDay(today, -370);
  const rows = db
    .prepare('SELECT day, reviews, new_words, drills, lessons, xp, ms_spent FROM activity WHERE user_id = ? AND day >= ? ORDER BY day')
    .all(user.id, from);
  return { today, from, days: rows };
}

export function levelFor(known) {
  const levels = [
    [0, 'Pre-A1', 'Just starting'],
    [150, 'A1', 'Survival phrases'],
    [400, 'A2', 'Everyday basics'],
    [800, 'B1', 'Conversational'],
    [1200, 'B1+', 'Comfortable conversations'],
    [2000, 'B2', 'Fluent everyday speech'],
  ];
  let i = 0;
  while (i + 1 < levels.length && known >= levels[i + 1][0]) i++;
  const [min, code, label] = levels[i];
  const next = levels[i + 1];
  return { code, label, min, next: next ? { code: next[1], at: next[0] } : null };
}

export function stats(db, vocab, user, now = Date.now()) {
  const c = db
    .prepare(
      `SELECT
         SUM(direction='r') AS introduced,
         SUM(direction='r' AND stability >= ?) AS known,
         SUM(direction='r' AND stability >= ?) AS mature,
         SUM(direction='p' AND stability >= ?) AS produced,
         SUM(due <= ?) AS due_now,
         SUM(lapses) AS lapses
       FROM cards WHERE user_id = ?`,
    )
    .get(KNOWN_STABILITY_DAYS, MATURE_STABILITY_DAYS, KNOWN_STABILITY_DAYS, now, user.id);
  const totals = db
    .prepare('SELECT COALESCE(SUM(reviews),0) reviews, COALESCE(SUM(xp),0) xp, COALESCE(SUM(ms_spent),0) ms, COALESCE(SUM(lessons),0) lessons FROM activity WHERE user_id = ?')
    .get(user.id);
  const r30 = db
    .prepare("SELECT COUNT(*) n, SUM(grade > 1) ok FROM review_log WHERE user_id = ? AND prev_state = 'review' AND ts >= ?")
    .get(user.id, now - 30 * DAY);
  const forecast = [];
  for (let i = 0; i < 7; i++) {
    const end = now + (i + 1) * DAY;
    forecast.push(
      db.prepare('SELECT COUNT(*) n FROM cards WHERE user_id = ? AND due > ? AND due <= ?').get(user.id, i === 0 ? 0 : now + i * DAY, end).n,
    );
  }
  const byCatRows = db
    .prepare("SELECT word_id, stability FROM cards WHERE user_id = ? AND direction = 'r'")
    .all(user.id);
  const catTotals = {};
  for (const w of vocab.words) catTotals[w.cat] ??= { total: 0, introduced: 0, known: 0 }, catTotals[w.cat].total++;
  for (const r of byCatRows) {
    const w = vocab.byId.get(r.word_id);
    if (!w) continue;
    catTotals[w.cat].introduced++;
    if (r.stability >= KNOWN_STABILITY_DAYS) catTotals[w.cat].known++;
  }
  const today = db.prepare('SELECT * FROM activity WHERE user_id = ? AND day = ?').get(user.id, localDay(user, now));
  const known = c.known ?? 0;
  // "Active vocabulary" weights words you can also produce more heavily.
  return {
    introduced: c.introduced ?? 0,
    known,
    mature: c.mature ?? 0,
    produced: c.produced ?? 0,
    dueNow: c.due_now ?? 0,
    lapses: c.lapses ?? 0,
    totalWords: vocab.words.length,
    reviews: totals.reviews,
    xp: totals.xp,
    minutes: Math.round(totals.ms / 60000),
    lessonsDone: totals.lessons,
    lessonsTotal: LESSONS.length,
    retention30: r30.n ? Math.round((100 * r30.ok) / r30.n) : null,
    forecast,
    categories: catTotals,
    today: { xp: today?.xp ?? 0, reviews: today?.reviews ?? 0, newWords: today?.new_words ?? 0, goal: user.daily_goal_xp },
    level: levelFor(known),
    streak: streaks(db, user, now),
  };
}

// ---------------------------------------------------------------- achievements

export const ACHIEVEMENTS = [
  { code: 'first-word', icon: '🌱', title: 'First word', desc: 'Learn your first word.' },
  { code: 'words-50', icon: '📗', title: '50 words', desc: 'Introduce 50 words.' },
  { code: 'words-100', icon: '📘', title: 'Century', desc: 'Introduce 100 words.' },
  { code: 'words-250', icon: '📙', title: 'Survival vocabulary', desc: 'Introduce 250 words.' },
  { code: 'words-500', icon: '📚', title: 'Half way', desc: 'Introduce 500 words.' },
  { code: 'words-1000', icon: '🏛️', title: 'The thousand', desc: 'Introduce 1000 words.' },
  { code: 'known-100', icon: '🧠', title: 'Long-term memory', desc: '100 words with ≥7-day stability.' },
  { code: 'known-500', icon: '🧠', title: 'Deep roots', desc: '500 words with ≥7-day stability.' },
  { code: 'streak-3', icon: '🔥', title: 'Warming up', desc: '3-day streak.' },
  { code: 'streak-7', icon: '🔥', title: 'One week', desc: '7-day streak.' },
  { code: 'streak-14', icon: '🔥', title: 'Habit formed', desc: '14-day streak.' },
  { code: 'streak-30', icon: '🏆', title: 'Unstoppable', desc: '30-day streak.' },
  { code: 'reviews-100', icon: '🔁', title: 'Retriever', desc: '100 reviews.' },
  { code: 'reviews-1000', icon: '⚡', title: 'Recall machine', desc: '1000 reviews.' },
  { code: 'goal-day', icon: '🎯', title: 'On target', desc: 'Hit your daily XP goal.' },
  { code: 'lessons-week1', icon: '🗺️', title: 'Survival kit', desc: 'Finish all week-1 lessons.' },
  { code: 'lessons-all', icon: '🎓', title: 'Grammar graduate', desc: 'Finish every lesson.' },
  { code: 'arcade-first', icon: '🎮', title: 'Arcade debut', desc: 'Finish a round of any word game.' },
  { code: 'arcade-daily', icon: '📅', title: 'Daily puzzler', desc: 'Solve a daily puzzle.' },
  { code: 'arcade-50', icon: '🕹️', title: 'Arcade regular', desc: 'Play 50 rounds of word games.' },
];

function checkAchievements(db, vocab, user, now) {
  const have = new Set(db.prepare('SELECT code FROM achievements WHERE user_id = ?').all(user.id).map((r) => r.code));
  const s = stats(db, vocab, user, now);
  const done = new Set(db.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ?').all(user.id).map((r) => r.lesson_id));
  const games = db.prepare('SELECT COUNT(*) plays, COALESCE(SUM(daily AND won), 0) dailyWins FROM game_scores WHERE user_id = ?').get(user.id);
  const checks = {
    'first-word': s.introduced >= 1,
    'words-50': s.introduced >= 50,
    'words-100': s.introduced >= 100,
    'words-250': s.introduced >= 250,
    'words-500': s.introduced >= 500,
    'words-1000': s.introduced >= 1000,
    'known-100': s.known >= 100,
    'known-500': s.known >= 500,
    'streak-3': s.streak.current >= 3,
    'streak-7': s.streak.current >= 7,
    'streak-14': s.streak.current >= 14,
    'streak-30': s.streak.current >= 30,
    'reviews-100': s.reviews >= 100,
    'reviews-1000': s.reviews >= 1000,
    'goal-day': s.today.xp >= user.daily_goal_xp,
    'lessons-week1': LESSONS.filter((l) => l.week === 1).every((l) => done.has(l.id)),
    'lessons-all': LESSONS.every((l) => done.has(l.id)),
    'arcade-first': games.plays >= 1,
    'arcade-daily': games.dailyWins >= 1,
    'arcade-50': games.plays >= 50,
  };
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (!have.has(a.code) && checks[a.code]) {
      db.prepare('INSERT INTO achievements (user_id, code, unlocked_at) VALUES (?,?,?)').run(user.id, a.code, now);
      logEvent(db, user.id, 'achievement', { code: a.code, title: a.title, icon: a.icon }, now);
      unlocked.push(a);
    }
  }
  return unlocked;
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
