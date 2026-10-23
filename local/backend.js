// In-browser backend for the static (GitHub Pages) build. Runs the same API
// module as the Node server (lib/api.js) against SQLite compiled to
// WebAssembly (sql.js), persisted in IndexedDB. Accounts and progress live in
// this browser only.

import { createApi } from '../lib/api.js';
import { SCHEMA } from '../lib/schema.js';
import { indexVocab } from '../lib/vocab-core.js';

const TOKEN_KEY = 'dl_token';
const IDB_NAME = 'darija-libya';
const IDB_STORE = 'db';
const IDB_KEY = 'main';
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('darija-libya-db') : null;

// ------------------------------------------------------------------ sql.js → node:sqlite-style adapter
class BrowserDb {
  constructor(sqlDb) {
    this.d = sqlDb;
  }
  exec(sql) {
    this.d.exec(sql);
  }
  prepare(sql) {
    const d = this.d;
    const params = (p) => p.map((v) => (v === undefined ? null : v));
    return {
      run: (...p) => {
        d.run(sql, params(p));
        const id = d.exec('SELECT last_insert_rowid()')[0].values[0][0];
        return { changes: d.getRowsModified(), lastInsertRowid: id };
      },
      get: (...p) => {
        const st = d.prepare(sql);
        try {
          st.bind(params(p));
          return st.step() ? st.getAsObject() : undefined;
        } finally {
          st.free();
        }
      },
      all: (...p) => {
        const st = d.prepare(sql);
        const rows = [];
        try {
          st.bind(params(p));
          while (st.step()) rows.push(st.getAsObject());
        } finally {
          st.free();
        }
        return rows;
      },
    };
  }
}

// ------------------------------------------------------------------ WebCrypto primitives
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const PBKDF2_ITER = 210_000;

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export const browserCrypto = {
  async hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITER))}`;
  },
  async verifyPassword(password, stored) {
    const [scheme, iter, salt, hash] = String(stored).split('$');
    if (scheme !== 'pbkdf2' || !salt || !hash) return false;
    const a = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)));
    const b = unb64(hash);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  },
  async sha256(s) {
    const h = await crypto.subtle.digest('SHA-256', enc.encode(s));
    return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
  },
  randomToken() {
    return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
};

// ------------------------------------------------------------------ IndexedDB persistence
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet() {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => reject(r.error);
  });
}
async function idbPut(bytes) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(IDB_STORE, 'readwrite');
    t.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(s);
  });
}

// ------------------------------------------------------------------ backend
let ready = null;
let stale = false;
channel?.addEventListener('message', () => (stale = true));

async function boot() {
  await loadScript('vendor/sql-wasm.js');
  // eslint-disable-next-line no-undef
  const SQL = await initSqlJs({ locateFile: (f) => `vendor/${f}` });
  const words = await (await fetch('data/vocab.json')).json();
  const vocab = indexVocab(words);
  const state = { SQL, vocab, db: null, api: null };
  await reopen(state);
  return state;
}

async function reopen(state) {
  const saved = await idbGet().catch(() => null);
  const raw = saved ? new state.SQL.Database(saved) : new state.SQL.Database();
  const db = new BrowserDb(raw);
  db.exec(SCHEMA);
  state.raw?.close();
  state.raw = raw;
  state.db = db;
  state.api = createApi({ db, vocab: state.vocab, crypto: browserCrypto });
}

/** Handles an API request the way fetch() to the Node server would. */
export async function request(path, { method = 'GET', body } = {}) {
  ready ??= boot();
  const state = await ready;
  if (stale) {
    stale = false;
    await reopen(state); // another tab wrote; pick up its changes
  }
  const url = new URL(path, location.origin);
  const query = Object.fromEntries(url.searchParams);
  let token = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* storage blocked: act logged-out */
  }
  const out = await state.api.handle({ method, path: url.pathname, query, body, token, ip: 'local' });
  try {
    if (out.session === 'clear') localStorage.removeItem(TOKEN_KEY);
    else if (out.session) localStorage.setItem(TOKEN_KEY, out.session.token);
  } catch {
    /* ignore */
  }
  if (method !== 'GET') {
    await idbPut(state.raw.export());
    channel?.postMessage('changed');
  }
  return { status: out.status, json: out.json };
}
