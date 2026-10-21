// Validates one vocabulary part file against SPEC.md (v2) and reports
// duplicates against every other part file.
//   node scripts/check-part.js data/vocab/part7.json [--legacy]
// --legacy skips the v2-only fields (usage, phrases).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'vocab');
const target = resolve(process.argv[2] ?? '');
const legacy = process.argv.includes('--legacy');
const REQUIRED = ['ar', 'tr', 'en', 'msa', 'pos', 'cat', 'freq', 'ex_ar', 'ex_tr', 'ex_en'];
const POS = new Set(['noun', 'verb', 'adj', 'adv', 'pron', 'prep', 'conj', 'phrase', 'num', 'interj', 'particle']);
const norm = (s) => String(s ?? '').normalize('NFC').replace(/[ً-ْٰـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').trim();
const keyOf = (w) => `${norm(w.ar)}|${String(w.en).toLowerCase().trim()}`;

let arr;
try {
  arr = JSON.parse(readFileSync(target, 'utf8'));
} catch (e) {
  console.log(`ERROR invalid JSON: ${e.message}`);
  process.exit(1);
}
const others = new Map();
const otherAr = new Map();
for (const f of readdirSync(dir).filter((f) => /^part\d+\.json$/.test(f) && join(dir, f) !== target)) {
  for (const w of JSON.parse(readFileSync(join(dir, f), 'utf8'))) {
    others.set(keyOf(w), f);
    if (!otherAr.has(norm(w.ar))) otherAr.set(norm(w.ar), `${f}: ${w.en}`);
  }
}
let errors = 0, dups = 0, warns = 0;
const seen = new Set();
arr.forEach((w, i) => {
  const at = `[${i}] ${w.ar ?? '?'} (${w.en ?? '?'})`;
  const err = (m) => (errors++, console.log(`ERROR ${at}: ${m}`));
  for (const k of REQUIRED) if (w[k] === undefined || w[k] === '') err(`missing ${k}`);
  if (w.pos && !POS.has(w.pos)) err(`bad pos ${w.pos}`);
  if (w.ar && !/[؀-ۿ]/.test(w.ar)) err('ar has no Arabic script');
  if (!(w.freq >= 1 && w.freq <= 5)) err('freq must be 1..5');
  if (!legacy) {
    if (!Number.isInteger(w.usage) || w.usage < 1 || w.usage > 100) err('usage must be an integer 1..100');
    if (!Array.isArray(w.phrases) || w.phrases.length < 2) err('phrases must have at least 2 items');
    else {
      const texts = new Set([norm(w.ex_ar)]);
      w.phrases.forEach((p, j) => {
        if (!p?.ar || !p?.tr || !p?.en) err(`phrases[${j}] needs ar, tr, en`);
        else if (!/[؀-ۿ]/.test(p.ar)) err(`phrases[${j}].ar has no Arabic`);
        else if (texts.has(norm(p.ar))) err(`phrases[${j}] repeats another usage`);
        texts.add(norm(p.ar));
      });
    }
  }
  const k = keyOf(w);
  if (seen.has(k)) (dups++, console.log(`DUP ${at}: repeated inside this file`));
  seen.add(k);
  if (others.has(k)) (dups++, console.log(`DUP ${at}: already in ${others.get(k)}`));
  else if (otherAr.has(norm(w.ar))) (warns++, console.log(`SAME-AR ${at}: also ${otherAr.get(norm(w.ar))}`));
});
console.log(`\n${basename(target)}: ${arr.length} entries · ${errors} errors · ${dups} duplicates · ${warns} same-Arabic warnings`);
process.exit(errors || dups ? 1 : 0);
