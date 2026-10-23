# Arcade game modules

Each game is one ES module `public/games/<id>.js` (no build step, no dependencies) whose
**default export** is:

```js
export default {
  howTo: ['Short HTML bullet', '…'],   // 2–4 bullets shown on the start screen
  minWords: 12,                         // smallest usable word pool
  wordFilter: (w) => true,              // which deck words suit this game (e.g. short labels)
  create(stage, kit) {                  // called once when the game page opens
    // build DOM / canvas inside `stage` (a full-size, position:relative element)
    return {
      start(opts) {},   // begin a new round. opts = { pool, rng, seed, daily, level, day }
      stop() {},        // abort the current round silently (restart / quit); must not call kit.end
      pause() {},       // optional: freeze real-time play (shell shows the pause screen)
      resume() {},      // optional
      destroy() {},     // remove listeners, timers, rAF loops, injected <style>; leave no globals
    };
  },
};
```

Metadata (id, title, emoji, accent, inspiredBy, daily) lives in `registry.js`.

## The shell (`common.js → runGame`)

The shell owns the full-screen frame, HUD, start screen (how-to, level chips, Daily/Practice
buttons, friend-challenge banner), pause screen, game-over screen (score, best, XP, world rank,
"words to review", Share, Play again) and saving results. A game only plays rounds.

`kit` passed to `create`:

| member | use |
|---|---|
| `kit.hud.score(n)` / `kit.hud.lives(n, max)` / `kit.hud.extra(text)` | HUD readouts |
| `kit.end(result)` | **call exactly once when a round ends** (see below) |
| `kit.playing` | false while paused / before start / after end |
| `kit.sfx.good() bad() tick() tap() flap() swish() pop() combo(n) win() lose()` | WebAudio sounds (respect mute automatically) |
| `kit.haptic(ms or pattern)` | vibration on supported phones |
| `kit.speak(arabic)` | text-to-speech of a word (use on correct answers / reveals) |
| `kit.distractors(word, pool, n, rng)` | wrong options: same POS/category, different meaning & Arabic |
| `kit.shortEn(word, max)` | first English sense, trimmed for labels |
| `kit.normAr(s)` | normalised Arabic for comparisons |
| `kit.words`, `kit.learnedIds`, `kit.user` | full deck, studied word ids, user or null |
| `kit.isTouch`, `kit.reducedMotion` | adapt controls / effects |
| `kit.debug(obj)` | expose test hooks as `window.__gameDebug` (required, see Testing) |

`opts.pool` is the word list for the chosen level, most-used first, already filtered by
`wordFilter`. **Use `opts.rng` (seeded) for every random choice of words/puzzle content** so daily
puzzles are identical for everyone and `?seed=N` reproduces a round. (Visual-only randomness such as
particles may use Math.random.)

`kit.end(result)`:

```js
kit.end({
  score,            // integer ≥ 0 — leaderboard value
  correct, total,   // answers right / asked — drives XP (2 XP per correct)
  won,              // for puzzles (daily): solved?
  missed: [word],   // deck word objects the player got wrong / failed — shown as "Words to review"
  title,            // optional headline, e.g. 'Kalima #3 · 4/6'
  detail,           // optional HTML (escape any text you insert!) shown under the score
  shareText,        // optional viral share text (emoji grid etc.); shell appends a link
  meta,             // optional small JSON (stored with the score)
});
```

Helpers to import from `./common.js`: `setupCanvas(container,{onResize})` (HiDPI canvas, CSS-pixel
coords), `createLoop(step(dt,t))`, `drawText(ctx, text, x, y, {size, maxWidth, font, color, stroke…})`
(RTL-aware, shrinks to fit), `roundRect`, `dubbiImage(mood)` → Promise<Image> of the mascot
(120×150 viewBox; moods happy/cheer/think/sad/wow/sleepy), `onSwipe(el, dir => …)`, `fontsReady()`,
`AR_FONT`, `UI_FONT`, `shuffle(arr, rng)`, `pick`, `clamp`, `lerp`, `normAr`, `arLetters(word)`
(base letters for letter grids), `isSingleWord`, `shortLabel(w)`, `mulberry32`, `hashString`, `dayNumber`.

## Words

Deck word objects: `{ id, rank, ar, tr, en, pos, cat, usage, ex_ar, ex_tr, ex_en, phrases:[{ar,tr,en}], note, alt }`.
`ar` is Libyan Arabic (may contain tashkeel), `tr` transliteration (3=ع, 7=ح, ā ī ū long vowels),
`en` English senses separated by `;`. Lower `rank` = more used. Categories (`cat`) include
food, drink, family, body, health, home, city, travel, nature, animals, colors, numbers, time,
greetings, social, adjectives, emotions, verbs-* and more.

## Look & feel

- Mobile first: portrait phone (≈360–430 × 640–900 CSS px), one thumb. Big targets (≥ 44 px).
  Also works with mouse/keyboard on desktop (the frame is ≤ 520 px wide there).
- Bright, juicy, fast: instant feedback (colour flash, particles, sound, haptic), combos,
  rising difficulty, a run lasts ~1–3 minutes. Dark game backgrounds; use the game's accent.
- Arabic text: `AR_FONT`, large (≥ 22 px on targets), `direction: rtl`; never letter-space Arabic.
  Call `await fontsReady()` before the first canvas draw.
- Inject game CSS as a `<style>` element inside `stage`, every selector prefixed with your root class
  (`.g-<id>`); remove it in `destroy()`. Do not edit `styles.css`, `common.js`, `app.js` or other games.
- Teach, don't just test: on mistakes reveal the right answer (Arabic + meaning), speak correct
  words, collect `missed` words for the game-over list.
- No network calls of your own, no external assets (draw with canvas/CSS/emoji/SVG).

## Testing (required)

Run the app on your own port with a throwaway database:

    PORT=<port> DB_FILE=<scratch>/test.db node --disable-warning=ExperimentalWarning server/index.js &

Open `http://localhost:<port>/games/<id>?seed=7` (games work logged out). Play-test with Playwright
using a phone profile — `require(\`${npm root -g}/playwright\`)`, `devices['iPhone 13']`, `hasTouch` —
and use `page.touchscreen.tap`, synthetic pointer swipes, and the shell buttons (`[data-act="play"]`,
`[data-act="daily"]`, `[data-act="again"]`, game over shows `.over-score`).
`node scripts/playtest.mjs <id> <port> <outDir>` runs a standard smoke test using your debug hooks.

`kit.debug({...})` must provide:

```js
kit.debug({
  info: () => ({ /* JSON: current prompt / target word id / options / score / lives / phase */ }),
  answer: () => {},  // make the correct move for the current challenge (real-time games: steer/act correctly for it)
  wrong: () => {},   // make an incorrect move
});
```
