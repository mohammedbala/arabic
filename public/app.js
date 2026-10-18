// Darija Libya — single-page frontend. No build step; plain ES modules.

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');

const state = {
  user: null,
  words: null, // cached deck (array, rank order)
  wordsById: new Map(),
  wordsDialect: null,
  tts: localStorage.getItem('tts') !== 'off',
  showTr: localStorage.getItem('showTr') !== 'off',
};

// ------------------------------------------------------------------ utils
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.innerHTML = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

const tzOffset = () => -new Date().getTimezoneOffset();
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const fmtNum = (n) => Number(n ?? 0).toLocaleString();
function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
const CAT_LABELS = {
  'verbs-core': 'Core verbs',
  'verbs-motion': 'Motion verbs',
  'verbs-communication': 'Talking verbs',
  'verbs-daily': 'Daily-life verbs',
  'verbs-mind': 'Thinking & feeling verbs',
  'verbs-work': 'Work & money verbs',
};
const catLabel = (c) => CAT_LABELS[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

// Normalise answers for typed recall: strip diacritics/punctuation, unify
// transliteration variants so "kif" matches "kīf".
function normLatin(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`ʿʾ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/(.)\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
function normArabic(s) {
  return String(s)
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** Checks a typed answer against the expected word. Returns 'exact' | 'close' | 'wrong'. */
function checkTyped(input, word, direction) {
  if (!input.trim()) return 'wrong';
  if (direction === 'p') {
    const isAr = /[؀-ۿ]/.test(input);
    const cands = isAr ? [normArabic(word.ar)] : [normLatin(word.tr)];
    const got = isAr ? normArabic(input) : normLatin(input);
    for (const c of cands) {
      if (got === c) return 'exact';
      if (lev(got, c) <= Math.max(1, Math.floor(c.length / 5))) return 'close';
    }
    return 'wrong';
  }
  const got = normLatin(input);
  const senses = word.en.split(/[;,/]|\(|\)/).map((s) => normLatin(s.replace(/^to /, ''))).filter(Boolean);
  const g = got.replace(/^to /, '');
  for (const s of senses) {
    if (g === s) return 'exact';
    if (s.length > 3 && lev(g, s) <= Math.floor(s.length / 4)) return 'close';
  }
  return 'wrong';
}

// ------------------------------------------------------------------ speech
let arVoice = null;
function pickVoice() {
  const voices = speechSynthesis?.getVoices?.() ?? [];
  arVoice = voices.find((v) => /^ar[-_](LY|TN|DZ|MA)/i.test(v.lang)) || voices.find((v) => /^ar/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speak(text, force = false) {
  if (!('speechSynthesis' in window) || (!state.tts && !force) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = arVoice?.lang || 'ar';
  if (arVoice) u.voice = arVoice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
}
const speakBtn = (text) =>
  `<button class="btn speak" data-speak="${esc(text)}" title="Listen (S)" aria-label="Listen">🔊</button>`;
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-speak]');
  if (b) {
    e.preventDefault();
    speak(b.dataset.speak, true);
  }
});

// ------------------------------------------------------------------ identicon (GitHub-style)
function identicon(name, cls = 'avatar') {
  let h = 2166136261;
  for (const ch of String(name).toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const hue = h % 360;
  const color = `hsl(${hue} 55% 52%)`;
  let cells = '';
  let bits = h;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      bits = Math.imul(bits ^ (bits >>> 13), 1274126177) >>> 0;
      if (bits & 1) {
        cells += `<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>`;
        if (x < 2) cells += `<rect x="${5 - x}" y="${y + 1}" width="1" height="1"/>`;
      }
    }
  }
  return `<svg class="${cls}" viewBox="0 0 7 7" role="img" aria-label="${esc(name)} avatar"><rect width="7" height="7" fill="var(--surface-2)"/><g fill="${color}">${cells}</g></svg>`;
}

// ------------------------------------------------------------------ contribution heatmap
function heatmap(contrib, { metric = 'xp' } = {}) {
  const byDay = new Map(contrib.days.map((d) => [d.day, d]));
  const today = new Date(contrib.today + 'T00:00:00Z');
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 52 * 7 - today.getUTCDay());
  const values = contrib.days.map((d) => d[metric]).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => values[Math.min(values.length - 1, Math.floor(p * values.length))] ?? 1;
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
  const level = (v) => (!v ? 0 : v <= t1 ? 1 : v <= t2 ? 2 : v <= t3 ? 3 : 4);
  const size = 11, gap = 3, left = 28, top = 18;
  let rects = '';
  let months = '';
  let total = 0;
  let activeDays = 0;
  let lastMonth = -1;
  for (let w = 0; w < 53; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + w * 7 + d);
      if (date > today) continue;
      const key = date.toISOString().slice(0, 10);
      const rec = byDay.get(key);
      const v = rec?.[metric] ?? 0;
      if (v) { total += v; activeDays++; }
      if (d === 0 && date.getUTCMonth() !== lastMonth) {
        lastMonth = date.getUTCMonth();
        if (w < 51) months += `<text x="${left + w * (size + gap)}" y="10">${date.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}</text>`;
      }
      const tip = rec
        ? `${rec.xp} XP · ${rec.reviews} reviews · ${rec.new_words} new words${rec.lessons ? ` · ${rec.lessons} lesson(s)` : ''} on ${key}`
        : `No activity on ${key}`;
      rects += `<rect class="l${level(v)}" x="${left + w * (size + gap)}" y="${top + d * (size + gap)}" width="${size}" height="${size}"><title>${esc(tip)}</title></rect>`;
    }
  }
  const labels = ['Mon', 'Wed', 'Fri'].map((t, i) => `<text x="0" y="${top + (1 + i * 2) * (size + gap) + 9}">${t}</text>`).join('');
  const width = left + 53 * (size + gap);
  const height = top + 7 * (size + gap);
  return `
    <div class="spread small muted" style="margin-bottom:6px"><span><strong style="color:var(--text)">${fmtNum(total)} XP</strong> across ${activeDays} active days in the last year</span></div>
    <div class="heatmap-wrap"><svg class="heatmap" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${months}${labels}${rects}</svg></div>
    <div class="heat-legend">Less <i style="background:var(--heat-0)"></i><i style="background:var(--heat-1)"></i><i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i><i style="background:var(--heat-4)"></i> More</div>`;
}

function ring(value, max, label, sub) {
  const r = 50, c = 2 * Math.PI * r;
  const pct = Math.min(1, max ? value / max : 0);
  return `<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${esc(label)} ${esc(sub)}">
    <circle class="bg" cx="60" cy="60" r="${r}"/>
    <circle class="fg" cx="60" cy="60" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="62" text-anchor="middle">${esc(label)}</text>
    <text class="sub" x="60" y="80" text-anchor="middle">${esc(sub)}</text></svg>`;
}

// ------------------------------------------------------------------ data helpers
async function loadWords(force = false) {
  const dialect = state.user?.dialect ?? 'libyan';
  if (state.words && !force && state.wordsDialect === dialect) return state.words;
  const data = await api(`/api/words?dialect=${dialect}`);
  state.words = data.words;
  state.wordsById = new Map(data.words.map((w) => [w.id, w]));
  state.wordsDialect = dialect;
  state.categories = data.categories;
  return state.words;
}

function distractors(word, n, sameDir = 'en') {
  const pool = state.words.filter((w) => w.id !== word.id && w[sameDir] !== word[sameDir]);
  const samePos = pool.filter((w) => w.pos === word.pos);
  const sameCat = samePos.filter((w) => w.cat === word.cat);
  const src = sameCat.length >= n * 2 ? sameCat : samePos.length >= n ? samePos : pool;
  return shuffle([...src]).slice(0, n);
}

// ------------------------------------------------------------------ router
const routes = [];
const route = (pattern, view, opts = {}) => routes.push({ pattern, view, ...opts });
let cleanup = null;

function navigate(path, replace = false) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  render();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', render);

async function render() {
  if (cleanup) { cleanup(); cleanup = null; }
  const path = location.pathname;
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (!m) continue;
    if (r.auth && !state.user) return navigate('/login?next=' + encodeURIComponent(path), true);
    if (r.guest && state.user) return navigate('/dashboard', true);
    renderNav();
    $app.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const out = await r.view(...m.slice(1).map(decodeURIComponent));
      if (typeof out === 'function') cleanup = out;
    } catch (err) {
      console.error(err);
      if (err.status === 401) { state.user = null; return navigate('/login', true); }
      $app.innerHTML = `<div class="card empty"><h2>Something went wrong</h2><p>${esc(err.message)}</p><a href="/" data-link class="btn">Home</a></div>`;
    }
    window.scrollTo(0, 0);
    return;
  }
  renderNav();
  $app.innerHTML = '<div class="card empty"><h2>404</h2><p>That page does not exist.</p><a href="/" data-link class="btn">Home</a></div>';
}

function renderNav() {
  const p = location.pathname;
  const link = (href, label) => `<a href="${href}" data-link class="${p === href || (href !== '/' && p.startsWith(href)) ? 'active' : ''}">${label}</a>`;
  if (state.user) {
    $nav.innerHTML = [
      link('/dashboard', 'Today'),
      link('/study', 'Study'),
      link('/practice', 'Practice'),
      link('/path', 'Path'),
      link('/words', 'Words'),
      link('/leaderboard', 'Community'),
      `<a href="/u/${esc(state.user.username)}" data-link title="Your profile" class="${p.startsWith('/u/' + state.user.username) ? 'active' : ''}" style="display:flex;align-items:center;gap:6px">${identicon(state.user.username, 'avatar sm')}</a>`,
      link('/settings', '⚙'),
    ].join('');
  } else {
    $nav.innerHTML = [link('/science', 'How it works'), link('/leaderboard', 'Community'), link('/login', 'Log in'), `<a href="/signup" data-link class="btn primary" style="color:#fff">Sign up</a>`].join('');
  }
}

// ------------------------------------------------------------------ views: public
const PRINCIPLES = [
  ['🔁', 'Spaced repetition', 'Each card is scheduled with the FSRS memory model so you review it right before you would forget — the point where a review strengthens memory most (Ebbinghaus forgetting curve, spacing effect).'],
  ['🧠', 'Active recall', 'You always try to retrieve the answer before seeing it. Retrieval practice produces far stronger memories than re-reading (the testing effect, Roediger & Karpicke 2006).'],
  ['📈', 'Frequency first', 'Words are ordered by how often they are used in daily Libyan speech. ~1000 high-frequency words cover the large majority of everyday conversation (Pareto/Zipf).'],
  ['✍️', 'Generation effect', 'Once you can recognise a word, it unlocks a production card (English → Arabic). Producing a word yourself builds the active vocabulary you need to speak.'],
  ['🔀', 'Interleaving', 'Categories are mixed within each session rather than studied in blocks. Interleaved practice improves discrimination and long-term retention.'],
  ['🗣️', 'Dual coding & context', 'Every word comes with audio, transliteration and a natural Libyan example sentence — sound, text and meaning encoded together.'],
  ['🎯', 'Desirable difficulty', 'Targeting ~90% retention keeps reviews challenging but winnable. You can tune it in settings.'],
  ['🔥', 'Habit loops', 'Daily goals, streaks and a contribution graph turn study into a habit. Short daily sessions beat long irregular ones — and sleep consolidates what you learned.'],
];

route(/^\/$/, async () => {
  if (state.user) return navigate('/dashboard', true);
  $app.innerHTML = `
    <section class="hero">
      <div>
        <span class="badge green">Libyan Arabic · ليبي</span>
        <h1>Speak Libyan Arabic in weeks, not years.</h1>
        <p class="lead">A complete training system: 1000+ high-frequency Libyan words, a 6-week fluency path, spaced repetition and retrieval practice, and a GitHub-style profile that tracks every day you show up.</p>
        <div class="row" style="margin-top:20px">
          <a href="/signup" data-link class="btn primary lg">Start learning — free</a>
          <a href="/login" data-link class="btn lg">Log in</a>
        </div>
      </div>
      <div class="card pad-lg center">
        <div class="hero-ar">شن حوالك؟</div>
        <div class="tr" style="font-size:1.2rem">shin 7wālik?</div>
        <p class="muted">How are you? — the Libyan way</p>
        ${speakBtn('شن حوالك؟')}
      </div>
    </section>
    <h2 style="margin-top:36px">Built on how memory actually works</h2>
    <div class="grid cols-4">${PRINCIPLES.map(([i, t, d]) => `<div class="card principle"><h3><span class="ico">${i}</span>${esc(t)}</h3><p class="muted small">${esc(d)}</p></div>`).join('')}</div>
    <div class="card pad-lg" style="margin-top:24px">
      <div class="grid cols-3">
        <div><h3>1 · Learn</h3><p class="muted">A daily batch of new words, sized so you finish the deck on your target date.</p></div>
        <div><h3>2 · Recall</h3><p class="muted">Reviews arrive exactly when they are due. Rate how well you remembered; the scheduler adapts to you.</p></div>
        <div><h3>3 · Use</h3><p class="muted">Grammar lessons each week connect the words into real Libyan sentences you can say today.</p></div>
      </div>
    </div>`;
});

route(/^\/science$/, async () => {
  $app.innerHTML = `
    <div class="card pad-lg" style="max-width:860px;margin:0 auto">
      <h1>How Darija Libya works</h1>
      <p class="muted">The fastest route to conversational fluency is to learn the most useful words and patterns first, and to review them in the way the brain retains best. Every part of the app is built around one of these principles.</p>
      ${PRINCIPLES.map(([i, t, d]) => `<h3 style="margin-top:20px">${i} ${esc(t)}</h3><p>${esc(d)}</p>`).join('')}
      <h3 style="margin-top:20px">📅 The path to fluency</h3>
      <p>By default the path lasts 6 weeks (you can choose 2 weeks to a year). The app spreads the remaining words evenly over the remaining days, so that the 1000 most frequent words — the core that covers most everyday speech — are introduced by your target date: about 24 new words per day on the 6-week plan, after which the rest of the 1600+ word deck follows at 10 per day, plus the reviews that fall due. Each week has a theme and short grammar lessons — pronouns, wanting and having, the present tense, <em>gā3id</em> for "-ing", <em>ma…sh</em> negation, the past tense, <em>bash</em> for the future, commands and conditionals — so the vocabulary turns into speech.</p>
      <h3 style="margin-top:20px">⏱ What a day looks like</h3>
      <ol><li>Clear the reviews that are due (they keep what you already know).</li><li>Learn today's new words. Each one is shown with audio and an example, then tested straight away.</li><li>Do one grammar lesson or a 2-minute practice drill.</li><li>Stop when you reach your XP goal. Coming back tomorrow does more than cramming today.</li></ol>
      <h3 style="margin-top:20px">📊 What the numbers mean</h3>
      <p><strong>Introduced</strong> means you have seen a word. <strong>Known</strong> means its memory stability is at least 7 days (you would very likely still recall it a week from now). <strong>Mature</strong> means at least 21 days. <strong>Retention</strong> is the share of due reviews you answered correctly over the last 30 days.</p>
      <p class="muted small">Scheduler: FSRS-4.5 memory model with default parameters, plus short learning steps (1 and 10 minutes) for new and lapsed cards.</p>
    </div>`;
});

function authForm(mode) {
  const isSignup = mode === 'signup';
  $app.innerHTML = `
    <div class="card pad-lg" style="max-width:420px;margin:24px auto">
      <h1 class="center">${isSignup ? 'Create your account' : 'Welcome back'}</h1>
      <p class="center muted">${isSignup ? 'Your progress, streaks and profile are saved to your account.' : 'Log in to continue your streak.'}</p>
      <form id="auth">
        ${isSignup
          ? `<div class="field"><label for="username">Username</label><input id="username" name="username" type="text" autocomplete="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_\\-]{1,30}[A-Za-z0-9]"><div class="hint">Shown on your public profile: /u/username</div></div>
             <div class="field"><label for="email">Email <span class="muted">(optional)</span></label><input id="email" name="email" type="email" autocomplete="email"></div>`
          : `<div class="field"><label for="login">Username or email</label><input id="login" name="login" type="text" autocomplete="username" required></div>`}
        <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" required minlength="${isSignup ? 8 : 1}"></div>
        ${isSignup
          ? `<div class="grid cols-2">
              <div class="field"><label for="dialect">Dialect</label><select id="dialect" name="dialect"><option value="libyan" selected>Libyan (default)</option><option value="msa">Modern Standard</option></select></div>
              <div class="field"><label for="targetDays">Target</label><select id="targetDays" name="targetDays"><option value="21">3 weeks (intense)</option><option value="42" selected>6 weeks</option><option value="56">8 weeks</option><option value="84">12 weeks (relaxed)</option></select></div>
            </div>`
          : ''}
        <div class="error" id="err"></div>
        <button class="btn primary block lg" type="submit">${isSignup ? 'Create account' : 'Log in'}</button>
      </form>
      <p class="center muted" style="margin-top:16px">${isSignup ? 'Already have an account? <a href="/login" data-link>Log in</a>' : 'New here? <a href="/signup" data-link>Create an account</a>'}</p>
    </div>`;
  const form = document.getElementById('auth');
  form.querySelector('input').focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const { user } = await api(isSignup ? '/api/auth/signup' : '/api/auth/login', { method: 'POST', body: { ...fd, tzOffset: tzOffset() } });
      state.user = user;
      state.words = null;
      const next = new URLSearchParams(location.search).get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : isSignup ? '/study' : '/dashboard', true);
      if (isSignup) toast('Welcome! Your first words are ready — أهلاً وسهلاً');
    } catch (err) {
      document.getElementById('err').textContent = err.message;
      btn.disabled = false;
    }
  });
}
route(/^\/login$/, async () => authForm('login'), { guest: true });
route(/^\/signup$/, async () => authForm('signup'), { guest: true });

// ------------------------------------------------------------------ dashboard
route(
  /^\/dashboard$/,
  async () => {
    const [s, q, lessons, profile] = await Promise.all([
      api('/api/stats'),
      api('/api/study/queue?limit=1'),
      api('/api/lessons'),
      api(`/api/users/${encodeURIComponent(state.user.username)}`),
    ]);
    const plan = q.plan;
    const week = plan.weeks[plan.currentWeek - 1];
    const weekLessons = lessons.lessons.filter((l) => l.week === plan.currentWeek);
    const nextLesson = lessons.lessons.find((l) => !l.done && l.week <= plan.currentWeek) ?? lessons.lessons.find((l) => !l.done);
    const todo = q.counts.due + q.counts.new;
    const days = ['Today', 'Tomorrow', ...Array.from({ length: 5 }, (_, i) => new Date(Date.now() + (i + 2) * 864e5).toLocaleDateString('en', { weekday: 'short' }))];
    const maxF = Math.max(1, ...s.forecast);
    const pctDeck = Math.round((100 * s.introduced) / Math.max(1, s.totalWords));
    $app.innerHTML = `
      <div class="spread" style="margin-bottom:18px">
        <div><h1 style="margin:0">مرحبا, ${esc(state.user.displayName)} 👋</h1>
        <div class="muted">Day ${plan.dayIndex} of ${plan.targetDays} · Week ${plan.currentWeek}: <strong>${esc(week.title)}</strong></div></div>
        <div class="row"><span class="badge orange">🔥 ${s.streak.current}-day streak</span><span class="badge blue">${esc(s.level.code)} · ${esc(s.level.label)}</span></div>
      </div>
      <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
        <div class="card pad-lg">
          <div class="spread">
            <div>
              <h2>Today's session</h2>
              <p class="muted" style="margin:0">${todo ? `${q.counts.due} review${q.counts.due === 1 ? '' : 's'} due · ${q.counts.new} new word${q.counts.new === 1 ? '' : 's'} (daily quota ${plan.newPerDay})` : 'All caught up! Come back later for more reviews, or do a practice drill.'}</p>
            </div>
            ${ring(s.today.xp, s.today.goal, `${s.today.xp}`, `of ${s.today.goal} XP`)}
          </div>
          <div class="row" style="margin-top:12px">
            <a href="/study" data-link class="btn primary lg" ${todo ? '' : 'aria-disabled="true"'}>${todo ? '▶ Start session' : '✓ Done for now'}</a>
            <a href="/practice" data-link class="btn lg">Practice drill</a>
            ${nextLesson ? `<a href="/lesson/${nextLesson.id}" data-link class="btn lg">📖 ${esc(nextLesson.title)}</a>` : ''}
          </div>
        </div>
        <div class="card">
          <h2>Week ${plan.currentWeek} goal</h2>
          <p class="small">${esc(week.goal)}</p>
          <div class="small muted">Word target by end of week: <strong>${week.wordTarget}</strong></div>
          <div class="progress" style="margin:8px 0 12px"><span style="width:${Math.min(100, (100 * s.introduced) / week.wordTarget)}%"></span></div>
          ${weekLessons.map((l) => `<div class="small"><a href="/lesson/${l.id}" data-link>${l.done ? '✅' : '⬜'} ${esc(l.title)}</a></div>`).join('')}
        </div>
      </div>
      <div class="grid cols-4" style="margin-top:16px">
        <div class="card stat"><div class="num">${fmtNum(s.introduced)}</div><div class="lbl">words introduced · ${pctDeck}% of deck</div></div>
        <div class="card stat"><div class="num">${fmtNum(s.known)}</div><div class="lbl">known (≥7-day memory)</div></div>
        <div class="card stat"><div class="num">${s.retention30 == null ? '—' : s.retention30 + '%'}</div><div class="lbl">retention, last 30 days</div></div>
        <div class="card stat"><div class="num">${fmtNum(s.minutes)}</div><div class="lbl">minutes studied</div></div>
      </div>
      <div class="card" style="margin-top:16px"><h2>Your contributions</h2>${heatmap(profile.contributions)}</div>
      <div class="grid cols-2" style="margin-top:16px">
        <div class="card"><h2>Review forecast</h2>
          <div class="bars">${s.forecast.map((n) => `<div style="height:${(100 * n) / maxF}%"><span>${n}</span></div>`).join('')}</div>
          <div class="bars-x">${days.map((d) => `<span>${d}</span>`).join('')}</div>
        </div>
        <div class="card"><h2>Path to fluency</h2>
          <p class="small muted">Level is estimated from known words. Conversational (B1) at ~800 known words.</p>
          <div class="spread small"><span>${esc(s.level.code)}</span><span>${s.level.next ? `${s.known} / ${s.level.next.at} → ${esc(s.level.next.code)}` : 'Top level'}</span></div>
          <div class="progress" style="margin:6px 0 14px"><span style="width:${s.level.next ? Math.min(100, (100 * (s.known - s.level.min)) / (s.level.next.at - s.level.min)) : 100}%"></span></div>
          <div class="small">Deck: ${fmtNum(s.introduced)} / ${fmtNum(s.totalWords)} words · Lessons: ${s.lessonsDone} / ${s.lessonsTotal}</div>
          <div class="small muted" style="margin-top:6px">${plan.remaining ? `${plan.remaining} of the core ${plan.core} words left over ${plan.daysLeft} days → ${plan.newPerDay}/day.` : plan.deckLeft ? `Core ${plan.core} words done! The remaining ${plan.deckLeft} words arrive at ${plan.newPerDay}/day.` : 'Every word is introduced — keep up the reviews to make them permanent.'}</div>
        </div>
      </div>`;
  },
  { auth: true },
);

// ------------------------------------------------------------------ study session
route(
  /^\/study$/,
  async () => {
    await loadWords();
    let data = await api('/api/study/queue?limit=80');
    let queue = data.items;
    const total0 = queue.length;
    const session = { done: 0, correct: 0, xp: 0, start: Date.now(), achievements: [] };
    let current = null;
    let phase = null; // 'intro' | 'quiz' | 'front' | 'back'
    let shownAt = 0;
    let typed = '';
    let keyHandler = null;

    const sessionTotal = () => session.done + queue.length;

    function header() {
      const pct = sessionTotal() ? (100 * session.done) / sessionTotal() : 0;
      return `<div class="study-top"><a href="/dashboard" data-link class="btn ghost" title="End session">✕</a>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <span class="small muted">${session.done}/${sessionTotal()}</span>
        <button class="btn ghost small" id="toggleTr" title="Toggle transliteration (T)">${state.showTr ? 'abc ✓' : 'abc'}</button>
        <button class="btn ghost small" id="toggleTts" title="Toggle auto audio">${state.tts ? '🔊' : '🔇'}</button></div>`;
    }

    function wordAnswer(w) {
      return `<div class="answer">
        <div class="row" style="justify-content:center"><span class="ar" style="font-size:2rem">${esc(w.ar)}</span>${speakBtn(w.ar)}</div>
        ${w.tr ? `<div class="tr">${esc(w.tr)}</div>` : ''}
        <div style="font-size:1.3rem;font-weight:600;margin-top:6px">${esc(w.en)}</div>
        ${w.alt && w.alt !== w.ar ? `<div class="small muted">${state.user.dialect === 'msa' ? 'Libyan' : 'MSA'}: <span class="ar">${esc(w.alt)}</span></div>` : ''}
        ${w.ex_ar ? `<div class="example"><span class="ar">${esc(w.ex_ar)}</span> ${speakBtn(w.ex_ar)}<div class="tr small">${esc(w.ex_tr)}</div><div class="small">${esc(w.ex_en)}</div></div>` : ''}
        ${w.note ? `<div class="note">💡 ${esc(w.note)}</div>` : ''}
      </div>`;
    }

    function show() {
      if (!queue.length) return finish();
      current = queue[0];
      typed = '';
      shownAt = Date.now();
      phase = current.kind === 'new' ? 'intro' : 'front';
      draw();
    }

    function draw() {
      const it = current;
      const w = it.word;
      let body = '';
      if (phase === 'intro') {
        body = `<div class="flash">
          <span class="kind badge blue">New word · #${w.rank} · ${esc(catLabel(w.cat))}</span>
          <div class="big-ar">${esc(w.ar)}</div>
          ${w.tr ? `<div class="tr" style="font-size:1.2rem">${esc(w.tr)}</div>` : ''}
          <div style="margin:8px 0">${speakBtn(w.ar)}</div>
          <div style="font-size:1.5rem;font-weight:600">${esc(w.en)}</div>
          <div class="small muted">${esc(w.pos)}</div>
          ${w.ex_ar ? `<div class="example" style="width:100%"><span class="ar">${esc(w.ex_ar)}</span> ${speakBtn(w.ex_ar)}<div class="tr small">${esc(w.ex_tr)}</div><div class="small">${esc(w.ex_en)}</div></div>` : ''}
          ${w.note ? `<div class="note">💡 ${esc(w.note)}</div>` : ''}
          <p class="small muted" style="margin-top:14px">Say it out loud, picture a scene with it — then test yourself.</p>
          <button class="btn primary lg" id="toQuiz">Test me <span class="kbd">Space</span></button>
        </div>`;
      } else if (phase === 'quiz') {
        const opts = it._opts;
        body = `<div class="flash">
          <span class="kind badge blue">Quick check</span>
          <div class="big-ar">${esc(w.ar)}</div>
          ${state.showTr && w.tr ? `<div class="tr">${esc(w.tr)}</div>` : ''}
          <div class="choices">${opts.map((o, i) => `<button class="btn choice" data-choice="${i}">${esc(o.en)} <span class="kbd">${i + 1}</span></button>`).join('')}</div>
        </div>`;
      } else {
        const isProd = it.direction === 'p';
        const front = isProd
          ? `<div class="big-en">${esc(w.en)}</div><div class="small muted">Say or type it in Libyan Arabic</div>`
          : `<div class="big-ar">${esc(w.ar)}</div>${state.showTr && w.tr ? `<div class="tr">${esc(w.tr)}</div>` : ''}<div style="margin-top:6px">${speakBtn(w.ar)}</div>`;
        const label = it.state === 'new' ? (isProd ? 'New production card' : 'New') : it.state === 'review' ? 'Review' : 'Learning';
        body = `<div class="flash">
          <span class="kind badge ${isProd ? 'orange' : 'green'}">${isProd ? 'English → Arabic' : 'Arabic → English'} · ${label}</span>
          ${front}
          ${phase === 'front'
            ? `<form class="typein" id="typeForm"><input id="typeIn" type="text" autocomplete="off" placeholder="${isProd ? 'type transliteration or Arabic (optional)' : 'type the meaning (optional)'}" aria-label="Your answer"></form>
               <button class="btn primary lg" id="reveal" style="margin-top:14px">Show answer <span class="kbd">Space</span></button>`
            : `${typed ? typedVerdict(typed, w, it.direction) : ''}${wordAnswer(w)}`}
        </div>
        ${phase === 'back'
          ? `<div class="grades">${[1, 2, 3, 4]
              .map((g) => `<button class="btn g${g}" data-grade="${g}">${['Again', 'Hard', 'Good', 'Easy'][g - 1]} <small>${esc(it.intervals?.[g] ?? '')} · ${g}</small></button>`)
              .join('')}</div><p class="small muted center" style="margin-top:8px">How well did you remember? Be honest — the schedule adapts to you.</p>`
          : ''}`;
      }
      $app.innerHTML = `<div class="study-wrap">${header()}${body}</div>`;
      bind();
      if (phase === 'intro' || (phase === 'front' && it.direction === 'r')) speak(w.ar);
      if (phase === 'back' && it.direction === 'p') speak(w.ar);
      document.getElementById('typeIn')?.focus();
    }

    function typedVerdict(input, w, dir) {
      const v = checkTyped(input, w, dir);
      const cls = v === 'wrong' ? 'diff-bad' : 'diff-ok';
      const msg = v === 'exact' ? '✓ Correct' : v === 'close' ? '≈ Close enough' : '✗ Not quite';
      return `<div class="${cls}" style="margin-top:12px">${msg}: “${esc(input)}”</div>`;
    }

    function bind() {
      document.getElementById('toggleTr')?.addEventListener('click', () => {
        state.showTr = !state.showTr;
        localStorage.setItem('showTr', state.showTr ? 'on' : 'off');
        draw();
      });
      document.getElementById('toggleTts')?.addEventListener('click', () => {
        state.tts = !state.tts;
        localStorage.setItem('tts', state.tts ? 'on' : 'off');
        draw();
      });
      document.getElementById('toQuiz')?.addEventListener('click', toQuiz);
      document.getElementById('reveal')?.addEventListener('click', reveal);
      document.getElementById('typeForm')?.addEventListener('submit', (e) => { e.preventDefault(); reveal(); });
      document.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.choice))));
      document.querySelectorAll('[data-grade]').forEach((b) => b.addEventListener('click', () => grade(Number(b.dataset.grade))));
    }

    function toQuiz() {
      current._opts = shuffle([current.word, ...distractors(current.word, 3)]);
      phase = 'quiz';
      draw();
    }

    let choosing = false;
    async function choose(i) {
      if (choosing) return;
      choosing = true;
      const correct = current._opts[i].id === current.word.id;
      const buttons = document.querySelectorAll('[data-choice]');
      buttons.forEach((b, j) => {
        if (current._opts[j].id === current.word.id) b.classList.add('correct');
        else if (j === i) b.classList.add('wrong');
        b.disabled = true;
      });
      speak(current.word.ar);
      await new Promise((r) => setTimeout(r, correct ? 650 : 1500));
      choosing = false;
      await submit(correct ? 3 : 1);
    }

    function reveal() {
      typed = document.getElementById('typeIn')?.value ?? '';
      phase = 'back';
      draw();
    }

    async function grade(g) {
      await submit(g);
    }

    let submitting = false;
    async function submit(g) {
      if (submitting) return;
      submitting = true;
      const it = current;
      try {
        const res = await api('/api/study/answer', {
          method: 'POST',
          body: { wordId: it.word.id, direction: it.direction, grade: g, msTaken: Date.now() - shownAt },
        });
        queue.shift();
        session.done++;
        if (g > 1) session.correct++;
        session.xp += res.xp;
        for (const a of res.achievements) {
          session.achievements.push(a);
          toast(`${a.icon} Achievement unlocked: <strong>${esc(a.title)}</strong>`);
        }
        if (res.unlockedProduction) toast(`✍️ <span class="ar">${esc(it.word.ar)}</span> unlocked a production card`);
        // Same-session relearning: bring learning cards back after a few others.
        if (res.card.state === 'learning' || res.card.state === 'relearning') {
          const gap = Math.min(queue.length, g === 1 ? 3 : 6);
          queue.splice(gap, 0, { ...it, kind: 'review', state: res.card.state, intervals: res.intervals });
        }
      } catch (err) {
        toast(esc(err.message), true);
      } finally {
        submitting = false;
      }
      show();
    }

    async function finish() {
      // Pull anything that became due meanwhile (e.g. production cards).
      data = await api('/api/study/queue?limit=80');
      if (data.items.some((x) => x.kind === 'review')) {
        queue = data.items.filter((x) => x.kind === 'review');
        if (queue.length) return show();
      }
      const mins = Math.max(1, Math.round((Date.now() - session.start) / 60000));
      const acc = session.done ? Math.round((100 * session.correct) / session.done) : 0;
      const s = await api('/api/stats');
      $app.innerHTML = `<div class="study-wrap"><div class="card pad-lg center">
        <div style="font-size:3rem">${session.done ? '🎉' : '✅'}</div>
        <h1>${session.done ? 'Session complete — برافو!' : 'Nothing due right now'}</h1>
        ${session.done
          ? `<div class="grid cols-4" style="margin:18px 0">
              <div class="stat"><div class="num">${session.done}</div><div class="lbl">cards</div></div>
              <div class="stat"><div class="num">${acc}%</div><div class="lbl">recalled</div></div>
              <div class="stat"><div class="num">+${session.xp}</div><div class="lbl">XP</div></div>
              <div class="stat"><div class="num">${mins}</div><div class="lbl">min</div></div></div>`
          : `<p class="muted">You've cleared today's reviews and new words. Your next reviews: ${s.forecast[0]} within 24h.</p>`}
        <p>Today: <strong>${s.today.xp}</strong> / ${s.today.goal} XP · 🔥 ${s.streak.current}-day streak</p>
        ${data.nextLearningAt ? `<p class="small muted">Learning cards come back in about ${Math.max(1, Math.round((data.nextLearningAt - Date.now()) / 60000))} min.</p>` : ''}
        <div class="row" style="justify-content:center;margin-top:12px">
          <a href="/dashboard" data-link class="btn">Dashboard</a>
          <a href="/practice" data-link class="btn primary">Practice drill</a>
          <a href="/path" data-link class="btn">Grammar path</a>
        </div></div></div>`;
    }

    keyHandler = (e) => {
      if (e.target.tagName === 'INPUT' && e.key !== 'Enter') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (phase === 'intro' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toQuiz(); }
      else if (phase === 'quiz' && /^[1-4]$/.test(e.key)) choose(Number(e.key) - 1);
      else if (phase === 'front' && e.key === ' ' && e.target.tagName !== 'INPUT') { e.preventDefault(); reveal(); }
      else if (phase === 'back' && /^[1-4]$/.test(e.key)) grade(Number(e.key));
      else if (phase === 'back' && e.key === ' ') { e.preventDefault(); grade(3); }
      else if ((e.key === 's' || e.key === 'S') && current) speak(current.word.ar, true);
      else if (e.key === 't' || e.key === 'T') document.getElementById('toggleTr')?.click();
    };
    document.addEventListener('keydown', keyHandler);

    if (!total0) await finish();
    else show();
    return () => document.removeEventListener('keydown', keyHandler);
  },
  { auth: true },
);

// ------------------------------------------------------------------ practice drills
route(
  /^\/practice$/,
  async () => {
    await loadWords();
    const cats = state.categories;
    $app.innerHTML = `
      <h1>Practice</h1>
      <p class="muted">Quick drills on words you have met. They don't change your review schedule, but they earn XP and add to your contribution graph. Mixing directions and senses strengthens retrieval.</p>
      <div class="grid cols-3">
        ${[
          ['ar-en', '👁️ Read', 'See Arabic, pick the meaning.'],
          ['en-ar', '✍️ Produce', 'See English, pick the Arabic.'],
          ['listen', '👂 Listen', 'Hear the word, pick the meaning.'],
        ]
          .map(([m, t, d]) => `<div class="card"><h3>${t}</h3><p class="muted small">${d}</p><button class="btn primary" data-mode="${m}">Start</button></div>`)
          .join('')}
      </div>
      <div class="card" style="margin-top:16px"><div class="row"><label for="cat" style="margin:0">Focus on a category:</label>
        <select id="cat" style="max-width:260px"><option value="">Mixed (recommended)</option>${cats.map((c) => `<option value="${esc(c)}">${esc(catLabel(c))}</option>`).join('')}</select></div></div>
      <div id="drill"></div>`;
    document.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => runDrill(b.dataset.mode, document.getElementById('cat').value)),
    );
  },
  { auth: true },
);

async function runDrill(mode, cat) {
  const { questions } = await api(`/api/drill?n=10${cat ? `&cat=${encodeURIComponent(cat)}` : ''}`);
  let i = 0, correct = 0;
  const start = Date.now();
  let locked = false;
  const onKey = (e) => { if (/^[1-4]$/.test(e.key)) pick(Number(e.key) - 1); else if (e.key === 's' || e.key === 'S') speak(questions[i]?.word.ar, true); };
  document.addEventListener('keydown', onKey);
  cleanup = () => document.removeEventListener('keydown', onKey);

  function drawQ() {
    if (i >= questions.length) return done();
    const q = questions[i];
    const prompt =
      mode === 'ar-en'
        ? `<div class="big-ar">${esc(q.word.ar)}</div>${state.showTr && q.word.tr ? `<div class="tr">${esc(q.word.tr)}</div>` : ''}`
        : mode === 'en-ar'
          ? `<div class="big-en">${esc(q.word.en)}</div>`
          : `<div style="margin:30px 0 10px"><button class="btn lg" data-speak="${esc(q.word.ar)}">🔊 Play again</button></div>`;
    const label = (o) => (mode === 'en-ar' ? `<span class="ar">${esc(o.ar)}</span>${o.tr ? `<div class="tr small">${esc(o.tr)}</div>` : ''}` : esc(o.en));
    $app.innerHTML = `<div class="study-wrap"><div class="study-top"><a href="/practice" data-link class="btn ghost">✕</a><div class="progress"><span style="width:${(100 * i) / questions.length}%"></span></div><span class="small muted">${i}/${questions.length}</span></div>
      <div class="flash"><span class="kind badge">Drill · ${esc(mode)}</span>${prompt}
      <div class="choices">${q.options.map((o, j) => `<button class="btn choice ${mode === 'en-ar' ? 'ar-choice' : ''}" data-c="${j}">${label(o)}</button>`).join('')}</div></div></div>`;
    document.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => pick(Number(b.dataset.c))));
    if (mode !== 'en-ar') speak(q.word.ar, mode === 'listen');
  }
  async function pick(j) {
    if (locked || i >= questions.length) return;
    locked = true;
    const q = questions[i];
    const ok = j === q.answer;
    if (ok) correct++;
    document.querySelectorAll('[data-c]').forEach((b, k) => {
      if (k === q.answer) b.classList.add('correct');
      else if (k === j) b.classList.add('wrong');
      b.disabled = true;
    });
    if (mode === 'en-ar') speak(q.word.ar);
    await new Promise((r) => setTimeout(r, ok ? 600 : 1600));
    locked = false;
    i++;
    drawQ();
  }
  async function done() {
    document.removeEventListener('keydown', onKey);
    const res = await api('/api/drill/result', { method: 'POST', body: { correct, total: questions.length, msTaken: Date.now() - start } });
    for (const a of res.achievements) toast(`${a.icon} Achievement unlocked: <strong>${esc(a.title)}</strong>`);
    $app.innerHTML = `<div class="study-wrap"><div class="card pad-lg center"><div style="font-size:3rem">${correct >= questions.length * 0.8 ? '🌟' : '💪'}</div>
      <h1>${correct} / ${questions.length}</h1><p>+${res.xp} XP</p>
      <div class="row" style="justify-content:center"><a href="/practice" data-link class="btn primary">Another drill</a><a href="/dashboard" data-link class="btn">Dashboard</a></div></div></div>`;
  }
  drawQ();
}

// ------------------------------------------------------------------ path & lessons
route(
  /^\/path$/,
  async () => {
    const [{ lessons }, plan] = await Promise.all([api('/api/lessons'), api('/api/plan')]);
    $app.innerHTML = `
      <h1>Your path to fluency</h1>
      <p class="muted">${plan.targetDays}-day plan · you're on day ${plan.dayIndex} · ${plan.newPerDay} new words/day. Change the length in <a href="/settings" data-link>settings</a>.</p>
      <div class="stack" style="margin-top:20px">
      ${plan.weeks
        .map((w) => {
          const ls = lessons.filter((l) => l.week === w.week);
          const allDone = ls.every((l) => l.done);
          const cls = w.week === plan.currentWeek ? 'current' : w.week < plan.currentWeek && allDone ? 'done' : '';
          return `<div class="week ${cls}">
            <div class="spread"><h2 style="margin:0">Week ${w.week} · ${esc(w.title)}</h2><span class="small muted">from day ${w.startsDay} · target ${w.wordTarget} words</span></div>
            <p class="muted">${esc(w.goal)}</p>
            ${ls.map((l) => `<a class="lesson-row" href="/lesson/${l.id}" data-link><span class="check ${l.done ? 'on' : ''}">${l.done ? '✓' : ''}</span><span><strong>${esc(l.title)}</strong><br><span class="small muted">${esc(l.summary)}</span></span>${l.done ? `<span class="badge green" style="margin-left:auto">${l.done.score}/${l.questions}</span>` : '<span class="badge" style="margin-left:auto">+XP</span>'}</a>`).join('')}
          </div>`;
        })
        .join('')}
      </div>`;
  },
  { auth: true },
);

route(
  /^\/lesson\/([\w-]+)$/,
  async (id) => {
    const { lesson } = await api(`/api/lessons/${encodeURIComponent(id)}`);
    const section = (s) => `
      <h3>${esc(s.h)}</h3>
      ${s.p ? `<p>${esc(s.p)}</p>` : ''}
      ${s.table ? `<table>${s.table.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 ? `${esc(c)}` : i === 1 ? `<span class="tr">${esc(c)}</span>` : esc(c)}</td>`).join('')}<td style="width:1%">${/[؀-ۿ]/.test(r[0]) ? speakBtn(r[0].split('/')[0]) : ''}</td></tr>`).join('')}</table>` : ''}
      ${s.examples ? `<table>${s.examples.map(([a, t, e]) => `<tr><td>${esc(a)}</td><td><span class="tr">${esc(t)}</span><br>${esc(e)}</td><td style="width:1%">${speakBtn(a)}</td></tr>`).join('')}</table>` : ''}`;
    $app.innerHTML = `
      <div class="card pad-lg lesson-body" style="max-width:820px;margin:0 auto">
        <a href="/path" data-link class="small">← Path</a>
        <h1 style="margin-top:8px">${esc(lesson.title)}</h1>
        <p class="muted">Week ${lesson.week} · ${esc(lesson.summary)}</p>
        ${lesson.body.map(section).join('')}
        <hr style="border:none;border-top:1px solid var(--border);margin:24px 0">
        <h2>Check yourself</h2>
        <p class="muted small">Retrieval right after studying fixes the pattern in memory. Answer from memory, without scrolling up.</p>
        <div id="quiz"></div>
      </div>`;
    const quiz = lesson.quiz.map((q) => {
      const order = shuffle(q.options.map((_, i) => i));
      return { ...q, order };
    });
    let idx = 0, score = 0;
    const box = document.getElementById('quiz');
    function drawQ() {
      if (idx >= quiz.length) return finishQuiz();
      const q = quiz[idx];
      box.innerHTML = `<p><strong>${idx + 1}/${quiz.length}.</strong> ${esc(q.q)}</p>
        <div class="choices" style="margin-top:8px">${q.order.map((oi) => `<button class="btn choice" data-o="${oi}">${esc(q.options[oi])}</button>`).join('')}</div>`;
      box.querySelectorAll('[data-o]').forEach((b) =>
        b.addEventListener('click', async () => {
          const oi = Number(b.dataset.o);
          const ok = oi === q.answer;
          if (ok) score++;
          box.querySelectorAll('[data-o]').forEach((x) => {
            if (Number(x.dataset.o) === q.answer) x.classList.add('correct');
            else if (x === b) x.classList.add('wrong');
            x.disabled = true;
          });
          await new Promise((r) => setTimeout(r, ok ? 600 : 1500));
          idx++;
          drawQ();
        }),
      );
    }
    async function finishQuiz() {
      const res = await api(`/api/lessons/${encodeURIComponent(id)}/complete`, { method: 'POST', body: { score } });
      for (const a of res.achievements) toast(`${a.icon} Achievement unlocked: <strong>${esc(a.title)}</strong>`);
      box.innerHTML = `<div class="center"><h2>${score} / ${quiz.length}</h2>${res.xp ? `<p>+${res.xp} XP · lesson complete ✅</p>` : '<p class="muted">Lesson already completed — nice refresher.</p>'}
        <div class="row" style="justify-content:center"><button class="btn" id="retry">Retry quiz</button><a href="/path" data-link class="btn primary">Back to path</a><a href="/study" data-link class="btn">Study cards</a></div></div>`;
      document.getElementById('retry').addEventListener('click', () => { idx = 0; score = 0; drawQ(); });
    }
    drawQ();
  },
  { auth: true },
);

// ------------------------------------------------------------------ word browser
route(/^\/words$/, async () => {
  await loadWords();
  let status = new Map();
  if (state.user) {
    const { cards } = await api('/api/words/status');
    for (const c of cards) {
      const s = status.get(c.word_id) ?? {};
      s[c.direction] = c;
      status.set(c.word_id, s);
    }
  }
  const badge = (id) => {
    const s = status.get(id);
    if (!s?.r) return '<span class="badge">new</span>';
    if (s.r.stability >= 21) return '<span class="badge blue">mature</span>';
    if (s.r.stability >= 7) return '<span class="badge green">known</span>';
    return '<span class="badge orange">learning</span>';
  };
  $app.innerHTML = `
    <div class="spread"><h1 style="margin:0">Word deck <span class="muted" style="font-weight:400">(${state.words.length})</span></h1></div>
    <p class="muted">Every card in frequency order. Words are introduced from the top down; categories are interleaved.</p>
    <div class="card"><div class="grid cols-3">
      <input type="search" id="q" placeholder="Search Arabic, transliteration or English…" aria-label="Search words">
      <select id="fc"><option value="">All categories</option>${state.categories.map((c) => `<option value="${esc(c)}">${esc(catLabel(c))} (${state.words.filter((w) => w.cat === c).length})</option>`).join('')}</select>
      ${state.user ? '<select id="fs"><option value="">Any status</option><option value="new">Not started</option><option value="learning">Learning</option><option value="known">Known</option><option value="mature">Mature</option></select>' : '<span></span>'}
    </div></div>
    <div class="card" style="margin-top:12px;padding:0;overflow-x:auto"><table class="table"><thead><tr><th>#</th><th style="text-align:right">Arabic</th><th>Transliteration</th><th>English</th><th>Category</th>${state.user ? '<th>Status</th>' : ''}<th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="center" style="margin-top:12px"><button class="btn" id="more">Show more</button></div>`;
  let limit = 100;
  const statusOf = (id) => {
    const s = status.get(id)?.r;
    if (!s) return 'new';
    return s.stability >= 21 ? 'mature' : s.stability >= 7 ? 'known' : 'learning';
  };
  function draw() {
    const q = document.getElementById('q').value.trim().toLowerCase();
    const qa = normArabic(q);
    const c = document.getElementById('fc').value;
    const fs = document.getElementById('fs')?.value ?? '';
    const list = state.words.filter(
      (w) =>
        (!c || w.cat === c) &&
        (!fs || statusOf(w.id) === fs) &&
        (!q || w.en.toLowerCase().includes(q) || normLatin(w.tr).includes(normLatin(q)) || (qa && normArabic(w.ar).includes(qa))),
    );
    document.getElementById('rows').innerHTML = list
      .slice(0, limit)
      .map(
        (w) => `<tr title="${esc(w.ex_ar ? `${w.ex_ar} — ${w.ex_en}` : '')}"><td class="muted small">${w.rank}</td><td class="ar">${esc(w.ar)}</td><td class="tr">${esc(w.tr)}</td><td>${esc(w.en)}${w.note ? `<div class="small muted">${esc(w.note)}</div>` : ''}</td><td class="small">${esc(catLabel(w.cat))}</td>${state.user ? `<td>${badge(w.id)}</td>` : ''}<td>${speakBtn(w.ar)}</td></tr>`,
      )
      .join('') || `<tr><td colspan="7" class="empty">No matching words.</td></tr>`;
    document.getElementById('more').classList.toggle('hidden', list.length <= limit);
  }
  for (const id of ['q', 'fc', 'fs']) document.getElementById(id)?.addEventListener('input', () => { limit = 100; draw(); });
  document.getElementById('more').addEventListener('click', () => { limit += 200; draw(); });
  draw();
});

// ------------------------------------------------------------------ profile (GitHub-style)
function eventText(e) {
  const d = e.data;
  switch (e.kind) {
    case 'joined': return '🎉 Joined Darija Libya';
    case 'milestone': return `📈 Reached <strong>${fmtNum(d.words)}</strong> word${d.words === 1 ? '' : 's'}`;
    case 'achievement': return `${esc(d.icon)} Unlocked <strong>${esc(d.title)}</strong>`;
    case 'lesson': return `📖 Completed lesson <strong>${esc(d.title)}</strong> (${d.score}/${d.of})`;
    default: return esc(e.kind);
  }
}

route(/^\/u\/([A-Za-z0-9_-]+)$/, async (username) => {
  const data = await api(`/api/users/${encodeURIComponent(username)}`);
  const { profile: p, stats: s } = data;
  const have = new Set(data.achievements.map((a) => a.code));
  const cats = Object.entries(s.categories).sort((a, b) => b[1].introduced / b[1].total - a[1].introduced / a[1].total);
  $app.innerHTML = `
    <div class="side-layout">
      <aside>
        ${identicon(p.username)}
        <div class="profile-name">${esc(p.displayName)}</div>
        <div class="profile-user">${esc(p.username)}</div>
        ${p.bio ? `<p style="margin-top:10px">${esc(p.bio)}</p>` : ''}
        ${p.isSelf
          ? `<a href="/settings" data-link class="btn block" style="margin:12px 0">Edit profile</a>`
          : state.user
            ? `<button class="btn block ${p.isFollowing ? '' : 'primary'}" id="follow" style="margin:12px 0">${p.isFollowing ? 'Unfollow' : 'Follow'}</button>`
            : ''}
        <div class="small muted">👥 <strong style="color:var(--text)">${p.followers}</strong> followers · <strong style="color:var(--text)">${p.following}</strong> following</div>
        <div class="small muted" style="margin-top:6px">🗣️ ${p.dialect === 'libyan' ? 'Libyan Arabic' : 'Modern Standard Arabic'}</div>
        <div class="small muted">📅 Joined ${new Date(p.joinedAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</div>
        ${!p.isPublic ? '<div class="small" style="margin-top:6px">🔒 Private profile (only you can see it)</div>' : ''}
        <div class="card" style="margin-top:16px">
          <h3>Level</h3>
          <div style="font-size:1.6rem;font-weight:700">${esc(s.level.code)}</div>
          <div class="small muted">${esc(s.level.label)}</div>
        </div>
      </aside>
      <section class="stack">
        <div class="grid cols-4">
          <div class="card stat"><div class="num">${fmtNum(s.known)}</div><div class="lbl">words known</div></div>
          <div class="card stat"><div class="num">${fmtNum(s.introduced)}</div><div class="lbl">of ${fmtNum(s.totalWords)} introduced</div></div>
          <div class="card stat"><div class="num">🔥 ${s.streak.current}</div><div class="lbl">day streak (best ${s.streak.longest})</div></div>
          <div class="card stat"><div class="num">${fmtNum(s.xp)}</div><div class="lbl">total XP</div></div>
        </div>
        <div class="card"><h2>${fmtNum(s.reviews)} reviews · ${fmtNum(s.minutes)} minutes</h2>${heatmap(data.contributions)}</div>
        <div class="grid cols-2">
          <div class="card"><h2>Achievements <span class="muted small">${data.achievements.length}/${data.allAchievements.length}</span></h2>
            <div class="achievements">${data.allAchievements.map((a) => `<div class="ach ${have.has(a.code) ? '' : 'locked'}" title="${esc(a.desc)}"><div class="i">${a.icon}</div><div class="t">${esc(a.title)}</div><div class="d">${esc(a.desc)}</div></div>`).join('')}</div>
          </div>
          <div class="card"><h2>Activity</h2>
            ${data.events.length ? `<ul class="timeline">${data.events.map((e) => `<li><span>${eventText(e)}</span><span class="when">${timeAgo(e.ts)}</span></li>`).join('')}</ul>` : '<div class="empty">No activity yet.</div>'}
          </div>
        </div>
        <div class="card"><h2>Vocabulary by topic</h2>
          ${cats.map(([c, v]) => `<div class="catbar"><span>${esc(catLabel(c))}</span><div class="progress" title="${v.known} known, ${v.introduced} introduced of ${v.total}"><span style="width:${(100 * v.introduced) / v.total}%;background:var(--heat-2)"></span></div><span class="muted small">${v.introduced}/${v.total}</span></div>`).join('')}
        </div>
      </section>
    </div>`;
  document.getElementById('follow')?.addEventListener('click', async () => {
    await api(`/api/users/${encodeURIComponent(p.username)}/follow`, { method: 'POST', body: { follow: !p.isFollowing } });
    render();
  });
});

// ------------------------------------------------------------------ community
route(/^\/leaderboard$/, async () => {
  const period = new URLSearchParams(location.search).get('period') === 'all' ? 'all' : 'week';
  const [lb, feed] = await Promise.all([api(`/api/leaderboard?period=${period}`), state.user ? api('/api/feed') : Promise.resolve(null)]);
  $app.innerHTML = `
    <div class="grid" style="grid-template-columns:minmax(0,3fr) minmax(0,2fr)">
      <div class="card">
        <div class="spread"><h2 style="margin:0">Leaderboard</h2>
          <div class="row"><a class="btn ${period === 'week' ? 'primary' : ''}" href="/leaderboard" data-link>This week</a><a class="btn ${period === 'all' ? 'primary' : ''}" href="/leaderboard?period=all" data-link>All time</a></div></div>
        ${lb.rows.length
          ? `<table class="table" style="margin-top:12px"><thead><tr><th>#</th><th>Learner</th><th>XP</th><th>New words</th><th>Reviews</th></tr></thead><tbody>
            ${lb.rows.map((r, i) => `<tr><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td><a href="/u/${esc(r.username)}" data-link class="row" style="gap:8px">${identicon(r.username, 'avatar sm')} ${esc(r.display_name)} <span class="muted small">@${esc(r.username)}</span></a></td><td><strong>${fmtNum(r.xp)}</strong></td><td>${fmtNum(r.words)}</td><td>${fmtNum(r.reviews)}</td></tr>`).join('')}
            </tbody></table>`
          : '<div class="empty">No activity yet this period — be the first!</div>'}
      </div>
      <div class="stack">
        ${feed
          ? `<div class="card"><h2>Feed</h2><p class="small muted">You and the people you follow.</p>${feed.events.length ? `<ul class="timeline">${feed.events.map((e) => `<li><span><a href="/u/${esc(e.username)}" data-link>${esc(e.display_name)}</a> · ${eventText(e)}</span><span class="when">${timeAgo(e.ts)}</span></li>`).join('')}</ul>` : '<div class="empty">Follow learners to see their milestones here.</div>'}</div>`
          : ''}
        <div class="card"><h2>Find learners</h2><input type="search" id="us" placeholder="Search by username…"><div id="ures" style="margin-top:8px"></div></div>
      </div>
    </div>`;
  const input = document.getElementById('us');
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const { users } = await api(`/api/users?q=${encodeURIComponent(input.value)}`);
      document.getElementById('ures').innerHTML = users.map((u) => `<div style="padding:4px 0"><a href="/u/${esc(u.username)}" data-link class="row" style="gap:8px">${identicon(u.username, 'avatar sm')} ${esc(u.display_name)} <span class="muted small">@${esc(u.username)}</span></a></div>`).join('') || '<div class="muted small">No users found.</div>';
    }, 200);
  });
});

// ------------------------------------------------------------------ settings
route(
  /^\/settings$/,
  async () => {
    const u = state.user;
    const theme = localStorage.getItem('theme') || 'auto';
    $app.innerHTML = `
      <div style="max-width:720px;margin:0 auto" class="stack">
        <h1>Settings</h1>
        <form class="card" id="prof">
          <h2>Profile</h2>
          <div class="field"><label for="displayName">Display name</label><input id="displayName" name="displayName" type="text" maxlength="60" value="${esc(u.displayName)}"></div>
          <div class="field"><label for="bio">Bio</label><textarea id="bio" name="bio" maxlength="280" rows="2">${esc(u.bio)}</textarea></div>
          <div class="field"><label><input type="checkbox" name="isPublic" ${u.isPublic ? 'checked' : ''}> Public profile and leaderboard</label></div>
          <h2 style="margin-top:20px">Learning</h2>
          <div class="grid cols-2">
            <div class="field"><label for="dialect">Dialect</label><select id="dialect" name="dialect"><option value="libyan" ${u.dialect === 'libyan' ? 'selected' : ''}>Libyan Arabic</option><option value="msa" ${u.dialect === 'msa' ? 'selected' : ''}>Modern Standard Arabic</option></select><div class="hint">Libyan is the default. MSA shows the standard form on the front of each card.</div></div>
            <div class="field"><label for="targetDays">Fluency target (days)</label><input id="targetDays" name="targetDays" type="number" min="14" max="365" value="${u.targetDays}"><div class="hint">Sets how many new words you get each day.</div></div>
            <div class="field"><label for="dailyGoalXp">Daily XP goal</label><input id="dailyGoalXp" name="dailyGoalXp" type="number" min="30" max="2000" step="10" value="${u.dailyGoalXp}"></div>
            <div class="field"><label for="retention">Target retention</label><select id="retention" name="retention">${[0.85, 0.88, 0.9, 0.92, 0.95].map((r) => `<option value="${r}" ${Math.abs(u.retention - r) < 0.001 ? 'selected' : ''}>${Math.round(r * 100)}%${r === 0.9 ? ' (recommended)' : ''}</option>`).join('')}</select><div class="hint">Higher means more reviews and less forgetting.</div></div>
          </div>
          <button class="btn primary" type="submit">Save</button>
        </form>
        <div class="card"><h2>Appearance & audio</h2>
          <div class="grid cols-2">
            <div class="field"><label for="theme">Theme</label><select id="theme"><option value="auto" ${theme === 'auto' ? 'selected' : ''}>System</option><option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option></select></div>
            <div class="field"><label><input type="checkbox" id="tts" ${state.tts ? 'checked' : ''}> Play audio automatically</label><div class="hint">${arVoice ? `Voice: ${esc(arVoice.name)} (${esc(arVoice.lang)})` : 'No Arabic voice found on this device. Install one in your OS speech settings.'}</div></div>
          </div>
        </div>
        <form class="card" id="pw"><h2>Change password</h2>
          <div class="grid cols-2"><div class="field"><label for="cur">Current password</label><input id="cur" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="nw">New password</label><input id="nw" type="password" minlength="8" autocomplete="new-password" required></div></div>
          <div class="error" id="pwerr"></div><button class="btn" type="submit">Update password</button></form>
        <div class="card"><h2>Account</h2>
          <div class="row"><button class="btn" id="logout">Log out</button><button class="btn danger" id="reset">Reset all progress…</button></div></div>
      </div>`;
    document.getElementById('prof').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd);
      body.isPublic = fd.has('isPublic');
      const { user } = await api('/api/me', { method: 'PATCH', body });
      if (user.dialect !== state.user.dialect) state.words = null;
      state.user = user;
      toast('Settings saved');
      renderNav();
    });
    document.getElementById('theme').addEventListener('change', (e) => { localStorage.setItem('theme', e.target.value); applyTheme(); });
    document.getElementById('tts').addEventListener('change', (e) => { state.tts = e.target.checked; localStorage.setItem('tts', state.tts ? 'on' : 'off'); });
    document.getElementById('pw').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/me/password', { method: 'POST', body: { current: document.getElementById('cur').value, next: document.getElementById('nw').value } });
        e.target.reset();
        document.getElementById('pwerr').textContent = '';
        toast('Password updated');
      } catch (err) {
        document.getElementById('pwerr').textContent = err.message;
      }
    });
    document.getElementById('logout').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST', body: {} });
      state.user = null;
      navigate('/');
    });
    document.getElementById('reset').addEventListener('click', async () => {
      const confirm = prompt(`This permanently deletes all your cards, history and achievements.\nType your username (${u.username}) to confirm:`);
      if (confirm == null) return;
      try {
        await api('/api/me/reset-progress', { method: 'POST', body: { confirm } });
        toast('Progress reset. Fresh start!');
        navigate('/dashboard');
      } catch (err) {
        toast(esc(err.message), true);
      }
    });
  },
  { auth: true },
);

// ------------------------------------------------------------------ boot
function applyTheme() {
  const t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme();

(async () => {
  try {
    const { user } = await api('/api/me');
    state.user = user;
  } catch {
    state.user = null;
  }
  render();
})();
