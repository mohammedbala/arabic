// Kalima (كلمة) — Wordle for Libyan Arabic words.
// Guess the Libyan word for an English clue in six tries. Tiles read
// right-to-left; green = right letter in the right place, yellow = in the
// word elsewhere, grey = not in the word. Daily mode is one shared word;
// practice is a run of words that ends on the first miss (or "Finish").
import { AR_FONT, UI_FONT, arLetters, isSingleWord, normAr, hashString, mulberry32, shuffle } from './common.js';

const ROWS = 6;
// Standard Arabic layout (as on Arabic-101 / Gboard): rows read left → right,
// ض top-left, ش under it. Row 3 keeps the 101 order ئ ء ؤ ر … ة و ز ظ, with
// ذ and د (top-row edge keys on a PC) at its ends, as on Gboard.
const KB_ROWS = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ذ', 'ئ', 'ء', 'ؤ', 'ر', 'ة', 'و', 'ز', 'ظ', 'د'],
];
const LETTERS = new Set(KB_ROWS.flat());
// Physical keys: Arabic characters typed directly, normalised to the key set.
const AR_KEY_ALIASES = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ی': 'ي', 'ک': 'ك' };
// A Latin keyboard types the standard Arabic (101) layout by key position.
// KeyB is لا (two letters) and is handled separately.
const CODE_MAP = {
  KeyQ: 'ض', KeyW: 'ص', KeyE: 'ث', KeyR: 'ق', KeyT: 'ف', KeyY: 'غ', KeyU: 'ع', KeyI: 'ه', KeyO: 'خ', KeyP: 'ح',
  BracketLeft: 'ج', BracketRight: 'د', KeyA: 'ش', KeyS: 'س', KeyD: 'ي', KeyF: 'ب', KeyG: 'ل', KeyH: 'ا', KeyJ: 'ت',
  KeyK: 'ن', KeyL: 'م', Semicolon: 'ك', Quote: 'ط', KeyZ: 'ئ', KeyX: 'ء', KeyC: 'ؤ', KeyV: 'ر', KeyN: 'ي', KeyM: 'ة',
  Comma: 'و', Period: 'ز', Slash: 'ظ', Backquote: 'ذ',
};
const STATE_RANK = { absent: 1, present: 2, correct: 3 };
const EMOJI = { correct: '🟩', present: '🟨', absent: '⬛' };
const KEYCAP = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
const PRAISE = [
  null,
  ['عبقري!', 'Genius'],
  ['مذهل!', 'Magnificent'],
  ['ممتاز!', 'Impressive'],
  ['باهي!', 'Splendid'],
  ['زين!', 'Great'],
  ['الحمد لله!', 'Phew'],
];
const CATS = {
  pronouns: ['👤', 'Pronoun'], questions: ['❓', 'Question word'], prepositions: ['🔗', 'Preposition'],
  conjunctions: ['➕', 'Connector'], adverbs: ['⏩', 'Adverb'], time: ['⏰', 'Time'], numbers: ['🔢', 'Number'],
  'verbs-core': ['⚙️', 'Core verb'], 'verbs-motion': ['🏃', 'Motion verb'], 'verbs-communication': ['💬', 'Talking verb'],
  'verbs-daily': ['🧺', 'Everyday verb'], 'verbs-mind': ['🧠', 'Thinking verb'], 'verbs-work': ['🛠️', 'Work verb'],
  greetings: ['👋', 'Greeting'], social: ['🤝', 'Social'], adjectives: ['🎨', 'Adjective'], emotions: ['😊', 'Emotion'],
  people: ['🧑', 'People'], family: ['👪', 'Family'], body: ['🖐️', 'Body'], health: ['🩺', 'Health'],
  clothing: ['👕', 'Clothing'], home: ['🏠', 'Home'], food: ['🍞', 'Food'], drink: ['🥤', 'Drink'],
  kitchen: ['🍳', 'Kitchen'], shopping: ['🛍️', 'Shopping'], colors: ['🌈', 'Colour'], city: ['🏙️', 'City'],
  travel: ['✈️', 'Travel'], nature: ['🌿', 'Nature'], animals: ['🐪', 'Animal'], work: ['💼', 'Work'],
  school: ['🎒', 'School'], tech: ['📱', 'Tech'], culture: ['🎭', 'Culture'], tools: ['🔧', 'Tools'],
  cars: ['🚗', 'Cars'], admin: ['📋', 'Paperwork'], agriculture: ['🌾', 'Farming'], media: ['📺', 'Media'],
  sports: ['⚽', 'Sports'], abstract: ['💭', 'Idea'], religion: ['🕌', 'Religion'], measures: ['📏', 'Measure'],
};
const STATS_KEY = 'arcade-kalima-stats';
// The daily word in progress, so leaving or reloading resumes the same board.
const PROGRESS_KEY = 'arcade-kalima-progress';
// Fixed seed of the daily word order: a permutation of the pool, one word per
// day, so a word never comes back until the whole pool has been used.
const DAILY_ORDER_SEED = 'kalima-daily-order-v1';

const readJSON = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const writeJSON = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

/** Wordle-style local stats for the daily word: played, wins, streaks, guess distribution. Idempotent per day. */
function recordDaily(day, won, tries) {
  let st = readJSON(STATS_KEY);
  st = st && typeof st === 'object' ? st : {};
  st = { played: 0, wins: 0, streak: 0, best: 0, last: 0, lastWin: 0, dist: [0, 0, 0, 0, 0, 0], ...st };
  if (st.last !== day) {
    st.played++;
    st.last = day;
    if (won) {
      st.wins++;
      st.streak = st.lastWin === day - 1 ? st.streak + 1 : 1;
      st.lastWin = day;
      st.best = Math.max(st.best, st.streak);
      st.dist[tries - 1] = (st.dist[tries - 1] ?? 0) + 1;
    } else st.streak = 0;
    writeJSON(STATS_KEY, st);
  }
  return st;
}
const catLabel = (cat) => CATS[cat] ?? ['🏷️', String(cat ?? 'Word').replace(/^verbs-/, '').replace(/^\w/, (c) => c.toUpperCase())];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lettersOf = (w) => arLetters(w.ar);
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const leaksTr = (clue, tr) => {
  const c = fold(clue);
  const t = fold(tr);
  return c.length >= 3 && t.length >= 3 && (c === t || c.includes(t) || t.includes(c));
};
const keyOf = (w) => lettersOf(w).join('');

function wordFilter(w) {
  if (w.pos === 'phrase' || !isSingleWord(w)) return false;
  const n = arLetters(w.ar).length;
  if (n < 3 || n > 6) return false;
  // Every base character must be on the keyboard (drops e.g. ڨ spellings).
  return [...normAr(w.ar)].every((c) => LETTERS.has(c));
}

// ------------------------------------------------------------ English senses
/** English senses of a gloss, split on ';' outside parentheses. */
function senses(en) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of String(en ?? '')) {
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    if (c === ';' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
const PAREN = /\s*\(([^)]*)\)/g;
const stripParens = (s) => String(s).replace(PAREN, '').replace(/\s+/g, ' ').trim();
const normSense = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[“”"’']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?,:]+$/, '')
    .trim();
const GENDER = { fem: 'f', female: 'f', woman: 'f', f: 'f', masc: 'm', male: 'm', man: 'm', m: 'm' };
/** A sense as { base, qual }: "this (f.)" → { base: 'this', qual: 'f' }; "you (m. sg.)" → qual 'm sg'. */
function senseInfo(s) {
  const qual = [...String(s).matchAll(PAREN)]
    .map((m) => m[1])
    .join(' ')
    .toLowerCase()
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => GENDER[t] ?? t)
    .join(' ');
  return { base: normSense(stripParens(s)), qual };
}
const FEM = /(^|\s)f(\s|$)/;
/**
 * Does sense `a` answer the clue sense `t`? Same meaning, and the qualifiers
 * do not contradict: "this (m.)" ≠ "this (f.)", and an unmarked form does not
 * answer an explicitly feminine clue.
 */
function senseMatches(a, t) {
  if (!a.base || a.base !== t.base) return false;
  if (a.qual && t.qual) return a.qual === t.qual;
  if (t.qual && !a.qual && FEM.test(t.qual)) return false;
  return true;
}
const clueSense = (word) => senseInfo(senses(word.en)[0] ?? '');

/**
 * The English clue: the first sense with its short qualifiers kept, so
 * "this (m.)" and "this (f.)", or "to wake up" and "to wake (someone) up",
 * stay distinguishable.
 */
function clueEn(word) {
  const first = senses(word.en)[0] ?? '';
  const base = stripParens(first);
  let t = first;
  // Names glossed by their own transliteration ("bazin (barley dough dome…)")
  // would give the answer away: clue with the description instead.
  if (leaksTr(base, word.tr)) {
    const desc = [...first.matchAll(PAREN)].map((m) => m[1].trim()).find((p) => p.includes(' '));
    if (desc) t = desc;
  }
  // Drop parentheticals that contain Arabic or spell the answer out.
  t = t.replace(PAREN, (m, p) => (/[؀-ۿ]/.test(p) || leaksTr(p, word.tr) ? '' : m)).replace(/\s+/g, ' ').trim();
  // Too long: drop the long parentheticals, keep the short qualifiers.
  if (t.length > 34) t = t.replace(PAREN, (m, p) => (p.length <= 14 ? m : '')).replace(/\s+/g, ' ').trim();
  if (t.length > 34) {
    t = t.slice(0, 33).replace(/\s+\S*$/, '');
    if ((t.match(/\(/g) ?? []).length > (t.match(/\)/g) ?? []).length) t = t.slice(0, t.lastIndexOf('(')).trim();
    t += '…';
  }
  return t && t !== '…' ? t : base.slice(0, 34) || String(word.en).slice(0, 34);
}

/** Wordle colouring with correct duplicate handling: greens first, then yellows from what is left. */
function evaluate(guess, target) {
  const res = Array(target.length).fill('absent');
  const left = new Map();
  target.forEach((ch, i) => {
    if (guess[i] === ch) res[i] = 'correct';
    else left.set(ch, (left.get(ch) ?? 0) + 1);
  });
  guess.forEach((ch, i) => {
    if (res[i] === 'correct') return;
    const n = left.get(ch) ?? 0;
    if (n > 0) {
      res[i] = 'present';
      left.set(ch, n - 1);
    }
  });
  return res;
}

const CSS = `
.g-kalima {
  --green: #538d4e; --yellow: #c9a227; --gray: #3a3f4b; --empty: #343b4c; --filled: #8e98ad;
  --key: #5a6377; --key-absent: #262b36; --tile: 48px; --gap: 5px; --n: 5; --key-h: 46px; --enter-h: 44px;
  --key-fs: 20px; --kgap: 5px;
  position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden;
  background: radial-gradient(120% 70% at 50% 0%, #1b2a22 0%, #121826 55%, #0e131d 100%);
  color: #f8fafc; font-family: ${UI_FONT}; -webkit-user-select: none; user-select: none;
}
.g-kalima .kz-ar { font-family: ${AR_FONT}; direction: rtl; unicode-bidi: isolate; }
.g-kalima .kz-clue { flex: none; padding: 8px 12px 2px; text-align: center; position: relative; z-index: 1; }
.g-kalima .kz-kicker { font: 700 0.64rem/1 ${UI_FONT}; letter-spacing: 0.12em; text-transform: uppercase; color: #8fd18a; opacity: 0.9; }
.g-kalima.short .kz-kicker { display: none; }
.g-kalima.short .kz-clue { padding-top: 6px; }
.g-kalima.short .kz-meta { margin-top: 4px; }
.g-kalima.short .kz-chip { height: 26px; padding: 0 8px; }
.g-kalima.short .kz-clue { padding-left: 8px; padding-right: 8px; }
.g-kalima.short .kz-meta { gap: 5px; }
.g-kalima .kz-en {
  font-weight: 800; font-size: var(--en-fs, 1.35rem); line-height: 1.25; margin-top: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;
}
.g-kalima .kz-meta { display: flex; gap: 6px; justify-content: center; align-items: center; margin-top: 6px; max-width: 100%; }
.g-kalima .kz-chip {
  height: 28px; padding: 0 10px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.13); color: #d5dbe6;
  font: 600 0.78rem/1 ${UI_FONT}; white-space: nowrap; flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
}
.g-kalima .kz-chip.n { flex: none; }
.g-kalima .kz-chip.cat { display: inline-block; line-height: 26px; }
.g-kalima.short .kz-chip.cat { line-height: 24px; }
.g-kalima .kz-chip b { color: #fff; }
.g-kalima .kz-hint {
  position: relative; cursor: pointer; color: #fde68a; background: rgba(250,204,21,0.12);
  border-color: rgba(250,204,21,0.45); flex: none; max-width: 48%;
}
.g-kalima .kz-hint small { font: 700 0.66rem/1 ${UI_FONT}; opacity: 0.85; margin-left: 2px; }
.g-kalima .kz-hint::before { content: ''; position: absolute; inset: -9px -4px; }
.g-kalima .kz-hint, .g-kalima .kz-hint.on { overflow: visible; }
.g-kalima .kz-hint.on { flex: 0 1 auto; }
.g-kalima .kz-hint.on span { min-width: 0; white-space: nowrap; }
.g-kalima .kz-hint:active { transform: scale(0.95); }
.g-kalima .kz-hint.on { cursor: default; color: #fff; background: rgba(250,204,21,0.22); font-weight: 700; font-size: 0.85rem; }
.g-kalima .kz-hint.off { cursor: default; opacity: 0.5; }
.g-kalima .kz-hint.on span { overflow: hidden; text-overflow: ellipsis; }
.g-kalima .kz-hint.pop { animation: kz-hint 0.5s ease-out; }
@keyframes kz-hint { 0% { transform: scale(0.6); box-shadow: 0 0 0 0 rgba(250,204,21,0.7); } 55% { transform: scale(1.12); } 100% { transform: scale(1); box-shadow: 0 0 0 14px rgba(250,204,21,0); } }

.g-kalima .kz-board { flex: 1; min-height: 0; position: relative; display: flex; align-items: center; justify-content: center; }
.g-kalima .kz-grid { display: grid; grid-template-rows: repeat(${ROWS}, var(--tile)); gap: var(--gap); perspective: 600px; }
.g-kalima .kz-grid.enter { animation: kz-enter 0.34s ease-out both; }
.g-kalima .kz-row { display: grid; grid-template-columns: repeat(var(--n), var(--tile)); gap: var(--gap); direction: rtl; position: relative; }
.g-kalima .kz-row.shake { animation: kz-shake 0.45s ease-in-out; }
.g-kalima .kz-tile {
  width: var(--tile); height: var(--tile); box-sizing: border-box; border: 2px solid var(--empty); border-radius: 7px;
  display: flex; align-items: center; justify-content: center; color: #fff; background: rgba(255,255,255,0.02);
  font: 700 calc(var(--tile) * 0.56)/1 ${AR_FONT}; padding-bottom: calc(var(--tile) * 0.06);
}
.g-kalima .kz-tile.filled { border-color: var(--filled); background: rgba(255,255,255,0.05); }
.g-kalima .kz-tile.pop { animation: kz-pop 0.12s ease-out; }
.g-kalima .kz-row.cur .kz-tile.next { border-color: #5e6a82; box-shadow: inset 0 -3px 0 rgba(143,209,138,0.55); }
.g-kalima .kz-tile.s-correct { --fin: var(--green); background: var(--green); border-color: var(--green); }
.g-kalima .kz-tile.s-present { --fin: var(--yellow); background: var(--yellow); border-color: var(--yellow); }
.g-kalima .kz-tile.s-absent { --fin: var(--gray); background: var(--gray); border-color: var(--gray); }
.g-kalima .kz-tile.flip { animation: kz-flip var(--fd, 480ms) ease-in-out var(--d, 0ms) both; }
.g-kalima .kz-tile.bounce { animation: kz-bounce 0.9s ease var(--d, 0ms) both; }
.g-kalima .kz-tile.win { box-shadow: 0 0 0 2px rgba(255,255,255,0.12), 0 6px 18px rgba(83,141,78,0.55); }
.g-kalima .kz-row.hint .kz-tile { visibility: hidden; }
.g-kalima .kz-row.hint::after {
  content: '💡 ' attr(data-tr) '  ·  −1 try'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  box-sizing: border-box; border: 2px dashed rgba(250,204,21,0.55); border-radius: 9px; background: rgba(250,204,21,0.08);
  direction: ltr; padding: 0 6px; color: #fde68a; font: 700 max(11px, calc(var(--tile) * 0.3))/1 ${UI_FONT};
  white-space: pre; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
}

.g-kalima .kz-toast {
  position: absolute; top: var(--toast-top, 40px); left: var(--toast-left, 50%); transform: translate(-50%, -50%) scale(0.92); z-index: 5; pointer-events: none;
  background: #f8fafc; color: #0f172a; font: 700 0.92rem/1.25 ${UI_FONT}; padding: 8px 14px; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45); opacity: 0; transition: opacity 0.15s, transform 0.15s;
  width: max-content; max-width: min(calc(100% - 24px), 360px); box-sizing: border-box; text-align: center;
}
.g-kalima .kz-toast.show { opacity: 1; transform: translate(-50%, -50%); }
.g-kalima .kz-toast .kz-ar { font-size: 1.1rem; margin: 0 7px 0 0; }
.g-kalima .kz-toast.good { background: #dcfce7; color: #14532d; }
.g-kalima .kz-toast.bad { background: #ffedd5; color: #7c2d12; }
.g-kalima .kz-toast.syn { background: #e0f2fe; color: #0c4a6e; }

.g-kalima .kz-kb { flex: none; width: 100%; max-width: 500px; margin: 0 auto; box-sizing: border-box; padding: 4px 4px 6px; display: flex; flex-direction: column; gap: var(--kgap); position: relative; z-index: 1; }
.g-kalima .kz-krow { display: flex; gap: var(--kgap); direction: ltr; }
.g-kalima .kz-krow.cmds { direction: rtl; }
.g-kalima .kz-sp { flex: 0.5 1 0; }
.g-kalima .kz-key {
  flex: 1 1 0; min-width: 0; height: var(--key-h); padding: 0; border: 0; border-radius: 7px; cursor: pointer;
  background: var(--key); color: #fff; font: 600 var(--key-fs)/1 ${AR_FONT}; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 0 rgba(0,0,0,0.38); touch-action: manipulation; transition: background-color 0.2s, transform 0.05s;
  -webkit-tap-highlight-color: transparent; padding-bottom: 3px;
}
.g-kalima .kz-key.down, .g-kalima .kz-key:active { transform: translateY(1px) scale(0.95); filter: brightness(1.25); box-shadow: none; }
.g-kalima .kz-key.s-correct { background: var(--green); }
.g-kalima .kz-key.s-present { background: var(--yellow); }
.g-kalima .kz-key.s-absent { background: var(--key-absent); color: #7d8596; }
.g-kalima .kz-key.cmd { height: var(--enter-h); font: 800 1rem/1 ${UI_FONT}; padding-bottom: 0; gap: 8px; }
.g-kalima .kz-key.enter { flex: 2 1 0; background: var(--green); }
.g-kalima .kz-key.enter .kz-ar { font: 700 1.15rem/1 ${AR_FONT}; padding-bottom: 3px; }
.g-kalima .kz-key.enter small { font: 700 0.62rem/1 ${UI_FONT}; letter-spacing: 0.1em; opacity: 0.8; }
.g-kalima .kz-key.back { background: #4a5266; font-size: 1.35rem; }
.g-kalima .kz-kb.locked .kz-key { pointer-events: none; }

/* Landscape phones: grid on the left, clue + keyboard on the right. */
.g-kalima.land { display: grid; grid-template-columns: var(--gcol, 45%) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
.g-kalima.land .kz-board { grid-column: 1; grid-row: 1 / 3; min-width: 0; }
.g-kalima.land .kz-clue { grid-column: 2; grid-row: 1; padding: 6px 6px 0; min-width: 0; }
.g-kalima.land .kz-kb { grid-column: 2; grid-row: 2; align-self: end; max-width: none; margin: 0; }

.g-kalima .kz-card {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 4; box-sizing: border-box; max-height: 78%;
  overflow-y: auto; touch-action: pan-y; overscroll-behavior: contain;
  background: linear-gradient(180deg, #1f2a3d 0%, #182133 100%); border-top: 3px solid var(--green);
  border-radius: 22px 22px 0 0; padding: 12px 16px 12px; text-align: center;
  box-shadow: 0 -14px 40px rgba(0,0,0,0.55); transform: translateY(105%); transition: transform 0.34s cubic-bezier(0.2, 0.9, 0.3, 1.15);
}
.g-kalima .kz-card.show { transform: none; }
.g-kalima .kz-card.lose { border-top-color: #e8590c; }
.g-kalima .kz-card-h { display: flex; justify-content: center; align-items: center; gap: 8px; font: 800 0.95rem/1.2 ${UI_FONT}; color: #cfe8cc; }
.g-kalima .kz-card.lose .kz-card-h { color: #fdba8c; }
.g-kalima .kz-card-h .kz-ar { font-size: 1.1rem; }
.g-kalima .kz-word {
  display: inline-flex; align-items: center; gap: 10px; margin: 4px auto 0; padding: 2px 14px; border-radius: 14px; cursor: pointer;
  border: 0; background: rgba(255,255,255,0.06); color: #fff;
}
.g-kalima .kz-word .kz-ar { font-size: 2.3rem; font-weight: 700; line-height: 1.45; }
.g-kalima .kz-word .kz-spk { font-size: 1.1rem; }
.g-kalima .kz-tr { font: 600 1rem/1.2 ${UI_FONT}; color: #fde68a; margin-top: 2px; }
.g-kalima .kz-mean { font: 600 0.95rem/1.3 ${UI_FONT}; color: #e2e8f0; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.g-kalima .kz-also { font: 600 0.8rem/1.3 ${UI_FONT}; color: #7dd3fc; margin-top: 3px; }
.g-kalima .kz-also .kz-ar { font-size: 1rem; }
.g-kalima .kz-ex { margin: 9px 0 0; padding: 7px 10px; border-radius: 12px; background: rgba(255,255,255,0.05); text-align: center; cursor: pointer; }
.g-kalima .kz-ex .kz-ar { font-size: 1.12rem; line-height: 1.55; color: #fff; }
.g-kalima .kz-ex .kz-sub { font: 500 0.78rem/1.3 ${UI_FONT}; color: #a9b4c6; }
.g-kalima .kz-ex .kz-sub i { color: #c9d3e2; }
.g-kalima .kz-ph { margin-top: 6px; }
.g-kalima .kz-actions { display: flex; gap: 8px; margin-top: 10px; }
.g-kalima .kz-btn {
  flex: 1; height: 48px; border-radius: 13px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.08);
  color: #fff; font: 800 1rem/1 ${UI_FONT}; cursor: pointer; touch-action: manipulation;
}
.g-kalima .kz-btn.primary { flex: 1.6; background: var(--green); border-color: transparent; box-shadow: 0 4px 0 #3b6b37; }
.g-kalima .kz-card.lose .kz-btn.primary { background: #e8590c; box-shadow: 0 4px 0 #a63f08; }
.g-kalima .kz-btn:active { transform: translateY(2px); box-shadow: none; }
.g-kalima .kz-card.tight { padding: 9px 14px 10px; }
.g-kalima .kz-card.tight .kz-word .kz-ar { font-size: 1.9rem; line-height: 1.3; }
.g-kalima .kz-card.tight .kz-tr { font-size: 0.92rem; }
.g-kalima .kz-card.tight .kz-mean { font-size: 0.86rem; -webkit-line-clamp: 1; }
.g-kalima .kz-card.tight .kz-ex { margin-top: 6px; padding: 5px 8px; }
.g-kalima .kz-card.tight .kz-ex .kz-ar { font-size: 1rem; line-height: 1.45; }
.g-kalima .kz-card.tight .kz-sub { font-size: 0.72rem; }
.g-kalima .kz-card.tight .kz-actions { margin-top: 8px; }
.g-kalima .kz-card.tight .kz-btn { height: 44px; }
.g-kalima .kz-card.tighter .kz-ph .kz-sub i, .g-kalima .kz-card.tighter .kz-ph .kz-sub b { display: none; }
.g-kalima .kz-card.tightest .kz-ph { display: none; }
/* "Board" toggle on the lose card: collapse to the answer so the guesses show. */
.g-kalima .kz-card.peek .kz-tr, .g-kalima .kz-card.peek .kz-mean, .g-kalima .kz-card.peek .kz-ex, .g-kalima .kz-card.peek .kz-also { display: none; }
.g-kalima .kz-card.peek .kz-word .kz-ar { font-size: 1.6rem; line-height: 1.3; }
.g-kalima .kz-card.peek .kz-actions { margin-top: 6px; }

.g-kalima .kz-fx { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 3; }
.g-kalima .kz-bit { position: absolute; top: -20px; width: 9px; height: 14px; border-radius: 2px; animation: kz-fall var(--t, 1.4s) cubic-bezier(0.25, 0.6, 0.4, 1) var(--d, 0s) forwards; }

.g-kalima.rm .kz-tile, .g-kalima.rm .kz-row, .g-kalima.rm .kz-grid { animation: none !important; }
.g-kalima.rm .kz-card, .g-kalima.rm .kz-toast, .g-kalima.rm .kz-key { transition: none; }

@keyframes kz-pop { 0% { transform: scale(0.86); } 60% { transform: scale(1.1); } 100% { transform: scale(1); } }
@keyframes kz-flip {
  0% { transform: rotateX(0); background-color: rgba(255,255,255,0.05); border-color: var(--filled); }
  50% { transform: rotateX(-90deg); background-color: rgba(255,255,255,0.05); border-color: var(--filled); }
  50.1% { transform: rotateX(-90deg); background-color: var(--fin); border-color: var(--fin); }
  100% { transform: rotateX(0); background-color: var(--fin); border-color: var(--fin); }
}
@keyframes kz-bounce {
  0%, 20% { transform: translateY(0); } 40% { transform: translateY(-32%); } 50% { transform: translateY(4%); }
  62% { transform: translateY(-14%); } 80% { transform: translateY(2%); } 100% { transform: translateY(0); }
}
@keyframes kz-shake {
  10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-7px); } 40%, 60% { transform: translateX(7px); }
}
@keyframes kz-enter { from { opacity: 0; transform: translateY(14px) scale(0.97); } }
@keyframes kz-fall {
  0% { transform: translate(0, 0) rotate(0); opacity: 1; }
  100% { transform: translate(var(--dx, 0), var(--fy, 520px)) rotate(var(--r, 540deg)); opacity: 0; }
}
`;

export default {
  howTo: [
    'Spell the <strong>Libyan Arabic</strong> word for the clue in <strong>6 tries</strong>, right → left. 🟩 right spot · 🟨 wrong spot · ⬛ not in it.',
    'Practice: 7 − tries per word; one miss ends the run. <strong>💡</strong> shows how it sounds but costs a try.',
  ],
  minWords: 12,
  wordFilter,

  create(stage, kit) {
    const rm = !!kit.reducedMotion;
    const FLIP_MS = rm ? 0 : 480;
    const STAGGER = rm ? 0 : 260;

    // Deck words that fit the grid, by letter key, for recognising synonyms:
    // another real word that carries the clue's meaning.
    const lexicon = new Map();
    for (const x of kit.words ?? []) {
      if (!x?.ar || !x.en || !wordFilter(x)) continue;
      const k = keyOf(x);
      if (!lexicon.has(k)) lexicon.set(k, []);
      lexicon.get(k).push({ word: x, senses: senses(x.en).map((sn) => [sn, senseInfo(sn)]) });
    }
    // n|base → [{ key, info }] for spotting targets with a same-length synonym.
    const byMeaning = new Map();
    for (const [k, list] of lexicon) {
      const n = [...k].length;
      for (const { senses: ss } of list)
        for (const [, info] of ss) {
          const mk = `${n}|${info.base}`;
          if (!byMeaning.has(mk)) byMeaning.set(mk, []);
          byMeaning.get(mk).push({ key: k, info });
        }
    }
    /** A deck word spelled `guessKey` (not the target) whose meaning answers the clue, or null. */
    function synonymFor(guessKey, target) {
      if (guessKey === target.key) return null;
      for (const { word, senses: ss } of lexicon.get(guessKey) ?? []) {
        const hit = ss.find(([, info]) => senseMatches(info, target.sense));
        if (hit) return { word, sense: hit[0] };
      }
      return null;
    }
    /** True when another word of the same length also answers this word's clue. */
    function ambiguous(x) {
      const t = clueSense(x);
      const k = keyOf(x);
      return (byMeaning.get(`${[...k].length}|${t.base}`) ?? []).some((e) => e.key !== k && senseMatches(e.info, t));
    }

    const style = document.createElement('style');
    style.textContent = CSS;
    stage.append(style);
    const root = document.createElement('div');
    root.className = `g-kalima${rm ? ' rm' : ''}`;
    root.innerHTML = `
      <div class="kz-clue">
        <div class="kz-kicker">Guess the Libyan word for</div>
        <div class="kz-en" dir="ltr"></div>
        <div class="kz-meta"></div>
      </div>
      <div class="kz-board" aria-label="Guesses">
        <div class="kz-grid"></div>
      </div>
      <div class="kz-kb" aria-label="Arabic keyboard">
        ${KB_ROWS.map(
          (row) =>
            `<div class="kz-krow">${row.length < 11 ? '<span class="kz-sp"></span>' : ''}${row
              .map((ch) => `<button class="kz-key" data-k="${ch}" tabindex="-1" aria-label="${ch}">${ch}</button>`)
              .join('')}${row.length < 11 ? '<span class="kz-sp"></span>' : ''}</div>`,
        ).join('')}
        <div class="kz-krow cmds">
          <button class="kz-key cmd enter" data-cmd="enter" tabindex="-1" aria-label="Enter"><span>✓</span><span class="kz-ar">أدخل</span><small>ENTER</small></button>
          <button class="kz-key cmd back" data-cmd="back" tabindex="-1" aria-label="Backspace">⌫</button>
        </div>
      </div>
      <div class="kz-toast" role="status" aria-live="polite"></div>
      <div class="kz-card" aria-live="polite"></div>
      <div class="kz-fx"></div>`;
    stage.append(root);
    const $ = (sel) => root.querySelector(sel);
    const $clue = $('.kz-clue');
    const $en = $('.kz-en');
    const $kicker = $('.kz-kicker');
    const $meta = $('.kz-meta');
    const $board = $('.kz-board');
    const $grid = $('.kz-grid');
    const $toast = $('.kz-toast');
    const $kb = $('.kz-kb');
    const $card = $('.kz-card');
    const $fx = $('.kz-fx');
    const keyEls = new Map([...root.querySelectorAll('.kz-key[data-k]')].map((b) => [b.dataset.k, b]));

    // ------------------------------------------------------------ timers
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };
    const clearTimers = () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
    let toastTimer = 0;
    const pressTimers = new Set();
    function flashKey(el, ms = 110) {
      if (!el) return;
      el.classList.add('down');
      const id = setTimeout(() => {
        pressTimers.delete(id);
        el.classList.remove('down');
      }, ms);
      pressTimers.add(id);
    }

    // ------------------------------------------------------------ state
    // s: the current round. w: the current word within it.
    let s = null;
    let w = null;
    let phase = 'idle'; // idle | play | anim | card | over
    const debugQueue = [];
    // Rows a word can still be guessed in: the 💡 hint uses up the last one.
    const maxRows = () => ROWS - (w?.hint ? 1 : 0);
    const triesOf = (x) => x.guesses.length + (x.hint ? 1 : 0);

    // ------------------------------------------------------------ layout
    function layout() {
      const W = root.clientWidth || 360;
      const H = root.clientHeight || 600;
      const n = w?.letters.length ?? 4;
      // A landscape phone has no room for clue + 6 rows + keyboard stacked.
      const land = W > H * 1.15 && H < 480;
      root.classList.toggle('land', land);
      root.classList.toggle('short', H < 560);
      const kgap = H < 560 ? 4 : 5;
      const gap = H < 560 ? 4 : 5;
      let kbW = Math.min(W, 500) - 8;
      let tile;
      if (land) {
        tile = Math.min(56, (H - 14 - (ROWS - 1) * gap) / ROWS);
        const maxCol = Math.max(W * 0.32, W - 300);
        tile = Math.floor(Math.max(14, Math.min(tile, (maxCol - 16 - (n - 1) * gap) / n)));
        const gcol = n * tile + (n - 1) * gap + 16;
        root.style.setProperty('--gcol', `${gcol}px`);
        kbW = W - gcol - 8;
      }
      const keyW = (kbW - 10 * kgap) / 11;
      let keyH = Math.round(Math.min(54, Math.max(40, H * 0.075)));
      let enterH = Math.round(Math.min(50, Math.max(40, H * 0.07)));
      if (land) {
        const room = (H - $clue.offsetHeight - 14 - 3 * kgap) / 4;
        keyH = enterH = Math.round(Math.min(46, Math.max(34, room)));
      }
      root.style.setProperty('--key-h', `${keyH}px`);
      root.style.setProperty('--enter-h', `${enterH}px`);
      root.style.setProperty('--kgap', `${kgap}px`);
      root.style.setProperty('--key-fs', `${Math.round(Math.min(26, Math.max(15, Math.min(keyW * 0.74, keyH * 0.5))))}px`);
      root.style.setProperty('--gap', `${gap}px`);
      if (!land) {
        // Scale tiles to the board so the grid never spills over the clue or keys.
        const bh = $board.clientHeight;
        const bw = $board.clientWidth;
        tile = Math.floor(Math.max(14, Math.min(64, (bh - 10 - (ROWS - 1) * gap) / ROWS, (bw - 28 - (n - 1) * gap) / n)));
      }
      root.style.setProperty('--tile', `${tile}px`);
    }
    const ro = new ResizeObserver(() => layout());
    ro.observe(root);

    // ------------------------------------------------------------ rendering
    function renderClue() {
      if (!w) return;
      $en.textContent = w.clue;
      $en.style.setProperty('--en-fs', w.clue.length > 26 ? '1.02rem' : w.clue.length > 19 ? '1.15rem' : '1.35rem');
      $kicker.textContent = s?.daily ? `Daily #${s.day} · the Libyan word for` : 'Guess the Libyan word for';
      const [icon, label] = catLabel(w.word.cat);
      let hint;
      if (w.hint) hint = `<span class="kz-chip kz-hint on" title="Transliteration">💡 <span>${esc(w.word.tr)}</span></span>`;
      else if (w.row >= ROWS - 1 && !w.done)
        hint = `<span class="kz-chip kz-hint off" title="The hint needs a spare try">💡 <small>no spare try</small></span>`;
      else
        hint = `<button class="kz-chip kz-hint" data-cmd="hint" tabindex="-1" aria-label="Show hint: how it sounds. Costs one try">💡 Hint <small>−1 try</small></button>`;
      $meta.innerHTML = `<span class="kz-chip cat">${icon} ${esc(label)}</span><span class="kz-chip n"><b>${w.letters.length}</b> letters</span>${hint}`;
    }

    function buildGrid(animate) {
      const n = w.letters.length;
      root.style.setProperty('--n', String(n));
      $grid.innerHTML = Array.from(
        { length: ROWS },
        () => `<div class="kz-row">${'<div class="kz-tile"></div>'.repeat(n)}</div>`,
      ).join('');
      $grid.classList.remove('enter');
      if (animate && !rm) {
        void $grid.offsetWidth;
        $grid.classList.add('enter');
      }
      layout();
      markCursor();
    }

    const rowEl = (r) => $grid.children[r];

    function markCursor() {
      $grid.querySelectorAll('.kz-row.cur').forEach((r) => r.classList.remove('cur'));
      $grid.querySelectorAll('.kz-tile.next').forEach((t) => t.classList.remove('next'));
      if (phase !== 'play' || !w) return;
      const row = rowEl(w.row);
      if (!row) return;
      row.classList.add('cur');
      row.children[w.cur.length]?.classList.add('next');
    }

    function renderCurrentRow(popIndex = -1) {
      const row = rowEl(w.row);
      if (!row) return;
      [...row.children].forEach((t, i) => {
        const ch = w.cur[i] ?? '';
        t.textContent = ch;
        t.classList.toggle('filled', !!ch);
        if (i === popIndex && !rm) {
          t.classList.remove('pop');
          void t.offsetWidth;
          t.classList.add('pop');
        }
      });
      markCursor();
    }

    /** Paint a scored row without animation (restoring a daily in progress). */
    function paintRow(r, guess, res) {
      const row = rowEl(r);
      if (!row) return;
      [...row.children].forEach((t, i) => {
        t.textContent = guess[i];
        t.className = `kz-tile s-${res[i]}`;
        t.setAttribute('aria-label', `${guess[i]}: ${res[i] === 'correct' ? 'right spot' : res[i] === 'present' ? 'wrong spot' : 'not in word'}`);
      });
    }
    function paintHintRow() {
      const row = rowEl(ROWS - 1);
      if (!row || !w?.hint) return;
      row.classList.add('hint');
      row.dataset.tr = w.word.tr;
      row.setAttribute('aria-label', `Hint used this try: ${w.word.tr}`);
    }

    function resetKeys() {
      keyEls.forEach((b) => b.classList.remove('s-correct', 's-present', 's-absent'));
    }
    function paintKeys(guess, res) {
      guess.forEach((ch, i) => {
        const b = keyEls.get(ch);
        if (!b) return;
        const cur = ['correct', 'present', 'absent'].find((st) => b.classList.contains(`s-${st}`));
        if (!cur || STATE_RANK[res[i]] > STATE_RANK[cur]) {
          b.classList.remove('s-correct', 's-present', 's-absent');
          b.classList.add(`s-${res[i]}`);
        }
      });
    }

    // Toasts sit over an empty row of the grid, never over the clue or the row being typed.
    function placeToast() {
      const rr = root.getBoundingClientRect();
      let y = $clue.offsetTop + $clue.offsetHeight / 2;
      let x = rr.width / 2;
      if (w && $grid.children.length === ROWS) {
        const avoid = phase === 'play' ? w.row : w.row - 1;
        const lim = maxRows();
        const r = avoid + 1 < lim ? avoid + 1 : Math.max(0, avoid - 1);
        const b = rowEl(r).getBoundingClientRect();
        y = b.top - rr.top + b.height / 2;
        x = b.left - rr.left + b.width / 2;
      }
      const half = Math.min($toast.offsetWidth, rr.width - 16) / 2;
      x = Math.min(Math.max(x, half + 8), rr.width - half - 8);
      $toast.style.setProperty('--toast-top', `${Math.round(y)}px`);
      $toast.style.setProperty('--toast-left', `${Math.round(x)}px`);
    }
    function toast(html, ms = 1300, tone = '') {
      $toast.innerHTML = html;
      $toast.className = `kz-toast show ${tone}`;
      placeToast();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => $toast.classList.remove('show'), ms);
    }
    function hideToast() {
      clearTimeout(toastTimer);
      $toast.classList.remove('show');
    }

    function shakeRow() {
      const row = rowEl(w.row);
      if (!row || rm) return;
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      later(() => row.classList.remove('shake'), 480);
    }

    function confetti() {
      if (rm) return;
      const colors = ['#538d4e', '#c9a227', '#f8fafc', '#8fd18a', '#fde68a', '#38bdf8'];
      const h = root.clientHeight;
      for (let i = 0; i < 36; i++) {
        const b = document.createElement('i');
        b.className = 'kz-bit';
        b.style.left = `${Math.random() * 100}%`;
        b.style.background = colors[i % colors.length];
        b.style.setProperty('--d', `${Math.random() * 0.25}s`);
        b.style.setProperty('--t', `${1.1 + Math.random() * 0.9}s`);
        b.style.setProperty('--dx', `${(Math.random() - 0.5) * 140}px`);
        b.style.setProperty('--fy', `${h * (0.6 + Math.random() * 0.5)}px`);
        b.style.setProperty('--r', `${(Math.random() - 0.5) * 1080}deg`);
        $fx.append(b);
      }
      later(() => ($fx.innerHTML = ''), 2400);
    }

    // ------------------------------------------------------------ idle backdrop
    function renderIdle() {
      phase = 'idle';
      w = { letters: ['ك', 'ل', 'م', 'ة'], cur: [], row: 0, hint: false, word: null };
      $kicker.textContent = 'Wordle · Libyan Arabic';
      $en.textContent = 'كلمة — guess the word';
      $en.style.setProperty('--en-fs', '1.2rem');
      $meta.innerHTML = '<span class="kz-chip">🟩 right spot</span><span class="kz-chip">🟨 wrong spot</span>';
      buildGrid(false);
      const demo = [
        [['ق', 'absent'], ['ل', 'correct'], ['ب', 'absent'], ['ة', 'correct']],
        [['ك', 'correct'], ['ل', 'correct'], ['م', 'correct'], ['ة', 'correct']],
      ];
      demo.forEach((row, r) =>
        row.forEach(([ch, st], i) => {
          const t = rowEl(r).children[i];
          t.textContent = ch;
          t.classList.add(`s-${st}`);
        }),
      );
      resetKeys();
      w = null;
    }

    // ------------------------------------------------------------ words
    function choosePractice() {
      const i = s.words.length;
      const [lo, hi] = i < 2 ? [3, 4] : i < 4 ? [3, 5] : [4, 6];
      let unused = s.pool.filter((x) => !s.used.has(keyOf(x)));
      if (!unused.length) {
        s.used.clear();
        unused = s.pool;
      }
      const fit = unused.filter((x) => {
        const n = lettersOf(x).length;
        return n >= lo && n <= hi;
      });
      const cands = fit.length ? fit : unused;
      return cands[Math.floor(s.rng() * cands.length)];
    }
    /**
     * The daily word: day N of a fixed shuffle of the pool (the same for
     * everyone, no repeats within a cycle), skipping words whose clue another
     * same-length word also answers, so every share grid is comparable.
     */
    function chooseDaily() {
      const fair = s.pool.filter((x) => !ambiguous(x));
      const list = fair.length >= 30 ? fair : s.pool;
      const order = shuffle(list, mulberry32(hashString(DAILY_ORDER_SEED)));
      const day = Number(s.day) || 1;
      return order[(((day - 1) % order.length) + order.length) % order.length];
    }

    const pressed = new Map(); // pointerId → { key, done } for keys held down
    function startWord(word, animate) {
      s.used.add(keyOf(word));
      const letters = lettersOf(word);
      w = {
        word,
        letters,
        key: letters.join(''),
        clue: clueEn(word),
        sense: clueSense(word),
        row: 0,
        cur: [],
        guesses: [],
        results: [],
        hint: false,
        syn: [],
        solved: false,
        done: false,
      };
      s.words.push(w);
      phase = 'play';
      hideCard();
      hideToast();
      pressed.clear();
      resetKeys();
      $kb.classList.remove('locked');
      renderClue();
      buildGrid(animate);
      kit.hud.extra(s.daily ? `Daily #${s.day}` : `Word ${s.words.length}`);
    }

    // ------------------------------------------------------------ daily progress
    function saveProgress() {
      if (!s?.daily || !w?.word) return;
      writeJSON(PROGRESS_KEY, { day: s.day, id: w.word.id, g: w.guesses.map((g) => g.join('')), hint: w.hint });
    }
    /** Resume today's daily from where the player left it (reload, Back, closed tab). */
    function restoreDaily() {
      const saved = readJSON(PROGRESS_KEY);
      if (!saved || saved.day !== s.day || saved.id !== w.word.id) return;
      const n = w.letters.length;
      const gs = (Array.isArray(saved.g) ? saved.g : [])
        .filter((g) => typeof g === 'string' && [...g].length === n && [...g].every((c) => LETTERS.has(c)))
        .slice(0, ROWS);
      w.hint = !!saved.hint && gs.length < ROWS;
      if (!gs.length && !w.hint) return;
      paintHintRow();
      for (const g of gs.slice(0, maxRows())) {
        const guess = [...g];
        const res = evaluate(guess, w.letters);
        paintRow(w.row, guess, res);
        paintKeys(guess, res);
        w.guesses.push(guess);
        w.results.push(res);
        w.row++;
        if (res.every((r) => r === 'correct')) {
          w.solved = true;
          break;
        }
      }
      if (w.solved || w.row >= maxRows()) {
        w.done = true;
        if (w.solved) {
          s.score = 7 - triesOf(w);
          s.solved = 1;
          kit.hud.score(s.score);
        } else s.missed.push(w.word);
        recordDaily(s.day, w.solved, triesOf(w));
        renderClue();
        $kb.classList.add('locked');
        showCard(w.solved);
        markCursor();
        return;
      }
      renderClue();
      markCursor();
      toast('↩️ Picking up today’s word where you left it', 1800);
    }

    // ------------------------------------------------------------ input
    function typeLetter(ch) {
      if (phase !== 'play' || !kit.playing) return;
      if (w.cur.length >= w.letters.length) {
        shakeRow();
        return;
      }
      w.cur.push(ch);
      renderCurrentRow(w.cur.length - 1);
      kit.sfx.tap();
      kit.haptic(6);
    }
    function backspace() {
      if (phase !== 'play' || !kit.playing || !w.cur.length) return;
      w.cur.pop();
      renderCurrentRow();
      kit.sfx.tick();
    }
    function useHint() {
      if (phase !== 'play' || !kit.playing || w.hint) return;
      if (w.row >= ROWS - 1) {
        toast('💡 needs a spare try — this is your last one', 1500, 'bad');
        return;
      }
      w.hint = true;
      paintHintRow();
      renderClue();
      saveProgress();
      kit.sfx.pop();
      kit.haptic(10);
      const chip = $meta.querySelector('.kz-hint');
      if (chip && !rm) chip.classList.add('pop');
      toast(`💡 Hint used your 6th try · ${maxRows() - w.row} left`, 1500);
    }

    function submit() {
      if (phase !== 'play' || !kit.playing) return;
      const n = w.letters.length;
      if (w.cur.length < n) {
        shakeRow();
        kit.sfx.bad();
        kit.haptic([25, 40, 25]);
        const need = n - w.cur.length;
        toast(w.cur.length ? `Not enough letters — ${need} more` : `Type all ${n} letters first`, 1300, 'bad');
        return;
      }
      const guess = [...w.cur];
      // Another real word with the clue's meaning: right meaning, so no try is used.
      const syn = synonymFor(guess.join(''), w);
      if (syn) {
        if (!w.syn.some((x) => x.id === syn.word.id)) w.syn.push(syn.word);
        w.cur = [];
        renderCurrentRow();
        kit.sfx.good();
        kit.haptic(12);
        kit.speak(syn.word.ar);
        toast(
          `✓ <span class="kz-ar">${esc(syn.word.ar)}</span> means “${esc(syn.sense)}” too — we want another word. No try used!`,
          2600,
          'syn',
        );
        flushDebug();
        return;
      }
      const res = evaluate(guess, w.letters);
      const row = rowEl(w.row);
      w.guesses.push(guess);
      w.results.push(res);
      w.cur = [];
      phase = 'anim';
      $kb.classList.add('locked');
      saveProgress();
      markCursor();
      [...row.children].forEach((t, i) => {
        t.classList.remove('pop', 'filled');
        t.classList.add(`s-${res[i]}`);
        t.setAttribute('aria-label', `${guess[i]}: ${res[i] === 'correct' ? 'right spot' : res[i] === 'present' ? 'wrong spot' : 'not in word'}`);
        if (!rm) {
          t.style.setProperty('--d', `${i * STAGGER}ms`);
          t.style.setProperty('--fd', `${FLIP_MS}ms`);
          t.classList.add('flip');
        }
        later(() => {
          if (res[i] === 'correct') kit.sfx.combo(3 + i * 2);
          else if (res[i] === 'present') kit.sfx.pop();
          else kit.sfx.tick();
        }, i * STAGGER + FLIP_MS / 2);
      });
      const doneAt = (n - 1) * STAGGER + FLIP_MS + (rm ? 120 : 60);
      const won = res.every((r) => r === 'correct');
      w.row++;
      later(() => afterReveal(guess, res, won, row), doneAt);
    }

    function afterReveal(guess, res, won, row) {
      paintKeys(guess, res);
      if (won) {
        w.solved = true;
        w.done = true;
        const tries = triesOf(w);
        const pts = 7 - tries;
        s.score += pts;
        s.solved++;
        kit.hud.score(s.score);
        // The daily result counts as soon as it is revealed, even if the player leaves now.
        if (s.daily) recordDaily(s.day, true, tries);
        const [ar, en] = PRAISE[tries];
        toast(`<span class="kz-ar">${ar}</span>${en} · +${pts}`, 1800, 'good');
        kit.sfx.win();
        kit.haptic([20, 40, 20, 40, 60]);
        [...row.children].forEach((t, i) => {
          t.classList.remove('flip');
          t.classList.add('win');
          if (!rm) {
            t.style.setProperty('--d', `${i * 90}ms`);
            t.classList.add('bounce');
          }
        });
        confetti();
        later(() => showCard(true), rm ? 350 : 650 + guess.length * 90);
        return;
      }
      if (w.row >= maxRows()) {
        w.done = true;
        s.missed.push(w.word);
        if (s.daily) recordDaily(s.day, false, triesOf(w));
        kit.sfx.lose();
        kit.haptic([60, 50, 120]);
        toast(`The word was <span class="kz-ar">${esc(w.word.ar)}</span>`, 1800, 'bad');
        later(() => showCard(false), rm ? 300 : 650);
        return;
      }
      if (res.some((r) => r === 'correct')) kit.sfx.good();
      phase = 'play';
      $kb.classList.remove('locked');
      if (w.row >= ROWS - 1) renderClue(); // the hint chip is no longer available
      markCursor();
      flushDebug();
    }

    // ------------------------------------------------------------ reveal card
    function showCard(won) {
      phase = 'card';
      hideToast();
      const word = w.word;
      const tries = triesOf(w);
      const ph = (word.phrases ?? []).find((p) => normAr(p.ar) !== normAr(word.ex_ar)) ?? word.phrases?.[0];
      const head = won
        ? `<span class="kz-ar">${esc(PRAISE[tries][0])}</span> Solved in ${tries}/6${w.hint ? ' 💡' : ''} · +${7 - tries}`
        : '😬 Out of tries — the word was';
      let actions;
      if (won && !s.daily)
        actions = `<button class="kz-btn" data-cmd="finish">🏁 Finish</button><button class="kz-btn primary" data-cmd="next">Next word ▶</button>`;
      else if (won) actions = `<button class="kz-btn primary" data-cmd="results">See results ▶</button>`;
      else
        actions = `<button class="kz-btn" data-cmd="peek" aria-pressed="false">👀 Board</button><button class="kz-btn primary" data-cmd="results">See results ▶</button>`;
      const also = w.syn.length
        ? `<div class="kz-also">✓ You also knew ${w.syn.map((x) => `<span class="kz-ar">${esc(x.ar)}</span>`).join(' · ')} — same meaning</div>`
        : '';
      $card.className = `kz-card ${won ? 'win' : 'lose'}`;
      $card.innerHTML = `
        <div class="kz-card-h">${head}</div>
        <button class="kz-word" data-say="${esc(word.ar)}" aria-label="Say it"><span class="kz-ar">${esc(word.ar)}</span><span class="kz-spk" aria-hidden="true">🔊</span></button>
        <div class="kz-tr">${esc(word.tr)}</div>
        <div class="kz-mean">${esc(senses(word.en).slice(0, 3).join(' · '))}</div>
        ${also}
        ${
          word.ex_ar
            ? `<div class="kz-ex" data-say="${esc(word.ex_ar)}"><div class="kz-ar">${esc(word.ex_ar)}</div><div class="kz-sub"><i>${esc(word.ex_tr)}</i> — ${esc(word.ex_en)}</div></div>`
            : ''
        }
        ${
          ph
            ? `<div class="kz-ex kz-ph" data-say="${esc(ph.ar)}"><div class="kz-ar">${esc(ph.ar)}</div><div class="kz-sub"><i>${esc(ph.tr)}</i><b> — </b>${esc(ph.en)}</div></div>`
            : ''
        }
        <div class="kz-actions">${actions}</div>`;
      // Fit without scrolling: tighten type, then drop the phrase's transliteration, then the phrase.
      for (const step of ['tight', 'tighter', 'tightest']) {
        if ($card.scrollHeight <= $card.clientHeight + 1) break;
        $card.classList.add(step);
      }
      void $card.offsetWidth;
      $card.classList.add('show');
      $card.scrollTop = 0;
      kit.speak(word.ar);
      flushDebug();
    }
    function hideCard() {
      $card.classList.remove('show');
      $card.innerHTML = '';
    }
    function togglePeek() {
      const on = $card.classList.toggle('peek');
      const b = $card.querySelector('[data-cmd="peek"]');
      if (b) {
        b.textContent = on ? '📖 Word' : '👀 Board';
        b.setAttribute('aria-pressed', String(on));
      }
      $card.scrollTop = 0;
      kit.sfx.swish();
    }

    // ------------------------------------------------------------ results
    function rowEmoji(res) {
      // The grid is RTL, so the first letter is the rightmost tile: emit the row
      // in visual (left-to-right) order.
      return [...res].reverse().map((r) => EMOJI[r]).join('');
    }
    const miniGrid = (x) =>
      `<div style="display:inline-flex;flex-direction:column;gap:3px;margin:8px auto 0">${x.results
        .map(
          (res) =>
            `<div style="display:flex;gap:3px;direction:rtl;justify-content:center">${res
              .map((r) => `<span style="width:16px;height:16px;border-radius:3px;background:${{ correct: '#538d4e', present: '#c9a227', absent: '#787c7e' }[r]}"></span>`)
              .join('')}</div>`,
        )
        .join('')}${x.hint ? `<div style="font-size:0.75rem;line-height:16px;color:#a16207;font-weight:700">💡 hint</div>` : ''}</div>`;

    function finishRound() {
      if (!s || phase === 'over') return;
      phase = 'over';
      clearTimers();
      hideCard();
      hideToast();
      $kb.classList.add('locked');
      const done = s.words.filter((x) => x.done);
      if (s.daily) {
        const x = s.words[0];
        const used = triesOf(x);
        const tries = x.solved ? used : 'X';
        const st = recordDaily(s.day, x.solved, used);
        const rows = x.results.map(rowEmoji);
        if (x.hint) rows.push('💡'.repeat(x.letters.length));
        const shareText = `Kalima #${s.day} ${tries}/6${x.hint ? ' 💡' : ''}\n\n${rows.join('\n')}\n🇱🇾 Guess the Libyan Arabic word of the day`;
        kit.end({
          score: x.solved ? 7 - used : 0,
          correct: x.solved ? 1 : 0,
          total: 1,
          won: x.solved,
          missed: s.missed,
          title: `Kalima #${s.day} · ${tries}/6`,
          detail: `<div style="text-align:center;margin-top:8px">
            <div style="font-family:${esc(AR_FONT)};font-size:1.7rem;font-weight:700;direction:rtl">${esc(x.word.ar)}</div>
            <div style="font-size:0.9rem;color:#475569"><strong>${esc(x.word.tr)}</strong> · ${esc(x.clue)}</div>
            ${miniGrid(x)}
            <div style="display:flex;justify-content:center;gap:14px;margin-top:8px;font-size:0.72rem;color:#64748b;line-height:1.1">
              ${[[st.played, 'Played'], [`${st.played ? Math.round((100 * st.wins) / st.played) : 0}%`, 'Won'], [`🔥${st.streak}`, 'Streak'], [st.best, 'Best']]
                .map(([v, l]) => `<div><div style="font-size:1.15rem;font-weight:800;color:#0f172a">${v}</div>${l}</div>`)
                .join('')}
            </div>
            <div style="font-size:0.8rem;color:#64748b;margin-top:6px">${x.hint ? '💡 Hint used a try · ' : ''}New word tomorrow!</div></div>`,
          shareText,
          meta: { id: x.word.id, g: x.solved ? used : 0, hint: x.hint },
        });
        return;
      }
      const solved = done.filter((x) => x.solved);
      const line = done.map((x) => (x.solved ? KEYCAP[triesOf(x)] + (x.hint ? '💡' : '') : '❌')).join('');
      const shareText = `Kalima practice 🔥 ${solved.length} word${solved.length === 1 ? '' : 's'} solved · ${s.score} pts\n${line}\n🇱🇾 Learning Libyan Arabic one word at a time`;
      const chips = done
        .map(
          (x) =>
            `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;margin:3px;background:${x.solved ? '#dcfce7' : '#ffedd5'};border:1px solid ${x.solved ? '#86efac' : '#fdba74'}"><span style="font-family:${esc(AR_FONT)};font-size:1.15rem;font-weight:700;direction:rtl">${esc(x.word.ar)}</span><span style="font-size:0.78rem;color:#334155;font-weight:700">${x.solved ? `${triesOf(x)}/6` : '✗'}${x.hint ? ' 💡' : ''}</span></span>`,
        )
        .join('');
      kit.end({
        score: s.score,
        correct: solved.length,
        total: done.length,
        won: false,
        missed: s.missed,
        title: solved.length ? `🔥 ${solved.length} word${solved.length === 1 ? '' : 's'} solved` : 'No words this time',
        detail: done.length ? `<div style="margin-top:10px;text-align:center">${chips}</div>` : '',
        shareText,
        meta: {
          words: done.slice(0, 40).map((x) => x.word.id),
          g: done.slice(0, 40).map((x) => (x.solved ? triesOf(x) : 0)),
          hints: done.filter((x) => x.hint).length,
        },
      });
    }

    // ------------------------------------------------------------ commands
    function command(cmd) {
      if (!kit.playing || !s) return;
      if (cmd === 'enter') return submit();
      if (cmd === 'back') return backspace();
      if (cmd === 'hint') return useHint();
      if (phase !== 'card') return;
      if (cmd === 'peek') return togglePeek();
      if (cmd === 'next') {
        kit.sfx.swish();
        return startWord(choosePractice(), true);
      }
      if (cmd === 'finish' || cmd === 'results') return finishRound();
    }
    function primaryCardAction() {
      if (phase !== 'card') return;
      command(!s.daily && w.solved ? 'next' : 'results');
    }
    function activate(el) {
      if (el.dataset.k) return typeLetter(el.dataset.k);
      if (el.dataset.cmd) return command(el.dataset.cmd);
    }

    // Keyboard keys act on pointerup of the pointer that pressed them, so two
    // overlapping thumb taps both type (the browser sends no click for those).
    // The click that may follow a handled tap is swallowed; a click without a
    // pointer (assistive tech, el.click()) still works.
    const swallow = new WeakMap(); // key → { n, t } clicks to ignore
    const keyAt = (e) => {
      const k = e.target?.closest?.('.kz-key');
      return k && root.contains(k) ? k : null;
    };
    function commit(p) {
      if (p.done) return;
      p.done = true;
      const now = performance.now();
      const sw = swallow.get(p.key);
      swallow.set(p.key, { n: (sw && now - sw.t < 1000 ? sw.n : 0) + 1, t: now });
      activate(p.key);
    }
    const onPointerDown = (e) => {
      const key = keyAt(e);
      if (!key || e.button > 0) return;
      // Rollover, as on a phone keyboard: a new finger landing commits the keys
      // still held, so overlapping taps type in the order they were pressed.
      pressed.forEach(commit);
      pressed.set(e.pointerId, { key, done: false });
      key.classList.add('down');
    };
    const onPointerUp = (e) => {
      const p = pressed.get(e.pointerId);
      if (!p) return;
      pressed.delete(e.pointerId);
      flashKey(p.key, 70);
      commit(p);
    };
    const onPointerCancel = (e) => {
      const p = pressed.get(e.pointerId);
      if (!p) return;
      pressed.delete(e.pointerId);
      p.key.classList.remove('down');
    };
    const onClick = (e) => {
      const el = e.target.closest('.kz-key, [data-cmd]');
      if (!el || !root.contains(el)) return;
      el.blur?.();
      if (el.classList.contains('kz-key')) {
        const sw = swallow.get(el);
        if (sw && sw.n > 0 && performance.now() - sw.t < 1000) {
          sw.n--;
          return;
        }
      }
      activate(el);
    };
    // Keep focus off the keys so a physical Enter never "clicks" a focused key.
    const onMouseDown = (e) => {
      if (e.target.closest('.kz-key, .kz-hint')) e.preventDefault();
    };
    // The shell blocks touchmove inside the stage; let the card scroll if it overflows.
    const onCardTouchMove = (e) => {
      if ($card.scrollHeight > $card.clientHeight) e.stopPropagation();
    };
    const onKey = (e) => {
      if (!s || !kit.playing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (phase === 'card') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!e.repeat) primaryCardAction();
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) submit();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        backspace();
        return;
      }
      // لا: the Arabic-layout key, or B on a Latin keyboard (its Arabic-101 position).
      if (e.key === 'لا' || e.key === 'لأ' || e.key === 'لإ' || e.key === 'لآ' || (e.code === 'KeyB' && /^b$/i.test(e.key))) {
        e.preventDefault();
        typeLetter('ل');
        typeLetter('ا');
        flashKey(keyEls.get('ل'));
        flashKey(keyEls.get('ا'));
        return;
      }
      let ch = AR_KEY_ALIASES[e.key] ?? e.key;
      if (!LETTERS.has(ch)) ch = /^[a-z;',./[\]`]$/i.test(e.key) ? CODE_MAP[e.code] : null;
      if (ch && LETTERS.has(ch)) {
        e.preventDefault();
        typeLetter(ch);
        flashKey(keyEls.get(ch));
      }
    };
    const noop = () => {};
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerCancel);
    root.addEventListener('mousedown', onMouseDown);
    root.addEventListener('touchstart', noop, { passive: true }); // enables :active on iOS
    $card.addEventListener('touchmove', onCardTouchMove, { passive: true });
    document.addEventListener('keydown', onKey);

    // ------------------------------------------------------------ debug hooks
    function flushDebug() {
      if (!debugQueue.length) return;
      later(() => {
        const fn = debugQueue.shift();
        fn?.();
      }, 30);
    }
    const whenReady = (fn) => () => {
      if (!s || phase === 'over' || phase === 'idle') return;
      if (phase === 'anim') debugQueue.push(fn);
      else fn();
    };
    function typeWord(letters) {
      w.cur = [];
      renderCurrentRow();
      letters.forEach((ch) => typeLetter(ch));
      submit();
    }
    /** A full-length guess that is wrong and is not a synonym (which would not use a try). */
    function wrongLetters() {
      const n = w.letters.length;
      const ok = (k) => k !== w.key && !synonymFor(k, w);
      const other = s.pool.find((x, i) => i >= w.row * 3 && lettersOf(x).length === n && ok(keyOf(x)));
      if (other) return lettersOf(other);
      const alt = [...w.letters];
      for (const ch of ['ذ', 'ظ', 'ث', 'ض']) {
        alt[0] = ch;
        if (ok(alt.join(''))) break;
      }
      return alt;
    }
    kit.debug({
      info: () =>
        s && {
          phase,
          daily: s.daily,
          day: s.day,
          targetId: w?.word?.id ?? null,
          word: w?.word?.ar ?? null,
          clue: w?.clue ?? null,
          letters: w?.letters ?? [],
          row: w?.row ?? 0,
          guesses: (w?.guesses ?? []).map((g) => g.join('')),
          current: (w?.cur ?? []).join(''),
          hint: !!w?.hint,
          tries: w?.guesses ? triesOf(w) : 0,
          synonyms: (w?.syn ?? []).map((x) => x.ar),
          score: s.score,
          solved: s.solved,
          wordIndex: s.words.length,
        },
      answer: whenReady(() => {
        if (phase === 'card') return primaryCardAction();
        if (phase === 'play') typeWord(w.letters);
      }),
      wrong: whenReady(() => {
        if (phase === 'card') return primaryCardAction();
        if (phase === 'play') typeWord(wrongLetters());
      }),
    });

    renderIdle();

    // ------------------------------------------------------------ lifecycle
    function reset() {
      clearTimers();
      hideToast();
      debugQueue.length = 0;
      pressed.clear();
      $fx.innerHTML = '';
      hideCard();
    }

    return {
      start(opts) {
        reset();
        s = {
          daily: !!opts.daily,
          day: opts.day,
          pool: opts.pool,
          rng: opts.rng,
          score: 0,
          solved: 0,
          words: [],
          missed: [],
          used: new Set(),
        };
        kit.hud.score(0);
        startWord(s.daily ? chooseDaily() : choosePractice(), true);
        if (s.daily) restoreDaily();
      },
      stop() {
        reset();
        s = null;
        kit.hud.extra('');
        renderIdle();
      },
      destroy() {
        reset();
        s = null;
        pressTimers.forEach(clearTimeout);
        pressTimers.clear();
        ro.disconnect();
        root.removeEventListener('click', onClick);
        root.removeEventListener('pointerdown', onPointerDown);
        root.removeEventListener('pointerup', onPointerUp);
        root.removeEventListener('pointercancel', onPointerCancel);
        root.removeEventListener('mousedown', onMouseDown);
        root.removeEventListener('touchstart', noop);
        $card.removeEventListener('touchmove', onCardTouchMove);
        document.removeEventListener('keydown', onKey);
        root.remove();
        style.remove();
      },
    };
  },
};
