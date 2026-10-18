import express from 'express';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  userForToken,
  rateLimiter,
  SESSION_COOKIE,
  USERNAME_RE,
  EMAIL_RE,
} from './auth.js';
import { present } from './vocab.js';
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

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const DIALECTS = ['libyan', 'msa'];

export function createApp({ db, vocab, secureCookies = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    next();
  });

  // CSRF defence: state-changing API calls must be JSON (forms can't send that
  // cross-site without a CORS preflight) and cookies are SameSite=Lax.
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    next();
  });

  app.use((req, _res, next) => {
    req.user = userForToken(db, req.cookies?.[SESSION_COOKIE]);
    next();
  });

  const requireUser = (req, _res, next) => (req.user ? next() : next(httpError(401, 'Please log in')));
  const authLimit = rateLimiter({ windowMs: 15 * 60_000, max: 30 });
  const limitAuth = (req, _res, next) => (authLimit(req.ip) ? next() : next(httpError(429, 'Too many attempts, try again later')));

  const setSession = (res, userId) => {
    const { token, maxAge } = createSession(db, userId);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge, path: '/' });
  };

  // ------------------------------------------------------------ auth
  app.post('/api/auth/signup', limitAuth, (req, res) => {
    const { username, password, email, displayName, dialect, targetDays, tzOffset } = req.body ?? {};
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
        hashPassword(password),
        DIALECTS.includes(dialect) ? dialect : 'libyan',
        clampInt(targetDays, 14, 365, 42),
        clampInt(tzOffset, -840, 840, 0),
        now,
        now,
      );
    const userId = Number(info.lastInsertRowid);
    logEvent(db, userId, 'joined', {}, now);
    setSession(res, userId);
    res.status(201).json({ user: publicSelf(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)) });
  });

  app.post('/api/auth/login', limitAuth, (req, res) => {
    const { login, password, tzOffset } = req.body ?? {};
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(String(login ?? ''), String(login ?? ''));
    if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
      throw httpError(401, 'Wrong username or password');
    }
    if (tzOffset !== undefined) db.prepare('UPDATE users SET tz_offset_min = ? WHERE id = ?').run(clampInt(tzOffset, -840, 840, 0), user.id);
    setSession(res, user.id);
    res.json({ user: publicSelf({ ...user, tz_offset_min: clampInt(tzOffset, -840, 840, user.tz_offset_min) }) });
  });

  app.post('/api/auth/logout', (req, res) => {
    destroySession(db, req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => res.json({ user: req.user ? publicSelf(req.user) : null }));

  app.patch('/api/me', requireUser, (req, res) => {
    const b = req.body ?? {};
    const u = req.user;
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
    res.json({ user: publicSelf({ ...u, ...next }) });
  });

  app.post('/api/me/password', requireUser, limitAuth, (req, res) => {
    const { current, next } = req.body ?? {};
    if (!verifyPassword(String(current ?? ''), req.user.password_hash)) throw httpError(403, 'Current password is wrong');
    if (typeof next !== 'string' || next.length < 8 || next.length > 200) throw httpError(400, 'New password must be at least 8 characters');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
    setSession(res, req.user.id);
    res.json({ ok: true });
  });

  app.post('/api/me/reset-progress', requireUser, (req, res) => {
    if (req.body?.confirm !== req.user.username) throw httpError(400, 'Type your username to confirm');
    for (const t of ['cards', 'review_log', 'activity', 'lesson_progress', 'achievements', 'events']) {
      db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(req.user.id);
    }
    db.prepare('UPDATE users SET started_at = ? WHERE id = ?').run(Date.now(), req.user.id);
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ content
  app.get('/api/words', (req, res) => {
    const dialect = DIALECTS.includes(req.query.dialect) ? req.query.dialect : req.user?.dialect ?? 'libyan';
    res.set('Cache-Control', 'private, max-age=300');
    res.json({ categories: vocab.categories, words: vocab.byRank.map((w) => present(w, dialect)) });
  });

  app.get('/api/words/status', requireUser, (req, res) => {
    const rows = db
      .prepare('SELECT word_id, direction, state, stability, due, lapses, reps FROM cards WHERE user_id = ?')
      .all(req.user.id);
    res.json({ cards: rows });
  });

  app.get('/api/lessons', (req, res) => {
    const done = req.user
      ? Object.fromEntries(
          db.prepare('SELECT lesson_id, score, completed_at FROM lesson_progress WHERE user_id = ?').all(req.user.id).map((r) => [r.lesson_id, r]),
        )
      : {};
    res.json({
      weeks: WEEKS,
      lessons: LESSONS.map(({ quiz, body, ...l }) => ({ ...l, questions: quiz.length, done: done[l.id] ?? null })),
    });
  });

  app.get('/api/lessons/:id', (req, res) => {
    const l = lessonById.get(req.params.id);
    if (!l) throw httpError(404, 'Lesson not found');
    res.json({ lesson: l });
  });

  app.post('/api/lessons/:id/complete', requireUser, (req, res) => {
    res.json(completeLesson(db, vocab, req.user, { lessonId: req.params.id, score: req.body?.score }));
  });

  // ------------------------------------------------------------ study
  app.get('/api/study/queue', requireUser, (req, res) => {
    res.json(getQueue(db, vocab, req.user, { limit: clampInt(req.query.limit, 1, 200, 60) }));
  });

  app.post('/api/study/answer', requireUser, (req, res) => {
    const { wordId, direction, grade, msTaken } = req.body ?? {};
    res.json(answerCard(db, vocab, req.user, { wordId: Number(wordId), direction, grade, msTaken }));
  });

  app.get('/api/plan', requireUser, (req, res) => res.json(planFor(db, vocab, req.user)));

  // Practice drills: multiple choice over words you have met (or the first
  // words of the deck if you have not started). Distractors come from the
  // same part of speech so the choice requires real discrimination.
  app.get('/api/drill', requireUser, (req, res) => {
    const n = clampInt(req.query.n, 4, 30, 10);
    const cat = req.query.cat ? String(req.query.cat) : null;
    const seenIds = db.prepare("SELECT word_id FROM cards WHERE user_id = ? AND direction = 'r'").all(req.user.id).map((r) => r.word_id);
    let pool = (seenIds.length >= 8 ? seenIds.map((id) => vocab.byId.get(id)) : vocab.byRank.slice(0, 40)).filter(Boolean);
    if (cat) {
      const inCat = pool.filter((w) => w.cat === cat);
      pool = inCat.length >= 4 ? inCat : vocab.byRank.filter((w) => w.cat === cat).slice(0, 40);
    }
    const picks = shuffle([...pool]).slice(0, n);
    const questions = picks.map((w) => {
      const same = vocab.words.filter((x) => x.id !== w.id && x.pos === w.pos && x.en !== w.en);
      const distractors = shuffle(same.length >= 3 ? same : vocab.words.filter((x) => x.id !== w.id)).slice(0, 3);
      const options = shuffle([w, ...distractors]).map((x) => present(x, req.user.dialect));
      return { word: present(w, req.user.dialect), options, answer: options.findIndex((o) => o.id === w.id) };
    });
    res.json({ questions });
  });

  app.post('/api/drill/result', requireUser, (req, res) => {
    res.json(recordDrill(db, vocab, req.user, req.body ?? {}));
  });

  app.get('/api/stats', requireUser, (req, res) => res.json(stats(db, vocab, req.user)));

  // ------------------------------------------------------------ social / profiles
  const findUser = (name) => db.prepare('SELECT * FROM users WHERE username = ?').get(String(name));

  app.get('/api/users/:username', (req, res) => {
    const u = findUser(req.params.username);
    const isSelf = req.user && u && req.user.id === u.id;
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
    const isFollowing = req.user ? !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(req.user.id, u.id) : false;
    res.json({
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
    });
  });

  app.post('/api/users/:username/follow', requireUser, (req, res) => {
    const u = findUser(req.params.username);
    if (!u || !u.is_public) throw httpError(404, 'User not found');
    if (u.id === req.user.id) throw httpError(400, 'You cannot follow yourself');
    if (req.body?.follow === false) {
      db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, u.id);
    } else {
      db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?,?,?)').run(req.user.id, u.id, Date.now());
    }
    res.json({ ok: true });
  });

  app.get('/api/leaderboard', (req, res) => {
    const period = req.query.period === 'all' ? 'all' : 'week';
    const since = period === 'all' ? '0000-00-00' : localDay({ tz_offset_min: 0 }, Date.now() - 6 * 86_400_000);
    const rows = db
      .prepare(
        `SELECT u.username, u.display_name, COALESCE(SUM(a.xp),0) xp, COALESCE(SUM(a.new_words),0) words, COALESCE(SUM(a.reviews),0) reviews
         FROM users u LEFT JOIN activity a ON a.user_id = u.id AND a.day >= ?
         WHERE u.is_public = 1 GROUP BY u.id HAVING xp > 0 ORDER BY xp DESC LIMIT 50`,
      )
      .all(since);
    res.json({ period, rows });
  });

  app.get('/api/feed', requireUser, (req, res) => {
    const rows = db
      .prepare(
        `SELECT e.kind, e.data, e.ts, u.username, u.display_name FROM events e JOIN users u ON u.id = e.user_id
         WHERE (e.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?) AND u.is_public = 1) OR e.user_id = ?
         ORDER BY e.ts DESC LIMIT 40`,
      )
      .all(req.user.id, req.user.id)
      .map((e) => ({ ...e, data: JSON.parse(e.data) }));
    res.json({ events: rows });
  });

  app.get('/api/users', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const rows = db
      .prepare(
        `SELECT username, display_name FROM users WHERE is_public = 1 AND (username LIKE ? OR display_name LIKE ?) ORDER BY created_at DESC LIMIT 20`,
      )
      .all(`%${q}%`, `%${q}%`);
    res.json({ users: rows });
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, words: vocab.words.length }));

  app.use('/api', (_req, _res, next) => next(httpError(404, 'Not found')));

  // ------------------------------------------------------------ static SPA
  app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(publicDir, 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
  });

  return app;
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
