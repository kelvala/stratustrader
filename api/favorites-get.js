export default async function handler(req, res) {
  const uid = (req.query?.uid || '').toUpperCase();
  if (!uid || !/^[A-Z0-9]{4,16}$/.test(uid)) {
    return res.status(400).json({ error: 'invalid uid' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return res.status(200).json({ favorites: [], alerts: [], note: 'sync not configured' });
  }

  try {
    const favKey = `fav:${uid}`;
    const alertsKey = `alerts:${uid}`;
    const [favResp, alertsResp] = await Promise.all([
      fetch(`${redisUrl}/get/${encodeURIComponent(favKey)}`, {
        headers: { Authorization: `Bearer ${redisToken}` }
      }),
      fetch(`${redisUrl}/get/${encodeURIComponent(alertsKey)}`, {
        headers: { Authorization: `Bearer ${redisToken}` }
      })
    ]);
    if (!favResp.ok) throw new Error(`redis favorites ${favResp.status}`);
    if (!alertsResp.ok) throw new Error(`redis alerts ${alertsResp.status}`);
    const favJson = await favResp.json();
    const alertsJson = await alertsResp.json();
    const favorites = favJson.result ? JSON.parse(favJson.result) : [];
    const alerts = alertsJson.result ? JSON.parse(alertsJson.result) : [];
    return res.status(200).json({
      favorites: Array.isArray(favorites) ? favorites : [],
      alerts: Array.isArray(alerts) ? alerts : []
    });
  } catch (e) {
    return res.status(502).json({ error: 'upstream', favorites: [], alerts: [] });
  }
}
