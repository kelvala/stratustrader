// /api/chart.js
// Proxies Yahoo Finance chart endpoint through Vercel
export default async function handler(req, res) {
  try {
    // Accept both ?symbol= and ?ticker= (frontend uses ?ticker=)
    const symbol = (req.query.symbol || req.query.ticker || "").toUpperCase().trim();
    if (!symbol) return res.status(400).json({ error: "Missing symbol" });

    const interval = (req.query.interval || "1d").trim(); // e.g., 1m, 5m, 1d
    const range = (req.query.range || "6mo").trim();      // e.g., 1d, 5d, 6mo, 1y

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;

    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StratusTrader/1.0)" },
      cache: "no-store",
    });

    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Yahoo chart HTTP ${r.status}: ${text.slice(0, 200)}`);
    }

    const data = await r.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
