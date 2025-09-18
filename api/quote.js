// /api/quote
module.exports = async (req, res) => {
  try {
    const ticker = String((req.query.ticker || '')).trim();
    if (!ticker) return res.status(400).json({ error: 'ticker required' });

    // Try v7 quote first (two hosts).
    const quoteUrls = [
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`,
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
    ];
    for (const url of quoteUrls) {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (r.ok) {
        const j = await r.json();
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
        return res.status(200).json(j);
      }
    }

    // Fallback: derive last price from chart (1d/1m).
    const chartUrls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1m`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1m`
    ];
    for (const url of chartUrls) {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const j = await r.json();
      const res0 = j?.chart?.result?.[0];
      const q = res0?.indicators?.quote?.[0];
      const adj = res0?.indicators?.adjclose?.[0]?.adjclose;
      const last = (Array.isArray(adj) && adj.at(-1) != null)
        ? adj.at(-1)
        : (Array.isArray(q?.close) ? q.close.at(-1) : null);
      if (Number.isFinite(+last)) {
        res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
        return res.status(200).json({ price: +last, source: 'chart' });
      }
    }

    return res.status(502).json({ error: 'upstream quote failed' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
