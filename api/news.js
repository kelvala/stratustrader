export const config = { runtime: 'edge' };

function extractNewsItems(payload) {
  const news = Array.isArray(payload?.news) ? payload.news : [];
  const out = [];
  const seen = new Set();

  for (const n of news) {
    const title = String(n?.title || '').trim();
    let url = String(n?.link || n?.url || '').trim();
    if (!url && n?.clickThroughUrl?.url) url = String(n.clickThroughUrl.url || '').trim();
    const source = String(n?.publisher || n?.provider || '').trim() || 'Yahoo Finance';
    const ts = Number(n?.providerPublishTime);
    const timeMs = Number.isFinite(ts) ? (ts > 1e12 ? ts : ts * 1000) : null;

    if (!title || !url) continue;
    const key = `${url}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title,
      url,
      source,
      timeMs,
      timeISO: Number.isFinite(timeMs) ? new Date(timeMs).toISOString() : null
    });
  }

  return out.slice(0, 12);
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const ticker = String(searchParams.get('ticker') || '').trim().toUpperCase();
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const q = encodeURIComponent(ticker);
  const urls = [
    `https://query1.finance.yahoo.com/v1/finance/search?q=${q}&lang=en-US&region=US&quotesCount=0&newsCount=16`,
    `https://query2.finance.yahoo.com/v1/finance/search?q=${q}&lang=en-US&region=US&quotesCount=0&newsCount=16`
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const j = await r.json();
      const headlines = extractNewsItems(j);
      if (headlines.length) {
        return new Response(JSON.stringify({ ticker, headlines }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
        });
      }
    } catch {
      // Try next host.
    }
  }

  return new Response(JSON.stringify({ ticker, headlines: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}
