const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const cron = require('node-cron');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

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
});