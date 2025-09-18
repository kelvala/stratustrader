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
    const urls = [
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`,
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
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
    return new Response(JSON.stringify({ error: 'upstream quote failed' }), {
      status: 502, headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
}
