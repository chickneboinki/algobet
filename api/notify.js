import crypto from 'node:crypto';
/** RESTORED - see next commit for full body */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(503).json({ error: 'notify temporarily restoring — redeploy in progress' });
}
