// Dubbi — the bear mascot, dressed in traditional Libyan men's clothing:
// a red shenna cap with black tassel, white shirt, an embroidered farmla
// vest and a cream jard wrap over the shoulder. Inline SVG with moods, a
// speech bubble, and a library of Libyan phrases to cheer the learner on.

const MOODS = ['happy', 'cheer', 'think', 'sad', 'wow', 'sleepy'];

/** Returns Dubbi's SVG for a mood. Pure markup, no state. */
export function dubbiSVG(mood = 'happy', cls = '') {
  if (!MOODS.includes(mood)) mood = 'happy';
  const eyes = {
    happy: `<circle cx="49" cy="57" r="4.6" class="f-eye"/><circle cx="71" cy="57" r="4.6" class="f-eye"/>
            <circle cx="50.6" cy="55.4" r="1.5" fill="#fff"/><circle cx="72.6" cy="55.4" r="1.5" fill="#fff"/>`,
    cheer: `<path d="M44 58 Q49 51 54 58" class="f-line"/><path d="M66 58 Q71 51 76 58" class="f-line"/>`,
    think: `<circle cx="51" cy="55" r="4.2" class="f-eye"/><circle cx="73" cy="55" r="4.2" class="f-eye"/>
            <circle cx="52.5" cy="53" r="1.4" fill="#fff"/><circle cx="74.5" cy="53" r="1.4" fill="#fff"/>
            <path d="M44 47 L55 49" class="f-line thin"/><path d="M67 48 L78 45" class="f-line thin"/>`,
    sad: `<circle cx="49" cy="59" r="4.2" class="f-eye"/><circle cx="71" cy="59" r="4.2" class="f-eye"/>
          <circle cx="50.3" cy="57.4" r="1.4" fill="#fff"/><circle cx="72.3" cy="57.4" r="1.4" fill="#fff"/>
          <path d="M42 53 L54 49" class="f-line thin"/><path d="M78 53 L66 49" class="f-line thin"/>`,
    wow: `<circle cx="49" cy="56" r="6.2" fill="#fff" stroke="#2b170a" stroke-width="1.5"/><circle cx="71" cy="56" r="6.2" fill="#fff" stroke="#2b170a" stroke-width="1.5"/>
          <circle cx="49" cy="56" r="3.4" class="f-eye"/><circle cx="71" cy="56" r="3.4" class="f-eye"/>`,
    sleepy: `<path d="M44 58 Q49 62 54 58" class="f-line"/><path d="M66 58 Q71 62 76 58" class="f-line"/>`,
  }[mood];
  const mouth = {
    happy: `<path d="M54 76 Q60 82 66 76" class="f-line"/>`,
    cheer: `<path d="M52 75 Q60 89 68 75 Z" fill="#6b1f1f"/><path d="M56 81 Q60 85 64 81" fill="#e46a6a"/>`,
    think: `<circle cx="64" cy="78" r="2.3" fill="#6b1f1f"/>`,
    sad: `<path d="M54 80 Q60 74 66 80" class="f-line"/>`,
    wow: `<ellipse cx="60" cy="79" rx="4" ry="5" fill="#6b1f1f"/>`,
    sleepy: `<path d="M56 78 L64 78" class="f-line"/>`,
  }[mood];
  const extras = {
    cheer: `<g class="f-spark"><path d="M12 40 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 z" fill="#f5b700"/><path d="M102 26 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 z" fill="#f5b700"/></g>`,
    think: `<g class="f-bubbles"><circle cx="100" cy="40" r="3" fill="var(--muted)"/><circle cx="108" cy="30" r="4.5" fill="var(--muted)"/></g>`,
    sleepy: `<text x="94" y="36" class="f-z">z</text><text x="104" y="24" class="f-z small">z</text>`,
    wow: `<path d="M98 26 L102 14 M106 30 L116 24 M104 38 L116 40" class="f-line thin" style="stroke:#f5b700"/>`,
    sad: `<path d="M77 63 q2 5 0 7 q-3 -2 0 -7z" fill="#6fb7e8"/>`,
    happy: '',
  }[mood];
  // Ears flop down when sad/sleepy and perk up when cheering.
  const earTilt = { sad: 16, sleepy: 10, cheer: -8, wow: -10, think: 0, happy: 0 }[mood];
  const gold = '#d9a419';
  return `<svg class="dubbi mood-${mood} ${cls}" viewBox="0 0 120 120" role="img" aria-label="Dubbi the bear in traditional Libyan clothes, looking ${mood}">
    <!-- white shirt -->
    <path d="M12 120 Q14 96 40 88 L80 88 Q106 96 108 120 Z" fill="#f7f3ea" stroke="#d8cfbd" stroke-width="1.5"/>
    <!-- farmla vest with gold embroidery and buttons -->
    <path d="M12 120 Q14 96 40 88 L50 90 Q49 106 55 120 Z" fill="#2b1420"/>
    <path d="M108 120 Q106 96 80 88 L70 90 Q71 106 65 120 Z" fill="#2b1420"/>
    <path d="M49 92 Q48 106 53 118" stroke="${gold}" stroke-width="1.8" fill="none"/>
    <path d="M71 92 Q72 106 67 118" stroke="${gold}" stroke-width="1.8" fill="none"/>
    <path d="M24 108 q6 -8 12 0 q-6 6 -12 0 M84 108 q6 -8 12 0 q-6 6 -12 0" stroke="${gold}" stroke-width="1.4" fill="none"/>
    <g fill="${gold}"><circle cx="46" cy="98" r="1.4"/><circle cx="47" cy="104" r="1.4"/><circle cx="48.5" cy="110" r="1.4"/><circle cx="74" cy="98" r="1.4"/><circle cx="73" cy="104" r="1.4"/><circle cx="71.5" cy="110" r="1.4"/></g>
    <!-- jard: cream wool wrap over the left shoulder -->
    <path d="M12 120 Q12 98 34 89 Q44 86 48 89 Q30 98 28 120 Z" fill="#efe4c8" stroke="#cdbd96" stroke-width="1.5"/>
    <path d="M18 116 Q20 100 36 92" stroke="#cdbd96" stroke-width="1.2" fill="none"/>
    <!-- ears -->
    <g class="f-ear f-ear-l" style="transform:rotate(${-earTilt}deg)">
      <circle cx="35" cy="36" r="11.5" fill="#94602d" stroke="#5f3b18" stroke-width="2"/><circle cx="35" cy="36" r="6" fill="#d9a066"/>
    </g>
    <g class="f-ear f-ear-r" style="transform:rotate(${earTilt}deg)">
      <circle cx="85" cy="36" r="11.5" fill="#94602d" stroke="#5f3b18" stroke-width="2"/><circle cx="85" cy="36" r="6" fill="#d9a066"/>
    </g>
    <!-- head -->
    <circle cx="60" cy="61" r="31" fill="#a46d34" stroke="#5f3b18" stroke-width="2"/>
    <ellipse cx="60" cy="74" rx="15.5" ry="12" fill="#e9c79e"/>
    <!-- shenna: red felt cap with black tassel -->
    <g class="f-hat">
      <path d="M41 39 Q42 24 60 23 Q78 24 79 39 Q60 34 41 39 Z" fill="#c8102e" stroke="#8e0b20" stroke-width="1.5"/>
      <path d="M60 23 q10 -5 15 4" stroke="#1b1b1b" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M75 27 l-2 8 M75 27 l1 8 M75 27 l3 7" stroke="#1b1b1b" stroke-width="1.4" stroke-linecap="round"/>
    </g>
    ${eyes}
    <ellipse cx="40" cy="68" rx="5" ry="3" fill="#f39b8f" opacity="0.5"/><ellipse cx="80" cy="68" rx="5" ry="3" fill="#f39b8f" opacity="0.5"/>
    <path d="M54.5 66 Q60 63 65.5 66 Q63 72 60 72 Q57 72 54.5 66 Z" fill="#2b170a"/>
    ${mouth}
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
