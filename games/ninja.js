// Word Ninja — Fruit Ninja with Libyan Arabic words.
// The English meaning of a TARGET word is shown at the top. Fruits labelled
// with Arabic words are tossed up from the bottom: swipe through the one that
// matches, spare the others and never touch a bomb. Mistakes reveal the right
// answer (and re-ask the word a few waves later) so every run is practice.
// Contract: see ./README.md.
import { setupCanvas, createLoop, drawText, fontsReady, AR_FONT, UI_FONT, shuffle, clamp, lerp, shortLabel, mulberry32, normAr, LEVELS } from './common.js';

const MAX_LIVES = 3;
const TAU = Math.PI * 2;
const TRAIL_MS = 170; // blade trail lifetime
const REVEAL_H = 58; // room kept under the banner for the mistake reveal strip
const REVEAL_READ = 1.7; // seconds a mistake reveal stays up before the next prompt may replace it
const COMPACT_H = 430; // stage heights below this (phone landscape) use the compact layout
const SPRITE_R = 46; // fruit radius the sprites are drawn at (the largest R); scaled down when drawn

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Picture hints only for concrete topics, where the picture cannot contradict the
// word. Abstract categories (verbs, adjectives, pronouns, emotions…) show the part
// of speech instead: a 🏃 next to "to sit" or 😊 next to "sad" would mislead.
const CAT_EMOJI = {
  questions: '❓', time: '⏰', numbers: '🔢', greetings: '👋', people: '🧑', family: '👨‍👩‍👧',
  body: '💪', health: '🩺', clothing: '👕', home: '🏠', food: '🍲', drink: '🫖', kitchen: '🍳', shopping: '🛍️',
  colors: '🎨', city: '🏙️', travel: '✈️', nature: '🌴', animals: '🐪', work: '💼', school: '🎒', tech: '📱',
  tools: '🔧', cars: '🚗', admin: '🏛️', agriculture: '🌾', media: '📺', sports: '⚽', religion: '📿', measures: '📏',
};
const POS_TAG = { verb: 'VERB', adj: 'ADJ', adv: 'ADV', noun: 'NOUN', pron: 'PRON', prep: 'PREP', conj: 'CONJ', num: 'NUM' };
/** Banner glyph for a word: { emoji } for concrete topics, else { tag } (part of speech) or 💬. */
const glyphFor = (w) => (CAT_EMOJI[w.cat] ? { emoji: CAT_EMOJI[w.cat] } : POS_TAG[w.pos] ? { tag: POS_TAG[w.pos] } : { emoji: '💬' });

// ------------------------------------------------------------------ fruit art
// Each fruit is drawn around (0,0) with radius r. `sx/sy` squash the circle
// into an ellipse, `k` scales the body. Halves show the cut face (rind, flesh,
// seeds) as a half disc whose flat edge lies on the x axis (dome at y < 0).
const dimples = (g, r, n, col, seed) => {
  const rnd = mulberry32(seed);
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * r * 0.95;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.018 + rnd() * 0.018), 0, TAU);
    g.fill();
  }
};
const segments = (g, r, col) => {
  g.strokeStyle = col;
  g.lineWidth = r * 0.055;
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI + (k * Math.PI) / 6;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
    g.stroke();
  }
  g.fillStyle = col;
  g.beginPath();
  g.arc(0, 0, r * 0.1, Math.PI, TAU);
  g.fill();
};
const leaf = (g, x, y, len, ang, col = '#5c940d') => {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
  g.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.9, 0);
  g.stroke();
  g.restore();
};

const FRUITS = {
  watermelon: {
    emoji: '🍉', k: 1.06, sx: 1.08, sy: 0.96,
    skin: ['#b2f27a', '#37b24d', '#0f4a1c'], rind: '#ecf8cf', flesh: '#ff2e4f', flesh2: '#ff8597', juice: '#ff2d55',
    detail(g, r) {
      g.strokeStyle = 'rgba(8,62,22,0.85)';
      g.lineWidth = r * 0.13;
      g.lineCap = 'round';
      for (let i = -3; i <= 3; i++) {
        const phi = i * 0.43;
        g.beginPath();
        for (let k = 0; k <= 20; k++) {
          const y = -r + (2 * r * k) / 20;
          const x = Math.sin(phi) * Math.sqrt(Math.max(0, r * r - y * y)) + Math.sin(k * 1.4 + i * 2) * r * 0.035;
          if (k) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
    },
    cut(g, r) {
      g.fillStyle = '#1a1a1a';
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + 0.35 + i * 0.4;
        g.save();
        g.translate(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
        g.rotate(a + Math.PI / 2);
        g.beginPath();
        g.ellipse(0, 0, r * 0.045, r * 0.085, 0, 0, TAU);
        g.fill();
        g.restore();
      }
    },
  },
  orange: {
    emoji: '🍊', k: 1, sx: 1, sy: 1,
    skin: ['#ffd98a', '#ff922b', '#b8420a'], rind: '#fff1d6', flesh: '#ff9f2e', flesh2: '#ffd8a8', juice: '#ff9f1c',
    detail: (g, r) => dimples(g, r, 46, 'rgba(140,50,0,0.16)', 3),
    extra(g, r) {
      g.fillStyle = '#3f6212';
      g.beginPath();
      g.arc(0, -r * 0.93, r * 0.08, 0, TAU);
      g.fill();
      leaf(g, r * 0.04, -r * 0.95, r * 0.42, -0.45);
    },
    cut: (g, r) => segments(g, r, '#fff1d6'),
  },
  lemon: {
    emoji: '🍋', k: 1, sx: 1.15, sy: 0.86,
    skin: ['#fffbc2', '#fcd329', '#b98a00'], rind: '#fffbe6', flesh: '#fde047', flesh2: '#fefce8', juice: '#facc15',
    under(g, r) {
      g.fillStyle = '#e8b80f';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(s * r * 0.98, 0, r * 0.2, r * 0.15, 0, 0, TAU);
        g.fill();
      }
    },
    detail: (g, r) => dimples(g, r, 36, 'rgba(255,255,255,0.22)', 5),
    cut: (g, r) => segments(g, r, '#fffbe6'),
  },
  apple: {
    emoji: '🍎', k: 1, sx: 1.03, sy: 0.97,
    skin: ['#ff9d9d', '#e03131', '#6e0808'], rind: '#fff5f5', flesh: '#fff0b3', flesh2: '#fffdf0', juice: '#fff1a8',
    detail(g, r) {
      dimples(g, r, 26, 'rgba(255,230,180,0.25)', 9);
      g.strokeStyle = 'rgba(80,0,0,0.4)';
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.arc(0, -r * 1.02, r * 0.3, 0.25 * Math.PI, 0.75 * Math.PI);
      g.stroke();
    },
    extra(g, r) {
      g.strokeStyle = '#5c3a1a';
      g.lineWidth = Math.max(2, r * 0.08);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, -r * 0.78);
      g.quadraticCurveTo(r * 0.02, -r * 1.05, r * 0.14, -r * 1.2);
      g.stroke();
      leaf(g, r * 0.1, -r * 1.02, r * 0.45, -0.2);
    },
    cut(g, r) {
      g.fillStyle = 'rgba(214,180,90,0.45)';
      g.beginPath();
      g.ellipse(0, 0, r * 0.32, r * 0.3, 0, Math.PI, TAU);
      g.fill();
      g.fillStyle = '#4a2a10';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(s * r * 0.11, -r * 0.14, r * 0.05, r * 0.09, s * 0.4, 0, TAU);
        g.fill();
      }
    },
  },
  olive: {
    emoji: '🫒', k: 0.95, sx: 1.14, sy: 0.86,
    skin: ['#dcf5a8', '#7cb518', '#24500c'], rind: '#e9fac8', flesh: '#b5e06a', flesh2: '#e9fac8', juice: '#a9e34b',
    detail: (g, r) => dimples(g, r, 18, 'rgba(255,255,255,0.18)', 11),
    extra(g, r) {
      leaf(g, -r * 0.05, -r * 0.82, r * 0.62, -2.6, '#4d7c0f');
      leaf(g, r * 0.05, -r * 0.82, r * 0.55, -0.6, '#65a30d');
      g.fillStyle = '#365314';
      g.beginPath();
      g.arc(0, -r * 0.84, r * 0.07, 0, TAU);
      g.fill();
    },
    cut(g, r) {
      g.fillStyle = '#8c6a4f';
      g.beginPath();
      g.ellipse(0, 0, r * 0.42, r * 0.3, 0, Math.PI, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.ellipse(-r * 0.12, -r * 0.12, r * 0.14, r * 0.06, 0, 0, TAU);
      g.fill();
    },
  },
  date: {
    emoji: '🌴', k: 0.97, sx: 0.86, sy: 1.12,
    skin: ['#e0894a', '#8a3b14', '#2e0f03'], rind: '#e9a75d', flesh: '#d98a3d', flesh2: '#f6c27f', juice: '#c2701f',
    detail(g, r) {
      // fine wrinkles and a long glossy streak
      g.strokeStyle = 'rgba(30,8,0,0.3)';
      g.lineWidth = r * 0.035;
      for (let i = 0; i < 6; i++) {
        const y = -r * 0.62 + i * r * 0.25;
        g.beginPath();
        g.moveTo(-r * 0.8, y);
        g.quadraticCurveTo(0, y + r * 0.12 * (i % 2 ? 1 : -1), r * 0.8, y + r * 0.04);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,220,180,0.28)';
      g.beginPath();
      g.ellipse(-r * 0.32, -r * 0.05, r * 0.12, r * 0.6, 0.1, 0, TAU);
      g.fill();
      g.fillStyle = '#c99a5b';
      g.beginPath();
      g.ellipse(0, -r * 0.97, r * 0.16, r * 0.07, 0, 0, TAU);
      g.fill();
    },
    cut(g, r) {
      g.fillStyle = '#c9a27a';
      g.beginPath();
      g.ellipse(0, 0, r * 0.55, r * 0.17, 0, Math.PI, TAU);
      g.fill();
    },
  },
  pomegranate: {
    emoji: '🔴', k: 1.02, sx: 1, sy: 0.98,
    skin: ['#ff9b8f', '#c92a2a', '#4f0707'], rind: '#ffe3e3', flesh: '#fbd5d5', flesh2: '#fff0f0', juice: '#e8173f',
    detail: (g, r) => dimples(g, r, 22, 'rgba(255,220,200,0.2)', 13),
    extra(g, r) {
      g.fillStyle = '#8f1d1d';
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      const y0 = -r * 0.86;
      g.moveTo(-r * 0.24, y0);
      for (let i = 0; i <= 4; i++) {
        const x = -r * 0.24 + (i * r * 0.48) / 4;
        g.lineTo(x - r * 0.04, y0 - r * 0.2);
        g.lineTo(x + (i < 4 ? r * 0.06 : 0), y0 - r * 0.06);
      }
      g.lineTo(r * 0.24, y0);
      g.closePath();
      g.fill();
      g.stroke();
    },
    cut(g, r) {
      const rnd = mulberry32(21);
      for (let y = -r * 0.74; y < 0; y += r * 0.15) {
        for (let x = -r * 0.8; x < r * 0.8; x += r * 0.15) {
          const px = x + (rnd() - 0.5) * r * 0.05;
          const py = y + (rnd() - 0.5) * r * 0.05;
          g.fillStyle = '#d00036';
          g.beginPath();
          g.arc(px, py, r * 0.066, 0, TAU);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.beginPath();
          g.arc(px - r * 0.02, py - r * 0.02, r * 0.018, 0, TAU);
          g.fill();
        }
      }
    },
  },
};
const FRUIT_TYPES = Object.keys(FRUITS);

const skinGrad = (g, r, cols) => {
  const gr = g.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.06, 0, 0, r * 1.04);
  gr.addColorStop(0, cols[0]);
  gr.addColorStop(0.55, cols[1]);
  gr.addColorStop(1, cols[2]);
  return gr;
};

function drawWhole(g, type, r) {
  const f = FRUITS[type];
  g.save();
  g.scale(f.sx, f.sy);
  f.under?.(g, r);
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fillStyle = skinGrad(g, r, f.skin);
  g.fill();
  g.save();
  g.clip();
  f.detail?.(g, r);
  // soft rim shading so the fruit reads as round
  const rim = g.createRadialGradient(0, 0, r * 0.65, 0, 0, r);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = rim;
  g.fillRect(-r, -r, 2 * r, 2 * r);
  g.restore();
  g.lineWidth = Math.max(1.5, r * 0.05);
  g.strokeStyle = 'rgba(0,0,0,0.42)';
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.38)';
  g.beginPath();
  g.ellipse(-r * 0.38, -r * 0.46, r * 0.3, r * 0.14, -0.6, 0, TAU);
  g.fill();
  g.restore();
  f.extra?.(g, r);
}

function drawHalf(g, type, r) {
  const f = FRUITS[type];
  const semi = (rr) => {
    g.beginPath();
    g.arc(0, 0, rr, Math.PI, TAU);
    g.closePath();
  };
  g.save();
  g.scale(f.sx, f.sy);
  semi(r);
  g.fillStyle = skinGrad(g, r, f.skin);
  g.fill();
  g.lineWidth = Math.max(1.5, r * 0.05);
  g.strokeStyle = 'rgba(0,0,0,0.42)';
  g.stroke();
  semi(r * 0.9);
  g.fillStyle = f.rind;
  g.fill();
  semi(r * 0.8);
  const fg = g.createRadialGradient(0, 0, r * 0.05, 0, 0, r * 0.8);
  fg.addColorStop(0, f.flesh2);
  fg.addColorStop(1, f.flesh);
  g.fillStyle = fg;
  g.fill();
  g.save();
  semi(r * 0.8);
  g.clip();
  f.cut?.(g, r);
  g.restore();
  g.restore();
}

const BOMB_FUSE = [0.38, -1.3]; // fuse tip, in units of r (bomb local frame)
function drawBomb(g, r) {
  const rr = r * 0.9;
  g.fillStyle = '#868e96';
  g.strokeStyle = '#212529';
  g.lineWidth = 2;
  g.beginPath();
  g.rect(-rr * 0.24, -rr * 1.14, rr * 0.48, rr * 0.28);
  g.fill();
  g.stroke();
  g.strokeStyle = '#d4b483';
  g.lineWidth = Math.max(2.5, r * 0.08);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, -rr * 1.12);
  g.quadraticCurveTo(r * 0.06, -r * 1.42, r * BOMB_FUSE[0], r * BOMB_FUSE[1]);
  g.stroke();
  const gr = g.createRadialGradient(-rr * 0.35, -rr * 0.4, rr * 0.05, 0, 0, rr);
  gr.addColorStop(0, '#868e96');
  gr.addColorStop(0.45, '#343a40');
  gr.addColorStop(1, '#050505');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, rr, 0, TAU);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(255,80,80,0.55)';
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(-rr * 0.38, -rr * 0.42, rr * 0.26, rr * 0.12, -0.6, 0, TAU);
  g.fill();
  // red ✕ warning mark
  g.strokeStyle = '#ff4d4d';
  g.lineWidth = rr * 0.13;
  g.lineCap = 'round';
  const m = rr * 0.3;
  g.beginPath();
  g.moveTo(-m, -m + rr * 0.08);
  g.lineTo(m, m + rr * 0.08);
  g.moveTo(m, -m + rr * 0.08);
  g.lineTo(-m, m + rr * 0.08);
  g.stroke();
}

function makeSprite(r, dpr, pad, draw) {
  const size = Math.ceil(r * pad * 2);
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, c.width / 2, c.height / 2);
  draw(g);
  return { c, size };
}

function buildSprites(r, dpr) {
  const whole = {};
  const half = {};
  for (const t of FRUIT_TYPES) {
    const rr = r * FRUITS[t].k;
    whole[t] = makeSprite(rr, dpr, 1.5, (g) => drawWhole(g, t, rr));
    half[t] = makeSprite(rr, dpr, 1.3, (g) => drawHalf(g, t, rr));
  }
  return { whole, half, bomb: makeSprite(r, dpr, 1.55, (g) => drawBomb(g, r)) };
}

/** Wooden board with a faint khatam star and a Ghadames-style triangle band. */
function buildBackground(w, h, dpr, pad) {
  const bw = w + pad * 2;
  const bh = h + pad * 2;
  const c = document.createElement('canvas');
  c.width = Math.ceil(bw * dpr);
  c.height = Math.ceil(bh * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rnd = mulberry32(1951);
  const base = g.createLinearGradient(0, 0, 0, bh);
  base.addColorStop(0, '#5a361c');
  base.addColorStop(0.55, '#45280f');
  base.addColorStop(1, '#2b1708');
  g.fillStyle = base;
  g.fillRect(0, 0, bw, bh);
  const n = Math.max(4, Math.round(bw / 92));
  const pw = bw / n;
  for (let i = 0; i < n; i++) {
    const x = i * pw;
    g.fillStyle = rnd() > 0.5 ? `rgba(255,205,150,${0.03 + rnd() * 0.05})` : `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
    g.fillRect(x, 0, pw, bh);
    for (let k = 0; k < 9; k++) {
      const gx = x + pw * (0.06 + 0.88 * rnd());
      const amp = 2 + rnd() * 4;
      const per = 50 + rnd() * 70;
      g.strokeStyle = rnd() > 0.35 ? `rgba(25,10,2,${0.12 + rnd() * 0.14})` : `rgba(255,214,170,${0.04 + rnd() * 0.05})`;
      g.lineWidth = 0.8 + rnd() * 1.4;
      g.beginPath();
      for (let y = -10; y <= bh + 10; y += 18) {
        const xx = gx + Math.sin(y / per + k) * amp;
        if (y < 0) g.moveTo(xx, y);
        else g.lineTo(xx, y);
      }
      g.stroke();
    }
    if (rnd() < 0.7) {
      const ky = bh * (0.15 + rnd() * 0.7);
      const kx = x + pw * (0.3 + rnd() * 0.4);
      for (let j = 0; j < 4; j++) {
        g.strokeStyle = `rgba(28,10,2,${0.35 - j * 0.06})`;
        g.lineWidth = 1.4;
        g.beginPath();
        g.ellipse(kx, ky, 3 + j * 4, 6 + j * 7, 0, 0, TAU);
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x - 1.5, 0, 3, bh);
    g.fillStyle = 'rgba(255,220,180,0.07)';
    g.fillRect(x + 1.5, 0, 1.2, bh);
  }
  // knife scratches
  for (let i = 0; i < 14; i++) {
    const x = rnd() * bw;
    const y = bh * (0.2 + rnd() * 0.7);
    const a = -0.9 + rnd() * 1.8;
    const len = 30 + rnd() * 80;
    g.strokeStyle = `rgba(255,225,190,${0.04 + rnd() * 0.05})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // khatam (eight-pointed star) watermark
  const cx = bw / 2;
  const cy = pad + h * 0.56;
  const rad = Math.min(w, h) * 0.3;
  g.strokeStyle = 'rgba(255,214,160,0.07)';
  g.lineWidth = 3;
  for (const rot of [0, Math.PI / 4]) {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.strokeRect(-rad * 0.72, -rad * 0.72, rad * 1.44, rad * 1.44);
    g.restore();
  }
  g.beginPath();
  g.arc(cx, cy, rad * 0.42, 0, TAU);
  g.stroke();
  // vignette
  const vg = g.createRadialGradient(cx, pad + h * 0.5, Math.min(w, h) * 0.25, cx, pad + h * 0.5, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.62)');
  g.fillStyle = vg;
  g.fillRect(0, 0, bw, bh);
  // Ghadames-style triangle band along the bottom edge
  const bandH = 12;
  const by = pad + h - bandH - 4;
  g.fillStyle = 'rgba(20,8,2,0.55)';
  g.fillRect(0, by - 3, bw, bandH + 6);
  const tw = 14;
  for (let i = 0, x = 0; x < bw; i++, x += tw) {
    g.fillStyle = i % 2 ? 'rgba(201,42,42,0.75)' : 'rgba(245,222,179,0.6)';
    g.beginPath();
    if (i % 2) {
      g.moveTo(x, by);
      g.lineTo(x + tw, by);
      g.lineTo(x + tw / 2, by + bandH);
    } else {
      g.moveTo(x, by + bandH);
      g.lineTo(x + tw, by + bandH);
      g.lineTo(x + tw / 2, by);
    }
    g.fill();
  }
  g.fillStyle = 'rgba(245,222,179,0.35)';
  g.fillRect(0, by - 3, bw, 1.5);
  g.fillRect(0, by + bandH + 1.5, bw, 1.5);
  return c;
}

// ------------------------------------------------------------------ words
// Words that mean the same thing must never share a wave: slicing بابا when asked
// for "father" is right, not a mistake. Three layers: Arabic synonym sets the
// English glosses cannot reveal, English synonyms folded to one form, and sense
// comparison after normalisation (parentheses, punctuation, spacing, "to"/"a").
const SAME_AR = [
  ['أم', 'ماما'], ['بو', 'بابا', 'والد'], ['ألو', 'أهلا', 'أهلين', 'مرحبا', 'يا هلا'], ['باهي', 'طيب'],
  ['كمّل', 'خلص'], ['روّح', 'رجع', 'ولّى'], ['فاق', 'فيّق', 'ناض', 'نوّض'], ['يمكن', 'ممكن'], ['معليش', 'العفو'],
  ['مشكلة', 'موضوع'], ['ضروري', 'لازم'], ['بكري', 'زمان'], ['حزين', 'مقهور', 'زعلان'], ['زعل', 'تغشّش', 'تقلّق'],
  ['ممتاز', 'هايل'], ['شاطر', 'ذكي'], ['ردّ', 'جاوب'], ['قال', 'حكى'], ['تعبان', 'مهدود'],
];
const SYN = {
  mum: 'mother', mom: 'mother', mummy: 'mother', mama: 'mother', dad: 'father', daddy: 'father', papa: 'father',
  hi: 'hello', hey: 'hello', hiya: 'hello', thanks: 'thank you', bye: 'goodbye', okay: 'ok',
  immediately: 'right away', 'at once': 'right away', 'straight away': 'right away',
  excellent: 'great', clever: 'smart', reply: 'answer', tell: 'say', let: 'allow', permit: 'allow',
  angry: 'upset', annoyed: 'upset', heartbroken: 'sad', exhausted: 'tired', pleased: 'happy', glad: 'happy',
  scared: 'afraid', frightened: 'afraid', fear: 'afraid', perhaps: 'maybe', possibly: 'maybe',
  issue: 'problem', trouble: 'problem', 'excuse me': 'sorry', pardon: 'sorry', end: 'finish',
  'come back': 'return', 'go back': 'return', 'get back': 'return', necessarily: 'necessary',
  repair: 'fix', store: 'shop', street: 'road', pretty: 'beautiful',
};
const SYN_KEYS = Object.keys(SYN).sort((a, b) => b.length - a.length);
const IRREGULAR = { children: 'child', men: 'man', women: 'woman', people: 'person', feet: 'foot', teeth: 'tooth' };
const STOP = new Set(
  ('to a an the of for in on at by with from up down out off over into about as be is are am was it its i you he she we they ' +
    'me him her us them my your his our their one someone something somebody oneself sb sth not no and or so very too also all ' +
    'some any this that these those what which who how when where get go do make have take come put just more most than then').split(' '),
);
const AR_GROUP = new Map();
SAME_AR.forEach((g, i) => g.forEach((a) => AR_GROUP.set(a, i))); // exact spelling: خلّص (to pay) is not خلص (to end)

const canon = (s) => {
  let t = ` ${s} `;
  for (const k of SYN_KEYS) if (t.includes(` ${k} `)) t = t.split(` ${k} `).join(` ${SYN[k]} `);
  return t.trim();
};
/** One English sense in comparison form: lower case, no "(notes)", punctuation or double spaces, no leading to/a/the. */
const normSense = (s) => {
  const t = String(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[!?.…"“”«»:¡¿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return canon(t.replace(/^(to|a|an|the) /, '') || t);
};
const sensesCache = new Map();
/** All English senses of a word, normalised for "same meaning" checks. */
const senses = (w) => {
  let v = sensesCache.get(w.en);
  if (!v) sensesCache.set(w.en, (v = String(w.en).split(/[;,/]/).map(normSense).filter(Boolean)));
  return v;
};
/** Same sense, or one is the other plus extra words ("where" / "where to", "how" / "how much"). */
const nearSense = (a, b) => a === b || b.startsWith(`${a} `) || b.endsWith(` ${a}`) || a.startsWith(`${b} `) || a.endsWith(` ${b}`);
/** Light English stemmer (plural, -ed, -ing, -ly) so "finished" meets "finish". */
const stem = (w) => {
  if (IRREGULAR[w]) return IRREGULAR[w];
  const t = w.endsWith("'s") ? w.slice(0, -2) : w;
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && /(?:sh|ch|x|ss)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !/(?:ss|us|is)$/.test(t)) return t.slice(0, -1);
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3).replace(/(.)\1$/, '$1');
  if (t.length > 4 && t.endsWith('ed')) return t.slice(0, -2).replace(/(.)\1$/, '$1');
  if (t.length > 4 && t.endsWith('ly') && !t.endsWith('ily')) return t.slice(0, -2);
  return t;
};
/** Content words of a word's glosses ("good-hearted" → good, hearted…), stemmed. */
const tokens = (w) =>
  new Set(
    senses(w)
      .join(' ')
      .split(/[\s-]+/)
      .filter((t) => t.length > 1 && !STOP.has(t))
      .map(stem),
  );
/** Senses that are a single content word ("finish", "need", "brother"), stemmed. */
const singles = (w) => senses(w).filter((x) => !/[\s-]/.test(x) && !STOP.has(x)).map(stem);
/** True if slicing `b` when asked for `a` could be a right answer: never put them in one wave. */
const clash = (a, b) => {
  const ga = AR_GROUP.get(a.ar.trim());
  if (ga != null && ga === AR_GROUP.get(b.ar.trim())) return true;
  if (promptOf(a).toLowerCase() === promptOf(b).toLowerCase()) return true;
  const sa = senses(a);
  return senses(b).some((x) => sa.some((y) => nearSense(x, y)));
};
/**
 * One word's whole gloss reappears inside the other's ("to finish" / "to be finished",
 * "to need" / "to be needed", "good" / "good-hearted"): avoided as distractors while the
 * pool allows. Pairs that differ by a word ("paternal" / "maternal uncle", "turn on" /
 * "turn off") are good distractors and stay.
 */
const related = (a, b) => {
  const ta = tokens(a);
  const tb = tokens(b);
  return singles(a).some((t) => tb.has(t)) || singles(b).some((t) => ta.has(t));
};
/**
 * Up to n wrong fruits for `target` (kit.distractors order: same POS + category
 * first). Never a word that clashes; related glosses only when nothing else is left.
 */
function pickDistractors(distractors, target, pool, n, rng) {
  const cands = distractors(target, pool, n + 16, rng).filter((x) => !clash(target, x));
  const ds = cands.filter((x) => !related(target, x)).slice(0, n);
  for (const x of cands) if (ds.length < n && !ds.includes(x)) ds.push(x);
  if (ds.length < Math.min(n, 2)) {
    for (const x of distractors(target, pool, pool.length, rng)) if (ds.length < n && !ds.includes(x) && !clash(target, x)) ds.push(x);
  }
  return ds;
}

/**
 * What the banner asks for: the first English sense. A note in parentheses is kept
 * when it sits inside the phrase ("to wake (someone) up") or the phrase means
 * nothing without it ("to (someone's place)"); otherwise it moves to the hint.
 */
function promptParts(w, max = 26) {
  const first = String(w.en).split(';')[0].replace(/\s+/g, ' ').trim();
  const bare = first.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const keep = first.includes('(') && (/\([^)]*\)\s*\S/.test(first) || bare.replace(/^(to|a|an|the)\s+/i, '').length < 3);
  const text = keep && first.length <= max ? first : bare || first;
  return { text: text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text, inline: keep && text === first };
}
const promptOf = (w, max) => promptParts(w, max).text;
/** Small disambiguating line under the prompt: "(m. sg.)" notes and other senses. */
function promptHint(w, main, inline) {
  const parts = String(w.en)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const paren = inline ? null : (parts[0]?.match(/\(([^)]*)\)/) ?? [])[1];
  const others = parts
    .slice(1)
    .map((p) => p.replace(/\s*\([^)]*\)/g, '').trim())
    .filter((p) => p && p.toLowerCase() !== main.toLowerCase());
  const bits = [];
  if (paren) bits.push(paren);
  if (others.length) bits.push(`also “${others.slice(0, 2).join('”, “')}”`);
  return bits.join(' · ');
}
const multFor = (streak) => (streak >= 15 ? 5 : streak >= 10 ? 4 : streak >= 6 ? 3 : streak >= 3 ? 2 : 1);

/** Closest-approach parameter t∈[0,1] of segment a→b to (cx,cy) if within rad, else -1. */
function segHit(ax, ay, bx, by, cx, cy, rad) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L ? clamp(((cx - ax) * dx + (cy - ay) * dy) / L, 0, 1) : 0;
  const px = ax + dx * t - cx;
  const py = ay + dy * t - cy;
  return px * px + py * py <= rad * rad ? t : -1;
}

// ------------------------------------------------------------------ styles
const CSS = `
.g-ninja{position:absolute;inset:0;overflow:hidden;background:#3a220f;touch-action:none;cursor:crosshair;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.g-ninja .nj-top{position:absolute;z-index:2;left:10px;right:10px;top:8px;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.g-ninja .nj-banner{box-sizing:border-box;width:100%;max-width:440px;min-height:64px;display:flex;align-items:center;gap:11px;padding:7px 14px 7px 9px;border-radius:16px;color:#fff;
  background:linear-gradient(180deg,rgba(46,27,12,.95),rgba(22,12,5,.93));border:2px solid rgba(255,169,77,.55);
  box-shadow:0 8px 22px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1);opacity:0;transform:translateY(-10px);
  transition:opacity .2s,transform .2s,border-color .2s}
.g-ninja .nj-banner.on{opacity:1;transform:none}
.g-ninja .nj-emoji{flex:none;width:46px;height:46px;display:grid;place-items:center;font-size:27px;line-height:1;border-radius:12px;background:rgba(255,169,77,.16);box-shadow:inset 0 0 0 1px rgba(255,169,77,.25)}
.g-ninja .nj-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.g-ninja .nj-lbl{font:800 10.5px/1.15 ${UI_FONT};letter-spacing:.12em;text-transform:uppercase;color:#ffa94d}
.g-ninja .nj-en{font:800 24px/1.12 ${UI_FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.g-ninja .nj-hint{font:500 12.5px/1.25 ${UI_FONT};color:#ead3bb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-ninja .nj-hint:empty{display:none}
.g-ninja .nj-check{flex:none;font:800 22px/1 ${UI_FONT};color:#4ade80;opacity:0;transform:scale(.4);transition:opacity .15s,transform .15s}
.g-ninja .nj-banner.good{border-color:#4ade80;background:linear-gradient(180deg,rgba(22,90,48,.96),rgba(10,48,25,.94))}
.g-ninja .nj-banner.good .nj-check{opacity:1;transform:none}
.g-ninja .nj-banner.good .nj-lbl{color:#86efac}
.g-ninja .nj-banner.bad{border-color:#f87171}
.g-ninja .nj-banner.pop{animation:nj-pop .3s ease-out}
.g-ninja .nj-banner.shake{animation:nj-shake .32s}
.g-ninja .nj-reveal{box-sizing:border-box;max-width:440px;width:100%;padding:4px 12px 6px;border-radius:12px;color:#fff;text-align:center;
  font:600 14px/1.25 ${UI_FONT};background:rgba(127,29,29,.92);border:1.5px solid rgba(248,113,113,.95);box-shadow:0 6px 16px rgba(0,0,0,.45);
  opacity:0;transform:translateY(-6px);transition:opacity .18s,transform .18s}
.g-ninja .nj-reveal.on{opacity:1;transform:none}
.g-ninja .nj-reveal.boom{background:rgba(33,30,28,.94);border-color:#fbbf24}
.g-ninja .nj-reveal .ar{font:700 22px/1.3 ${AR_FONT};unicode-bidi:isolate}
.g-ninja .nj-reveal .tr{font-style:italic;font-weight:500;color:#fecaca;font-size:13px}
.g-ninja .nj-reveal .ok{color:#bbf7d0;font-size:13.5px}
.g-ninja .nj-reveal .ok .ar{font-size:19px;color:#fff}
.g-ninja .nj-emoji.tag{font:800 11px/1 ${UI_FONT};letter-spacing:.06em;color:#ffc078}
.g-ninja .nj-paren{font-weight:600;color:#ead3bb;font-size:.82em}
.g-ninja.nj-compact .nj-top{top:5px;gap:0}
.g-ninja.nj-compact .nj-banner{min-height:0;padding:3px 12px 3px 5px;gap:9px;border-radius:13px}
.g-ninja.nj-compact .nj-emoji{width:34px;height:34px;font-size:19px;border-radius:9px}
.g-ninja.nj-compact .nj-emoji.tag{font-size:9.5px}
.g-ninja.nj-compact .nj-lbl{display:none}
.g-ninja.nj-compact .nj-en{font-size:20px}
.g-ninja.nj-compact .nj-hint{font-size:11.5px}
.g-ninja.nj-compact .nj-reveal{position:absolute;top:0;left:0;right:0;margin:0 auto;padding:2px 10px 4px;font-size:12.5px;z-index:3}
.g-ninja.nj-compact.nj-revealing .nj-banner{opacity:0}
.g-ninja.nj-compact .nj-reveal .ar{font-size:18px}
.g-ninja.nj-compact .nj-reveal .ok .ar{font-size:16px}
@keyframes nj-pop{0%{transform:scale(.9)}60%{transform:scale(1.04)}100%{transform:none}}
@keyframes nj-shake{0%,100%{transform:none}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
@media (prefers-reduced-motion:reduce){.g-ninja .nj-banner,.g-ninja .nj-reveal{transition:none;animation:none!important}}
`;

// ------------------------------------------------------------------ the game
export default {
  howTo: [
    'Read the English word at the top, then <strong>swipe</strong> through the fruit with the matching <strong>Libyan Arabic</strong> word.',
    'Slicing a wrong fruit or a 💣 bomb costs a ❤️ — and so does letting the right one drop.',
    'Slice right answers in a row for a 🔥 combo multiplier. It speeds up as you go!',
  ],
  minWords: 12,
  // Short single words / collocations so the label fits on a fruit.
  wordFilter: (w) => shortLabel(w, { arMax: 10, enMax: 22 }),

  create(stage, kit) {
    const rm = !!kit.reducedMotion;
    const style = document.createElement('style');
    style.textContent = CSS;
    const root = document.createElement('div');
    root.className = 'g-ninja';
    root.innerHTML = `
      <div class="nj-top">
        <div class="nj-banner" aria-live="polite">
          <div class="nj-emoji" aria-hidden="true">🍉</div>
          <div class="nj-txt"><div class="nj-lbl">Slice the Arabic for</div><div class="nj-en"></div><div class="nj-hint"></div></div>
          <div class="nj-check" aria-hidden="true">✓</div>
        </div>
        <div class="nj-reveal" aria-live="assertive"></div>
      </div>`;
    stage.append(style, root);
    const $top = root.querySelector('.nj-top');
    const $banner = root.querySelector('.nj-banner');
    const $emoji = root.querySelector('.nj-emoji');
    const $lbl = root.querySelector('.nj-lbl');
    const $en = root.querySelector('.nj-en');
    const $hint = root.querySelector('.nj-hint');
    const $reveal = root.querySelector('.nj-reveal');

    let W = 1;
    let H = 1;
    let R = 40;
    let topLimit = 160;
    let stripY = 110; // centre of the free strip under the banner (reveal / combo / hints)
    let sprites = null;
    let spriteKey = '';
    let bg = null;
    let bgKey = '';
    let bgTimer = 0;
    const labelWidths = new Map(); // word id → label width in px at the current R
    const BG_PAD = 16;
    let fontsOk = false;
    let destroyed = false;
    let s = null; // round state
    const trails = []; // blade strokes being drawn: { id, pts:[{x,y,t}], alive }
    const strokes = new Map(); // pointerId → active stroke
    let lastSwish = 0;
    const fx = { shakeT: 0, shakeMag: 0, flashT: 0, flashCol: '255,40,40', flashA: 0.4 };

    const loop = createLoop((dt) => step(dt));
    let cv = null;
    cv = setupCanvas(root, { onResize: (w, h) => cv && layout(w, h) });
    layout(cv.w, cv.h);
    fontsReady().then(() => {
      fontsOk = true;
      if (s) for (const f of s.fruits) f.fs = null;
      if (!destroyed && !loop.running) render();
    });

    // ---------------------------------------------------------- layout
    function layout(w, h) {
      if (destroyed) return;
      const oldW = W;
      const oldR = R;
      const oldStart = H + R * 1.25; // launch line and highest apex before the change
      const oldTop = topLimit;
      W = w;
      H = h;
      root.classList.toggle('nj-compact', H < COMPACT_H);
      R = clamp(Math.min(W * 0.105, H * 0.07), 30, 46);
      measureTop();
      if (s?.wave) fitPrompt();
      // Fruit sprites are drawn once at the largest radius and scaled down to R, so
      // only a pixel-ratio change rebuilds them. A board rebuild waits until resizing
      // settles (the old one is stretched meanwhile), so a URL bar sliding or a
      // rotation never stalls a frame.
      if (oldR !== R) labelWidths.clear();
      const sk = `${cv.dpr}`;
      if (sk !== spriteKey) {
        spriteKey = sk;
        sprites = buildSprites(SPRITE_R, cv.dpr);
      }
      const bk = `${W}x${H}@${cv.dpr}`;
      if (bk !== bgKey) {
        clearTimeout(bgTimer);
        const build = () => {
          bgTimer = 0;
          bgKey = `${W}x${H}@${cv.dpr}`;
          bg = buildBackground(W, H, cv.dpr, BG_PAD);
          if (!loop.running) render();
        };
        if (bg) bgTimer = setTimeout(build, 160);
        else build();
      }
      if (s && oldW > 1 && (oldW !== W || oldStart !== H + R * 1.25 || oldTop !== topLimit || oldR !== R)) rescale(oldW, oldStart, oldTop);
      render();
    }

    /**
     * Maps everything in flight onto the new stage. Vertically the band between the
     * launch line and the highest apex is scaled, and so are vy and g, so every arc
     * keeps its timing and still peaks inside the visible band (a phone rotated to
     * landscape mid-wave would otherwise toss the target too low to be sliced).
     */
    function rescale(oldW, oldStart, oldTop) {
      const kx = W / oldW;
      const newStart = H + R * 1.25;
      const ky = (newStart - topLimit) / Math.max(1, oldStart - oldTop);
      const mapY = (y) => newStart - (oldStart - y) * ky;
      for (const f of s.fruits) {
        f.x *= kx;
        f.vx *= kx;
        f.y = mapY(f.y);
        f.vy *= ky;
        f.g *= ky;
        f.r = f.bomb ? R * 0.92 : R * FRUITS[f.type].k;
        f.fs = null;
      }
      for (const p of [...s.halves, ...s.parts, ...s.splats, ...s.cuts]) {
        p.x *= kx;
        p.y = mapY(p.y);
      }
      for (const fl of s.floaters) {
        fl.x *= kx;
        fl.y = clamp(mapY(fl.y), 30, H - 34);
      }
    }

    /** Highest point a fruit may reach: below the prompt banner and the reveal strip.
     *  In the compact (landscape) layout the reveal covers the banner instead. */
    function measureTop() {
      const bannerBottom = $top.offsetTop + ($banner.offsetHeight || 64);
      const strip = H < COMPACT_H ? 0 : REVEAL_H;
      topLimit = bannerBottom + 6 + strip + R * 0.8;
      stripY = bannerBottom + 6 + (strip ? strip / 2 : 16);
    }

    // ---------------------------------------------------------- difficulty
    function diff() {
      const c = s.correct;
      const d = clamp(c / 26, 0, 1);
      const e = clamp((c - 26) / 24, 0, 1); // late game keeps tightening
      return {
        distractors: c < 4 ? 2 : c < 12 ? 3 : 4,
        tApex: lerp(1.22, 0.86, d) - 0.1 * e, // seconds from launch to the top of the arc
        stagger: lerp(0.5, 0.22, d) - 0.07 * e,
        read: lerp(0.75, 0.32, d), // time to read the prompt before the first toss
        gap: lerp(0.6, 0.3, d),
        bombChance: s.waves < 3 ? 0 : lerp(0.14, 0.42, d) + 0.18 * e,
        twoBombs: c >= 18,
        drift: d > 0.2 ? 0.25 + 0.4 * d : 0.1, // chance the whole volley drifts sideways
      };
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
      if (s.retry) {
        // a wave voided without the player's fault (e.g. the phone was rotated) asks again
        const w = s.retry;
        s.retry = null;
        return w;
      }
      let w = null;
      const qi = s.queue.findIndex((q) => q.due <= s.waves);
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
      s.queue.push({ word, due: s.waves + delay });
    }
    function addMissed(word) {
      if (!s.missed.some((w) => w.id === word.id)) s.missed.push(word);
    }

    // ---------------------------------------------------------- waves
    function startWave() {
      s.nextWaveAt = null;
      s.phase = 'play';
      if (s.revealUntil) {
        // the last mistake's reveal has had its reading time: clear it for the new prompt
        s.revealUntil = 0;
        hideReveal();
      }
      const d = diff();
      const target = nextTarget();
      const ds = pickDistractors(kit.distractors, target, s.pool, d.distractors, s.rng);
      let bombs = 0;
      if (s.lrng() < d.bombChance) bombs = d.twoBombs && s.lrng() < 0.3 ? 2 : 1;
      // Narrow phones fit fewer lanes: drop a bomb, then extra distractors.
      const maxItems = Math.max(3, Math.min(W < 360 ? 5 : 7, Math.floor((W - R * 2.2) / (R * 1.05))));
      while (1 + ds.length + bombs > maxItems && bombs > 1) bombs--;
      while (1 + ds.length + bombs > maxItems && ds.length > 2) ds.pop();
      while (1 + ds.length + bombs > maxItems && bombs > 0) bombs--;
      const types = shuffle(FRUIT_TYPES, s.lrng);
      const items = [{ word: target, isTarget: true }, ...ds.map((word) => ({ word, isTarget: false }))];
      for (let i = 0; i < bombs; i++) items.push({ bomb: true, isTarget: false });
      let order = shuffle(items, s.lrng);
      let best = planVolley(order, types, d);
      // Fruit still touching the target? Toss fewer things rather than an unfair volley.
      while (best.hard > 0.3 && order.length > 3) {
        const drop = order.filter((it) => !it.isTarget && !it.bomb).length > 3 ? order.findIndex((it) => !it.isTarget && !it.bomb) : order.findIndex((it) => it.bomb);
        order = order.filter((_, i) => i !== (drop >= 0 ? drop : order.findIndex((it) => !it.isTarget)));
        best = planVolley(order, types, d);
      }
      const wave = { idx: s.waves, target, mistake: false, resolved: false, bombed: false, crowd: Math.round(best.hard * 100) / 100 };
      s.wave = wave;
      s.waves++;
      for (const p of best.plan) {
        s.fruits.push({
          wave,
          word: p.it.word ?? null,
          isTarget: !!p.it.isTarget,
          bomb: !!p.it.bomb,
          type: p.type,
          r: p.r,
          x: p.x0,
          y: best.yStart,
          vx: p.vx,
          vy: p.vy,
          g: best.g,
          rot: (s.lrng() - 0.5) * 0.6,
          vr: (s.lrng() - 0.5) * (p.it.bomb ? 1.2 : 2.6),
          launchAt: s.time + p.at,
          launched: false,
          sliced: false,
          fade: null,
          visibleAt: null,
          fs: null,
        });
      }
      setBanner(target);
      if (s.waves === 1) floater(kit.isTouch ? '👆 Swipe across the right fruit!' : '🖱️ Drag across the right fruit!', W / 2, stripY, { size: 19, color: '#ffe8cc', life: 2.6, vy: 0, tag: 'tut' });
    }

    /**
     * Lanes, drift, apex heights and launch times for one volley, re-rolled (seeded)
     * until the target keeps a clear corridor for its whole time on screen: nothing
     * close enough that a normal swipe through the target also clips a neighbour,
     * and labels that do not sit on top of each other. Returns the least crowded plan.
     */
    function planVolley(order, types, d) {
      const n = order.length;
      const margin = R * 1.1;
      const lw = (W - margin * 2) / n;
      const apexMin = topLimit;
      const apexMax = Math.max(topLimit + 60, H * 0.58);
      const yStart = H + R * 1.25;
      const Href = yStart - (apexMin + apexMax) / 2;
      const g = (2 * Href) / (d.tApex * d.tApex);
      const narrow = W < 400;
      let best = null;
      for (let attempt = 0; attempt < 80; attempt++) {
        let lanes;
        if (attempt === 0) {
          // Fruits tossed one after another go to non-adjacent lanes (evens then odds).
          const idx = [...Array(n).keys()];
          const ev = idx.filter((i) => i % 2 === 0);
          const od = idx.filter((i) => i % 2 === 1);
          lanes = n % 2 ? [...ev, ...od] : [...od, ...ev];
          if (s.lrng() < 0.5) lanes = lanes.map((l) => n - 1 - l);
        } else lanes = shuffle([...Array(n).keys()], s.lrng);
        const drift = s.lrng() < d.drift * (narrow ? 0.5 : 1) ? (s.lrng() < 0.5 ? -1 : 1) * lw * (0.5 + 0.4 * s.lrng()) * (narrow ? 0.6 : 1) : 0;
        const highParity = s.lrng() < 0.5 ? 0 : 1; // neighbouring lanes peak at different heights
        let at = d.read;
        const plan = order.map((it, i) => {
          const lane = lanes[i];
          const type = types[i % types.length];
          const x0 = margin + lw * (lane + 0.5) + (s.lrng() - 0.5) * lw * 0.3;
          const x1 = clamp(x0 + drift + (s.lrng() - 0.5) * lw * 0.35, margin, W - margin);
          const apex = lerp(apexMin, apexMax, (lane % 2 === highParity ? 0 : 0.5) + 0.5 * s.lrng());
          const hh = yStart - apex;
          const tAir = 2 * Math.sqrt((2 * hh) / g);
          const p = { it, type, r: it.bomb ? R * 0.92 : R * FRUITS[type].k, x0, vx: (x1 - x0) / tAir, vy: -Math.sqrt(2 * g * hh), at, tAir, lw: it.word ? labelWidth(it.word) : 0 };
          at += Math.max(0.12, d.stagger * (0.7 + 0.6 * s.lrng()));
          return p;
        });
        const { hard, soft } = crowding(plan, g, yStart, best ? best.pen : Infinity);
        const pen = 3 * hard + soft; // touching the target matters most
        if (!best || pen < best.pen) best = { plan, pen, hard, g, yStart };
        if (pen < 0.05) break;
      }
      return best;
    }

    /**
     * How badly a planned volley crowds the target while it is on screen. `hard`: another
     * fruit or a bomb (nearly) touching it. `soft`: closer than a comfortable swipe
     * corridor, or labels on top of each other. 0 / 0 = clear all the way. Stops early
     * once 3·hard + soft reaches `limit` (the best plan so far is already better).
     */
    function crowding(plan, g, yStart, limit = Infinity) {
      const T = plan.find((p) => p.it.isTarget);
      const lh = clamp(R * 0.7, 22, 31) * 1.1; // label height
      const half = 0.5 * g;
      const yMax = H - T.r * 0.25;
      const tEnd = T.at + T.tAir;
      let hard = 0;
      let soft = 0;
      for (let t = T.at; t <= tEnd; t += 1 / 30) {
        const u = t - T.at;
        const ty = yStart + T.vy * u + half * u * u;
        if (ty > yMax) continue; // target not on screen (yet / any more)
        const tx = T.x0 + T.vx * u;
        for (const o of plan) {
          const v = t - o.at;
          if (o === T || v < 0) continue;
          const oy = yStart + o.vy * v + half * v * v;
          if (oy - o.r > H) continue;
          const dx = o.x0 + o.vx * v - tx;
          const dy = oy - ty;
          const S = T.r + o.r;
          const room = (o.it.bomb ? 1.4 : 1.2) * S;
          const adx = Math.abs(dx);
          if (Math.abs(dy) >= room && Math.abs(dy) >= lh) continue;
          if (adx >= room * 1.35 && adx >= (o.lw + T.lw) / 2) continue;
          const touch = (o.it.bomb ? 1.2 : 1.0) * S;
          const dist = Math.hypot(dx, dy);
          if (dist < touch) hard += (touch - dist) / S;
          // swipes through a fruit run mostly sideways or diagonally, so a neighbour
          // level with the target needs more room than one above or below it
          const adist = Math.hypot(dx / 1.35, dy);
          if (adist < room) soft += (0.25 * (room - adist)) / S;
          if (o.lw && adx < (o.lw + T.lw) / 2 && Math.abs(dy) < lh) soft += 0.1;
        }
        if (3 * hard + soft >= limit) break;
      }
      return { hard, soft };
    }

    function labelWidth(word) {
      let v = labelWidths.get(word.id);
      if (v == null) {
        const ctx = cv.ctx;
        const base = clamp(R * 0.7, 22, 31);
        ctx.font = `700 ${base}px ${AR_FONT}`;
        const w0 = ctx.measureText(word.ar).width || 1;
        const fs = Math.max(20, Math.min(base, Math.floor((base * Math.max(R * 2.9, 96)) / w0)));
        v = (w0 * fs) / base + fs * 0.24;
        if (fontsOk) labelWidths.set(word.id, v);
      }
      return v;
    }

    function resolveWave(w, cell) {
      w.resolved = true;
      logWave(w, cell);
      for (let i = s.fruits.length - 1; i >= 0; i--) {
        const f = s.fruits[i];
        if (f.wave !== w) continue;
        if (!f.launched) s.fruits.splice(i, 1);
        else if (!f.sliced && f.fade == null) f.fade = 1;
      }
      // After a mistake the next prompt waits until the reveal has been readable for a
      // moment, so the new English word never sits on top of the old Arabic one.
      s.nextWaveAt = Math.max(s.time + diff().gap, s.revealUntil ? s.revealAt + REVEAL_READ : 0);
    }
    /** One share-grid cell per wave: ❌ wrong slice, 💣 bomb, 💨 dropped, 🔥 combo up, ⚡ fast, 🍉 sliced. */
    function logWave(w, cell) {
      if (w.logged) return;
      w.logged = true;
      s.log.push(w.mistake ? '❌' : w.bombed ? '💣' : (cell ?? '💨'));
    }

    // ---------------------------------------------------------- banner & reveal
    function setBanner(target) {
      $banner.classList.remove('good', 'bad', 'pop', 'shake');
      if (!target) {
        $banner.classList.remove('on');
        return;
      }
      const { text: main, inline } = promptParts(target);
      const gl = glyphFor(target);
      $emoji.textContent = gl.emoji ?? gl.tag;
      $emoji.classList.toggle('tag', !gl.emoji);
      $lbl.textContent = 'Slice the Arabic for';
      // an inline note ("to wake (someone) up") is shown lighter than the words around it
      $en.innerHTML = esc(main).replace(/\([^)]*\)/g, (m) => `<span class="nj-paren">${m}</span>`);
      $hint.textContent = promptHint(target, main, inline);
      fitPrompt();
      void $banner.offsetWidth; // restart the pop animation
      $banner.classList.add('on', 'pop');
    }
    /** Shrinks a long prompt until it fits the banner instead of cutting it with "…". */
    function fitPrompt() {
      $en.style.fontSize = '';
      const base = H < COMPACT_H ? 20 : 24; // matches .nj-en in the CSS
      // fractional widths: CSS adds the "…" for any sub-pixel overflow, scrollWidth rounds
      const range = document.createRange();
      range.selectNodeContents($en);
      const over = () => range.getBoundingClientRect().width > $en.getBoundingClientRect().width - 1;
      for (let px = base; px > 15 && over(); px--) $en.style.fontSize = `${px - 1}px`;
      range.detach?.();
    }
    function bannerState(cls) {
      $banner.classList.remove('good', 'bad', 'pop', 'shake');
      void $banner.offsetWidth;
      if (cls === 'good') {
        $banner.classList.add('good', 'pop');
        $lbl.textContent = 'Sliced!';
      } else if (cls === 'bad') $banner.classList.add('bad', 'shake');
    }
    const arSpan = (w) => `<bdi class="ar" dir="rtl" lang="ar">${esc(w.ar)}</bdi>`;
    function reveal(kind, html) {
      root.classList.add('nj-revealing');
      $reveal.className = `nj-reveal on ${kind}`;
      $reveal.innerHTML = html;
      s.revealAt = s.time;
      s.revealUntil = s.time + 2.4;
      s.floaters = s.floaters.filter((fl) => fl.tag !== 'tut'); // the tutorial line would show through
    }
    function hideReveal() {
      root.classList.remove('nj-revealing');
      $reveal.className = 'nj-reveal';
    }

    // ---------------------------------------------------------- effects
    function floater(text, x, y, o = {}) {
      s.floaters.push({ text, x: clamp(x, 40, W - 40), y: clamp(y, 30, H - 34), t: 0, life: o.life ?? 1, vy: o.vy ?? -60, size: o.size ?? 26, color: o.color ?? '#fff', font: o.font ?? UI_FONT, weight: o.weight ?? 800, stroke: o.stroke ?? 'rgba(25,10,0,0.9)', tag: o.tag ?? null });
    }
    function juice(f, ang) {
      const col = FRUITS[f.type].juice;
      const n = rm ? 8 : 20;
      for (let i = 0; i < n; i++) {
        const a = ang + (Math.random() < 0.5 ? 1 : -1) * Math.PI * 0.5 + (Math.random() - 0.5) * 1.7;
        const sp = 70 + Math.random() * 280;
        const along = (Math.random() - 0.5) * f.r * 1.4;
        s.parts.push({
          kind: 'drop', x: f.x + Math.cos(ang) * along, y: f.y + Math.sin(ang) * along,
          vx: Math.cos(a) * sp + f.vx * 0.3, vy: Math.sin(a) * sp + f.vy * 0.25 - 50,
          life: 0.45 + Math.random() * 0.55, max: 1, size: 2 + Math.random() * 4.5, color: col, g: 900,
        });
      }
      const blobs = Array.from({ length: 7 }, () => {
        const a = Math.random() * TAU;
        const d = f.r * (0.7 + Math.random() * 0.8);
        return [Math.cos(a) * d, Math.sin(a) * d, f.r * (0.1 + Math.random() * 0.22)];
      });
      s.splats.push({ x: f.x, y: f.y, r: f.r * (0.75 + Math.random() * 0.25), color: col, life: 2.8, max: 2.8, blobs });
      if (s.splats.length > 10) s.splats.shift();
    }
    function split(f, ang) {
      const sp = sprites.half[f.type];
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const push = 80 + Math.random() * 50;
      for (const side of [-1, 1]) {
        s.halves.push({
          sp, x: f.x + nx * side * f.r * 0.12, y: f.y + ny * side * f.r * 0.12,
          vx: f.vx * 0.5 + nx * push * side, vy: Math.min(f.vy * 0.4, 0) + ny * push * side - 60,
          rot: ang + (side > 0 ? Math.PI : 0), vr: side * (1.2 + Math.random() * 2.2) * (rm ? 0.3 : 1), life: 2.2, g: Math.max(700, f.g),
        });
      }
      s.cuts.push({ x: f.x, y: f.y, ang, len: f.r * 2.6, life: 0.2 });
    }
    function explode(f) {
      const n = rm ? 14 : 36;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = 120 + Math.random() * 420;
        s.parts.push({ kind: 'spark', x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.45, max: 0.8, size: 2 + Math.random() * 2, color: Math.random() < 0.5 ? '#ffd43b' : '#ff6b00', g: 300 });
      }
      for (let i = 0; i < (rm ? 4 : 10); i++) {
        const a = Math.random() * TAU;
        const sp = 20 + Math.random() * 90;
        s.parts.push({ kind: 'smoke', x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.8 + Math.random() * 0.6, max: 1.4, size: f.r * (0.4 + Math.random() * 0.4), color: '60,60,60', g: -40 });
      }
      s.splats.push({ x: f.x, y: f.y, r: f.r * 1.1, color: '#140c06', life: 3, max: 3, blobs: [] });
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

    // ---------------------------------------------------------- outcomes
    function slice(f, ang) {
      if (!s || s.phase !== 'play' || f.sliced || f.fade != null || !f.launched) return;
      f.sliced = true;
      if (f.bomb) return bombHit(f);
      split(f, ang);
      juice(f, ang);
      if (f.isTarget) targetHit(f);
      else wrongHit(f);
    }

    function targetHit(f) {
      const w = f.wave;
      // After a wrong slice the ring shows where the answer is: slicing it then is
      // practice (+5, spoken) but does not count as a word the player knew.
      const late = w.mistake;
      let cell = null;
      if (late) s.lateHits++;
      else s.correct++;
      kit.sfx.swish();
      kit.sfx.good();
      kit.haptic(15);
      kit.speak(f.word.ar);
      let label;
      if (late) {
        s.score += 5;
        label = '+5';
      } else {
        const before = multFor(s.streak);
        s.streak++;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        const mult = multFor(s.streak);
        const fast = f.visibleAt == null || s.time - f.visibleAt < 0.8;
        const base = fast ? 15 : 10;
        s.score += base * mult;
        label = `+${base}${mult > 1 ? ` ×${mult}` : ''}${fast ? ' ⚡' : ''}`;
        if (fast) s.fast++;
        cell = mult > before ? '🔥' : fast ? '⚡' : '🍉';
        if (mult > before) {
          kit.sfx.combo(s.streak);
          // under the strip, unless the fruit was cut up there: then below its score line
          const top = clamp(f.y, topLimit - R * 0.5, H - 70) - f.r * 0.6;
          const cy = Math.abs(top - (stripY + 6)) < 52 ? Math.min(H - 50, top + f.r * 1.9 + 34) : stripY + 6;
          floater(`🔥 COMBO ×${mult}!`, W / 2, cy, { size: 34, color: '#ffd43b', life: 1.2, vy: -12 });
          flash('255,212,59', 0.18);
        }
      }
      const ay = clamp(f.y, topLimit - R * 0.5, H - 70);
      floater(label, f.x, ay - f.r * 0.6, { size: 28, color: late ? '#e9ecef' : '#ffe066', life: 0.95 });
      floater(f.word.tr, f.x, ay + f.r * 0.55, { size: 17, color: '#d3f9d8', weight: 700, life: 0.95, vy: -40 });
      kit.hud.score(s.score);
      updateExtra();
      bannerState('good');
      resolveWave(w, cell);
    }

    function wrongHit(f) {
      const w = f.wave;
      const t = w.target;
      s.streak = 0;
      s.mistakes++;
      updateExtra();
      addMissed(t);
      addMissed(f.word);
      requeue(t, 3);
      requeue(f.word, 6);
      w.mistake = true;
      kit.sfx.swish();
      kit.sfx.bad();
      kit.haptic([40, 30, 60]);
      kit.speak(t.ar);
      flash('255,40,40', 0.38);
      shake(7, 0.3);
      bannerState('bad');
      const ay = clamp(f.y, topLimit - R * 0.5, H - 70);
      floater('✗', f.x, ay - f.r * 0.2, { size: 46, color: '#ff6b6b', life: 0.8, vy: -30 });
      floater(promptOf(f.word, 20), f.x, ay + f.r * 0.7, { size: 17, color: '#ffc9c9', weight: 700, life: 1.1, vy: -30 });
      reveal('bad', `<div>✗ ${arSpan(f.word)} <span class="tr">${esc(f.word.tr)}</span> = ${esc(promptOf(f.word))}</div>
        <div class="ok">✓ “${esc(promptOf(t))}” is ${arSpan(t)} <span class="tr">${esc(t.tr)}</span></div>`);
      loseLife(true);
    }

    function bombHit(f) {
      s.streak = 0;
      s.bombsHit++;
      f.wave.bombed = true;
      updateExtra();
      explode(f);
      kit.sfx.bad();
      kit.sfx.swish();
      kit.haptic([70, 40, 110]);
      flash('255,245,230', 0.75);
      shake(16, 0.45);
      bannerState('bad');
      floater('BOOM!', f.x, f.y, { size: 38, color: '#ffa94d', life: 0.9, vy: -40 });
      reveal('boom', '<div>💣 Boom! Slice fruit — never the bombs.</div>');
      loseLife(true);
    }

    function escape(f) {
      const w = f.wave;
      if (w.resolved) return;
      const t = w.target;
      if (f.visibleAt == null && !w.mistake) return voidWave(w);
      s.streak = 0;
      updateExtra();
      if (!w.mistake) {
        // A wave already lost to a wrong slice is not charged twice.
        addMissed(t);
        requeue(t, 3);
        kit.sfx.bad();
        kit.haptic(45);
        kit.speak(t.ar);
        flash('255,40,40', 0.3);
        bannerState('bad');
        reveal('bad', `<div>💨 Missed! ${arSpan(t)} <span class="tr">${esc(t.tr)}</span> = ${esc(promptOf(t))}</div>`);
        floater(t.ar, clamp(f.x, 60, W - 60), H - 40, { size: 30, font: AR_FONT, weight: 700, color: '#ffc9c9', life: 1.3, vy: -50 });
        resolveWave(w, '💨');
        loseLife();
      } else resolveWave(w);
    }

    /** Cancels a wave the player never had a fair chance at (its target was never on
     *  screen, e.g. after rotating the phone): no penalty, same word asked again. */
    function voidWave(w) {
      w.resolved = true;
      for (let i = s.fruits.length - 1; i >= 0; i--) {
        const f = s.fruits[i];
        if (f.wave !== w) continue;
        if (!f.launched) s.fruits.splice(i, 1);
        else if (!f.sliced && f.fade == null) f.fade = 1;
      }
      if (w.bombed) logWave(w);
      s.waves--;
      s.retry = w.target;
      s.nextWaveAt = s.time + 0.4;
    }

    /** Costs a heart. Slice mistakes within 0.35 s of the last one are forgiven so a
     *  single frantic swipe through several fruits cannot end the whole run. */
    function loseLife(grace = false) {
      if (grace && s.time - s.hurtAt < 0.35) return;
      s.hurtAt = s.time;
      s.lives--;
      kit.hud.lives(Math.max(0, s.lives), MAX_LIVES);
      if (s.lives <= 0) gameOver();
    }

    function updateExtra() {
      const m = multFor(s.streak);
      kit.hud.extra(m > 1 ? `🔥×${m}` : s.streak >= 2 ? `🔥${s.streak}` : '');
    }

    function gameOver() {
      s.phase = 'over';
      s.auto = null;
      s.timeScale = rm ? 1 : 0.3;
      s.overT = 0;
      s.fruits = s.fruits.filter((f) => f.launched);
      strokes.clear();
    }

    function finish() {
      s.ended = true;
      if (s.wave && !s.wave.resolved) logWave(s.wave); // the wave the round ended on
      const { score, correct, waves, bestStreak, log } = s;
      const pill = (t) =>
        `<span style="display:inline-block;background:#fff4e6;border:1px solid #ffd8a8;color:#7c2d12;border-radius:999px;padding:4px 10px;font-size:.85rem;font-weight:600;margin:3px">${t}</span>`;
      const cells = log.slice(0, 30);
      const grid = cells.map((c, i) => c + (i % 10 === 9 && i < cells.length - 1 ? '\n' : '')).join('') + (log.length > 30 ? '…' : '');
      const lv = s.daily ? `Daily #${s.day}` : (LEVELS.find((l) => l.id === s.level)?.label ?? 'Top 300');
      const top = multFor(bestStreak);
      const stats = [`✅ ${correct}/${waves}`, s.fast ? `⚡${s.fast} fast` : '', top > 1 ? `🔥×${top} combo` : bestStreak >= 2 ? `🔥 streak ${bestStreak}` : ''].filter(Boolean).join(' · ');
      const result = {
        score,
        correct,
        total: waves,
        won: false,
        missed: s.missed.slice(),
        title: `🥷 ${correct} word${correct === 1 ? '' : 's'} sliced`,
        detail: `<div style="margin:12px 0 2px;text-align:center">${pill(`🍉 <b>${correct}</b>/${waves} waves`)}${bestStreak >= 2 ? pill(`🔥 best streak <b>${bestStreak}</b>`) : ''}${multFor(bestStreak) > 1 ? pill(`⚡ top combo <b>×${multFor(bestStreak)}</b>`) : ''}</div>`,
        shareText: `🥷 Word Ninja · ${score} pts · ${lv}\n${grid}\n${stats}\nI sliced ${correct} Libyan Arabic word${correct === 1 ? '' : 's'}. Can you beat me?`,
        meta: { waves, bestStreak, bombs: s.bombsHit, mistakes: s.mistakes, late: s.lateHits, fast: s.fast },
      };
      loop.stop();
      render();
      kit.end(result);
    }

    // ---------------------------------------------------------- input
    const localPt = (e, rect) => ({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const canSlice = () => !!s && s.phase === 'play' && kit.playing;

    function sliceSegment(a, b) {
      const hits = [];
      for (const f of s.fruits) {
        if (!f.launched || f.sliced || f.fade != null) continue;
        const t = segHit(a.x, a.y, b.x, b.y, f.x, f.y, f.r * 1.02 + 5);
        if (t >= 0) hits.push({ f, t });
      }
      if (!hits.length) return;
      hits.sort((p, q) => p.t - q.t);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      for (const { f } of hits) {
        if (!canSlice()) break;
        slice(f, ang);
      }
    }

    function onDown(e) {
      if (!s || !kit.playing || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const p = { ...localPt(e, cv.canvas.getBoundingClientRect()), t: performance.now() };
      const st = { id: e.pointerId, pts: [p], last: p, alive: true, down: p, moved: 0 };
      strokes.set(e.pointerId, st);
      trails.push(st);
      if (!loop.running) render();
    }
    function onMove(e) {
      const st = strokes.get(e.pointerId);
      if (!st) return;
      e.preventDefault();
      const rect = cv.canvas.getBoundingClientRect();
      const co = e.getCoalescedEvents?.();
      const list = co?.length ? co : [e];
      const now = performance.now();
      let dist = 0;
      for (const ev of list) {
        const p = { ...localPt(ev, rect), t: now };
        const last = st.last;
        const d = Math.hypot(p.x - last.x, p.y - last.y);
        if (d < 1.5) continue;
        dist += d;
        st.moved += d;
        st.pts.push(p);
        st.last = p;
        if (canSlice()) sliceSegment(last, p);
      }
      const dtm = Math.max(1, now - (st.tPrev ?? now - 16));
      st.tPrev = now;
      if (dist / dtm > 1.5 && now - lastSwish > 320 && kit.playing) {
        lastSwish = now;
        kit.sfx.swish();
      }
      if (st.pts.length > 40) st.pts.splice(0, st.pts.length - 40);
    }
    let lastTapHint = 0;
    function onUp(e) {
      const st = strokes.get(e.pointerId);
      if (!st) return;
      st.alive = false;
      strokes.delete(e.pointerId);
      // A tap (no swipe) on a fruit slices nothing: say how to slice instead of
      // silently ignoring it.
      const now = performance.now();
      if (e.type === 'pointerup' && st.moved < 12 && now - st.down.t < 350 && canSlice() && now - lastTapHint > 900) {
        const { x, y } = st.down;
        const f = s.fruits.find((o) => o.launched && !o.sliced && o.fade == null && Math.hypot(o.x - x, o.y - y) < o.r * 1.1);
        if (f) {
          lastTapHint = now;
          kit.sfx.tap();
          floater(kit.isTouch ? '👆 Swipe through it!' : '🖱️ Drag through it!', f.x, clamp(f.y - f.r * 1.6, topLimit - R, H - 60), { size: 18, color: '#ffe8cc', life: 1.1, vy: -25 });
          if (!loop.running) render();
        }
      }
    }
    const noMenu = (e) => e.preventDefault();
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('lostpointercapture', onUp);
    root.addEventListener('contextmenu', noMenu);

    // ---------------------------------------------------------- debug auto-slice
    function ghostSwipe(f, ang) {
      const now = performance.now();
      const L = f.r * 1.9;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      trails.push({
        id: 'auto',
        alive: false,
        pts: [-1, -0.33, 0.33, 1].map((k, i) => ({ x: f.x + c * L * k, y: f.y + sn * L * k, t: now - 45 + i * 15 })),
      });
    }
    function autoSlice() {
      if (!s.auto) return;
      const live = s.fruits.filter((f) => f.launched && !f.sliced && f.fade == null && f.y < H - f.r * 0.3 && f.y > 0);
      const f = s.auto === 'target' ? live.find((x) => x.isTarget) : (live.find((x) => !x.isTarget && !x.bomb) ?? live.find((x) => x.bomb));
      if (!f) return;
      s.auto = null;
      const ang = -0.5 + (Math.random() - 0.5) * 0.6;
      ghostSwipe(f, ang);
      slice(f, ang);
    }

    // ---------------------------------------------------------- simulation
    function step(dtReal) {
      if (!s) return render();
      const dt = dtReal * s.timeScale;
      s.time += dt;
      if (s.phase === 'intro' || s.phase === 'play') {
        if (s.nextWaveAt != null && s.time >= s.nextWaveAt && fontsOk) startWave();
        for (const f of s.fruits) {
          if (!f.launched && s.time >= f.launchAt) {
            f.launched = true;
            if (f.bomb) kit.sfx.tick();
          }
        }
      }
      update(dt);
      if (s.phase === 'play') autoSlice();
      if (s.revealUntil && s.time > s.revealUntil) {
        s.revealUntil = 0;
        hideReveal();
      }
      if (fx.shakeT > 0) fx.shakeT = Math.max(0, fx.shakeT - dtReal);
      if (fx.flashT > 0) fx.flashT = Math.max(0, fx.flashT - dtReal * 3);
      if (s.phase === 'over') {
        s.overT += dtReal;
        if (s.overT >= 1.4 && !s.ended) return finish();
      }
      render();
    }

    function update(dt) {
      for (const f of s.fruits) {
        if (!f.launched) continue;
        f.vy += f.g * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
        if (f.fade != null) f.fade -= dt * 4.5;
        if (f.visibleAt == null && f.y + f.r * 0.4 < H) f.visibleAt = s.time;
        if (f.bomb && !rm && Math.random() < dt * 24) {
          const [fx0, fy0] = fuseTip(f);
          s.parts.push({ kind: 'spark', x: fx0, y: fy0, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 120, life: 0.25, max: 0.25, size: 1.5, color: '#ffd43b', g: 200 });
        }
      }
      for (let i = s.fruits.length - 1; i >= 0; i--) {
        const f = s.fruits[i];
        if (f.sliced || (f.fade != null && f.fade <= 0)) {
          s.fruits.splice(i, 1);
        } else if (f.launched && f.vy > 0 && f.y - f.r * 1.4 > H) {
          s.fruits.splice(i, 1);
          if (f.isTarget && f.fade == null && s.phase === 'play') escape(f);
        }
      }
      for (let i = s.halves.length - 1; i >= 0; i--) {
        const p = s.halves[i];
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.life -= dt;
        if (p.life <= 0 || p.y > H + 120) s.halves.splice(i, 1);
      }
      for (let i = s.parts.length - 1; i >= 0; i--) {
        const p = s.parts[i];
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'smoke') p.size *= 1 + dt * 0.9;
        p.life -= dt;
        if (p.life <= 0) s.parts.splice(i, 1);
      }
      if (s.parts.length > 320) s.parts.splice(0, s.parts.length - 320);
      for (let i = s.floaters.length - 1; i >= 0; i--) {
        const fl = s.floaters[i];
        fl.t += dt;
        fl.y += fl.vy * dt;
        fl.vy *= 1 - dt * 1.5;
        if (fl.t >= fl.life) s.floaters.splice(i, 1);
      }
      for (let i = s.splats.length - 1; i >= 0; i--) {
        s.splats[i].life -= dt;
        if (s.splats[i].life <= 0) s.splats.splice(i, 1);
      }
      for (let i = s.cuts.length - 1; i >= 0; i--) {
        s.cuts[i].life -= dt;
        if (s.cuts[i].life <= 0) s.cuts.splice(i, 1);
      }
    }

    function fuseTip(f) {
      const lx = f.r * BOMB_FUSE[0];
      const ly = f.r * BOMB_FUSE[1];
      const c = Math.cos(f.rot);
      const sn = Math.sin(f.rot);
      return [f.x + lx * c - ly * sn, f.y + lx * sn + ly * c];
    }

    // ---------------------------------------------------------- rendering
    function drawSprite(ctx, sp, x, y, rot, scale = 1) {
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      const z = sp.size * scale * (R / SPRITE_R);
      ctx.drawImage(sp.c, -z / 2, -z / 2, z, z);
      ctx.restore();
    }

    function labelSize(ctx, f) {
      if (f.fs != null) return f.fs;
      const base = clamp(R * 0.7, 22, 31);
      ctx.font = `700 ${base}px ${AR_FONT}`;
      const wdt = ctx.measureText(f.word.ar).width || 1;
      const maxW = Math.max(R * 2.9, 96);
      const fs = Math.max(20, Math.min(base, Math.floor((base * maxW) / wdt)));
      if (fontsOk) f.fs = fs;
      return fs;
    }

    function render() {
      if (destroyed || !cv) return;
      const ctx = cv.ctx;
      const now = performance.now();
      ctx.save();
      ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
      if (fx.shakeT > 0 && fx.shakeDur) {
        const k = (fx.shakeT / fx.shakeDur) * fx.shakeMag;
        ctx.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k);
      }
      if (bg) ctx.drawImage(bg, -BG_PAD, -BG_PAD, W + BG_PAD * 2, H + BG_PAD * 2);
      if (!s) {
        idleScene(ctx);
        ctx.restore();
        return;
      }
      // juice stains on the board
      for (const sp of s.splats) {
        ctx.globalAlpha = 0.5 * Math.min(1, sp.life / sp.max / 0.5);
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r, 0, TAU);
        for (const [bx, by, br] of sp.blobs) {
          ctx.moveTo(sp.x + bx + br, sp.y + by);
          ctx.arc(sp.x + bx, sp.y + by, br, 0, TAU);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const p of s.halves) {
        ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
        drawSprite(ctx, p.sp, p.x, p.y, p.rot);
      }
      ctx.globalAlpha = 1;
      const live = [];
      for (const f of s.fruits) {
        if (!f.launched) continue;
        if (f.fade != null) {
          ctx.globalAlpha = clamp(f.fade, 0, 1);
          drawSprite(ctx, f.bomb ? sprites.bomb : sprites.whole[f.type], f.x, f.y, f.rot, 0.55 + 0.45 * clamp(f.fade, 0, 1));
          ctx.globalAlpha = 1;
          continue;
        }
        live.push(f);
        if (f.bomb) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 90);
          const gl = ctx.createRadialGradient(f.x, f.y, f.r * 0.6, f.x, f.y, f.r * 1.7);
          gl.addColorStop(0, `rgba(255,40,40,${0.25 + 0.25 * pulse})`);
          gl.addColorStop(1, 'rgba(255,40,40,0)');
          ctx.fillStyle = gl;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * 1.7, 0, TAU);
          ctx.fill();
          drawSprite(ctx, sprites.bomb, f.x, f.y, f.rot);
          const [sx, sy] = fuseTip(f);
          const fl = 4 + Math.random() * 4;
          ctx.fillStyle = '#fff3bf';
          ctx.beginPath();
          ctx.arc(sx, sy, fl * 0.6, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#ffd43b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const a = k * (Math.PI / 4) + now / 120;
            ctx.moveTo(sx - Math.cos(a) * fl * 1.4, sy - Math.sin(a) * fl * 1.4);
            ctx.lineTo(sx + Math.cos(a) * fl * 1.4, sy + Math.sin(a) * fl * 1.4);
          }
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath();
          ctx.ellipse(f.x + f.r * 0.12, f.y + f.r * 0.2, f.r * 0.95, f.r * 0.85, 0, 0, TAU);
          ctx.fill();
          drawSprite(ctx, sprites.whole[f.type], f.x, f.y, f.rot);
        }
      }
      // highlight the right fruit after a mistake
      if (s.wave?.mistake) {
        for (const f of live) {
          if (!f.isTarget) continue;
          const pulse = 0.5 + 0.5 * Math.sin(now / 110);
          ctx.save();
          ctx.strokeStyle = `rgba(74,222,128,${0.65 + 0.35 * pulse})`;
          ctx.lineWidth = 4;
          ctx.setLineDash([10, 7]);
          ctx.lineDashOffset = -now / 25;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * 1.28 + pulse * 4, 0, TAU);
          ctx.stroke();
          ctx.restore();
          const bx = f.x + f.r * 0.98;
          const by = f.y - f.r * 0.98;
          ctx.fillStyle = '#2f9e44';
          ctx.beginPath();
          ctx.arc(bx, by, 13, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
          drawText(ctx, '✓', bx, by + 1, { size: 16, font: UI_FONT, weight: 800, color: '#fff' });
        }
      }
      // Arabic labels on top of every fruit so none is hidden by a neighbour
      for (const f of live) {
        if (f.bomb) continue;
        const fs = labelSize(ctx, f);
        drawText(ctx, f.word.ar, f.x, f.y + fs * 0.06, { size: fs, min: fs, font: AR_FONT, weight: 700, color: '#fff', stroke: 'rgba(30,12,3,0.94)', strokeWidth: Math.max(5, fs * 0.24) });
      }
      // slash streaks across freshly cut fruit
      for (const c of s.cuts) {
        const a = c.life / 0.2;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 3 * a + 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(c.x - Math.cos(c.ang) * c.len * 0.5, c.y - Math.sin(c.ang) * c.len * 0.5);
        ctx.lineTo(c.x + Math.cos(c.ang) * c.len * 0.5, c.y + Math.sin(c.ang) * c.len * 0.5);
        ctx.stroke();
      }
      for (const p of s.parts) {
        const a = clamp(p.life / p.max, 0, 1);
        if (p.kind === 'drop') {
          ctx.globalAlpha = Math.min(1, a * 1.6);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        } else if (p.kind === 'spark') {
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
          ctx.stroke();
        } else {
          ctx.globalAlpha = a * 0.45;
          ctx.fillStyle = `rgb(${p.color})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      drawTrails(ctx, now);
      for (const fl of s.floaters) {
        const k = fl.t / fl.life;
        const pop = 1 + 0.45 * Math.max(0, 1 - fl.t / 0.12);
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = `${fl.weight} ${fl.size * pop}px ${fl.font}`;
        const half = Math.min(W / 2 - 10, ctx.measureText(fl.text).width / 2 + 6);
        drawText(ctx, fl.text, clamp(fl.x, half + 4, W - half - 4), fl.y, { size: fl.size * pop, min: 10, maxWidth: W - 20, font: fl.font, weight: fl.weight, color: fl.color, stroke: fl.stroke, strokeWidth: Math.max(4, fl.size * 0.2) });
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (fx.flashT > 0) {
        ctx.save();
        ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
        ctx.fillStyle = `rgba(${fx.flashCol},${fx.flashA * fx.flashT})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    function drawTrails(ctx, now) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = trails.length - 1; i >= 0; i--) {
        const st = trails[i];
        const pts = st.pts.filter((p) => now - p.t < TRAIL_MS);
        if (!st.alive && !pts.length) {
          trails.splice(i, 1);
          continue;
        }
        if (pts.length < 2) continue;
        for (const [wd, col] of [[22, 'rgba(255,190,110,0.18)'], [12, 'rgba(255,236,190,0.35)']]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = wd;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (const p of pts) ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        for (let j = 1; j < pts.length; j++) {
          const k = j / (pts.length - 1);
          const age = 1 - (now - pts[j].t) / TRAIL_MS;
          ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * k})`;
          ctx.lineWidth = 2 + 8 * k * Math.max(0.35, age);
          ctx.beginPath();
          ctx.moveTo(pts[j - 1].x, pts[j - 1].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }

    function idleScene(ctx) {
      if (!sprites) return;
      const spots = [
        ['watermelon', 0.28, 0.42, -0.3],
        ['orange', 0.72, 0.34, 0.4],
        ['lemon', 0.62, 0.62, -0.2],
        ['olive', 0.22, 0.7, 0.5],
      ];
      ctx.globalAlpha = 0.85;
      for (const [t, x, y, rot] of spots) drawSprite(ctx, sprites.whole[t], W * x, H * y, rot);
      ctx.globalAlpha = 1;
    }

    // ---------------------------------------------------------- debug hooks
    kit.debug({
      info: () =>
        s
          ? {
              prompt: s.wave ? promptOf(s.wave.target) : null,
              targetId: s.wave?.target.id ?? null,
              targetAr: s.wave?.target.ar ?? null,
              fruits: s.fruits
                .filter((f) => f.launched && !f.sliced && f.fade == null)
                .map((f) => ({ label: f.bomb ? '💣' : f.word.ar, isTarget: f.isTarget, x: Math.round(f.x), y: Math.round(f.y), vx: Math.round(f.vx), vy: Math.round(f.vy), r: Math.round(f.r) })),
              lives: s.lives,
              score: s.score,
              correct: s.correct,
              lateHits: s.lateHits,
              waves: s.waves,
              streak: s.streak,
              crowd: s.wave?.crowd ?? null,
              phase: s.phase,
            }
          : { phase: 'idle' },
      answer: () => {
        if (s && s.phase !== 'over') s.auto = 'target';
      },
      wrong: () => {
        if (s && s.phase !== 'over') s.auto = 'wrong';
      },
    });

    // ---------------------------------------------------------- lifecycle
    function reset() {
      strokes.clear();
      trails.length = 0;
      fx.shakeT = 0;
      fx.flashT = 0;
      hideReveal();
    }

    return {
      start(opts) {
        reset();
        s = {
          pool: opts.pool,
          rng: opts.rng,
          level: opts.level,
          daily: !!opts.daily,
          day: opts.day,
          lrng: mulberry32(((opts.seed ?? 1) ^ 0x9e3779b9) >>> 0),
          deck: [],
          deckI: 0,
          queue: [],
          recent: [],
          requeued: new Map(),
          score: 0,
          lives: MAX_LIVES,
          correct: 0,
          lateHits: 0,
          fast: 0,
          waves: 0,
          streak: 0,
          bestStreak: 0,
          bombsHit: 0,
          mistakes: 0,
          missed: [],
          log: [],
          fruits: [],
          halves: [],
          parts: [],
          splats: [],
          floaters: [],
          cuts: [],
          wave: null,
          time: 0,
          timeScale: 1,
          phase: 'intro',
          nextWaveAt: 0.3,
          revealUntil: 0,
          revealAt: 0,
          retry: null,
          hurtAt: -9,
          overT: 0,
          ended: false,
          auto: null,
        };
        s.deck = buildDeck();
        kit.hud.score(0);
        kit.hud.lives(MAX_LIVES, MAX_LIVES);
        kit.hud.extra('');
        setBanner(null);
        measureTop();
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
        for (const st of strokes.values()) st.alive = false;
        strokes.clear();
        // Lives are already gone (game-over slow-mo): end the round now rather than
        // freeze it, so Restart / Quit on the pause screen cannot throw the result away.
        // Deferred so the shell finishes opening its pause panel, which kit.end replaces.
        if (s && s.phase === 'over' && !s.ended) {
          const round = s;
          queueMicrotask(() => {
            if (s === round && !round.ended && !destroyed) finish();
          });
        }
      },
      resume() {
        if (s && !s.ended) loop.start();
      },
      destroy() {
        destroyed = true;
        clearTimeout(bgTimer);
        loop.stop();
        s = null;
        root.removeEventListener('pointerdown', onDown);
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerup', onUp);
        root.removeEventListener('pointercancel', onUp);
        root.removeEventListener('lostpointercapture', onUp);
        root.removeEventListener('contextmenu', noMenu);
        cv.destroy();
        root.remove();
        style.remove();
      },
    };
  },
};
