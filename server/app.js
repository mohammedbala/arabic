import express from 'express';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SESSION_COOKIE, nodeCrypto } from './auth.js';
import { createApi } from './core/api.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Express adapter around the shared API in core/api.js.
export function createApp({ db, vocab, secureCookies = false }) {
  const api = createApi({ db, vocab, crypto: nodeCrypto });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    next();
  });

  // CSRF defence: state-changing API calls must be JSON (forms can't send that
  // cross-site without a CORS preflight) and cookies are SameSite=Lax.
  app.use('/api', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    const out = await api.handle({
      method: req.method,
      path: req.baseUrl + req.path,
      query: req.query,
      body: req.body,
      token: req.cookies?.[SESSION_COOKIE],
      ip: req.ip,
    });
    if (out.session === 'clear') res.clearCookie(SESSION_COOKIE, { path: '/' });
    else if (out.session) {
      res.cookie(SESSION_COOKIE, out.session.token, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: out.session.maxAge, path: '/' });
    }
    if (out.cache) res.set('Cache-Control', out.cache);
    res.status(out.status).json(out.json);
  });

  // ------------------------------------------------------------ static SPA
  app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(publicDir, 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
  });

  return app;
}
