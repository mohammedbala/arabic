// Framework-agnostic JSON API. The Node server (Express) and the static
// GitHub Pages build (in-browser sql.js) both route requests through here, so
// there is exactly one implementation of every endpoint.
//
// handle({ method, path, query, body, token, ip }) resolves to
//   { status, json, session }  where session is
//   undefined (leave as is) | { token, maxAge } (set) | 'clear'.
//
// `crypto` is injected: { hashPassword, verifyPassword, sha256, randomToken },
// all async-capable, so Node can use scrypt and the browser WebCrypto.

import { present } from './vocab-core.js';
import { LESSONS, lessonById, WEEKS } from './curriculum.js';
import {
  getQueue,
  answerCard,
  recordDrill,
  completeLesson,
  stats,
  contributions,
  planFor,
  ACHIEVEMENTS,
  logEvent,
  localDay,
  httpError,
} from './study.js';

export const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{1,30}[a-zA-Z0-9])?$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIALECTS = ['libyan', 'msa'];
const SESSION_MS = 30 * 86_400_000;

export function createApi({ db, vocab, crypto }) {
  // ------------------------------------------------------------ sessions
  async function createSession(userId, now = Date.now()) {
    const token = crypto.randomToken();
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      await crypto.sha256(token),
      userId,
      now,
      now + SESSION_MS,
    );
    return { token, maxAge: SESSION_MS };
  }
  async function userForToken(token, now = Date.now()) {
    if (!token) return null;
    const row = db
      .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
      .get(await crypto.sha256(token), now);
    return row ?? null;
  }

  const authLimit = rateLimiter({ windowMs: 15 * 60_000, max: 30 });
  const limitAuth = (ctx) => {
    if (!authLimit(ctx.ip ?? 'local')) throw httpError(429, 'Too many attempts, try again later');
  };
  const requireUser = (ctx) => {
    if (!ctx.user) throw httpError(401, 'Please log in');
  };
  const findUser = (name) => db.prepare('SELECT * FROM users WHERE username = ?').get(String(name));

  // ------------------------------------------------------------ routes
  const routes = [];
  const on = (method, pattern, handler, { auth = false } = {}) => routes.push({ method, pattern, handler, auth });

  on('POST', /^\/api\/auth\/signup$/, async (ctx) => {
    limitAuth(ctx);
    const { username, password, email, displayName, dialect, targetDays, tzOffset } = ctx.body;
    if (!USERNAME_RE.test(username ?? '')) throw httpError(400, 'Username: 3–32 letters, numbers, - or _');
    if (typeof password !== 'string' || password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
    if (password.length > 200) throw httpError(400, 'Password too long');
    if (email && !EMAIL_RE.test(email)) throw httpError(400, 'Invalid email');
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw httpError(409, 'Username is taken');
    if (email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw httpError(409, 'Email already registered');
    const now = Date.now();
    const info = db
      .prepare(
        `INSERT INTO users (username, email, display_name, password_hash, dialect, target_days, tz_offset_min, started_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        username,
        email || null,
        String(displayName || username).slice(0, 60),
        await crypto.hashPassword(password),
        DIALECTS.includes(dialect) ? dialect : 'libyan',
        clampInt(targetDays, 14, 365, 42),
        clampInt(tzOffset, -840, 840, 0),
        now,
        now,
      );
    const userId = Number(info.lastInsertRowid);
    logEvent(db, userId, 'joined', {}, now);
    return {
      status: 201,
      json: { user: publicSelf(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)) },
      session: await createSession(userId),
    };
  });

  on('POST', /^\/api\/auth\/login$/, async (ctx) => {
    limitAuth(ctx);
    const { login, password, tzOffset } = ctx.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(String(login ?? ''), String(login ?? ''));
    if (!user || typeof password !== 'string' || !(await crypto.verifyPassword(password, user.password_hash))) {
      throw httpError(401, 'Wrong username or password');
    }
    if (tzOffset !== undefined) db.prepare('UPDATE users SET tz_offset_min = ? WHERE id = ?').run(clampInt(tzOffset, -840, 840, 0), user.id);
    return {
      json: { user: publicSelf({ ...user, tz_offset_min: clampInt(tzOffset, -840, 840, user.tz_offset_min) }) },
      session: await createSession(user.id),
    };
  });

  on('POST', /^\/api\/auth\/logout$/, async (ctx) => {
    if (ctx.token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(await crypto.sha256(ctx.token));
    return { json: { ok: true }, session: 'clear' };
  });

  on('GET', /^\/api\/me$/, (ctx) => ({ json: { user: ctx.user ? publicSelf(ctx.user) : null } }));

  on(
    'PATCH',
    /^\/api\/me$/,
    (ctx) => {
      const b = ctx.body;
      const u = ctx.user;
      const next = {
        display_name: b.displayName !== undefined ? String(b.displayName).trim().slice(0, 60) || u.username : u.display_name,
        bio: b.bio !== undefined ? String(b.bio).slice(0, 280) : u.bio,
        dialect: DIALECTS.includes(b.dialect) ? b.dialect : u.dialect,
        target_days: b.targetDays !== undefined ? clampInt(b.targetDays, 14, 365, u.target_days) : u.target_days,
        daily_goal_xp: b.dailyGoalXp !== undefined ? clampInt(b.dailyGoalXp, 30, 2000, u.daily_goal_xp) : u.daily_goal_xp,
        retention: b.retention !== undefined ? clampNum(b.retention, 0.8, 0.97, u.retention) : u.retention,
        tz_offset_min: b.tzOffset !== undefined ? clampInt(b.tzOffset, -840, 840, u.tz_offset_min) : u.tz_offset_min,
        is_public: b.isPublic !== undefined ? (b.isPublic ? 1 : 0) : u.is_public,
      };
      db.prepare(
        `UPDATE users SET display_name=?, bio=?, dialect=?, target_days=?, daily_goal_xp=?, retention=?, tz_offset_min=?, is_public=? WHERE id=?`,
      ).run(next.display_name, next.bio, next.dialect, next.target_days, next.daily_goal_xp, next.retention, next.tz_offset_min, next.is_public, u.id);
      return { json: { user: publicSelf({ ...u, ...next }) } };
    },
    { auth: true },
  );

  on(
    'POST',
    /^\/api\/me\/password$/,
    async (ctx) => {
      limitAuth(ctx);
      const { current, next } = ctx.body;
      if (!(await crypto.verifyPassword(String(current ?? ''), ctx.user.password_hash))) throw httpError(403, 'Current password is wrong');
      if (typeof next !== 'string' || next.length < 8 || next.length > 200) throw httpError(400, 'New password must be at least 8 characters');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await crypto.hashPassword(next), ctx.user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(ctx.user.id);
      return { json: { ok: true }, session: await createSession(ctx.user.id) };
    },
    { auth: true },
  );

  on(
    'POST',
    /^\/api\/me\/reset-progress$/,
    (ctx) => {
      if (ctx.body.confirm !== ctx.user.username) throw httpError(400, 'Type your username to confirm');
      for (const t of ['cards', 'review_log', 'activity', 'lesson_progress', 'achievements', 'events']) {
        db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(ctx.user.id);
      }
      db.prepare('UPDATE users SET started_at = ? WHERE id = ?').run(Date.now(), ctx.user.id);
      return { json: { ok: true } };
    },
    { auth: true },
  );

  // ------------------------------------------------------------ content
  on('GET', /^\/api\/words$/, (ctx) => {
    const dialect = DIALECTS.includes(ctx.query.dialect) ? ctx.query.dialect : ctx.user?.dialect ?? 'libyan';
    return { json: { categories: vocab.categories, words: vocab.byRank.map((w) => present(w, dialect)) }, cache: 'private, max-age=300' };
  });

  on(
    'GET',
    /^\/api\/words\/status$/,
    (ctx) => ({
      json: { cards: db.prepare('SELECT word_id, direction, state, stability, due, lapses, reps FROM cards WHERE user_id = ?').all(ctx.user.id) },
    }),
    { auth: true },
  );

  on('GET', /^\/api\/lessons$/, (ctx) => {
    const done = ctx.user
      ? Object.fromEntries(
          db.prepare('SELECT lesson_id, score, completed_at FROM lesson_progress WHERE user_id = ?').all(ctx.user.id).map((r) => [r.lesson_id, r]),
        )
      : {};
    return {
      json: {
        weeks: WEEKS,
        lessons: LESSONS.map(({ quiz, body, ...l }) => ({ ...l, questions: quiz.length, done: done[l.id] ?? null })),
      },
    };
  });

  on('GET', /^\/api\/lessons\/([\w-]+)$/, (ctx) => {
    const l = lessonById.get(ctx.params[0]);
    if (!l) throw httpError(404, 'Lesson not found');
    return { json: { lesson: l } };
  });

  on(
    'POST',
    /^\/api\/lessons\/([\w-]+)\/complete$/,
    (ctx) => ({ json: completeLesson(db, vocab, ctx.user, { lessonId: ctx.params[0], score: ctx.body.score }) }),
    { auth: true },
  );

  // ------------------------------------------------------------ study
  on('GET', /^\/api\/study\/queue$/, (ctx) => ({ json: getQueue(db, vocab, ctx.user, { limit: clampInt(ctx.query.limit, 1, 200, 60) }) }), {
    auth: true,
  });

  on(
    'POST',
    /^\/api\/study\/answer$/,
    (ctx) => {
      const { wordId, direction, grade, msTaken } = ctx.body;
      return { json: answerCard(db, vocab, ctx.user, { wordId: Number(wordId), direction, grade, msTaken }) };
    },
    { auth: true },
  );

  on('GET', /^\/api\/plan$/, (ctx) => ({ json: planFor(db, vocab, ctx.user) }), { auth: true });

  // Practice drills: multiple choice over words you have met (or the first
  // words of the deck if you have not started). Distractors come from the
  // same part of speech so the choice requires real discrimination.
  on(
    'GET',
    /^\/api\/drill$/,
    (ctx) => {
      const n = clampInt(ctx.query.n, 4, 30, 10);
      const cat = ctx.query.cat ? String(ctx.query.cat) : null;
      const seenIds = db.prepare("SELECT word_id FROM cards WHERE user_id = ? AND direction = 'r'").all(ctx.user.id).map((r) => r.word_id);
      let pool = (seenIds.length >= 8 ? seenIds.map((id) => vocab.byId.get(id)) : vocab.byRank.slice(0, 40)).filter(Boolean);
      if (cat) {
        const inCat = pool.filter((w) => w.cat === cat);
        pool = inCat.length >= 4 ? inCat : vocab.byRank.filter((w) => w.cat === cat).slice(0, 40);
      }
      const picks = shuffle([...pool]).slice(0, n);
      const questions = picks.map((w) => {
        const same = vocab.words.filter((x) => x.id !== w.id && x.pos === w.pos && x.en !== w.en);
        const distractors = shuffle(same.length >= 3 ? same : vocab.words.filter((x) => x.id !== w.id)).slice(0, 3);
        const options = shuffle([w, ...distractors]).map((x) => present(x, ctx.user.dialect));
        return { word: present(w, ctx.user.dialect), options, answer: options.findIndex((o) => o.id === w.id) };
      });
      return { json: { questions } };
    },
    { auth: true },
  );

  on('POST', /^\/api\/drill\/result$/, (ctx) => ({ json: recordDrill(db, vocab, ctx.user, ctx.body) }), { auth: true });

  on('GET', /^\/api\/stats$/, (ctx) => ({ json: stats(db, vocab, ctx.user) }), { auth: true });

  // ------------------------------------------------------------ social / profiles
  on('GET', /^\/api\/users\/([A-Za-z0-9_-]+)$/, (ctx) => {
    const u = findUser(ctx.params[0]);
    const isSelf = ctx.user && u && ctx.user.id === u.id;
    if (!u || (!u.is_public && !isSelf)) throw httpError(404, 'User not found');
    const s = stats(db, vocab, u);
    const achievements = db
      .prepare('SELECT code, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at')
      .all(u.id)
      .map((a) => ({ ...ACHIEVEMENTS.find((x) => x.code === a.code), unlockedAt: a.unlocked_at }))
      .filter((a) => a.code);
    const events = db
      .prepare('SELECT kind, data, ts FROM events WHERE user_id = ? ORDER BY ts DESC LIMIT 30')
      .all(u.id)
      .map((e) => ({ kind: e.kind, data: JSON.parse(e.data), ts: e.ts }));
    const followers = db.prepare('SELECT COUNT(*) n FROM follows WHERE followee_id = ?').get(u.id).n;
    const following = db.prepare('SELECT COUNT(*) n FROM follows WHERE follower_id = ?').get(u.id).n;
    const isFollowing = ctx.user ? !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(ctx.user.id, u.id) : false;
    return {
      json: {
        profile: {
          username: u.username,
          displayName: u.display_name,
          bio: u.bio,
          dialect: u.dialect,
          joinedAt: u.created_at,
          isPublic: !!u.is_public,
          followers,
          following,
          isFollowing,
          isSelf: !!isSelf,
        },
        stats: {
          introduced: s.introduced,
          known: s.known,
          mature: s.mature,
          produced: s.produced,
          totalWords: s.totalWords,
          reviews: s.reviews,
          xp: s.xp,
          minutes: s.minutes,
          lessonsDone: s.lessonsDone,
          lessonsTotal: s.lessonsTotal,
          retention30: s.retention30,
          level: s.level,
          streak: s.streak,
          categories: s.categories,
        },
        contributions: contributions(db, u),
        achievements,
        allAchievements: ACHIEVEMENTS,
        events,
      },
    };
  });

  on(
    'POST',
    /^\/api\/users\/([A-Za-z0-9_-]+)\/follow$/,
    (ctx) => {
      const u = findUser(ctx.params[0]);
      if (!u || !u.is_public) throw httpError(404, 'User not found');
      if (u.id === ctx.user.id) throw httpError(400, 'You cannot follow yourself');
      if (ctx.body.follow === false) {
        db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(ctx.user.id, u.id);
      } else {
        db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?,?,?)').run(ctx.user.id, u.id, Date.now());
      }
      return { json: { ok: true } };
    },
    { auth: true },
  );

  on('GET', /^\/api\/leaderboard$/, (ctx) => {
    const period = ctx.query.period === 'all' ? 'all' : 'week';
    const since = period === 'all' ? '0000-00-00' : localDay({ tz_offset_min: 0 }, Date.now() - 6 * 86_400_000);
    const rows = db
      .prepare(
        `SELECT u.username, u.display_name, COALESCE(SUM(a.xp),0) xp, COALESCE(SUM(a.new_words),0) words, COALESCE(SUM(a.reviews),0) reviews
         FROM users u LEFT JOIN activity a ON a.user_id = u.id AND a.day >= ?
         WHERE u.is_public = 1 GROUP BY u.id HAVING xp > 0 ORDER BY xp DESC LIMIT 50`,
      )
      .all(since);
    return { json: { period, rows } };
  });

  on(
    'GET',
    /^\/api\/feed$/,
    (ctx) => {
      const rows = db
        .prepare(
          `SELECT e.kind, e.data, e.ts, u.username, u.display_name FROM events e JOIN users u ON u.id = e.user_id
           WHERE (e.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?) AND u.is_public = 1) OR e.user_id = ?
           ORDER BY e.ts DESC LIMIT 40`,
        )
        .all(ctx.user.id, ctx.user.id)
        .map((e) => ({ ...e, data: JSON.parse(e.data) }));
      return { json: { events: rows } };
    },
    { auth: true },
  );

  on('GET', /^\/api\/users$/, (ctx) => {
    const q = String(ctx.query.q ?? '').trim();
    const rows = db
      .prepare(
        `SELECT username, display_name FROM users WHERE is_public = 1 AND (username LIKE ? OR display_name LIKE ?) ORDER BY created_at DESC LIMIT 20`,
      )
      .all(`%${q}%`, `%${q}%`);
    return { json: { users: rows } };
  });

  on('GET', /^\/api\/health$/, () => ({ json: { ok: true, words: vocab.words.length } }));

  // ------------------------------------------------------------ dispatcher
  async function handle({ method = 'GET', path, query = {}, body = {}, token = null, ip = 'local' }) {
    try {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = path.match(r.pattern);
        if (!m) continue;
        const ctx = { method, path, query, body: body ?? {}, token, ip, params: m.slice(1), user: await userForToken(token) };
        if (r.auth) requireUser(ctx);
        const out = await r.handler(ctx);
        return { status: out.status ?? 200, json: out.json, session: out.session, cache: out.cache };
      }
      throw httpError(404, 'Not found');
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      return { status, json: { error: status >= 500 ? 'Server error' : err.message } };
    }
  }

  return { handle };
}

/** Deletes expired sessions. */
export function pruneSessions(db, now = Date.now()) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}

// Tiny fixed-window limiter for login/signup attempts, keyed by IP.
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

function publicSelf(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name,
    bio: u.bio,
    dialect: u.dialect,
    targetDays: u.target_days,
    dailyGoalXp: u.daily_goal_xp,
    retention: u.retention,
    isPublic: !!u.is_public,
    startedAt: u.started_at,
    createdAt: u.created_at,
  };
}

function clampInt(v, lo, hi, dflt) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}
function clampNum(v, lo, hi, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
