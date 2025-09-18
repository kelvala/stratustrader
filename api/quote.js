// /api/quote
module.exports = async (req, res) => {
  try {
    const ticker = String((req.query.ticker || '')).trim();
    if (!ticker) return res.status(400).json({ error: 'ticker required' });

    const urls = [
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`,
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
    ];

    for (const url of urls) {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (r.ok) {
        const j = await r.json();
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
        return res.status(200).json(j);
      }
    }
    return res.status(502).json({ error: 'upstream quote failed' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
