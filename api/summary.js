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

  const urls = [
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${encodeURIComponent(modules)}`,
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${encodeURIComponent(modules)}`
  ];

  for (const url of urls) {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const j = await r.json();
      return new Response(JSON.stringify(j), {
        status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
    }
  }

  // Graceful fallback: empty shape keeps the UI happy.
  return new Response(JSON.stringify({ quoteSummary: { result: [] }, note: 'fallback-empty' }), {
    status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}
