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

  const urls = [
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=price`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=price`
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