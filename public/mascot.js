// Dubbi — the bear mascot, standing full height in a cream Libyan badla:
// red shenna cap with tassel, ivory shirt, gold-embroidered farmla vest,
// waist sash and baggy sirwal trousers. Chibi style: big head, thick outlines,
// flat colours. Inline SVG with moods, a speech bubble, and Libyan phrases.

const MOODS = ['happy', 'cheer', 'think', 'sad', 'wow', 'sleepy'];

const C = {
  line: '#3f2614',
  fur: '#b9824a',
  furDark: '#9a6835',
  innerEar: '#f2c9a0',
  muzzle: '#f4dcb8',
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
  happy: { l: 18, r: -140, wave: 'r' },
  cheer: { l: 145, r: -145 },
  think: { l: 14, r: 111, front: 'r' }, // paw on chin, drawn over the face
  sad: { l: 6, r: -6 },
  wow: { l: 105, r: -105 },
  sleepy: { l: 10, r: -10 },
};

function arm(x, y, angle, wave) {
  return `<g transform="translate(${x} ${y}) rotate(${angle})"><g class="${wave ? 'f-wave' : ''}">
    <rect x="-6.5" y="-3" width="13" height="25" rx="6.5" fill="${C.shirt}" class="o"/>
    <path d="M-6.2 18 H6.2" stroke="${C.gold}" stroke-width="1.8"/>
    <circle cx="0" cy="26" r="6.8" fill="${C.fur}" class="o"/>
  </g></g>`;
}

/** Returns Dubbi's SVG for a mood. Pure markup, no state. */
export function dubbiSVG(mood = 'happy', cls = '') {
  if (!MOODS.includes(mood)) mood = 'happy';
  const eyes = {
    happy: `<ellipse cx="47" cy="50" rx="3.6" ry="4.4" class="f-eye"/><ellipse cx="73" cy="50" rx="3.6" ry="4.4" class="f-eye"/>
            <circle cx="48.3" cy="48.3" r="1.4" fill="#fff"/><circle cx="74.3" cy="48.3" r="1.4" fill="#fff"/>`,
    cheer: `<path d="M42 51 Q47 45 52 51" class="f-line"/><path d="M68 51 Q73 45 78 51" class="f-line"/>`,
    think: `<ellipse cx="49" cy="48" rx="3.4" ry="4.2" class="f-eye"/><ellipse cx="75" cy="48" rx="3.4" ry="4.2" class="f-eye"/>
            <circle cx="50.2" cy="46.4" r="1.3" fill="#fff"/><circle cx="76.2" cy="46.4" r="1.3" fill="#fff"/>
            <path d="M42 40 L53 42" class="f-line thin"/><path d="M68 41 L79 38" class="f-line thin"/>`,
    sad: `<ellipse cx="47" cy="52" rx="3.4" ry="4" class="f-eye"/><ellipse cx="73" cy="52" rx="3.4" ry="4" class="f-eye"/>
          <circle cx="48.2" cy="50.6" r="1.3" fill="#fff"/><circle cx="74.2" cy="50.6" r="1.3" fill="#fff"/>
          <path d="M40 46 L52 42" class="f-line thin"/><path d="M80 46 L68 42" class="f-line thin"/>`,
    wow: `<circle cx="47" cy="50" r="6" fill="#fff" stroke="${C.line}" stroke-width="1.6"/><circle cx="73" cy="50" r="6" fill="#fff" stroke="${C.line}" stroke-width="1.6"/>
          <circle cx="47" cy="50" r="3.3" class="f-eye"/><circle cx="73" cy="50" r="3.3" class="f-eye"/>`,
    sleepy: `<path d="M42 51 Q47 55 52 51" class="f-line"/><path d="M68 51 Q73 55 78 51" class="f-line"/>`,
  }[mood];
  const mouth = {
    happy: `<path d="M60 64 V66.5 M54.5 66.5 Q57.2 70.5 60 66.5 Q62.8 70.5 65.5 66.5" class="f-line thin"/>`,
    cheer: `<path d="M53 66 Q60 79 67 66 Z" fill="#6b1f1f" stroke="${C.line}" stroke-width="1.6" stroke-linejoin="round"/><path d="M56.5 73 Q60 76.5 63.5 73" fill="#e46a6a"/>`,
    think: `<circle cx="66" cy="68.5" r="2" fill="#6b1f1f"/>`,
    sad: `<path d="M54.5 71 Q60 66 65.5 71" class="f-line thin"/>`,
    wow: `<ellipse cx="60" cy="70" rx="3.8" ry="4.6" fill="#6b1f1f"/>`,
    sleepy: `<path d="M56 69 L64 69" class="f-line thin"/>`,
  }[mood];
  const extras = {
    cheer: `<g class="f-spark"><path d="M8 34 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 z" fill="#f5b700"/><path d="M106 22 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 z" fill="#f5b700"/></g>`,
    think: `<g class="f-bubbles"><circle cx="104" cy="22" r="3" fill="var(--muted)"/><circle cx="112" cy="12" r="4.5" fill="var(--muted)"/></g>`,
    sleepy: `<text x="96" y="22" class="f-z">z</text><text x="106" y="12" class="f-z small">z</text>`,
    wow: `<path d="M100 18 L104 6 M108 22 L118 16 M106 30 L118 32" class="f-line thin" style="stroke:#f5b700"/>`,
    sad: `<path d="M78 56 q2 5 0 7 q-3 -2 0 -7z" fill="#6fb7e8"/>`,
    happy: '',
  }[mood];
  const earTilt = { sad: 16, sleepy: 10, cheer: -8, wow: -10, think: 0, happy: 0 }[mood];
  const pose = POSES[mood];
  return `<svg class="dubbi mood-${mood} ${cls}" viewBox="0 0 120 150" role="img" aria-label="Dubbi the bear in a cream Libyan badla, looking ${mood}">
    <!-- feet -->
    <ellipse cx="47" cy="143" rx="10.5" ry="5.6" fill="${C.fur}" class="o"/>
    <ellipse cx="73" cy="143" rx="10.5" ry="5.6" fill="${C.fur}" class="o"/>
    <!-- sirwal (baggy trousers) -->
    <path d="M37 115 Q31 131 37.5 141 L56 141 Q57 129 60 125 Q63 129 64 141 L82.5 141 Q89 131 83 115 Z" fill="${C.sirwal}" class="o"/>
    <path d="M44 122 Q42 131 45 139 M76 122 Q78 131 75 139" stroke="#cdb684" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <!-- shirt + farmla vest -->
    <path d="M40 80 Q60 72 80 80 Q86 97 84 116 L36 116 Q34 97 40 80 Z" fill="${C.shirt}" class="o"/>
    <path d="M40 80 Q35 97 36 116 L53.5 116 Q51 99 52.5 77 Z" fill="${C.vest}" class="o"/>
    <path d="M80 80 Q85 97 84 116 L66.5 116 Q69 99 67.5 77 Z" fill="${C.vest}" class="o"/>
    <path d="M51 80 Q49.5 99 51.8 114 M69 80 Q70.5 99 68.2 114" stroke="${C.gold}" stroke-width="1.8" fill="none"/>
    <path d="M39.5 100 q5 -7 10 0 q-5 5 -10 0 M70.5 100 q5 -7 10 0 q-5 5 -10 0" stroke="${C.gold}" stroke-width="1.4" fill="none"/>
    <path d="M41 91 q3 -3 6 0 M73 91 q3 -3 6 0" stroke="${C.gold}" stroke-width="1.2" fill="none"/>
    <g fill="${C.gold}"><circle cx="60" cy="86" r="1.4"/><circle cx="60" cy="93" r="1.4"/><circle cx="60" cy="100" r="1.4"/><circle cx="60" cy="107" r="1.4"/></g>
    <!-- sash (hizam) -->
    <rect x="35" y="111" width="50" height="8" rx="4" fill="${C.sash}" class="o"/>
    <path d="M39 115 H81" stroke="${C.gold}" stroke-width="1.2" stroke-dasharray="2 2.5"/>
    <!-- arms -->
    ${pose.front === 'l' ? '' : arm(40, 85, pose.l, pose.wave === 'l')}
    ${pose.front === 'r' ? '' : arm(80, 85, pose.r, pose.wave === 'r')}
    <!-- ears -->
    <g class="f-ear f-ear-l" style="transform:rotate(${-earTilt}deg)">
      <circle cx="32" cy="24" r="12" fill="${C.fur}" class="o"/><circle cx="32" cy="24" r="6.2" fill="${C.innerEar}"/>
    </g>
    <g class="f-ear f-ear-r" style="transform:rotate(${earTilt}deg)">
      <circle cx="88" cy="24" r="12" fill="${C.fur}" class="o"/><circle cx="88" cy="24" r="6.2" fill="${C.innerEar}"/>
    </g>
    <!-- head -->
    <circle cx="60" cy="50" r="33" fill="${C.fur}" class="o"/>
    <ellipse cx="60" cy="64" rx="14.5" ry="11" fill="${C.muzzle}"/>
    <!-- shenna: red felt cap with black tassel -->
    <g class="f-hat">
      <path d="M42 25 Q43 6 60 5 Q77 6 78 25 Q60 17 42 25 Z" fill="${C.red}" class="o"/>
      <path d="M60 5.5 q11 -4 15 6" stroke="#1b1b1b" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M75 11 l-2 8 M75 11 l1 8 M75 11 l3 7" stroke="#1b1b1b" stroke-width="1.4" stroke-linecap="round"/>
    </g>
    ${eyes}
    <ellipse cx="37" cy="61" rx="5" ry="3" fill="#f39b8f" opacity="0.55"/><ellipse cx="83" cy="61" rx="5" ry="3" fill="#f39b8f" opacity="0.55"/>
    <path d="M54.5 59 Q60 56 65.5 59 Q63 64.5 60 64.5 Q57 64.5 54.5 59 Z" fill="${C.line}"/>
    ${mouth}
    ${pose.front === 'l' ? arm(40, 85, pose.l) : pose.front === 'r' ? arm(80, 85, pose.r) : ''}
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
