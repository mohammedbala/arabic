// Souq Rush — Subway Surfers with Libyan Arabic words.
// Dubbi sprints down a lantern-lit Libyan souq at dusk. Every few seconds a
// stone gate with three arches comes at him, each arch signed with an Arabic
// word; the banner at the top shows the English meaning of the one to run
// through. Swipe / tap a side / arrow keys to switch between the three lanes,
// jump crates (swipe down to drop early), dodge carts and camels, grab coins
// and the odd 🧲 magnet. Distractors are never synonyms of the prompt. A wrong
// arch costs a heart, reveals the right word (spoken aloud) and brings it back
// two gates later.
// Contract: see ./README.md.
import { setupCanvas, createLoop, fontsReady, dubbiImage, AR_FONT, UI_FONT, clamp, lerp, shortLabel, mulberry32, shuffle, roundRect } from './common.js';

const MAX_LIVES = 3;
const TAU = Math.PI * 2;
// ---- pseudo-3D camera (world units: 1 = one lane width; z = distance ahead)
const F = 6; // focal length: scale s(z) = F / (F + z)
const S_MIN = 0.27; // scale at the far fog line where things appear
const Z_FAR = F * (1 / S_MIN - 1); // ≈ 16.2 units
const Z_GONE = -2.4; // passed things are dropped here
const ROAD = 1.62; // road half width
const WALL_X = 2.3; // souq walls either side
const WALL_H = 2.7;
const ARCH_P = 3.3; // arcade period along the walls
const BAND = 1.6; // ground stripe length
const V0 = Z_FAR / 4.1; // start speed: a gate takes ~4 s from the fog to Dubbi
const LANE_DUR = 0.12; // lane change animation (s)
const BANK_KEY = 'arcade-rush-coins';
const MAGNET_DUR = 7; // s of coin pull after a 🧲 pickup
const MAGNET_Z = 4.5; // coins nearer than this are pulled in
const JUMP_DUR = 0.66;
const JUMP_H = 0.78;
const DUBBI_H = 0.78; // Dubbi's height in lane units
const BANNER_H = 66;
const REVEAL_H = 58;
const TALL_H = 0.74; // plaque height (lane units) for gates with a two-line label
const SIGN_TOP = 2.4; // top of the centre sign above the road (lane units), tall plaques included
const MOODS = ['happy', 'cheer', 'sad', 'wow'];

// ---- palette (dusk souq)
const FOG = [236, 132, 96];
const ROAD_A = [184, 124, 82];
const ROAD_B = [170, 112, 73];
const WALK_A = [126, 80, 60];
const WALK_B = [112, 70, 53];
const WALL_C = [199, 142, 100];
const WALL_D = [150, 96, 68];
const WALL_T = [222, 172, 122];
const SAND = [233, 190, 132];
const SAND_D = [140, 86, 52];
const AWNINGS = [
  ['#d6336c', '#fff0e0'],
  ['#2f9e44', '#fff4d6'],
  ['#1c7ed6', '#fff4d6'],
  ['#e8590c', '#fff1d0'],
  ['#7048e8', '#fdf0ff'],
];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mix = (a, b, t) => `rgb(${(a[0] + (b[0] - a[0]) * t) | 0},${(a[1] + (b[1] - a[1]) * t) | 0},${(a[2] + (b[2] - a[2]) * t) | 0})`;
const sOf = (z) => F / (F + z);
/** 0 near … 1 at the fog line. */
const fogK = (z) => clamp((z - Z_FAR * 0.42) / (Z_FAR * 0.58), 0, 1);
const hash2 = (k, side) => {
  let h = Math.imul(k | 0, 0x9e3779b1) ^ (side > 0 ? 0x85ebca6b : 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f);
  return (h ^ (h >>> 13)) >>> 0;
};
const multFor = (streak) => (streak >= 10 ? 5 : streak >= 7 ? 4 : streak >= 4 ? 3 : streak >= 2 ? 2 : 1);

// Category glyphs beside the prompt. They show the category idea, never one
// member of it (no camel for every animal), so the picture cannot point at a
// wrong arch.
const CAT_EMOJI = {
  pronouns: '👤', questions: '❓', prepositions: '📍', conjunctions: '🔗', adverbs: '🔸', time: '⏳', numbers: '🔢',
  'verbs-core': '✳️', 'verbs-motion': '🧭', 'verbs-communication': '💬', 'verbs-daily': '📅', 'verbs-mind': '🧠',
  'verbs-work': '🛠️', greetings: '👋', social: '🤝', adjectives: '✨', emotions: '🎭', people: '🧑', family: '👨‍👩‍👧',
  body: '🧍', health: '🩺', clothing: '🧵', home: '🏠', food: '🍽️', drink: '🥤', kitchen: '🧑‍🍳', shopping: '🛍️',
  colors: '🎨', city: '🏙️', travel: '🌍', nature: '🏞️', animals: '🐾', work: '💼', school: '🏫', tech: '🌐',
  culture: '🏺', tools: '🧰', cars: '🏁', admin: '🏛️', agriculture: '🧑‍🌾', media: '📣', sports: '🤸', abstract: '💭',
  religion: '☪️', measures: '📏',
};

// ------------------------------------------------------------------ words
// "Same meaning" test for distractors: a learner must never lose a heart for
// picking a real synonym of the prompt. Each English sense is normalised
// (parentheses, punctuation, leading to/a/the, "be/get + adjective"), crudely
// stemmed, mapped through a synonym table, and compared as whole-word phrases.
// Erring on the side of "same meaning" only makes a gate a little easier.
const SYN_GROUPS = [
  'mother|mum|mom|mummy|mommy|mama', 'father|dad|daddy|papa', 'grandmother|granny|grandma|nan|nana', 'grandfather|grandpa|granddad|grandad',
  'parent|parents', 'baby|infant|newborn', 'child|kid|children|kids|little one', 'friend|companion|buddy|pal|mate', 'person|human|human being|individual',
  'stranger|foreigner', 'enemy|opponent|adversary|rival|foe', 'husband|spouse', 'wife|spouse',
  'hi|hello|hey|hey there|hello there|welcome|greetings|howdy', 'bye|goodbye|good bye|farewell|see you', 'thank you|thanks|thank|cheers|grateful',
  'please|i beg you', 'sorry|excuse me|pardon', 'wow|amazing|how wonderful',
  'maybe|perhaps|possibly|probably|hopefully|might', 'now|right now|immediately|right away|at once|straight away|currently|at the moment',
  'always|all the time|forever|constantly', 'sometimes|at times|occasionally', 'usually|normally|generally', 'never|not at all|at all',
  'really|truly|seriously|honestly|frankly|indeed|for real|actually', 'definitely|certainly|of course|surely|sure|certain|for sure|absolutely',
  'completely|totally|entirely|fully|whole|entire', 'approximately|almost|about|around|nearly|roughly', 'exactly|precisely',
  'later|afterwards|after that', 'long ago|in the past|old times|formerly|back then', 'soon|shortly', 'together|all together',
  'good|fine|ok|okay|alright|all right|well', 'good|great|awesome|excellent|perfect|wonderful|fantastic|terrific|super|brilliant',
  'big|large|huge|enormous|giant', 'small|little|tiny', 'a lot|lots|many|much|plenty|loads|very', 'beautiful|pretty|lovely|gorgeous|handsome|cute',
  'ugly|hideous', 'easy|simple', 'difficult|hard|tough', 'quick|fast|quickly|rapid|rapidly|speedy', 'slow|slowly', 'quiet|calm|silent|peaceful',
  'strange|weird|odd|bizarre', 'clever|smart|intelligent|bright|skilled', 'correct|right|true|accurate', 'wrong|mistaken|incorrect',
  'necessary|essential|needed|required|must|necessarily|need', 'important|significant', 'famous|well known', 'rich|wealthy', 'tired|exhausted|worn out|weary|fatigue|tiredness',
  'happy|glad|pleased|content|cheerful|joyful|delighted|satisfied|in a good mood', 'sad|unhappy|sorrowful|heartbroken|grieved|upset', 'angry|upset|mad|cross|furious|annoyed',
  'annoy|irritate|bother|disturb|pester|irritated|bothered|disturbed|annoyed|upset|fed up', 'afraid|scared|frightened|fear|scare|frighten|terrified|startled|fright',
  'worried|anxious|nervous|stressed|tense|worry', 'surprised|astonished|amazed|shocked', 'excited|eager|enthusiastic', 'shy|embarrassed|ashamed',
  'finish|end|be done|done|be over|finished|ending', 'continue|keep doing|carry on|keep on', 'begin|start|commence|beginning',
  'return|come back|go back|get back|give back|put back', 'enter|go in|come in|get in|go inside', 'leave|go out|exit|depart|get out|go away',
  'come|arrive', 'look|see|watch|look at', 'speak|talk|chat|converse', 'say|tell|inform|let know|notify', 'call|phone|ring|telephone',
  'answer|reply|respond|response', 'allow|permit|let', 'forbid|ban|prohibit|forbidden|banned|prohibited|not allowed', 'buy|purchase',
  'shop|store|market|grocery', 'win|beat|defeat', 'learn|study', 'wash|clean|bathe|shower|rinse', 'remove|take off|take out', 'give|hand over|hand',
  'grab|catch|seize|snatch', 'carry|take|pick up', 'put|place|set', 'meet|encounter|run into|meet up', 'fight|quarrel|argue',
  'cry|weep', 'shout|yell|scream|call out', 'choose|pick|select', 'run|jog|sprint', 'jump|leap|hop', 'fall|drop|tumble', 'throw|toss|fling',
  'hit|strike|punch', 'cut|chop|slice', 'stop|quit|halt|cease', 'fix|repair|mend|sort out', 'search|look for|seek', 'hurry|rush|hasten|hurry up',
  'want|wish|desire', 'hope|wish', 'love|adore', 'like|enjoy|enjoy oneself', 'think|believe|suppose|reckon', 'remember|recall', 'understand|comprehend|grasp', 'sleep|nap|doze|lie down',
  'wake up|get up|awaken', 'stay|remain', 'marriage|wedding|married|marry|get married', 'house|home', 'car|vehicle|automobile',
  'road|street|avenue|alley|lane|route', 'neighborhood|neighbourhood|quarter|area|district|zone|region', 'money|cash', 'price|cost',
  'picture|photo|image|photograph', 'gift|present', 'medicine|medication|pill|tablet|drug', 'pain|ache|hurt', 'problem|trouble|issue',
  'mistake|error|fault', 'story|tale', 'idea|thought', 'job|work|employment|occupation', 'boss|manager|director|chief|head|leader',
  'employee|worker|labourer|laborer|staff', 'teacher|instructor|tutor', 'film|movie', 'trip|journey|travel|voyage', 'place|spot|location',
  'luck|chance|fortune|fate|destiny|opportunity', 'period|duration|length of time', 'soup|broth|stew', 'beach|seashore|shore|coast',
  'wind|breeze', 'oven|stove|cooker', 'table|desk', 'chair|seat', 'internet|wifi|net|online', 'food|meal', 'country|nation|homeland|state',
];
const STEM_KEEP = new Set(['news', 'yes', 'gas', 'its', 'bus', 'always']);
/** Crude English stemmer: plural/-ed/-ing/-ly endings, doubled consonants, final e. */
function stem(t) {
  if (t.length <= 3 || t[0] === '#' || STEM_KEEP.has(t)) return t;
  let s = t;
  if (s.endsWith('ies') && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (/(ches|shes|sses|xes|zes)$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith('ied') && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith('ed') && s.length > 4) s = s.slice(0, -2);
  else if (s.endsWith('ing') && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith('ly') && s.length > 5) s = s.slice(0, -2).replace(/i$/, 'y');
  if (/([b-df-hj-np-tv-z])\1$/.test(s) && !/(ll|ss|zz|ff)$/.test(s)) s = s.slice(0, -1);
  return s.length > 3 ? s.replace(/e$/, '') : s;
}
/** One sense → plain lower-case words: no parentheses, punctuation, hyphens or leading to/a/the/oh. */
const cleanSense = (x) =>
  ` ${x.toLowerCase().replace(/\bwi-fi\b/g, 'wifi').replace(/-/g, ' ').replace(/[^a-z0-9' ]+/g, ' ').replace(/'/g, '')} `
    .replace(/\s+/g, ' ')
    .replace(/^ (oh|ah) /, ' ')
    .replace(/^ (to|a|an|the) /, ' ')
    .trim();
// Synonym table → word stem / phrase → the ids of every group it is in.
const SYN = (() => {
  const words = new Map();
  const phr = new Map();
  SYN_GROUPS.forEach((g, i) =>
    g.split('|').forEach((p) => {
      const c = cleanSense(p);
      const [m, key] = c.includes(' ') ? [phr, ` ${c} `] : [words, stem(c)];
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(`#${i}`);
    }),
  );
  const phrases = [...phr].map(([p, ids]) => [p, ` ${ids.join('/')} `]).sort((a, b) => b[0].length - a[0].length);
  return { words, phrases };
})();
const LINKED = /^(be|get|become) (?!(up|in|on|off|out|down|back|away|along|around|over|through|into|together|going|rid|by|home|to|inside|outside)\b)/;
/** A cleaned sense as canonical token strings (one per reading when a word is in several groups). */
function canonSense(c) {
  let v = ` ${c} `;
  for (const [p, ids] of SYN.phrases) if (v.includes(p)) v = v.split(p).join(ids);
  let outs = [''];
  for (const t of v.trim().split(' ')) {
    const opts = t[0] === '#' ? t.split('/') : SYN.words.get(stem(t)) ?? [stem(t)];
    outs = outs.flatMap((o) => opts.map((x) => (o ? `${o} ${x}` : x))).slice(0, 8);
  }
  return outs;
}
const senseCache = new Map();
/** All English senses of a word in canonical form (cached). */
function senses(w) {
  let r = senseCache.get(w.en);
  if (!r) {
    const out = new Set();
    for (const part of String(w.en).replace(/\([^)]*\)/g, ' ').split(/[;,/]/)) {
      const c = cleanSense(part);
      if (!c) continue;
      for (const k of canonSense(c)) out.add(k);
      const bare = c.replace(LINKED, '').replace(/^to /, ''); // "be finished" → "finished"
      if (bare && bare !== c) for (const k of canonSense(bare)) out.add(k);
    }
    r = [...out];
    senseCache.set(w.en, r);
  }
  return r;
}
const nearSense = (a, b) => a === b || b.startsWith(`${a} `) || b.endsWith(` ${a}`) || a.startsWith(`${b} `) || a.endsWith(` ${b}`);
/** True if two words share (or nearly share) an English sense: picking one for the other would be unfair. */
const clash = (a, b) => {
  const sa = senses(a);
  return senses(b).some((x) => sa.some((y) => nearSense(x, y)));
};
const ABBR = { 'm.': 'masculine', 'f.': 'feminine', 'fem.': 'feminine', 'masc.': 'masculine', 'sg.': 'singular', 'pl.': 'plural' };
/** Small disambiguating line under the prompt: "(m. sg.)" notes (spelled out) and other senses. */
function promptHint(w, main) {
  const parts = String(w.en)
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
  const paren = (parts[0]?.match(/\(([^)]*)\)/) ?? [])[1]?.replace(/\b(masc|fem|m|f|sg|pl)\./g, (m) => ABBR[m] ?? m);
  const others = parts
    .slice(1)
    .map((p) => p.replace(/\s*\([^)]*\)/g, '').trim())
    .filter((p) => p && p.toLowerCase() !== main.toLowerCase());
  const bits = [];
  if (paren) bits.push(paren);
  if (others.length) bits.push(`also “${others.slice(0, 2).join('”, “')}”`);
  return bits.join(' · ');
}

// ------------------------------------------------------------------ geometry
// The gate: one sandstone facade across the road with a taller central arch.
// World coords in lane units, x across (lanes at -1, 0, 1), y up from the road.
const GATE = {
  half: 1.62,
  sideTop: 2.02,
  midHalf: 0.52,
  midTop: 2.56,
  op: [
    { cx: -1, w: 0.72, spring: 0.86, rise: 0.38 },
    { cx: 0, w: 0.78, spring: 1.0, rise: 0.44 },
    { cx: 1, w: 0.72, spring: 0.86, rise: 0.38 },
  ],
  plq: [
    { cx: -1, cy: 1.58, w: 0.98, h: 0.52 },
    { cx: 0, cy: 2.0, w: 0.98, h: 0.52 },
    { cx: 1, cy: 1.58, w: 0.98, h: 0.52 },
  ],
};
const OBS = {
  crate: { w: 0.66, h: 0.5, d: 0.62, jump: true },
  cart: { w: 0.8, h: 1.25, d: 1.0, jump: false },
  camel: { w: 0.9, h: 1.05, d: 0.7, jump: false },
};

/** Pointed (Moorish) arch outline from (x0,0) up and over to (x1,0), as points. */
function archPts(x0, x1, spring, rise, n = 6) {
  const w = x1 - x0;
  const R = 0.62 * w;
  const cosM = (R - w / 2) / R;
  const thM = Math.acos(cosM);
  const sinM = Math.sin(thM);
  const pts = [
    [x0, 0],
    [x0, spring],
  ];
  for (let i = 1; i <= n; i++) {
    const th = (thM * i) / n;
    pts.push([x0 + R - R * Math.cos(th), spring + (rise * Math.sin(th)) / sinM]);
  }
  for (let i = n - 1; i >= 0; i--) {
    const th = (thM * i) / n;
    pts.push([x1 - R + R * Math.cos(th), spring + (rise * Math.sin(th)) / sinM]);
  }
  pts.push([x1, 0]);
  return pts;
}
const ARCH_OPEN = GATE.op.map((o) => archPts(o.cx - o.w / 2, o.cx + o.w / 2, o.spring, o.rise));
const SHOP_ARCH = archPts(0, 1, 1.32, 0.5, 5); // unit-span template for wall shops (x = fraction along z)

// ------------------------------------------------------------------ sprites
function makeCanvas(w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  return [c, g];
}

function buildSprites(dpr) {
  const sp = {};
  // warm glow (lanterns, light pools, gate flashes)
  {
    const [c, g] = makeCanvas(64, 64, 1);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,214,140,0.95)');
    gr.addColorStop(0.3, 'rgba(255,170,90,0.45)');
    gr.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    sp.glow = c;
  }
  {
    const [c, g] = makeCanvas(64, 64, 1);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    sp.white = c;
  }
  // gold coin (face-on; squashed horizontally to spin)
  {
    const R = 30;
    const [c, g] = makeCanvas(64, 64, dpr);
    const gr = g.createRadialGradient(26, 24, 2, 32, 32, R);
    gr.addColorStop(0, '#fff3bf');
    gr.addColorStop(0.45, '#ffd43b');
    gr.addColorStop(1, '#e67700');
    g.fillStyle = '#9c4a00';
    g.beginPath();
    g.arc(32, 33, R, 0, TAU);
    g.fill();
    g.fillStyle = gr;
    g.beginPath();
    g.arc(32, 32, R - 2, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(156,74,0,0.55)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(32, 32, R - 8, 0, TAU);
    g.stroke();
    // embossed crescent & star
    g.fillStyle = 'rgba(176,90,0,0.6)';
    g.beginPath();
    g.arc(29, 32, 10, 0, TAU);
    g.fill();
    g.fillStyle = '#ffd43b';
    g.beginPath();
    g.arc(32.5, 31, 8.4, 0, TAU);
    g.fill();
    star(g, 40, 31, 4.2, 'rgba(176,90,0,0.7)');
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(22, 18, 6, 3, -0.6, 0, TAU);
    g.fill();
    sp.coin = c;
  }
  // heart pickup
  {
    const [c, g] = makeCanvas(64, 64, dpr);
    g.font = '50px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('❤️', 32, 35);
    sp.heart = c;
  }
  // magnet pickup
  {
    const [c, g] = makeCanvas(64, 64, dpr);
    g.font = '48px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🧲', 32, 35);
    sp.magnet = c;
  }
  // camel emoji
  {
    const [c, g] = makeCanvas(128, 128, dpr);
    g.font = '104px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🐪', 64, 70);
    sp.camel = c;
  }
  return sp;
}

function star(g, x, y, r, col) {
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** Dusk sky with crescent moon, stars and a Tripoli medina skyline at the fog line. */
function buildSky(W, horizon, unit, dpr, pad, moonY) {
  const w = W + pad * 2;
  const h = Math.ceil(horizon + 6);
  const [c, g] = makeCanvas(w, h, dpr);
  const gr = g.createLinearGradient(0, 0, 0, horizon);
  gr.addColorStop(0, '#120a2b');
  gr.addColorStop(0.35, '#2b1450');
  gr.addColorStop(0.68, '#742b63');
  gr.addColorStop(0.9, '#d1544f');
  gr.addColorStop(1, '#ff9a5c');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const rnd = mulberry32(20261023);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w;
    const y = rnd() * horizon * 0.6;
    g.fillStyle = `rgba(255,240,220,${0.25 + rnd() * 0.6})`;
    g.beginPath();
    g.arc(x, y, 0.4 + rnd() * 1.1, 0, TAU);
    g.fill();
  }
  // crescent + star (as on the Libyan flag)
  const mr = clamp(unit * 0.42, 9, 18);
  const mx = w * 0.76;
  const my = Math.max(mr * 2, moonY ?? horizon * 0.24);
  {
    const [mc, mg] = makeCanvas(mr * 4, mr * 4, dpr);
    mg.fillStyle = '#fff1c4';
    mg.shadowColor = 'rgba(255,230,170,0.8)';
    mg.shadowBlur = mr * 0.8;
    mg.beginPath();
    mg.arc(mr * 2, mr * 2, mr, 0, TAU);
    mg.fill();
    mg.shadowBlur = 0;
    mg.globalCompositeOperation = 'destination-out';
    mg.beginPath();
    mg.arc(mr * 2 + mr * 0.42, mr * 2 - mr * 0.08, mr * 0.84, 0, TAU);
    mg.fill();
    g.drawImage(mc, mx - mr * 2, my - mr * 2, mr * 4, mr * 4);
    star(g, mx + mr * 0.55, my - mr * 0.02, mr * 0.34, '#fff1c4');
  }
  // sun-set glow
  const sg = g.createRadialGradient(w / 2, horizon, 0, w / 2, horizon, w * 0.6);
  sg.addColorStop(0, 'rgba(255,190,110,0.55)');
  sg.addColorStop(1, 'rgba(255,150,90,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, w, h);
  // skyline: far layer then near layer
  const layer = (col, hMin, hMax, domeP, minP, palmP, seed) => {
    const r = mulberry32(seed);
    g.fillStyle = col;
    g.strokeStyle = col;
    let x = -r() * unit;
    while (x < w) {
      const bw = unit * (0.5 + r() * 0.9);
      const bh = unit * (hMin + r() * (hMax - hMin));
      g.fillRect(x, horizon - bh, bw + 1, bh + 6);
      const p = r();
      if (p < domeP) {
        const dr = bw * 0.42;
        g.beginPath();
        g.ellipse(x + bw / 2, horizon - bh, dr, dr * 1.05, 0, Math.PI, TAU);
        g.fill();
        g.fillRect(x + bw / 2 - 0.6, horizon - bh - dr * 1.05 - unit * 0.18, 1.2, unit * 0.18);
      } else if (p < domeP + minP) {
        const mw = Math.max(3, unit * 0.16);
        const mh = unit * (1.3 + r() * 0.9);
        const mx2 = x + bw * (0.2 + r() * 0.6);
        g.fillRect(mx2 - mw / 2, horizon - bh - mh, mw, mh + 1);
        g.fillRect(mx2 - mw * 0.85, horizon - bh - mh * 0.72, mw * 1.7, Math.max(1.5, unit * 0.05));
        g.beginPath();
        g.moveTo(mx2 - mw * 0.6, horizon - bh - mh);
        g.lineTo(mx2, horizon - bh - mh - mw * 2.6);
        g.lineTo(mx2 + mw * 0.6, horizon - bh - mh);
        g.fill();
      } else if (p < domeP + minP + palmP) {
        const px2 = x + bw * 0.5;
        const ph = unit * (1.2 + r() * 0.8);
        g.lineWidth = Math.max(1.5, unit * 0.07);
        g.beginPath();
        g.moveTo(px2, horizon - bh);
        g.quadraticCurveTo(px2 + unit * 0.15, horizon - bh - ph * 0.5, px2 + unit * 0.05, horizon - bh - ph);
        g.stroke();
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.55;
          const L = unit * (0.45 + r() * 0.2);
          const tx = px2 + unit * 0.05;
          const ty = horizon - bh - ph;
          g.beginPath();
          g.moveTo(tx, ty);
          g.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - unit * 0.1, tx + Math.cos(a) * L, ty + Math.sin(a) * L + unit * 0.15);
          g.stroke();
        }
      }
      x += bw + unit * r() * 0.3;
    }
  };
  layer('rgba(122,46,92,0.75)', 0.25, 0.9, 0.18, 0.12, 0.1, 7);
  layer('#3c1644', 0.12, 0.5, 0.14, 0.1, 0.14, 11);
  // warm lit windows on the near layer
  const r2 = mulberry32(5);
  for (let i = 0; i < w / 14; i++) {
    g.fillStyle = `rgba(255,${180 + r2() * 60},${90 + r2() * 60},${0.35 + r2() * 0.5})`;
    g.fillRect(r2() * w, horizon - unit * (0.08 + r2() * 0.35), Math.max(1.5, unit * 0.06), Math.max(1.5, unit * 0.07));
  }
  return c;
}

// ------------------------------------------------------------------ styles
const CSS = `
.g-rush{position:absolute;inset:0;overflow:hidden;background:#1a0b2b;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;cursor:pointer}
.g-rush .rs-top{position:absolute;z-index:2;left:10px;right:10px;top:8px;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.g-rush .rs-banner{position:relative;box-sizing:border-box;width:100%;max-width:440px;height:${BANNER_H}px;display:flex;align-items:center;gap:10px;padding:6px 12px 9px 8px;border-radius:16px;color:#fff;overflow:hidden;
  background:linear-gradient(180deg,rgba(62,16,52,.95),rgba(32,7,32,.93));border:2px solid rgba(255,110,165,.62);
  box-shadow:0 8px 22px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.1);opacity:0;transform:translateY(-10px);transition:opacity .2s,transform .2s,border-color .2s}
.g-rush .rs-banner.on{opacity:1;transform:none}
.g-rush .rs-emoji{flex:none;width:44px;height:44px;display:grid;place-items:center;font-size:26px;line-height:1;border-radius:12px;background:rgba(255,110,165,.16);box-shadow:inset 0 0 0 1px rgba(255,110,165,.3)}
.g-rush .rs-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.g-rush .rs-lbl{font:800 10px/1.15 ${UI_FONT};letter-spacing:.06em;text-transform:uppercase;color:#ff92bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-rush .rs-en{font:800 24px/1.12 ${UI_FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.g-rush .rs-hint{font:500 12px/1.2 ${UI_FONT};color:#f6d3e3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-rush .rs-hint:empty{display:none}
.g-rush .rs-num{flex:none;align-self:flex-start;box-sizing:border-box;min-width:32px;text-align:center;margin:2px -4px 0 -4px;font:800 10px/1 ${UI_FONT};color:#ffb3cf;background:rgba(255,255,255,.08);border-radius:999px;padding:3px 5px}
.g-rush .rs-banner.two .rs-lbl{display:none}
.g-rush .rs-banner.two .rs-en{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.05}
.g-rush .rs-bar{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.08)}
.g-rush .rs-bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff6b9d,#ffd43b);transform-origin:0 50%;transform:scaleX(0)}
.g-rush .rs-reveal{box-sizing:border-box;max-width:440px;width:100%;min-height:${REVEAL_H - 6}px;max-height:${REVEAL_H}px;overflow:hidden;padding:3px 10px 4px;border-radius:12px;color:#fff;text-align:center;
  font:600 14px/1.3 ${UI_FONT};background:rgba(127,29,29,.94);border:1.5px solid rgba(248,113,113,.95);box-shadow:0 6px 16px rgba(0,0,0,.45);
  opacity:0;transform:translateY(-6px);transition:opacity .18s,transform .18s}
.g-rush .rs-reveal.on{opacity:1;transform:none}
.g-rush .rs-reveal.info{background:rgba(40,22,10,.94);border-color:#fbbf24}
.g-rush .rs-reveal .ln{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:calc(14px * var(--k, 1));line-height:1.3}
.g-rush .rs-reveal .ar{font:700 1.36em/1.18 ${AR_FONT};unicode-bidi:isolate}
.g-rush .rs-reveal .tr{font-style:italic;font-weight:500;color:#fecaca;font-size:.93em}
.g-rush .rs-reveal .ok{color:#bbf7d0}
.g-rush .rs-reveal .ok .ar{color:#fff}
.g-rush .rs-reveal .ok .tr{color:#bbf7d0}
.g-rush .rs-tip{position:absolute;z-index:2;left:50%;bottom:12px;transform:translate(-50%,8px);max-width:calc(100% - 24px);box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  padding:7px 14px;border-radius:999px;background:rgba(20,6,24,.78);border:1px solid rgba(255,255,255,.18);color:#fff;font:700 13px/1.2 ${UI_FONT};
  opacity:0;transition:opacity .25s,transform .25s;pointer-events:none}
.g-rush .rs-tip.on{opacity:1;transform:translate(-50%,0)}
.g-rush .rs-vig{position:absolute;inset:0;z-index:1;pointer-events:none}
.g-rush.wide .rs-top{flex-direction:row;align-items:flex-start;justify-content:center;gap:8px}
.g-rush.wide .rs-banner,.g-rush.wide .rs-reveal{flex:1 1 0;min-width:0}
.g-rush.wide .rs-emoji{display:none}
.g-rush.wide .rs-reveal{padding:3px 8px 4px}
.g-rush.wide .rs-reveal{height:${BANNER_H}px;max-height:none;display:flex;flex-direction:column;justify-content:center}
@media (prefers-reduced-motion:reduce){.g-rush .rs-banner,.g-rush .rs-reveal,.g-rush .rs-tip{transition:none;animation:none!important}}
`;

// ------------------------------------------------------------------ the game
export default {
  howTo: [
    '<strong>Swipe ← →</strong> (or tap a side) into the arch with the <strong>Arabic</strong> for the English word.',
    'Dodge carts &amp; camels, <strong>swipe ↑</strong> over crates. Chain arches: 🔥',
  ],
  minWords: 12,
  // Short single words / collocations so the label fits on an arch sign.
  wordFilter: (w) => shortLabel(w, { arMax: 9, enMax: 22 }),

  create(stage, kit) {
    const rm = !!kit.reducedMotion;
    const style = document.createElement('style');
    style.textContent = CSS;
    const root = document.createElement('div');
    root.className = 'g-rush';
    root.innerHTML = `
      <div class="rs-vig" aria-hidden="true"></div>
      <div class="rs-top">
        <div class="rs-banner" aria-live="polite">
          <div class="rs-emoji" aria-hidden="true">🎯</div>
          <div class="rs-txt"><div class="rs-lbl">Run through the arch for</div><div class="rs-en"></div><div class="rs-hint"></div></div>
          <div class="rs-num"></div>
          <div class="rs-bar" aria-hidden="true"><i></i></div>
        </div>
        <div class="rs-reveal" aria-live="assertive"></div>
      </div>
      <div class="rs-tip" aria-hidden="true"></div>`;
    stage.append(style, root);
    const $top = root.querySelector('.rs-top');
    const $banner = root.querySelector('.rs-banner');
    const $emoji = root.querySelector('.rs-emoji');
    const $en = root.querySelector('.rs-en');
    const $hint = root.querySelector('.rs-hint');
    const $num = root.querySelector('.rs-num');
    const $bar = root.querySelector('.rs-bar i');
    const $reveal = root.querySelector('.rs-reveal');
    const $tip = root.querySelector('.rs-tip');
    const $txt = root.querySelector('.rs-txt');
    const $vig = root.querySelector('.rs-vig');
    let enAvail = 200; // width of the prompt's text box (px), measured in layout()

    const cam = { W: 1, H: 1, cx: 0.5, LW: 100, baseY: 1, vpY: 0, dz: 1, fogY: 0, camX: 0 };
    const PX = (x, s) => cam.cx + (x - cam.camX) * cam.LW * s;
    const PY = (y, s) => cam.vpY + cam.dz * s - y * cam.LW * s;
    const SKY_PAD = 24;
    let sprites = null;
    let sky = null;
    let haze = null;
    let fontsOk = false;
    let destroyed = false;
    let s = null; // round state
    const imgs = {};
    const labelFit = new Map(); // arabic text → width at 100px
    const fx = { shakeT: 0, shakeDur: 1, shakeMag: 0, flashT: 0, flashCol: '255,40,40', flashA: 0.4 };
    const idle = makeIdle();
    let barShown = -1;

    const loop = createLoop((dt) => step(dt));
    let cv = null;
    let ready = false; // set once every helper below is initialised
    cv = setupCanvas(root, { onResize: (w, h) => ready && layout(w, h) });
    fontsReady().then(() => {
      fontsOk = true;
      labelFit.clear();
      if (!destroyed && !loop.running) render();
    });
    for (const m of MOODS)
      dubbiImage(m).then((img) => {
        imgs[m] = img;
        if (!destroyed && !loop.running) render();
      });

    // ---------------------------------------------------------- layout
    function layout(w, h) {
      cam.W = w;
      cam.H = h;
      cam.cx = w / 2;
      const top = $top.offsetTop || 8;
      let LW = Math.min(w * 0.36, h * 0.24);
      let baseY = h - clamp(h * 0.12, 60, 120);
      // Portrait: prompt banner and correction card stacked; the fog line (where
      // gates appear) sits below them so no sign is ever under the cards.
      const stackBottom = top + BANNER_H + 6 + REVEAL_H + 6;
      const fit = (lw) => (baseY - Math.max(stackBottom + SIGN_TOP * S_MIN * lw, h * 0.34)) / (1 - S_MIN);
      let dz = fit(LW);
      const wide = dz < 2.5 * LW && w >= 440;
      root.classList.toggle('wide', wide);
      if (wide) {
        // Short landscape stage: banner and card side by side in one row. With
        // dz = SIGN_TOP·LW the centre sign's top stays level with the row's
        // bottom edge for the whole approach (the side signs are lower).
        const B = top + BANNER_H + 4;
        baseY = h - clamp(h * 0.12, 40, 120);
        LW = Math.min(w * 0.36, h * 0.3, (baseY - B) / SIGN_TOP);
        dz = clamp((baseY - B - SIGN_TOP * S_MIN * LW) / (1 - S_MIN), 1.6 * LW, 3.6 * LW);
      } else {
        // Narrow and short (rare): shrink the lanes until the stack fits.
        if (dz < 2.5 * LW) LW = Math.max(30, (baseY - stackBottom) / (2.5 * (1 - S_MIN) + SIGN_TOP * S_MIN));
        dz = clamp(fit(LW), 2.5 * LW, 3.6 * LW);
      }
      cam.LW = LW;
      cam.baseY = baseY;
      cam.dz = dz;
      cam.vpY = cam.baseY - dz;
      cam.fogY = cam.vpY + S_MIN * dz;
      enAvail = $txt.clientWidth || enAvail;
      $vig.style.background = `radial-gradient(circle at 50% 55%, rgba(20,4,24,0) ${Math.round(Math.min(w, h) * 0.35)}px, rgba(20,4,24,.5) ${Math.round(Math.max(w, h) * 0.78)}px)`;
      if (cv) {
        sprites = buildSprites(cv.dpr);
        const bannerBottom = top + BANNER_H;
        const farWallTop = cam.fogY - (WALL_H + 0.3) * S_MIN * cam.LW;
        sky = buildSky(w, cam.fogY, cam.LW * S_MIN, cv.dpr, SKY_PAD, Math.max(bannerBottom + 22, (bannerBottom + farWallTop) / 2));
        // haze where the street disappears (static, so built once per layout)
        const hh = cam.LW * S_MIN * WALL_H * 1.2;
        haze = cv.ctx.createLinearGradient(0, cam.fogY - hh, 0, cam.fogY + hh * 0.5);
        haze.addColorStop(0, `rgba(${FOG},0)`);
        haze.addColorStop(0.62, `rgba(${FOG},0.75)`);
        haze.addColorStop(1, `rgba(${FOG},0)`);
      }
      if (s) for (const g of s.gates) g.sl = null;
      if (!loop.running) render();
    }

    // ---------------------------------------------------------- difficulty
    function speedAt(t) {
      const warm = clamp(t / 0.8, 0, 1);
      const ramp = Math.min(1, t / 110);
      const late = Math.min(0.25, Math.max(0, t - 110) / 600);
      return V0 * (0.45 + 0.55 * warm) * (1 + 0.9 * ramp + late);
    }
    const gateSpacing = (v, t) => Z_FAR * 1.08 + v * lerp(1.5, 0.4, clamp(t / 100, 0, 1));
    /** Speed expected when the track at absolute position zw is reached. */
    function speedWhen(zw) {
      const ahead = Math.max(0, zw - s.dist);
      return speedAt(s.runT + ahead / Math.max(1, s.speed));
    }

    // ---------------------------------------------------------- words
    function buildDeck() {
      // Shuffled, softly biased so the most-used words tend to come first.
      const n = s.pool.length;
      return s.pool
        .map((w, i) => ({ w, k: s.rng() + (i / n) * 0.9 }))
        .sort((a, b) => a.k - b.k)
        .map((o) => o.w);
    }
    function nextTarget() {
      let w = null;
      const qi = s.queue.findIndex((q) => q.due <= s.gateSeq);
      if (qi >= 0) w = s.queue.splice(qi, 1)[0].word;
      for (let tries = 0; !w && tries < 30; tries++) {
        if (s.deckI >= s.deck.length) {
          s.deck = buildDeck();
          s.deckI = 0;
        }
        const c = s.deck[s.deckI++];
        if (!s.recent.includes(c.id) || tries > 20) w = c;
      }
      s.recent.push(w.id);
      if (s.recent.length > 8) s.recent.shift();
      return w;
    }
    function requeue(word, delay) {
      const n = s.requeued.get(word.id) ?? 0;
      if (n >= 2 || s.queue.some((q) => q.word.id === word.id)) return;
      s.requeued.set(word.id, n + 1);
      s.queue.push({ word, due: s.gateSeq + delay });
    }
    function addMissed(word) {
      if (!s.missed.some((w) => w.id === word.id)) s.missed.push(word);
    }
    /** Seeded sample of up to n items of arr (all of it when short). */
    function sample(arr, n) {
      if (arr.length <= n) return arr;
      const out = new Set();
      while (out.size < n) out.add(arr[Math.floor(s.rng() * arr.length)]);
      return [...out];
    }
    /** A small candidate set for kit.distractors (the whole 5,000-word pool would stall the frame). */
    function candidates(target) {
      const same = s.byPC.get(`${target.pos}|${target.cat}`) ?? [];
      const pos = s.byPos.get(target.pos) ?? [];
      return [...new Set([...sample(same, 120), ...sample(pos, 50), ...sample(s.pool, 30)])];
    }
    /** Two wrong words for target: same POS/category where possible, never a synonym of it. */
    function pickDistractors(target) {
      const tEn = kit.shortEn(target, 24).toLowerCase();
      const fair = (x) => !clash(target, x) && kit.shortEn(x, 24).toLowerCase() !== tEn;
      let ds = kit.distractors(target, candidates(target), 10, s.rng).filter(fair).slice(0, 2);
      if (ds.length < 2) ds = [...ds, ...kit.distractors(target, s.pool, 60, s.rng).filter((x) => fair(x) && !ds.includes(x))].slice(0, 2);
      if (ds.length < 2) ds = [...ds, ...kit.distractors(target, s.pool, 4, s.rng).filter((x) => !ds.includes(x))].slice(0, 2); // tiny pools only
      return ds;
    }
    function fillGate(g) {
      s.gateSeq++;
      const target = nextTarget();
      const ds = pickDistractors(target);
      let lanes = shuffle([0, 1, 2], s.rng);
      // never the same correct lane three gates running
      const last2 = s.lastLanes.slice(-2);
      if (last2.length === 2 && last2[0] === last2[1] && lanes[0] === last2[0]) lanes = [lanes[1], lanes[0], lanes[2]];
      const words = [];
      words[lanes[0]] = target;
      words[lanes[1]] = ds[0] ?? target;
      words[lanes[2]] = ds[1] ?? ds[0] ?? target;
      g.words = words;
      g.target = target;
      g.correctLane = lanes[0];
      s.lastLanes.push(lanes[0]);
    }

    // ---------------------------------------------------------- track generation
    function makeGate(zw) {
      const g = { zw, idx: s.gateCount++, words: null, target: null, correctLane: 1, resolved: false, choice: -1, ok: null, appeared: false, resAt: 0 };
      s.gates.push(g);
      return g;
    }
    /** Schedules the gate after the last one plus the obstacles / coins leading to it. */
    function scheduleNext() {
      const last = s.gates[s.gates.length - 1];
      const v = speedWhen(last.zw);
      const tAt = s.runT + Math.max(0, last.zw - s.dist) / Math.max(1, s.speed);
      const g = makeGate(last.zw + gateSpacing(v, tAt));
      genSegment(last.zw, g.zw, g.idx);
    }
    /** Obstacle rows and coin trails between two gates (absolute track positions). */
    function genSegment(a, b, idx) {
      const L = s.lrng;
      const v = speedWhen(a);
      const tAt = s.runT + Math.max(0, a - s.dist) / Math.max(1, s.speed);
      const ramp = clamp(tAt / 100, 0, 1);
      const start = a + v * 0.85; // breathing room after a gate
      const end = b - Math.max(v, speedWhen(b), V0) * 1.15; // nothing right before a gate: line up with the right arch
      const rows = [];
      if (idx >= 1) {
        const gap = v * lerp(1.3, 0.82, ramp);
        const maxRows = idx < 2 ? 1 : idx < 4 ? 2 : ramp > 0.6 ? 4 : 3;
        let z = start + 0.4 + L() * gap * 0.35;
        while (z < end - 0.6 && rows.length < maxRows) {
          const two = idx >= 2 && L() < lerp(0.25, 0.55, ramp);
          let blocked;
          if (two) {
            const free = Math.floor(L() * 3);
            blocked = [0, 1, 2].filter((l) => l !== free);
          } else blocked = [Math.floor(L() * 3)];
          let depth = 0;
          for (const lane of blocked) {
            const r = L();
            const type = r < 0.36 ? 'crate' : r < 0.7 ? 'cart' : 'camel';
            depth = Math.max(depth, OBS[type].d);
            s.obs.push({ zw: z, lane, type, hit: false, flip: L() < 0.5, seed: (L() * 1e9) | 0 });
          }
          rows.push({ z, depth, free: [0, 1, 2].filter((l) => !blocked.includes(l)) });
          z += gap * (1 + 0.5 * L());
        }
      }
      // coin trails between rows, leading into a free lane
      let zc = idx === 0 ? a + 2.2 : start;
      for (let i = 0; i <= rows.length; i++) {
        const zEnd = i < rows.length ? rows[i].z - 0.9 : end;
        const len = zEnd - zc;
        if (len > 2.6 && L() < 0.88) {
          const lane = i < rows.length ? rows[i].free[Math.floor(L() * rows[i].free.length)] : Math.floor(L() * 3);
          const n = Math.min(9, Math.floor(len / 0.9));
          const z0 = zc + (len - (n - 1) * 0.9) * L();
          const heart = idx >= 3 && idx - s.lastHeartIdx >= 5 && L() < 0.3;
          if (heart) s.lastHeartIdx = idx;
          const magnet = !heart && idx >= 2 && idx - s.lastMagnetIdx >= 4 && L() < 0.3;
          if (magnet) s.lastMagnetIdx = idx;
          for (let k = 0; k < n; k++) s.coinList.push({ zw: z0 + k * 0.9, lane, got: false, heart: heart && k === n - 1, magnet: magnet && k === n - 1 });
        }
        if (i < rows.length) zc = rows[i].z + rows[i].depth + 0.9;
      }
    }

    function currentGate() {
      return s?.gates.find((g) => !g.resolved && g.words) ?? null;
    }

    // ---------------------------------------------------------- banner, reveal, tip
    /** Font size for the prompt so it fits its box (measured on canvas: no DOM reflow); two lines when very long. */
    function fitPrompt(text) {
      const ctx = cv.ctx;
      ctx.font = `800 24px ${UI_FONT}`;
      const tw = ctx.measureText(text).width;
      const avail = enAvail - 6;
      if (tw <= avail) return [24, false];
      const one = Math.floor((24 * avail) / tw);
      if (one >= 17) return [one, false];
      return [clamp(Math.floor((24 * avail * 1.85) / tw), 13, 16), true];
    }
    function setBanner(g) {
      if (!g) {
        $banner.classList.remove('on');
        return;
      }
      const t = g.target;
      const main = kit.shortEn(t, 24);
      const [size, two] = fitPrompt(main);
      $emoji.textContent = CAT_EMOJI[t.cat] ?? '🔤';
      $en.textContent = main;
      $en.style.fontSize = size === 24 ? '' : `${size}px`;
      $banner.classList.toggle('two', two);
      $hint.textContent = promptHint(t, main);
      $num.textContent = `#${g.idx + 1}`;
      $banner.classList.add('on');
      if (!rm && $banner.animate) $banner.animate([{ transform: 'scale(.92)' }, { transform: 'scale(1.04)', offset: 0.6 }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
      barShown = -1;
    }
    function updateBar() {
      const g = currentGate();
      let p = 0;
      if (g && s.phase === 'run') p = clamp(1 - (g.zw - s.dist) / Z_FAR, 0, 1);
      p = Math.round(p * 100) / 100;
      if (p !== barShown) {
        barShown = p;
        $bar.style.transform = `scaleX(${p})`;
      }
    }
    const arSpan = (w) => `<bdi class="ar" dir="rtl" lang="ar">${esc(w.ar)}</bdi>`;
    function reveal(html, kind = 'bad') {
      $reveal.className = `rs-reveal on ${kind}`;
      $reveal.innerHTML = html;
      s.revealUntil = s.time + 2.8;
      s.revealKind = kind;
      fitReveal();
    }
    /** Keeps the correction card to its two lines: drops the wrong word's transliteration, then shrinks the text. */
    function fitReveal() {
      const lines = [...$reveal.querySelectorAll('.ln')];
      if (!lines.length) return;
      const ratios = () => lines.map((l) => Math.min(1, l.clientWidth / Math.max(1, l.scrollWidth)));
      let r = ratios();
      if (Math.min(...r) < 0.86) {
        $reveal.querySelector('.ln.bad .tr')?.remove();
        r = ratios();
      }
      if (Math.min(...r) < 0.72) {
        $reveal.querySelector('.ln.ok .tr')?.remove(); // very narrow card (landscape): Arabic + meaning first
        r = ratios();
      }
      lines.forEach((l, i) => r[i] < 1 && l.style.setProperty('--k', String(Math.max(0.7, Math.floor(r[i] * 98) / 100))));
    }
    function hideReveal() {
      $reveal.className = 'rs-reveal';
    }
    function showTip(text) {
      $tip.textContent = text;
      $tip.classList.add('on');
    }
    function hideTip() {
      $tip.classList.remove('on');
      if (s) s.tip = false;
    }

    // ---------------------------------------------------------- effects
    function floater(text, x, y, o = {}) {
      s.floaters.push({
        text, x: clamp(x, 40, cam.W - 40), y: clamp(y, 40, cam.H - 30), t: 0, life: o.life ?? 1, vy: o.vy ?? -60, size: o.size ?? 26,
        color: o.color ?? '#fff', font: o.font ?? UI_FONT, weight: o.weight ?? 800, stroke: o.stroke ?? 'rgba(30,6,20,0.9)', pop: o.pop ?? true,
      });
    }
    function burst(x, y, n, o = {}) {
      const cols = o.colors ?? ['#ffd43b', '#ff6b9d', '#4ade80', '#74c0fc', '#fff'];
      n = rm ? Math.ceil(n / 3) : n;
      for (let i = 0; i < n; i++) {
        const a = (o.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? TAU);
        const sp = (o.speed ?? 260) * (0.35 + Math.random() * 0.75);
        s.parts.push({
          kind: o.kind ?? 'confetti', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g ?? 520,
          life: (o.life ?? 0.9) * (0.6 + Math.random() * 0.6), max: o.life ?? 0.9, size: (o.size ?? 6) * (0.6 + Math.random() * 0.7),
          color: cols[(Math.random() * cols.length) | 0], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
        });
      }
      if (s.parts.length > 260) s.parts.splice(0, s.parts.length - 260);
    }
    function coinsToHud(x, y, n) {
      for (let i = 0; i < (rm ? 3 : n); i++) {
        s.parts.push({
          kind: 'fly', x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 30, sx: 0, sy: 0, tx: cam.W - 26, ty: 6,
          t: -i * 0.04, dur: 0.55 + Math.random() * 0.15, life: 1, max: 1, size: 9 + Math.random() * 4,
        });
      }
    }
    function shake(mag, dur = 0.35) {
      if (rm) return;
      fx.shakeMag = mag;
      fx.shakeT = dur;
      fx.shakeDur = dur;
    }
    function flash(col, a = 0.4) {
      fx.flashCol = col;
      fx.flashA = a;
      fx.flashT = 1;
    }
    function setMood(m, dur) {
      s.mood = m;
      s.moodT = dur;
    }
    function updateExtra() {
      const m = multFor(s.streak);
      kit.hud.extra([s.magnetT > 0 ? '🧲' : '', m > 1 ? `🔥×${m}` : ''].filter(Boolean).join(' '));
    }

    // ---------------------------------------------------------- outcomes
    function resolveGate(g) {
      g.resolved = true;
      g.choice = s.lane;
      g.ok = s.lane === g.correctLane;
      g.resAt = s.time;
      s.gatesDone++;
      const t = g.target;
      const ax = PX(g.choice - 1, 1);
      const ay = PY(GATE.plq[g.choice].cy, 1);
      const headY = cam.baseY - cam.LW * DUBBI_H;
      if (g.ok) {
        s.correct++;
        const before = multFor(s.streak);
        s.streak++;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        const mult = multFor(s.streak);
        const pts = 100 * mult;
        s.score += pts;
        s.log.push('🟩');
        kit.sfx.good();
        kit.haptic(18);
        kit.speak(t.ar);
        flash('80,255,140', 0.16);
        burst(ax, ay, 34, { speed: 300, life: 1.1 });
        coinsToHud(ax, ay, 8);
        floater(`+${pts}`, PX(s.px, 1), headY - 34, { size: 34, color: '#ffe066', life: 1.05, vy: -50 });
        floater(`${t.ar}`, PX(s.px, 1), headY - 2, { size: 30, font: AR_FONT, weight: 700, color: '#d3f9d8', life: 1.15, vy: -36 });
        floater(t.tr, PX(s.px, 1), headY + 26, { size: 17, weight: 700, color: '#b2f2bb', life: 1.15, vy: -36 });
        if (mult > before) {
          kit.sfx.combo(s.streak);
          floater(`🔥 COMBO ×${mult}!`, cam.W / 2, cam.fogY + (cam.baseY - cam.fogY) * 0.28, { size: 32, color: '#ffd43b', life: 1.3, vy: -14 });
          setMood('wow', 0.9);
        } else setMood('cheer', 0.9);
      } else {
        s.streak = 0;
        s.wrongs++;
        s.log.push('🟥');
        const picked = g.words[g.choice];
        addMissed(t);
        requeue(t, 2);
        kit.sfx.bad();
        kit.haptic([40, 30, 70]);
        kit.speak(t.ar);
        flash('255,40,40', 0.38);
        shake(9, 0.32);
        if (!rm) s.slowT = 0.55;
        setMood('sad', 1.3);
        burst(ax, ay, 16, { colors: ['#ff6b6b', '#c92a2a', '#ffc9c9'], speed: 220, life: 0.7, kind: 'shard' });
        floater('✗', PX(s.px, 1), headY - 18, { size: 54, color: '#ff6b6b', life: 0.8, vy: -30 });
        reveal(
          `<div class="ln bad">✗ ${arSpan(picked)} <span class="tr">${esc(picked.tr)}</span> = ${esc(kit.shortEn(picked, 22))}</div>
           <div class="ln ok">✓ ${esc(kit.shortEn(t, 22))} = ${arSpan(t)} <span class="tr">${esc(t.tr)}</span></div>`,
        );
        loseLife();
      }
      kit.hud.score(s.score);
      updateExtra();
      if (s.tip && s.gatesDone >= 1) hideTip();
      if (s.phase !== 'run') return;
      // Next prompt + one more gate scheduled ahead: done on the following frames
      // (word picking, then the banner) so the success burst does not hitch.
      s.pending = 1;
    }
    /** Runs the deferred work after a gate: frame 1 picks the next words, frame 2 updates the banner. */
    function runPending() {
      if (s.pending === 1) {
        const next = s.gates.find((x) => !x.resolved && !x.words);
        if (next) fillGate(next);
        scheduleNext();
        s.pending = 2;
      } else {
        s.pending = 0;
        setBanner(currentGate());
      }
    }

    function hitObstacle(o) {
      o.hit = true;
      s.hits++;
      const sx = PX(o.lane - 1, 1);
      const sy = cam.baseY - cam.LW * 0.35;
      kit.sfx.bad();
      kit.sfx.swish();
      kit.haptic([60, 40, 90]);
      flash('255,60,40', 0.42);
      shake(13, 0.4);
      setMood('sad', 1.2);
      s.invulnT = 1.5;
      if (o.type === 'crate') burst(sx, sy, 22, { colors: ['#b07a3e', '#8a5a2b', '#d29a5a'], speed: 330, life: 0.9, kind: 'shard', g: 900 });
      else if (o.type === 'cart') burst(sx, sy - 10, 26, { colors: ['#ff922b', '#e03131', '#2f9e44', '#fcc419'], speed: 320, life: 1, kind: 'fruit', g: 900, size: 9 });
      else burst(sx, sy, 18, { colors: ['#f1d3a1', '#d9b17a', '#fff'], speed: 240, life: 0.8, kind: 'dust', g: -60, size: 14 });
      floater(o.type === 'camel' ? 'Oof! 🐪' : 'Crash!', sx, sy - cam.LW * 0.55, { size: 28, color: '#ffa8a8', life: 0.9, vy: -40 });
      if (o.type !== 'crate') {
        // knocked aside (tumbles out of the way) rather than vanishing
        o.hitT = s.time;
        o.kdir = o.lane === 0 ? -1 : o.lane === 2 ? 1 : o.flip ? 1 : -1;
      }
      if (!s.hitHelp) {
        s.hitHelp = true;
        if (s.revealUntil > s.time && s.revealKind === 'bad') {
          // a word correction is on screen: keep it there, put the help in the bottom pill
          showTip('💥 Swipe ← → to dodge · ↑ to jump crates');
          s.tip = false;
          s.tipUntil = s.time + 3.2;
        } else reveal(`<div>💥 Watch the road! Swipe <b>← →</b> to dodge, swipe <b>↑</b> to jump crates.</div>`, 'info');
      }
      loseLife();
    }

    function loseLife() {
      s.lives--;
      kit.hud.lives(Math.max(0, s.lives), MAX_LIVES);
      if (s.lives <= 0) gameOver();
    }

    function gameOver() {
      s.phase = 'over';
      s.overT = 0;
      s.auto = null;
      s.magnetT = 0;
      updateExtra();
      setMood('sad', 99);
      setBanner(null);
      hideTip();
    }

    /** Lifetime coin total on this device (a small reason to grab coins); null if storage is blocked. */
    function addToBank(n) {
      try {
        const total = (Number(localStorage.getItem(BANK_KEY)) || 0) + n;
        localStorage.setItem(BANK_KEY, String(total));
        return total;
      } catch {
        return null;
      }
    }
    function finish() {
      s.ended = true;
      const { score, correct, gatesDone, bestStreak, coins, log } = s;
      const meters = Math.round(s.dist * 2);
      const pill = (t) =>
        `<span style="display:inline-block;background:#fff0f6;border:1px solid #fcc2d7;color:#7a1c3f;border-radius:999px;padding:4px 10px;font-size:.85rem;font-weight:600;margin:3px">${t}</span>`;
      const grid = log.slice(0, 24).join('') + (log.length > 24 ? '…' : '');
      const bank = addToBank(coins);
      const result = {
        score,
        correct,
        total: gatesDone,
        won: false,
        missed: s.missed.slice(),
        title: `🏃 ${meters} m in the souq`,
        detail: `<div style="margin:12px 0 2px;text-align:center">${pill(`🚪 <b>${correct}</b>/${gatesDone} arches`)}${bestStreak >= 2 ? pill(`🔥 best streak <b>${bestStreak}</b>`) : ''}${pill(`🪙 <b>${coins}</b> coin${coins === 1 ? '' : 's'}${bank > coins ? ` · ${bank} saved` : ''}`)}${pill(`📏 <b>${meters}</b> m`)}</div>`,
        shareText: `🏃 Souq Rush · ${score} pts\n${grid || '🏃'}\nI ran ${meters} m through a Libyan souq and picked ${correct} right Arabic word${correct === 1 ? '' : 's'}. Can you beat me?`,
        meta: { gates: gatesDone, coins, meters, bestStreak, hits: s.hits, wrongs: s.wrongs },
      };
      loop.stop();
      render();
      kit.end(result);
    }

    // ---------------------------------------------------------- input
    function move(dir, auto = false) {
      if (!s || s.phase !== 'run' || !kit.playing) return;
      if (!auto) {
        s.auto = null;
        if (s.tip && s.runT > 0.6) s.tipMoves++;
      }
      const nl = clamp(s.lane + dir, 0, 2);
      if (nl === s.lane) {
        s.bumpT = 0.18;
        s.bumpDir = dir;
        return;
      }
      s.laneFrom = s.px;
      s.lane = nl;
      s.laneT = 0;
      s.squash = 1;
      kit.sfx.tap();
    }
    function jump(auto = false) {
      if (!s || s.phase !== 'run' || !kit.playing || s.jumpT >= 0) return;
      if (!auto) s.auto = null;
      s.jumpT = 0;
      s.drop = false;
      kit.sfx.flap();
    }
    /** Swipe down: drop straight back to the ground mid-jump (or a quick duck on the ground). */
    function down() {
      if (!s || s.phase !== 'run' || !kit.playing) return;
      s.auto = null;
      if (s.jumpT >= 0) {
        if (s.jumpT < JUMP_DUR / 2) s.jumpT = JUMP_DUR - s.jumpT; // same height, now falling
        s.drop = true;
      } else s.squash = 1;
      kit.sfx.swish();
    }
    function jumpY(st) {
      return st.jumpT >= 0 ? JUMP_H * 4 * (st.jumpT / JUMP_DUR) * (1 - st.jumpT / JUMP_DUR) : 0;
    }

    // One gesture per finger, so two-thumb play (left, left) never drops a tap.
    const ptrs = new Map();
    const SWIPE = 22; // a drag this long fires while the finger is still down
    const TAP_SLOP = 10; // under this it is a tap; between the two, a quick flick still counts as a swipe
    function onDown(e) {
      if (!s || !kit.playing || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), fired: false });
    }
    function onMove(e) {
      const p = ptrs.get(e.pointerId);
      if (!p || p.fired) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.1) {
        p.fired = true;
        move(dx > 0 ? 1 : -1);
      } else if (Math.abs(dy) > SWIPE * 1.2 && Math.abs(dy) > Math.abs(dx) * 1.1) {
        p.fired = true;
        if (dy < 0) jump();
        else down();
      }
    }
    function onUp(e) {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      ptrs.delete(e.pointerId);
      if (p.fired || e.type === 'pointercancel') return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      const d = Math.hypot(dx, dy);
      const quick = performance.now() - p.t < 450;
      if (d < TAP_SLOP) {
        if (quick) tapAt(p.x);
      } else if (d < SWIPE && !quick) {
        /* slow small wobble: ignore */
      } else if (Math.abs(dx) >= Math.abs(dy)) move(dx > 0 ? 1 : -1);
      else if (dy < 0) jump();
      else down();
    }
    function tapAt(clientX) {
      if (!s) return;
      const r = root.getBoundingClientRect();
      const x = clientX - r.left;
      if (x < r.width / 3) move(-1);
      else if (x > (r.width * 2) / 3) move(1);
      else {
        // middle third: step towards the tap from where Dubbi is, or jump if tapping on him
        const dx = x - PX(s.px, 1);
        if (Math.abs(dx) > cam.LW * 0.45) move(dx > 0 ? 1 : -1);
        else jump();
      }
    }
    function onKey(e) {
      if (!s || !kit.playing || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      let act = null;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') act = () => move(-1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') act = () => move(1);
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') act = () => jump();
      else if (k === 'ArrowDown' || k === 's' || k === 'S') act = () => down();
      if (!act) return;
      e.preventDefault();
      if (!e.repeat) act();
    }
    const noMenu = (e) => e.preventDefault();
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('contextmenu', noMenu);
    document.addEventListener('keydown', onKey);

    // ---------------------------------------------------------- debug autopilot
    /** Steers to the chosen arch of the next gate while dodging obstacles. */
    function autopilot(dt) {
      s.autoCool -= dt;
      if (s.autoCool > 0 || s.laneT < 1) return;
      const g = currentGate();
      let want = s.lane;
      if (g) {
        if (s.auto === 'correct') want = g.correctLane;
        else want = [0, 1, 2].filter((l) => l !== g.correctLane).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane))[0];
      }
      const horizon = s.speed * 0.62 + 0.7;
      const blocked = [0, 1, 2].map((l) =>
        s.obs.some((o) => !o.hit && o.lane === l && o.zw - s.dist < horizon && o.zw - s.dist + OBS[o.type].d > -0.3),
      );
      let next = s.lane;
      if (blocked[s.lane]) {
        const free = [0, 1, 2].filter((l) => !blocked[l]).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane) || Math.abs(a - want) - Math.abs(b - want));
        if (free.length) next = s.lane + Math.sign(free[0] - s.lane);
      } else if (want !== s.lane) {
        const stepL = s.lane + Math.sign(want - s.lane);
        if (!blocked[stepL]) next = stepL;
      }
      if (next !== s.lane) {
        move(next - s.lane, true);
        s.autoCool = 0.14;
      }
    }

    kit.debug({
      info: () =>
        s
          ? (() => {
              const g = currentGate();
              return {
                phase: s.phase,
                prompt: g ? kit.shortEn(g.target, 24) : null,
                targetId: g?.target.id ?? null,
                targetAr: g?.target.ar ?? null,
                lane: s.lane,
                nextGate: g
                  ? { z: +(g.zw - s.dist).toFixed(2), visible: g.zw - s.dist <= Z_FAR, labels: g.words.map((w) => w.ar), ids: g.words.map((w) => w.id), correctLane: g.correctLane, idx: g.idx }
                  : null,
                obstaclesAhead: s.obs
                  .filter((o) => !o.hit && o.zw - s.dist + OBS[o.type].d > -0.3 && o.zw - s.dist < Z_FAR)
                  .map((o) => ({ lane: o.lane, type: o.type, z: +(o.zw - s.dist).toFixed(2), d: OBS[o.type].d, jumpable: OBS[o.type].jump })),
                lives: s.lives,
                score: s.score,
                correct: s.correct,
                total: s.gatesDone,
                streak: s.streak,
                coins: s.coins,
                hits: s.hits,
                speed: +s.speed.toFixed(2),
                time: +s.runT.toFixed(2),
                auto: s.auto,
              };
            })()
          : { phase: 'idle' },
      answer: () => {
        if (s && s.phase === 'run') s.auto = 'correct';
      },
      wrong: () => {
        if (s && s.phase === 'run') s.auto = 'wrong';
      },
    });

    // ---------------------------------------------------------- simulation
    function makeIdle() {
      return { dist: 0, px: 0, lane: 1, lean: 0, squash: 0, jumpT: -1, runPhase: 0, mood: 'happy', invulnT: 0, phase: 'idle', time: 0, speed: 0, gates: [], obs: [], coinList: [], parts: [], floaters: [], bumpT: 0, bumpDir: 0 };
    }

    function updatePlayer(dt) {
      s.laneT = Math.min(1, s.laneT + dt / LANE_DUR);
      const target = s.lane - 1;
      const e = 1 - Math.pow(1 - s.laneT, 3);
      s.px = lerp(s.laneFrom, target, e);
      const leanTo = s.laneT < 1 ? Math.sign(target - s.laneFrom) : 0;
      s.lean += (leanTo - s.lean) * Math.min(1, dt * 16);
      s.squash = Math.max(0, s.squash - dt * 6);
      s.bumpT = Math.max(0, s.bumpT - dt);
      if (s.jumpT >= 0) {
        s.jumpT += s.drop ? dt * 3 : dt; // fast drop falls at triple speed
        if (s.jumpT >= JUMP_DUR) {
          s.jumpT = -1;
          s.squash = 0.8;
          if (!rm) burst(PX(s.px, 1), cam.baseY, 6, { kind: 'dust', colors: ['#f1d3a1'], speed: 80, life: 0.5, g: -30, size: 10, angle: -Math.PI / 2, spread: Math.PI });
        }
      }
      const running = s.phase === 'run' || (s.phase === 'over' && s.overT < 0.6);
      if (running) s.runPhase += dt * (5.5 + s.speed * 1.5);
      const camTo = rm ? 0 : s.px * 0.32;
      cam.camX += (camTo - cam.camX) * Math.min(1, dt * 9);
      if (s.moodT > 0) {
        s.moodT -= dt;
        if (s.moodT <= 0) s.mood = 'happy';
      }
      s.invulnT = Math.max(0, s.invulnT - dt);
      // footstep dust
      if (running && s.jumpT < 0 && !rm) {
        s.dustT -= dt;
        if (s.dustT <= 0) {
          s.dustT = 0.22;
          s.parts.push({ kind: 'dust', x: PX(s.px, 1) + (Math.random() - 0.5) * cam.LW * 0.3, y: cam.baseY - 2, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 30, g: -20, life: 0.45, max: 0.45, size: cam.LW * 0.07, color: 'rgba(244,214,170,0.5)', rot: 0, vr: 0 });
        }
      }
    }

    function checkGates() {
      for (const g of s.gates) {
        if (g.resolved) continue;
        const z = g.zw - s.dist;
        if (!g.words && z < Z_FAR * 1.02) fillGate(g); // safety: never show an empty gate
        if (!g.words) continue;
        if (!g.appeared && z <= Z_FAR) {
          g.appeared = true;
          kit.sfx.tick();
        }
        if (z <= 0) {
          resolveGate(g);
          if (s.phase !== 'run') return;
        }
      }
    }

    function checkObstacles() {
      const jy = jumpY(s);
      for (const o of s.obs) {
        if (o.hit) continue;
        const z = o.zw - s.dist;
        const T = OBS[o.type];
        if (z > 0.22 || z + T.d < -0.18) continue;
        if (Math.abs(s.px - (o.lane - 1)) > 0.56) continue;
        if (T.jump && jy > T.h * 0.6) continue;
        if (s.invulnT > 0) continue;
        hitObstacle(o);
        if (s.phase !== 'run') return;
      }
    }

    function checkCoins() {
      for (const c of s.coinList) {
        if (c.got) continue;
        const z = c.zw - s.dist;
        if (z > 0.25 || z < -0.35) continue;
        const pulled = s.magnetT > 0 && !c.heart && !c.magnet;
        if (!pulled && Math.abs(s.px - (c.lane - 1)) > 0.45) continue;
        c.got = true;
        const x = PX(pulled ? s.px : c.lane - 1, 1);
        const y = PY(0.32, 1);
        if (c.heart) {
          if (s.lives < MAX_LIVES) {
            s.lives++;
            kit.hud.lives(s.lives, MAX_LIVES);
            floater('+1 ❤️', x, y - cam.LW * 0.5, { size: 30, color: '#ffc9c9', life: 1.1, vy: -50 });
          } else {
            s.score += 50;
            kit.hud.score(s.score);
            floater('+50', x, y - cam.LW * 0.5, { size: 28, color: '#ffe066', life: 1, vy: -50 });
          }
          kit.sfx.win();
          kit.haptic(25);
          burst(x, y, 16, { colors: ['#ff6b6b', '#ffc9c9', '#fff'], speed: 200, life: 0.7, kind: 'spark', g: 120, size: 5 });
          continue;
        }
        if (c.magnet) {
          s.magnetT = MAGNET_DUR;
          updateExtra();
          floater('🧲 Magnet!', x, y - cam.LW * 0.5, { size: 28, color: '#a5d8ff', life: 1.1, vy: -50 });
          kit.sfx.win();
          kit.haptic(25);
          burst(x, y, 16, { colors: ['#74c0fc', '#d0ebff', '#fff'], speed: 200, life: 0.7, kind: 'spark', g: 120, size: 5 });
          continue;
        }
        s.coins++;
        s.score += 10;
        s.coinChain = s.time - s.lastCoinT < 0.7 ? s.coinChain + 1 : 0;
        s.lastCoinT = s.time;
        kit.sfx.combo(Math.min(12, s.coinChain));
        burst(x, y, 6, { colors: ['#ffe066', '#fff3bf', '#fab005'], speed: 140, life: 0.45, kind: 'spark', g: 200, size: 4 });
        s.parts.push({ kind: 'fly', x, y, tx: cam.W - 26, ty: 6, t: 0, dur: 0.5, life: 1, max: 1, size: 10 });
        kit.hud.score(s.score);
      }
    }

    function prune() {
      const d = s.dist;
      if (s.gates.length > 3) s.gates = s.gates.filter((g) => !(g.resolved && g.zw - d < Z_GONE));
      if (s.obs.length > 24) s.obs = s.obs.filter((o) => o.zw - d > Z_GONE - 1.2);
      if (s.coinList.length > 40) s.coinList = s.coinList.filter((c) => c.zw - d > Z_GONE && !(c.got && c.zw - d < 0));
    }

    function updateFx(dtReal) {
      const st = s ?? idle;
      for (let i = st.parts.length - 1; i >= 0; i--) {
        const p = st.parts[i];
        if (p.kind === 'fly') {
          p.t += dtReal;
          if (p.t >= p.dur) st.parts.splice(i, 1);
          continue;
        }
        p.life -= dtReal;
        if (p.life <= 0) {
          st.parts.splice(i, 1);
          continue;
        }
        p.vy += p.g * dtReal;
        p.x += p.vx * dtReal;
        p.y += p.vy * dtReal;
        p.rot += p.vr * dtReal;
      }
      for (let i = st.floaters.length - 1; i >= 0; i--) {
        const f = st.floaters[i];
        f.t += dtReal;
        f.y += f.vy * dtReal;
        f.vy *= 1 - Math.min(1, dtReal * 2.2);
        if (f.t >= f.life) st.floaters.splice(i, 1);
      }
      if (fx.shakeT > 0) fx.shakeT = Math.max(0, fx.shakeT - dtReal);
      if (fx.flashT > 0) fx.flashT = Math.max(0, fx.flashT - dtReal * 3.2);
    }

    function step(dtReal) {
      if (!s) return render();
      let ts = 1;
      if (s.phase === 'over') ts = Math.max(0, 1 - s.overT / 0.9);
      else if (s.slowT > 0) {
        s.slowT = Math.max(0, s.slowT - dtReal);
        ts = lerp(1, 0.35, clamp(s.slowT / 0.4, 0, 1));
      }
      const dt = dtReal * ts;
      s.time += dt;
      if (s.phase === 'run') {
        if (s.pending) runPending();
        s.runT += dt;
        s.speed = speedAt(s.runT);
        s.dist += s.speed * dt;
        updatePlayer(dt);
        if (s.auto) autopilot(dt);
        checkCoins();
        checkObstacles();
        if (s.phase === 'run') checkGates();
        prune();
        if (s.revealUntil && s.time > s.revealUntil) {
          s.revealUntil = 0;
          hideReveal();
        }
        if (s.tip && (s.runT > 12 || s.tipMoves >= 3)) hideTip();
        if (s.magnetT > 0) {
          s.magnetT -= dt;
          if (s.magnetT <= 0) updateExtra();
        }
        if (s.tipUntil && s.time > s.tipUntil) {
          s.tipUntil = 0;
          hideTip();
        }
      } else if (s.phase === 'over') {
        s.overT += dtReal;
        s.dist += s.speed * dt;
        updatePlayer(dt);
        if (s.overT > 1.3 && !s.ended) {
          updateFx(dtReal);
          return finish();
        }
      }
      updateFx(dtReal);
      updateBar();
      render();
    }

    // ---------------------------------------------------------- drawing helpers
    function quad(ctx, a, b, c, d) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.closePath();
      ctx.fill();
    }
    function gp(x, y, z) {
      const sc = sOf(z);
      return [PX(x, sc), PY(y, sc)];
    }
    /** Quad on a side wall plane (x fixed) between depths z0..z1 and heights y0..y1. */
    function wallQuad(ctx, x, z0, z1, y0, y1) {
      const s0 = sOf(z0);
      const s1 = sOf(z1);
      const x0 = PX(x, s0);
      const x1 = PX(x, s1);
      ctx.beginPath();
      ctx.moveTo(x0, PY(y0, s0));
      ctx.lineTo(x1, PY(y0, s1));
      ctx.lineTo(x1, PY(y1, s1));
      ctx.lineTo(x0, PY(y1, s0));
      ctx.closePath();
      ctx.fill();
    }
    /** Ground quad between x0..x1 and depths z0..z1 (y = 0). */
    function groundQuad(ctx, x0, x1, z0, z1, y = 0) {
      const s0 = sOf(z0);
      const s1 = sOf(z1);
      ctx.beginPath();
      ctx.moveTo(PX(x0, s0), PY(y, s0));
      ctx.lineTo(PX(x1, s0), PY(y, s0));
      ctx.lineTo(PX(x1, s1), PY(y, s1));
      ctx.lineTo(PX(x0, s1), PY(y, s1));
      ctx.closePath();
      ctx.fill();
    }
    function ellipse(ctx, x, y, rx, ry) {
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
      ctx.fill();
    }
    /** Simple shaded box: front face at z, back at z + d. */
    function box(ctx, x, y, z, w, h, d, cFront, cTop, cSide) {
      const s0 = sOf(z);
      const s1 = sOf(z + d);
      const xl = x - w / 2;
      const xr = x + w / 2;
      const f = [PX(xl, s0), PX(xr, s0), PY(y, s0), PY(y + h, s0)];
      const b = [PX(xl, s1), PX(xr, s1), PY(y, s1), PY(y + h, s1)];
      if (xr < cam.camX) {
        ctx.fillStyle = cSide;
        quad(ctx, [f[1], f[3]], [f[1], f[2]], [b[1], b[2]], [b[1], b[3]]);
      } else if (xl > cam.camX) {
        ctx.fillStyle = cSide;
        quad(ctx, [f[0], f[3]], [f[0], f[2]], [b[0], b[2]], [b[0], b[3]]);
      }
      ctx.fillStyle = cTop;
      quad(ctx, [f[0], f[3]], [f[1], f[3]], [b[1], b[3]], [b[0], b[3]]);
      ctx.fillStyle = cFront;
      ctx.fillRect(f[0], f[3], f[1] - f[0], f[2] - f[3]);
      return f;
    }
    function fitLabel(text) {
      let r = labelFit.get(text);
      if (r == null) {
        const ctx = cv.ctx;
        ctx.font = `700 100px ${AR_FONT}`;
        r = Math.max(10, ctx.measureText(text).width);
        labelFit.set(text, r);
      }
      return r;
    }

    /**
     * Sign text layout for a gate, in lane units (cached per gate): a label of
     * two or more words is split over two lines on taller plaques when that
     * makes it clearly bigger, so long collocations stay readable on small phones.
     */
    function signLayout(g) {
      if (g.sl && g.sl.ok === fontsOk) return g.sl;
      const P = GATE.plq[0];
      const maxW = P.w * 0.88 * 100;
      const items = g.words.map((w) => {
        const t = w.ar;
        const one = fontsOk ? Math.min(P.h * 0.7, maxW / fitLabel(t)) : 0;
        const sp = [...t.matchAll(/ /g)].map((m) => m.index);
        if (!sp.length || !fontsOk) return { one, two: null, t };
        const mid = t.length / 2;
        const cut = sp.reduce((x, y) => (Math.abs(y - mid) < Math.abs(x - mid) ? y : x));
        const lines = [t.slice(0, cut), t.slice(cut + 1)];
        return { one, t, two: { lines, size: Math.min(TALL_H * 0.4, maxW / Math.max(fitLabel(lines[0]), fitLabel(lines[1]))) } };
      });
      const tall = items.some((x) => x.two && x.two.size > x.one * 1.15);
      const h = tall ? TALL_H : P.h;
      g.sl = {
        ok: fontsOk,
        h,
        items: items.map((x) =>
          tall && x.two && x.two.size > x.one ? { lines: x.two.lines, size: x.two.size } : { lines: [x.t], size: fontsOk ? Math.min(h * 0.7, maxW / fitLabel(x.t)) : 0 },
        ),
      };
      return g.sl;
    }

    // ---------------------------------------------------------- scene
    function drawGround(ctx, st) {
      const zA = -1.4;
      const zB = Z_FAR + 0.4;
      // base (sidewalk tone) for everything between the walls
      ctx.fillStyle = mix(WALK_A, FOG, 0.25);
      groundQuad(ctx, -WALL_X - 0.6, WALL_X + 0.6, zA, zB);
      const k0 = Math.floor((st.dist + zA) / BAND);
      const k1 = Math.floor((st.dist + zB) / BAND);
      for (let k = k1; k >= k0; k--) {
        const z0 = Math.max(zA, k * BAND - st.dist);
        const z1 = Math.min(zB, (k + 1) * BAND - st.dist);
        if (z1 <= z0) continue;
        const f = fogK((z0 + z1) / 2);
        const odd = k & 1;
        ctx.fillStyle = mix(odd ? ROAD_A : ROAD_B, FOG, f);
        groundQuad(ctx, -ROAD, ROAD, z0, z1);
        ctx.fillStyle = mix(odd ? WALK_A : WALK_B, FOG, f);
        groundQuad(ctx, -WALL_X - 0.6, -ROAD - 0.08, z0, z1);
        groundQuad(ctx, ROAD + 0.08, WALL_X + 0.6, z0, z1);
        // paving: a seam across the road at the band start + staggered joints along it
        ctx.fillStyle = mix([128, 80, 50], FOG, f);
        const zs = k * BAND - st.dist;
        if (zs > zA && zs < zB) groundQuad(ctx, -ROAD, ROAD, zs, zs + 0.05);
        if (f < 0.85) {
          ctx.fillStyle = `rgba(110,62,36,${0.32 * (1 - f)})`;
          const off = odd ? 0.27 : 0;
          for (let jx = -ROAD + 0.27 + off; jx < ROAD - 0.1; jx += 0.54) {
            if (Math.abs(Math.abs(jx) - 0.5) < 0.08) continue; // keep the lane dashes clean
            groundQuad(ctx, jx - 0.012, jx + 0.012, z0, z1);
          }
        }
        // lane dashes
        if (!odd) {
          ctx.fillStyle = `rgba(255,236,200,${0.5 * (1 - f)})`;
          const d1 = Math.min(z1, z0 + BAND * 0.55);
          groundQuad(ctx, -0.53, -0.47, z0, d1);
          groundQuad(ctx, 0.47, 0.53, z0, d1);
        }
      }
      // curbs
      ctx.fillStyle = '#6b3b25';
      groundQuad(ctx, -ROAD - 0.08, -ROAD, zA, zB);
      groundQuad(ctx, ROAD, ROAD + 0.08, zA, zB);
      ctx.fillStyle = 'rgba(255,220,170,0.25)';
      groundQuad(ctx, -ROAD - 0.08, -ROAD - 0.05, zA, zB);
      groundQuad(ctx, ROAD + 0.05, ROAD + 0.08, zA, zB);
    }

    function drawShop(ctx, side, k, z0, z1, f) {
      const h = hash2(k, side);
      const type = h % 6;
      const x = side * WALL_X;
      const span = z1 - z0;
      // opening outline in the wall plane
      const pts = SHOP_ARCH.map(([u, y]) => gp(x, y, z0 + u * span));
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      if (type === 4) {
        // closed blue Libyan door
        ctx.fillStyle = mix([28, 92, 150], FOG, f * 0.9);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = mix([18, 60, 104], FOG, f * 0.9);
        wallQuad(ctx, x, z0 + span * 0.48, z0 + span * 0.52, 0, 2);
        ctx.fillStyle = mix([255, 214, 120], FOG, f);
        for (let i = 0; i < 4; i++) {
          const [px, py] = gp(x, 0.35 + i * 0.3, z0 + span * 0.25);
          const [qx, qy] = gp(x, 0.35 + i * 0.3, z0 + span * 0.75);
          const r = Math.max(0.8, cam.LW * sOf(z0 + span / 2) * 0.025);
          ellipse(ctx, px, py, r, r);
          ellipse(ctx, qx, qy, r, r);
        }
        ctx.restore();
        return;
      }
      ctx.fillStyle = mix([46, 18, 14], FOG, f * 0.85);
      ctx.fill();
      ctx.save();
      ctx.clip();
      // warm interior light
      const [gx, gy] = gp(x, 0.9, z0 + span / 2);
      const gr = cam.LW * sOf(z0 + span / 2) * 1.3;
      ctx.globalAlpha = 0.75 * (1 - f * 0.6);
      ctx.drawImage(sprites.glow, gx - gr, gy - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      if (type === 0 || type === 5) {
        // counter with spice mounds / fabric rolls
        ctx.fillStyle = mix([110, 62, 34], FOG, f);
        wallQuad(ctx, x, z0, z1, 0, 0.42);
        const cols = type === 0 ? ['#e03131', '#fab005', '#e8590c', '#2f9e44', '#c2255c'] : ['#7048e8', '#d6336c', '#1c7ed6', '#fcc419', '#2f9e44'];
        const n = 4;
        for (let i = 0; i < n; i++) {
          const za = z0 + span * (0.08 + (i * 0.84) / n);
          const zb = za + (span * 0.84) / n - span * 0.03;
          ctx.fillStyle = mix(hex(cols[(h >>> (i * 3)) % cols.length]), FOG, f * 0.8);
          if (type === 0) {
            const a = gp(x, 0.42, za);
            const b = gp(x, 0.74, (za + zb) / 2);
            const c = gp(x, 0.42, zb);
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.quadraticCurveTo(b[0], b[1] - (c[1] - a[1]) * 0.1, c[0], c[1]);
            ctx.closePath();
            ctx.fill();
          } else wallQuad(ctx, x, za, zb, 0.42, 0.62 + ((h >>> i) & 1) * 0.12);
        }
      } else if (type === 1) {
        // hanging carpets
        const cols = ['#a61e4d', '#1864ab', '#862e9c', '#c92a2a'];
        for (let i = 0; i < 3; i++) {
          const za = z0 + span * (0.1 + i * 0.29);
          const zb = za + span * 0.24;
          ctx.fillStyle = mix(hex(cols[(h >>> (i * 2)) % cols.length]), FOG, f * 0.8);
          wallQuad(ctx, x, za, zb, 0.18, 1.25);
          ctx.fillStyle = mix([240, 200, 110], FOG, f * 0.8);
          wallQuad(ctx, x, za + (zb - za) * 0.35, zb - (zb - za) * 0.35, 0.5, 0.95);
        }
      } else if (type === 2) {
        // lamp shop: glowing lanterns
        for (let i = 0; i < 3; i++) {
          const zz = z0 + span * (0.22 + i * 0.28);
          const [lx, ly] = gp(x, 1.05 - (i % 2) * 0.22, zz);
          const r = cam.LW * sOf(zz) * 0.32;
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(sprites.glow, lx - r, ly - r, r * 2, r * 2);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = ['#ffd43b', '#ff8787', '#69db7c'][i];
          const lr = r * 0.22;
          ctx.fillRect(lx - lr * 0.7, ly - lr, lr * 1.4, lr * 2);
        }
      } else {
        // pottery
        for (let i = 0; i < 4; i++) {
          const zz = z0 + span * (0.16 + i * 0.22);
          const sc = sOf(zz);
          const [px, py] = gp(x, 0.2, zz);
          ctx.fillStyle = mix(i % 2 ? [196, 98, 58] : [214, 140, 72], FOG, f * 0.8);
          ellipse(ctx, px, py, cam.LW * sc * 0.07, cam.LW * sc * 0.2);
        }
      }
      ctx.restore();
      // awning
      if (type !== 2 && (h >>> 7) % 3 !== 0) {
        const [c1, c2] = AWNINGS[(h >>> 9) % AWNINGS.length];
        const n = 6;
        const xi = x - side * 0.55;
        for (let i = 0; i < n; i++) {
          const za = z0 - 0.1 + ((span + 0.2) * i) / n;
          const zb = z0 - 0.1 + ((span + 0.2) * (i + 1)) / n;
          ctx.fillStyle = i % 2 ? c1 : c2;
          ctx.globalAlpha = 1 - f * 0.7;
          quad(ctx, gp(x, 2.06, za), gp(x, 2.06, zb), gp(xi, 1.76, zb), gp(xi, 1.76, za));
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(60,20,10,${0.35 * (1 - f)})`;
        quad(ctx, gp(xi, 1.76, z0 - 0.1), gp(xi, 1.76, z1 + 0.1), gp(xi, 1.7, z1 + 0.1), gp(xi, 1.7, z0 - 0.1));
      }
    }
    function hex(h) {
      const n = parseInt(h.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function drawWalls(ctx, st) {
      const zA = 1.2;
      const zB = Z_FAR + 0.6;
      const k0 = Math.floor((st.dist + zA) / ARCH_P);
      const k1 = Math.floor((st.dist + zB) / ARCH_P);
      for (const side of [-1, 1]) {
        const x = side * WALL_X;
        for (let k = k1; k >= k0; k--) {
          const z0 = k * ARCH_P - st.dist;
          const za = Math.max(zA, z0);
          const zb = Math.min(zB, z0 + ARCH_P);
          if (zb <= za) continue;
          const f = fogK((za + zb) / 2);
          ctx.fillStyle = mix(WALL_C, FOG, f);
          wallQuad(ctx, x, za, zb + 0.02, 0, WALL_H);
          ctx.fillStyle = mix(WALL_D, FOG, f);
          wallQuad(ctx, x, za, zb + 0.02, 0, 0.16);
          ctx.fillStyle = mix(WALL_T, FOG, f);
          wallQuad(ctx, x, za, zb + 0.02, WALL_H - 0.14, WALL_H);
          // crenellations on top
          ctx.fillStyle = mix(WALL_C, FOG, f);
          for (let m = 0; m < 4; m++) {
            const ma = z0 + (m * ARCH_P) / 4 + 0.15;
            const mb = ma + ARCH_P / 8;
            if (ma > zA && mb < zB) wallQuad(ctx, x, ma, mb, WALL_H, WALL_H + 0.16);
          }
          const oz0 = z0 + 0.5;
          const oz1 = z0 + ARCH_P - 0.5;
          if (oz0 > zA - 0.3 && oz1 < zB + 1) drawShop(ctx, side, k, Math.max(oz0, zA), oz1, f);
          // lantern on the pillar
          if (z0 > zA && z0 < zB) {
            const sc = sOf(z0);
            const [lx, ly] = gp(x - side * 0.06, 1.95, z0);
            const r = cam.LW * sc * 0.5;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.8 * (1 - f * 0.5);
            ctx.drawImage(sprites.glow, lx - r, ly - r, r * 2, r * 2);
            const [px, py] = gp(x - side * 0.7, 0, z0);
            ctx.globalAlpha = 0.35 * (1 - f);
            ctx.drawImage(sprites.glow, px - r * 1.4, py - r * 0.35, r * 2.8, r * 0.7);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            const lw = cam.LW * sc * 0.07;
            ctx.fillStyle = '#4a2a12';
            ctx.fillRect(lx - lw * 0.15, ly - lw * 2.2, lw * 0.3, lw * 1.2);
            ctx.fillStyle = '#ffd08a';
            ctx.beginPath();
            ctx.moveTo(lx, ly - lw * 1.1);
            ctx.lineTo(lx + lw * 0.7, ly);
            ctx.lineTo(lx, ly + lw * 1.1);
            ctx.lineTo(lx - lw * 0.7, ly);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      // haze where the street disappears
      if (haze) {
        const hh = cam.LW * S_MIN * WALL_H * 1.2;
        ctx.fillStyle = haze;
        ctx.fillRect(0, cam.fogY - hh, cam.W, hh * 1.5);
      }
    }

    // ---------------------------------------------------------- entities
    function drawGate(ctx, g, z, st) {
      let a = clamp((Z_FAR - z) / 1.8, 0, 1);
      if (z < 0) a *= clamp(1 + z / 0.55, 0, 1);
      if (a <= 0.01) return;
      const f = fogK(z);
      ctx.globalAlpha = a;
      // back face (gives the gate thickness)
      const facade = (zz, fill, stroke) => {
        const sc = sOf(zz);
        const k = cam.LW * sc;
        ctx.save();
        ctx.translate(PX(0, sc), PY(0, sc));
        ctx.scale(k, -k);
        ctx.beginPath();
        ctx.moveTo(-GATE.half, 0);
        ctx.lineTo(-GATE.half, GATE.sideTop);
        ctx.lineTo(-GATE.midHalf, GATE.sideTop);
        ctx.lineTo(-GATE.midHalf, GATE.midTop);
        ctx.lineTo(GATE.midHalf, GATE.midTop);
        ctx.lineTo(GATE.midHalf, GATE.sideTop);
        ctx.lineTo(GATE.half, GATE.sideTop);
        ctx.lineTo(GATE.half, 0);
        ctx.closePath();
        for (const pts of ARCH_OPEN) {
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.closePath();
        }
        ctx.fillStyle = fill;
        ctx.fill('evenodd');
        if (stroke) {
          ctx.lineWidth = 0.03;
          ctx.strokeStyle = stroke;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
        ctx.restore();
        return { sc, k };
      };
      facade(z + 0.32, mix(SAND_D, FOG, f * 0.8));
      const { sc, k } = facade(z, mix(SAND, FOG, f * 0.7), mix([92, 42, 18], FOG, f * 0.7));
      // decoration in world space
      ctx.save();
      ctx.translate(PX(0, sc), PY(0, sc));
      ctx.scale(k, -k);
      ctx.fillStyle = mix([24, 120, 130], FOG, f * 0.7);
      ctx.fillRect(-GATE.half, GATE.sideTop - 0.11, GATE.half - GATE.midHalf, 0.08);
      ctx.fillRect(GATE.midHalf, GATE.sideTop - 0.11, GATE.half - GATE.midHalf, 0.08);
      ctx.fillRect(-GATE.midHalf, GATE.midTop - 0.12, GATE.midHalf * 2, 0.08);
      // stepped merlons
      ctx.fillStyle = mix(SAND, FOG, f * 0.7);
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const mx = sx * (GATE.midHalf + 0.1 + i * 0.28);
          ctx.fillRect(mx - 0.08, GATE.sideTop, 0.16, 0.12);
          ctx.fillRect(mx - 0.04, GATE.sideTop + 0.12, 0.08, 0.06);
        }
      }
      // dome with crescent finial over the central arch
      ctx.fillStyle = mix([47, 158, 110], FOG, f * 0.7);
      ctx.beginPath();
      ctx.ellipse(0, GATE.midTop, 0.3, 0.3, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = mix([255, 212, 59], FOG, f * 0.6);
      ctx.fillRect(-0.015, GATE.midTop + 0.28, 0.03, 0.1);
      ctx.beginPath();
      ctx.arc(0, GATE.midTop + 0.44, 0.07, 0, TAU);
      ctx.fill();
      ctx.restore();
      // plaques + Arabic labels (screen space)
      if (!g.words) {
        ctx.globalAlpha = 1;
        return;
      }
      const sel = st.lane;
      const res = g.resolved;
      const L = signLayout(g);
      for (let i = 0; i < 3; i++) {
        const p = GATE.plq[i];
        const cx = PX(p.cx, sc);
        const cy = PY(p.cy, sc);
        const pw = p.w * k;
        const ph = L.h * k;
        let fill = '#fff3dc';
        let text = '#2b1206';
        let border = mix([122, 59, 18], FOG, f * 0.5);
        let bw = Math.max(1, k * 0.035);
        if (res) {
          if (i === g.correctLane) (fill = '#2fb344'), (text = '#fff'), (border = '#b2f2bb');
          else if (i === g.choice) (fill = '#e03131'), (text = '#fff'), (border = '#ffc9c9');
          else (fill = '#d9c7a7'), (text = '#6b5a45');
        } else if (i === sel && z < Z_FAR * 0.8) {
          border = '#ff4d8d';
          bw = Math.max(2, k * 0.06);
          // soft pink glow behind the sign Dubbi is heading for
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.55;
          ctx.drawImage(sprites.white, cx - pw * 0.75, cy - ph * 1.1, pw * 1.5, ph * 2.2);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = a;
        }
        ctx.fillStyle = 'rgba(40,12,4,0.35)';
        roundRect(ctx, cx - pw / 2, cy - ph / 2 + Math.max(1, k * 0.04), pw, ph, Math.min(ph, p.h * k) * 0.22);
        ctx.fill();
        ctx.fillStyle = fill;
        roundRect(ctx, cx - pw / 2, cy - ph / 2, pw, ph, Math.min(ph, p.h * k) * 0.22);
        ctx.fill();
        ctx.lineWidth = bw;
        ctx.strokeStyle = border;
        ctx.stroke();
        const it = L.items[i];
        const size = it.size * k;
        if (size >= 5) {
          ctx.font = `700 ${size}px ${AR_FONT}`;
          ctx.direction = 'rtl';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = text;
          if (it.lines.length === 1) ctx.fillText(it.lines[0], cx, cy + size * 0.06);
          else {
            const lh = size * 1.08;
            ctx.fillText(it.lines[0], cx, cy - lh / 2 + size * 0.06);
            ctx.fillText(it.lines[1], cx, cy + lh / 2 + size * 0.06);
          }
          ctx.direction = 'ltr';
        }
        if (res && (i === g.correctLane || i === g.choice)) {
          ctx.font = `800 ${Math.max(10, p.h * k * 0.6)}px ${UI_FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = i === g.correctLane ? '#2fb344' : '#e03131';
          ctx.lineWidth = Math.max(2, p.h * k * 0.12);
          ctx.strokeStyle = '#fff';
          const mark = i === g.correctLane ? '✓' : '✗';
          const my = cy - ph / 2 - p.h * k * 0.45;
          ctx.strokeText(mark, cx, my);
          ctx.fillText(mark, cx, my);
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawShadow(ctx, x, z, w, d) {
      const sc = sOf(z + d / 2);
      ctx.fillStyle = 'rgba(40,14,6,0.35)';
      ellipse(ctx, PX(x, sc), PY(0, sc), (w / 2) * cam.LW * sc * 1.05, Math.max(1, cam.LW * sc * 0.08));
    }

    function drawObstacle(ctx, o, z, t) {
      const T = OBS[o.type];
      const knock = o.hit ? clamp((t - o.hitT) / 0.5, 0, 1) : 0;
      const x = o.lane - 1 + (o.hit ? o.kdir * (0.2 + 0.9 * knock) : 0);
      const a = clamp((Z_FAR - z) / 1.6, 0, 1) * (1 - knock);
      if (a <= 0.01) return;
      const f = fogK(z);
      ctx.globalAlpha = a;
      drawShadow(ctx, x, z, T.w, T.d);
      if (o.type === 'crate') {
        const fr = box(ctx, x, 0, z, T.w, T.h, T.d, mix([176, 122, 62], FOG, f * 0.7), mix([214, 160, 96], FOG, f * 0.7), mix([130, 86, 42], FOG, f * 0.7));
        const [x0, x1, y0, y1] = fr;
        const lw = Math.max(1, (x1 - x0) * 0.07);
        ctx.strokeStyle = mix([105, 64, 28], FOG, f * 0.7);
        ctx.lineWidth = lw;
        ctx.strokeRect(x0 + lw / 2, y1 + lw / 2, x1 - x0 - lw, y0 - y1 - lw);
        ctx.beginPath();
        ctx.moveTo(x0 + lw, y0 - lw);
        ctx.lineTo(x1 - lw, y1 + lw);
        ctx.stroke();
      } else if (o.type === 'cart') {
        const s0 = sOf(z);
        // wheels
        ctx.fillStyle = '#3b2314';
        for (const wx of [-0.3, 0.3]) {
          const [px, py] = gp(x + wx, 0.17, z + 0.15);
          ellipse(ctx, px, py, cam.LW * s0 * 0.06, cam.LW * s0 * 0.17);
        }
        box(ctx, x, 0.2, z, T.w, 0.34, T.d, mix([43, 122, 155], FOG, f * 0.7), mix([95, 176, 201], FOG, f * 0.7), mix([29, 88, 112], FOG, f * 0.7));
        ctx.fillStyle = mix([224, 49, 49], FOG, f * 0.7);
        const [r0x, r0y] = gp(x - T.w / 2, 0.44, z);
        const [r1x] = gp(x + T.w / 2, 0.44, z);
        ctx.fillRect(r0x, r0y, r1x - r0x, Math.max(1, cam.LW * s0 * 0.04));
        // parasol pole + canopy
        const [p0x, p0y] = gp(x, 0.54, z + 0.75);
        const [, p1y] = gp(x, 1.18, z + 0.75);
        ctx.fillStyle = '#5c3a1a';
        ctx.fillRect(p0x - Math.max(1, cam.LW * s0 * 0.015), p1y, Math.max(2, cam.LW * s0 * 0.03), p0y - p1y);
        // fruit pile
        const rnd = mulberry32(o.seed);
        const fruitCols = [[255, 146, 43], [224, 49, 49], [47, 158, 68], [252, 196, 25], [255, 146, 43]];
        for (const [dz2, n] of [[0.72, 4], [0.42, 5], [0.18, 4]]) {
          const sc = sOf(z + dz2);
          for (let i = 0; i < n; i++) {
            const fx2 = x - 0.3 + (0.6 * (i + 0.5)) / n + (rnd() - 0.5) * 0.05;
            const [px, py] = gp(fx2, 0.6 + rnd() * 0.06, z + dz2);
            const r = cam.LW * sc * (0.075 + rnd() * 0.03);
            ctx.fillStyle = mix(fruitCols[(rnd() * fruitCols.length) | 0], FOG, f * 0.7);
            ellipse(ctx, px, py, r, r);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ellipse(ctx, px - r * 0.3, py - r * 0.35, r * 0.3, r * 0.22);
          }
        }
        // parasol (striped dome)
        const sc = sOf(z + 0.75);
        const [cx, cy] = gp(x, 1.16, z + 0.75);
        const rw = cam.LW * sc * 0.55;
        const rh = cam.LW * sc * 0.24;
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 ? '#fff4e6' : mix([214, 51, 108], FOG, f * 0.6);
          ctx.beginPath();
          ctx.moveTo(cx, cy - rh);
          ctx.lineTo(cx - rw + (2 * rw * i) / 6, cy);
          ctx.lineTo(cx - rw + (2 * rw * (i + 1)) / 6, cy);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(80,10,30,0.35)';
        ctx.fillRect(cx - rw, cy, rw * 2, Math.max(1, rh * 0.12));
      } else {
        const sc = sOf(z + 0.3);
        const size = cam.LW * sc * 1.12;
        const [px, py] = gp(x, 0, z + 0.3);
        ctx.save();
        ctx.translate(px, py);
        if (o.hit) ctx.rotate(o.kdir * knock * 0.9);
        if (o.flip) ctx.scale(-1, 1);
        ctx.drawImage(sprites.camel, -size / 2, -size * 0.93, size, size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function drawCoin(ctx, c, z, t, st) {
      const a = clamp((Z_FAR - z) / 1.6, 0, 1);
      if (a <= 0.01) return;
      const sc = sOf(z);
      // under a magnet, coins close by curve in towards Dubbi's lane
      const pull = st.magnetT > 0 && !c.heart && !c.magnet ? clamp(1 - z / MAGNET_Z, 0, 1) : 0;
      const x = lerp(c.lane - 1, st.px, pull * pull);
      const r = cam.LW * sc * 0.15;
      const [px, py] = gp(x, 0.34 + Math.sin(t * 4 + c.zw) * 0.03, z);
      const spin = Math.cos(t * 5 + c.zw * 1.3);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(40,14,6,0.28)';
      ellipse(ctx, PX(x, sc), PY(0, sc), r * 0.8, r * 0.22);
      if (c.heart || c.magnet) {
        const hr = r * (1.9 + Math.sin(t * 7) * 0.15);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(sprites.glow, px - hr * 1.3, py - hr * 1.3, hr * 2.6, hr * 2.6);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(c.heart ? sprites.heart : sprites.magnet, px - hr, py - hr, hr * 2, hr * 2);
        ctx.globalAlpha = 1;
        return;
      }
      const w = Math.max(0.18, Math.abs(spin));
      ctx.drawImage(sprites.coin, px - r * w, py - r, r * 2 * w, r * 2);
      ctx.globalAlpha = 1;
    }

    function drawDubbi(ctx, st) {
      const img = imgs[st.mood] ?? imgs.happy;
      const x = PX(st.px, 1);
      const gy = cam.baseY;
      const h = cam.LW * DUBBI_H;
      const jy = jumpY(st) * cam.LW;
      ctx.fillStyle = 'rgba(30,8,4,0.38)';
      const shk = 1 - Math.min(0.5, jy / (cam.LW * 1.4));
      ellipse(ctx, x, gy - 1, h * 0.3 * shk, h * 0.06 * shk);
      if (!img || !img.naturalWidth) return;
      const blink = st.invulnT > 0 && Math.floor(st.invulnT * 12) % 2 === 0;
      ctx.save();
      if (blink) ctx.globalAlpha = 0.35;
      const running = st.phase === 'run' || (st.phase === 'over' && st.overT < 0.6);
      const ph = st.runPhase;
      const air = st.jumpT >= 0;
      const bob = running && !air ? Math.abs(Math.sin(ph)) * h * (rm ? 0.012 : 0.035) : 0;
      let rot = st.lean * 0.16;
      if (st.bumpT > 0) rot += st.bumpDir * 0.12 * Math.sin((st.bumpT / 0.18) * Math.PI);
      if (st.phase === 'over') rot += -0.25 * Math.min(1, st.overT / 0.5);
      const sq = st.squash * 0.09;
      ctx.translate(x, gy - jy - bob);
      ctx.rotate(rot);
      ctx.scale(1 + sq, 1 - sq);
      const k = h / 150; // screen px per viewBox unit
      const sc = img.naturalWidth / 120; // image px per viewBox unit
      const part = (vx, vy, vw, vh, lift) =>
        ctx.drawImage(img, vx * sc, vy * sc, vw * sc, vh * sc, (vx - 60) * k, (vy - 147 - lift) * k, vw * k, vh * k);
      const stride = rm ? 3 : 8;
      const liftL = air ? 6 : running ? Math.max(0, Math.sin(ph)) * stride : 0;
      const liftR = air ? 6 : running ? Math.max(0, -Math.sin(ph)) * stride : 0;
      part(24, 116, 36, 31, liftL);
      part(60, 116, 36, 31, liftR);
      part(0, 0, 120, 128, 0);
      ctx.restore();
    }

    function drawParticles(ctx, st) {
      for (const p of st.parts) {
        if (p.kind === 'fly') {
          if (p.t < 0) continue;
          const u = clamp(p.t / p.dur, 0, 1);
          const e = u * u * (3 - 2 * u);
          const x = lerp(p.x, p.tx, e);
          const y = lerp(p.y, p.ty, e) - Math.sin(u * Math.PI) * 40;
          const r = p.size * (1 - u * 0.4);
          ctx.globalAlpha = 1 - u * 0.3;
          ctx.drawImage(sprites.coin, x - r, y - r, r * 2, r * 2);
          continue;
        }
        const a = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.kind === 'confetti' || p.kind === 'shard') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * (p.kind === 'shard' ? 0.45 : 0.6));
          ctx.restore();
        } else if (p.kind === 'dust') {
          ctx.globalAlpha = a * 0.6;
          ellipse(ctx, p.x, p.y, p.size * (1.6 - a * 0.6), p.size * (1.1 - a * 0.4));
        } else ellipse(ctx, p.x, p.y, p.size / 2, p.size / 2);
      }
      ctx.globalAlpha = 1;
    }

    function drawFloaters(ctx, st) {
      for (const f of st.floaters) {
        const u = f.t / f.life;
        const a = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
        const sc = f.pop && !rm ? (u < 0.15 ? 0.6 + (u / 0.15) * 0.55 : u < 0.3 ? 1.15 - ((u - 0.15) / 0.15) * 0.15 : 1) : 1;
        ctx.globalAlpha = clamp(a, 0, 1);
        const size = f.size * sc;
        ctx.font = `${f.weight} ${size}px ${f.font}`;
        ctx.direction = /[؀-ۿ]/.test(f.text) ? 'rtl' : 'ltr';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, size * 0.16);
        ctx.strokeStyle = f.stroke;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
        ctx.direction = 'ltr';
      }
      ctx.globalAlpha = 1;
    }

    function drawSpeedLines(ctx, st) {
      if (rm || st.phase !== 'run') return;
      const k = clamp((st.speed / V0 - 1.2) / 0.6, 0, 1);
      if (k <= 0) return;
      ctx.strokeStyle = `rgba(255,240,220,${0.18 * k})`;
      ctx.lineWidth = 2;
      const t = st.time;
      for (let i = 0; i < 8; i++) {
        const side = i % 2 ? 1 : -1;
        const u = (t * 1.8 + i * 0.37) % 1;
        const y = cam.fogY + (cam.H - cam.fogY) * (0.2 + ((i * 0.13) % 0.6)) + u * 60;
        const x = cam.cx + side * (cam.W * 0.36 + u * cam.W * 0.2);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + side * (20 + 40 * u), y + 18 + 30 * u);
        ctx.stroke();
      }
    }

    function drawHints(ctx, st) {
      if (!s || !s.tip || st.phase !== 'run') return;
      const a = 0.35 + 0.25 * Math.sin(st.time * 5);
      const y = cam.baseY - cam.LW * 0.45;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(cam.LW * 0.42)}px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (st.lane > 0) ctx.fillText('‹', 22, y);
      if (st.lane < 2) ctx.fillText('›', cam.W - 22, y);
      ctx.globalAlpha = 1;
    }

    function render() {
      if (destroyed || !cv) return;
      const { ctx } = cv;
      const st = s ?? idle;
      const W = cam.W;
      const H = cam.H;
      ctx.save();
      if (fx.shakeT > 0 && !rm) {
        const m = fx.shakeMag * (fx.shakeT / fx.shakeDur);
        ctx.translate((Math.random() - 0.5) * m * 2, (Math.random() - 0.5) * m * 2);
      }
      ctx.fillStyle = '#ff9a5c';
      ctx.fillRect(-20, -20, W + 40, H + 40);
      if (sky) ctx.drawImage(sky, -SKY_PAD - cam.camX * 10, 0, W + SKY_PAD * 2, sky.height / cv.dpr);
      drawGround(ctx, st);
      drawWalls(ctx, st);
      // entities, far to near, with Dubbi at z = 0
      const list = [];
      for (const g of st.gates) {
        const z = g.zw - st.dist;
        if (z < Z_FAR + 0.5 && z > Z_GONE) list.push({ z, t: 0, o: g });
      }
      for (const o of st.obs) {
        if (o.hit && !(o.hitT != null && st.time - o.hitT < 0.5)) continue;
        const z = o.zw - st.dist;
        if (z < Z_FAR + 0.5 && z > -2) list.push({ z: z + 0.001, t: 1, o });
      }
      for (const c of st.coinList) {
        if (c.got) continue;
        const z = c.zw - st.dist;
        if (z < Z_FAR + 0.5 && z > -1.2) list.push({ z: z + 0.002, t: 2, o: c });
      }
      list.sort((a, b) => b.z - a.z);
      let drewDubbi = false;
      for (const it of list) {
        if (!drewDubbi && it.z < 0.05) {
          drawDubbi(ctx, st);
          drewDubbi = true;
        }
        if (it.t === 0) drawGate(ctx, it.o, it.z, st);
        else if (it.t === 1) drawObstacle(ctx, it.o, it.z, st.time);
        else drawCoin(ctx, it.o, it.z, st.time, st);
      }
      if (!drewDubbi) drawDubbi(ctx, st);
      drawSpeedLines(ctx, st);
      drawParticles(ctx, st);
      ctx.restore();
      drawFloaters(ctx, st);
      drawHints(ctx, st);
      if (fx.flashT > 0) {
        ctx.fillStyle = `rgba(${fx.flashCol},${fx.flashA * fx.flashT})`;
        ctx.fillRect(0, 0, W, H);
      }
      // (the vignette is a CSS overlay: .rs-vig)
    }

    // ---------------------------------------------------------- lifecycle
    ready = true;
    layout(cv.w, cv.h);

    function reset() {
      ptrs.clear();
      fx.shakeT = 0;
      fx.flashT = 0;
      cam.camX = 0;
      hideReveal();
      $tip.classList.remove('on');
    }

    return {
      start(opts) {
        reset();
        s = {
          pool: opts.pool,
          byPC: new Map(),
          byPos: new Map(),
          rng: opts.rng,
          lrng: mulberry32(((opts.seed ?? 1) ^ 0x5bd1e995) >>> 0),
          deck: [],
          deckI: 0,
          queue: [],
          recent: [],
          requeued: new Map(),
          lastLanes: [],
          lastHeartIdx: 0,
          lastMagnetIdx: 0,
          magnetT: 0,
          gateSeq: 0,
          gateCount: 0,
          score: 0,
          lives: MAX_LIVES,
          correct: 0,
          wrongs: 0,
          gatesDone: 0,
          streak: 0,
          bestStreak: 0,
          coins: 0,
          coinChain: 0,
          lastCoinT: -9,
          hits: 0,
          hitHelp: false,
          missed: [],
          log: [],
          time: 0,
          runT: 0,
          dist: 0,
          speed: speedAt(0),
          lane: 1,
          px: 0,
          laneFrom: 0,
          laneT: 1,
          lean: 0,
          squash: 0,
          bumpT: 0,
          bumpDir: 0,
          jumpT: -1,
          drop: false,
          runPhase: 0,
          dustT: 0,
          invulnT: 0,
          mood: 'happy',
          moodT: 0,
          gates: [],
          obs: [],
          coinList: [],
          parts: [],
          floaters: [],
          slowT: 0,
          pending: 0,
          revealUntil: 0,
          revealKind: '',
          tipUntil: 0,
          phase: 'run',
          overT: 0,
          ended: false,
          auto: null,
          autoCool: 0,
          tip: true,
          tipMoves: 0,
        };
        for (const w of s.pool) {
          for (const [m, k] of [[s.byPC, `${w.pos}|${w.cat}`], [s.byPos, w.pos]]) {
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(w);
          }
        }
        s.deck = buildDeck();
        const g1 = makeGate(Z_FAR + V0 * 1.3);
        fillGate(g1);
        genSegment(0, g1.zw, 0);
        scheduleNext();
        setBanner(g1);
        kit.hud.score(0);
        kit.hud.lives(MAX_LIVES, MAX_LIVES);
        kit.hud.extra('');
        showTip(kit.isTouch ? '👆 Swipe ← → to change lane · ↑ jump' : '⌨️ ← → change lane · ↑ jump');
        loop.start();
      },
      stop() {
        loop.stop();
        s = null;
        reset();
        setBanner(null);
        render();
      },
      pause() {
        loop.stop();
        ptrs.clear();
      },
      resume() {
        if (s && !s.ended) loop.start();
      },
      destroy() {
        destroyed = true;
        loop.stop();
        s = null;
        root.removeEventListener('pointerdown', onDown);
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerup', onUp);
        root.removeEventListener('pointercancel', onUp);
        root.removeEventListener('contextmenu', noMenu);
        document.removeEventListener('keydown', onKey);
        cv.destroy();
        root.remove();
        style.remove();
      },
    };
  },
};
