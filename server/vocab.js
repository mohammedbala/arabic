import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexVocab } from './core/vocab-core.js';

export { present } from './core/vocab-core.js';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'vocab.json');

export function loadVocab(path = file) {
  return indexVocab(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []);
}
