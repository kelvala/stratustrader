const fetch = require('node-fetch');

function parseBuffettFromText(txt) {
  if (!txt || typeof txt !== 'string') return null;
  const compact = txt.replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const candidates = [
    /(?:market\s*cap(?:\s*\/\s*|\s*to\s*|\s*[-–:]\s*)?\s*gdp|market\s*cap\s*\/\s*gdp)[^\d\n\r]{0,120}?([0-9]+(?:[.,][0-9]+)?)\s*(%|x|times)?/i,
    /(?:market\s*cap|mcap)[^\d\n\r]{0,100}?(?:to|\/|[-–:])[^\d\n\r]{0,100}?gdp[^\d\n\r]{0,120}?([0-9]+(?:[.,][0-9]+)?)\s*(%|x|times)?/i,
    /(?:gdp|gross\s*domestic\s*product)[^\d\n\r]{0,100}?(?:market\s*cap|mcap)[^\d\n\r]{0,120}?([0-9]+(?:[.,][0-9]+)?)\s*(%|x|times)?/i,
    /(?:market\s*cap\s*\/\s*gdp|market\s*cap\s*to\s*gdp)[^\d\n\r]{0,120}?([0-9]+(?:[.,][0-9]+)?)\s*(%|x|times)?/i,
    /ratio[^\d\n\r]{0,50}?([0-9]+(?:[.,][0-9]+)?)\s*(%|x|times)?[^\d\n\r]{0,50}?(?:market\s*cap|gdp)/i
  ];

  for (const regex of candidates) {
    const match = regex.exec(compact);
    if (!match) continue;
    const rawValue = match[1].replace(/,/g, '');
    const value = parseFloat(rawValue);
    if (!Number.isFinite(value)) continue;
    const unit = String(match[2] || '').toLowerCase();
    let ratio = null;
    if (unit === '%') ratio = value / 100;
    else if (unit === 'x' || unit === 'times') ratio = value;
    else if (value > 10) ratio = value / 100;
    else ratio = value;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    return { ratio, percent: ratio * 100 };
  }

  const fallbackPct = compact.match(/(?:market\s*cap|mcap)[^\n\r]{0,120}?([0-9]+(?:[.,][0-9]+)?)\s*%/i);
  if (fallbackPct) {
    const value = parseFloat(fallbackPct[1].replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) return { ratio: value / 100, percent: value };
  }
  return null;
}

module.exports = async (req, res) => {
  // Simple on-demand Buffett Indicator for serverless environments
  // Try a couple of public pages and extract Market Cap / GDP percentage
  const fallback = { ratio: 2.24, percent: 224, marketCap: 6.7e13, gdp: 2.9e13, source: 'fallback-estimate' };
  const sources = [
    'https://www.gurufocus.com/stock-market-valuations.php',
    'https://www.gurufocus.com/stock-market-valuations',
    'https://www.multpl.com/market-cap-to-gdp',
    'https://www.multpl.com/us-stock-market-value',
    'https://www.multpl.com/stock-market-value'
  ];

  for (const url of sources) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const txt = await r.text();
      const parsed = parseBuffettFromText(txt);
      if (parsed) {
        let marketCap = null, gdp = null;
        const mc = txt.match(/Market Cap[^$\d\n\r]{0,120}?\$?([0-9.,]+)\s*(T|B|M)?/i);
        if (mc) { marketCap = parseFloat(mc[1].replace(/,/g, '')); const scale = (mc[2] || '').toUpperCase(); if (scale === 'T') marketCap *= 1e12; else if (scale === 'B') marketCap *= 1e9; else if (scale === 'M') marketCap *= 1e6; }
        const gd = txt.match(/GDP[^$\d\n\r]{0,120}?\$?([0-9.,]+)\s*(T|B|M)?/i);
        if (gd) { gdp = parseFloat(gd[1].replace(/,/g, '')); const scale = (gd[2] || '').toUpperCase(); if (scale === 'T') gdp *= 1e12; else if (scale === 'B') gdp *= 1e9; else if (scale === 'M') gdp *= 1e6; }
        return res.status(200).json({ ratio: parsed.ratio, percent: parsed.percent, marketCap, gdp, source: url });
      }
    } catch (e) {
      console.warn('[api/buffett] fetch failed for', url, e && e.message ? e.message : e);
      continue;
    }
  }

  return res.status(200).json(fallback);
};
