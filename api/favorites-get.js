export default async function handler(req, res) {
  const uid = (req.query?.uid || '').toUpperCase();
  if (!uid || !/^[A-Z0-9]{4,16}$/.test(uid)) {
    return res.status(400).json({ error: 'invalid uid' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return res.status(200).json({ favorites: [], note: 'sync not configured' });
  }

  try {
    const key = `fav:${uid}`;
    const r = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${redisToken}` }
    });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    const j = await r.json();
    const favorites = j.result ? JSON.parse(j.result) : [];
    return res.status(200).json({ favorites: Array.isArray(favorites) ? favorites : [] });
  } catch (e) {
    return res.status(502).json({ error: 'upstream', favorites: [] });
  }
}
// env vars rebuild
