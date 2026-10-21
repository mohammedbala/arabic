// Merges data/vocab/part*.json into data/vocab.json.
//  - validates every entry against the card spec (SPEC.md, incl. v2:
//    `usage` 1–100 and ≥2 `phrases`)
//  - de-duplicates on (ar, en); a later duplicate only fills fields the
//    first one lacks
//  - keeps word ids stable across rebuilds (user progress references them)
//  - assigns `rank` by usage: higher `usage` first, then frequency tier; among
//    equal scores categories are interleaved round-robin so a study session
//    mixes topics (interleaving beats blocked practice and avoids
//    interference between near-synonyms learned back to back)
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
// Tier fallback when an entry has no usage score yet.
const USAGE_FROM_FREQ = { 1: 70, 2: 55, 3: 45, 4: 35, 5: 25 };

const norm = (s) =>
  String(s)
    .normalize('NFC')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .trim();
const key = (w) => `${norm(w.ar)}|${String(w.en).toLowerCase().trim()}`;

const files = readdirSync(partsDir)
  .filter((f) => /^part\d+\.json$/.test(f))
  .sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));
const errors = [];
const seen = new Map();
let raw = 0;
let noUsage = 0;
let fewPhrases = 0;

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
    if (w.usage !== undefined && !(Number.isInteger(w.usage) && w.usage >= 1 && w.usage <= 100)) errors.push(`${where}: usage must be 1..100`);
    const phrases = Array.isArray(w.phrases) ? w.phrases.filter((p) => p?.ar && p?.en && ARABIC.test(p.ar)) : [];
    if (!w.ar || !w.en) return;
    const k = key(w);
    const entry = { ...w, freq: Math.round(freq) || 3, phrases };
    const prior = seen.get(k);
    if (!prior) seen.set(k, entry);
    else {
      if (prior.usage === undefined && entry.usage !== undefined) prior.usage = entry.usage;
      if (prior.phrases.length < 2 && entry.phrases.length) prior.phrases = [...prior.phrases, ...entry.phrases].slice(0, 4);
    }
  });
}

// Stable ids from the previous build.
const prev = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : [];
const idByKey = new Map(prev.map((w) => [key(w), w.id]));
let nextId = prev.reduce((m, w) => Math.max(m, w.id), 0) + 1;

const words = [...seen.values()].map((w) => {
  const id = idByKey.get(key(w)) ?? nextId++;
  if (w.usage === undefined) noUsage++;
  if (w.phrases.length < 2) fewPhrases++;
  return {
    id,
    ...w,
    usage: w.usage ?? USAGE_FROM_FREQ[w.freq],
    note: w.note ?? '',
    phrases: w.phrases.map(({ ar, tr, en }) => ({ ar, tr: tr ?? '', en })),
  };
});

// Rank: usage desc, then freq tier asc; interleave categories among ties.
const groups = new Map();
for (const w of words) {
  const g = `${String(100 - w.usage).padStart(3, '0')}-${w.freq}`;
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(w);
}
const ranked = [];
for (const g of [...groups.keys()].sort()) {
  const byCat = new Map();
  for (const w of groups.get(g)) {
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
const bands = {};
for (const w of ranked) bands[Math.floor(w.usage / 10) * 10] = (bands[Math.floor(w.usage / 10) * 10] ?? 0) + 1;

console.log(`parts: ${files.join(', ')}`);
console.log(`raw entries: ${raw}, unique: ${ranked.length}, duplicates dropped: ${raw - ranked.length}`);
console.log(`missing usage: ${noUsage}, fewer than 2 phrases: ${fewPhrases}`);
console.log('usage bands:', bands);
console.log('by category:', cats);
if (errors.length) {
  console.log(`\n${errors.length} validation problem(s):`);
  for (const e of errors.slice(0, 50)) console.log('  ' + e);
}
if (!checkOnly) {
  writeFileSync(outFile, JSON.stringify(ranked, null, 0).replace(/},{"id"/g, '},\n{"id"') + '\n');
  console.log(`wrote ${outFile}`);
}
process.exitCode = errors.length ? 1 : 0;
