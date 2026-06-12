export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = String(searchParams.get('query') || '').trim();
  if (!query) {
    return new Response(JSON.stringify({ error: 'query required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const urls = [
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=25&newsCount=0`,
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=25&newsCount=0`
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const j = await r.json();
      const quotes = Array.isArray(j?.quotes) ? j.quotes : [];
      const matches = quotes
        .map(q => ({ t: String(q?.symbol || '').trim().toUpperCase(), n: String(q?.longname || q?.shortname || q?.name || '').trim() }))
        .filter(x => x.t)
        .slice(0, 40);
      if (matches.length) {
        return new Response(JSON.stringify(matches), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
        });
      }
    } catch (e) {
      // Try next host.
    }
  }

  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}
