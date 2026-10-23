// Shared engine for the arcade word games: full-screen mobile shell (start /
// pause / game-over screens), word pools, seeded randomness for daily puzzles,
// canvas + Arabic text helpers, gestures, sound, haptics and sharing.
// See public/games/README.md for the game-module contract.

import { dubbiSVG } from '../mascot.js';

// ------------------------------------------------------------------ randomness & days
const DAY = 86_400_000;
/** Daily puzzle #1 is 2026-10-23 (local date). */
export const EPOCH_LOCAL = [2026, 9, 23];

export function dayNumber(d = new Date()) {
  const today = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((today - Date.UTC(...EPOCH_LOCAL)) / DAY) + 1;
}

export function hashString(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h >>> 0;
}

/** Small fast seeded PRNG → function returning floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ Arabic text
const TASHKEEL = /[ً-ْٰـ]/g;
export const stripTashkeel = (s) => String(s ?? '').replace(TASHKEEL, '');
/** Comparison form: no diacritics/tatweel, alef variants → ا, ى → ي (ة kept). */
export const normAr = (s) =>
  stripTashkeel(s)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
/** Base Arabic letters of a single word (for letter-grid games). */
export const arLetters = (s) => [...normAr(s).replace(/[^ء-ي]/g, '')];
export const isSingleWord = (w) => !/\s/.test(normAr(w.ar)) && !/[.؟?!،,]/.test(w.ar);

export const AR_FONT = '"Noto Naskh Arabic", "Geeza Pro", "Arial", serif';
export const UI_FONT = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

let fontsPromise = null;
/** Resolves once the Arabic + UI web fonts are usable on canvas (max ~2.5s). */
export function fontsReady() {
  fontsPromise ??= Promise.race([
    Promise.all([
      document.fonts?.load(`600 32px ${AR_FONT}`, 'كلمة'),
      document.fonts?.load(`700 20px ${UI_FONT}`, 'Score'),
    ]).catch(() => {}),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  return fontsPromise;
}

// ------------------------------------------------------------------ word pools
export const LEVELS = [
  { id: 'mine', label: 'My words', hint: 'words you have studied' },
  { id: 'top100', label: 'Top 100', n: 100 },
  { id: 'top300', label: 'Top 300', n: 300 },
  { id: 'top1000', label: 'Top 1000', n: 1000 },
  { id: 'top5000', label: 'All 5000+', n: Infinity },
];

/**
 * Words for a level, most-used first. `filter` is the game's own suitability
 * test (e.g. short labels). Falls back to wider levels if too few words pass.
 */
export function buildPool(words, { level = 'top300', learnedIds = new Set(), filter = () => true, min = 12 } = {}) {
  const byRank = [...words].sort((a, b) => a.rank - b.rank).filter(filter);
  if (level === 'mine') {
    const mine = byRank.filter((w) => learnedIds.has(w.id));
    if (mine.length >= min) return mine;
    level = 'top300';
  }
  const lv = LEVELS.find((l) => l.id === level) ?? LEVELS[2];
  const pool = byRank.slice(0, lv.n === Infinity ? undefined : lv.n);
  return pool.length >= min ? pool : byRank.slice(0, Math.max(min, pool.length));
}

// Everyday synonym sets the deck glosses differently (mother / mum …).
const SYNONYMS = [
  ['mother', 'mum', 'mom', 'mama', 'mummy'],
  ['father', 'dad', 'papa', 'daddy'],
  ['hello', 'hi', 'hey', 'welcome'],
  ['yes', 'yeah', 'yep'],
  ['ok', 'okay', 'alright', 'all right', 'fine', 'good'],
  ['goodbye', 'bye', 'see you'],
  ['thanks', 'thank you'],
  ['a lot', 'very', 'much', 'many', 'lots'],
  ['house', 'home'],
  ['car', 'vehicle', 'automobile'],
  ['child', 'kid'],
  ['big', 'large'],
  ['small', 'little'],
  ['now', 'right now'],
  ['money', 'cash'],
];
const SYN = new Map();
SYNONYMS.forEach((set, i) => set.forEach((x) => SYN.set(x, `syn${i}`)));
/** Every English sense of a word as comparable keys ("to wake (someone) up" → "wake up"). */
function senseKeys(w) {
  const keys = new Set();
  for (const raw of String(w.en).toLowerCase().split(/[;,/]/)) {
    const k = raw
      .replace(/\([^)]*\)/g, ' ')
      .replace(/^\s*(to|a|an|the)\s+/, '')
      .replace(/[^a-z0-9' ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!k) continue;
    keys.add(k);
    if (SYN.has(k)) keys.add(SYN.get(k));
  }
  return keys;
}
// Arabic identity for distractors keeps shadda (خلّص "to pay" ≠ خلص "to end").
const arKey = (s) =>
  String(s ?? '')
    .replace(/[\u064B-\u0650\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .trim();
const keyCache = new WeakMap();
function keysOf(w) {
  let k = keyCache.get(w);
  if (!k) keyCache.set(w, (k = { ar: arKey(w.ar), senses: senseKeys(w) }));
  return k;
}
const overlaps = (a, b) => {
  for (const x of a) if (b.has(x)) return true;
  return false;
};

/**
 * n wrong answers for `word` drawn from `pool`: no shared English sense (or
 * common synonym) and different Arabic, preferring the same part of speech
 * and category so the choice takes real discrimination.
 */
export function distractors(word, pool, n, rng = Math.random) {
  const target = keysOf(word);
  const out = [];
  const usedAr = new Set([target.ar]);
  const usedSenses = new Set(target.senses);
  const take = (w) => {
    if (out.length >= n || w.id === word.id) return;
    const k = keysOf(w);
    if (usedAr.has(k.ar) || overlaps(k.senses, usedSenses)) return;
    usedAr.add(k.ar);
    k.senses.forEach((x) => usedSenses.add(x));
    out.push(w);
  };
  // Sample instead of shuffling whole tiers: cheap even on the 5000-word pool.
  const sameCat = [];
  const samePos = [];
  for (const w of pool) {
    if (w.pos !== word.pos) continue;
    (w.cat === word.cat ? sameCat : samePos).push(w);
  }
  for (const tier of [sameCat, samePos]) for (const w of shuffle(tier, rng)) if (out.length < n) take(w);
  for (let tries = 0; out.length < n && tries < pool.length * 3; tries++) take(pool[Math.floor(rng() * pool.length)]);
  return out;
}

// Parentheticals worth keeping in a label: they tell words apart (هذا "this (m.)" vs هذي "this (f.)").
const KEEP_PAREN = /^\((m|f|pl|sg|du|m\.\s*sg|f\.\s*sg|m\.\s*pl|f\.\s*pl|masc|fem|plural|formal|polite)\.?\)$/i;
/** Short English gloss for a game label: first sense, minor notes removed. */
export function shortEn(w, max = 22) {
  const noNotes = String(w.en).replace(/\s*\([^)]*\)/g, (m) => (KEEP_PAREN.test(m.trim()) ? m : ''));
  let s = noNotes.split(';')[0].trim() || String(w.en).split(';')[0].trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
  return s;
}

/** True when a word makes a compact label (single word or short collocation). */
export const shortLabel = (w, { arMax = 12, enMax = 24 } = {}) =>
  w.pos !== 'phrase' && stripTashkeel(w.ar).length <= arMax && shortEn(w, 99).length <= enMax;

// ------------------------------------------------------------------ sound & haptics
let actx = null;
let muted = (() => {
  try {
    return localStorage.getItem('arcade-sound') === 'off';
  } catch {
    return false;
  }
})();
function audio() {
  if (muted) return null;
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  } catch {
    return null;
  }
}
function tone(freq, { dur = 0.12, type = 'sine', vol = 0.12, at = 0, slide = 0 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise({ dur = 0.15, vol = 0.12, freq = 1800 } = {}) {
  const ac = audio();
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ac.destination);
  src.start();
}
export const sfx = {
  good: () => (tone(660, { type: 'triangle', dur: 0.09 }), tone(990, { type: 'triangle', dur: 0.14, at: 0.07 })),
  bad: () => tone(200, { type: 'sawtooth', dur: 0.28, vol: 0.09, slide: -90 }),
  tick: () => tone(880, { type: 'square', dur: 0.03, vol: 0.04 }),
  tap: () => tone(520, { type: 'triangle', dur: 0.05, vol: 0.07 }),
  flap: () => tone(420, { type: 'square', dur: 0.07, vol: 0.05, slide: 260 }),
  swish: () => noise({ dur: 0.12, vol: 0.18, freq: 2600 }),
  pop: () => tone(300, { type: 'sine', dur: 0.08, vol: 0.14, slide: 500 }),
  combo: (n = 1) => tone(Math.min(2000, 520 * Math.pow(1.122, Math.min(n, 24))), { type: 'triangle', dur: 0.1 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.16, at: i * 0.09 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, { type: 'sawtooth', dur: 0.2, vol: 0.07, at: i * 0.12 })),
  get muted() {
    return muted;
  },
  setMuted(m) {
    muted = !!m;
    try {
      localStorage.setItem('arcade-sound', muted ? 'off' : 'on');
    } catch {
      /* ignore */
    }
  },
};
export function haptic(pattern = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ canvas & loop
/**
 * Appends a HiDPI canvas filling `container` and keeps it sized. Drawing uses
 * CSS-pixel coordinates (0..w, 0..h).
 */
export function setupCanvas(container, { onResize } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'arcade-canvas';
  container.append(canvas);
  const ctx = canvas.getContext('2d');
  let w = 1;
  let h = 1;
  let dpr = 1;
  let sized = false;
  const resize = () => {
    const r = container.getBoundingClientRect();
    const nd = Math.min(window.devicePixelRatio || 1, 2.5);
    const nw = Math.max(1, Math.round(r.width));
    const nh = Math.max(1, Math.round(r.height));
    if (sized && nw === w && nh === h && nd === dpr) return; // resizing the bitmap would clear it
    sized = true;
    dpr = nd;
    w = nw;
    h = nh;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize?.(w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  return {
    canvas,
    ctx,
    get w() {
      return w;
    },
    get h() {
      return h;
    },
    get dpr() {
      return dpr;
    },
    destroy() {
      ro.disconnect();
      canvas.remove();
    },
  };
}

/** requestAnimationFrame loop with clamped dt in seconds. */
export function createLoop(step) {
  let raf = 0;
  let last = 0;
  let running = false;
  const frame = (t) => {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    step(dt, t);
    if (running) raf = requestAnimationFrame(frame);
  };
  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get running() {
      return running;
    },
  };
}

/**
 * Draws (RTL-aware) text centred at x,y, shrinking the font until it fits
 * maxWidth. Returns the font size used.
 */
export function drawText(ctx, text, x, y, { size = 24, min = 10, maxWidth = Infinity, font = AR_FONT, weight = 600, color = '#fff', rtl = /[؀-ۿ]/.test(text), align = 'center', baseline = 'middle', stroke = null, strokeWidth = 4 } = {}) {
  let px = size;
  ctx.font = `${weight} ${px}px ${font}`;
  while (px > min && ctx.measureText(text).width > maxWidth) {
    px -= 1;
    ctx.font = `${weight} ${px}px ${font}`;
  }
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.direction = 'ltr';
  return px;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Dubbi as an <img> for canvas games. The mascot SVG is styled by page CSS,
// which does not apply inside an image, so the needed rules are inlined.
const DUBBI_IMG_CSS =
  '.o{stroke:#4a1d2c;stroke-width:2.8;stroke-linejoin:round}.o.thin{stroke-width:2}.f-eye{fill:#4a1d2c}' +
  '.f-line{stroke:#4a1d2c;stroke-width:3.2;fill:none;stroke-linecap:round}.f-line.thin{stroke-width:2}' +
  '.f-z{fill:#8d96a0;font:700 14px sans-serif}.f-ear{transform-box:view-box}.f-ear-l{transform-origin:34px 31px}.f-ear-r{transform-origin:86px 31px}';
const dubbiCache = new Map();
/** Promise<HTMLImageElement> of Dubbi in a mood (viewBox 120×150). */
export function dubbiImage(mood = 'happy') {
  if (!dubbiCache.has(mood)) {
    const svg = dubbiSVG(mood)
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" ')
      .replace(/var\(--muted\)/g, '#8d96a0')
      .replace(/(<svg[^>]*>)/, `$1<style>${DUBBI_IMG_CSS}</style>`);
    const img = new Image();
    const p = new Promise((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
    });
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    dubbiCache.set(mood, p);
  }
  return dubbiCache.get(mood);
}

// ------------------------------------------------------------------ gestures
/**
 * Calls handler('left'|'right'|'up'|'down') on swipes and handler('tap') on
 * taps. Returns a cleanup function.
 */
export function onSwipe(el, handler, { threshold = 28 } = {}) {
  let sx = 0;
  let sy = 0;
  let st = 0;
  let id = null;
  const down = (e) => {
    id = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    st = performance.now();
  };
  const up = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) {
      if (performance.now() - st < 400) handler('tap', e);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) handler(dx > 0 ? 'right' : 'left', e);
    else handler(dy > 0 ? 'down' : 'up', e);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
}

// ------------------------------------------------------------------ sharing
/** Web Share sheet, falling back to the clipboard. Resolves 'shared' | 'copied' | 'failed'. */
export async function shareText({ title, text, url }) {
  const full = url ? `${text}\n${url}` : text;
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(full);
    return 'copied';
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = full;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok ? 'copied' : 'failed';
    } catch {
      return 'failed';
    }
  }
}

// ------------------------------------------------------------------ local storage
const store = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};
export const localBest = (id) => store.get(`arcade-best-${id}`, 0);

// ------------------------------------------------------------------ the shell
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Mounts a game full-screen and runs its lifecycle.
 * entry: registry metadata; mod: the game module's default export;
 * deps: { words, learnedIds, user, api, speak, toast, navigate, gamesUrl, query, onExit }
 * Returns a destroy() function.
 */
export function runGame(root, entry, mod, deps) {
  const { user } = deps;
  const query = deps.query ?? new URLSearchParams();
  document.body.classList.add('in-arcade');
  root.innerHTML = `
    <div class="arcade" style="--accent:${esc(entry.accent ?? '#1f883d')}">
      <div class="arcade-frame">
        <header class="arcade-hud">
          <button class="hud-btn" data-act="back" aria-label="Back to arcade">‹</button>
          <div class="hud-title"><span aria-hidden="true">${entry.emoji}</span> <span class="hud-name">${esc(entry.title)}</span></div>
          <div class="hud-stats"><span class="hud-extra" hidden></span><span class="hud-lives" hidden></span><span class="hud-score" aria-live="polite">0</span></div>
          <button class="hud-btn" data-act="sound" aria-label="Toggle sound">${sfx.muted ? '🔇' : '🔊'}</button>
          <button class="hud-btn" data-act="pause" aria-label="Pause" hidden>❚❚</button>
        </header>
        <div class="arcade-stage"></div>
        <div class="arcade-overlay" hidden><div class="arcade-panel" role="dialog" aria-modal="true"></div></div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const stage = $('.arcade-stage');
  const overlay = $('.arcade-overlay');
  const panel = $('.arcade-panel');
  const $score = $('.hud-score');
  const $lives = $('.hud-lives');
  const $extra = $('.hud-extra');
  const $pause = $('[data-act="pause"]');

  const minWords = mod.minWords ?? 12;
  const filter = mod.wordFilter ?? (() => true);
  const learnedCount = deps.words.filter((w) => deps.learnedIds.has(w.id) && filter(w)).length;
  // A challenge / ?seed link replays that exact round once (same words); later rounds are fresh.
  let linkSeed = Number(query.get('seed')) > 0 ? Number(query.get('seed')) : null;
  const linkLevel = LEVELS.some((l) => l.id === query.get('level') && l.id !== 'mine') ? query.get('level') : null;
  let level = store.get(`arcade-level-${entry.id}`, learnedCount >= Math.max(minWords, 30) ? 'mine' : 'top300');
  if (linkLevel) level = linkLevel;
  if (level === 'mine' && learnedCount < minWords) level = 'top300';
  const day = dayNumber();
  const dailyKey = `arcade-daily-${entry.id}-${day}`;
  let dailyDone = store.get(dailyKey, null); // { won, share }
  let playing = false;
  let paused = false;
  let current = null; // { daily, level, seed, t0, pausedMs, pauseAt }
  let destroyed = false;
  let round = 0;
  const challenge = Number(query.get('challenge')) > 0 ? { score: Number(query.get('challenge')), from: query.get('from') || 'A friend' } : null;

  const hud = {
    score(n) {
      $score.textContent = String(n);
    },
    lives(n, max = n) {
      $lives.hidden = false;
      $lives.textContent = '❤️'.repeat(Math.max(0, n)) + '🤍'.repeat(Math.max(0, max - n));
      $lives.setAttribute('aria-label', `${n} of ${max} lives`);
    },
    extra(text) {
      $extra.hidden = !text;
      $extra.textContent = text ?? '';
    },
  };

  const kit = {
    entry,
    stage,
    words: deps.words,
    learnedIds: deps.learnedIds,
    user,
    sfx,
    haptic,
    speak: (t) => !sfx.muted && deps.speak?.(t, true),
    /** Best score known for this game (server for logged-in users, else this browser). */
    get best() {
      return Math.max(localBest(entry.id), deps.best ?? 0);
    },
    hud,
    isTouch: matchMedia('(pointer: coarse)').matches,
    reducedMotion: reducedMotion(),
    distractors,
    shortEn,
    normAr,
    /** Exposes state for automated play-tests: window.__gameDebug. */
    debug(obj) {
      window.__gameDebug = obj;
    },
    get playing() {
      return playing && !paused;
    },
    end,
    toast: deps.toast,
  };

  let instance = null;
  try {
    instance = mod.create(stage, kit);
  } catch (err) {
    console.error(err);
    panel.innerHTML = `<h2>Could not start this game</h2><p>${esc(err.message)}</p><button class="btn" data-act="back">Back</button>`;
    overlay.hidden = false;
  }

  // ------------------------------------------------------------ panels
  function show(html) {
    panel.innerHTML = html;
    overlay.hidden = false;
    overlay.scrollTop = 0;
    $pause.hidden = true;
    (panel.querySelector('.btn.primary[data-act]') ?? panel.querySelector('button[data-act]:not(:disabled)'))?.focus({ preventScroll: true });
  }
  function resetHud() {
    hud.score(0);
    hud.extra('');
    $lives.hidden = true;
  }
  function hide() {
    overlay.hidden = true;
  }

  function startPanel() {
    const howTo = (mod.howTo ?? []).map((h) => `<li>${h}</li>`).join('');
    const levelChips = LEVELS.map((l) => {
      const disabled = l.id === 'mine' && learnedCount < minWords;
      const label = l.id === 'mine' ? `${l.label} (${learnedCount})` : l.label;
      return `<button class="chip ${l.id === level ? 'on' : ''}" data-level="${l.id}" ${disabled ? 'disabled title="Study more words first"' : ''}>${esc(label)}</button>`;
    }).join('');
    const dailyBtn = entry.daily
      ? dailyDone
        ? `<button class="btn lg block" data-act="daily-share">${dailyDone.won ? '✅' : '❌'} Daily #${day} done · Share</button>`
        : `<button class="btn primary lg block" data-act="daily">📅 Play Daily #${day}</button>`
      : '';
    show(`
      <div class="panel-emoji" aria-hidden="true">${entry.emoji}</div>
      <h2>${esc(entry.title)}</h2>
      <p class="panel-sub">${esc(entry.tagline)} <span class="muted">· inspired by ${esc(entry.inspiredBy)}</span></p>
      ${challenge ? `<div class="challenge">🏆 <strong>${esc(challenge.from)}</strong> scored <strong>${challenge.score}</strong>. Can you beat it?</div>` : ''}
      ${howTo ? `<ul class="howto">${howTo}</ul>` : ''}
      ${dailyBtn}
      <div class="level-row" role="group" aria-label="Word level">${levelChips}</div>
      <button class="btn ${entry.daily && !dailyDone ? '' : 'primary'} lg block" data-act="play">${entry.daily ? '♾️ Practice' : '▶ Play'}</button>
      <p class="panel-foot">Best: <strong>${Math.max(localBest(entry.id), deps.best ?? 0)}</strong>${user ? '' : ' · <a href="/signup" data-link>Sign up</a> to save scores &amp; earn XP'}</p>`);
  }

  function pausePanel() {
    show(`<div class="panel-emoji">⏸️</div><h2>Paused</h2>
      <button class="btn primary lg block" data-act="resume">▶ Resume</button>
      <button class="btn lg block" data-act="restart">↻ Restart</button>
      <button class="btn lg block" data-act="quit">Quit to menu</button>`);
  }

  // ------------------------------------------------------------ lifecycle
  function begin(daily) {
    if (!instance || destroyed) return;
    const lv = daily ? 'top1000' : level;
    const pool = buildPool(deps.words, { level: lv, learnedIds: deps.learnedIds, filter, min: minWords });
    const seed = daily ? hashString(`${entry.id}:${day}`) : linkSeed ?? (Math.random() * 2 ** 32) >>> 0;
    if (!daily) linkSeed = null;
    current = { daily, level: lv, seed, t0: performance.now(), pausedMs: 0, pauseAt: 0 };
    round++;
    resetHud();
    hide();
    playing = true;
    paused = false;
    $pause.hidden = !instance.pause;
    try {
      instance.start({ daily, level: lv, pool, rng: mulberry32(seed), seed, day });
    } catch (err) {
      console.error(err);
      playing = false;
      show(`<h2>Something went wrong</h2><p>${esc(err.message)}</p><button class="btn lg block" data-act="menu">Back</button>`);
    }
  }

  function pause() {
    if (!playing || paused || !instance?.pause) return;
    paused = true;
    current.pauseAt = performance.now();
    instance.pause();
    if (playing && paused) pausePanel(); // the game may have ended the round inside pause()
  }
  function resume() {
    if (!paused) return;
    paused = false;
    current.pausedMs += performance.now() - current.pauseAt;
    hide();
    $pause.hidden = !instance.pause;
    instance.resume?.();
  }

  /**
   * Called by the game when a round ends.
   * result: { score, correct, total, won, missed: [word], shareText, title, detail(html), meta }
   */
  async function end(result = {}) {
    if (!playing || destroyed) return;
    const myRound = round;
    playing = false;
    paused = false;
    const ms = Math.round(performance.now() - current.t0 - current.pausedMs);
    const score = Math.max(0, Math.round(result.score ?? 0));
    const prevLocal = localBest(entry.id);
    if (score > prevLocal) store.set(`arcade-best-${entry.id}`, score);
    const daily = !!current.daily;
    const shareBody = result.shareText ?? `${entry.emoji} I scored ${score} in ${entry.title} — learning Libyan Arabic words while I play! Can you beat me?`;
    if (daily) {
      dailyDone = { won: !!result.won, share: shareBody };
      store.set(dailyKey, dailyDone);
    }
    let server = null;
    if (user) {
      try {
        server = await deps.api(`/api/games/${entry.id}/result`, {
          method: 'POST',
          body: {
            score,
            correct: result.correct ?? 0,
            total: result.total ?? 0,
            msTaken: ms,
            daily,
            won: !!result.won,
            meta: { ...(result.meta ?? {}), level: current.level, seed: current.seed, day },
          },
        });
        deps.best = Math.max(deps.best ?? 0, server.best ?? 0);
        for (const a of server.achievements ?? []) deps.toast?.(`${a.icon} Achievement unlocked: <strong>${esc(a.title)}</strong>`);
      } catch (err) {
        console.warn('score not saved', err);
      }
    }
    if (destroyed || myRound !== round) return; // left or restarted while saving
    const best = Math.max(score, prevLocal, server?.best ?? 0);
    const isBest = server ? server.isBest : score > prevLocal && score > 0;
    const beatChallenge = challenge && score > challenge.score;
    const missed = [];
    const seenIds = new Set();
    for (const w of result.missed ?? []) if (w && !seenIds.has(w.id)) (seenIds.add(w.id), missed.push(w));
    const lost = result.won === false;
    const mood = result.won || ((isBest || beatChallenge) && !lost) ? 'cheer' : score > 0 ? 'happy' : 'sad';
    (result.won || (isBest && !lost) ? sfx.win : sfx.lose)();
    const shareUrl = daily
      ? deps.gamesUrl(entry.id)
      : deps.gamesUrl(entry.id, { challenge: score, from: user?.displayName ?? user?.username, seed: current.seed, level: current.level === 'mine' ? null : current.level });
    show(`
      <div class="over-head">${dubbiSVG(mood, 'over-dubbi')}<div>
        <div class="over-title">${esc(result.title ?? (result.won ? 'برافو! Well done!' : 'Game over'))}</div>
        <div class="over-score">${score}</div>
        <div class="over-best">${isBest ? '🎉 New personal best!' : `Best: ${best}`}${server?.rank ? ` · #${server.rank} worldwide` : ''}</div>
        ${server?.xp ? `<div class="over-xp">+${server.xp} XP</div>` : ''}
        ${beatChallenge ? `<div class="over-xp">🏆 You beat ${esc(challenge.from)}!</div>` : ''}
      </div></div>
      ${result.detail ?? ''}
      ${missed.length ? `<div class="missed"><div class="missed-h">Words to review (${missed.length})</div>${missed
        .slice(0, 24)
        .map((w) => `<button class="missed-w" data-say="${esc(w.ar)}"><span class="ar">${esc(w.ar)}</span><span class="tr">${esc(w.tr)}</span><span>${esc(shortEn(w, 40))}</span><span aria-hidden="true">🔊</span></button>`)
        .join('')}</div>` : ''}
      <button class="btn primary lg block" data-act="share">📤 Share${daily ? ' result' : ' & challenge'}</button>
      <button class="btn lg block" data-act="${daily ? 'menu' : 'again'}">${daily ? '♾️ Practice mode' : '↻ Play again'}</button>
      <button class="btn lg block" data-act="exit">Arcade</button>
      ${user ? '' : '<p class="panel-foot"><a href="/signup" data-link>Sign up</a> to save your scores, earn XP and get on the leaderboard.</p>'}`);
    panel.dataset.share = JSON.stringify({ text: shareBody, url: shareUrl });
  }

  async function share(data) {
    const r = await shareText({ title: entry.title, text: data.text, url: data.url });
    if (r === 'copied') deps.toast?.('Copied — paste it to your friends!');
    else if (r === 'failed') deps.toast?.('Could not share from this browser', true);
  }

  // ------------------------------------------------------------ events
  const onClick = (e) => {
    const say = e.target.closest('[data-say]');
    if (say) return deps.speak?.(say.dataset.say, true);
    const lv = e.target.closest('[data-level]');
    if (lv && !lv.disabled) {
      level = lv.dataset.level;
      store.set(`arcade-level-${entry.id}`, level);
      panel.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('on', b === lv));
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'back' || act === 'exit') return deps.onExit?.();
    if (act === 'sound') {
      sfx.setMuted(!sfx.muted);
      e.target.closest('[data-act]').textContent = sfx.muted ? '🔇' : '🔊';
      return;
    }
    if (act === 'pause') return pause();
    if (act === 'resume') return resume();
    if (act === 'play' || act === 'again') return begin(false);
    if (act === 'daily') return begin(true);
    if (act === 'restart') return (instance?.stop?.(), (playing = false), (paused = false), begin(current?.daily));
    if (act === 'quit' || act === 'menu') return (instance?.stop?.(), (playing = false), (paused = false), resetHud(), startPanel());
    if (act === 'share') return share(JSON.parse(panel.dataset.share || '{}'));
    if (act === 'daily-share') return share({ text: dailyDone?.share ?? '', url: deps.gamesUrl(entry.id) });
  };
  root.addEventListener('click', onClick);
  const onVis = () => document.hidden && pause();
  document.addEventListener('visibilitychange', onVis);
  const onKey = (e) => {
    if (e.key === 'Escape') (paused ? resume() : pause());
  };
  document.addEventListener('keydown', onKey);
  // Keep the page from scrolling / zooming while playing on touch screens.
  const noScroll = (e) => {
    if (e.target.closest('.arcade-stage') && e.cancelable) e.preventDefault();
  };
  root.addEventListener('touchmove', noScroll, { passive: false });
  // Create/resume the AudioContext inside a real user gesture (iOS needs this),
  // so the first sound of a swipe-driven game is not delayed or blocked.
  const unlockAudio = () => audio();
  root.addEventListener('pointerdown', unlockAudio, { once: true });

  if (instance) startPanel();

  return function destroy() {
    destroyed = true;
    playing = false;
    try {
      instance?.destroy?.();
    } catch (err) {
      console.error(err);
    }
    if (window.__gameDebug) delete window.__gameDebug;
    root.removeEventListener('click', onClick);
    root.removeEventListener('touchmove', noScroll);
    root.removeEventListener('pointerdown', unlockAudio);
    try {
      speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('in-arcade');
    root.innerHTML = '';
  };
}
