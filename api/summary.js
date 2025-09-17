// /api/summary.js
// Proxies Yahoo Finance quote summary through Vercel (same-origin -> no CORS issues)
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const ticker  = (searchParams.get('ticker') || '').trim();
  const modules = (searchParams.get('modules') || 'defaultKeyStatistics,financialData,earningsTrend').trim();
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker required' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${encodeURIComponent(modules)}`;
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      cache: 'no-store'
    });
    if (!r.ok) throw new Error(`Yahoo ${r.status}`);
    const data = await r.json();
    // Normalize to stable shape so your client code never crashes.
    return new Response(JSON.stringify({ quoteSummary: data?.quoteSummary ?? { result: [{}] } }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ quoteSummary: { result: [{}] }, error: String(e) }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }
}
