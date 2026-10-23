// Flappy Dubbi — Flappy Bird with Libyan Arabic words.
// Dubbi flaps past the Tripoli skyline through pairs of Leptis Magna columns.
// Every obstacle has TWO openings, each labelled with an Arabic word, and the
// banner shows the English meaning of the target for the NEXT obstacle (it
// switches the moment the previous one is passed, so there is time to read).
// Fly through the matching opening to score. The wrong opening, a column or
// the ground ends the run (one hit, true to Flappy Bird) and reveals the
// answer. The word that ended a run comes back early in the next one.
// Physics run in a normalised world (WORLD_H units tall) scaled to the stage.
// Contract: see ./README.md.
import { setupCanvas, createLoop, drawText, roundRect, dubbiImage, fontsReady, AR_FONT, UI_FONT, clamp, lerp, shortLabel, mulberry32, localBest, LEVELS } from './common.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ world
const WORLD_H = 640; // world units always visible vertically
const MIN_WORLD_W = 360; // narrower stages show extra sky/ground instead
const GROUND_Y = 580; // top of the paving
const HZ = 440; // sea horizon
const G = 1900; // gravity (units/s²)
const FLAP_V = -470; // flap impulse → a hop of ~58 units
const MAX_FALL = 820;
const JUMP = (FLAP_V * FLAP_V) / (2 * G);
// Hitbox: a head circle and a body circle along Dubbi's axis (a bit smaller than the art).
const HEAD = { dy: -10, r: 14 };
const BODY = { dy: 12, r: 10 };
const EXT_TOP = 24; // hitbox extent above / below the centre when upright
const EXT_BOT = 22;
const DUBBI_H = 62; // drawn height
const CROP = 146.6; // mascot viewBox rows drawn (leaves out its ground shadow)
const DUBBI_W = (DUBBI_H * 120) / CROP;
const PIVOT_Y = 76; // viewBox row that sits on the physics centre
const DUBBI_TOP = (PIVOT_Y / CROP) * DUBBI_H; // drawn extent above the centre
const CW = 72; // column shaft width
const OV = 7; // capital overhang on each side
const CAP_H = 22; // capital height at each opening
const SUB = 1 / 120; // physics sub-step
const BANNER_TOP = 8; // px, must match the CSS
const BANNER_H = 62;
const END_DELAY = 2.2; // seconds from crash to the game-over screen
const MOODS = ['happy', 'wow', 'sad', 'cheer'];

// Tiles (world units) for the parallax layers.
const TILE_CLOUD = 1000;
const TILE_FAR = 900;
const TILE_SEA = 600;
const TILE_NEAR = 760;
const TILE_GROUND = 96;
const SHAFT_TILE = 120;

// ------------------------------------------------------------------ difficulty
const ramp = (n) => clamp(n / 25, 0, 1);
const late = (n) => clamp((n - 25) / 20, 0, 1);
/** Scroll speed (units/s) after n obstacles. */
const speedFor = (n) => (n < 3 ? 138 : Math.min(215, 150 + (n - 3) * 3.2)) + 20 * late(n);
/** Height of each opening for obstacle n. */
const gapFor = (n) => lerp(176, 138, ramp(n)) - 10 * late(n);
/** Seconds between obstacles: reading time for the next prompt. */
const leadFor = (n) => lerp(2.75, 1.95, ramp(n)) - 0.1 * late(n);

const MEDALS = [
  { at: 40, emoji: '💎', name: 'Platinum' },
  { at: 30, emoji: '🥇', name: 'Gold' },
  { at: 20, emoji: '🥈', name: 'Silver' },
  { at: 10, emoji: '🥉', name: 'Bronze' },
];
const medalFor = (n) => MEDALS.find((m) => n >= m.at) ?? null;
/** Share grid: rows of ten 🟩 (one per word, so medals line up with rows), ending in 💥. */
function shareGrid(score) {
  const shown = Math.min(score, 40);
  const rows = [];
  for (let i = 0; i < shown; i += 10) rows.push('🟩'.repeat(Math.min(10, shown - i)));
  const end = score > shown ? `+${score - shown} 💥` : '💥';
  if (rows.length && shown % 10 && score === shown) rows[rows.length - 1] += end;
  else rows.push(end);
  return rows.join('\n');
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Banner icon: a topic badge for concrete topics only, chosen to read as a
// category rather than one thing (🐾 not 🐪, 🍽️ not 🍲). Verbs, grammar words,
// adjectives, feelings and abstract words get the neutral column, so no icon
// looks like a picture clue (🏃 beside "to eat", 😊 beside "sad").
const NEUTRAL_EMOJI = '🏛️';
const CAT_EMOJI = {
  questions: '❓', time: '🕒', numbers: '🔢', greetings: '👋', people: '🧑', family: '👨‍👩‍👧', body: '🧍', health: '🩺',
  clothing: '👕', home: '🏠', food: '🍽️', drink: '🥤', kitchen: '🍳', shopping: '🛍️', colors: '🎨', city: '🏙️',
  travel: '🧳', nature: '🌿', animals: '🐾', work: '💼', school: '🎒', tech: '📱', tools: '🧰', cars: '🚗',
  agriculture: '🌾', media: '📺', sports: '🏟️', measures: '📏',
};

// ------------------------------------------------------------------ words
// English words that the deck's glosses use for the same idea, so that, say,
// أهلا "hi" is never paired with ألو "hello" or أم "mother" with ماما "mum".
const SYNONYM = {
  hi: 'hello', hey: 'hello', thanks: 'thank you', bye: 'goodbye', yeah: 'yes', okay: 'ok',
  mum: 'mother', mom: 'mother', mama: 'mother', dad: 'father', daddy: 'father', papa: 'father', kid: 'child',
  cash: 'money', exhausted: 'tired', issue: 'problem', trouble: 'problem', street: 'road', inside: 'in',
  end: 'finish', since: 'because', huge: 'big', large: 'big', tiny: 'small', little: 'small',
};
/**
 * All English senses of a word, normalised for "same meaning" checks:
 * notes in brackets, punctuation and hyphens become spaces ("good-hearted" →
 * "good hearted", "welcome!" → "welcome", "to wake (someone) up" → "wake up"),
 * a leading to/a/an/the is dropped unless it is the whole sense (لـ "to"),
 * and common synonyms are mapped to one word.
 */
const senses = (w) =>
  String(w.en)
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/\([^)]*\)/g, ' ')
    .split(/[;,/?!]/)
    .map((raw) => {
      const bare = raw.replace(/[.…"“”:]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
      const core = bare.replace(/^(to|a|an|the) (?=\S)/, '') || bare;
      return core
        .split(' ')
        .map((t) => (Object.hasOwn(SYNONYM, t) ? SYNONYM[t] : t))
        .join(' ');
    })
    .filter(Boolean);
const nearSense = (a, b) => a === b || b.startsWith(`${a} `) || b.endsWith(` ${a}`) || a.startsWith(`${b} `) || a.endsWith(` ${b}`);
/** True if two words share an English sense (offering both would be unfair). */
const clash = (a, b) => {
  const sa = senses(a);
  return senses(b).some((x) => sa.some((y) => nearSense(x, y)));
};
const ABBR = { 'm.': 'masculine', 'f.': 'feminine', 'sg.': 'singular', 'pl.': 'plural', 'lit.': 'literally', 'esp.': 'especially', 'sth': 'something', 'sb': 'someone' };
/** "m. sg." → "masculine singular" so the prompt note reads naturally. */
const expandAbbr = (t) => t.replace(/(?<![\w.])(m\.|f\.|sg\.|pl\.|lit\.|esp\.|sth|sb)(?![\w])/g, (m) => ABBR[m] ?? m);
/** Small disambiguating line under the prompt: "(m. sg.)" notes and other senses. */
function promptHint(w, main) {
  const parts = String(w.en)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const paren = (parts[0]?.match(/\(([^)]*)\)/) ?? [])[1];
  const others = parts
    .slice(1)
    .map((p) => p.replace(/\s*\([^)]*\)/g, '').trim())
    .filter((p) => p && p.toLowerCase() !== main.toLowerCase());
  const bits = [];
  if (paren) bits.push(expandAbbr(paren));
  if (others.length) bits.push(`also “${others.slice(0, 2).join('”, “')}”`);
  return bits.join(' · ');
}

// ------------------------------------------------------------------ geometry
const circleRect = (cx, cy, r, x0, y0, x1, y1) => {
  const dx = cx - clamp(cx, x0, x1);
  const dy = cy - clamp(cy, y0, y1);
  return dx * dx + dy * dy < r * r;
};

// ------------------------------------------------------------------ background art
// Every painter draws in world units onto a context already scaled to device px.

/** Offscreen canvas covering world x 0..w and y y0..y1. */
function layer(w, y0, y1, sc, paint) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * sc));
  c.height = Math.max(1, Math.round((y1 - y0) * sc));
  const g = c.getContext('2d');
  g.setTransform(c.width / w, 0, 0, c.height / (y1 - y0), 0, (-y0 * c.height) / (y1 - y0));
  paint(g);
  return { c, w, y0, h: y1 - y0 };
}

function paintSky(g, w, y0) {
  const f = (y) => clamp((y - y0) / (HZ + 2 - y0), 0, 1);
  const gr = g.createLinearGradient(0, y0, 0, HZ + 2);
  gr.addColorStop(0, '#07153a');
  gr.addColorStop(f(160), '#15387a');
  gr.addColorStop(f(290), '#3a69ae');
  gr.addColorStop(f(372), '#a9809f');
  gr.addColorStop(f(418), '#ee9f78');
  gr.addColorStop(1, '#ffc98c');
  g.fillStyle = gr;
  g.fillRect(0, y0, w, HZ + 2 - y0);
  // first stars of the evening
  const rnd = mulberry32(5);
  for (let i = 0; i < 54; i++) {
    const y = y0 + rnd() * (240 - y0);
    const a = (0.25 + rnd() * 0.6) * clamp((250 - y) / 160, 0, 1);
    g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    g.beginPath();
    g.arc(rnd() * w, y, 0.5 + rnd() * 1.1, 0, TAU);
    g.fill();
  }
  // the setting sun, half behind the city
  const sx = w * 0.7;
  const sy = HZ - 30;
  const glow = g.createRadialGradient(sx, sy, 10, sx, sy, 230);
  glow.addColorStop(0, 'rgba(255,214,150,0.6)');
  glow.addColorStop(0.35, 'rgba(255,170,120,0.22)');
  glow.addColorStop(1, 'rgba(255,150,120,0)');
  g.fillStyle = glow;
  g.fillRect(sx - 230, sy - 230, 460, 460);
  const disc = g.createRadialGradient(sx, sy - 6, 4, sx, sy, 30);
  disc.addColorStop(0, '#fff7da');
  disc.addColorStop(1, '#ffbd6a');
  g.fillStyle = disc;
  g.beginPath();
  g.arc(sx, sy, 30, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(233,128,120,0.35)';
  for (const [dy, hh] of [[4, 2.2], [11, 1.6], [17, 1.2]]) g.fillRect(sx - 40, sy + dy, 80, hh);
}

function cloud(g, x, y, s) {
  const gr = g.createLinearGradient(0, y - 24 * s, 0, y + 10 * s);
  gr.addColorStop(0, 'rgba(255,230,218,0.8)');
  gr.addColorStop(1, 'rgba(198,132,158,0.5)');
  g.fillStyle = gr;
  g.beginPath();
  for (const [dx, dy, r] of [[-44, 4, 9], [-30, 0, 14], [-12, -10, 18], [10, -14, 20], [30, -4, 15], [45, 3, 10]]) {
    g.moveTo(x + (dx + r) * s, y + dy * s);
    g.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
  }
  g.rect(x - 44 * s, y, 89 * s, 12 * s);
  g.fill();
}
function paintClouds(g) {
  cloud(g, 120, 130, 1);
  cloud(g, 420, 76, 0.7);
  cloud(g, 690, 175, 1.25);
  cloud(g, 905, 100, 0.8);
}

function crenels(g, x0, x1, y, s) {
  for (let x = x0; x + s <= x1 + 0.01; x += s * 2) g.fillRect(x, y - s, s, s);
}
function minaret(g, x, B, h) {
  g.fillRect(x - 3.5, B - h, 7, h);
  g.fillRect(x - 6.5, B - h * 0.78, 13, 3);
  g.fillRect(x - 5, B - h * 0.78 + 3, 10, 2);
  g.beginPath();
  g.moveTo(x - 4.4, B - h);
  g.lineTo(x, B - h - 24);
  g.lineTo(x + 4.4, B - h);
  g.closePath();
  g.fill();
}
/** Palm tree: trunk from (x, by), height h, lean, colours col = { trunk, ring, frond, frond2, dates, w0, w1 }. */
function palm(g, x, by, h, lean, col) {
  const tx = x + lean * h;
  const ty = by - h;
  const cx = x + lean * h * 0.1;
  const cy = by - h * 0.55;
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push([(1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * tx, (1 - t) * (1 - t) * by + 2 * (1 - t) * t * cy + t * t * ty, lerp(col.w0, col.w1, t)]);
  }
  g.fillStyle = col.trunk;
  g.beginPath();
  pts.forEach(([px, py, w], i) => (i ? g.lineTo(px - w / 2, py) : g.moveTo(px - w / 2, py)));
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0] + pts[i][2] / 2, pts[i][1]);
  g.closePath();
  g.fill();
  if (col.ring) {
    g.strokeStyle = col.ring;
    g.lineWidth = 1;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py, w] = pts[i];
      g.beginPath();
      g.moveTo(px - w / 2, py);
      g.quadraticCurveTo(px, py + 2, px + w / 2, py - 0.5);
      g.stroke();
    }
  }
  const L = h * 0.42;
  const fronds = [
    [Math.PI + 0.45, 0.5], [Math.PI + 0.05, 0.42], [-2.45, 0.3], [-1.85, 0.12], [-1.2, 0.2], [-0.6, 0.32], [-0.1, 0.42], [0.42, 0.5],
  ];
  fronds.forEach(([a, droop], i) => {
    const ex = tx + Math.cos(a) * L;
    const ey = ty + Math.sin(a) * L + droop * L * 0.9;
    const mx = tx + Math.cos(a) * L * 0.55;
    const my = ty + Math.sin(a) * L * 0.55 - L * 0.12;
    const dx = ex - tx;
    const dy = ey - ty;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = L * 0.17;
    g.fillStyle = i % 2 ? col.frond : col.frond2;
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(mx + nx * w, my + ny * w, ex, ey);
    g.quadraticCurveTo(mx - nx * w * 0.6, my - ny * w * 0.6, tx, ty);
    g.fill();
  });
  if (col.dates) {
    g.fillStyle = col.dates;
    for (const [dx, dy] of [[-3, 5], [2, 6], [-1, 9], [4, 3], [-5, 2]]) {
      g.beginPath();
      g.arc(tx + dx, ty + dy, 2.2, 0, TAU);
      g.fill();
    }
  }
}

function paintFar(g) {
  const B = HZ + 3;
  const rnd = mulberry32(11);
  const sil = g.createLinearGradient(0, HZ - 180, 0, B);
  sil.addColorStop(0, '#585089');
  sil.addColorStop(1, '#2e2b57');
  const red = g.createLinearGradient(0, HZ - 100, 0, B);
  red.addColorStop(0, '#83405a');
  red.addColorStop(1, '#4a2642');
  const lights = [];
  // flat-roofed old town across the whole tile
  g.fillStyle = sil;
  for (let x = 0; x < TILE_FAR; ) {
    const w = 14 + rnd() * 24;
    const h = 7 + rnd() * 20;
    g.fillRect(x, B - h, w + 0.6, h);
    if (rnd() < 0.55) lights.push([x + 3 + rnd() * (w - 6), B - h + 3 + rnd() * Math.max(1, h - 6)]);
    x += w;
  }
  // Assaraya al-Hamra, the Red Castle, by the sea
  g.fillStyle = red;
  g.beginPath();
  g.moveTo(34, B);
  g.lineTo(44, B - 42);
  g.lineTo(272, B - 42);
  g.lineTo(284, B);
  g.closePath();
  g.fill();
  crenels(g, 46, 272, B - 42, 5);
  g.fillRect(48, B - 62, 30, 22);
  crenels(g, 48, 78, B - 62, 4);
  g.fillRect(118, B - 82, 86, 42);
  crenels(g, 118, 204, B - 82, 5);
  g.fillRect(212, B - 68, 28, 28);
  crenels(g, 212, 240, B - 68, 4);
  g.fillRect(138, B - 96, 44, 16);
  g.beginPath();
  g.arc(160, B - 96, 9, Math.PI, 0);
  g.fill();
  for (let i = 0; i < 6; i++) lights.push([128 + i * 12, B - 66]);
  for (let i = 0; i < 9; i++) if (rnd() < 0.6) lights.push([60 + i * 24, B - 24]);
  // Ottoman mosque: dome and two pencil minarets
  g.fillStyle = sil;
  g.fillRect(352, B - 34, 58, 34);
  g.beginPath();
  g.ellipse(381, B - 34, 22, 25, 0, Math.PI, 0);
  g.fill();
  g.fillRect(380.2, B - 67, 1.6, 9);
  minaret(g, 340, B, 106);
  minaret(g, 424, B, 92);
  // Dhat al-Imad towers
  [128, 140, 150, 140, 128].forEach((h, i) => {
    const tx = 500 + i * 34;
    g.fillStyle = sil;
    g.fillRect(tx, B - h, 24, h);
    g.beginPath();
    g.moveTo(tx, B - h);
    g.lineTo(tx + 12, B - h - 8);
    g.lineTo(tx + 24, B - h);
    g.fill();
    for (let wy = B - h + 8; wy < B - 6; wy += 7) for (let wx = tx + 3; wx < tx + 22; wx += 5) if (rnd() < 0.15) lights.push([wx, wy]);
  });
  // old-town clock tower
  g.fillRect(722, B - 70, 18, 70);
  g.beginPath();
  g.arc(731, B - 70, 9, Math.PI, 0);
  g.fill();
  g.fillRect(730.2, B - 86, 1.6, 8);
  // second mosque
  g.fillRect(826, B - 22, 32, 22);
  g.beginPath();
  g.ellipse(842, B - 22, 15, 17, 0, Math.PI, 0);
  g.fill();
  minaret(g, 812, B, 96);
  // palms on the skyline
  const farPalm = { trunk: '#34305e', frond: '#34305e', frond2: '#3a3566', w0: 3, w1: 2 };
  for (const [px, ph, pl] of [[300, 52, 0.1], [462, 44, -0.12], [700, 58, 0.06], [878, 48, -0.08]]) palm(g, px, B, ph, pl, farPalm);
  // lit windows and the clock face
  g.fillStyle = 'rgba(255,214,130,0.85)';
  for (const [lx, ly] of lights) g.fillRect(lx, ly, 1.7, 1.7);
  g.fillStyle = 'rgba(255,236,186,0.9)';
  g.beginPath();
  g.arc(731, B - 58, 4.5, 0, TAU);
  g.fill();
}

function paintSea(g) {
  const gr = g.createLinearGradient(0, HZ, 0, GROUND_Y);
  gr.addColorStop(0, '#f2b48e');
  gr.addColorStop(0.05, '#8f98c4');
  gr.addColorStop(0.22, '#4778b4');
  gr.addColorStop(1, '#173e71');
  g.fillStyle = gr;
  g.fillRect(0, HZ, TILE_SEA, GROUND_Y - HZ + 2);
  const rnd = mulberry32(21);
  for (let i = 0; i < 130; i++) {
    const t = Math.pow(rnd(), 1.5);
    const y = HZ + 4 + t * (GROUND_Y - HZ - 18);
    const len = 3 + t * 24 * (0.5 + rnd());
    const x = rnd() * TILE_SEA;
    const th = 0.8 + t * 1.3;
    g.fillStyle = `rgba(210,230,255,${(0.1 + 0.28 * rnd()).toFixed(3)})`;
    g.fillRect(x, y, len, th);
    if (x + len > TILE_SEA) g.fillRect(x - TILE_SEA, y, len, th);
  }
  // a felucca on the bay
  const bx = 380;
  const by = HZ + 24;
  g.fillStyle = '#2b2647';
  g.beginPath();
  g.moveTo(bx - 13, by);
  g.lineTo(bx + 13, by);
  g.lineTo(bx + 9, by + 4);
  g.lineTo(bx - 9, by + 4);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,233,206,0.92)';
  g.beginPath();
  g.moveTo(bx - 1, by - 1);
  g.lineTo(bx + 1, by - 24);
  g.lineTo(bx + 12, by - 1);
  g.closePath();
  g.fill();
}

function paintNear(g) {
  const top = GROUND_Y - 12;
  const bg = g.createLinearGradient(0, top, 0, GROUND_Y + 2);
  bg.addColorStop(0, '#c49a6c');
  bg.addColorStop(1, '#e0bd88');
  g.fillStyle = bg;
  g.fillRect(0, top, TILE_NEAR, 14);
  g.strokeStyle = 'rgba(236,246,255,0.65)';
  g.lineWidth = 1.5;
  g.beginPath();
  for (let x = 0; x <= TILE_NEAR; x += 4) {
    const y = top + Math.sin((x / TILE_NEAR) * TAU * 24) * 0.8 + Math.sin((x / TILE_NEAR) * TAU * 7) * 0.7;
    if (x) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  const col = { trunk: '#4b3528', ring: 'rgba(25,14,8,0.45)', frond: '#2f6e4a', frond2: '#235a3c', dates: '#b8642c', w0: 9, w1: 5 };
  // bushes
  const rnd = mulberry32(31);
  for (let i = 0; i < 9; i++) {
    const x = 20 + rnd() * (TILE_NEAR - 40);
    const r = 6 + rnd() * 7;
    g.fillStyle = rnd() < 0.5 ? '#2c5e40' : '#3a7350';
    g.beginPath();
    g.ellipse(x, GROUND_Y - 2, r * 1.5, r, 0, Math.PI, 0);
    g.fill();
  }
  palm(g, 96, GROUND_Y - 4, 150, 0.14, col);
  palm(g, 372, GROUND_Y - 4, 112, -0.12, col);
  palm(g, 590, GROUND_Y - 4, 168, 0.07, col);
}

function paintGround(g, bottom) {
  const y = GROUND_Y;
  const T = TILE_GROUND;
  // sand
  const sand = g.createLinearGradient(0, y, 0, bottom);
  sand.addColorStop(0, '#e3be84');
  sand.addColorStop(1, '#bf8f52');
  g.fillStyle = sand;
  g.fillRect(0, y, T, bottom - y);
  // Roman paving: two courses of stone slabs (the Cardo at Leptis Magna)
  const shades = ['#dcc293', '#d0b17d', '#e5cea4', '#d6ba8a'];
  const slab = (x, yy, w, h, i) => {
    g.fillStyle = shades[i % shades.length];
    g.fillRect(x, yy, w, h);
    g.fillStyle = 'rgba(255,245,220,0.55)';
    g.fillRect(x, yy, w, 1.6);
    g.fillStyle = 'rgba(92,60,30,0.75)';
    g.fillRect(x + w - 1.4, yy, 1.4, h);
  };
  slab(0, y + 2.5, 32, 13, 0);
  slab(32, y + 2.5, 32, 13, 1);
  slab(64, y + 2.5, 32, 13, 2);
  slab(-16, y + 15.5, 32, 11, 3);
  slab(16, y + 15.5, 32, 11, 0);
  slab(48, y + 15.5, 32, 11, 2);
  slab(80, y + 15.5, 32, 11, 1);
  g.fillStyle = '#5b3a1d';
  g.fillRect(0, y, T, 2.5);
  g.fillStyle = 'rgba(92,60,30,0.75)';
  g.fillRect(0, y + 15.5, T, 1.2);
  g.fillRect(0, y + 26.5, T, 2);
  // Ghadames triangle band
  const by = y + 31;
  const bh = 9;
  g.fillStyle = '#7a3b1e';
  g.fillRect(0, by - 1.5, T, bh + 3);
  for (let i = 0; i < 8; i++) {
    const x = i * 12;
    g.fillStyle = i % 2 ? '#c92a2a' : '#f2dcb0';
    g.beginPath();
    if (i % 2) {
      g.moveTo(x, by);
      g.lineTo(x + 12, by);
      g.lineTo(x + 6, by + bh);
    } else {
      g.moveTo(x, by + bh);
      g.lineTo(x + 12, by + bh);
      g.lineTo(x + 6, by);
    }
    g.fill();
  }
  // speckles in the sand
  const rnd = mulberry32(41);
  for (let i = 0; i < 40; i++) {
    const sx = 2 + rnd() * (T - 4);
    const sy = y + 44 + rnd() * Math.max(1, bottom - y - 46);
    g.fillStyle = rnd() < 0.5 ? 'rgba(120,80,40,0.35)' : 'rgba(255,240,210,0.45)';
    g.fillRect(sx, sy, 1.4, 1.4);
  }
}

// ------------------------------------------------------------------ columns
// Leptis Magna: sandstone, white marble, and rose granite shafts with white
// marble Corinthian capitals (as in the Severan basilica).
const STYLES = {
  sandstone: {
    shaft: ['#8f5f34', '#d3a36a', '#f4d7a5', '#e1b57b', '#9e6c3c'],
    line: '#6b4220', flute: 'rgba(107,66,32,0.4)', fluteHi: 'rgba(255,240,210,0.5)',
    cap: ['#f7dfb0', '#dcae73', '#a77745'], capLine: '#6b4220',
  },
  marble: {
    shaft: ['#9c917f', '#ddd6ca', '#ffffff', '#eeeae2', '#ada391'],
    line: '#776d5e', flute: 'rgba(118,106,88,0.32)', fluteHi: 'rgba(255,255,255,0.7)', vein: true,
    cap: ['#ffffff', '#e2dacd', '#aea490'], capLine: '#776d5e',
  },
  granite: {
    shaft: ['#6a3a33', '#a4625a', '#d29486', '#b47165', '#76433a'],
    line: '#4f2a23', speck: true,
    cap: ['#ffffff', '#e2dacd', '#aea490'], capLine: '#776d5e',
  },
};
const STYLE_ORDER = ['sandstone', 'sandstone', 'marble', 'sandstone', 'granite'];

function leafShape(g, x, baseY, w, h, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x - w, baseY);
  g.quadraticCurveTo(x - w * 0.95, baseY - h * 0.95, x, baseY - h);
  g.quadraticCurveTo(x + w * 0.95, baseY - h * 0.95, x + w, baseY);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(x, baseY);
  g.lineTo(x, baseY - h * 0.7);
  g.stroke();
}

function buildColumnStyle(st, sc) {
  const out = {};
  // shaft tile (repeats vertically)
  out.shaft = layer(CW, 0, SHAFT_TILE, sc, (g) => {
    const hw = CW / 2;
    g.translate(hw, 0);
    const gr = g.createLinearGradient(-hw, 0, hw, 0);
    [0, 0.16, 0.5, 0.74, 1].forEach((p, i) => gr.addColorStop(p, st.shaft[i]));
    g.fillStyle = gr;
    g.fillRect(-hw, 0, CW, SHAFT_TILE);
    if (st.flute) {
      for (let i = 0; i < 8; i++) {
        const th = -Math.PI / 2 + ((i + 0.5) * Math.PI) / 8;
        const fx = Math.sin(th) * hw * 0.93;
        const fw = Math.cos(th) * (CW / 8) * 0.55 + 0.7;
        g.fillStyle = st.flute;
        g.fillRect(fx - fw / 2, 0, fw, SHAFT_TILE);
        g.fillStyle = st.fluteHi;
        g.fillRect(fx + fw / 2, 0, Math.max(0.6, fw * 0.28), SHAFT_TILE);
      }
    }
    if (st.speck) {
      const rnd = mulberry32(51);
      for (let i = 0; i < 420; i++) {
        const v = rnd();
        g.fillStyle = v < 0.45 ? 'rgba(40,14,10,0.35)' : v < 0.8 ? 'rgba(255,225,215,0.35)' : 'rgba(20,20,20,0.5)';
        g.fillRect(-hw + 2 + rnd() * (CW - 4), rnd() * (SHAFT_TILE - 1.2), 0.6 + rnd() * 1.1, 0.6 + rnd() * 1.1);
      }
    }
    if (st.vein) {
      g.strokeStyle = 'rgba(120,112,100,0.35)';
      g.lineWidth = 0.8;
      for (const [x0, y0, x1, y1] of [[-24, 12, 14, 70], [6, 40, 28, 104], [-30, 78, -8, 112]]) {
        g.beginPath();
        g.moveTo(x0, y0);
        g.bezierCurveTo(x0 + 14, y0 + 10, x1 - 16, y1 - 18, x1, y1);
        g.stroke();
      }
    }
    g.fillStyle = st.line;
    g.fillRect(-hw, 0, 1.5, SHAFT_TILE);
    g.fillRect(hw - 1.5, 0, 1.5, SHAFT_TILE);
  });
  // Corinthian capital, upright (abacus on top = edge of an opening above it)
  const capW = CW + OV * 2 + 4;
  out.cap = layer(capW, -1, CAP_H + 1, sc, (g) => {
    const hw = CW / 2;
    const [hi, mid, lo] = st.cap;
    g.translate(capW / 2, 0);
    g.lineWidth = 1.1;
    g.strokeStyle = st.capLine;
    g.lineJoin = 'round';
    g.fillStyle = mid;
    roundRect(g, -hw - 1, CAP_H - 4.5, CW + 2, 4.5, 2);
    g.fill();
    g.stroke();
    const bell = g.createLinearGradient(-hw - 4, 0, hw + 4, 0);
    bell.addColorStop(0, lo);
    bell.addColorStop(0.55, hi);
    bell.addColorStop(1, lo);
    g.fillStyle = bell;
    g.beginPath();
    g.moveTo(-hw + 1, CAP_H - 4.5);
    g.lineTo(-hw - 3, 6);
    g.lineTo(hw + 3, 6);
    g.lineTo(hw - 1, CAP_H - 4.5);
    g.closePath();
    g.fill();
    g.stroke();
    g.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) leafShape(g, -hw + 6 + ((i + 0.5) * (CW - 12)) / 4, CAP_H - 8, 6, 8.5, hi);
    for (let i = 0; i < 5; i++) leafShape(g, -hw + 6 + (i * (CW - 12)) / 4, CAP_H - 4.5, 6, 8.5, mid);
    g.lineWidth = 1.1;
    for (const sx of [-1, 1]) {
      g.fillStyle = hi;
      g.beginPath();
      g.arc(sx * (hw + 1.5), 9, 3.8, 0, TAU);
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(sx * (hw + 1.5), 9, 1.5, 0, TAU);
      g.stroke();
    }
    const ab = g.createLinearGradient(0, 0, 0, 6);
    ab.addColorStop(0, hi);
    ab.addColorStop(1, mid);
    g.fillStyle = ab;
    g.beginPath();
    g.moveTo(-hw - OV, 0);
    g.lineTo(hw + OV, 0);
    g.quadraticCurveTo(hw + OV - 2.5, 3, hw + OV - 1, 6);
    g.lineTo(-hw - OV + 1, 6);
    g.quadraticCurveTo(-hw - OV + 2.5, 3, -hw - OV, 0);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = lo;
    g.beginPath();
    g.arc(0, 7, 2.3, 0, TAU);
    g.fill();
  });
  return out;
}

// ------------------------------------------------------------------ styles
const CSS = `
.g-flappy{position:absolute;inset:0;overflow:hidden;background:#0b1c45;touch-action:none;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
.g-flappy .fl-top{position:absolute;z-index:2;left:10px;right:10px;top:${BANNER_TOP}px;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.g-flappy .fl-banner{box-sizing:border-box;width:100%;max-width:440px;height:${BANNER_H}px;display:flex;align-items:center;gap:10px;padding:6px 14px 6px 8px;border-radius:16px;color:#fff;
  background:linear-gradient(180deg,rgba(13,38,88,.93),rgba(6,20,54,.91));border:2px solid rgba(116,192,252,.65);
  box-shadow:0 8px 22px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.12);opacity:0;transform:translateY(-10px);
  transition:opacity .2s,transform .2s,border-color .2s}
.g-flappy .fl-banner.on{opacity:1;transform:none}
.g-flappy .fl-emoji{flex:none;width:44px;height:44px;display:grid;place-items:center;font-size:25px;line-height:1;border-radius:12px;background:rgba(116,192,252,.16);box-shadow:inset 0 0 0 1px rgba(116,192,252,.3)}
.g-flappy .fl-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.g-flappy .fl-lbl{font:800 10.5px/1.15 ${UI_FONT};letter-spacing:.12em;text-transform:uppercase;color:#74c0fc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-flappy .fl-en{font:800 23px/1.12 ${UI_FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.g-flappy .fl-en.long{font-size:19px}
.g-flappy .fl-en.xlong{font-size:16.5px}
.g-flappy .fl-hint{font:500 12px/1.2 ${UI_FONT};color:#c5d8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-flappy .fl-hint:empty{display:none}
.g-flappy .fl-banner.payback{border-color:#ffc078}
.g-flappy .fl-banner.payback .fl-lbl{color:#ffc078}
.g-flappy .fl-banner.bad{border-color:#ff6b6b;background:linear-gradient(180deg,rgba(112,22,30,.95),rgba(62,10,18,.93))}
.g-flappy .fl-banner.bad .fl-lbl{color:#ffa8a8}
.g-flappy .fl-banner.pop{animation:fl-pop .3s ease-out}
.g-flappy .fl-banner.shake{animation:fl-shake .36s}
.g-flappy .fl-reveal{position:absolute;z-index:2;left:50%;top:${BANNER_TOP + BANNER_H + 6}px;box-sizing:border-box;width:calc(100% - 20px);max-width:440px;padding:5px 12px 7px;border-radius:12px;color:#fff;text-align:center;
  font:600 14px/1.3 ${UI_FONT};background:rgba(122,26,30,.95);border:1.5px solid rgba(248,113,113,.95);box-shadow:0 6px 16px rgba(0,0,0,.45);
  pointer-events:none;opacity:0;transform:translate(-50%,-6px);transition:opacity .18s,transform .18s}
.g-flappy .fl-reveal.low{top:auto;bottom:10px;transform:translate(-50%,6px)}
.g-flappy .fl-reveal.on{opacity:1;transform:translate(-50%,0)}
.g-flappy .fl-reveal .x{color:#ff8787;font:900 19px/1 ${UI_FONT};vertical-align:-1px}
.g-flappy .fl-reveal .ar{font:700 23px/1.3 ${AR_FONT};unicode-bidi:isolate}
.g-flappy .fl-reveal .tr{font-style:italic;font-weight:500;color:#ffd0d0;font-size:13px}
.g-flappy .fl-reveal .ok{color:#d3f9d8}
.g-flappy .fl-reveal .ok .ar{color:#fff;font-size:25px}
.g-flappy .fl-reveal .ok b{color:#fff}
.g-flappy .fl-ready{position:absolute;z-index:1;left:12px;right:12px;top:57%;display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;color:#fff;text-align:center}
.g-flappy .fl-ready[hidden]{display:none}
.g-flappy .fl-tap{font-size:38px;line-height:1.1;animation:fl-tap 1s ease-in-out infinite}
.g-flappy .fl-go{font:900 30px/1.05 ${UI_FONT};letter-spacing:.01em;color:#fff;text-shadow:0 3px 0 #0b3d91,0 0 2px #0b3d91,0 6px 18px rgba(0,0,0,.45)}
.g-flappy .fl-sub{font:600 14px/1.3 ${UI_FONT};color:#eef6ff;max-width:270px;margin-top:2px;padding:5px 10px;border-radius:10px;background:rgba(6,20,54,.55)}
@keyframes fl-pop{0%{transform:scale(.92)}60%{transform:scale(1.04)}100%{transform:none}}
@keyframes fl-shake{0%,100%{transform:none}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
@keyframes fl-tap{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(7px) scale(.9)}}
@media (prefers-reduced-motion:reduce){.g-flappy .fl-banner,.g-flappy .fl-reveal{transition:none;animation:none!important}.g-flappy .fl-tap{animation:none}}
`;

// ------------------------------------------------------------------ the game
export default {
  howTo: [
    '<strong>Tap</strong> (or Space) to flap. Dubbi drops between taps!',
    'Each column has <strong>two openings</strong>: fly through the <strong>Arabic</strong> word that means the English at the top.',
    'Wrong word, column or ground = game over. Medals at 10, 20, 30, 40!',
  ],
  minWords: 12,
  // Short single words / collocations so the label fits in an opening.
  wordFilter: (w) => shortLabel(w, { arMax: 11, enMax: 22 }),

  create(stage, kit) {
    const rm = !!kit.reducedMotion;
    const style = document.createElement('style');
    style.textContent = CSS;
    const root = document.createElement('div');
    root.className = 'g-flappy';
    root.innerHTML = `
      <div class="fl-top">
        <div class="fl-banner" aria-live="polite">
          <div class="fl-emoji" aria-hidden="true">🏛️</div>
          <div class="fl-txt"><div class="fl-lbl">Fly through the Arabic for</div><div class="fl-en"></div><div class="fl-hint"></div></div>
        </div>
      </div>
      <div class="fl-reveal" aria-live="assertive"></div>
      <div class="fl-ready" hidden>
        <div class="fl-tap" aria-hidden="true">👆</div>
        <div class="fl-go">${kit.isTouch ? 'Tap to fly!' : 'Click or Space to fly!'}</div>
        <div class="fl-sub">Fly through the opening whose word means the English above</div>
      </div>`;
    stage.append(style, root);
    const $banner = root.querySelector('.fl-banner');
    const $emoji = root.querySelector('.fl-emoji');
    const $lbl = root.querySelector('.fl-lbl');
    const $en = root.querySelector('.fl-en');
    const $hint = root.querySelector('.fl-hint');
    const $reveal = root.querySelector('.fl-reveal');
    const $ready = root.querySelector('.fl-ready');

    // ---------------------------------------------------------- view state
    let W = 1;
    let H = 1;
    let k = 1; // px per world unit
    let worldW = MIN_WORLD_W;
    let oy = 0; // extra world units above y=0 (tall stages)
    let topY = 0; // world y of the stage's top edge
    let botY = WORLD_H; // world y of the stage's bottom edge
    let birdX = 100;
    let layers = null;
    let cols = null; // per-style column sprites
    const blockGrad = {}; // per-style gradient for the middle stone
    const imgs = {};
    const dubbi = {}; // mood → pre-rasterised canvas
    let fontsOk = false;
    let destroyed = false;
    let s = null; // round state
    let carry = []; // words that ended the previous run → asked again early in the next
    const fx = { shakeT: 0, shakeDur: 0, shakeMag: 0, flashT: 0, flashCol: '255,255,255', flashA: 0.8 };

    const loop = createLoop((dt) => step(dt));
    let cv = null;
    cv = setupCanvas(root, { onResize: (w, h) => cv && layout(w, h) });
    const ctx = cv.ctx;

    // ---------------------------------------------------------- layout & caches
    let builtAt = '';
    function layout(w, h) {
      const key = `${w}x${h}@${cv.dpr}`;
      // setupCanvas has just cleared the canvas, so always repaint now: waiting
      // for the next frame would show one blank frame on every resize.
      if (key !== builtAt || !layers) rebuild(w, h, key);
      render();
    }
    function rebuild(w, h, key) {
      builtAt = key;
      W = w;
      H = h;
      k = Math.min(H / WORLD_H, W / MIN_WORLD_W);
      worldW = W / k;
      const viewH = H / k;
      oy = (viewH - WORLD_H) / 2;
      topY = -oy;
      botY = WORLD_H + oy;
      const prevBirdX = birdX;
      birdX = clamp(worldW * 0.28, 92, 150);
      // Mid-round (e.g. a rotation) Dubbi's screen spot moves: move the world
      // with him so every column keeps its distance and nothing is skipped.
      if (s && birdX !== prevBirdX) shiftWorld(birdX - prevBirdX);
      const bgSc = k * Math.min(cv.dpr, 2);
      layers = {
        sky: layer(worldW, topY, HZ + 2, bgSc, (g) => paintSky(g, worldW, topY)),
        clouds: layer(TILE_CLOUD, 40, 210, bgSc, paintClouds),
        far: layer(TILE_FAR, HZ - 180, HZ + 3, bgSc, paintFar),
        sea: layer(TILE_SEA, HZ, GROUND_Y + 2, bgSc, paintSea),
        near: layer(TILE_NEAR, GROUND_Y - 200, GROUND_Y + 2, bgSc, paintNear),
        ground: layer(TILE_GROUND, GROUND_Y, botY + 2, k * cv.dpr, (g) => paintGround(g, botY + 2)),
      };
      const sc = k * cv.dpr;
      cols = {};
      for (const [id, st] of Object.entries(STYLES)) {
        cols[id] = buildColumnStyle(st, sc);
        const hw = CW / 2 + OV - 1;
        const gr = ctx.createLinearGradient(-hw, 0, hw, 0);
        gr.addColorStop(0, st.cap[2]);
        gr.addColorStop(0.55, st.cap[0]);
        gr.addColorStop(1, st.cap[2]);
        blockGrad[id] = gr;
      }
      for (const m of MOODS) buildDubbi(m);
      clearLabelCache();
      if (s && s.phase === 'ready' && s.obstacles[0]) s.obstacles[0].x = worldW + 90;
    }
    function shiftWorld(d) {
      for (const list of [s.obstacles, s.parts, s.rings, s.floaters]) for (const it of list) it.x += d;
    }

    function buildDubbi(m) {
      const img = imgs[m];
      if (!img || !img.naturalWidth) return;
      const sc = k * cv.dpr;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(DUBBI_W * sc));
      c.height = Math.max(1, Math.round(DUBBI_H * sc));
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, img.naturalWidth, (img.naturalHeight * CROP) / 150, 0, 0, c.width, c.height);
      dubbi[m] = c;
    }

    function clearLabelCache() {
      if (!s) return;
      for (const o of s.obstacles) for (const g of o.gaps) g.fs = 0;
    }

    /** World y just below the prompt banner (openings stay below it). */
    const topLimit = () => (BANNER_TOP + BANNER_H + 10) / k + topY;
    /**
     * Highest centre y Dubbi can fly to: his whole sprite stays under the
     * banner (it sits above the canvas and would hide him). Never lower than
     * the top of the next upper opening, e.g. after a rotation mid-round.
     */
    function ceilingY(cur) {
      const c = Math.max(topY + 30, (BANNER_TOP + BANNER_H) / k + topY + DUBBI_TOP + 2);
      return cur ? Math.min(c, cur.gaps[0].y0 + EXT_TOP) : c;
    }

    // ---------------------------------------------------------- words
    function buildDeck() {
      // Shuffled, softly biased so the most-used words tend to come first.
      const n = s.pool.length;
      return s.pool
        .map((w, i) => ({ w, key: s.rng() + (i / n) * 0.9 }))
        .sort((a, b) => a.key - b.key)
        .map((o) => o.w);
    }
    function nextTarget(n) {
      const last = s.recent[s.recent.length - 1];
      const remember = (w) => {
        s.recent.push(w.id);
        if (s.recent.length > 14) s.recent.shift();
      };
      const pi = s.payback.findIndex((p) => p.due <= n && p.word.id !== last);
      if (pi >= 0) {
        const w = s.payback.splice(pi, 1)[0].word;
        remember(w);
        return { word: w, payback: true };
      }
      // No repeat within the last 14 targets, or within half the pool when it
      // is small ("My words" can be just 12), and never the same word twice in a row.
      const recent = s.recent.slice(-Math.max(1, Math.min(14, Math.floor(s.pool.length / 2))));
      let w = null;
      for (let tries = 0; !w && tries < 40; tries++) {
        if (s.deckI >= s.deck.length) {
          s.deck = buildDeck();
          s.deckI = 0;
        }
        const c = s.deck[s.deckI++];
        if ((!recent.includes(c.id) && !s.payback.some((p) => p.word.id === c.id)) || (tries > 30 && c.id !== last)) w = c;
      }
      w ??= s.pool.find((c) => c.id !== last) ?? s.pool[0];
      remember(w);
      return { word: w, payback: false };
    }
    function pickDistractor(target, n) {
      const tAr = kit.normAr(target.ar);
      const tEn = kit.shortEn(target, 99).toLowerCase();
      const ok = (w) => w && w.id !== target.id && kit.normAr(w.ar) !== tAr && kit.shortEn(w, 99).toLowerCase() !== tEn && !clash(target, w);
      // Early columns: an obviously different word; later: same part of speech / topic.
      if (n < 3 || (n < 8 && s.rng() < 0.4)) {
        const span = Math.min(s.pool.length, 200);
        for (let i = 0; i < 60; i++) {
          const w = s.pool[Math.floor(s.rng() * span)];
          if (ok(w) && w.cat !== target.cat && w.pos !== target.pos) return w;
        }
      }
      const hard = kit.distractors(target, s.pool, 8, s.rng).filter(ok);
      if (hard.length) return hard[0];
      for (let i = 0; i < 300; i++) {
        const w = s.pool[Math.floor(s.rng() * s.pool.length)];
        if (ok(w)) return w;
      }
      return s.pool.find(ok) ?? s.pool.find((w) => w.id !== target.id) ?? target;
    }

    // ---------------------------------------------------------- obstacles
    function spawn(x) {
      const n = s.spawned++;
      const { word: target, payback } = nextTarget(n);
      const wrong = pickDistractor(target, n);
      const top = topLimit() + 16;
      const bot = GROUND_Y - 26;
      const avail = bot - top;
      const midH = 56 + Math.round(s.lrng() * lerp(14, 40, ramp(n)));
      let gapH = gapFor(n);
      if (gapH * 2 + midH > avail) gapH = Math.max(104, (avail - midH) / 2);
      const total = gapH * 2 + midH;
      const lo = top;
      const hi = Math.max(top, bot - total);
      let y0;
      if (s.prevY0 == null) y0 = (lo + hi) / 2;
      else {
        const md = lerp(70, 190, ramp(n));
        y0 = clamp(s.prevY0 + (s.lrng() * 2 - 1) * md, lo, hi);
      }
      s.prevY0 = y0;
      // which opening holds the answer; avoid long runs on the same side
      let side = s.lrng() < 0.5 ? 0 : 1;
      const lastTwo = s.sides.slice(-2);
      if (lastTwo.length === 2 && lastTwo[0] === side && lastTwo[1] === side && s.lrng() < 0.8) side = 1 - side;
      s.sides.push(side);
      const gaps = [
        { y0, y1: y0 + gapH },
        { y0: y0 + gapH + midH, y1: y0 + gapH * 2 + midH },
      ].map((g, i) => ({ ...g, word: i === side ? target : wrong, isTarget: i === side, state: null, stateAt: 0, fs: 0 }));
      const o = { id: n, n, x, style: STYLE_ORDER[n % STYLE_ORDER.length], target, wrong, payback, gaps, decided: false, decidedAt: 0, chosen: -1, cleared: false };
      s.obstacles.push(o);
      return o;
    }
    function spawnAhead() {
      for (;;) {
        const last = s.obstacles[s.obstacles.length - 1];
        const ahead = s.obstacles.filter((o) => !o.decided).length;
        if (last && ahead >= 2 && last.x > worldW + 240) break;
        const n = s.spawned;
        const gapX = Math.max(CW + 230, speedFor(n) * leadFor(n));
        spawn(last ? last.x + gapX : worldW + 90);
      }
      while (s.obstacles.length && s.obstacles[0].decided && s.obstacles[0].x < -CW - 140) s.obstacles.shift();
    }
    const currentOb = () => s?.obstacles.find((o) => !o.decided) ?? null;

    // ---------------------------------------------------------- banner, reveal, ready
    function setBanner(o) {
      $banner.classList.remove('bad', 'shake', 'pop', 'payback');
      if (!o) {
        $banner.classList.remove('on');
        return;
      }
      const main = kit.shortEn(o.target, 24);
      $emoji.textContent = CAT_EMOJI[o.target.cat] ?? NEUTRAL_EMOJI;
      $lbl.textContent = o.payback ? '🔁 Again! The Arabic for' : 'Fly through the Arabic for';
      $en.textContent = main;
      $en.className = `fl-en${main.length > 17 ? ' xlong' : main.length > 13 ? ' long' : ''}`;
      $hint.textContent = promptHint(o.target, main);
      void $banner.offsetWidth; // restart the pop animation
      $banner.classList.add('on', 'pop');
      if (o.payback) $banner.classList.add('payback');
    }
    const arSpan = (w) => `<bdi class="ar" dir="rtl" lang="ar">${esc(w.ar)}</bdi>`;
    /** Shows the answer card under the banner, or at the bottom when that would hide the crash labels. */
    function reveal(html, ob) {
      $reveal.classList.remove('on', 'low');
      $reveal.innerHTML = html;
      const rh = $reveal.offsetHeight;
      const spans = ob
        ? ob.gaps.map((g) => {
            const m = labelMetrics(g);
            const cy = (g.y0 + g.y1) / 2;
            return [(cy - m.ph * 0.62 + oy) * k, (cy + m.ph * 0.62 + oy) * k];
          })
        : [];
      const cover = (y) => spans.reduce((a, [p, q]) => a + Math.max(0, Math.min(q, y + rh) - Math.max(p, y)), 0);
      const atTop = cover(BANNER_TOP + BANNER_H + 6);
      if (atTop > 0 && cover(H - 10 - rh) < atTop) $reveal.classList.add('low');
      void $reveal.offsetWidth;
      $reveal.classList.add('on');
    }
    function hideReveal() {
      $reveal.classList.remove('on', 'low');
      $reveal.innerHTML = '';
    }

    // ---------------------------------------------------------- effects
    function floater(text, x, y, o = {}) {
      s.floaters.push({ text, x: clamp(x, 40 / k, worldW - 40 / k), y, t: 0, life: o.life ?? 1, vy: o.vy ?? -50, size: o.size ?? 26, color: o.color ?? '#fff', font: o.font ?? UI_FONT, weight: o.weight ?? 800 });
    }
    function sparkle(x, y, n, colors, speed = 220) {
      const cnt = rm ? Math.ceil(n / 3) : n;
      for (let i = 0; i < cnt; i++) {
        const a = Math.random() * TAU;
        const sp = 50 + Math.random() * speed;
        s.parts.push({ kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 260, life: 0.5 + Math.random() * 0.45, max: 0.95, size: 2.5 + Math.random() * 3.5, color: colors[i % colors.length], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8 });
      }
    }
    function dust(x, y) {
      for (let i = 0; i < (rm ? 4 : 12); i++) {
        const a = Math.PI + Math.random() * Math.PI;
        const sp = 30 + Math.random() * 90;
        s.parts.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 30, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, g: 60, life: 0.5 + Math.random() * 0.5, max: 1, size: 4 + Math.random() * 6, color: '226,190,135' });
      }
    }
    function feathers(x, y) {
      for (let i = 0; i < (rm ? 3 : 8); i++) {
        const a = Math.random() * TAU;
        const sp = 40 + Math.random() * 120;
        s.parts.push({ kind: 'feather', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 120, drag: 2.2, life: 1.2 + Math.random() * 0.8, max: 2, size: 5 + Math.random() * 3, color: '#fffaf0', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 6 });
      }
    }
    function shake(mag, dur = 0.35) {
      if (rm) return;
      fx.shakeMag = mag;
      fx.shakeT = dur;
      fx.shakeDur = dur;
    }
    function flash(col, a) {
      fx.flashCol = col;
      fx.flashA = rm ? a * 0.5 : a;
      fx.flashT = 1;
    }

    // ---------------------------------------------------------- actions
    function flap() {
      if (!s || !kit.playing) return;
      if (s.phase === 'ready') beginPlay();
      if (s.phase !== 'play') return;
      s.bird.vy = FLAP_V;
      s.bird.flapT = 0;
      s.flaps++;
      kit.sfx.flap();
      kit.haptic(5);
    }
    function beginPlay() {
      s.phase = 'play';
      $ready.hidden = true;
      spawnAhead();
    }

    function decide(o) {
      const b = s.bird;
      o.decided = true;
      o.decidedAt = s.time;
      o.chosen = choose(o, b.y);
      const g = o.gaps[o.chosen];
      if (g.isTarget) correct(o, g);
      else crash('wrong', o, g);
    }

    function correct(o, g) {
      s.score++;
      g.state = 'good';
      g.stateAt = s.time;
      s.cheerT = 0.45;
      kit.hud.score(s.score);
      kit.sfx.good();
      kit.sfx.combo(s.score);
      kit.haptic(15);
      kit.speak(o.target.ar);
      const cy = (g.y0 + g.y1) / 2;
      sparkle(o.x, cy, 18, ['#ffd43b', '#fff3bf', '#8ce99a', '#ffffff']);
      s.rings.push({ x: o.x, y: cy, t: 0 });
      // The transliteration sits just above Dubbi and the '+1' above it, spaced
      // in screen pixels (the text is pixel-sized) and drifting apart, not together.
      const ty = Math.max(topLimit() + 50 / k, s.bird.y - DUBBI_TOP - 24 / k);
      floater(`✓ ${o.target.tr}`, birdX + 4, ty, { size: 19, color: '#b2f2bb', weight: 700, life: 1.2, vy: -22 });
      floater('+1', birdX + 4, ty - 36 / k, { size: 30, color: '#ffe066', life: 0.9, vy: -55 });
      s.log.push('🟩');
      // Announcements go in the half of the sky away from Dubbi.
      const midY = (topLimit() + GROUND_Y) / 2;
      const ay = s.bird.y < midY ? midY + 40 : topLimit() + 70;
      const medal = MEDALS.find((m) => m.at === s.score);
      if (medal) {
        kit.sfx.win();
        flash('255,212,59', 0.3);
        floater(`${medal.emoji} ${medal.name.toUpperCase()}!`, worldW / 2, ay, { size: 34, color: '#ffd43b', life: 1.6, vy: -14 });
      } else if (s.score % 5 === 0) {
        floater(`🔥 ${s.score} in a row!`, worldW / 2, ay, { size: 28, color: '#ffa94d', life: 1.3, vy: -14 });
      }
      if (s.bestKnown && s.best > 0 && s.score === s.best + 1) {
        floater('🎉 New best!', worldW / 2, ay + 40 / k, { size: 22, color: '#ffffff', life: 1.4, vy: -12 });
        kit.hud.extra('🏆 NEW!');
      }
      setBanner(currentOb());
    }

    function crash(cause, o = null, g = null) {
      if (s.phase !== 'play') return;
      const b = s.bird;
      s.phase = 'dying';
      s.overT = 0;
      s.auto = null;
      // The word being asked: the opening just chosen, else the current prompt.
      const tob = cause === 'wrong' ? o : currentOb();
      const target = tob?.target ?? null;
      const wrong = cause === 'wrong' ? g.word : null;
      // Hit before reaching the asked columns (back of a passed column / ground)?
      const early = cause !== 'wrong' && !!tob && tob.x - birdX > CW / 2 + OV + 40;
      s.crash = { cause, ob: tob, target, wrong, early, landed: false };
      if (tob) {
        for (const gg of tob.gaps) {
          if (gg.isTarget) (gg.state = 'reveal'), (gg.stateAt = s.time);
          else if (gg === g) (gg.state = 'bad'), (gg.stateAt = s.time);
        }
      }
      s.log.push('💥');
      kit.sfx.bad();
      kit.sfx.swish();
      kit.haptic([60, 40, 90]);
      flash('255,255,255', 0.85);
      shake(9, 0.4);
      feathers(birdX, b.y);
      if (cause !== 'ground') {
        b.vy = cause === 'wrong' ? -240 : -160;
      } else b.vy = 0;
      $banner.classList.remove('pop');
      void $banner.offsetWidth;
      $banner.classList.add('bad', 'shake');
      if (target) {
        const en = esc(kit.shortEn(target, 28));
        const answer = `${arSpan(target)} <span class="tr">${esc(target.tr)}</span> = <b>${en}</b>`;
        if (wrong) reveal(`<div><span class="x">✗</span> ${arSpan(wrong)} <span class="tr">${esc(wrong.tr)} = ${esc(kit.shortEn(wrong, 24))}</span></div><div class="ok">— the answer was ${answer}</div>`, tob);
        else reveal(`<div>${cause === 'ground' ? '💥 Splat! Keep tapping to stay up.' : '💥 Bonk! You hit a column.'}</div><div class="ok">${early ? 'Next up was' : 'The answer was'} ${answer}</div>`, early ? null : tob);
        kit.speak(target.ar);
      }
    }

    function finish() {
      s.ended = true;
      const score = s.score;
      const pl = score === 1 ? '' : 's';
      const medal = medalFor(score);
      const next = [...MEDALS].reverse().find((m) => m.at > score);
      const { target, wrong, cause, early } = s.crash;
      // A crash before reaching the asked column (ground, or the back of the
      // column just passed) answered nothing: that word is not "missed" and
      // does not come back as "Again!"; it is only named as up next.
      const missed = early ? [] : [target, wrong].filter(Boolean);
      carry = missed.slice();
      const pill = (t) =>
        `<span style="display:inline-block;background:#e7f5ff;border:1px solid #a5d8ff;color:#0b4f8a;border-radius:999px;padding:4px 10px;font-size:.85rem;font-weight:600;margin:3px">${t}</span>`;
      const upNext =
        early && target
          ? `<div style="margin:6px 0 0;text-align:center;font-size:.9rem">Up next was <bdi dir="rtl" lang="ar" style="font-size:1.25rem;font-weight:700">${esc(target.ar)}</bdi> <i>${esc(target.tr)}</i> = ${esc(kit.shortEn(target, 40))}</div>`
          : '';
      const level = LEVELS.find((l) => l.id === s.level)?.label;
      const result = {
        score,
        correct: score,
        total: score + (early ? 0 : 1),
        won: false,
        missed,
        title: medal ? `${medal.emoji} ${medal.name} medal · ${score} word${pl}` : `🐻 ${score} word${pl} flown`,
        detail: `<div style="margin:12px 0 2px;text-align:center">${pill(`🏛️ <b>${score}</b> right`)}${medal ? pill(`${medal.emoji} ${medal.name}`) : ''}${next ? pill(`${next.emoji} ${next.name} at ${next.at}`) : ''}</div>${upNext}`,
        shareText: [
          `🐻 Flappy Dubbi · ${score} word${pl}${medal ? ` ${medal.emoji} ${medal.name}` : ''}${level ? ` · ${level}` : ''}`,
          shareGrid(score),
          // starts with a Latin word so chat apps keep the line left-to-right
          missed.length ? `Stopped by: ${target.ar} = “${kit.shortEn(target, 24)}”` : '',
          `I flew Dubbi through ${score} Libyan Arabic word${pl}. Can you beat me?`,
        ]
          .filter(Boolean)
          .join('\n'),
        meta: { cause, early, obstacles: s.spawned, flaps: s.flaps, speed: Math.round(s.speed) },
      };
      loop.stop();
      render();
      kit.end(result);
    }

    // ---------------------------------------------------------- input
    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!s || !kit.playing) return;
      e.preventDefault();
      flap();
    };
    const onKey = (e) => {
      if (!s || s.ended || !kit.playing) return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault(); // also stops Space from re-pressing a focused shell button
        if (e.type === 'keydown' && !e.repeat) flap();
      }
    };
    const noMenu = (e) => e.preventDefault();
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('contextmenu', noMenu);
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    const dropFocus = () => {
      const ae = document.activeElement;
      if (ae && ae !== document.body && !root.contains(ae) && typeof ae.blur === 'function') ae.blur();
    };

    // ---------------------------------------------------------- autopilot (debug hooks)
    // A plan is { mode: 'right' } (fly every column's correct opening until told
    // otherwise) or { mode: 'wrong', obId } (correct openings up to column obId,
    // then its wrong one).
    /** Should Dubbi (state b) flap now to bob inside the band [lo, hi] (centre y)? */
    function wantFlap(b, [lo, hi]) {
      const over = 8;
      const thr = hi - lo >= JUMP + over ? (lo + JUMP + hi - over) / 2 : (lo + hi) / 2 + JUMP / 2 - over / 2;
      if (b.y < thr) return false;
      // far below the band: climb faster (it still stops rising well short of it)
      return b.vy > (b.y > hi + JUMP * 2 ? -300 : -120);
    }
    const bandOf = (g) => [g.y0 + EXT_TOP + 3, g.y1 - EXT_BOT - 3];
    /** The band plan `a` steers for: the opening Dubbi is still inside, else the next column's planned one. */
    function planBand(a, obs) {
      const inside = obs.find((o) => o.decided && !o.cleared && o.chosen >= 0);
      if (inside) return bandOf(inside.gaps[inside.chosen]);
      const o = obs.find((x) => !x.decided);
      if (!o) return null;
      const wrong = a.mode === 'wrong' && o.id === a.obId;
      return bandOf(o.gaps.find((g) => g.isTarget !== wrong));
    }
    function autopilot() {
      const band = s.auto && planBand(s.auto, s.obstacles);
      if (band && wantFlap(s.bird, band)) flap();
    }
    /**
     * Look-ahead: flies a copy of Dubbi under plan `a` (a little faster than the
     * current speed, to be safe) until column `goalId` is decided.
     * Returns 'right' | 'wrong' | 'crash'.
     */
    function forecast(a, goalId) {
      const b = { y: s.bird.y, vy: s.bird.vy, rot: s.bird.rot };
      const obs = s.obstacles.map((o) => ({ ...o })); // own x / outcome; gaps are shared and only read
      const dx = (s.speed * 1.05 + 4) * SUB;
      for (let t = 0; t < 6; t += SUB) {
        const band = planBand(a, obs);
        if (band && wantFlap(b, band)) b.vy = FLAP_V;
        fly(b, SUB, ceilingY(obs.find((o) => !o.decided)));
        for (const o of obs) o.x -= dx;
        const hb = hitbox(b);
        if (onGround(hb)) return 'crash';
        for (const o of obs) {
          if (hits(o, hb)) return 'crash';
          if (!o.decided && birdX >= o.x) {
            o.decided = true;
            o.chosen = choose(o, b.y);
            const right = o.gaps[o.chosen].isTarget;
            if (o.id === goalId) return right ? 'right' : 'wrong';
            if (!right) return 'crash';
          }
          if (o.decided && !o.cleared && isCleared(o)) o.cleared = true;
        }
      }
      return 'crash';
    }
    function engage(mode) {
      if (!s || s.ended || s.phase === 'dying') return;
      const o = currentOb();
      if (!o) return;
      if (mode === 'right') {
        // Sticky, so a slow test harness still answers every column correctly.
        if (s.auto?.mode !== 'right') s.auto = { mode: 'right' };
        return;
      }
      if (s.auto?.mode === 'wrong') return; // a mistake is already planned (idempotent)
      // Take this column's wrong opening if Dubbi can still reach it; if it is
      // too close, fly this one correctly and take the next column's wrong one
      // (otherwise he would hit the stone between them: a crash, not an answer).
      let goal = o;
      if (s.phase === 'play' && forecast({ mode: 'wrong', obId: o.id }, o.id) !== 'wrong') {
        goal = s.obstacles.find((x) => !x.decided && x.id > o.id) ?? o;
      }
      s.auto = { mode: 'wrong', obId: goal.id };
    }

    // ---------------------------------------------------------- simulation
    function step(dt) {
      if (!s) return render();
      let rem = dt;
      while (rem > 1e-6 && s && !s.ended) {
        const h = Math.min(SUB, rem);
        rem -= h;
        tick(h);
      }
      if (!s || s.ended) return;
      effects(dt);
      render();
    }

    function hitsObstacle(o, hx, hy, r) {
      const [a, c] = o.gaps;
      const n = CW / 2;
      const w = CW / 2 + OV;
      return (
        circleRect(hx, hy, r, o.x - n, -1e5, o.x + n, a.y0 - CAP_H + 0.5) ||
        circleRect(hx, hy, r, o.x - w, a.y0 - CAP_H, o.x + w, a.y0) ||
        circleRect(hx, hy, r, o.x - w, a.y1, o.x + w, c.y0) ||
        circleRect(hx, hy, r, o.x - w, c.y1, o.x + w, c.y1 + CAP_H) ||
        circleRect(hx, hy, r, o.x - n, c.y1 + CAP_H - 0.5, o.x + n, 1e5)
      );
    }

    // Flight helpers shared by the game and the autopilot's forecast.
    /** One physics sub-step of gravity, the ceiling and the nose tilt. */
    function fly(b, h, ceil) {
      b.vy = Math.min(MAX_FALL, b.vy + G * h);
      b.y += b.vy * h;
      if (b.y < ceil) {
        b.y = ceil;
        b.vy = Math.max(0, b.vy);
      }
      const target = b.vy < 0 ? -0.36 : Math.min(1.2, (b.vy / MAX_FALL) * 1.5 - 0.08);
      b.rot += (target - b.rot) * Math.min(1, h * (b.vy < 0 ? 14 : 4.5));
    }
    /** Head and body circle centres along Dubbi's tilted axis: [hx, hy, bx, by, |cos|]. */
    function hitbox(b) {
      const sn = Math.sin(b.rot);
      const cs = Math.cos(b.rot);
      return [birdX - sn * HEAD.dy, b.y + cs * HEAD.dy, birdX - sn * BODY.dy, b.y + cs * BODY.dy, Math.abs(cs)];
    }
    const onGround = ([, hy, , by, acs]) => Math.max(hy + HEAD.r, by + BODY.r + 6 * acs) >= GROUND_Y;
    const hits = (o, [hx, hy, bx, by]) => Math.abs(o.x - birdX) <= CW / 2 + OV + 30 && (hitsObstacle(o, hx, hy, HEAD.r) || hitsObstacle(o, bx, by, BODY.r));
    /** The opening Dubbi is flying through at a column: the one whose centre is nearer. */
    const choose = (o, y) => (Math.abs(y - (o.gaps[0].y0 + o.gaps[0].y1) / 2) <= Math.abs(y - (o.gaps[1].y0 + o.gaps[1].y1) / 2) ? 0 : 1);
    const isCleared = (o) => birdX - 20 > o.x + CW / 2 + OV;

    function tick(h) {
      const b = s.bird;
      s.time += h;
      b.flapT += h;
      if (s.phase === 'ready') {
        s.dist += s.speed * h;
        b.y = s.readyY + Math.sin(s.time * 5) * (rm ? 3 : 7);
        b.rot += (Math.sin(s.time * 5 + 1.2) * 0.06 - b.rot) * Math.min(1, h * 8);
        if (s.auto) flap();
        return;
      }
      if (s.phase === 'play') {
        autopilot();
        fly(b, h, ceilingY(currentOb()));
        s.speed += clamp(speedFor(s.score) - s.speed, -40 * h, 14 * h);
        const dx = s.speed * h;
        s.dist += dx;
        for (const o of s.obstacles) o.x -= dx;
        spawnAhead();
        const hb = hitbox(b);
        if (onGround(hb)) {
          b.y = Math.min(b.y, GROUND_Y - 20);
          return crash('ground');
        }
        for (const o of s.obstacles) {
          if (Math.abs(o.x - birdX) > CW / 2 + OV + 30) {
            if (!o.decided && o.x < birdX) decide(o); // safety: never skip a decision
          } else {
            if (hits(o, hb)) return crash('column', o);
            if (!o.decided && birdX >= o.x) decide(o);
          }
          if (s.phase !== 'play') return;
          if (o.decided && !o.cleared && isCleared(o)) o.cleared = true;
        }
        return;
      }
      if (s.phase === 'dying') {
        b.vy = Math.min(MAX_FALL * 1.1, b.vy + G * h);
        b.y += b.vy * h;
        const rest = GROUND_Y - 22;
        if (b.y >= rest) {
          b.y = rest;
          b.vy = 0;
          if (!s.crash.landed) {
            s.crash.landed = true;
            dust(birdX, GROUND_Y);
            kit.sfx.pop();
          }
        }
        b.rot += (1.45 - b.rot) * Math.min(1, h * 6);
        s.overT += h;
        if (s.overT >= END_DELAY && !s.ended) finish();
      }
    }

    function effects(dt) {
      if (s.cheerT > 0) s.cheerT -= dt;
      for (let i = s.parts.length - 1; i >= 0; i--) {
        const p = s.parts[i];
        if (p.drag) {
          p.vx *= 1 - Math.min(1, p.drag * dt);
          p.vy *= 1 - Math.min(1, p.drag * dt);
        }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
        if (p.kind === 'dust') p.size *= 1 + dt * 1.2;
        p.life -= dt;
        if (p.life <= 0) s.parts.splice(i, 1);
      }
      if (s.parts.length > 260) s.parts.splice(0, s.parts.length - 260);
      for (let i = s.floaters.length - 1; i >= 0; i--) {
        const f = s.floaters[i];
        f.t += dt;
        f.y += f.vy * dt;
        f.vy *= 1 - Math.min(1, dt * 1.5);
        if (f.t >= f.life) s.floaters.splice(i, 1);
      }
      for (let i = s.rings.length - 1; i >= 0; i--) {
        s.rings[i].t += dt;
        if (s.rings[i].t > 0.5) s.rings.splice(i, 1);
      }
      if (fx.shakeT > 0) fx.shakeT = Math.max(0, fx.shakeT - dt);
      if (fx.flashT > 0) fx.flashT = Math.max(0, fx.flashT - dt * 3.2);
    }

    // ---------------------------------------------------------- rendering
    function drawTile(L, factor, dist) {
      const off = (((dist * factor) % L.w) + L.w) % L.w;
      for (let x = -off; x < worldW; x += L.w) ctx.drawImage(L.c, x, L.y0, L.w + 0.6 / k, L.h);
    }

    function drawShaft(st, x, y0, y1, anchorTop) {
      const T = SHAFT_TILE;
      const tile = st.shaft.c;
      if (anchorTop) {
        for (let y = y0; y1 - y > 0.3; y += T) {
          const hh = Math.min(T, y1 - y);
          ctx.drawImage(tile, 0, 0, tile.width, Math.max(1, (tile.height * hh) / T), x - CW / 2, y, CW, hh);
        }
      } else {
        for (let y = y1; y - y0 > 0.3; y -= T) {
          const hh = Math.min(T, y - y0);
          const sh = Math.max(1, (tile.height * hh) / T);
          ctx.drawImage(tile, 0, tile.height - sh, tile.width, sh, x - CW / 2, y - hh, CW, hh);
        }
      }
    }
    function drawCap(st, x, y, hanging) {
      const c = st.cap;
      if (!hanging) ctx.drawImage(c.c, x - c.w / 2, y + c.y0, c.w, c.h);
      else {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, -1);
        ctx.drawImage(c.c, -c.w / 2, c.y0, c.w, c.h);
        ctx.restore();
      }
    }
    /** The floating stone between the two openings: a carved frieze block with a rosette. */
    function drawBlock(id, x, ya, yb) {
      const st = STYLES[id];
      const hw = CW / 2 + OV - 1;
      const h = yb - ya;
      ctx.save();
      ctx.translate(x, 0);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = st.capLine;
      ctx.fillStyle = blockGrad[id];
      ctx.fillRect(-hw + 2, ya + 5, hw * 2 - 4, h - 10);
      ctx.strokeRect(-hw + 2, ya + 5, hw * 2 - 4, h - 10);
      ctx.fillStyle = st.cap[2];
      for (let dx = -hw + 5; dx < hw - 6; dx += 7) {
        ctx.fillRect(dx, ya + 6.5, 3.6, 3.4);
        ctx.fillRect(dx, yb - 9.9, 3.6, 3.4);
      }
      ctx.fillStyle = st.cap[0];
      roundRect(ctx, -hw - 1, ya, hw * 2 + 2, 6.5, 1.5);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, -hw - 1, yb - 6.5, hw * 2 + 2, 6.5, 1.5);
      ctx.fill();
      ctx.stroke();
      const r = Math.min(13, (h - 28) / 2);
      if (r > 5) {
        const cy = (ya + yb) / 2;
        ctx.fillStyle = st.cap[1];
        ctx.lineWidth = 0.9;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * r * 0.52, cy + Math.sin(a) * r * 0.52, r * 0.48, r * 0.2, a, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = st.cap[2];
        ctx.beginPath();
        ctx.arc(0, cy, r * 0.24, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, cy, r + 1.5, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
    function drawBase(id, x) {
      const st = STYLES[id];
      const hw = CW / 2;
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = st.capLine;
      ctx.fillStyle = st.cap[1];
      roundRect(ctx, x - hw - 7, GROUND_Y - 8, CW + 14, 9, 1.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = st.cap[0];
      roundRect(ctx, x - hw - 3, GROUND_Y - 14.5, CW + 6, 7, 3.5);
      ctx.fill();
      ctx.stroke();
    }
    function drawObstacle(o) {
      const st = cols[o.style];
      const [a, c] = o.gaps;
      drawShaft(st, o.x, topY - 2, a.y0 - CAP_H + 1, false);
      drawCap(st, o.x, a.y0, true);
      drawBlock(o.style, o.x, a.y1, c.y0);
      drawShaft(st, o.x, c.y1 + CAP_H - 1, GROUND_Y, true);
      drawCap(st, o.x, c.y1, false);
      drawBase(o.style, o.x);
    }

    function labelMetrics(g) {
      if (g.fs) return g;
      const px = clamp(29 * k, 23, 34);
      let fs = px / k;
      ctx.font = `700 ${fs}px ${AR_FONT}`;
      let tw = ctx.measureText(g.word.ar).width;
      const pad = 13 / k;
      const maxW = Math.min(worldW * 0.66, 240);
      if (tw + pad * 2 > maxW) {
        fs = Math.max(20 / k, (fs * (maxW - pad * 2)) / tw);
        ctx.font = `700 ${fs}px ${AR_FONT}`;
        tw = ctx.measureText(g.word.ar).width;
      }
      const m = { fs, tw, pw: tw + pad * 2, ph: fs * 1.45 };
      if (fontsOk) Object.assign(g, m);
      return m;
    }

    function drawLabels(o, now, cur) {
      const crashOb = s.phase === 'dying' && s.crash?.ob === o;
      for (const g of o.gaps) {
        let alpha = 1;
        if (crashOb) alpha = 1;
        else if (o.decided) {
          const t = s.time - o.decidedAt;
          alpha = g.state === 'good' ? clamp(1 - (t - 0.7) / 0.35, 0, 1) : clamp(1 - t / 0.25, 0, 1);
        } else if (!cur) alpha = 0.6;
        if (alpha <= 0.01) continue;
        const m = labelMetrics(g);
        const cy = (g.y0 + g.y1) / 2;
        const st = g.state;
        let scale = 1;
        if (st === 'good' && !rm) scale = 1 + 0.22 * Math.sin(clamp((s.time - g.stateAt) / 0.3, 0, 1) * Math.PI);
        if (st === 'reveal' && !rm) scale = 1.06 + 0.06 * Math.sin(now / 130);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(o.x, cy);
        ctx.scale(scale, scale);
        const r = m.ph * 0.34;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        roundRect(ctx, -m.pw / 2 + 1.5, -m.ph / 2 + 3, m.pw, m.ph, r);
        ctx.fill();
        ctx.fillStyle = st === 'good' || st === 'reveal' ? '#2b8a3e' : st === 'bad' ? '#c92a2a' : 'rgba(12,28,62,0.9)';
        roundRect(ctx, -m.pw / 2, -m.ph / 2, m.pw, m.ph, r);
        ctx.fill();
        ctx.lineWidth = 2.4 / k;
        ctx.strokeStyle = st === 'good' || st === 'reveal' ? '#d3f9d8' : st === 'bad' ? '#ffc9c9' : cur ? '#f4c95d' : 'rgba(244,201,93,0.55)';
        ctx.stroke();
        drawText(ctx, g.word.ar, 0, m.fs * 0.04, { size: m.fs, min: m.fs, font: AR_FONT, weight: 700, color: '#fffaf0', stroke: 'rgba(5,12,30,0.85)', strokeWidth: m.fs * 0.16 });
        if (st === 'reveal' || st === 'bad') {
          const bx = m.pw / 2 - 2 / k;
          const by = -m.ph / 2 + 2 / k;
          const br = 11 / k;
          ctx.fillStyle = st === 'bad' ? '#e03131' : '#2f9e44';
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, TAU);
          ctx.fill();
          ctx.lineWidth = 2 / k;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
          drawText(ctx, st === 'bad' ? '✗' : '✓', bx, by + 0.5 / k, { size: 14 / k, min: 1, font: UI_FONT, weight: 800, color: '#fff' });
        }
        ctx.restore();
      }
    }

    function drawWing(side, a) {
      const L = 25;
      ctx.save();
      ctx.translate(side * 7.5, 4);
      ctx.scale(side, 1);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(L * 0.45, -L * 0.62, L, -L * 0.42);
      ctx.quadraticCurveTo(L * 0.98, -L * 0.12, L * 0.8, -L * 0.1);
      ctx.quadraticCurveTo(L * 0.8, L * 0.1, L * 0.58, L * 0.02);
      ctx.quadraticCurveTo(L * 0.5, L * 0.2, L * 0.32, L * 0.1);
      ctx.quadraticCurveTo(L * 0.2, L * 0.22, 0, L * 0.12);
      ctx.closePath();
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#4a1d2c';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(150,120,100,0.6)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(L * 0.2, -L * 0.04);
      ctx.lineTo(L * 0.66, -L * 0.28);
      ctx.moveTo(L * 0.3, L * 0.06);
      ctx.lineTo(L * 0.62, -L * 0.06);
      ctx.stroke();
      ctx.restore();
    }
    function wingAngle(time) {
      if (!s) return -0.35 + Math.sin(time * 0.01) * 0.2;
      const b = s.bird;
      if (s.phase === 'dying') return 0.75;
      if (s.phase === 'ready') return -0.3 + Math.sin(s.time * 14) * 0.45;
      const t = b.flapT;
      if (t < 0.08) return lerp(-1.0, 0.6, t / 0.08);
      if (t < 0.26) return lerp(0.6, -0.5, (t - 0.08) / 0.18);
      return -0.5 + Math.sin(s.time * 18) * 0.12;
    }
    function drawDubbi(y, rot, mood, wing) {
      ctx.save();
      ctx.translate(birdX, y);
      ctx.rotate(rot);
      drawWing(1, wing);
      drawWing(-1, wing);
      const spr = dubbi[mood] ?? dubbi.happy;
      if (spr) ctx.drawImage(spr, -DUBBI_W / 2, -DUBBI_TOP, DUBBI_W, DUBBI_H);
      else {
        ctx.fillStyle = '#d4885a';
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    function star(x, y, r, rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 ? r * 0.38 : r;
        const a = (i * Math.PI) / 4;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function render() {
      if (destroyed || !cv || !layers) return;
      const now = performance.now();
      const dpr = cv.dpr;
      let sx = 0;
      let sy = 0;
      if (fx.shakeT > 0 && fx.shakeDur) {
        const m = (fx.shakeT / fx.shakeDur) * fx.shakeMag;
        sx = (Math.random() - 0.5) * 2 * m;
        sy = (Math.random() - 0.5) * 2 * m;
      }
      ctx.setTransform(dpr * k, 0, 0, dpr * k, sx * dpr * k, (oy + sy) * dpr * k);
      ctx.fillStyle = '#0b1c45';
      ctx.fillRect(-20, topY - 20, worldW + 40, botY - topY + 40);
      const dist = s ? s.dist : 0;
      ctx.drawImage(layers.sky.c, 0, layers.sky.y0, layers.sky.w, layers.sky.h);
      drawTile(layers.clouds, 1, dist * 0.04 + (s ? s.time : 0) * 3);
      drawTile(layers.far, 0.1, dist);
      drawTile(layers.sea, 0.22, dist);
      // the sun's reflection shimmering on the water
      const sunX = worldW * 0.7;
      const tt = now / 1000;
      for (let j = 0; j < 9; j++) {
        const w = 30 - j * 2.2 + Math.sin(tt * 3 + j * 1.7) * 6;
        ctx.fillStyle = `rgba(255,214,150,${(0.5 - j * 0.045).toFixed(3)})`;
        ctx.fillRect(sunX - w / 2 + Math.sin(tt * 2 + j) * 3, HZ + 4 + j * 9, w, 1.6);
      }
      drawTile(layers.near, 0.45, dist);

      const cur = currentOb();
      if (s) {
        for (const o of s.obstacles) if (o.x > -CW && o.x < worldW + CW) drawObstacle(o);
      } else idleObstacle();
      drawTile(layers.ground, 1, dist);
      if (s) for (const o of s.obstacles) if (o.x > -140 && o.x < worldW + 140) drawLabels(o, now, o === cur);
      // success rings
      if (s) {
        for (const r of s.rings) {
          const k2 = r.t / 0.5;
          ctx.strokeStyle = `rgba(140,233,154,${(1 - k2).toFixed(3)})`;
          ctx.lineWidth = 4 * (1 - k2) + 1;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 20 + k2 * 60, 0, TAU);
          ctx.stroke();
        }
      }
      // Dubbi
      if (s) {
        const b = s.bird;
        const mood = s.phase === 'dying' ? 'sad' : s.phase === 'play' && b.flapT < 0.14 ? 'wow' : s.cheerT > 0 ? 'cheer' : 'happy';
        drawDubbi(b.y, b.rot, mood, wingAngle(now));
        if (s.phase === 'dying' && s.crash.landed && !rm) {
          // dizzy stars
          ctx.fillStyle = '#ffd43b';
          for (let i = 0; i < 3; i++) {
            const a = tt * 4 + (i * TAU) / 3;
            star(birdX + 10 + Math.cos(a) * 22, b.y - 26 + Math.sin(a) * 7, 5, a);
          }
        }
      } else {
        drawDubbi(lerp(topLimit(), GROUND_Y, 0.36) + Math.sin(now / 300) * 4, 0, 'happy', -0.35);
      }
      if (s) {
        for (const p of s.parts) {
          const a = clamp(p.life / p.max, 0, 1);
          if (p.kind === 'star') {
            ctx.globalAlpha = Math.min(1, a * 1.5);
            ctx.fillStyle = p.color;
            star(p.x, p.y, p.size, p.rot);
          } else if (p.kind === 'dust') {
            ctx.globalAlpha = a * 0.55;
            ctx.fillStyle = `rgb(${p.color})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, TAU);
            ctx.fill();
          } else {
            ctx.globalAlpha = Math.min(1, a * 1.4);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.strokeStyle = 'rgba(74,29,44,0.6)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size, p.size * 0.38, 0, 0, TAU);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }
        ctx.globalAlpha = 1;
        for (const f of s.floaters) {
          const q = f.t / f.life;
          const pop = rm ? 1 : 1 + 0.4 * Math.max(0, 1 - f.t / 0.12);
          ctx.globalAlpha = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3;
          const size = (f.size * pop) / k;
          drawText(ctx, f.text, f.x, f.y, { size, min: 1, maxWidth: worldW - 20 / k, font: f.font, weight: f.weight, color: f.color, stroke: 'rgba(8,16,40,0.9)', strokeWidth: Math.max(4, f.size * 0.2) / k });
        }
        ctx.globalAlpha = 1;
      }
      if (fx.flashT > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = `rgba(${fx.flashCol},${(fx.flashA * fx.flashT).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    /** Decorative column pair behind the start screen. */
    function idleObstacle() {
      const x = worldW * 0.78;
      const top = topLimit() + 30;
      const o = { x, style: 'sandstone', gaps: [{ y0: top, y1: top + 150 }, { y0: top + 220, y1: top + 370 }] };
      drawObstacle(o);
    }

    // ---------------------------------------------------------- debug hooks
    kit.debug({
      info: () => {
        if (!s) return { phase: 'idle' };
        const o = currentOb();
        return {
          prompt: o ? kit.shortEn(o.target, 24) : null,
          targetId: o?.target.id ?? null,
          targetAr: o?.target.ar ?? null,
          next: o
            ? {
                x: Math.round(o.x),
                dx: Math.round(o.x - birdX),
                gaps: o.gaps.map((g) => ({ y: Math.round(g.y0), h: Math.round(g.y1 - g.y0), label: g.word.ar, isTarget: g.isTarget })),
              }
            : null,
          score: s.score,
          birdY: Math.round(s.bird.y),
          birdVy: Math.round(s.bird.vy),
          flaps: s.flaps,
          birdX: Math.round(birdX),
          speed: Math.round(s.speed),
          obstacles: s.spawned,
          auto: s.auto?.mode ?? null,
          autoOb: s.auto?.obId ?? null,
          crash: s.crash ? { cause: s.crash.cause, target: s.crash.target?.ar ?? null, wrong: s.crash.wrong?.ar ?? null } : null,
          phase: s.phase,
        };
      },
      answer: () => engage('right'),
      wrong: () => engage('wrong'),
    });

    // ---------------------------------------------------------- first paint
    layout(cv.w, cv.h);
    fontsReady().then(() => {
      if (destroyed) return;
      fontsOk = true;
      clearLabelCache();
      if (!loop.running) render();
    });
    for (const m of MOODS) {
      dubbiImage(m).then((img) => {
        if (destroyed) return;
        imgs[m] = img;
        buildDubbi(m);
        if (!loop.running) render();
      });
    }

    // ---------------------------------------------------------- lifecycle
    function reset() {
      fx.shakeT = 0;
      fx.flashT = 0;
      hideReveal();
      $ready.hidden = true;
    }

    return {
      start(opts) {
        reset();
        dropFocus();
        const ids = new Set(opts.pool.map((w) => w.id));
        s = {
          pool: opts.pool,
          rng: opts.rng,
          lrng: mulberry32(((opts.seed ?? 1) ^ 0x5bd1e995) >>> 0),
          deck: [],
          deckI: 0,
          recent: [],
          payback: carry.filter((w) => ids.has(w.id)).slice(0, 2).map((word, i) => ({ word, due: 1 + i * 3 })),
          sides: [],
          prevY0: null,
          obstacles: [],
          spawned: 0,
          phase: 'ready',
          time: 0,
          dist: 0,
          speed: speedFor(0),
          readyY: lerp(topLimit(), GROUND_Y, 0.36),
          bird: { y: 0, vy: 0, rot: 0, flapT: 9 },
          score: 0,
          flaps: 0,
          // The best to beat. Logged out, the local best is the real one. Logged
          // in, the real best is on the server and only the shell knows it, so
          // without kit.best no "New best!" is claimed (it could contradict the
          // shell's "Best: N").
          best: Math.max(localBest('flappy'), Number.isFinite(kit.best) ? kit.best : 0),
          bestKnown: !kit.user || Number.isFinite(kit.best),
          level: opts.level,
          cheerT: 0,
          parts: [],
          floaters: [],
          rings: [],
          log: [],
          auto: null,
          crash: null,
          overT: 0,
          ended: false,
        };
        carry = [];
        s.bird.y = s.readyY;
        s.deck = buildDeck();
        spawn(worldW + 90);
        kit.hud.score(0);
        kit.hud.extra(s.bestKnown && s.best ? `🏆 ${s.best}` : '');
        setBanner(currentOb());
        $ready.hidden = false;
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
      },
      resume() {
        dropFocus();
        if (s && !s.ended) loop.start();
      },
      destroy() {
        destroyed = true;
        loop.stop();
        s = null;
        root.removeEventListener('pointerdown', onDown);
        root.removeEventListener('contextmenu', noMenu);
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keyup', onKey);
        cv.destroy();
        cv = null;
        style.remove();
        root.remove();
      },
    };
  },
};
