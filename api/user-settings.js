/** Per-user settings + Discord bot config link (channels/roles from /config). */
import crypto from 'crypto';

function sb() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
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
    },
  };
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
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

const CHANNEL_KEYS = [
  ['ch_NFL', 'NFL picks'],
  ['ch_NBA', 'NBA picks'],
  ['ch_NCAAF', 'NCAAF picks'],
  ['ch_NCAAB', 'NCAAB picks'],
  ['ch_MLB', 'MLB picks'],
  ['ch_NHL', 'NHL picks'],
  ['alerts', 'Live alerts'],
  ['tracker', 'Result tracker'],
  ['stats', 'Stat breakdown'],
  ['roles_panel', 'Role panel'],
];
const ROLE_KEYS = [
  ['role_NFL', 'NFL Alerts'],
  ['role_NBA', 'NBA Alerts'],
  ['role_NCAAF', 'NCAAF Alerts'],
  ['role_NCAAB', 'NCAAB Alerts'],
  ['role_NHL', 'NHL Alerts'],
  ['role_ALL', 'All Sports'],
  ['alert_role', 'Default ping'],
];

async function loadDiscordBotConfig(client, username, notifyConfig) {
  const empty = {
    linked: false,
    discord_user_id: null,
    guild_id: null,
    channels: [],
    roles: [],
    raw: {},
  };
  try {
    let guildId = notifyConfig?.linked_guild_id || process.env.DISCORD_GUILD_ID || '';
    let discordUserId = notifyConfig?.linked_discord_user_id || null;

    try {
      const lr = await fetch(
        `${client.url}/rest/v1/discord_links?username=eq.${encodeURIComponent(username)}&select=discord_user_id,linked_at&limit=1`,
        { headers: client.headers }
      );
      if (lr.ok) {
        const rows = await lr.json();
        if (rows[0]?.discord_user_id) discordUserId = rows[0].discord_user_id;
      }
    } catch {}

    if (!guildId) {
      return {
        ...empty,
        linked: Boolean(discordUserId),
        discord_user_id: discordUserId,
      };
    }

    let raw = {};
    try {
      const r = await fetch(
        `${client.url}/rest/v1/discord_config?guild_id=eq.${encodeURIComponent(guildId)}&select=config&limit=1`,
        { headers: client.headers }
      );
      if (r.ok) {
        const rows = await r.json();
        raw = rows[0]?.config || {};
      }
    } catch {}

    if ((!raw || !Object.keys(raw).length) && notifyConfig?.discord_channels) {
      raw = notifyConfig.discord_channels;
    }

    const channels = CHANNEL_KEYS.filter(([k]) => raw[k]).map(([k, label]) => ({
      key: k,
      label,
      id: String(raw[k]),
    }));
    const roles = ROLE_KEYS.filter(([k]) => raw[k]).map(([k, label]) => ({
      key: k,
      label,
      id: String(raw[k]),
    }));

    return {
      linked: Boolean(discordUserId),
      discord_user_id: discordUserId,
      guild_id: guildId,
      channels,
      roles,
      raw,
    };
  } catch {
    return empty;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const client = sb();
    if (!client) return res.status(500).json({ error: 'Supabase not configured' });

    const username = userFromReq(req);
    if (!username) return res.status(401).json({ error: 'Log in first — then Save again' });

    if (req.method === 'GET') {
      let base = {
        username,
        discord_webhook: null,
        notify_config: {
          mode: 'single',
          default_webhook: '',
          league_webhooks: {},
          auto_post_leagues: ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL'],
          auto_post_hour_ct: 6,
        },
      };
      try {
        const r = await fetch(
          `${client.url}/rest/v1/user_settings?username=eq.${encodeURIComponent(username)}&select=*`,
          { headers: { ...client.headers, Prefer: 'return=representation' } }
        );
        if (r.ok) {
          const rows = await r.json();
          if (rows[0]) base = rows[0];
        }
      } catch {}

      const discord_bot = await loadDiscordBotConfig(client, username, base.notify_config || {});
      if (discord_bot.raw && Object.keys(discord_bot.raw).length) {
        base.notify_config = {
          ...(base.notify_config || {}),
          linked_guild_id: discord_bot.guild_id,
          linked_discord_user_id: discord_bot.discord_user_id,
          discord_channels: discord_bot.raw,
          delivery: 'bot_channels',
        };
      }
      return res.status(200).json({ ...base, discord_bot });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      let prev = {};
      try {
        const pr = await fetch(
          `${client.url}/rest/v1/user_settings?username=eq.${encodeURIComponent(username)}&select=*`,
          { headers: client.headers }
        );
        if (pr.ok) {
          const rows = await pr.json();
          prev = rows[0] || {};
        }
      } catch {}

      const webhook =
        body.discord_webhook != null
          ? String(body.discord_webhook).trim() || null
          : body.notify_config?.default_webhook
            ? String(body.notify_config.default_webhook).trim() || null
            : prev.discord_webhook || null;

      const notify_config = {
        ...(prev.notify_config || {}),
        ...(body.notify_config || {}),
        mode: body.notify_config?.mode || prev.notify_config?.mode || 'single',
        default_webhook: webhook || '',
        league_webhooks: body.notify_config?.league_webhooks || prev.notify_config?.league_webhooks || {},
        auto_post_leagues:
          body.notify_config?.auto_post_leagues ||
          prev.notify_config?.auto_post_leagues || ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL'],
        auto_post_hour_ct: body.notify_config?.auto_post_hour_ct ?? prev.notify_config?.auto_post_hour_ct ?? 6,
      };
      if (webhook) notify_config.default_webhook = webhook;

      const discord_bot = await loadDiscordBotConfig(client, username, notify_config);
      if (discord_bot.raw && Object.keys(discord_bot.raw).length) {
        notify_config.discord_channels = discord_bot.raw;
        notify_config.linked_guild_id = discord_bot.guild_id;
        notify_config.linked_discord_user_id = discord_bot.discord_user_id;
        notify_config.delivery = 'bot_channels';
      }

      const row = {
        username,
        discord_webhook: webhook,
        notify_config,
        updated_at: new Date().toISOString(),
      };
      if (body.bankroll_start != null) row.bankroll_start = body.bankroll_start;
      if (body.unit_size != null) row.unit_size = body.unit_size;
      if (body.min_confidence_to_alert != null) row.min_confidence_to_alert = body.min_confidence_to_alert;

      try {
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
          if (Array.isArray(data) && data[0]) {
            return res.status(200).json({ ...data[0], discord_bot });
          }
        }
      } catch {}

      try {
        const ins = await fetch(`${client.url}/rest/v1/user_settings`, {
          method: 'POST',
          headers: { ...client.headers, Prefer: 'return=representation' },
          body: JSON.stringify(row),
        });
        if (ins.ok) {
          const data = await ins.json();
          const saved = Array.isArray(data) ? data[0] : data;
          return res.status(200).json({ ...saved, discord_bot });
        }
      } catch {}

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
        return res.status(200).json({
          username,
          discord_webhook: webhook,
          notify_config,
          discord_bot,
          warning: `Could not persist: ${err.slice(0, 200)}`,
        });
      }
      const data = await up.json();
      const saved = Array.isArray(data) ? data[0] : data;
      return res.status(200).json({ ...saved, discord_bot });
    }

    return res.status(405).end();
  } catch (e) {
    console.error('user-settings error', e);
    return res.status(200).json({
      error: e.message || String(e),
      username: null,
      discord_webhook: null,
      notify_config: {},
      discord_bot: { linked: false, channels: [], roles: [], raw: {} },
    });
  }
}
