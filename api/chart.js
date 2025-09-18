export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get('ticker') || '').trim();
  const range = (searchParams.get('range') || '6mo').trim();
  const interval = (searchParams.get('interval') || '1d').trim();
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker required' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=true&events=div,splits`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=true&events=div,splits`
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

  return new Response(JSON.stringify({ error: 'upstream chart failed' }), {
    status: 502, headers: { 'content-type': 'application/json' }
  });
}
