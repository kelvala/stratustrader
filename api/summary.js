// /api/summary.js
// Proxies Yahoo Finance quote summary through Vercel (same-origin -> no CORS issues)
export default async function handler(req, res) {
  try {
    // Accept both ?symbol= and ?ticker= (frontend uses ?ticker=)
    const symbol = (req.query.symbol || req.query.ticker || "").toUpperCase().trim();
    if (!symbol) return res.status(400).json({ error: "Missing symbol" });

    // Accept optional ?modules= passthrough (safe default below)
    const modules =
      req.query.modules ||
      "defaultKeyStatistics,financialData,earningsTrend,summaryDetail";

    const url = `https://query2.finance.yahoo.com/v6/finance/quoteSummary/${encodeURIComponent(
      symbol
    )}?modules=${encodeURIComponent(modules)}`;

    const r = await fetch(url, {
      // Some deploys are picky without a UA
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StratusTrader/1.0)" },
      cache: "no-store",
    });

    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Yahoo summary HTTP ${r.status}: ${text.slice(0, 200)}`);
    }

    const data = await r.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
