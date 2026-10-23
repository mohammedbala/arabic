// TEMPORARY placeholder used to validate the shell; replaced by the real game.
import { shuffle, shortLabel } from './common.js';
export default {
  howTo: ['Pick the Arabic word for the English prompt.'],
  minWords: 8,
  wordFilter: (w) => shortLabel(w),
  create(stage, kit) {
    const root = document.createElement('div');
    root.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;padding:20px;align-items:center;justify-content:center';
    stage.append(root);
    let s = null;
    const next = () => {
      const target = s.pool[Math.floor(s.rng() * s.pool.length)];
      const opts = shuffle([target, ...kit.distractors(target, s.pool, 3, s.rng)], s.rng);
      s.cur = { target, opts };
      root.innerHTML = `<div style="font-size:1.4rem">${kit.shortEn(target)}</div>` + opts.map((o, i) => `<button class="btn lg" data-i="${i}" style="min-width:200px;font-size:1.4rem">${o.ar}</button>`).join('');
    };
    const choose = (i) => {
      if (!kit.playing || !s) return;
      const ok = s.cur.opts[i].id === s.cur.target.id;
      s.total++;
      if (ok) { s.score++; kit.sfx.good(); } else { s.lives--; s.missed.push(s.cur.target); kit.sfx.bad(); }
      kit.hud.score(s.score); kit.hud.lives(s.lives, 3);
      if (s.lives <= 0) return kit.end({ score: s.score, correct: s.score, total: s.total, missed: s.missed });
      next();
    };
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) choose(Number(b.dataset.i)); });
    kit.debug({
      info: () => s && { prompt: s.cur.target.en, target: s.cur.target.id, score: s.score, lives: s.lives },
      answer: () => choose(s.cur.opts.findIndex((o) => o.id === s.cur.target.id)),
      wrong: () => choose(s.cur.opts.findIndex((o) => o.id !== s.cur.target.id)),
    });
    return {
      start(opts) { s = { ...opts, score: 0, lives: 3, total: 0, missed: [] }; kit.hud.lives(3, 3); next(); },
      stop() { s = null; root.innerHTML = ''; },
      destroy() { root.remove(); },
    };
  },
};
