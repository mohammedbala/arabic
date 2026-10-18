import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { loadVocab } from './vocab.js';
import { createApp } from './app.js';
import { pruneSessions } from './core/api.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = process.env.DB_FILE || join(root, 'data', 'app.db');
const port = Number(process.env.PORT) || 3000;

const db = openDb(dbFile);
const vocab = loadVocab();
if (!vocab.words.length) console.warn('No vocabulary found — run `npm run build:vocab`.');
pruneSessions(db);
setInterval(() => pruneSessions(db), 6 * 3_600_000).unref();

const app = createApp({ db, vocab, secureCookies: process.env.SECURE_COOKIES === '1' });
app.listen(port, () => {
  console.log(`Darija Libya running on http://localhost:${port} (${vocab.words.length} words, db: ${dbFile})`);
});
