const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Simple on-demand Buffett Indicator for serverless environments
  // Try a couple of public pages and extract Market Cap / GDP percentage
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
        // best-effort extract market cap/gdp numeric values if present
        let marketCap = null, gdp = null;
        const mc = txt.match(/Market Cap[^$\d\n\r]{0,120}?\$?([0-9.,]+)\s*(T|B|M)?/i);
        if (mc) { marketCap = parseFloat(mc[1].replace(/,/g, '')); const scale = (mc[2] || '').toUpperCase(); if (scale === 'T') marketCap *= 1e12; else if (scale === 'B') marketCap *= 1e9; else if (scale === 'M') marketCap *= 1e6; }
        const gd = txt.match(/GDP[^$\d\n\r]{0,120}?\$?([0-9.,]+)\s*(T|B|M)?/i);
        if (gd) { gdp = parseFloat(gd[1].replace(/,/g, '')); const scale = (gd[2] || '').toUpperCase(); if (scale === 'T') gdp *= 1e12; else if (scale === 'B') gdp *= 1e9; else if (scale === 'M') gdp *= 1e6; }
        const out = { ratio: pct/100, percent: pct, marketCap, gdp, source: url };
        return res.status(200).json(out);
      }
    } catch (e) {
      console.warn('[api/buffett] fetch failed for', url, e && e.message ? e.message : e);
      continue;
    }
  }

  return res.status(502).json({ error: 'failed to fetch buffett indicator from sources' });
};
