// server.js — Express server + autocomplete API (CSV-seeded, in-memory)
const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- In-memory symbol index ---------------------------------------------------
let SYMBOLS = []; // [{symbol:'AAPL', name:'Apple Inc.'}, ...]

function seedFromCSVIfPresent() {
  try {
    const csvPath = fs.existsSync(path.join(__dirname, 'public', 'stock_data.csv'))
      ? path.join(__dirname, 'public', 'stock_data.csv')
      : (fs.existsSync(path.join(__dirname, 'stock_data.csv'))
          ? path.join(__dirname, 'stock_data.csv')
          : null);

    if (!csvPath) {
      if (!SYMBOLS.length) {
        SYMBOLS = [
          { symbol:'AAPL', name:'Apple Inc' },
          { symbol:'MSFT', name:'Microsoft Corp' },
          { symbol:'AMZN', name:'Amazon.com Inc' },
          { symbol:'GOOGL', name:'Alphabet Inc Class A' },
          { symbol:'NVDA', name:'NVIDIA Corp' },
          { symbol:'META', name:'Meta Platforms Inc' },
          { symbol:'TSLA', name:'Tesla Inc' },
          { symbol:'AMD',  name:'Advanced Micro Devices Inc' },
          { symbol:'RGTI', name:'Rigetti Computing Inc' },
          { symbol:'X',    name:'United States Steel Corp' },
        ];
      }
      console.log('[symbols] No CSV found; using built-in starter list (%d)', SYMBOLS.length);
      return;
    }

    const raw = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
    const first = raw[0] || '';
    const delim = first.includes('\t') ? '\t' : ',';
    let start = 0, symIdx = 0, nameIdx = 1;

    const maybeHeader = first.split(delim).map(s => s.toLowerCase());
    if (maybeHeader.some(h => /^(symbol|ticker)$/.test(h))) {
      symIdx = maybeHeader.findIndex(h => /^(symbol|ticker)$/.test(h));
      nameIdx = maybeHeader.findIndex(h => /^(name|company|company_name|security)$/.test(h));
      if (symIdx < 0) symIdx = 0;
      if (nameIdx < 0) nameIdx = 1;
      start = 1;
    }

    const tmp = [];
    for (let i = start; i < raw.length; i++) {
      const parts = raw[i].split(delim);
      const s = String(parts[symIdx] || '').toUpperCase().trim();
      const n = String(parts[nameIdx] || '').trim();
      if (!/^[A-Z0-9.^$\-]{1,12}$/.test(s)) continue;
      tmp.push({ symbol: s, name: n });
    }
    SYMBOLS = tmp;
    console.log('[symbols] Seeded from CSV: %d symbols (%s)', SYMBOLS.length, path.basename(csvPath));
  } catch (e) {
    console.warn('[symbols] CSV seed failed:', e.message);
  }
}
seedFromCSVIfPresent();

// --- Autocomplete API (proxy-aware) -----------------------------------------
app.get('/api/symbols', (req, res) => {
  const q = String(req.query.q || '').toUpperCase().trim();
  if (!q) return res.json([]);

  // 1) Prefix match on symbol
  const out = [];
  for (const r of SYMBOLS) {
    if (r.symbol.startsWith(q)) {
      out.push(r);
      if (out.length >= 12) break;
    }
  }

  // 2) If not enough, name contains / symbol contains
  if (out.length < 12) {
    const seen = new Set(out.map(r => r.symbol));
    for (const r of SYMBOLS) {
      if (seen.has(r.symbol)) continue;
      if (r.symbol.includes(q) || (r.name && r.name.toUpperCase().includes(q))) {
        out.push(r);
        seen.add(r.symbol);
        if (out.length >= 12) break;
      }
    }
  }

  res.json(out.slice(0, 12));
});

app.get('/api/validate', (req, res) => {
  const t = String(req.query.t || '').toUpperCase().trim();
  const ok = !!SYMBOLS.find(r => r.symbol === t);
  res.json({ ok });
});

app.post('/api/tickers', (req, res) => {
  try {
    const s = String(req.body?.symbol || '').toUpperCase().trim();
    const n = String(req.body?.name || '').trim();
    if (!/^[A-Z0-9.^$\-]{1,12}$/.test(s)) return res.status(400).json({ error: 'bad symbol' });
    if (!SYMBOLS.find(r => r.symbol === s)) SYMBOLS.push({ symbol: s, name: n });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Existing routes you had --------------------------------------------------

// Serve index.html as the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Proxy /api/summary to Yahoo Finance
app.get('/api/summary', async (req, res) => {
  const ticker = req.query.ticker;
  if (!ticker) return res.status(400).json({error:'Missing ticker'});
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,financialData,earningsTrend,price`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({error:'Yahoo summary failed', details: e.message});
  }
});

// Proxy /api/chart to Yahoo Finance
app.get('/api/chart', async (req, res) => {
  const ticker = req.query.ticker;
  const range = req.query.range || '1d';
  const interval = req.query.interval || '5m';
  if (!ticker) return res.status(400).json({error:'Missing ticker'});
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({error:'Yahoo chart failed', details: e.message});
  }
});

// Proxy /api/market-index/:symbol (FMP)
app.get('/api/market-index/:symbol', async (req, res) => {
  const map = { DJI:'dowjones', IXIC:'nasdaq', GSPC:'sp500' };
  const idx = map[req.params.symbol];
  if (!idx) return res.status(400).json({error:'Invalid index symbol'});
  try {
    const url = `https://financialmodelingprep.com/api/v3/quote/${idx}`;
    const r = await fetch(url);
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) throw new Error('No data');
    const d = arr[0];
    const last = d.price;
       const change = d.change;
    const percent = d.changesPercentage;
    const dateText = d.timestamp
      ? new Date(d.timestamp * 1000).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', second:'2-digit', hour12:true, timeZone:'America/New_York' }) + ' ET'
      : '—';
    res.json({ last, change, percent, dateText });
  } catch (e) {
    res.status(500).json({error:'FMP index failed', details: e.message});
  }
});

// Health check
app.get('/api/health', (_req, res) => res.json({ok:true}));

app.listen(PORT, () => {
  console.log(`Stock Analyzer server running on http://localhost:${PORT}`);
});
