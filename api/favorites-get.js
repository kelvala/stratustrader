export const config = { runtime: 'edge' };

export default async function handler(req) {
  const uid = new URL(req.url).searchParams.get('uid');
  if (!uid || !/^[A-Z0-9]{4,16}$/i.test(uid)) {
    return new Response(JSON.stringify({ error: 'invalid uid' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return new Response(JSON.stringify({ favorites: [], note: 'sync not configured' }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }

  try {
    const key = `fav:${uid.toUpperCase()}`;
    const r = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${redisToken}` }
    });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    const j = await r.json();
    const favorites = j.result ? JSON.parse(j.result) : [];
    return new Response(JSON.stringify({ favorites: Array.isArray(favorites) ? favorites : [] }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream', favorites: [] }), {
      status: 502, headers: { 'content-type': 'application/json' }
    });
  }
}
