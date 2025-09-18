// /api/summary
module.exports = async (req, res) => {
  try {
    const t = String((req.query.ticker || '')).trim();
    const modules = String(req.query.modules || 'defaultKeyStatistics,financialData,earningsTrend');
    if (!t) return res.status(400).json({ error: 'ticker required' });

    const urls = [
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(t)}?modules=${encodeURIComponent(modules)}`,
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(t)}?modules=${encodeURIComponent(modules)}`
    ];

    for (const url of urls) {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (r.ok) {
        const j = await r.json();
        res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
        return res.status(200).json(j);
      }
    }
    return res.status(502).json({ error: 'upstream summary failed' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
