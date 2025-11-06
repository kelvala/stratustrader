export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get('ticker') || '').trim();
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker required' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  // Try v7 quote first (two hosts).
  const quoteUrls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
  ];
  for (const url of quoteUrls) {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const j = await r.json();
      return new Response(JSON.stringify(j), {
        status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
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
      // Return a quoteResponse-shaped object so client parsing is consistent
      const out = { quoteResponse: { result: [ { symbol: ticker, regularMarketPrice: +last, regularMarketTime: res0?.timestamp?.at(-1) || null, regularMarketPreviousClose: (res0?.meta?.previousClose ?? null), currency: res0?.meta?.currency || 'USD', exchangeName: res0?.meta?.exchangeName || res0?.meta?.exchange || '' } ] } };
      return new Response(JSON.stringify(out), {
        status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'upstream quote failed' }), {
    status: 502, headers: { 'content-type': 'application/json' }
  });
}
