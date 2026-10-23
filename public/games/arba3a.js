// Arba3a (أربعة) — NYT Connections for Libyan Arabic words.
// Sixteen Arabic tiles hide four groups of four words that share a deck
// category (food, family, verbs of motion…). Tap four tiles and Submit; a
// right group merges into a coloured bar with every word's meaning, a wrong
// one costs one of four mistakes and flips the tiles to show what they mean.
// Groups are coloured by difficulty 🟨 → 🟩 → 🟦 → 🟪. Daily mode is one
// shared seeded puzzle (progress survives leaving the game); practice deals a
// fresh puzzle every round.
import { AR_FONT, UI_FONT, fontsReady, normAr, shortEn, shuffle, stripTashkeel } from './common.js';

const SIZE = 4;
const MAX_MISTAKES = 4;
// A group is drawn from at least this many candidate words when the deck has
// them, so small categories do not deal the same four every time…
const MIN_CAND = 6;
// …topping a category up with at most this many words from outside the level.
const MAX_EXTRA = 2;

// Difficulty tiers, easiest first. A tier may reach `depth` words down a
// category's usage ranking, or `frac` of the category's level words if more.
const TIERS = [
  { key: 'yellow', bg: '#f9df6d', ink: '#3a2f00', sq: '🟨', depth: 6, frac: 0.4 },
  { key: 'green', bg: '#a0c35a', ink: '#1d3007', sq: '🟩', depth: 9, frac: 0.6 },
  { key: 'blue', bg: '#b0c4ef', ink: '#13254f', sq: '🟦', depth: 12, frac: 0.8 },
  { key: 'purple', bg: '#ba81c5', ink: '#36103f', sq: '🟪', depth: 18, frac: 1 },
];

// Every deck category: [emoji, English label, Arabic label] (same meaning in both).
const CATS = {
  food: ['🍞', 'Food', 'ماكلة'],
  drink: ['🥤', 'Drinks', 'مشروبات'],
  kitchen: ['🍳', 'Kitchen', 'الكوجينة'],
  people: ['🧑', 'People', 'ناس'],
  family: ['👪', 'Family', 'العيلة'],
  work: ['💼', 'Work', 'الخدمة'],
  body: ['🖐️', 'Body', 'الجسم'],
  health: ['🩺', 'Health', 'الصحة'],
  city: ['🏙️', 'City', 'المدينة'],
  travel: ['✈️', 'Travel', 'السفر'],
  cars: ['🚗', 'Cars', 'السيارات'],
  admin: ['📋', 'Paperwork', 'الأوراق'],
  nature: ['🌿', 'Nature', 'الطبيعة'],
  animals: ['🐪', 'Animals', 'حيوانات'],
  agriculture: ['🌾', 'Farming', 'الفلاحة'],
  adjectives: ['🎨', 'Describing words', 'صفات'],
  emotions: ['😊', 'Feelings', 'مشاعر'],
  social: ['🙌', 'Expressions', 'تعابير'],
  greetings: ['👋', 'Greetings', 'تحيات'],
  school: ['🎒', 'School', 'المدرسة'],
  tech: ['📱', 'Tech', 'تكنولوجيا'],
  media: ['📺', 'Media', 'الإعلام'],
  time: ['⏰', 'Time', 'الوقت'],
  numbers: ['🔢', 'Numbers', 'أرقام'],
  measures: ['📏', 'Measures', 'مقاييس'],
  home: ['🏠', 'Home', 'الحوش'],
  tools: ['🔧', 'Tools', 'العدّة'],
  clothing: ['👕', 'Clothes', 'الحوايج'],
  shopping: ['🛍️', 'Shopping', 'السوق'],
  colors: ['🌈', 'Colours', 'ألوان'],
  culture: ['🎭', 'Culture', 'الثقافة'],
  religion: ['🕌', 'Religion', 'الدين'],
  sports: ['⚽', 'Sports', 'الرياضة'],
  abstract: ['💭', 'Ideas', 'أفكار'],
  pronouns: ['👤', 'Pronouns', 'ضمائر'],
  questions: ['❓', 'Question words', 'أدوات السؤال'],
  prepositions: ['🔗', 'Prepositions', 'حروف الجر'],
  conjunctions: ['➕', 'Connectors', 'أدوات الربط'],
  adverbs: ['⏩', 'Adverbs', 'ظروف'],
  'verbs-core': ['⚙️', 'Core verbs', 'أفعال أساسية'],
  'verbs-motion': ['🏃', 'Verbs of motion', 'أفعال الحركة'],
  'verbs-communication': ['💬', 'Talking verbs', 'أفعال الكلام'],
  'verbs-daily': ['🧺', 'Everyday verbs', 'أفعال يومية'],
  'verbs-mind': ['🧠', 'Verbs of the mind', 'أفعال العقل'],
  'verbs-work': ['🛠️', 'Getting things done', 'أفعال الشغل'],
};
const catInfo = (cat) => {
  const c = CATS[cat];
  if (c) return { emoji: c[0], en: c[1], ar: c[2] };
  const en = String(cat ?? 'Words').replace(/^verbs-/, 'Verbs: ').replace(/^\w/, (x) => x.toUpperCase());
  return { emoji: '🏷️', en, ar: '' };
};

// Words whose deck category reads wrong as a group label: religious words
// filed under culture play as religion; a few outliers never join a group.
const RECAT = new Map(
  [['culture', ['الله', 'صلاة', 'حلال', 'صوم', 'أذان', 'قرآن'], 'religion']].flatMap(([from, list, to]) => list.map((a) => [`${from}|${normAr(a)}`, to])),
);
const LEAVE_OUT = new Set(
  [
    ['culture', ['بلاد', 'ليبيا', 'حكومة']],
    ['verbs-work', ['تأخّر']],
  ].flatMap(([cat, list]) => list.map((a) => `${cat}|${normAr(a)}`)),
);
const catOf = (w) => RECAT.get(`${w.cat}|${normAr(w.ar)}`) ?? w.cat;

// How hard a category feels to a learner: 0 = concrete and visual,
// 2+ = grammatical or abstract. Unknown categories count as 1.5.
const HARD = {
  colors: 0, animals: 0, food: 0, drink: 0, numbers: 0.2, body: 0.2, family: 0.2, clothing: 0.4, home: 0.4,
  kitchen: 0.6, people: 0.6, city: 0.6, school: 0.6, nature: 0.6, sports: 0.6, tech: 0.5, time: 0.7,
  travel: 0.8, cars: 0.8, shopping: 0.8, health: 0.8, media: 0.8, work: 0.9, tools: 1, agriculture: 1,
  greetings: 1, measures: 1.2, culture: 1.2, religion: 1.2, admin: 1.5, adjectives: 1.4, emotions: 1.4,
  questions: 1.4, 'verbs-core': 1.5, 'verbs-motion': 1.6, 'verbs-daily': 1.7, 'verbs-work': 1.8,
  'verbs-communication': 1.8, 'verbs-mind': 2, social: 1.6, pronouns: 1.6, prepositions: 2, abstract: 2,
  conjunctions: 2.2, adverbs: 2.2,
};
const hardOf = (cat) => HARD[cat] ?? 1.5;
// Grab-bag categories make fuzzier groups, so they come up less often.
const GRAB_BAG = new Set(['abstract', 'adverbs', 'social', 'culture', 'conjunctions', 'pronouns']);

// At most one category per confusable family (a puzzle must have one answer).
const FAMILIES = [
  ['food', 'drink', 'kitchen'],
  ['people', 'family', 'work'],
  ['body', 'health'],
  ['city', 'travel', 'cars', 'admin'],
  ['nature', 'animals', 'agriculture'],
  ['adjectives', 'emotions'],
  ['social', 'greetings'],
  ['school', 'tech', 'media'],
  ['time', 'numbers', 'measures'],
  ['home', 'tools'],
  ['clothing', 'shopping'],
  // extra families for fairness: little grammar words overlap, as do culture words
  ['pronouns', 'prepositions', 'conjunctions', 'adverbs', 'questions'],
  ['culture', 'religion', 'sports'],
];
const FAMILY = new Map(FAMILIES.flatMap((list, i) => list.map((c) => [c, i])));
const familyOf = (cat) => (String(cat).startsWith('verbs-') ? 'verbs' : FAMILY.has(cat) ? `f${FAMILY.get(cat)}` : `solo:${cat}`);
// Cross-family pairs whose words blur together (a colour is an adjective,
// a chicken is food and an animal, a plate lives in the kitchen and the home,
// a cold is an illness and the weather, patience is a feeling and a verb…).
const CONFLICTS = new Set(
  [
    ['colors', 'adjectives'], ['animals', 'food'], ['food', 'agriculture'], ['home', 'kitchen'], ['home', 'drink'],
    ['home', 'tech'], ['health', 'work'], ['health', 'people'], ['work', 'school'], ['shopping', 'measures'],
    ['shopping', 'numbers'], ['nature', 'time'], ['adverbs', 'time'], ['city', 'culture'], ['abstract', 'emotions'],
    ['abstract', 'religion'], ['abstract', 'culture'], ['abstract', 'pronouns'], ['social', 'adverbs'],
    ['social', 'conjunctions'], ['social', 'religion'], ['greetings', 'questions'], ['travel', 'tools'],
    ['health', 'nature'], ['emotions', 'verbs-mind'], ['prepositions', 'verbs-core'],
  ].flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]),
);
function compatible(a, b, mode) {
  if (a === b) return false;
  if (mode === 'any') return true;
  if (familyOf(a) === familyOf(b)) return false;
  return mode === 'family' || !CONFLICTS.has(`${a}|${b}`);
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// comparison keys, memoised per word object (the deck is built once per page)
const keyCache = new WeakMap();
function keysOf(w) {
  let k = keyCache.get(w);
  if (!k) {
    k = {
      a: normAr(w.ar).replace(/^ال(?=..)/, ''),
      e: shortEn(w, 99)
        .toLowerCase()
        .replace(/^(to|a|an|the)\s+/, '')
        .replace(/[^a-z0-9 ]/g, '')
        .trim(),
      ok: undefined,
    };
    keyCache.set(w, k);
  }
  return k;
}
const arKey = (w) => keysOf(w).a;
const enKey = (w) => keysOf(w).e;
const senseKey = (sense) =>
  sense
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/^\s*(to|a|an|the)\s+/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const sensesOf = (w) => [...new Set(String(w.en ?? '').split(';').map(senseKey).filter((x) => x.length >= 2))];

/** Tiles need short single-ish words with a short English meaning. */
function suitable(w) {
  if (!w || !w.cat || w.pos === 'phrase' || !w.ar || !w.en) return false;
  const k = keysOf(w);
  return (k.ok ??= suitableWord(w));
}
function suitableWord(w) {
  if (LEAVE_OUT.has(`${w.cat}|${normAr(w.ar)}`)) return false;
  const ar = stripTashkeel(w.ar).trim();
  if (ar.length < 2 || ar.length > 10 || /[.؟?!،,/()…]/.test(ar)) return false;
  const parts = ar.split(/\s+/);
  // two-word tiles wrap onto two lines; one very long word would shrink too far on a small phone
  if (parts.length > 2 || parts.some((p) => p.length > 7)) return false;
  const en = shortEn(w, 99);
  return en.length >= 2 && en.length <= 16 && enKey(w).length >= 2;
}

/**
 * Which categories a word could fairly be read as, judged across the whole
 * deck: its own, any category of a homograph (برد: health "cold" and nature
 * "cold weather") and any category holding one of its English senses
 * (عند "to have" vs verbs-core عنده). Cached per deck array.
 */
const fitsCache = new WeakMap();
function fitsIndex(deck) {
  let fits = fitsCache.get(deck);
  if (fits) return fits;
  const byAr = new Map();
  const bySense = new Map();
  const add = (map, key, cat) => {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(cat);
  };
  for (const w of deck) {
    if (!w?.cat || !w.ar) continue;
    const cat = catOf(w);
    add(byAr, arKey(w), cat);
    for (const sense of sensesOf(w)) add(bySense, sense, cat);
  }
  const memo = new Map();
  fits = (w) => {
    let set = memo.get(w.id);
    if (set) return set;
    set = new Set([catOf(w)]);
    for (const c of byAr.get(arKey(w)) ?? []) set.add(c);
    for (const sense of sensesOf(w)) for (const c of bySense.get(sense) ?? []) set.add(c);
    memo.set(w.id, set);
    return set;
  };
  fitsCache.set(deck, fits);
  return fits;
}

function weightedIndex(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

const difficulty = (cat, words) =>
  words.reduce((sum, w) => sum + Math.log2((w.rank ?? 3000) + 1), 0) / Math.max(1, words.length) + 2 * hardOf(cat);

/**
 * One attempt at a puzzle from `list` (level words first, then fallback
 * words). ctx: { fits, recent, borrowMax } — borrowMax caps the groups taken
 * from categories the level itself cannot fill (null = by family count).
 */
function tryBuild(list, inPool, rng, mode, ctx) {
  const byCat = new Map();
  for (const w of list) {
    const cat = catOf(w);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(w);
  }
  const cats = [];
  const ownFamilies = new Set();
  for (const [cat, ws] of byCat) {
    // distinct words only (counting), level words first, each part in rank order
    const seenA = new Set();
    const seenE = new Set();
    const uniq = [];
    for (const w of ws) {
      const a = arKey(w);
      const e = enKey(w);
      if (seenA.has(a) || seenE.has(e)) continue;
      seenA.add(a);
      seenE.add(e);
      uniq.push(w);
    }
    if (uniq.length < SIZE) continue;
    const own = uniq.filter((w) => inPool.has(w.id));
    const extra = uniq.filter((w) => !inPool.has(w.id));
    const borrowed = own.length < SIZE;
    if (!borrowed) ownFamilies.add(familyOf(cat));
    cats.push({ cat, own, extra, n: uniq.length, borrowed });
  }
  if (cats.length < SIZE) return null;
  cats.sort((a, b) => (a.cat < b.cat ? -1 : 1));
  // A level with few categories of its own (Top 100) borrows a group or two
  // from the fallback words so its puzzles do not keep dealing the same sets.
  const borrowMax = ctx.borrowMax ?? (ownFamilies.size >= 6 ? 0 : ownFamilies.size >= 4 ? 1 : 2);
  const recentCats = ctx.recent?.cats;
  const recentWords = ctx.recent?.words;
  const weightOf = (c) =>
    Math.pow(Math.min(c.n, 16), 0.35) *
    (0.35 + Math.min(c.own.length, 8) / 8) *
    (GRAB_BAG.has(c.cat) ? 0.45 : 1) *
    (c.n < SIZE + 2 ? 0.2 : 1) * // too few words to vary: the same set would keep coming back
    (c.borrowed ? 0.8 : 1) *
    (recentCats?.get(c.cat) ?? 1);

  for (let attempt = 0; attempt < 80; attempt++) {
    const chosen = [];
    let cand = cats.filter((c) => !c.borrowed || borrowMax > 0);
    while (chosen.length < SIZE && cand.length) {
      const c = cand[weightedIndex(cand.map(weightOf), rng)];
      chosen.push(c);
      const borrowedNow = chosen.filter((x) => x.borrowed).length;
      cand = cand.filter((x) => chosen.every((y) => compatible(x.cat, y.cat, mode)) && !(x.borrowed && borrowedNow >= borrowMax));
    }
    if (chosen.length < SIZE) continue;
    // keep puzzles learnable: at least two concrete groups when possible
    if (attempt < 50 && chosen.filter((c) => hardOf(c.cat) < 1).length < 2) continue;
    const chosenCats = new Set(chosen.map((c) => c.cat));
    // a word that could also be read as another chosen category would give the puzzle two answers
    const clean = (cat) => (w) => {
      for (const c of ctx.fits(w)) if (c !== cat && chosenCats.has(c)) return false;
      return true;
    };
    const ordered = chosen
      .map((c) => ({ c, d: difficulty(c.cat, [...c.own, ...c.extra].slice(0, 6)) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.c);
    const usedA = new Set();
    const usedE = new Set();
    const groups = [];
    for (let t = 0; t < SIZE; t++) {
      const c = ordered[t];
      const ok = clean(c.cat);
      const own = c.own.filter(ok);
      const extra = c.extra.filter(ok);
      const depth = Math.max(TIERS[t].depth, Math.ceil(own.length * TIERS[t].frac));
      const window = own.slice(0, depth);
      const topUp = extra.slice(0, Math.max(0, (c.borrowed ? Math.max(depth, MIN_CAND) : MIN_CAND) - window.length));
      let order = shuffle([...window, ...topUp], rng);
      // practice: words from the last rounds go to the back of the queue
      if (recentWords?.size) order = [...order.filter((w) => !recentWords.has(w.id)), ...order.filter((w) => recentWords.has(w.id))];
      order.push(...own.slice(depth), ...extra.slice(topUp.length));
      const picked = [];
      const take = (limitExtras) => {
        for (const w of order) {
          if (picked.length === SIZE) return;
          if (picked.includes(w)) continue;
          if (limitExtras && !inPool.has(w.id) && picked.filter((x) => !inPool.has(x.id)).length >= MAX_EXTRA) continue;
          const a = arKey(w);
          const e = enKey(w);
          if (usedA.has(a) || usedE.has(e)) continue;
          usedA.add(a);
          usedE.add(e);
          picked.push(w);
        }
      };
      take(!c.borrowed);
      if (picked.length < SIZE) take(false);
      if (picked.length < SIZE) break;
      groups.push({ cat: c.cat, words: picked });
    }
    if (groups.length < SIZE) continue;
    groups.forEach((g) => (g.d = difficulty(g.cat, g.words)));
    groups.sort((a, b) => a.d - b.d);
    return groups.map((g, tier) => ({ cat: g.cat, tier, words: g.words }));
  }
  return null;
}

/**
 * Four groups of four from `pool` (seeded by rng), topped up from `fallback`
 * (the deck's top-1000) where the pool is thin or lacks categories.
 * opts.deck: every deck word (for the homograph / shared-meaning check);
 * opts.recent: { cats: Map(cat → weight), words: Set(id) } to steer practice
 * away from the last rounds.
 * Returns [{ cat, tier, words: [w×4] }] easiest first, or null.
 */
export function buildPuzzle(pool, rng, fallback = [], opts = {}) {
  const own = [];
  const seen = new Set();
  for (const w of pool) if (suitable(w) && !seen.has(w.id)) (seen.add(w.id), own.push(w));
  const merged = [...own, ...fallback.filter((w) => !seen.has(w.id) && suitable(w))];
  const ctx = { fits: fitsIndex(opts.deck ?? merged), recent: opts.recent ?? null, borrowMax: null };
  const open = { ...ctx, borrowMax: SIZE };
  return (
    tryBuild(merged, seen, rng, 'strict', ctx) ??
    tryBuild(merged, seen, rng, 'strict', open) ??
    tryBuild(merged, seen, rng, 'family', open) ??
    tryBuild(merged, seen, rng, 'any', open)
  );
}

// Practice rounds this session (module scope survives leaving and re-entering
// the game): recent categories are dealt less and recent words go last.
const RECENT = [];
function recentSteer() {
  const cats = new Map();
  RECENT.forEach((r, i) => {
    const f = [0.2, 0.45, 0.7][RECENT.length - 1 - i] ?? 1;
    for (const c of r.cats) cats.set(c, Math.min(cats.get(c) ?? 1, f));
  });
  return { cats, words: new Set(RECENT.slice(-2).flatMap((r) => r.ids)) };
}
function rememberPractice(groups) {
  RECENT.push({ cats: groups.map((g) => g.cat), ids: groups.flatMap((g) => g.words.map((w) => w.id)) });
  while (RECENT.length > 3) RECENT.shift();
}

// ------------------------------------------------------------------ daily stats & progress
const STATS_KEY = 'arcade-arba3a-stats';
const PROGRESS_KEY = 'arcade-arba3a-progress-';
function recordDaily(day, won, mistakes) {
  let st = null;
  try {
    st = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
  } catch {
    /* ignore */
  }
  st = { played: 0, wins: 0, perfect: 0, streak: 0, best: 0, last: 0, lastWin: 0, ...(st && typeof st === 'object' ? st : {}) };
  if (st.last !== day) {
    st.played++;
    st.last = day;
    if (won) {
      st.wins++;
      if (!mistakes) st.perfect++;
      st.streak = st.lastWin === day - 1 ? st.streak + 1 : 1;
      st.lastWin = day;
      st.best = Math.max(st.best, st.streak);
    } else st.streak = 0;
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(st));
    } catch {
      /* ignore */
    }
  }
  return st;
}
/** The daily in progress (saved after every guess so leaving cannot reset it). */
function loadProgress(day) {
  try {
    const v = JSON.parse(localStorage.getItem(PROGRESS_KEY + day) || 'null');
    return v && typeof v === 'object' && v.v === 1 ? v : null;
  } catch {
    return null;
  }
}
function saveProgress(day, data) {
  try {
    localStorage.setItem(PROGRESS_KEY + day, JSON.stringify(data));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PROGRESS_KEY) && k !== PROGRESS_KEY + day) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

const PRAISE = [
  { en: 'Perfect!', ar: 'ممتاز!' },
  { en: 'Great!', ar: 'باهي!' },
  { en: 'Solid!', ar: 'زين!' },
  { en: 'Phew!', ar: 'الحمد لله!' },
];
const LOST = { en: 'Next time!', ar: 'المرة الجاية!' };

// ------------------------------------------------------------------ styles
const P = '.g-arba3a';
const CSS = `
${P} {
  --gap: 8px; --pad: 12px; --tile: #efefe6; --tile-edge: #cfcfc2; --tile-ink: #16161a; --sel: #5a594e; --sel-edge: #3b3a33;
  --rowmax: 104px;
  position: absolute; inset: 0; box-sizing: border-box; overflow: hidden;
  display: grid; grid-template-columns: minmax(0, 1fr);
  /* the board grows to its natural size first; spare height on tall phones goes above and below
     the whole cluster (kicker, board, dots, buttons) so no empty band opens inside it */
  grid-template-rows: minmax(0, 1fr) auto minmax(0, calc(4 * var(--rowmax) + 3 * var(--gap) + 8px)) auto auto minmax(0, 1fr);
  grid-template-areas: "." "top" "board" "mid" "actions" ".";
  padding: 6px var(--pad) 10px;
  background: radial-gradient(140% 75% at 50% -8%, #33237a 0%, #191a38 52%, #0f1222 100%);
  color: #f8fafc; font-family: ${UI_FONT}; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
${P}.narrow { --gap: 6px; --pad: 8px; }
${P} button { font-family: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
${P} .ab-arf { font-family: ${AR_FONT}; direction: rtl; unicode-bidi: isolate; letter-spacing: 0; text-transform: none; }

${P} .ab-top { grid-area: top; height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
${P} .ab-kicker { font: 600 0.92rem/1.2 ${UI_FONT}; color: #ddd6fe; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
${P} .ab-kicker b { color: #fff; }
${P} .ab-abc {
  flex: none; height: 32px; min-width: 56px; padding: 0 12px; border-radius: 999px; cursor: pointer;
  border: 1.5px solid rgba(221,214,254,0.55); background: rgba(255,255,255,0.06); color: #e9e5ff;
  font: 800 0.86rem/1 ${UI_FONT}; display: inline-flex; align-items: center; justify-content: center; gap: 5px; position: relative;
}
${P} .ab-abc::before { content: ''; position: absolute; inset: -8px -4px; }
${P} .ab-abc[aria-pressed="true"] { background: #fde68a; border-color: #fde68a; color: #3a2f00; }
${P} .ab-abc[hidden] { display: none; }

${P} .ab-board { grid-area: board; min-height: 0; min-width: 0; position: relative; display: flex; padding: 4px 0; }
${P} .ab-grid {
  flex: 1 1 auto; min-width: 0; min-height: 0; display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: repeat(4, minmax(0, 1fr)); gap: var(--gap);
}
${P} .ab-tile {
  position: relative; min-width: 0; min-height: 0; margin: 0; padding: 4px 4px 5px; border: 0; border-radius: 10px; cursor: pointer;
  background: var(--tile); color: var(--tile-ink); box-shadow: 0 3px 0 var(--tile-edge);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; overflow: hidden;
  transition: background-color 0.14s, color 0.14s, box-shadow 0.14s;
}
${P} .ab-tile:active { filter: brightness(0.94); }
${P} .ab-tile:focus-visible { outline: 3px solid #a78bfa; outline-offset: 2px; }
${P} .ab-tile.sel { background: var(--sel); color: #fff; box-shadow: 0 3px 0 var(--sel-edge); }
${P} .ab-tile.ghost { background: rgba(239,239,230,0.12); box-shadow: none; cursor: default; }
${P} .ab-tile .ab-ar { flex: none; font: 700 var(--fs, 24px)/1.32 ${AR_FONT}; direction: rtl; unicode-bidi: isolate; white-space: nowrap; max-width: 100%; }
${P} .ab-tile.wrap .ab-ar { white-space: normal; line-height: 1.15; text-align: center; }
${P} .ab-tile .ab-tr, ${P} .ab-tile .ab-en {
  flex: none; display: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: ltr;
}
${P} .ab-tile .ab-tr { font: 600 italic 11.5px/1.15 ${UI_FONT}; color: #6d6a5a; padding: 0 3px; box-sizing: border-box; }
${P} .ab-tile.sel .ab-tr { color: #e7e5d6; }
${P}.abc .ab-tile .ab-tr { display: block; }
${P} .ab-tile .ab-en {
  font: 800 11.5px/1.12 ${UI_FONT}; color: #6d28d9; white-space: normal; text-align: center; overflow-wrap: anywhere;
  display: none; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
${P}.lowrows .ab-tile .ab-en { -webkit-line-clamp: 1; }
${P}.lowrows .ab-tile .ab-tr { font-size: 10.5px; }
${P} .ab-tile.sel .ab-en { color: #fde68a; }
${P} .ab-tile.peek .ab-en { display: -webkit-box; animation: g-arba3a-peek 0.28s ease-out; }
${P} .ab-tile.peek .ab-ar { font-size: var(--fsp, 20px); }
${P}.abc .ab-tile.peek .ab-tr { display: none; }
${P} .ab-tile.peek::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 0 0 2px rgba(253,230,138,0.85);
}
@keyframes g-arba3a-peek { from { opacity: 0; transform: translateY(5px); } }

${P} .ab-bar {
  grid-column: 1 / -1; min-height: 0; min-width: 0; border-radius: 10px; background: var(--c); color: var(--ink);
  display: flex; flex-direction: column; align-items: center; padding: 3px 4px 4px; overflow: hidden;
  box-shadow: 0 3px 0 rgba(0,0,0,0.22); position: relative; box-sizing: border-box;
}
${P} .ab-bar.revealed { background-image: repeating-linear-gradient(135deg, rgba(255,255,255,0.0) 0 10px, rgba(255,255,255,0.16) 10px 20px); }
/* auto margins centre the content but let any overflow fall off the bottom, never the label */
${P} .ab-bar-h {
  margin-top: auto; flex: none; display: flex; align-items: baseline; justify-content: center; gap: 0 6px; max-width: 100%;
  border: 0; background: none; color: inherit; padding: 0 4px; cursor: pointer;
  font: 800 var(--hfs, 13px) / 1.15 ${UI_FONT}; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; overflow: hidden;
}
${P} .ab-bar-h .ab-arf { font-weight: 700; font-size: 1.12em; }
${P} .ab-bar-h .ab-emo { letter-spacing: 0; }
${P} .ab-bar-w { margin-bottom: auto; flex: none; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); width: 100%; direction: rtl; margin-top: 1px; }
${P} .ab-bw {
  min-width: 0; border: 0; background: none; color: inherit; padding: 0 2px; margin: 0; cursor: pointer; border-radius: 8px;
  display: flex; flex-direction: column; align-items: center;
}
${P} .ab-bw:active { background: rgba(255,255,255,0.3); }
${P} .ab-bw .ab-arf { font-weight: 700; font-size: var(--bfs, 18px); line-height: 1.3; white-space: nowrap; max-width: 100%; }
${P} .ab-bw .ab-gl {
  font: 600 var(--gfs, 11px) / 1.1 ${UI_FONT}; opacity: 0.86; max-width: 100%; overflow: hidden; direction: ltr; text-align: center;
  white-space: normal; overflow-wrap: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
${P} .ab-bar.nogl .ab-gl { display: none; }
/* short bars (landscape): label on the left, words on the right */
${P} .ab-bar.tight { flex-direction: row; align-items: center; gap: 6px; padding: 2px 6px; }
${P} .ab-bar.tight .ab-bar-h { margin: 0; max-width: 40%; flex-wrap: wrap; justify-content: flex-start; text-align: left; }
${P} .ab-bar.tight .ab-bar-w { flex: 1 1 auto; min-width: 0; width: auto; margin: 0; }
${P} .ab-bar.tight .ab-gl { -webkit-line-clamp: 1; }

${P} .ab-mid { grid-area: mid; height: 36px; display: flex; align-items: center; justify-content: center; gap: 10px; font: 500 0.9rem/1 ${UI_FONT}; color: #cbd5e1; white-space: nowrap; }
${P} .ab-mid.none { color: #fca5a5; font-weight: 700; }
${P} .ab-mid.none .ab-dots { display: none; }
${P} .ab-dots { display: inline-flex; gap: 8px; }
${P} .ab-dots i {
  width: 14px; height: 14px; border-radius: 50%; background: #e2e8f0; display: inline-block;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.08); transition: transform 0.3s cubic-bezier(0.5, -0.6, 0.6, 1.4), opacity 0.3s, background-color 0.2s;
}
${P} .ab-dots i.gone { transform: scale(0); opacity: 0; }
${P} .ab-dots.warn i { background: #fca5a5; }

${P} .ab-actions { grid-area: actions; display: flex; gap: 8px; justify-content: center; min-width: 0; }
${P} .ab-btn {
  flex: 1 1 auto; max-width: 150px; height: 48px; padding: 0 12px; border-radius: 999px; cursor: pointer;
  border: 1.5px solid rgba(255,255,255,0.75); background: transparent; color: #fff; font: 700 0.95rem/1 ${UI_FONT};
  white-space: nowrap; transition: background-color 0.15s, opacity 0.15s, transform 0.08s, box-shadow 0.2s;
}
${P}.narrow .ab-btn { padding: 0 8px; font-size: 0.88rem; }
${P} .ab-btn:active:not(:disabled) { transform: scale(0.96); }
${P} .ab-btn:disabled { opacity: 0.38; cursor: default; }
${P} .ab-btn.go { background: #fff; color: #1e1b4b; border-color: #fff; }
${P} .ab-btn.go:not(:disabled) { background: #8b5cf6; border-color: #a78bfa; color: #fff; box-shadow: 0 0 0 3px rgba(139,92,246,0.3), 0 6px 18px rgba(139,92,246,0.45); }
${P} .ab-btn.go:disabled { background: transparent; color: #fff; border-color: rgba(255,255,255,0.75); }

/* short screens (landscape): no kicker; dots, buttons and abc share rows with the board */
${P}.short { padding: 4px var(--pad) 6px; column-gap: 10px; }
${P}.short .ab-top { display: contents; }
${P}.short .ab-kicker { display: none; }
${P}.short .ab-abc { grid-area: abc; align-self: center; justify-self: end; }
${P}.short .ab-mid:not(.none) .ab-mid-l { display: none; }
${P}.short .ab-board { padding: 2px 0 6px; }
${P}.short.wide {
  grid-template-columns: auto minmax(0, 1fr) auto; grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas: "board board board" "mid actions abc";
}
${P}.short.wide .ab-mid { height: 44px; }
${P}.short.wide .ab-btn { height: 42px; }
${P}.short.wide .ab-abc { height: 36px; }
${P}.short:not(.wide) {
  grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: "mid abc" "board board" "actions actions";
}
${P}.short:not(.wide) .ab-mid { height: 34px; justify-content: flex-start; }
${P}.short:not(.wide) .ab-btn { height: 42px; }

${P} .ab-toast {
  position: absolute; z-index: 6; left: 50%; top: 5px; transform: translate(-50%, -8px); pointer-events: none;
  background: #f8fafc; color: #0f172a; font: 700 0.98rem/1.2 ${UI_FONT}; padding: 10px 16px; border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.16s, transform 0.16s; white-space: nowrap;
  max-width: calc(100% - 16px); overflow: hidden; text-overflow: ellipsis; box-sizing: border-box;
}
${P} .ab-toast.show { opacity: 1; transform: translate(-50%, 0); }
${P} .ab-toast .ab-arf { font-size: 1.15em; margin-left: 6px; }
${P} .ab-toast.good { background: #fef9c3; color: #3f2d00; }
${P} .ab-fx { position: absolute; inset: 0; pointer-events: none; z-index: 7; overflow: hidden; }
${P} .ab-fx i { position: absolute; left: 0; top: 0; width: 8px; height: 12px; border-radius: 2px; will-change: transform, opacity; }
${P}.rm .ab-tile, ${P}.rm .ab-dots i, ${P}.rm .ab-toast { transition: none; }
${P}.rm .ab-tile.peek .ab-en { animation: none; }
`;

export default {
  howTo: [
    'Find <strong>4 groups of 4</strong> Libyan words that share a theme: 🍞 food, 👪 family…',
    'Tap 4 tiles, then <strong>Submit</strong>. Groups go 🟨 easy → 🟩 → 🟦 → 🟪 tricky.',
    '<strong>4 mistakes</strong> allowed. A wrong guess shows what its words mean (unless you were <em>one away</em>).',
    'Stuck? <strong>abc</strong> shows how each word sounds.',
  ],
  minWords: 16,
  wordFilter: suitable,

  create(stage, kit) {
    const rm = !!kit.reducedMotion;
    const style = document.createElement('style');
    style.textContent = CSS;
    stage.append(style);
    const root = document.createElement('div');
    root.className = `g-arba3a${rm ? ' rm' : ''}`;
    root.innerHTML = `
      <div class="ab-top">
        <div class="ab-kicker">Create <b>four groups of four!</b></div>
        <button class="ab-abc" data-ab="abc" aria-pressed="false" aria-label="Show transliterations">abc</button>
      </div>
      <div class="ab-board">
        <div class="ab-grid" role="group" aria-label="Word tiles"></div>
      </div>
      <div class="ab-toast" role="status" aria-live="polite"></div>
      <div class="ab-mid"><span class="ab-mid-l">Mistakes remaining:</span><span class="ab-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
      <div class="ab-actions">
        <button class="ab-btn" data-ab="shuffle">Shuffle</button>
        <button class="ab-btn" data-ab="deselect">Deselect all</button>
        <button class="ab-btn go" data-ab="submit">Submit</button>
      </div>
      <div class="ab-fx"></div>`;
    stage.append(root);
    const $ = (q) => root.querySelector(q);
    const $grid = $('.ab-grid');
    const $toast = $('.ab-toast');
    const $fx = $('.ab-fx');
    const $abc = $('.ab-abc');
    const $mid = $('.ab-mid');
    const $midL = $('.ab-mid-l');
    const $dotsBox = $('.ab-dots');
    const $dots = [...root.querySelectorAll('.ab-dots i')];
    const $shuffle = $('[data-ab="shuffle"]');
    const $deselect = $('[data-ab="deselect"]');
    const $submit = $('[data-ab="submit"]');

    // ------------------------------------------------------------ timers & animations
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };
    const wait = (ms) => new Promise((resolve) => later(resolve, ms));
    const anims = new Set();
    function animate(el, frames, opts) {
      if (!el?.animate) return null;
      try {
        const a = el.animate(frames, opts);
        anims.add(a);
        const done = () => anims.delete(a);
        a.addEventListener('finish', done);
        a.addEventListener('cancel', done);
        return a;
      } catch {
        return null;
      }
    }
    let toastTimer = 0;
    let raf = 0;

    // ------------------------------------------------------------ state
    let s = null; // the current round
    let phase = 'idle'; // idle | play | anim | over
    let token = 0; // bumps on every start/stop so stale async sequences bail out
    let abcOn = false;
    let paused = false;
    let pendingEnd = null; // a round that ended while paused finishes on resume
    let fallback = null;
    const debugQueue = [];
    const tiles = new Map(); // word id → tile element
    const peekTimers = new Map();

    const unsolved = () => (s ? s.groups.map((g, i) => i).filter((i) => !s.groups[i].solved && !s.groups[i].revealed) : []);
    const foundCount = () => (s ? s.groups.filter((g) => g.solved).length : 0);
    const scoreNow = () => {
      if (!s) return 0;
      const found = foundCount();
      return s.daily ? MAX_MISTAKES - s.mistakes + found : Math.max(0, found * 25 - s.mistakes * 5);
    };

    // ------------------------------------------------------------ measuring & fitting text
    const mctx = document.createElement('canvas').getContext('2d');
    function textWidth(text, px) {
      if (!mctx) return text.length * px * 0.55;
      mctx.font = `700 ${px}px ${AR_FONT}`;
      return mctx.measureText(text).width;
    }
    function uiWidth(text, px) {
      if (!mctx) return text.length * px * 0.58;
      mctx.font = `600 ${px}px ${UI_FONT}`;
      return mctx.measureText(text).width;
    }
    const fitPx = (text, base, maxW, min) => {
      const w = textWidth(text, base);
      return w <= maxW ? base : Math.max(min, Math.floor((base * maxW) / w));
    };
    function fitAll() {
      raf = 0;
      const W = root.clientWidth;
      const H = root.clientHeight;
      root.classList.toggle('narrow', W < 360);
      root.classList.toggle('short', H > 0 && H < 410);
      root.classList.toggle('wide', W >= 440);
      // tall phones get taller tiles (up to 1.3× their width) before any empty space
      const tileW = (W - 2 * (W < 360 ? 8 : 12) - 3 * (W < 360 ? 6 : 8)) / 4;
      root.style.setProperty('--rowmax', `${Math.round(Math.max(104, Math.min(124, tileW * 1.3)))}px`);
      if (!s) return;
      const rowH = Math.max(24, ($grid.clientHeight - 3 * (W < 360 ? 6 : 8)) / 4);
      root.classList.toggle('lowrows', rowH < 64);
      const abcLine = abcOn ? 14 : 0;
      for (const [id, el] of tiles) {
        if (!el.isConnected) continue;
        const w = el.clientWidth - 10;
        const h = el.clientHeight;
        if (w <= 0 || h <= 0) continue;
        const avail = h - 9 - abcLine; // padding, then the abc line when shown
        const text = s.byId.get(id).w.ar.trim();
        const base = Math.round(Math.max(14, Math.min(32, h * 0.42, (w + 10) * 0.36, avail / 1.32)));
        let fs = fitPx(text, base, w, 13);
        let wrap = false;
        // two-word tiles go onto two lines rather than shrinking below ~20px
        if (fs < 20 && /\s/.test(text)) {
          const longest = text.split(/\s+/).reduce((a, b) => (textWidth(a, 50) >= textWidth(b, 50) ? a : b));
          const fs2 = Math.min(fitPx(longest, base, w, 13), Math.floor(avail / 2.3));
          if (fs2 > fs) (fs = fs2), (wrap = true);
        }
        el.classList.toggle('wrap', wrap);
        el.style.setProperty('--fs', `${fs}px`);
        // a peek shows the meaning under a smaller word (no abc line then)
        const enH = (rowH < 64 ? 1 : 2) * 13;
        const fsp = Math.max(11, Math.min(Math.round(fs * 0.86), Math.floor((h - 9 - enH) / (wrap ? 2.3 : 1.32))));
        el.style.setProperty('--fsp', `${fsp}px`);
      }
      for (const gi of s.solvedOrder) fitBar(s.groups[gi]);
    }
    function fitBar(g) {
      const bar = g.bar;
      if (!bar?.isConnected) return;
      const bh = bar.clientHeight;
      const tight = bh < 62;
      bar.classList.toggle('tight', tight);
      const showGl = !tight || bh >= 44;
      bar.classList.toggle('nogl', !showGl);
      const head = bar.querySelector('.ab-bar-h');
      const hfs = tight ? Math.min(13, Math.max(10, bh * 0.25)) : Math.min(15.5, Math.max(10.5, bh * 0.15));
      bar.style.setProperty('--hfs', `${hfs.toFixed(1)}px`);
      const wordsBox = bar.querySelector('.ab-bar-w');
      const cellW = (tight ? wordsBox.clientWidth : bar.clientWidth) / SIZE - 6;
      // glosses wrap between words; the longest single word sets the size so none is split
      const gBase = tight ? 10 : Math.min(13, Math.max(10, bh * 0.13));
      const longest = Math.max(...g.words.flatMap((w) => shortEn(w, 22).split(/\s+/).map((x) => uiWidth(x, gBase))));
      const room = cellW - 4; // a little slack: canvas and layout widths differ slightly
      const gfs = longest > room ? Math.max(8.5, (gBase * room) / longest) : gBase;
      bar.style.setProperty('--gfs', `${gfs.toFixed(1)}px`);
      // long labels shrink to fit instead of being cut off
      if (head && head.scrollWidth > head.clientWidth + 1) {
        bar.style.setProperty('--hfs', `${Math.max(8, Math.floor((hfs * head.clientWidth) / head.scrollWidth))}px`);
      }
      const base = Math.round(Math.max(13, Math.min(21, tight ? bh * (showGl ? 0.36 : 0.5) : bh * 0.24)));
      bar.querySelectorAll('.ab-bw').forEach((b, k) => {
        b.style.setProperty('--bfs', `${fitPx(g.words[k].ar, base, cellW, 11)}px`);
      });
    }
    const scheduleFit = () => {
      if (!raf) raf = requestAnimationFrame(fitAll);
    };
    const ro = new ResizeObserver(scheduleFit);
    ro.observe(root);

    // ------------------------------------------------------------ rendering
    function makeTile(w) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ab-tile';
      el.dataset.id = String(w.id);
      el.setAttribute('aria-pressed', 'false');
      el.setAttribute('aria-label', w.ar);
      el.innerHTML = `<span class="ab-ar" lang="ar">${esc(w.ar)}</span><span class="ab-tr">${esc(w.tr || '')}</span><span class="ab-en">${esc(shortEn(w, 26))}</span>`;
      return el;
    }
    function makeBar(g) {
      const info = catInfo(g.cat);
      const t = TIERS[g.tier];
      const el = document.createElement('div');
      el.className = `ab-bar${g.revealed ? ' revealed' : ''}`;
      el.style.setProperty('--c', t.bg);
      el.style.setProperty('--ink', t.ink);
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', `${info.en}: ${g.words.map((w) => `${w.ar} ${shortEn(w, 30)}`).join(', ')}`);
      el.innerHTML = `
        <button class="ab-bar-h" data-say-all="1"><span class="ab-emo" aria-hidden="true">${info.emoji}</span><span>${esc(info.en)}</span>${info.ar ? `<span class="ab-arf" lang="ar">${esc(info.ar)}</span>` : ''}</button>
        <div class="ab-bar-w">${g.words
          .map((w) => `<button class="ab-bw" data-ar="${esc(w.ar)}" title="${esc(`${w.tr || ''} · ${shortEn(w, 40)}`)}"><span class="ab-arf" lang="ar">${esc(w.ar)}</span><span class="ab-gl">${esc(shortEn(w, 22))}</span></button>`)
          .join('')}</div>`;
      g.bar = el;
      return el;
    }
    function renderBoard() {
      const kids = [];
      for (const gi of s.solvedOrder) kids.push(s.groups[gi].bar);
      for (const id of s.order) kids.push(tiles.get(id));
      $grid.replaceChildren(...kids);
    }
    function renderIdle() {
      tiles.clear();
      const kids = [];
      for (let i = 0; i < 16; i++) {
        const el = document.createElement('div');
        el.className = 'ab-tile ghost';
        kids.push(el);
      }
      $grid.replaceChildren(...kids);
      syncDots();
      syncControls();
    }
    function syncSel() {
      if (!s) return;
      for (const [id, el] of tiles) {
        const on = s.selected.has(id);
        el.classList.toggle('sel', on);
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      syncControls();
    }
    function syncControls() {
      const live = !!s && phase === 'play';
      $submit.disabled = !live || s.selected.size !== SIZE;
      $deselect.disabled = !live || s.selected.size === 0;
      $shuffle.disabled = !live;
      $abc.setAttribute('aria-pressed', abcOn ? 'true' : 'false');
      root.classList.toggle('abc', abcOn);
    }
    let noneTimer = 0;
    function syncDots(animated = false) {
      const left = s ? MAX_MISTAKES - s.mistakes : MAX_MISTAKES;
      $dots.forEach((d, i) => d.classList.toggle('gone', i >= left));
      $dotsBox.classList.toggle('warn', left === 1);
      $mid.setAttribute('aria-label', left ? `${left} mistake${left === 1 ? '' : 's'} remaining` : 'No mistakes left');
      clearTimeout(noneTimer);
      const none = () => {
        $mid.classList.toggle('none', !left);
        $midL.textContent = left ? 'Mistakes remaining:' : 'No mistakes left';
      };
      // let the last dot pop before the row turns into "No mistakes left"
      if (!left && animated && !rm) noneTimer = setTimeout(none, 420);
      else none();
    }
    function syncHud() {
      if (!s) return;
      kit.hud.score(scoreNow());
    }
    function setPhase(p) {
      phase = p;
      root.dataset.phase = p;
      syncControls();
      if (p === 'play') runQueuedDebug();
    }
    function runQueuedDebug() {
      if (!debugQueue.length) return;
      later(() => {
        if (phase !== 'play' || paused) return;
        const fn = debugQueue.shift();
        fn?.();
      }, 40);
    }
    function toast(html, { ms = 1500, good = false } = {}) {
      $toast.innerHTML = html;
      $toast.classList.toggle('good', good);
      $toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => $toast.classList.remove('show'), ms);
    }
    const rects = () => new Map(s.order.map((id) => [id, tiles.get(id).getBoundingClientRect()]));
    function flipFrom(first, ms) {
      if (rm) return;
      for (const id of s.order) {
        const el = tiles.get(id);
        const a = first.get(id);
        if (!a) continue;
        const b = el.getBoundingClientRect();
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        animate(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: ms, easing: 'cubic-bezier(0.3, 0.75, 0.25, 1)' });
      }
    }
    // Particles (visual only, so Math.random is fine).
    function burst(x, y, n, spread, colors) {
      if (rm) return;
      const box = $fx.getBoundingClientRect();
      for (let i = 0; i < n; i++) {
        const p = document.createElement('i');
        p.style.background = colors[i % colors.length];
        $fx.append(p);
        const ang = Math.random() * Math.PI * 2;
        const v = spread * (0.45 + Math.random() * 0.75);
        const dx = Math.cos(ang) * v;
        const dy = Math.sin(ang) * v * 0.7 - spread * 0.35;
        const x0 = x - box.left;
        const y0 = y - box.top;
        const rot = (Math.random() - 0.5) * 720;
        const a = animate(
          p,
          [
            { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(1)`, opacity: 1 },
            { transform: `translate(${x0 + dx}px, ${y0 + dy}px) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${x0 + dx * 1.15}px, ${y0 + dy + spread * 0.9}px) rotate(${rot}deg) scale(0.6)`, opacity: 0 },
          ],
          { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
        );
        if (a) a.addEventListener('finish', () => p.remove());
        else p.remove();
      }
    }
    function clearPeeks() {
      peekTimers.forEach(clearTimeout);
      peekTimers.clear();
      for (const el of tiles.values()) el.classList.remove('peek');
    }
    function peek(ids, ms = 3400) {
      for (const id of ids) {
        const el = tiles.get(id);
        if (!el) continue;
        clearTimeout(peekTimers.get(id));
        el.classList.add('peek');
        peekTimers.set(
          id,
          setTimeout(() => {
            peekTimers.delete(id);
            el.classList.remove('peek');
          }, ms),
        );
      }
    }

    // ------------------------------------------------------------ daily progress
    function persist() {
      if (!s?.daily) return;
      saveProgress(s.day, {
        v: 1,
        sig: s.sig,
        claims: s.claims,
        mistakes: s.mistakes,
        guesses: s.guesses,
        keys: [...s.guessKeys],
        abc: !!s.abcUsed,
        order: s.order,
        ended: s.ended,
        won: s.won,
      });
    }
    /** Re-applies a saved daily: solved groups become bars again, mistakes and guesses carry over. */
    function restore(saved) {
      const n = s.groups.length;
      s.mistakes = Math.max(0, Math.min(MAX_MISTAKES, Math.floor(Number(saved.mistakes) || 0)));
      s.guesses = (Array.isArray(saved.guesses) ? saved.guesses : [])
        .filter((row) => Array.isArray(row) && row.length === SIZE && row.every((t) => Number.isInteger(t) && t >= 0 && t < TIERS.length))
        .slice(0, 16);
      s.guessKeys = new Set((Array.isArray(saved.keys) ? saved.keys : []).filter((k) => typeof k === 'string'));
      s.abcUsed = s.abcUsed || !!saved.abc;
      for (const gi of Array.isArray(saved.claims) ? saved.claims : []) {
        if (!Number.isInteger(gi) || gi < 0 || gi >= n || s.groups[gi].claimed) continue;
        const g = s.groups[gi];
        g.claimed = true;
        g.solved = true;
        s.claims.push(gi);
        s.solvedOrder.push(gi);
        makeBar(g);
      }
      const live = new Set(s.order.filter((id) => !s.groups[s.byId.get(id).g].claimed));
      const order = (Array.isArray(saved.order) ? saved.order : []).filter((id) => live.delete(id));
      s.order = [...order, ...live];
      s.resumed = true;
    }

    // ------------------------------------------------------------ player actions
    function toggle(id) {
      if (!s || phase !== 'play' || paused || !tiles.has(id)) return;
      const el = tiles.get(id);
      if (s.selected.has(id)) {
        s.selected.delete(id);
        kit.sfx.tick();
      } else if (s.selected.size >= SIZE) {
        kit.sfx.tick();
        if (!rm) animate(el, [{ transform: 'none' }, { transform: 'scale(0.94)' }, { transform: 'none' }], { duration: 160 });
        return;
      } else {
        s.selected.add(id);
        kit.sfx.tap();
        kit.haptic(8);
        if (!rm) animate(el, [{ transform: 'scale(0.9)' }, { transform: 'scale(1.06)', offset: 0.6 }, { transform: 'none' }], { duration: 190, easing: 'ease-out' });
      }
      syncSel();
    }
    function doShuffle() {
      if (!s || phase !== 'play' || paused) return;
      const first = rects();
      let next = shuffle(s.order, Math.random);
      if (next.length > 1 && next.every((id, i) => id === s.order[i])) next = [...next.slice(1), next[0]];
      s.order = next;
      renderBoard();
      flipFrom(first, 360);
      kit.sfx.swish();
      kit.haptic(6);
    }
    function deselectAll() {
      if (!s || phase !== 'play' || paused || !s.selected.size) return;
      s.selected.clear();
      kit.sfx.tick();
      syncSel();
    }
    function toggleAbc() {
      abcOn = !abcOn;
      if (s && abcOn && phase !== 'over' && !s.abcUsed) {
        s.abcUsed = true;
        persist();
      }
      kit.sfx.tap();
      syncControls();
      scheduleFit();
    }
    function select(ids) {
      s.selected = new Set(ids);
      syncSel();
    }
    function submit() {
      if (!s || phase !== 'play' || paused || s.selected.size !== SIZE) return;
      const ids = [...s.selected]; // selection order (drives the share row)
      const key = [...ids].sort((a, b) => a - b).join(',');
      if (s.guessKeys.has(key)) {
        toast('Already guessed!');
        kit.sfx.tick();
        kit.haptic(15);
        if (!rm) ids.forEach((id) => animate(tiles.get(id), [{ transform: 'none' }, { transform: 'scale(0.95)' }, { transform: 'none' }], { duration: 220 }));
        return;
      }
      s.guessKeys.add(key);
      const gs = ids.map((id) => s.byId.get(id).g);
      s.guesses.push(gs.map((g) => s.groups[g].tier));
      const counts = new Map();
      gs.forEach((g) => counts.set(g, (counts.get(g) ?? 0) + 1));
      const best = Math.max(...counts.values());
      // the outcome is recorded (and saved) now; the animations only show it
      if (best === SIZE) {
        const gi = gs[0];
        s.groups[gi].claimed = true;
        s.claims.push(gi);
        const left = s.groups.map((g, i) => i).filter((i) => !s.groups[i].claimed);
        let auto = null;
        if (left.length === 1) {
          // the last four are forced: they merge for the player
          auto = left[0];
          s.groups[auto].claimed = true;
          s.claims.push(auto);
          s.guesses.push(Array(SIZE).fill(s.groups[auto].tier));
        }
        persist();
        onCorrect(gi, auto);
      } else {
        s.mistakes++;
        persist();
        onWrong(ids, best === SIZE - 1);
      }
    }

    // ------------------------------------------------------------ sequences
    /**
     * Animates group gi out of the grid into a coloured bar. how: player | auto | reveal.
     * say: words to speak (default: the group's own; null = silent).
     */
    async function solve(gi, how, say) {
      const my = token;
      const g = s.groups[gi];
      setPhase('anim');
      const ids = s.order.filter((id) => g.ids.has(id));
      select(ids);
      if (!rm) {
        const stagger = how === 'reveal' ? 60 : 95;
        ids.forEach((id, k) =>
          animate(tiles.get(id), [{ transform: 'none' }, { transform: 'translateY(-16%) scale(1.04)', offset: 0.4 }, { transform: 'none' }], {
            duration: 300,
            delay: k * stagger,
            easing: 'ease-in-out',
          }),
        );
        await wait(300 + 3 * stagger + 40);
        if (my !== token) return false;
        // swap the group into the first open row, like Connections
        const first = rects();
        const order = [...s.order];
        const displaced = order.slice(0, SIZE).filter((id) => !g.ids.has(id));
        const vacated = order.map((id, i) => i).filter((i) => i >= SIZE && g.ids.has(order[i]));
        ids.forEach((id, k) => (order[k] = id));
        vacated.forEach((pos, k) => (order[pos] = displaced[k]));
        s.order = order;
        renderBoard();
        flipFrom(first, 340);
        await wait(370);
        if (my !== token) return false;
      }
      s.order = s.order.filter((id) => !g.ids.has(id));
      ids.forEach((id) => s.selected.delete(id));
      ids.forEach((id) => {
        clearTimeout(peekTimers.get(id));
        peekTimers.delete(id);
        tiles.get(id).classList.remove('peek');
      });
      if (how === 'reveal') g.revealed = true;
      else g.solved = true;
      s.solvedOrder.push(gi);
      makeBar(g);
      renderBoard();
      fitAll();
      syncSel();
      syncHud();
      if (!rm) animate(g.bar, [{ transform: 'scale(0.9)', opacity: 0.4 }, { transform: 'scale(1.035)', opacity: 1, offset: 0.6 }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
      if (how === 'reveal') {
        kit.sfx.pop();
      } else {
        const n = foundCount();
        kit.sfx.good();
        later(() => kit.sfx.combo(n * 3), 120);
        kit.haptic([18, 40, 18]);
        const words = say === undefined ? g.words.map((w) => w.ar) : say;
        if (words?.length) kit.speak(words.join('، '));
        const r = g.bar.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 16, Math.min(160, r.width * 0.45), [TIERS[g.tier].bg, '#ffffff', '#fde68a']);
      }
      await wait(rm ? 150 : how === 'reveal' ? 420 : 380);
      return my === token;
    }

    async function onCorrect(gi, auto) {
      const my = token;
      // when the last group merges by itself, both are spoken in one go (a second speak() would cut the first off)
      const say = auto == null ? undefined : [...s.groups[gi].words, ...s.groups[auto].words].map((w) => w.ar);
      if (!(await solve(gi, 'player', say))) return;
      if (auto != null) {
        await wait(rm ? 100 : 260);
        if (my !== token) return;
        if (!(await solve(auto, 'auto', null))) return;
      }
      if (!unsolved().length) return win();
      setPhase('play');
    }

    async function onWrong(ids, oneAway) {
      const my = token;
      setPhase('anim');
      const left = MAX_MISTAKES - s.mistakes;
      kit.sfx.bad();
      kit.haptic([45, 35, 45]);
      if (!rm) {
        ids.forEach((id) =>
          animate(
            tiles.get(id),
            [
              { transform: 'translateX(0)' },
              { transform: 'translateX(-7px)' },
              { transform: 'translateX(7px)' },
              { transform: 'translateX(-5px)' },
              { transform: 'translateX(5px)' },
              { transform: 'translateX(-2px)' },
              { transform: 'translateX(0)' },
            ],
            { duration: 420, easing: 'ease-in-out' },
          ),
        );
        const dot = $dots[left];
        if (dot) animate(dot, [{ transform: 'scale(1)' }, { transform: 'scale(1.5)', background: '#f87171', offset: 0.35 }, { transform: 'scale(0)' }], { duration: 380 });
      }
      syncDots(true);
      syncHud();
      toast(oneAway ? 'One away…' : left ? `Not a group · ${left} mistake${left === 1 ? '' : 's'} left` : 'Out of mistakes', { ms: oneAway ? 1700 : 1500 });
      // teach: flip the guessed tiles to their meanings — but not when one away,
      // where the odd word out would be plain to see
      if (!oneAway) later(() => my === token && peek(ids), rm ? 0 : 380);
      await wait(rm ? 200 : 470);
      if (my !== token) return;
      if (s.mistakes >= MAX_MISTAKES) return lose();
      setPhase('play');
    }

    async function lose() {
      const my = token;
      setPhase('anim');
      await wait(rm ? 700 : 1500);
      if (my !== token) return;
      clearPeeks();
      select([]);
      const rest = unsolved().sort((a, b) => s.groups[a].tier - s.groups[b].tier);
      kit.speak(rest.flatMap((gi) => s.groups[gi].words.map((w) => w.ar)).join('، '));
      for (const gi of rest) if (!(await solve(gi, 'reveal'))) return;
      await wait(rm ? 300 : 700);
      if (my !== token) return;
      finish(false);
    }

    async function win() {
      const my = token;
      setPhase('anim');
      const p = PRAISE[Math.min(s.mistakes, PRAISE.length - 1)];
      toast(`${esc(p.en)} <span class="ab-arf" lang="ar">${esc(p.ar)}</span>`, { ms: 1800, good: true });
      const r = $grid.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height * 0.35, 46, Math.min(220, r.width * 0.6), TIERS.map((t) => t.bg).concat('#ffffff'));
      kit.haptic([20, 50, 20, 50, 40]);
      await wait(rm ? 500 : 1300);
      if (my !== token) return;
      finish(true);
    }

    function detailHTML(stats) {
      const rows = s.guesses
        .map((row) => `<div style="line-height:1.12;letter-spacing:2px;white-space:nowrap">${row.map((t) => TIERS[t].sq).join('')}</div>`)
        .join('');
      const arStyle = `font-family:${esc(AR_FONT)};direction:rtl;unicode-bidi:isolate;text-transform:none;letter-spacing:0;font-weight:700`;
      const groups = [...s.groups]
        .sort((a, b) => a.tier - b.tier)
        .map((g) => {
          const t = TIERS[g.tier];
          const info = catInfo(g.cat);
          // role=button spans (not <button>) so the shell's focus lands on Share
          const words = g.words
            .map(
              (w) =>
                `<span role="button" tabindex="0" data-say="${esc(w.ar)}" aria-label="${esc(`${w.ar} ${w.tr || ''} ${shortEn(w, 40)}`)}" style="display:inline-flex;align-items:baseline;gap:5px;max-width:100%;box-sizing:border-box;background:rgba(255,255,255,0.45);border-radius:7px;padding:0 7px 1px;cursor:pointer">` +
                `<span lang="ar" style="${arStyle};font-size:1.08rem;line-height:1.4;white-space:nowrap">${esc(w.ar)}</span>` +
                `<span style="font-size:0.74rem;line-height:1.2;min-width:0;overflow-wrap:anywhere">${w.tr ? `<i style="opacity:0.78">${esc(w.tr)}</i> ` : ''}<b style="font-weight:700">${esc(shortEn(w, 30))}</b></span></span>`,
            )
            .join('');
          return `<div style="background:${t.bg};color:${t.ink};border-radius:11px;padding:4px 6px 6px;margin-top:6px">
              <div style="display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;column-gap:8px;font-weight:800;font-size:0.74rem;letter-spacing:0.04em;text-transform:uppercase;padding:0 3px">
                <span style="white-space:nowrap">${info.emoji} ${esc(info.en)} ${g.solved ? '✓' : '<span style="text-transform:none;letter-spacing:0;font-weight:600;opacity:0.8">· missed</span>'}</span>
                ${info.ar ? `<span lang="ar" style="${arStyle};font-size:0.98rem;white-space:nowrap">${esc(info.ar)}</span>` : ''}
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">${words}</div>
            </div>`;
        })
        .join('');
      const statRow = stats
        ? `<div style="display:flex;justify-content:center;gap:16px;margin-top:10px;font-size:0.72rem;color:#64748b;line-height:1.1">
            ${[
              [stats.played, 'Played'],
              [`${stats.played ? Math.round((100 * stats.wins) / stats.played) : 0}%`, 'Won'],
              [`🔥${stats.streak}`, 'Streak'],
              [stats.perfect, 'Perfect'],
            ]
              .map(([v, l]) => `<div><div style="font-size:1.12rem;font-weight:800;color:#0f172a">${esc(v)}</div>${l}</div>`)
              .join('')}
          </div>`
        : '';
      const p = s.won ? PRAISE[Math.min(s.mistakes, PRAISE.length - 1)] : LOST;
      // Share and the next step sit right under the grid (the shell's own copies are further down)
      const btn = 'flex:1 1 0;min-width:0;margin:0;padding:12px 8px;white-space:nowrap';
      return `<div style="margin-top:10px;text-align:center">
          <div style="display:flex;align-items:center;justify-content:center;gap:14px">
            <div lang="ar" style="${arStyle};font-size:1.55rem;color:#4c1d95">${esc(p.ar)}</div>
            <div style="font-size:1.02rem">${rows}</div>
          </div>
          <div style="font-size:0.82rem;color:#475569;margin-top:4px"><strong>${foundCount()}/4</strong> groups · <strong>${s.mistakes}</strong> mistake${s.mistakes === 1 ? '' : 's'}${s.abcUsed ? ' · 🔤 abc used' : ''}${s.daily ? ' · new puzzle tomorrow' : ''}</div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn primary" data-act="share" style="${btn}">📤 Share</button>
            <button class="btn" data-act="${s.daily ? 'menu' : 'again'}" style="${btn}">${s.daily ? '♾️ Practice' : '↻ Next puzzle'}</button>
          </div>
          ${statRow}
          <div style="text-align:left;margin-top:4px">${groups}</div>
          <div style="font-size:0.75rem;color:#64748b;margin-top:6px">Tap a word to hear it.</div>
        </div>`;
    }

    function finish(won) {
      if (!s || s.ended) return;
      if (paused) {
        pendingEnd = won;
        return;
      }
      s.ended = true;
      s.won = won;
      debugQueue.length = 0;
      setPhase('over');
      persist();
      const found = foundCount();
      const score = scoreNow();
      const p = won ? PRAISE[Math.min(s.mistakes, PRAISE.length - 1)] : LOST;
      const grid = s.guesses.map((row) => row.map((t) => TIERS[t].sq).join('')).join('\n');
      const head = s.daily ? `Arba3a #${s.day}` : 'Arba3a practice';
      const shareText = `${head}\n${grid}\n🇱🇾 Sort 16 Libyan Arabic words into 4 groups`;
      const stats = s.daily ? recordDaily(s.day, won, s.mistakes) : null;
      kit.end({
        score,
        correct: found * SIZE,
        total: SIZE * SIZE,
        won,
        missed: s.groups.filter((g) => !g.solved).flatMap((g) => g.words),
        title: s.daily ? `Arba3a #${s.day} · ${p.en}` : `${p.en} · ${found}/4 groups`,
        detail: detailHTML(stats),
        shareText,
        meta: {
          cats: s.groups.map((g) => g.cat),
          ids: s.groups.map((g) => g.words.map((w) => w.id)),
          found,
          mistakes: s.mistakes,
          guesses: s.guesses.length,
          abc: !!s.abcUsed,
          resumed: !!s.resumed,
        },
      });
    }

    // ------------------------------------------------------------ input
    const onClick = (e) => {
      const t = e.target;
      if (!(t instanceof Element) || paused) return;
      const tile = t.closest('.ab-tile');
      if (tile && !tile.classList.contains('ghost')) return toggle(Number(tile.dataset.id));
      const bw = t.closest('.ab-bw');
      if (bw) {
        kit.speak(bw.dataset.ar);
        kit.sfx.tap();
        if (!rm) animate(bw, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 220 });
        return;
      }
      const head = t.closest('.ab-bar-h');
      if (head) {
        const bar = head.closest('.ab-bar');
        const g = s?.groups.find((x) => x.bar === bar);
        if (g) kit.speak(g.words.map((w) => w.ar).join('، '));
        return;
      }
      const act = t.closest('[data-ab]')?.dataset.ab;
      if (act === 'abc') return toggleAbc();
      if (act === 'shuffle') return doShuffle();
      if (act === 'deselect') return deselectAll();
      if (act === 'submit') return submit();
    };
    const onKey = (e) => {
      if (!s || phase !== 'play' || paused || !kit.playing || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Enter') {
        // Enter submits — also from a tile that a mouse click focused (it would
        // otherwise toggle itself off); Shuffle/Deselect/abc keep their own Enter
        if (s.selected.size === SIZE && !t?.closest('.ab-btn:not(.go), .ab-abc, .ab-bar')) {
          e.preventDefault();
          submit();
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deselectAll();
      }
    };
    const noop = () => {};
    root.addEventListener('click', onClick);
    root.addEventListener('touchstart', noop, { passive: true }); // enables :active on iOS
    document.addEventListener('keydown', onKey);

    // ------------------------------------------------------------ debug hooks
    const whenReady = (fn) => () => {
      if (!s || phase === 'idle' || phase === 'over' || paused) return;
      if (phase === 'anim') {
        if (debugQueue.length < 4) debugQueue.push(fn);
        return;
      }
      fn();
    };
    kit.debug({
      info: () =>
        s && {
          phase,
          paused,
          daily: s.daily,
          day: s.day,
          resumed: !!s.resumed,
          mistakes: s.mistakes,
          mistakesLeft: MAX_MISTAKES - s.mistakes,
          found: foundCount(),
          score: scoreNow(),
          selected: [...s.selected],
          order: [...s.order],
          guesses: s.guesses.length,
          abc: abcOn,
          groups: s.groups.map((g) => ({
            cat: g.cat,
            tier: TIERS[g.tier].key,
            ids: g.words.map((w) => w.id),
            words: g.words.map((w) => w.ar),
            solved: g.solved,
            revealed: g.revealed,
          })),
        },
      answer: whenReady(() => {
        const gi = unsolved().sort((a, b) => s.groups[a].tier - s.groups[b].tier)[0];
        if (gi == null) return;
        select(s.order.filter((id) => s.groups[gi].ids.has(id)));
        submit();
      }),
      wrong: whenReady(() => {
        const un = unsolved();
        for (const a of un)
          for (const b of un) {
            if (a === b) continue;
            const A = s.order.filter((id) => s.groups[a].ids.has(id));
            const B = s.order.filter((id) => s.groups[b].ids.has(id));
            for (let skip = 0; skip < SIZE; skip++)
              for (const extra of B) {
                const pickIds = [...A.filter((_, i) => i !== skip), extra];
                if (s.guessKeys.has([...pickIds].sort((x, y) => x - y).join(','))) continue;
                select(pickIds);
                submit();
                return;
              }
          }
      }),
    });

    // ------------------------------------------------------------ lifecycle
    function reset() {
      token++;
      timers.forEach(clearTimeout);
      timers.clear();
      anims.forEach((a) => {
        try {
          a.cancel();
        } catch {
          /* ignore */
        }
      });
      anims.clear();
      clearTimeout(toastTimer);
      clearTimeout(noneTimer);
      $toast.classList.remove('show');
      clearPeeks();
      debugQueue.length = 0;
      pendingEnd = null;
      paused = false;
      root.inert = false;
      $fx.replaceChildren();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    renderIdle();
    fitAll();

    return {
      start(opts) {
        reset();
        fallback ??= [...kit.words].filter(suitable).sort((a, b) => a.rank - b.rank).slice(0, 1000);
        const daily = !!opts.daily;
        const groups = buildPuzzle(opts.pool ?? [], opts.rng ?? Math.random, fallback, { deck: kit.words, recent: daily ? null : recentSteer() });
        if (!groups) throw new Error('Not enough words to build a puzzle');
        if (!daily) rememberPractice(groups);
        const byId = new Map();
        groups.forEach((g, gi) => {
          g.ids = new Set(g.words.map((w) => w.id));
          g.solved = false;
          g.revealed = false;
          g.claimed = false;
          g.bar = null;
          g.words.forEach((w) => byId.set(w.id, { w, g: gi }));
        });
        s = {
          daily,
          day: opts.day,
          groups,
          byId,
          sig: groups.map((g) => g.words.map((w) => w.id).join(',')).join('|'),
          order: shuffle(groups.flatMap((g) => g.words.map((w) => w.id)), opts.rng ?? Math.random),
          solvedOrder: [],
          claims: [],
          selected: new Set(),
          mistakes: 0,
          guesses: [],
          guessKeys: new Set(),
          abcUsed: abcOn,
          ended: false,
          won: false,
          resumed: false,
        };
        if (daily) {
          const saved = loadProgress(s.day);
          if (saved && saved.sig === s.sig) restore(saved);
          persist();
        }
        tiles.clear();
        for (const { w } of byId.values()) tiles.set(w.id, makeTile(w));
        $abc.hidden = ![...byId.values()].some(({ w }) => w.tr);
        renderBoard();
        syncDots();
        kit.hud.extra(daily ? `#${s.day}` : '');
        syncHud();
        setPhase('play');
        fitAll();
        const my = token;
        fontsReady().then(() => my === token && scheduleFit());
        if (!rm) {
          s.order.forEach((id, i) =>
            animate(tiles.get(id), [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1.04)', offset: 0.7 }, { opacity: 1, transform: 'none' }], {
              duration: 300,
              delay: 40 + i * 24,
              easing: 'ease-out',
              fill: 'backwards',
            }),
          );
        }
        if (s.resumed) {
          // a daily left part-way carries on where it was; a finished one ends again
          if (!unsolved().length) win();
          else if (s.mistakes >= MAX_MISTAKES) lose();
          else {
            const left = MAX_MISTAKES - s.mistakes;
            toast(`Daily #${esc(s.day)} resumed · ${left} mistake${left === 1 ? '' : 's'} left`, { ms: 2200 });
          }
        }
      },
      stop() {
        reset();
        s = null;
        phase = 'idle';
        kit.hud.extra('');
        renderIdle();
      },
      pause() {
        // turn-based: short animation sequences may finish, but input is frozen
        // and a round that ends meanwhile reports once play resumes
        paused = true;
        root.inert = true;
      },
      resume() {
        paused = false;
        root.inert = false;
        if (pendingEnd != null) {
          const won = pendingEnd;
          pendingEnd = null;
          finish(won);
        } else if (phase === 'play') runQueuedDebug();
      },
      destroy() {
        reset();
        s = null;
        phase = 'idle';
        ro.disconnect();
        root.removeEventListener('click', onClick);
        root.removeEventListener('touchstart', noop);
        document.removeEventListener('keydown', onKey);
        tiles.clear();
        root.remove();
        style.remove();
      },
    };
  },
};
