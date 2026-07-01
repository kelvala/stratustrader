export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = req.body || {};

  const { uid, favorites } = body;
  const cleanUid = (uid || '').toUpperCase();
  if (!cleanUid || !/^[A-Z0-9]{4,16}$/.test(cleanUid)) {
    return res.status(400).json({ error: 'invalid uid' });
  }
  if (!Array.isArray(favorites)) {
    return res.status(400).json({ error: 'invalid favorites' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return res.status(200).json({ ok: true, note: 'sync not configured' });
  }

  try {
    const key = `fav:${cleanUid}`;
    const val = JSON.stringify(favorites.slice(0, 20));
    const r = await fetch(`${redisUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(val)}/ex/7776000`, {
      headers: { Authorization: `Bearer ${redisToken}` }
    });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'upstream' });
  }
}
