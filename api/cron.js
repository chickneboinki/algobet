/** Daily cron + health + Discord bot command registration. */

const LEAGUES = ['NFL', 'NBA', 'NCAAF', 'NCAAB', 'MLB', 'NHL'];

async function registerDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guild = process.env.DISCORD_GUILD_ID;
  const base = process.env.APP_URL || 'https://helpbet.vercel.app';
  if (!token) return { ok: false, error: 'DISCORD_BOT_TOKEN missing in Vercel env' };

  const headers = {
    Authorization: 'Bot ' + token,
    'Content-Type': 'application/json',
  };

  const meRes = await fetch('https://discord.com/api/v10/applications/@me', { headers: headers });
  const meText = await meRes.text();
  if (!meRes.ok) return { ok: false, error: 'applications/@me ' + meRes.status + ': ' + meText.slice(0, 200) };
  const me = JSON.parse(meText);
  const appId = me.id;
  if (!appId) return { ok: false, error: 'No application id', me: me };

  const admin = { default_member_permissions: '32', dm_permission: false };
  const channelOpt = {
    type: 7,
    name: 'channel',
    description: 'Channel',
    channel_types: [0, 5],
  };
  const roleOpt = function(name, desc) { return { type: 8, name: name, description: desc }; };

  // PUT replaces the FULL command list for this guild — keep this in sync with notify.js handlers
  const commands = [
    {
      name: 'test',
      description: 'Check that HelpBet bot is online',
      dm_permission: false,
    },
    {
      name: 'login',
      description: 'Link your HelpBet website account to Discord (syncs settings)',
      dm_permission: false,
      options: [
        { type: 3, name: 'username', description: 'HelpBet username', required: true },
        { type: 3, name: 'password', description: 'HelpBet password', required: true },
      ],
    },
    { name: 'config', description: 'Admin: set league channels, tracker, stats, alerts, roles panel', ...admin },
    {
      name: 'send',
      description: 'Admin: send best picks for chosen days',
      ...admin,
      options: [
        {
          type: 3,
          name: 'days',
          description: 'Day range (Central time)',
          required: false,
          choices: [
            { name: 'Today only', value: 'today' },
            { name: 'Tomorrow only', value: 'tomorrow' },
            { name: 'Today + tomorrow', value: 'today_and_tomorrow' },
            { name: 'Next 3 days', value: 'next_3' },
          ],
        },
      ],
    },
    {
      name: 'setroles',
      description: 'Admin: set alert roles + role-panel channel',
      ...admin,
      options: [
        roleOpt('nfl', 'NFL Alerts role'),
        roleOpt('ncaaf', 'NCAAF Alerts role'),
        roleOpt('ncaab', 'NCAAB Alerts role'),
        roleOpt('nba', 'NBA Alerts role'),
        roleOpt('nhl', 'NHL Alerts role'),
        roleOpt('all', 'All Sports role'),
        Object.assign({}, channelOpt, { name: 'panel', description: 'Channel for the role self-assign panel' }),
      ],
    },
    {
      name: 'resetchannel',
      description: 'Admin: delete messages in a channel (fast)',
      ...admin,
      options: [Object.assign({}, channelOpt, { required: true, description: 'Channel to clear' })],
    },
  ];

  const putUrl = guild
    ? 'https://discord.com/api/v10/applications/' + appId + '/guilds/' + guild + '/commands'
    : 'https://discord.com/api/v10/applications/' + appId + '/commands';

  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(commands),
  });
  const putText = await putRes.text();
  let putJson;
  try { putJson = JSON.parse(putText); } catch (e) { putJson = putText; }
  if (!putRes.ok) {
    return { ok: false, error: 'commands PUT ' + putRes.status, detail: putJson, appId: appId, guild: guild || null };
  }

  const endpoint = base + '/api/discord-interactions';
  const patchRes = await fetch('https://discord.com/api/v10/applications/@me', {
    method: 'PATCH',
    headers: headers,
    body: JSON.stringify({ interactions_endpoint_url: endpoint }),
  });
  const patchText = await patchRes.text();
  let patchJson;
  try { patchJson = JSON.parse(patchText); } catch (e) { patchJson = patchText; }

  return {
    ok: true,
    appId: appId,
    guild: guild || 'global',
    commands: Array.isArray(putJson) ? putJson.map(function(c) { return c.name; }) : putJson,
    endpoint: endpoint,
    endpoint_set: patchRes.ok,
    endpoint_detail: patchRes.ok ? endpoint : patchJson,
    note: 'Registered: test, login, config, send, setroles, resetchannel. wipeallchannel removed.',
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

  const auth = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== 'Bearer ' + cronSecret) {
    if (req.headers['x-vercel-cron'] !== '1') return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.APP_URL || 'https://helpbet.vercel.app';
  const out = { at: new Date().toISOString(), steps: {} };

  try {
    const g = await fetch(base + '/api/games?sport=ALL');
    out.steps.games = { status: g.status };
  } catch (e) {
    out.steps.games = { error: e.message };
  }

  try {
    const b = await fetch(base + '/api/best-bets?persist=1&min_confidence=0.45&limit=80');
    out.steps.best_bets = await b.json().catch(function() { return {}; });
  } catch (e) {
    out.steps.best_bets = { error: e.message };
  }

  try {
    const n = await fetch(base + '/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all_users: true, title: 'HelpBet · Daily — all bets for today' }),
    });
    out.steps.notify = await n.json().catch(function() { return {}; });
  } catch (e) {
    out.steps.notify = { error: e.message };
  }

  return res.status(200).json(Object.assign({ ok: true }, out));
}
