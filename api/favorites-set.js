export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { 'content-type': 'application/json' }
    });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  const { uid, favorites } = body;
  if (!uid || !/^[A-Z0-9]{4,16}$/i.test(uid)) {
    return new Response(JSON.stringify({ error: 'invalid uid' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }
  if (!Array.isArray(favorites)) {
    return new Response(JSON.stringify({ error: 'invalid favorites' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return new Response(JSON.stringify({ ok: true, note: 'sync not configured' }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const key = `fav:${uid.toUpperCase()}`;
    const val = JSON.stringify(favorites.slice(0, 20));
    // SET key value EX 7776000 (90 days TTL)
    const r = await fetch(`${redisUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(val)}/ex/7776000`, {
      headers: { Authorization: `Bearer ${redisToken}` }
    });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream' }), {
      status: 502, headers: { 'content-type': 'application/json' }
    });
  }
}
