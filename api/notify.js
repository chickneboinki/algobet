export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  // Discord PING
  if (req.method === 'POST' && req.body?.type === 1) return res.status(200).json({ type: 1 });
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'notify', note: 'Full notify restore in progress' });
  return res.status(503).json({ error: 'notify.js restore in progress — re-upload full file' });
}
