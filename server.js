const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const cron = require('node-cron');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const fs = require('fs').promises;
const CACHE_DIR = path.join(__dirname, 'data');

async function ensureCacheDir(){ try{ await fs.mkdir(CACHE_DIR, { recursive: true }); }catch(e){} }

// Load persisted caches into globals if present
async function loadPersistedCaches(){
  try{ await ensureCacheDir();
    const buffPath = path.join(CACHE_DIR,'buffett.json');
    try{ const txt = await fs.readFile(buffPath, 'utf8'); const obj = JSON.parse(txt); global.__buffettCache = { t: obj.t||0, data: obj.data||null }; }catch(e){ global.__buffettCache = { t:0, data:null }; }
    const vixPath = path.join(CACHE_DIR,'vix_open.json');
    try{ const txt2 = await fs.readFile(vixPath, 'utf8'); const obj2 = JSON.parse(txt2); global.__vixOpenCache = { t: obj2.t||0, price: obj2.price||null }; }catch(e){ global.__vixOpenCache = { t:0, price:null }; }
  }catch(e){ console.warn('[cache] loadPersistedCaches failed', e); global.__buffettCache = { t:0, data:null }; global.__vixOpenCache = { t:0, price:null }; }
}

async function saveBuffettToDisk(cache){ try{ await ensureCacheDir(); const p = path.join(CACHE_DIR,'buffett.json'); await fs.writeFile(p, JSON.stringify({ t: cache.t, data: cache.data }, null, 2), 'utf8'); }catch(e){ console.warn('[cache] saveBuffettToDisk failed', e); } }
async function saveVixOpenToDisk(obj){ try{ await ensureCacheDir(); const p = path.join(CACHE_DIR,'vix_open.json'); await fs.writeFile(p, JSON.stringify(obj, null, 2), 'utf8'); }catch(e){ console.warn('[cache] saveVixOpenToDisk failed', e); } }

// --- helper: fetch Buffett ratio from public sources (reusable) ---
async function fetchBuffettFromSources(){
  const sources = [
    'https://www.gurufocus.com/stock-market-valuations.php',
    'https://www.multpl.com/us-stock-market-value'
  ];
  for (const url of sources) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const txt = await r.text();
      let m = txt.match(/market[^\n]{0,120}cap[^\n]{0,40}to[^\n]{0,40}gdp[^\d\n\r:\-]*([0-9.,]+)\s*%/i);
      if (!m) m = txt.match(/Market Cap\/?GDP[^\n\r]{0,120}?([0-9.,]+)\s*%/i);
      if (!m) m = txt.match(/Market Cap[^\n\r]{0,120}?([0-9.,]+)\s*%/i);
      if (m) {
        const pct = parseFloat(m[1].replace(/,/g, ''));
        let marketCap = null, gdp = null;
        const mc = txt.match(/Market Cap[^$\d\n\r]{0,120}?\$?([0-9.,]+)\s*(T|B|M)?/i);
        if (mc) { marketCap = parseFloat(mc[1].replace(/,/g, '')); const scale = (mc[2] || '').toUpperCase(); if (scale === 'T') marketCap *= 1e12; else if (scale === 'B') marketCap *= 1e9; else if (scale === 'M') marketCap *= 1e6; }
        const gd = txt.match(/GDP[^$\d\n\r]{0,120}?\$?([0-9.,]+)\s*(T|B|M)?/i);
        if (gd) { gdp = parseFloat(gd[1].replace(/,/g, '')); const scale = (gd[2] || '').toUpperCase(); if (scale === 'T') gdp *= 1e12; else if (scale === 'B') gdp *= 1e9; else if (scale === 'M') gdp *= 1e6; }
        const out = { ratio: pct/100, percent: pct, marketCap, gdp, source: url };
        return out;
      }
    } catch (e) { console.warn('[buffett] fetch failed for', url, e?.message || e); continue; }
  }
  return null;
}

async function updateBuffettCache(){
  try{
    const now = Date.now();
    const fresh = await fetchBuffettFromSources();
    if(fresh){ global.__buffettCache = { t: now, data: fresh }; await saveBuffettToDisk(global.__buffettCache); return fresh; }
  }catch(e){ console.warn('[buffett] updateBuffettCache failed', e); }
  return null;
}

// Load persisted caches at startup so endpoints can serve cached values immediately
loadPersistedCaches().then(()=>{
  console.log('[cache] persisted caches loaded');
}).catch((e)=>{ console.warn('[cache] loadPersistedCaches error', e); });

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.get('/api/chart', async (req, res) => {
  const { ticker, range = '6mo', interval = '1d' } = req.query;
  if (!ticker) {
    return res.status(400).json({ error: 'ticker required' });
  }

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=true&events=div,splits`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=true&events=div,splits`
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (r.ok) {
        const j = await r.json();
        return res.json(j);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    }
  }

  res.status(502).json({ error: 'upstream chart failed' });
});

app.get('/api/quote', async (req, res) => {
  const { ticker } = req.query;
  if (!ticker) {
    return res.status(400).json({ error: 'ticker required' });
  }

  // Try v10 quoteSummary first (preferred: contains rich "price" module),
  // then fall back to v7/finance/quote (lighter, but reliable). All are Yahoo.
  const urls = [
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=price`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=price`,
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (r.ok) {
        const j = await r.json();
        return res.json(j);
      } else {
        console.warn(`[quote] upstream not ok ${r.status} for ${url}`);
      }
    } catch (e) {
      console.error('[quote] Fetch error:', e?.message || e);
    }
  }
  // Final fallback: derive a minimal quote using our own /api/chart proxy (still Yahoo data)
  async function chartDerivedQuote(sym){
    const localChartUrls = [
      `/api/chart?ticker=${encodeURIComponent(sym)}&range=5d&interval=1d`,
      `/api/chart?ticker=${encodeURIComponent(sym)}&range=1d&interval=1m`
    ];
    for(const path of localChartUrls){
      try{
        // Call our own proxy on localhost to avoid Yahoo auth quirks
        const base = process.env.INTERNAL_ORIGIN || `http://localhost:${PORT}`;
        const rr = await fetch(base + path, { headers: { 'user-agent': 'Mozilla/5.0' } });
        if(!rr.ok){ console.warn(`[quote-fb] local chart not ok ${rr.status} for ${path}`); continue; }
        const jj = await rr.json();
        const resC = jj?.chart?.result?.[0];
        if(!resC) continue;
        const ts = resC.timestamp || [];
        const qd = resC.indicators?.quote?.[0] || {};
        const closes = Array.isArray(qd.close) ? qd.close.filter(v=>v!=null) : [];
        if(!ts.length || !closes.length) continue;
        const lastIdx = Math.min(ts.length-1, closes.length-1);
        const last = +closes[lastIdx];
        const prev = +closes[lastIdx-1] || (resC.meta?.previousClose ?? null);
        const currency = resC.meta?.currency || 'USD';
        const exchangeName = resC.meta?.exchangeName || resC.meta?.exchange || '';
        return {
          quoteResponse: {
            result: [
              {
                symbol: sym,
                regularMarketPrice: last,
                regularMarketTime: ts[lastIdx] || null,
                regularMarketPreviousClose: prev,
                currency, exchangeName, fullExchangeName: exchangeName
              }
            ]
          }
        };
      }catch(e){ console.error('[quote-fb] local chart fetch error', e?.message||e); }
    }
    return null;
  }

  try{
    const derived = await chartDerivedQuote(ticker);
    if(derived) return res.json(derived);
  }catch(e){ console.error('[quote] derived error', e?.message||e); }

  res.status(502).json({ error: 'upstream quote failed' });
});

app.get('/api/summary', async (req, res) => {
  const { ticker, modules = 'defaultKeyStatistics,financialData,earningsTrend' } = req.query;
  if (!ticker) {
    return res.status(400).json({ error: 'ticker required' });
  }

  const urls = [
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${encodeURIComponent(modules)}`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${encodeURIComponent(modules)}`
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (r.ok) {
        const j = await r.json();
        return res.json(j);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    }
  }

  res.status(502).json({ error: 'upstream summary failed' });
});

// Buffett indicator proxy: tries to extract Market Cap / GDP from public sources
app.get('/api/buffett', async (req, res) => {
  // Ensure persisted caches are loaded
  if (!global.__buffettCache) await loadPersistedCaches();
  const cache = global.__buffettCache;
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const { refresh } = req.query;
  if (!refresh && cache.data && (now - cache.t) < oneDay) {
    return res.json(Object.assign({}, cache.data, { cached: true, ageMs: now - cache.t }));
  }

  // attempt to fetch and update using shared helper
  const fresh = await updateBuffettCache();
  if (fresh) return res.json(Object.assign({}, fresh, { cached: false }));

  // return stale cache if available
  if (cache.data) return res.json(Object.assign({}, cache.data, { cached: true, ageMs: now - cache.t, warning: 'upstream failed, returning stale cache' }));

  res.status(502).json({ error: 'failed to fetch buffett indicator from sources' });
});

// Expose persisted buffett cache for verification
app.get('/api/buffett-cache', async (req, res) => {
  if (!global.__buffettCache) await loadPersistedCaches();
  return res.json({ cache: global.__buffettCache || null });
});

// Endpoint for scheduled refresh (useful for GitHub Actions / Vercel cron)
app.post('/api/refresh-buffett', async (req, res) => {
  // optional token check
  const token = req.get('x-scheduler-token');
  if (process.env.SCHEDULER_TOKEN && (!token || token !== process.env.SCHEDULER_TOKEN)) return res.status(403).json({ error: 'forbidden' });
  try{
    const fresh = await updateBuffettCache();
    if(fresh) return res.json(Object.assign({}, fresh, { cached: false, refreshed: true }));
    return res.status(502).json({ error: 'failed to refresh' });
  }catch(e){ return res.status(500).json({ error: 'exception', detail: String(e) }); }
});

// Return persisted market-open VIX baseline
app.get('/api/vix-open', async (req, res) => { if (!global.__vixOpenCache) await loadPersistedCaches(); return res.json({ vixOpen: global.__vixOpenCache || null }); });

// Manual trigger to capture market-open VIX (callable from scheduler)
app.post('/api/capture-vix-open', async (req, res) => {
  const token = req.get('x-scheduler-token');
  if (process.env.SCHEDULER_TOKEN && (!token || token !== process.env.SCHEDULER_TOKEN)) return res.status(403).json({ error: 'forbidden' });
  try{
    const base = process.env.INTERNAL_ORIGIN || `http://localhost:${PORT}`;
    const r = await fetch(base + '/api/quote?ticker=%5EVIX', { headers: { 'user-agent': 'scheduler' } });
    if (!r.ok) return res.status(502).json({ error: 'fetch failed', status: r.status });
    const j = await r.json();
    let price = null;
    try{ if (j?.quoteResponse?.result?.[0]?.regularMarketPrice) price = +j.quoteResponse.result[0].regularMarketPrice; else if (j?.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw) price = +j.quoteSummary.result[0].price.regularMarketPrice.raw; }catch(e){}
    if (price != null){ const obj = { t: Date.now(), price }; global.__vixOpenCache = { t: obj.t, price: obj.price }; await saveVixOpenToDisk(obj); return res.json({ saved: true, obj }); }
    return res.status(502).json({ error: 'parse failed', body: j });
  }catch(e){ return res.status(500).json({ error: 'exception', detail: String(e) }); }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Nightly symbols refresh at 2:30 AM America/New_York
  try{
    cron.schedule('30 2 * * *', () => {
      console.log('[cron] Running nightly symbols refresh...');
      const cmd = process.platform === 'win32' ? 'node' : 'node';
      const child = spawn(cmd, ['scripts/fetch-all-symbols.mjs'], { cwd: __dirname, stdio: 'inherit', env: process.env });
      child.on('close', (code)=>{ console.log(`[cron] symbols refresh finished with code ${code}`); });
    }, { timezone: 'America/New_York' });
  }catch(e){ console.warn('Cron schedule failed', e); }

  // Daily Buffett refresh: run once daily after market hours to update persisted cache
  try{
    cron.schedule('0 18 * * *', async () => {
      console.log('[cron] Daily Buffett refresh starting...');
      try{
        const base = process.env.INTERNAL_ORIGIN || `http://localhost:${PORT}`;
        const r = await fetch(base + '/api/buffett?refresh=1', { headers: { 'user-agent': 'node-cron' } });
        if (r.ok) {
          console.log('[cron] Buffett refresh completed');
        } else {
          console.warn('[cron] Buffett refresh upstream failed', r.status);
        }
      }catch(e){ console.warn('[cron] Buffett refresh failed', e?.message||e); }
    }, { timezone: 'America/New_York' });
  }catch(e){ console.warn('Cron schedule (buffett) failed', e); }

  // Market-open VIX capture: grab ^VIX a few minutes after open and persist as baseline
  try{
    cron.schedule('35 9 * * 1-5', async () => {
      console.log('[cron] Capturing market-open VIX baseline...');
      try{
        const base = process.env.INTERNAL_ORIGIN || `http://localhost:${PORT}`;
        const r = await fetch(base + '/api/quote?ticker=%5EVIX', { headers: { 'user-agent': 'node-cron' } });
        if (!r.ok) { console.warn('[cron] VIX fetch failed', r.status); return; }
        const j = await r.json();
        // Parse price from yahoo quote JSON (support v10 & v7 structures)
        let price = null;
        try{
          if (j?.quoteResponse?.result?.[0]?.regularMarketPrice) price = +j.quoteResponse.result[0].regularMarketPrice;
          else if (j?.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw) price = +j.quoteSummary.result[0].price.regularMarketPrice.raw;
        }catch(e){}
        if (price != null) {
          const obj = { t: Date.now(), price };
          global.__vixOpenCache = { t: obj.t, price: obj.price };
          await saveVixOpenToDisk(obj);
          console.log('[cron] VIX open baseline saved', obj);
        } else {
          console.warn('[cron] VIX parse failed', j);
        }
      }catch(e){ console.warn('[cron] VIX capture error', e?.message||e); }
    }, { timezone: 'America/New_York' });
  }catch(e){ console.warn('Cron schedule (vix open) failed', e); }
});