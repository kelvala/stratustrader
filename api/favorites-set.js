export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = req.body || {};

  const { uid, favorites, alerts } = body;
  const cleanUid = (uid || '').toUpperCase();
  if (!cleanUid || !/^[A-Z0-9]{4,16}$/.test(cleanUid)) {
    return res.status(400).json({ error: 'invalid uid' });
  }
  if (!Array.isArray(favorites)) {
    return res.status(400).json({ error: 'invalid favorites' });
  }
  if (alerts != null && !Array.isArray(alerts)) {
    return res.status(400).json({ error: 'invalid alerts' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return res.status(200).json({ ok: true, note: 'sync not configured' });
  }

  try {
    const favKey = `fav:${cleanUid}`;
    const favVal = JSON.stringify(favorites.slice(0, 20));
    const writes = [
      fetch(`${redisUrl}/set/${encodeURIComponent(favKey)}/${encodeURIComponent(favVal)}/ex/7776000`, {
        headers: { Authorization: `Bearer ${redisToken}` }
      })
    ];
    if (Array.isArray(alerts)) {
      const alertsKey = `alerts:${cleanUid}`;
      const alertsVal = JSON.stringify(alerts.slice(0, 40));
      writes.push(
        fetch(`${redisUrl}/set/${encodeURIComponent(alertsKey)}/${encodeURIComponent(alertsVal)}/ex/7776000`, {
          headers: { Authorization: `Bearer ${redisToken}` }
        })
      );
    }
    const results = await Promise.all(writes);
    if (results.some(r => !r.ok)) throw new Error('redis write failed');
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'upstream' });
  }
}
