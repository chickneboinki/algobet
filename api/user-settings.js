/** Per-user settings — webhook save must always work when logged in. */

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
    },
  };
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const crypto = require('crypto');
  const secret = process.env.SESSION_SECRET || process.env.CRON_SECRET || 'helpbet-dev-secret';
  const [payload, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig.length !== expect.length) return null;
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
  if (!username) return res.status(401).json({ error: 'Log in first — then Save again' });

  if (req.method === 'GET') {
    const r = await fetch(
      `${client.url}/rest/v1/user_settings?username=eq.${encodeURIComponent(username)}&select=*`,
      { headers: { ...client.headers, Prefer: 'return=representation' } }
    );
    const rows = r.ok ? await r.json() : [];
    if (rows[0]) return res.status(200).json(rows[0]);
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
    const webhook =
      body.discord_webhook != null
        ? String(body.discord_webhook).trim() || null
        : body.notify_config?.default_webhook
          ? String(body.notify_config.default_webhook).trim() || null
          : null;

    const notify_config = body.notify_config || {
      mode: 'single',
      default_webhook: webhook || '',
      league_webhooks: {},
      auto_post_leagues: ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL'],
      auto_post_hour_ct: 6,
    };
    if (webhook) notify_config.default_webhook = webhook;

    const row = {
      username,
      discord_webhook: webhook,
      notify_config,
      updated_at: new Date().toISOString(),
    };
    if (body.bankroll_start != null) row.bankroll_start = body.bankroll_start;
    if (body.unit_size != null) row.unit_size = body.unit_size;
    if (body.min_confidence_to_alert != null) row.min_confidence_to_alert = body.min_confidence_to_alert;

    // 1) Try PATCH existing
    const patch = await fetch(
      `${client.url}/rest/v1/user_settings?username=eq.${encodeURIComponent(username)}`,
      {
        method: 'PATCH',
        headers: { ...client.headers, Prefer: 'return=representation' },
        body: JSON.stringify(row),
      }
    );
    if (patch.ok) {
      const data = await patch.json();
      if (Array.isArray(data) && data[0]) return res.status(200).json(data[0]);
    }

    // 2) Insert
    const ins = await fetch(`${client.url}/rest/v1/user_settings`, {
      method: 'POST',
      headers: { ...client.headers, Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (ins.ok) {
      const data = await ins.json();
      return res.status(200).json(Array.isArray(data) ? data[0] : data);
    }

    // 3) Upsert fallback
    const up = await fetch(`${client.url}/rest/v1/user_settings?on_conflict=username`, {
      method: 'POST',
      headers: {
        ...client.headers,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(row),
    });
    if (!up.ok) {
      const err = await up.text();
      return res.status(502).json({ error: `Could not save settings: ${err.slice(0, 300)}` });
    }
    const data = await up.json();
    return res.status(200).json(Array.isArray(data) ? data[0] : data);
  }

  return res.status(405).end();
}
