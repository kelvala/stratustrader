// /api/chart
module.exports = async (req, res) => {
  try {
    const t = String((req.query.ticker || '')).trim();
    const range = String(req.query.range || '6mo');
    const interval = String(req.query.interval || '1d');
    if (!t) return res.status(400).json({ error: 'ticker required' });

    const urls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=true&events=div,splits`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=true&events=div,splits`
    ];

    for (const url of urls) {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (r.ok) {
        const j = await r.json();
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return res.status(200).json(j);
      }
    }
    return res.status(502).json({ error: 'upstream chart failed' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
