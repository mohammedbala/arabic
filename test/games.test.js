import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../public/games/registry.js';
import {
  mulberry32,
  hashString,
  shuffle,
  dayNumber,
  normAr,
  arLetters,
  buildPool,
  distractors,
  shortEn,
  LEVELS,
} from '../public/games/common.js';
import { loadVocab } from '../server/vocab.js';
import { present } from '../server/core/vocab-core.js';

const vocab = loadVocab();
const words = vocab.byRank.map((w) => present(w));

test('seeded randomness and daily numbering are deterministic', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = Array.from({ length: 5 }, a);
  assert.deepEqual(seqA, Array.from({ length: 5 }, b));
  assert.ok(seqA.every((x) => x >= 0 && x < 1));
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], mulberry32(7)), shuffle([1, 2, 3, 4, 5], mulberry32(7)));
  assert.equal(hashString('kalima:1'), hashString('kalima:1'));
  assert.notEqual(hashString('kalima:1'), hashString('kalima:2'));
  assert.equal(dayNumber(new Date(2026, 9, 23, 0, 5)), 1);
  assert.equal(dayNumber(new Date(2026, 9, 23, 23, 55)), 1);
  assert.equal(dayNumber(new Date(2026, 9, 24, 9)), 2);
});

test('Arabic normalisation for letter games', () => {
  assert.equal(normAr('أَنا'), 'انا');
  assert.equal(normAr('مشى'), 'مشي');
  assert.deepEqual(arLetters('كِلْمَة'), ['ك', 'ل', 'م', 'ة']);
  assert.deepEqual(arLetters('إنتَ'), ['ا', 'ن', 'ت']);
});

test('word pools follow usage rank and distractors are never the answer', () => {
  const pool = buildPool(words, { level: 'top300' });
  assert.equal(pool.length, 300);
  assert.ok(pool.every((w, i) => !i || pool[i - 1].rank < w.rank));
  const learned = new Set(words.slice(500, 520).map((w) => w.id));
  assert.deepEqual(buildPool(words, { level: 'mine', learnedIds: learned }).map((w) => w.id), [...learned]);
  // too few studied words → falls back to the top-300 level
  assert.equal(buildPool(words, { level: 'mine', learnedIds: new Set([1]) }).length, 300);
  const rng = mulberry32(1);
  for (const w of pool.slice(0, 150)) {
    const ds = distractors(w, pool, 3, rng);
    assert.equal(ds.length, 3);
    for (const d of ds) {
      assert.notEqual(d.id, w.id);
      assert.notEqual(normAr(d.ar), normAr(w.ar));
      assert.notEqual(d.en.toLowerCase(), w.en.toLowerCase());
    }
    assert.equal(new Set(ds.map((d) => normAr(d.ar))).size, 3);
  }
  assert.equal(shortEn({ en: 'to go out; to go up' }), 'to go out');
  assert.equal(shortEn({ en: 'thing (something); need' }), 'thing');
  assert.equal(shortEn({ en: 'this (m.)' }), 'this (m.)');
  assert.equal(shortEn({ en: 'you (m. sg.)' }), 'you (m. sg.)');
  assert.equal(shortEn({ en: 'sfinz (Libyan fried dough; doughnut)' }), 'sfinz');
});

test('distractors skip synonyms, shared senses and shadda look-alikes', () => {
  const W = (id, ar, en, pos = 'noun', cat = 'family') => ({ id, ar, en, pos, cat, rank: id });
  const mother = W(1, 'أم', 'mother');
  const pool = [mother, W(2, 'ماما', 'mum; mom'), W(3, 'بو', 'father'), W(4, 'خو', 'brother'), W(5, 'خت', 'sister'), W(6, 'ولد', 'boy; son'), W(7, 'أمّ', 'parent; mother (formal)')];
  for (let seed = 1; seed < 40; seed++) {
    const ds = distractors(mother, pool, 3, mulberry32(seed)).map((d) => d.id);
    assert.ok(!ds.includes(2) && !ds.includes(7), `seed ${seed}: ${ds}`);
    assert.equal(ds.length, 3);
  }
  const pay = W(10, 'خلّص', 'to pay', 'verb', 'verbs-work');
  const end = W(11, 'خلص', 'to end; to finish', 'verb', 'verbs-work');
  assert.deepEqual(distractors(pay, [pay, end], 1, mulberry32(3)).map((d) => d.id), [11]);
});

test('every arcade game module follows the contract and has enough words', async () => {
  const ids = new Set();
  for (const entry of GAMES) {
    assert.match(entry.id, /^[a-z0-9-]{2,24}$/);
    assert.ok(!ids.has(entry.id), `duplicate game id ${entry.id}`);
    ids.add(entry.id);
    for (const k of ['title', 'emoji', 'inspiredBy', 'tagline', 'accent']) assert.ok(entry[k], `${entry.id}.${k}`);
    const mod = (await entry.load()).default;
    assert.equal(typeof mod.create, 'function', `${entry.id}: create()`);
    assert.ok(Array.isArray(mod.howTo) && mod.howTo.length > 0, `${entry.id}: howTo`);
    const filter = mod.wordFilter ?? (() => true);
    const min = mod.minWords ?? 12;
    for (const lv of LEVELS.filter((l) => l.id !== 'mine')) {
      const pool = buildPool(words, { level: lv.id, filter, min });
      assert.ok(pool.length >= min, `${entry.id}: level ${lv.id} has ${pool.length} < ${min} words`);
    }
    if (entry.daily) assert.ok(buildPool(words, { level: 'top1000', filter, min }).length >= min);
  }
});
