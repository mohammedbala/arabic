// Serves dist/ under a sub-path the way GitHub Pages does (unknown paths get
// 404.html), for checking the static build locally:
//   npm run build:pages && node scripts/serve-dist.js   → http://localhost:4000/arabic/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const base = (process.env.PAGES_BASE || '/arabic/').replace(/\/?$/, '/');
const port = Number(process.env.PORT) || 4000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null;
  if (rel === '') rel = 'index.html';
  const file = rel == null ? null : normalize(join(dist, decodeURIComponent(rel)));
  try {
    if (!file || !file.startsWith(dist)) throw new Error('outside');
    // Like GitHub Pages: a directory with index.html redirects to its trailing-slash URL and serves it.
    if ((await stat(file)).isDirectory()) {
      await stat(join(file, 'index.html'));
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { Location: url.pathname + '/' + url.search });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': TYPES['.html'] });
      return res.end(await readFile(join(file, 'index.html')));
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(await readFile(join(dist, '404.html')));
  }
}).listen(port, () => console.log(`dist/ at http://localhost:${port}${base}`));
