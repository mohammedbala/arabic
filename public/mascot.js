// Fenni — the fennec fox mascot. A small inline-SVG character with moods,
// a speech bubble, and a library of Libyan phrases to cheer the learner on.

const MOODS = ['happy', 'cheer', 'think', 'sad', 'wow', 'sleepy'];

/** Returns Fenni's SVG for a mood. Pure markup, no state. */
export function fenniSVG(mood = 'happy', cls = '') {
  if (!MOODS.includes(mood)) mood = 'happy';
  const eyes = {
    happy: `<circle cx="47" cy="68" r="5.5" class="f-eye"/><circle cx="73" cy="68" r="5.5" class="f-eye"/>
            <circle cx="49" cy="66" r="1.8" fill="#fff"/><circle cx="75" cy="66" r="1.8" fill="#fff"/>`,
    cheer: `<path d="M41 69 Q47 61 53 69" class="f-line"/><path d="M67 69 Q73 61 79 69" class="f-line"/>`,
    think: `<circle cx="49" cy="65" r="5" class="f-eye"/><circle cx="75" cy="65" r="5" class="f-eye"/>
            <circle cx="51" cy="62.5" r="1.6" fill="#fff"/><circle cx="77" cy="62.5" r="1.6" fill="#fff"/>
            <path d="M41 56 L54 58" class="f-line thin"/><path d="M68 57 L80 54" class="f-line thin"/>`,
    sad: `<circle cx="47" cy="70" r="5" class="f-eye"/><circle cx="73" cy="70" r="5" class="f-eye"/>
          <circle cx="48.5" cy="68" r="1.6" fill="#fff"/><circle cx="74.5" cy="68" r="1.6" fill="#fff"/>
          <path d="M40 60 L53 63" class="f-line thin"/><path d="M80 60 L67 63" class="f-line thin"/>`,
    wow: `<circle cx="47" cy="67" r="7" fill="#fff" stroke="#3b2414" stroke-width="1.5"/><circle cx="73" cy="67" r="7" fill="#fff" stroke="#3b2414" stroke-width="1.5"/>
          <circle cx="47" cy="67" r="4" class="f-eye"/><circle cx="73" cy="67" r="4" class="f-eye"/>`,
    sleepy: `<path d="M41 69 Q47 73 53 69" class="f-line"/><path d="M67 69 Q73 73 79 69" class="f-line"/>`,
  }[mood];
  const mouth = {
    happy: `<path d="M53 87 Q60 94 67 87" class="f-line"/>`,
    cheer: `<path d="M51 86 Q60 100 69 86 Z" fill="#7a2e2e"/><path d="M55 92 Q60 96 65 92" fill="#e46a6a"/>`,
    think: `<circle cx="64" cy="90" r="2.6" fill="#7a2e2e"/>`,
    sad: `<path d="M53 91 Q60 85 67 91" class="f-line"/>`,
    wow: `<ellipse cx="60" cy="91" rx="4.5" ry="5.5" fill="#7a2e2e"/>`,
    sleepy: `<path d="M55 89 L65 89" class="f-line"/>`,
  }[mood];
  const extras = {
    cheer: `<g class="f-spark"><path d="M14 40 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 z" fill="#f5b700"/><path d="M100 30 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 z" fill="#f5b700"/></g>`,
    think: `<g class="f-bubbles"><circle cx="100" cy="44" r="3" fill="var(--muted)"/><circle cx="108" cy="34" r="4.5" fill="var(--muted)"/></g>`,
    sleepy: `<text x="92" y="40" class="f-z">z</text><text x="102" y="28" class="f-z small">z</text>`,
    wow: `<path d="M98 30 L102 18 M106 34 L116 28 M104 42 L116 44" class="f-line thin" stroke="#f5b700"/>`,
    sad: `<path d="M80 74 q2 5 0 7 q-3 -2 0 -7z" fill="#6fb7e8"/>`,
    happy: '',
  }[mood];
  // Ears droop when sad/sleepy, perk up when cheering.
  const earTilt = { sad: 14, sleepy: 10, cheer: -6, wow: -8, think: 0, happy: 0 }[mood];
  return `<svg class="fenni mood-${mood} ${cls}" viewBox="0 0 120 120" role="img" aria-label="Fenni the fennec fox looking ${mood}">
    <g class="f-ear f-ear-l" style="transform:rotate(${-earTilt}deg)">
      <path d="M36 58 L14 6 Q40 18 54 46 Z" fill="#e9b47a" stroke="#c98d52" stroke-width="2" stroke-linejoin="round"/>
      <path d="M38 52 L22 17 Q39 26 49 45 Z" fill="#f6b7b0"/>
    </g>
    <g class="f-ear f-ear-r" style="transform:rotate(${earTilt}deg)">
      <path d="M84 58 L106 6 Q80 18 66 46 Z" fill="#e9b47a" stroke="#c98d52" stroke-width="2" stroke-linejoin="round"/>
      <path d="M82 52 L98 17 Q81 26 71 45 Z" fill="#f6b7b0"/>
    </g>
    <ellipse cx="60" cy="74" rx="35" ry="31" fill="#f0c38e" stroke="#c98d52" stroke-width="2"/>
    <path d="M60 44 C 46 44 40 54 41 62 C 49 58 55 58 60 64 C 65 58 71 58 79 62 C 80 54 74 44 60 44 Z" fill="#e9b47a" opacity="0.7"/>
    <ellipse cx="60" cy="88" rx="21" ry="14" fill="#fff4e3"/>
    <g class="f-hat"><path d="M47 47 Q48 33 60 32 Q72 33 73 47 Z" fill="#c8102e" stroke="#8e0b20" stroke-width="1.5"/><path d="M60 32 q8 -6 13 2" stroke="#1b1b1b" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="73" cy="35" r="2.5" fill="#1b1b1b"/></g>
    ${eyes}
    <ellipse cx="38" cy="80" rx="5" ry="3" fill="#f39b8f" opacity="0.55"/><ellipse cx="82" cy="80" rx="5" ry="3" fill="#f39b8f" opacity="0.55"/>
    <ellipse cx="60" cy="80" rx="5" ry="3.6" fill="#3b2414"/>
    ${mouth}
    <path d="M38 101 Q60 112 82 101 L84 107 Q60 119 36 107 Z" fill="#239e46"/><path d="M38 101 Q60 112 82 101" stroke="#111" stroke-width="2" fill="none"/>
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
  let enabled = localStorage.getItem('fenni') !== 'off';
  const root = document.createElement('div');
  root.className = 'fenni-dock';
  root.innerHTML = `<div class="fenni-bubble" role="status" aria-live="polite"></div>
    <button class="fenni-btn" type="button" title="Fenni — click for a phrase" aria-label="Fenni the fennec fox">${fenniSVG('happy')}</button>`;
  document.body.append(root);
  const bubble = root.querySelector('.fenni-bubble');
  const btn = root.querySelector('.fenni-btn');
  let hideTimer = null;
  let moodTimer = null;
  let current = 'happy';

  function setMood(mood, { anim } = {}) {
    current = mood;
    btn.innerHTML = fenniSVG(mood);
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
    localStorage.setItem('fenni', on ? 'on' : 'off');
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
