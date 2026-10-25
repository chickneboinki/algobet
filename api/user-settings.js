/** Per-user settings: webhook, leagues, schedule — never shared. */

function sb() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return {
    url,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  };
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const crypto = require('crypto');
  const secret = process.env.SESSION_SECRET || process.env.CRON_SECRET || 'helpbet-dev-secret';
  const [payload, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() - (data.t || 0) > 90 * 24 * 3600e3) return null;
    return data.u;
  } catch {
    return null;
  }
}

function userFromReq(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : req.body?.token || req.query?.token || '';
  return readToken(token);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const client = sb();
  if (!client) return res.status(500).json({ error: 'Supabase not configured' });

  const username = userFromReq(req);
  if (!username) return res.status(401).json({ error: 'Log in first' });

  if (req.method === 'GET') {
    const r = await fetch(
      `${client.url}/rest/v1/user_settings?username=eq.${encodeURIComponent(username)}&select=*`,
      { headers: client.headers }
    );
    const rows = r.ok ? await r.json() : [];
    if (rows[0]) return res.status(200).json(rows[0]);
    // empty defaults — no webhook
    return res.status(200).json({
      username,
      discord_webhook: null,
      notify_config: {
        mode: 'single',
        default_webhook: '',
        league_webhooks: {},
        auto_post_leagues: ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL'],
        auto_post_hour_ct: 6,
      },
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const row = {
      username,
      discord_webhook: body.discord_webhook ?? body.notify_config?.default_webhook ?? null,
      notify_config: body.notify_config || {},
      bankroll_start: body.bankroll_start,
      unit_size: body.unit_size,
      min_confidence_to_alert: body.min_confidence_to_alert,
      updated_at: new Date().toISOString(),
    };
    // upsert
    const r = await fetch(`${client.url}/rest/v1/user_settings?on_conflict=username`, {
      method: 'POST',
      headers: { ...client.headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row),
    });
    if (!r.ok) return res.status(502).json({ error: await r.text() });
    const data = await r.json();
    return res.status(200).json(Array.isArray(data) ? data[0] : data);
  }

  return res.status(405).end();
}
