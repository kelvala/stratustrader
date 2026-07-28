export const config = { runtime: 'edge' };

function toMs(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n * 1000 : null;
}

function lastPriceInWindow(ts, closes, window) {
  if (!window || !Array.isArray(ts) || !Array.isArray(closes)) return null;
  const start = toMs(window.start);
  const end = toMs(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  let last = null;
  for (let i = 0; i < ts.length && i < closes.length; i++) {
    const t = toMs(ts[i]);
    const price = Number(closes[i]);
    if (Number.isFinite(t) && t >= start && t < end && Number.isFinite(price)) {
      last = { price, time: t };
    }
  }
  return last;
}

async function fetchChartQuote(ticker) {
  const chartUrls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1m&includePrePost=true&events=div,splits`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1m&includePrePost=true&events=div,splits`
  ];

  for (const url of chartUrls) {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!r.ok) continue;
    const j = await r.json();
    const res0 = j?.chart?.result?.[0];
    if (!res0) continue;

    const meta = res0.meta || {};
    const q = res0?.indicators?.quote?.[0] || {};
    const adj = res0?.indicators?.adjclose?.[0]?.adjclose;
    const closes = Array.isArray(adj) && adj.length ? adj : q.close;
    const ts = Array.isArray(res0.timestamp) ? res0.timestamp : [];
    const periods = meta.currentTradingPeriod || {};
    const pre = lastPriceInWindow(ts, closes, periods.pre);
    const regular = lastPriceInWindow(ts, closes, periods.regular);
    const post = lastPriceInWindow(ts, closes, periods.post);
    const fallbackLastIdx = ts.length ? ts.length - 1 : -1;
    const fallbackLast = fallbackLastIdx >= 0 ? Number(closes?.[fallbackLastIdx]) : null;
    const regularPrice = regular?.price ?? Number(meta.regularMarketPrice ?? fallbackLast);
    const regularTime = regular?.time ?? toMs(meta.regularMarketTime) ?? (fallbackLastIdx >= 0 ? toMs(ts[fallbackLastIdx]) : null);
    const out = {
      quoteResponse: {
        result: [{
          symbol: ticker,
          regularMarketPrice: Number.isFinite(regularPrice) ? regularPrice : null,
          regularMarketTime: regularTime ? Math.round(regularTime / 1000) : null,
          regularMarketPreviousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
          regularMarketDayHigh: meta.regularMarketDayHigh ?? null,
          regularMarketDayLow: meta.regularMarketDayLow ?? null,
          preMarketPrice: pre?.price ?? null,
          preMarketTime: pre?.time ? Math.round(pre.time / 1000) : null,
          postMarketPrice: post?.price ?? null,
          postMarketTime: post?.time ? Math.round(post.time / 1000) : null,
          currency: meta.currency || 'USD',
          exchangeName: meta.exchangeName || meta.exchange || '',
          fullExchangeName: meta.fullExchangeName || meta.exchangeName || meta.exchange || '',
          hasPrePostMarketData: meta.hasPrePostMarketData ?? null,
          longName: meta.longName || meta.shortName || ticker,
          shortName: meta.shortName || meta.longName || ticker
        }]
      }
    };
    return out;
  }

  return null;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get('ticker') || '').trim();
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker required' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  const chartDerived = await fetchChartQuote(ticker);
  if (chartDerived) {
    return new Response(JSON.stringify(chartDerived), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }

  // Fallback: try the lightweight quote endpoint.
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

  // Final fallback: return a minimal chart-derived shape if the quote endpoint was blocked.
  const fallbackChart = await fetchChartQuote(ticker);
  if (fallbackChart) {
    return new Response(JSON.stringify(fallbackChart), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }

  return new Response(JSON.stringify({ error: 'upstream quote failed' }), {
    status: 502, headers: { 'content-type': 'application/json' }
  });
}
