// Dubbi — the bear mascot, standing full height in a cream Libyan badla:
// red shenna cap with tassel, ivory shirt, gold-embroidered farmla vest,
// waist sash and baggy sirwal trousers. Cute-cartoon style: oversized head,
// big glossy eyes, thick plum outlines, flat warm colours. Inline SVG with
// moods, a speech bubble, and Libyan phrases.

const MOODS = ['happy', 'cheer', 'think', 'sad', 'wow', 'sleepy'];

const C = {
  line: '#4a1d2c',
  fur: '#d4885a',
  innerEar: '#9c2f35',
  muzzle: '#efb48b',
  mouth: '#a8343a',
  tongue: '#e0605e',
  shirt: '#fbf5e6',
  vest: '#ecdcb8',
  sirwal: '#e6d3ab',
  sash: '#d6bb82',
  gold: '#c8961a',
  red: '#c8102e',
};

// Arm angles (degrees, rotating a downward-pointing arm around the shoulder):
// positive swings the left arm outward, negative swings the right arm outward.
const POSES = {
  happy: { l: 16, r: -120, wave: 'r' },
  cheer: { l: 128, r: -128 },
  think: { l: 14, r: 119, front: 'r' }, // paw on chin, drawn over the face
  sad: { l: 6, r: -6 },
  wow: { l: 105, r: -105 },
  sleepy: { l: 10, r: -10 },
};

function arm(x, y, angle, wave) {
  return `<g transform="translate(${x} ${y}) rotate(${angle})"><g class="${wave ? 'f-wave' : ''}">
    <rect x="-7" y="-3" width="14" height="20" rx="7" fill="${C.shirt}" class="o"/>
    <path d="M-6.6 13.5 H6.6" stroke="${C.gold}" stroke-width="1.8"/>
    <ellipse cx="0" cy="21" rx="7.2" ry="7.6" fill="${C.fur}" class="o"/>
  </g></g>`;
}

// One big glossy eye: dark disc, large highlight upper-right, small lower-left.
const eye = (x, y, r = 7.4) =>
  `<circle cx="${x}" cy="${y}" r="${r}" class="f-eye"/>
   <circle cx="${x + r * 0.34}" cy="${y - r * 0.36}" r="${r * 0.36}" fill="#fff"/>
   <circle cx="${x - r * 0.42}" cy="${y + r * 0.42}" r="${r * 0.17}" fill="#fff"/>`;

/** Returns Dubbi's SVG for a mood. Pure markup, no state. */
export function dubbiSVG(mood = 'happy', cls = '') {
  if (!MOODS.includes(mood)) mood = 'happy';
  const brows = `<path d="M38 37 Q44 33.5 50 36" class="f-line thin"/><path d="M70 36 Q76 33.5 82 37" class="f-line thin"/>`;
  const eyes = {
    happy: brows + eye(44, 50) + eye(76, 50),
    cheer: `<path d="M37 52 Q44 42 51 52" class="f-line"/><path d="M69 52 Q76 42 83 52" class="f-line"/>`,
    think: `<path d="M38 37 L50 39" class="f-line thin"/><path d="M70 37 L82 33" class="f-line thin"/>` + eye(46, 48, 7) + eye(78, 48, 7),
    sad: `<path d="M36 41 L49 37" class="f-line thin"/><path d="M84 41 L71 37" class="f-line thin"/>` + eye(44, 52, 7) + eye(76, 52, 7),
    wow: `<path d="M38 33 Q44 29 50 32" class="f-line thin"/><path d="M70 32 Q76 29 82 33" class="f-line thin"/>
          <circle cx="44" cy="50" r="8.6" fill="#fff" stroke="${C.line}" stroke-width="2"/><circle cx="76" cy="50" r="8.6" fill="#fff" stroke="${C.line}" stroke-width="2"/>` +
      eye(44, 50, 4.6) + eye(76, 50, 4.6),
    sleepy: `<path d="M37 51 Q44 57 51 51" class="f-line"/><path d="M69 51 Q76 57 83 51" class="f-line"/>`,
  }[mood];
  const corners = `<path d="M48.5 65.5 q2.2 1.8 4.2 1.4 M71.5 65.5 q-2.2 1.8 -4.2 1.4" class="f-line thin"/>`;
  const mouth = {
    happy: `${corners}<path d="M52.5 67 Q60 69.5 67.5 67 Q66 77 60 77 Q54 77 52.5 67 Z" fill="${C.mouth}" class="o thin"/><path d="M55.5 73.5 Q60 71 64.5 73.5 Q62.5 76.4 60 76.4 Q57.5 76.4 55.5 73.5 Z" fill="${C.tongue}"/>`,
    cheer: `${corners}<path d="M51.5 66.5 Q60 69 68.5 66.5 Q67 82 60 82 Q53 82 51.5 66.5 Z" fill="${C.mouth}" class="o thin"/><path d="M55 77 Q60 73.5 65 77 Q63 81 60 81 Q57 81 55 77 Z" fill="${C.tongue}"/>`,
    think: `<circle cx="67" cy="70" r="2.3" fill="${C.mouth}"/>`,
    sad: `<path d="M53.5 73.5 Q60 67.5 66.5 73.5" class="f-line thin"/>`,
    wow: `<ellipse cx="60" cy="72" rx="4.6" ry="5.6" fill="${C.mouth}" class="o thin"/>`,
    sleepy: `<path d="M56 70.5 Q60 72.5 64 70.5" class="f-line thin"/>`,
  }[mood];
  const extras = {
    cheer: `<g class="f-spark"><path d="M6 34 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 z" fill="#f5b700"/><path d="M108 22 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 z" fill="#f5b700"/></g>`,
    think: `<g class="f-bubbles"><circle cx="106" cy="16" r="3" fill="var(--muted)"/><circle cx="113" cy="7" r="4.5" fill="var(--muted)"/></g>`,
    sleepy: `<text x="99" y="16" class="f-z">z</text><text x="108" y="7" class="f-z small">z</text>`,
    wow: `<path d="M103 14 L107 3 M110 19 L119 13 M108 27 L119 28" class="f-line thin" style="stroke:#f5b700"/>`,
    sad: `<path d="M84 57 q2.4 5.5 0 7.5 q-3.4 -2 0 -7.5z" fill="#6fb7e8"/>`,
    happy: '',
  }[mood];
  const earTilt = { sad: 16, sleepy: 10, cheer: -8, wow: -10, think: 0, happy: 0 }[mood];
  const pose = POSES[mood];
  const toes = (x) => `<path d="M${x - 3.8} 140.5 v4 M${x + 3.8} 140.5 v4" class="f-line thin"/>`;
  return `<svg class="dubbi mood-${mood} ${cls}" viewBox="0 0 120 150" role="img" aria-label="Dubbi the bear in a cream Libyan badla, looking ${mood}">
    <ellipse cx="60" cy="146.5" rx="34" ry="3.5" fill="#000" opacity="0.12"/>
    <!-- feet with toe lines -->
    <path d="M35.5 145 Q34 127 47 127 Q60 127 58.5 145 Z" fill="${C.fur}" class="o"/>
    <path d="M61.5 145 Q60 127 73 127 Q86 127 84.5 145 Z" fill="${C.fur}" class="o"/>
    ${toes(47)}${toes(73)}
    <!-- sirwal (baggy trousers) -->
    <path d="M38 113 Q32 124 38 133 L56 133 Q57 125 60 121 Q63 125 64 133 L82 133 Q88 124 82 113 Z" fill="${C.sirwal}" class="o"/>
    <path d="M45 118 Q43 124 46 131 M75 118 Q77 124 74 131" stroke="#cdb684" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <!-- shirt + farmla vest -->
    <path d="M41 80 Q60 73 79 80 Q85 96 83 114 L37 114 Q35 96 41 80 Z" fill="${C.shirt}" class="o"/>
    <path d="M41 80 Q36 96 37 114 L53.5 114 Q51 98 52.5 77 Z" fill="${C.vest}" class="o"/>
    <path d="M79 80 Q84 96 83 114 L66.5 114 Q69 98 67.5 77 Z" fill="${C.vest}" class="o"/>
    <path d="M51 82 Q49.5 98 51.8 112 M69 82 Q70.5 98 68.2 112" stroke="${C.gold}" stroke-width="1.8" fill="none"/>
    <path d="M40 99 q5 -7 10 0 q-5 5 -10 0 M70 99 q5 -7 10 0 q-5 5 -10 0" stroke="${C.gold}" stroke-width="1.4" fill="none"/>
    <g fill="${C.gold}"><circle cx="60" cy="90" r="1.4"/><circle cx="60" cy="96" r="1.4"/><circle cx="60" cy="102" r="1.4"/></g>
    <!-- sash (hizam) -->
    <rect x="35.5" y="107" width="49" height="8" rx="4" fill="${C.sash}" class="o"/>
    <path d="M40 111 H80" stroke="${C.gold}" stroke-width="1.2" stroke-dasharray="2 2.5"/>
    <!-- arms -->
    ${pose.front === 'l' ? '' : arm(38, 90, pose.l, pose.wave === 'l')}
    ${pose.front === 'r' ? '' : arm(82, 90, pose.r, pose.wave === 'r')}
    <!-- ears -->
    <g class="f-ear f-ear-l" style="transform:rotate(${-earTilt}deg)">
      <circle cx="27" cy="23" r="13.5" fill="${C.fur}" class="o"/><circle cx="29.5" cy="25.5" r="7.2" fill="${C.innerEar}"/>
    </g>
    <g class="f-ear f-ear-r" style="transform:rotate(${earTilt}deg)">
      <circle cx="93" cy="23" r="13.5" fill="${C.fur}" class="o"/><circle cx="90.5" cy="25.5" r="7.2" fill="${C.innerEar}"/>
    </g>
    <!-- head: wide, slightly squarish -->
    <path d="M60 16 C88 16 101 30 100.5 50 C100 72 84 84 60 84 C36 84 20 72 19.5 50 C19 30 32 16 60 16 Z" fill="${C.fur}" class="o"/>
    <ellipse cx="60" cy="68" rx="17.5" ry="12.5" fill="${C.muzzle}"/>
    <!-- shenna: red felt cap with black tassel -->
    <g class="f-hat">
      <path d="M43 21 Q44 3 60 2 Q76 3 77 21 Q60 14 43 21 Z" fill="${C.red}" class="o"/>
      <path d="M60 3 Q74 1 79.5 10" stroke="#1b1b1b" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M79.5 9.5 L77 19 H82 Z" fill="#1b1b1b"/>
    </g>
    ${eyes}
    <path d="M53 60 Q60 56 67 60 Q64.5 66 60 66 Q55.5 66 53 60 Z" fill="${C.line}"/>
    <path d="M60 66 V67.5" class="f-line thin"/>
    ${mouth}
    ${pose.front === 'l' ? arm(38, 90, pose.l) : pose.front === 'r' ? arm(82, 90, pose.r) : ''}
    ${extras}
  </svg>`;
}

// ------------------------------------------------------------------ lines
// [arabic, transliteration, english]
export const LINES = {
  correct: [
    ['برافو عليك!', 'brāfu 3alīk!', 'Bravo!'],
    ['هايل!', 'hāyil!', 'Awesome!'],
    ['ياسر باهي!', 'yāsir bāhi!', 'Really good!'],
    ['صحّيت!', 'ṣa77īt!', 'Well done!'],
    ['تمام التمام', 'tamām ittamām', 'Perfect'],
    ['والله شاطر!', 'wallāhi shāTir!', 'You’re sharp!'],
    ['مية مية!', 'miyya miyya!', '100%!'],
  ],
  streak: [
    ['ما تحبسش!', 'ma t7absh!', 'Don’t stop!'],
    ['ماشي كيف الصاروخ!', 'māshi kīf iṣṣārūkh!', 'Going like a rocket!'],
    ['نار عليك!', 'nār 3alīk!', 'You’re on fire!'],
  ],
  wrong: [
    ['ما عليش، عاود!', 'ma 3alēsh, 3āwid!', 'No worries — again!'],
    ['شوية شوية', 'shwayya shwayya', 'Little by little'],
    ['الغلطة تعلّم', 'ilghalTa t3allim', 'Mistakes teach'],
    ['قريب! تو تحفظها', 'grīb! tawwa t7afDha', 'Close! You’ll get it soon'],
    ['عادي، كلنا نغلطوا', '3ādi, killna nghalTu', 'Normal — we all slip'],
  ],
  newWord: [
    ['كلمة جديدة!', 'kilma jdīda!', 'A new word!'],
    ['قولها بصوت عالي', 'gūlha biSōt 3āli', 'Say it out loud'],
    ['تخيّلها في بالك', 'tkhayyalha fi bālak', 'Picture it in your mind'],
  ],
  finish: [
    ['يعطيك الصحة!', 'ya3Tīk iṣṣa77a!', 'Great work (lit. God give you health)!'],
    ['برافو! نتلاقوا غدوة', 'brāfu! nitlāgu ghudwa', 'Bravo! See you tomorrow'],
    ['خدمة نظيفة!', 'khidma nDHīfa!', 'Clean work!'],
  ],
};

// Learning tips — each grounded in a principle the app uses.
export const TIPS = [
  'Forgetting is part of the plan: a review just before you forget makes the memory much stronger.',
  'Try to answer before you flip the card. The struggle to recall is what builds memory.',
  'Say every word out loud. Using your mouth and ears encodes it twice.',
  'Short daily sessions beat one long cram. Sleep locks in today’s words!',
  'Be honest with the buttons: "Again" isn’t failing, it’s telling the scheduler what you need.',
  'Make a silly mental picture for tricky words. Weird images stick.',
  'Use a new word today, even just whispering it to yourself. Using it is remembering it.',
  'Mixing topics feels harder, but that’s why it works better.',
  'Libyans love long greetings. Ask "shin 7wālik?" and then "ilmhimm labās?"',
  'ق is usually "g" in Libya: gāl (he said), gahwa (coffee).',
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ------------------------------------------------------------------ widget
export function createMascot({ onSpeak } = {}) {
  let enabled = localStorage.getItem('dubbi') !== 'off';
  const root = document.createElement('div');
  root.className = 'dubbi-dock';
  root.innerHTML = `<div class="dubbi-bubble" role="status" aria-live="polite"></div>
    <button class="dubbi-btn" type="button" title="Dubbi — click for a phrase" aria-label="Dubbi the bear">${dubbiSVG('happy')}</button>`;
  document.body.append(root);
  const bubble = root.querySelector('.dubbi-bubble');
  const btn = root.querySelector('.dubbi-btn');
  let hideTimer = null;
  let moodTimer = null;
  let current = 'happy';

  function setMood(mood, { anim } = {}) {
    current = mood;
    btn.innerHTML = dubbiSVG(mood);
    if (anim) {
      btn.classList.remove('jump', 'shake', 'wiggle');
      void btn.offsetWidth;
      btn.classList.add(anim);
    }
  }

  /**
   * Shows a speech bubble. `line` is either a string or [ar, tr, en].
   * Options: mood, anim ('jump'|'shake'|'wiggle'), ms (auto-hide; 0 = stay), speak.
   */
  function say(line, { mood = 'happy', anim = 'wiggle', ms = 5500, speak = false } = {}) {
    if (!enabled) return;
    setMood(mood, { anim });
    let html;
    if (Array.isArray(line)) {
      const [ar, tr, en] = line;
      html = `<div class="ar fb-ar">${esc(ar)}</div><div class="tr small">${esc(tr)}</div><div class="small">${esc(en)}</div>`;
      if (speak) onSpeak?.(ar);
    } else {
      html = `<div class="small">${line}</div>`;
    }
    bubble.innerHTML = `<button class="fb-close" type="button" aria-label="Hide">×</button>${html}`;
    bubble.querySelector('.fb-close').addEventListener('click', (e) => {
      e.stopPropagation();
      hide();
    });
    root.classList.add('talking');
    clearTimeout(hideTimer);
    clearTimeout(moodTimer);
    if (ms) hideTimer = setTimeout(hide, ms);
    if (mood !== 'happy') moodTimer = setTimeout(() => setMood('happy'), Math.max(2200, Math.min(ms || 4000, 4000)));
  }

  function hide() {
    root.classList.remove('talking');
  }

  function react(kind, extra = {}) {
    const lines = LINES[kind];
    if (!lines) return;
    const mood = { correct: 'cheer', streak: 'cheer', wrong: 'sad', newWord: 'think', finish: 'cheer' }[kind];
    const anim = { correct: 'jump', streak: 'jump', wrong: 'shake', newWord: 'wiggle', finish: 'jump' }[kind];
    say(pick(lines), { mood, anim, ms: kind === 'correct' || kind === 'wrong' ? 2600 : 5000, ...extra });
  }

  function tip() {
    say(`💡 ${esc(pick(TIPS))}`, { mood: 'think', anim: 'wiggle', ms: 9000 });
  }

  // Click: hide the bubble, or say a Libyan phrase (with audio) or a study tip.
  btn.addEventListener('click', () => {
    if (root.classList.contains('talking')) return hide();
    if (Math.random() < 0.5) say(pick([...LINES.correct, ...LINES.finish, ...LINES.streak]), { mood: 'cheer', anim: 'jump', speak: true, ms: 6000 });
    else tip();
  });

  function setEnabled(on) {
    enabled = on;
    localStorage.setItem('dubbi', on ? 'on' : 'off');
    root.classList.toggle('hidden', !on);
  }
  root.classList.toggle('hidden', !enabled);

  return {
    say,
    react,
    tip,
    hide,
    setMood,
    get mood() {
      return current;
    },
    get enabled() {
      return enabled;
    },
    setEnabled,
    setCompact(on) {
      root.classList.toggle('compact', on);
    },
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
