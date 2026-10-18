// Builds the static GitHub Pages site into dist/.
//   PAGES_BASE=/arabic/ node scripts/build-pages.js
// The API runs in the browser (public/local/backend.js) using the same
// modules as the server (server/core → dist/lib) on sql.js + IndexedDB.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
let base = process.env.PAGES_BASE || '/arabic/';
if (!base.startsWith('/')) base = '/' + base;
if (!base.endsWith('/')) base += '/';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'public'), out, { recursive: true });

mkdirSync(join(out, 'lib'));
for (const f of readdirSync(join(root, 'server', 'core'))) {
  const src = readFileSync(join(root, 'server', 'core', f), 'utf8');
  if (/from 'node:|require\(/.test(src)) throw new Error(`server/core/${f} must stay browser-safe (no Node imports)`);
  writeFileSync(join(out, 'lib', f), src);
}

mkdirSync(join(out, 'data'));
cpSync(join(root, 'data', 'vocab.json'), join(out, 'data', 'vocab.json'));

mkdirSync(join(out, 'vendor'));
for (const f of ['sql-wasm.js', 'sql-wasm.wasm']) cpSync(join(root, 'node_modules', 'sql.js', 'dist', f), join(out, 'vendor', f));

const index = readFileSync(join(out, 'index.html'), 'utf8')
  .replace('<html lang="en">', '<html lang="en" data-static="1">')
  .replace('<base href="/" />', `<base href="${base}" />`);
if (!index.includes('data-static="1"') || !index.includes(`<base href="${base}" />`)) throw new Error('index.html markers not found');
writeFileSync(join(out, 'index.html'), index);
// GitHub Pages serves 404.html for unknown paths: reuse the SPA so deep links work.
writeFileSync(join(out, '404.html'), index);
writeFileSync(join(out, '.nojekyll'), '');

console.log(`Built static site in dist/ (base ${base})`);
