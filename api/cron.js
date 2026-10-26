/** Daily cron + health + Discord bot command registration.
 *  Hobby plan shares these on one function. */

const LEAGUES = ['NFL', 'NBA', 'NCAAF', 'NCAAB', 'MLB', 'NHL'];

async function registerDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guild = process.env.DISCORD_GUILD_ID;
  const base = process.env.APP_URL || 'https://helpbet.vercel.app';
  if (!token) return { ok: false, error: 'DISCORD_BOT_TOKEN missing in Vercel env' };

  const headers = {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  };

  // Resolve application id from the token (do not parse JWT manually)
  const meRes = await fetch('https://discord.com/api/v10/applications/@me', { headers });
  const meText = await meRes.text();
  if (!meRes.ok) return { ok: false, error: `applications/@me ${meRes.status}: ${meText.slice(0, 200)}` };
  const me = JSON.parse(meText);
  const appId = me.id;
  if (!appId) return { ok: false, error: 'No application id', me };

  // Server-only commands. Admin cmds require Manage Server (permission bit 32).
  const commands = [
    { name: 'login', description: 'Link your HelpBet website account to Discord', dm_permission: false },
    { name: 'logout', description: 'Unlink your HelpBet account', dm_permission: false },
    { name: 'mybets', description: 'Your bets from your linked HelpBet account', dm_permission: false },
    {
      name: 'config',
      description: 'Admin: set league channels, tracker, stats and alerts',
      default_member_permissions: '32',
      dm_permission: false,
    },
    {
      name: 'post',
      description: 'Admin: post a league slate (next 3 days) to its channel',
      default_member_permissions: '32',
      dm_permission: false,
      options: [
        {
          type: 3,
          name: 'league',
          description: 'League',
          required: true,
          choices: LEAGUES.map((l) => ({ name: l, value: l })),
        },
        {
          type: 7,
          name: 'channel',
          description: 'Optional channel override',
          channel_types: [0, 5],
        },
      ],
    },
    {
      name: 'run',
      description: 'Run HelpBet tools on one game',
      dm_permission: false,
      options: [
        { type: 3, name: 'game', description: 'Pick a game', required: true, autocomplete: true },
      ],
    },
  ];

  const putUrl = guild
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guild}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;

  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(commands),
  });
  const putText = await putRes.text();
  let putJson;
  try {
    putJson = JSON.parse(putText);
  } catch {
    putJson = putText;
  }
  if (!putRes.ok) {
    return {
      ok: false,
      error: `commands PUT ${putRes.status}`,
      detail: putJson,
      appId,
      guild: guild || null,
    };
  }

  // Point Discord at our interactions handler (rewrite exists for /api/discord-interactions)
  const endpoint = `${base}/api/discord-interactions`;
  const patchRes = await fetch('https://discord.com/api/v10/applications/@me', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ interactions_endpoint_url: endpoint }),
  });
  const patchText = await patchRes.text();
  let patchJson;
  try {
    patchJson = JSON.parse(patchText);
  } catch {
    patchJson = patchText;
  }

  return {
    ok: true,
    appId,
    guild: guild || 'global',
    commands: Array.isArray(putJson) ? putJson.map((c) => c.name) : putJson,
    endpoint,
    endpoint_set: patchRes.ok,
    endpoint_detail: patchRes.ok ? endpoint : patchJson,
    note: 'Commands are guild-only (no DMs). /config and /post require Manage Server.',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, 'http://localhost');
  const route = url.searchParams.get('route');

  if (route === 'health') {
    return res.status(200).json({
      ok: true,
      openrouter_configured: Boolean(process.env.OPENROUTER_API_KEY),
      odds_api_configured: Boolean(process.env.ODDS_API_KEY),
      balldontlie_configured: Boolean(process.env.BALLDONTLIE_API_KEY),
      discord_bot_configured: Boolean(process.env.DISCORD_BOT_TOKEN),
      discord_guild: process.env.DISCORD_GUILD_ID || null,
      time: new Date().toISOString(),
    });
  }

  // Bring Discord slash commands online (restricted)
  if (route === 'bot-register' || route === 'register-bot') {
    try {
      const result = await registerDiscordBot();
      return res.status(result.ok ? 200 : 500).json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || String(e) });
    }
  }

  const auth = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    if (req.headers['x-vercel-cron'] !== '1') return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.APP_URL || 'https://helpbet.vercel.app';
  const out = { at: new Date().toISOString(), steps: {} };

  try {
    const s = await fetch(`${base}/api/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    out.steps.settle = await s.json().catch(() => ({}));
  } catch (e) {
    out.steps.settle = { error: e.message };
  }

  try {
    const g = await fetch(`${base}/api/games?sport=ALL`);
    out.steps.games = { status: g.status, ...(await g.json().catch(() => ({}))) };
  } catch (e) {
    out.steps.games = { error: e.message };
  }

  try {
    const b = await fetch(`${base}/api/best-bets?persist=1&min_confidence=0.45&limit=80`);
    out.steps.best_bets = await b.json().catch(() => ({}));
  } catch (e) {
    out.steps.best_bets = { error: e.message };
  }

  try {
    const n = await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all_users: true, title: 'HelpBet · Daily — all bets for today' }),
    });
    out.steps.notify = await n.json().catch(() => ({}));
  } catch (e) {
    out.steps.notify = { error: e.message };
  }

  try {
    const key = (await import('node:crypto'))
      .createHash('sha256')
      .update(String(process.env.DISCORD_BOT_TOKEN || 'none'))
      .digest('hex')
      .slice(0, 40);
    const pa = await fetch(`${base}/api/notify?route=postall`, { headers: { 'x-hb-internal': key } });
    out.steps.postall = await pa.json().catch(() => ({}));
  } catch (e) {
    out.steps.postall = { error: e.message };
  }

  try {
    const f = await fetch(`${base}/api/notify?route=tick`);
    out.steps.finalize = await f.json().catch(() => ({}));
  } catch (e) {
    out.steps.finalize = { error: e.message };
  }

  return res.status(200).json({ ok: true, ...out });
}
