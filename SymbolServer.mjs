/**
 * SymbolServer.mjs
 *
 * WHAT THIS DOES (CSV -> Server-backed Autocomplete):
 * - Replaces your frontend CSV autocomplete with a backend index using SQLite + FTS5.
 * - Seeds the DB from stock_data.csv (tab OR comma delimited) if the DB is empty.
 * - Exposes /api/symbols for ultra-fast autocomplete (prefix + FTS search).
 * - Lets you "learn" new symbols via POST /api/tickers after a successful chart render.
 * - Supports nightly refresh from a listings URL (CSV or JSON) when run with --refresh.
 *
 * HOW TO USE:
 *   1) npm i express better-sqlite3 dotenv
 *   2) node SymbolServer.mjs
 *      - Server at http://localhost:${process.env.PORT || 3001}
 *   3) To refresh from provider listings:
 *      - Put LIST_URL in .env (optionally LIST_KEY, PORT)
 *      - node SymbolServer.mjs --refresh
 *
 * FRONTEND CHANGE (summary):
 *   - Stop fetching CSV on the client.
 *   - Replace with XHR: GET /api/symbols?q=TSLA  (debounced 100–150ms, uppercase input)
 *   - After a chart loads for a new symbol, POST /api/tickers {symbol,name} to "learn" it.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT           = Number(process.env.PORT || 3001);
const DB_PATH        = path.resolve(__dirname, 'symbols.db');
const LOCAL_CSV_PATH = path.resolve(__dirname, 'stock_data.csv');

if (typeof fetch !== 'function') {
  throw new Error('This script requires Node 18+ where fetch is globally available.');
}

function toUpperTrim(x) {
  return String(x || '').toUpperCase().trim();
}
function isGoodSymbol(symbol) {
  return /^[A-Z0-9.^$\-]{1,12}$/.test(symbol);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS symbols (
    symbol TEXT PRIMARY KEY,
    name   TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts
  USING fts5(symbol, name, content='symbols', content_rowid='rowid');

  CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
    INSERT INTO symbols_fts(rowid, symbol, name) VALUES (new.rowid, new.symbol, new.name);
  END;
  CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
    INSERT INTO symbols_fts(symbol, name, rowid) VALUES ('delete', 'delete', old.rowid);
  END;
  CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
    INSERT INTO symbols_fts(rowid, symbol, name) VALUES (new.rowid, new.symbol, new.name);
  END;
`);

function tableIsEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM symbols').get();
  return (row?.n ?? 0) === 0;
}

async function seedFromLocalCSVIfEmpty() {
  if (!fs.existsSync(LOCAL_CSV_PATH)) return;
  if (!tableIsEmpty()) return;

  console.log('[seed] Seeding from local CSV:', LOCAL_CSV_PATH);
  const raw = fs.readFileSync(LOCAL_CSV_PATH, 'utf8').split(/\r?\n/);

  let delim = ',';
  for (const l of raw) {
    if (l && /\S/.test(l)) {
      delim = l.includes('\t') ? '\t' : ',';
      break;
    }
  }
  const header = (raw[0] || '').split(delim).map(s => s.toLowerCase());
  let startIdx = 0;
  let symIdx = 0, nameIdx = 1;

  const headerLooksLikeHeader =
    header.some(h => /^(symbol|ticker)$/i.test(h)) ||
    header.some(h => /^(name|company|company_name|security)$/i.test(h));

  if (headerLooksLikeHeader) {
    symIdx  = header.findIndex(h => /^(symbol|ticker)$/i.test(h));
    nameIdx = header.findIndex(h => /^(name|company|company_name|security)$/i.test(h));
    if (symIdx < 0) symIdx = 0;
    if (nameIdx < 0) nameIdx = 1;
    startIdx = 1;
  }

  const insert = db.prepare(
    'INSERT INTO symbols(symbol,name) VALUES (?,?) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name'
  );
  const insertMany = db.transaction(rows => {
    for (const [s, n] of rows) insert.run(s, n);
  });

  const batch = [];
  for (let i = startIdx; i < raw.length; i++) {
    const line = raw[i];
    if (!line || !/\S/.test(line)) continue;
    const parts = line.split(delim);

    const sym = toUpperTrim(parts[symIdx] || '');
    const name = String(parts[nameIdx] || '').trim();

    if (!isGoodSymbol(sym)) continue;
    batch.push([sym, name]);
    if (batch.length >= 10000) { insertMany(batch.splice(0)); }
  }
  if (batch.length) insertMany(batch);

  console.log('[seed] Seed complete.');
}

async function refreshFromProvider() {
  const url = process.env.LIST_URL || '';
  const key = process.env.LIST_KEY || '';

  if (!url) {
    console.error('[refresh] LIST_URL not provided in environment (.env). Aborting.');
    process.exit(1);
  }

  console.log('[refresh] Downloading listings from:', url);
  const headers = {};
  if (key) headers['Authorization'] = `Bearer ${key}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`[refresh] HTTP ${res.status} from provider`);
  }
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();

  const insert = db.prepare(
    'INSERT INTO symbols(symbol,name) VALUES (?,?) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name'
  );
  const insertMany = db.transaction(rows => {
    for (const [s, n] of rows) insert.run(s, n);
  });

  if (contentType.includes('application/json') || url.endsWith('.json')) {
    console.log('[refresh] Parsing JSON…');
    let arr;
    try {
      arr = JSON.parse(text);
    } catch (e) {
      throw new Error('[refresh] Failed to parse JSON: ' + e.message);
    }
    const rows = [];
    for (const x of arr) {
      const sym = toUpperTrim(x.symbol ?? x.ticker ?? '');
      const name = String(x.name ?? x.companyName ?? '').trim();
      if (!isGoodSymbol(sym)) continue;
      rows.push([sym, name]);
      if (rows.length >= 10000) { insertMany(rows.splice(0)); }
    }
    if (rows.length) insertMany(rows);
  } else {
    console.log('[refresh] Parsing CSV…');
    const lines = text.split(/\r?\n/);
    let delim = ',';
    for (const l of lines) {
      if (l && /\S/.test(l)) {
        delim = l.includes('\t') ? '\t' : ',';
        break;
      }
    }
    const header = (lines.shift() || '').split(delim).map(s => s.toLowerCase());
    let symIdx = header.findIndex(h => /^(symbol|ticker)$/i.test(h));
    let nameIdx = header.findIndex(h => /^(name|security|company.?name)$/i.test(h));
    if (symIdx < 0) symIdx = 0;
    if (nameIdx < 0) nameIdx = 1;

    const rows = [];
    for (const line of lines) {
      if (!line || !/\S/.test(line)) continue;
      const parts = line.split(delim);
      const sym = toUpperTrim(parts[symIdx] || '');
      const name = String(parts[nameIdx] || '').trim();
      if (!isGoodSymbol(sym)) continue;
      rows.push([sym, name]);
      if (rows.length >= 10000) { insertMany(rows.splice(0)); }
    }
    if (rows.length) insertMany(rows);
  }

  console.log('[refresh] Listings refresh complete.');
}

function createServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/symbols', (req, res) => {
    const q = toUpperTrim(req.query.q || '');
    if (!q) return res.json([]);

    const prefixRows = db.prepare(`
      SELECT symbol, name FROM symbols
      WHERE symbol LIKE ? ESCAPE '\\'
      ORDER BY symbol
      LIMIT 12
    `).all(`${q.replace(/([_%\\])/g,'\\$1')}%`);

    let rows = prefixRows;

    if (rows.length < 12) {
      const need = 12 - rows.length;
      const ftsRows = db.prepare(`
        SELECT s.symbol, s.name
        FROM symbols_fts f
        JOIN symbols s ON s.rowid = f.rowid
        WHERE f MATCH ?
        LIMIT ?
      `).all(q + '*', need);

      const seen = new Set(rows.map(r => r.symbol));
      for (const r of ftsRows) {
        if (!seen.has(r.symbol)) {
          rows.push(r);
          seen.add(r.symbol);
          if (rows.length >= 12) break;
        }
      }
    }

    res.json(rows);
  });

  app.get('/api/validate', (req, res) => {
    const t = toUpperTrim(req.query.t || '');
    if (!t) return res.json({ ok: false });
    const hit = db.prepare('SELECT 1 FROM symbols WHERE symbol=?').get(t);
    res.json({ ok: !!hit });
  });

  app.post('/api/tickers', (req, res) => {
    const s = toUpperTrim(req.body?.symbol || '');
    const n = String(req.body?.name || '').trim();
    if (!isGoodSymbol(s)) {
      return res.status(400).json({ error: 'bad symbol' });
    }
    db.prepare('INSERT INTO symbols(symbol,name) VALUES (?,?) ON CONFLICT(symbol) DO NOTHING').run(s, n);
    return res.json({ ok: true });
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.listen(PORT, () => {
    console.log(`[server] Symbols API running on http://localhost:${PORT}`);
  });
}

(async () => {
  const isRefreshMode = process.argv.includes('--refresh');

  if (isRefreshMode) {
    await refreshFromProvider();
    process.exit(0);
  } else {
    await seedFromLocalCSVIfEmpty();
    createServer();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

/**
 * -------------------------------
 * FRONTEND MIGRATION (CHEATSHEET)
 * -------------------------------
 * Replace your CSV-based autocomplete with:
 *
 * // Debounce helper
 * const debounce = (fn,ms)=>{let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} };
 * let acAbort;
 *
 * async function searchSymbols(q){
 *   if (acAbort) acAbort.abort();
 *   acAbort = new AbortController();
 *   const r = await fetch(`/api/symbols?q=${encodeURIComponent(q)}`, { signal: acAbort.signal });
 *   if (!r.ok) return [];
 *   return r.json();
 * }
 *
 * inputEl.addEventListener('input', debounce(async () => {
 *   const q = inputEl.value.trim().toUpperCase();
 *   if (!q) { hideAutocomplete(); return; }
 *   const rows = await searchSymbols(q);
 *   renderAutocomplete(rows); // your existing renderer
 * }, 120));
 *
 * // After a chart successfully loads for a symbol not in your index yet:
 * fetch('/api/tickers', {
 *   method: 'POST',
 *   headers: {'Content-Type':'application/json'},
 *   body: JSON.stringify({ symbol: TICKER, name: CompanyName || '' })
 * });
 *
 * // UX tips:
 * // - Uppercase the input as the user types.
 * // - Limit to 10–12 results; show ticker big, name muted.
 * // - Enter key selects the first result; allow arrow-key navigation.
 * // - Cache last ~50 lookups in localStorage for instant “Recents”.
 */
