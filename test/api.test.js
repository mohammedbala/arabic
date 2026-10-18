import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { loadVocab } from '../server/vocab.js';
import { createApp } from '../server/app.js';

let server;
let base;
const vocab = loadVocab();

before(async () => {
  const app = createApp({ db: openDb(':memory:'), vocab });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function client() {
  let cookie = '';
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

test('deck has at least 1000 valid Libyan word cards', () => {
  assert.ok(vocab.words.length >= 1000, `only ${vocab.words.length} words`);
  const ids = new Set();
  for (const w of vocab.words) {
    assert.ok(!ids.has(w.id), `duplicate id ${w.id}`);
    ids.add(w.id);
    for (const k of ['ar', 'tr', 'en', 'msa', 'pos', 'cat', 'ex_ar', 'ex_en']) assert.ok(w[k], `word ${w.id} missing ${k}`);
    assert.match(w.ar, /[؀-ۿ]/);
  }
  const ranks = vocab.words.map((w) => w.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, ranks.map((_, i) => i + 1));
});

test('signup, session, logout and login', async () => {
  const api = client();
  assert.equal((await api('/api/me')).body.user, null);
  const bad = await api('/api/auth/signup', { method: 'POST', body: { username: 'a', password: 'x' } });
  assert.equal(bad.status, 400);
  const r = await api('/api/auth/signup', { method: 'POST', body: { username: 'amira', password: 'secret-pass', email: 'a@example.com' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.dialect, 'libyan', 'defaults to Libyan Arabic');
  assert.equal(r.body.user.password_hash, undefined);
  assert.equal((await api('/api/me')).body.user.username, 'amira');
  const dup = await client()('/api/auth/signup', { method: 'POST', body: { username: 'AMIRA', password: 'secret-pass' } });
  assert.equal(dup.status, 409);
  await api('/api/auth/logout', { method: 'POST', body: {} });
  assert.equal((await api('/api/me')).body.user, null);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { login: 'amira', password: 'nope-nope' } })).status, 401);
  const ok = await api('/api/auth/login', { method: 'POST', body: { login: 'a@example.com', password: 'secret-pass' } });
  assert.equal(ok.status, 200);
  assert.equal((await api('/api/me')).body.user.username, 'amira');
});

test('protected routes require auth; non-JSON writes are rejected', async () => {
  const api = client();
  assert.equal((await api('/api/study/queue')).status, 401);
  const res = await fetch(base + '/api/auth/login', { method: 'POST', body: 'login=x&password=y', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(res.status, 415);
});

test('study flow: queue → answer → production unlock → stats & contributions', async () => {
  const api = client();
  await api('/api/auth/signup', { method: 'POST', body: { username: 'learner1', password: 'secret-pass' } });
  const q = await api('/api/study/queue');
  assert.equal(q.status, 200);
  assert.equal(q.body.counts.due, 0);
  assert.equal(q.body.counts.new, Math.ceil(1000 / 42));
  const first = q.body.items[0];
  assert.equal(first.kind, 'new');
  assert.equal(first.word.rank, 1, 'starts with the most frequent word');

  let a = await api('/api/study/answer', { method: 'POST', body: { wordId: first.word.id, grade: 3, msTaken: 3000 } });
  assert.equal(a.status, 200);
  assert.equal(a.body.card.state, 'learning');
  assert.equal(a.body.xp, 15);
  assert.ok(a.body.achievements.some((x) => x.code === 'first-word'));
  assert.ok(a.body.intervals[3], 'answer returns next interval previews');
  const mid = await api('/api/study/queue');
  assert.equal(mid.body.counts.due, 1, 'learning card within the learn-ahead window is due now');
  assert.equal(mid.body.items[0].word.id, first.word.id);
  a = await api('/api/study/answer', { method: 'POST', body: { wordId: first.word.id, grade: 3 } });
  assert.equal(a.body.card.state, 'review');
  assert.equal(a.body.unlockedProduction, true);

  // production card cannot be answered for words never seen
  const other = q.body.items[1].word.id;
  assert.equal((await api('/api/study/answer', { method: 'POST', body: { wordId: other, direction: 'p', grade: 3 } })).status, 400);
  assert.equal((await api('/api/study/answer', { method: 'POST', body: { wordId: other, grade: 9 } })).status, 400);

  const q2 = await api('/api/study/queue');
  assert.equal(q2.body.counts.new, q.body.counts.new - 1);
  assert.ok(!q2.body.items.some((i) => i.word.id === first.word.id && i.kind === 'new'));

  const s = await api('/api/stats');
  assert.equal(s.body.introduced, 1);
  assert.equal(s.body.reviews, 2);
  assert.equal(s.body.streak.current, 1);
  assert.equal(s.body.today.xp, 25);

  const prof = await client()('/api/users/learner1');
  assert.equal(prof.status, 200);
  assert.equal(prof.body.contributions.days.length, 1);
  assert.equal(prof.body.contributions.days[0].xp, 25);
  assert.ok(prof.body.events.some((e) => e.kind === 'milestone'));
});

test('lessons, drills, leaderboard, follow & privacy', async () => {
  const a = client();
  const b = client();
  await a('/api/auth/signup', { method: 'POST', body: { username: 'alpha', password: 'secret-pass' } });
  await b('/api/auth/signup', { method: 'POST', body: { username: 'beta', password: 'secret-pass' } });

  const lessons = await a('/api/lessons');
  assert.ok(lessons.body.lessons.length >= 12);
  const done = await a('/api/lessons/w1-pronouns/complete', { method: 'POST', body: { score: 3 } });
  assert.equal(done.body.xp, 40 + 3 * 5);
  const again = await a('/api/lessons/w1-pronouns/complete', { method: 'POST', body: { score: 3 } });
  assert.equal(again.body.xp, 0, 'no double XP');

  const drill = await a('/api/drill?n=5');
  assert.equal(drill.body.questions.length, 5);
  for (const q of drill.body.questions) {
    assert.equal(q.options.length, 4);
    assert.equal(q.options[q.answer].id, q.word.id);
  }
  const res = await a('/api/drill/result', { method: 'POST', body: { correct: 4, total: 5, msTaken: 60000 } });
  assert.equal(res.body.xp, 12);

  const lb = await b('/api/leaderboard');
  assert.equal(lb.body.rows[0].username, 'alpha');

  assert.equal((await b('/api/users/alpha/follow', { method: 'POST', body: {} })).status, 200);
  const feed = await b('/api/feed');
  assert.ok(feed.body.events.some((e) => e.username === 'alpha' && e.kind === 'lesson'));
  assert.equal((await b('/api/users/alpha')).body.profile.isFollowing, true);

  await a('/api/me', { method: 'PATCH', body: { isPublic: false, targetDays: 21, dialect: 'msa' } });
  assert.equal((await b('/api/users/alpha')).status, 404);
  assert.equal((await a('/api/users/alpha')).status, 200, 'owner can still see private profile');
  const me = (await a('/api/me')).body.user;
  assert.equal(me.targetDays, 21);
  assert.equal(me.dialect, 'msa');
  const w = await a('/api/words?dialect=msa');
  assert.equal(w.body.words.length, vocab.words.length);
  assert.ok(!(await b('/api/leaderboard')).body.rows.some((r) => r.username === 'alpha'));
});

test('password change invalidates other sessions; reset progress', async () => {
  const a1 = client();
  await a1('/api/auth/signup', { method: 'POST', body: { username: 'gamma', password: 'secret-pass' } });
  const a2 = client();
  await a2('/api/auth/login', { method: 'POST', body: { login: 'gamma', password: 'secret-pass' } });
  assert.equal((await a1('/api/me/password', { method: 'POST', body: { current: 'wrong', next: 'new-secret-pass' } })).status, 403);
  assert.equal((await a1('/api/me/password', { method: 'POST', body: { current: 'secret-pass', next: 'new-secret-pass' } })).status, 200);
  assert.equal((await a2('/api/me')).body.user, null);
  assert.equal((await a1('/api/me')).body.user.username, 'gamma');

  const q = await a1('/api/study/queue');
  await a1('/api/study/answer', { method: 'POST', body: { wordId: q.body.items[0].word.id, grade: 4 } });
  assert.equal((await a1('/api/me/reset-progress', { method: 'POST', body: { confirm: 'nope' } })).status, 400);
  assert.equal((await a1('/api/me/reset-progress', { method: 'POST', body: { confirm: 'gamma' } })).status, 200);
  assert.equal((await a1('/api/stats')).body.introduced, 0);
});

test('SPA routes serve index.html; unknown API is JSON 404', async () => {
  const r = await fetch(base + '/u/alpha');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Darija Libya/);
  const n = await fetch(base + '/api/nope');
  assert.equal(n.status, 404);
});
