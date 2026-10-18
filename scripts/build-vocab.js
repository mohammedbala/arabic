// Merges data/vocab/part*.json into data/vocab.json.
//  - validates every entry against the card spec
//  - de-duplicates on (ar, en)
//  - keeps word ids stable across rebuilds (user progress references them)
//  - assigns a learning `rank`: frequency tier first, then categories are
//    interleaved round-robin inside each tier so a study session mixes topics
//    (interleaving beats blocked practice and avoids interference between
//    near-synonyms learned back to back).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const partsDir = join(root, 'data', 'vocab');
const outFile = join(root, 'data', 'vocab.json');
const checkOnly = process.argv.includes('--check');

const REQUIRED = ['ar', 'tr', 'en', 'msa', 'pos', 'cat', 'freq', 'ex_ar', 'ex_tr', 'ex_en'];
const POS = new Set(['noun', 'verb', 'adj', 'adv', 'pron', 'prep', 'conj', 'phrase', 'num', 'interj', 'particle']);
const ARABIC = /[؀-ۿ]/;

const norm = (s) => String(s).normalize('NFC').replace(/[ً-ْٰـ]/g, '').trim();
const key = (w) => `${norm(w.ar)}|${String(w.en).toLowerCase().trim()}`;

const files = readdirSync(partsDir).filter((f) => /^part\d+\.json$/.test(f)).sort();
const errors = [];
const seen = new Map();
let raw = 0;

for (const f of files) {
  let arr;
  try {
    arr = JSON.parse(readFileSync(join(partsDir, f), 'utf8'));
  } catch (e) {
    errors.push(`${f}: invalid JSON (${e.message})`);
    continue;
  }
  if (!Array.isArray(arr)) {
    errors.push(`${f}: not an array`);
    continue;
  }
  arr.forEach((w, i) => {
    raw++;
    const where = `${f}[${i}]`;
    for (const k of REQUIRED) if (w[k] === undefined || w[k] === '') errors.push(`${where}: missing ${k}`);
    if (w.pos && !POS.has(w.pos)) errors.push(`${where}: bad pos ${w.pos}`);
    if (w.ar && !ARABIC.test(w.ar)) errors.push(`${where}: ar has no Arabic script`);
    const freq = Number(w.freq);
    if (!(freq >= 1 && freq <= 5)) errors.push(`${where}: freq must be 1..5`);
    if (!w.ar || !w.en) return;
    const k = key(w);
    if (!seen.has(k)) seen.set(k, { ...w, freq: Math.round(freq) || 3, _src: f });
  });
}

// Stable ids from the previous build.
const prev = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : [];
const idByKey = new Map(prev.map((w) => [key(w), w.id]));
let nextId = prev.reduce((m, w) => Math.max(m, w.id), 0) + 1;

const words = [...seen.values()].map((w) => {
  const id = idByKey.get(key(w)) ?? nextId++;
  const { _src, ...rest } = w;
  return { id, ...rest, note: w.note ?? '' };
});

// Rank: tier by freq, interleave categories within a tier.
const ranked = [];
for (let tier = 1; tier <= 5; tier++) {
  const byCat = new Map();
  for (const w of words.filter((x) => x.freq === tier)) {
    if (!byCat.has(w.cat)) byCat.set(w.cat, []);
    byCat.get(w.cat).push(w);
  }
  const queues = [...byCat.values()];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) ranked.push(q.shift());
}
ranked.forEach((w, i) => (w.rank = i + 1));
ranked.sort((a, b) => a.id - b.id);

const cats = {};
for (const w of ranked) cats[w.cat] = (cats[w.cat] ?? 0) + 1;

console.log(`parts: ${files.join(', ')}`);
console.log(`raw entries: ${raw}, unique: ${ranked.length}, duplicates dropped: ${raw - ranked.length}`);
console.log('by category:', cats);
if (errors.length) {
  console.log(`\n${errors.length} validation problem(s):`);
  for (const e of errors.slice(0, 50)) console.log('  ' + e);
}
if (!checkOnly) {
  writeFileSync(outFile, JSON.stringify(ranked, null, 0).replace(/},{/g, '},\n{') + '\n');
  console.log(`wrote ${outFile}`);
}
process.exitCode = errors.length ? 1 : 0;
