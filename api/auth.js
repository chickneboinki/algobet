import crypto from 'crypto';

const USERS_TABLE = 'hb_users';

function sb() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  // Prefer service role if present (bypasses RLS); fall back to anon
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
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

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 32).toString('hex');
  return { salt: s, hash };
}

function verify(password, salt, hash) {
  const h = crypto.scryptSync(String(password), salt, 32).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

export function makeToken(username) {
  const secret = process.env.SESSION_SECRET || process.env.CRON_SECRET || 'helpbet-dev-secret';
  const payload = Buffer.from(JSON.stringify({ u: username, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const secret = process.env.SESSION_SECRET || process.env.CRON_SECRET || 'helpbet-dev-secret';
  const [payload, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() - (data.t || 0) > 90 * 24 * 3600e3) return null;
    return data.u;
  } catch {
    return null;
  }
}

async function loadDiscordLink(client, username) {
  try {
    const r = await fetch(
      `${client.url}/rest/v1/discord_links?username=eq.${encodeURIComponent(username)}&select=discord_user_id,linked_at&limit=1`,
      { headers: client.headers }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function loadUserSettings(client, username) {
  try {
    const r = await fetch(
      `${client.url}/rest/v1/user_settings?username=eq.${encodeURIComponent(username)}&select=*`,
      { headers: client.headers }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const client = sb();
  if (!client) return res.status(500).json({ error: 'Supabase not configured' });

  if (req.method === 'GET') {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const u = readToken(token);
    if (!u) return res.status(401).json({ ok: false });
    const link = await loadDiscordLink(client, u);
    const settings = await loadUserSettings(client, u);
    return res.status(200).json({
      ok: true,
      username: u,
      discord_linked: Boolean(link),
      discord_user_id: link?.discord_user_id || null,
      linked_guild_id: settings?.notify_config?.linked_guild_id || null,
    });
  }

  if (req.method !== 'POST') return res.status(405).end();
  const { action, username, password } = req.body || {};
  const user = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-.]/g, '')
    .slice(0, 32);
  if (!user || user.length < 3) return res.status(400).json({ error: 'Username at least 3 letters/numbers' });
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'Password at least 4 characters' });

  if (action === 'register') {
    const { salt, hash } = hashPassword(password);
    const r = await fetch(`${client.url}/rest/v1/${USERS_TABLE}`, {
      method: 'POST',
      headers: client.headers,
      body: JSON.stringify({ username: user, password_hash: hash, salt, created_at: new Date().toISOString() }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (/duplicate|unique/i.test(t)) return res.status(409).json({ error: 'Username already taken' });
      return res.status(502).json({ error: t.slice(0, 200) });
    }
    await fetch(`${client.url}/rest/v1/user_settings`, {
      method: 'POST',
      headers: { ...client.headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        username: user,
        discord_webhook: null,
        notify_config: {
          mode: 'single',
          default_webhook: '',
          league_webhooks: {},
          auto_post_leagues: ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL'],
          auto_post_hour_ct: 6,
        },
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => {});
    return res.status(200).json({
      ok: true,
      username: user,
      token: makeToken(user),
      message: 'Account created. Add your own Discord webhook in Setup, or /login in Discord to link.',
    });
  }

  if (action === 'login') {
    const r = await fetch(
      `${client.url}/rest/v1/${USERS_TABLE}?username=eq.${encodeURIComponent(user)}&select=username,password_hash,salt`,
      { headers: client.headers }
    );
    if (!r.ok) return res.status(502).json({ error: await r.text() });
    const rows = await r.json();
    if (!rows[0]) return res.status(401).json({ error: 'Wrong username or password' });
    if (!verify(password, rows[0].salt, rows[0].password_hash))
      return res.status(401).json({ error: 'Wrong username or password' });

    const link = await loadDiscordLink(client, user);
    const settings = await loadUserSettings(client, user);
    return res.status(200).json({
      ok: true,
      username: user,
      token: makeToken(user),
      discord_linked: Boolean(link),
      discord_user_id: link?.discord_user_id || null,
      linked_guild_id: settings?.notify_config?.linked_guild_id || null,
      has_webhook: Boolean(settings?.discord_webhook || settings?.notify_config?.default_webhook),
    });
  }

  return res.status(400).json({ error: 'action must be register or login' });
}
