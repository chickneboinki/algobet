import crypto from 'node:crypto';
export default async function handler(req, res) {
  res.status(503).json({ error: 'restoring' });
}
