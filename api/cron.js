/** Daily cron + health + Discord bot command registration. */

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

  const meRes = await fetch('https://discord.com/api/v10/applications/@me', { headers });
  const meText = await meRes.text();
  if (!meRes.ok) return { ok: false, error: `applications/@me ${meRes.status}: ${meText.slice(0, 200)}` };
  const me = JSON.parse(meText);
  const appId = me.id;
  if (!appId) return { ok: false, error: 'No application id', me };

  const admin = { default_member_permissions: '32', dm_permission: false };
  const channelOpt = {
    type: 7,
    name: 'channel',
    description: 'Channel',
    channel_types: [0, 5],
  };
  const roleOpt = (name, desc) => ({ type: 8, name, description: desc });

  const commands = [
    {
      name: 'login',
      description: 'Link your HelpBet website account to Discord (syncs settings)',
      dm_permission: false,
      options: [
        { type: 3, name: 'username', description: 'HelpBet username', required: true },
        { type: 3, name: 'password', description: 'HelpBet password', required: true },
      ],
    },
    { name: 'logout', description: 'Unlink your HelpBet account', dm_permission: false },
    { name: 'mybets', description: 'Your bets from your linked HelpBet account', dm_permission: false },
    { name: 'config', description: 'Admin: set league channels, tracker, stats, alerts, roles panel', ...admin },
    {
      name: 'send',
      description: 'Admin: send best picks for a league (or all) for chosen days',
      ...admin,
      options: [
        {
          type: 3,
          name: 'league',
          description: 'League or ALL',
          required: true,
          choices: [{ name: 'ALL leagues', value: 'ALL' }, ...LEAGUES.map((l) => ({ name: l, value: l }))],
        },
        {
          type: 3,
          name: 'days',
          description: 'Quick range (Central time). Overridden by start_day/end_day if set.',
          required: false,
          choices: [
            { name: 'Today only', value: 'today' },
            { name: 'Tomorrow only', value: 'tomorrow' },
            { name: 'Today + tomorrow', value: 'today_and_tomorrow' },
            { name: 'Next 3 days (today..+2)', value: 'next_3' },
          ],
        },
        {
          type: 4,
          name: 'start_day',
          description: 'Day offset from today (0=today, 1=tomorrow, -1=yesterday). Optional.',
          required: false,
          min_value: -7,
          max_value: 30,
        },
        {
          type: 4,
          name: 'end_day',
          description: 'End day offset from today (inclusive). Optional.',
          required: false,
          min_value: -7,
          max_value: 30,
        },
        { ...channelOpt, description: 'Optional override channel (else uses /config league channel)', required: false },
      ],
    },
    {
      name: 'post',
      description: 'Admin: post a short league note (use /send for full picks)',
      ...admin,
      options: [
        {
          type: 3,
          name: 'league',
          description: 'League',
          required: true,
          choices: LEAGUES.map((l) => ({ name: l, value: l })),
        },
        { ...channelOpt, description: 'Optional channel override', required: false },
      ],
    },
    {
      name: 'setroles',
      description: 'Admin: set alert roles + role-panel channel, then post the panel',
      ...admin,
      options: [
        roleOpt('nfl', 'NFL Alerts role'),
        roleOpt('ncaaf', 'NCAAF Alerts role'),
        roleOpt('ncaab', 'NCAAB Alerts role'),
        roleOpt('nba', 'NBA Alerts role'),
        roleOpt('nhl', 'NHL Alerts role'),
        roleOpt('all', 'All Sports role'),
        { ...channelOpt, name: 'panel', description: 'Channel for the role self-assign panel' },
      ],
    },
    {
      name: 'wipeallchannel',
      description: 'Admin: wipe messages in ALL channels set in /config (league + alerts + tracker + stats)',
      ...admin,
    },
    {
      name: 'resetchannel',
      description: 'Admin: delete messages in a channel',
      ...admin,
      options: [{ ...channelOpt, required: true }],
    },
    {
      name: 'testalert',
      description: 'Admin: send a sample LIVE GAME ALERT',
      ...admin,
      options: [{ ...channelOpt, description: 'Override alert channel' }],
    },
    {
      name: 'testresult',
      description: 'Admin: send a sample result tracker table',
      ...admin,
      options: [{ ...channelOpt, description: 'Override tracker channel' }],
    },
    {
      name: 'teststat',
      description: 'Admin: send a sample stat breakdown',
      ...admin,
      options: [{ ...channelOpt, description: 'Override stats channel' }],
    },
    {
      name: 'run',
      description: 'Run HelpBet tools on one game',
      dm_permission: false,
      options: [{ type: 3, name: 'game', description: 'Pick a game', required: true, autocomplete: true }],
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
    return { ok: false, error: `commands PUT ${putRes.status}`, detail: putJson, appId, guild: guild || null };
  }

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
    note: 'Admin cmds need Manage Server. /send posts best picks by league + day range.',
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

  if (route === 'bot-register' || route === 'register-bot') {
    try {
      const result = await registerDiscordBot();
      return res.status(result.ok ? 200 : 500).json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || String(e) });
    }
  }

  // Frequent tick: live alerts + complete embeds (no re-post of daily picks)
  if (route === 'tick' || route === 'lifecycle') {
    try {
      const base = process.env.APP_URL || 'https://helpbet.vercel.app';
      const f = await fetch(`${base}/api/notify?route=tick`);
      const data = await f.json().catch(() => ({}));
      return res.status(f.ok ? 200 : 500).json({ ok: f.ok, ...data });
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

  // ONE daily picks post only (postall removed — it was re-sending the full slate ~5 min later)
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

  // Live alerts + FINAL embed updates + tracker/stats
  try {
    const f = await fetch(`${base}/api/notify?route=tick`);
    out.steps.finalize = await f.json().catch(() => ({}));
  } catch (e) {
    out.steps.finalize = { error: e.message };
  }

  return res.status(200).json({ ok: true, ...out });
}
