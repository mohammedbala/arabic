// Standard mobile smoke test for an arcade game, driven by its debug hooks.
//   node scripts/playtest.mjs <gameId> <port> <outDir> [--correct 8] [--delay 700] [--daily] [--timeout 120]
// Needs the app running on <port>. Plays a round on an iPhone 13 profile:
// answers correctly <correct> times, then makes mistakes until game over,
// then checks Play again, pause/resume and leaving the game. Writes
// screenshots to <outDir> and prints a JSON summary (exit 1 on failure).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [id, port, outDir] = process.argv.slice(2);
if (!id || !port || !outDir) {
  console.error('usage: node scripts/playtest.mjs <gameId> <port> <outDir> [--correct N] [--delay ms] [--daily] [--timeout s]');
  process.exit(2);
}
const flag = (name, d) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const CORRECT = Number(flag('correct', 8));
const DELAY = Number(flag('delay', 700));
const TIMEOUT = Number(flag('timeout', 120)) * 1000;
const DAILY = process.argv.includes('--daily');
mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);
const pwPath = process.env.PW || join(execSync('npm root -g').toString().trim(), 'playwright');
const { chromium, devices } = require(pwPath);
const base = `http://localhost:${port}`;
const summary = { game: id, errors: [], steps: 0, samples: [], score: null, ok: false };

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
page.on('pageerror', (e) => summary.errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.g|favicon|status of 401|Failed to load resource/.test(m.text())) summary.errors.push(`console: ${m.text()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !/fonts\.g|\/api\/games\/.*\/result|\/api\/games\/me|\/api\/words\/status/.test(r.url())) summary.errors.push(`${r.status()} ${r.url()}`);
});
const shot = (n) => page.screenshot({ path: join(outDir, `${id}-${n}.png`) });
const info = () => page.evaluate(() => (window.__gameDebug?.info ? window.__gameDebug.info() : null));
const overVisible = () => page.evaluate(() => !!document.querySelector('.arcade-overlay:not([hidden]) .over-score'));

try {
  await page.goto(`${base}/games/${id}?seed=7`);
  await page.waitForSelector('.arcade-panel [data-act="play"]', { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot('1-start');
  if (DAILY && !(await page.$('[data-act="daily"]'))) throw new Error(`--daily: ${id} has no daily mode (daily: false in registry.js)`);
  await page.click(DAILY ? '[data-act="daily"]' : '[data-act="play"]');
  await page.waitForTimeout(800);
  if (!(await page.evaluate(() => !!window.__gameDebug))) throw new Error('window.__gameDebug missing after start');
  const t0 = Date.now();
  let correct = 0;
  while (Date.now() - t0 < TIMEOUT && !(await overVisible())) {
    const before = await info();
    if (summary.samples.length < 6) summary.samples.push(before);
    if (correct < CORRECT) {
      await page.evaluate(() => window.__gameDebug.answer());
      correct++;
    } else {
      await page.evaluate(() => window.__gameDebug.wrong());
    }
    summary.steps++;
    if (summary.steps === 3) await shot('2-play');
    await page.waitForTimeout(DELAY);
  }
  if (!(await overVisible())) throw new Error(`no game over within ${TIMEOUT / 1000}s`);
  await page.waitForTimeout(500);
  summary.score = Number(await page.textContent('.over-score'));
  summary.missedShown = await page.$$eval('.missed-w', (l) => l.length);
  await shot('3-over');
  // play again (practice) → new round starts
  const again = (await page.$('[data-act="again"]')) ? '[data-act="again"]' : '[data-act="menu"]';
  await page.click(again);
  if (again === '[data-act="menu"]') await page.click('[data-act="play"]');
  await page.waitForTimeout(600);
  summary.secondRoundStarted = await page.evaluate(() => document.querySelector('.arcade-overlay').hidden);
  // pause / resume when supported
  if (await page.isVisible('[data-act="pause"]')) {
    await page.click('[data-act="pause"]');
    await page.waitForSelector('[data-act="resume"]');
    await shot('4-paused');
    await page.click('[data-act="resume"]');
    summary.pauseWorks = true;
  }
  // leave via the back button → arcade hub, shell cleaned up
  await page.click('[data-act="back"]');
  await page.waitForTimeout(600);
  summary.leftCleanly = await page.evaluate(() => location.pathname.endsWith('/games') && !document.body.classList.contains('in-arcade') && !window.__gameDebug);
  summary.ok = summary.errors.length === 0 && summary.secondRoundStarted && summary.leftCleanly;
} catch (err) {
  summary.errors.push(`test: ${err.message}`);
  await shot('x-failure').catch(() => {});
}
await browser.close();
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
