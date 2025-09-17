export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get('ticker') || '').trim();
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker required' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      cache: 'no-store'
    });
    if (!r.ok) throw new Error(`Yahoo ${r.status}`);
    const data = await r.json();
    return new Response(JSON.stringify({
      price: data?.quoteResponse?.result?.[0]?.regularMarketPrice ?? null,
      quoteResponse: data?.quoteResponse ?? null
    }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }});
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502, headers: { 'content-type': 'application/json' }
    });
  }
}
