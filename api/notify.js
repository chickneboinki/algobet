import crypto from 'node:crypto';

const LEAGUE_COLORS = { NFL: 0x013369, NCAAF: 0xe87722, NCAAB: 0x7c3aed, NBA: 0xc8102e, MLB: 0x002d72, NHL: 0x1e3a5f, DEFAULT: 0x38bdf8 };
const LEAGUE_KEYS = ['NFL', 'NBA', 'NCAAF', 'NCAAB', 'MLB', 'NHL'];
const GUILD = () => process.env.DISCORD_GUILD_ID || '';

const ROLE_PANEL_KEYS = [
  { key: 'role_NFL', label: 'NFL Alerts' },
  { key: 'role_NCAAF', label: 'NCAAF Alerts' },
  { key: 'role_NCAAB', label: 'NCAAB Alerts' },
  { key: 'role_NBA', label: 'NBA Alerts' },
  { key: 'role_NHL', label: 'NHL Alerts' },
  { key: 'role_ALL', label: 'All Sports' },
];

const CFG_ITEMS = [
  ...LEAGUE_KEYS.map((L) => ({ key: `ch_${L}`, label: `${L} picks channel`, kind: 'channel' })),
  { key: 'tracker', label: 'Result tracker channel', kind: 'channel' },
  { key: 'stats', label: 'Stat breakdown channel', kind: 'channel' },
  { key: 'alerts', label: 'Live game alert channel', kind: 'channel' },
  { key: 'roles_panel', label: 'Role self-assign panel channel', kind: 'channel' },
  ...ROLE_PANEL_KEYS.map((r) => ({ key: r.key, label: r.label + ' role', kind: 'role' })),
  { key: 'alert_role', label: 'Default ping role', kind: 'role' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function botApi(method, path, body) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if (r.status === 429) {
      let wait = 1.5;
      try {
        wait = Math.min(6, Number(JSON.parse(text).retry_after) || 1.5);
      } catch {}
      await sleep(wait * 1000 + 100);
      continue;
    }
    throw new Error(`Discord ${r.status}: ${text.slice(0, 180)}`);
  }
  throw new Error('Discord rate limited');
}

function sbHeaders() {
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}
function sbUrl() {
  return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
}

async function sb(path, opts = {}) {
  const headers = { ...sbHeaders() };
  if (opts.prefer) headers.Prefer = opts.prefer;
  const r = await fetch(`${sbUrl()}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

async function loadCfg(guildId) {
  if (!guildId) return {};
  try {
    const rows = await sb(`discord_config?guild_id=eq.${guildId}&select=config&limit=1`);
    return rows?.[0]?.config || {};
  } catch {
    return {};
  }
}

async function saveCfg(guildId, cfg) {
  await sb('discord_config', {
    method: 'POST',
    body: { guild_id: guildId, config: cfg, updated_at: new Date().toISOString() },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

function isAdmin(it) {
  try {
    const p = BigInt(it.member?.permissions || 0);
    return (p & 0x20n) !== 0n || (p & 0x8n) !== 0n;
  } catch {
    return false;
  }
}

function liveAlertEmbed(row, m) {
  const g = row.snapshot?.game || {};
  const sport = String(row.sport || 'SPORT').toUpperCase();
  const away = g.away_team || 'Away';
  const home = g.home_team || 'Home';
  const as = m.away_score ?? 0;
  const hs = m.home_score ?? 0;
  const detail = m.detail || 'In progress';
  const play = (row.snapshot?.top_plays || [])[0];
  const statWatch = play
    ? `${play.player} · ${play.market}`
    : ['NFL', 'NCAAF'].includes(sport)
      ? 'Passing yards'
      : 'Key stats';
  return {
    title: 'LIVE GAME ALERT',
    description: [
      `**${sport}** · Live update`,
      '',
      `**${away} vs. ${home}**`,
      '',
      `**Score:** ${away} ${as} — ${home} ${hs}`,
      '',
      `**Status:** ${detail}`,
      '',
      `**Stat to watch:** ${statWatch}`,
      '',
      'Source: connected live data feed',
      `Updated ${new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      })}`,
    ].join('\n'),
    color: 0xef4444,
    footer: { text: 'LIVE' },
  };
}

function resultTrackerEmbed(stats) {
  const settled = stats.settled ?? 0;
  const wins = stats.wins ?? 0;
  const losses = stats.losses ?? 0;
  const pushes = stats.pushes ?? 0;
  const denom = wins + losses;
  const rate = stats.win_rate != null ? stats.win_rate : denom ? (wins / denom) * 100 : 0;
  const rows = [
    ['Settled picks', String(settled)],
    ['Wins', String(wins)],
    ['Losses', String(losses)],
    ['Pushes', String(pushes)],
    ['Win rate (excluding pushes)', `${rate.toFixed(1)}%`],
  ];
  return {
    title: 'Result tracker',
    description: rows.map(([a, b]) => `**${a}:** ${b}`).join('\n'),
    color: 0x111111,
    fields: [
      { name: 'Metric', value: rows.map((r) => r[0]).join('\n'), inline: true },
      { name: 'Value', value: rows.map((r) => r[1]).join('\n'), inline: true },
    ],
    footer: { text: 'HelpBet · settled results' },
  };
}

function rolePanelPayload(cfg) {
  const lines = ['**Pick your alert roles**', 'Tap a button to get or remove that role.', ''];
  for (const r of ROLE_PANEL_KEYS) {
    const id = cfg[r.key];
    lines.push(`**${r.label}** ${id ? `<@&${id}>` : '_(set with /setroles)_'}`);
  }
  const rows = [];
  for (let i = 0; i < ROLE_PANEL_KEYS.length; i += 5) {
    const chunk = ROLE_PANEL_KEYS.slice(i, i + 5);
    rows.push({
      type: 1,
      components: chunk.map((r) => ({
        type: 2,
        style: 2,
        label: r.label.slice(0, 80),
        custom_id: `role|${r.key}`,
      })),
    });
  }
  return {
    embeds: [
      {
        title: 'HelpBet alert roles',
        description: lines.join('\n'),
        color: 0x38bdf8,
        footer: { text: 'Tap again to remove' },
      },
    ],
    components: rows,
  };
}

async function sendChannel(channelId, payload) {
  return botApi('POST', `/channels/${channelId}/messages`, payload);
}

async function postRolePanel(cfg) {
  if (!cfg.roles_panel) throw new Error('Set role panel channel first');
  const missing = ROLE_PANEL_KEYS.filter((r) => !cfg[r.key]);
  if (missing.length) throw new Error(`Missing roles: ${missing.map((m) => m.label).join(', ')}`);
  return sendChannel(cfg.roles_panel, rolePanelPayload(cfg));
}

async function clearChannelMessages(channelId) {
  let deleted = 0;
  for (let pass = 0; pass < 5; pass++) {
    const list = await botApi('GET', `/channels/${channelId}/messages?limit=100`);
    if (!Array.isArray(list) || !list.length) break;
    const now = Date.now();
    const bulk = list
      .filter((m) => now - new Date(m.timestamp).getTime() < 13.9 * 24 * 3600e3)
      .map((m) => m.id);
    if (bulk.length >= 2) {
      await botApi('POST', `/channels/${channelId}/messages/bulk-delete`, { messages: bulk });
      deleted += bulk.length;
    } else if (bulk.length === 1) {
      await botApi('DELETE', `/channels/${channelId}/messages/${bulk[0]}`);
      deleted += 1;
    }
    if (list.length < 100) break;
    await sleep(400);
  }
  return deleted;
}

function sampleLiveRow() {
  return {
    sport: 'NFL',
    snapshot: {
      game: { away_team: 'Team A', home_team: 'Team B' },
      top_plays: [{ player: 'Demo QB', market: 'Passing yards' }],
    },
  };
}

function cfgPanel(cfg, selected) {
  const val = (it) => {
    const v = cfg[it.key];
    return v ? (it.kind === 'role' ? `<@&${v}>` : `<#${v}>`) : '_not set_';
  };
  const item = selected ? CFG_ITEMS.find((x) => x.key === selected) : null;
  return {
    embeds: [
      {
        title: 'HelpBet admin',
        description: CFG_ITEMS.map((it) => `**${it.label}:** ${val(it)}`).join('\n').slice(0, 4000),
        color: 0x38bdf8,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: 'cfg|pick',
            placeholder: 'Choose a setting to edit',
            options: CFG_ITEMS.slice(0, 25).map((it) => ({ label: it.label.slice(0, 100), value: it.key })),
          },
        ],
      },
      ...(item
        ? [
            {
              type: 1,
              components: [
                item.kind === 'role'
                  ? {
                      type: 6,
                      custom_id: `cfg|role|${item.key}`,
                      placeholder: `Pick role: ${item.label}`.slice(0, 150),
                    }
                  : {
                      type: 8,
                      custom_id: `cfg|ch|${item.key}`,
                      channel_types: [0, 5],
                      placeholder: `Pick channel: ${item.label}`.slice(0, 150),
                    },
              ],
            },
          ]
        : []),
      {
        type: 1,
        components: [
          ...(item ? [{ type: 2, style: 4, label: 'Clear this setting', custom_id: `cfg|clear|${item.key}` }] : []),
          { type: 2, style: 3, label: 'Post role panel now', custom_id: 'cfg|rolespanel' },
        ],
      },
    ],
  };
}

async function getPublicKey() {
  if (process.env.DISCORD_PUBLIC_KEY) return process.env.DISCORD_PUBLIC_KEY;
  const app = await botApi('GET', '/applications/@me');
  return app.verify_key;
}

async function verifyDiscord(raw, sig, ts) {
  if (!sig || !ts) return false;
  try {
    const pub = await getPublicKey();
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pub, 'hex')]);
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(ts + raw), key, Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}

function text(content) {
  return { type: 4, data: { flags: 64, content } };
}
function eph(data) {
  return { type: 4, data: { flags: 64, ...data } };
}

async function handleBotInteraction(it, res) {
  const guildId = it.guild_id || GUILD();
  const name = it.data?.name;
  const opt = (n) => (it.data?.options || []).find((x) => x.name === n)?.value;

  if (it.type === 3 && String(it.data?.custom_id || '').startsWith('role|')) {
    const roleKey = String(it.data.custom_id).split('|')[1];
    const cfg = await loadCfg(guildId);
    const roleId = cfg[roleKey];
    if (!roleId) return res.status(200).json(text('Role not configured. Admin: /setroles'));
    const uid = it.member?.user?.id || it.user?.id;
    const has = (it.member?.roles || []).includes(roleId);
    try {
      if (has) {
        await botApi('DELETE', `/guilds/${guildId}/members/${uid}/roles/${roleId}`);
        return res.status(200).json(text(`Removed **${ROLE_PANEL_KEYS.find((r) => r.key === roleKey)?.label || roleKey}**.`));
      }
      await botApi('PUT', `/guilds/${guildId}/members/${uid}/roles/${roleId}`);
      return res.status(200).json(text(`Added **${ROLE_PANEL_KEYS.find((r) => r.key === roleKey)?.label || roleKey}**.`));
    } catch (e) {
      return res.status(200).json(text(`Role failed (bot needs Manage Roles): ${e.message}`));
    }
  }

  if (it.type === 3 && String(it.data?.custom_id || '').startsWith('cfg|')) {
    if (!isAdmin(it)) return res.status(200).json(text('Admin only.'));
    const parts = String(it.data.custom_id).split('|');
    const act = parts[1];
    const key = parts[2];
    const cfg = await loadCfg(guildId);
    let selected = null;
    if (act === 'pick') selected = it.data.values?.[0];
    else if (act === 'ch' || act === 'role') {
      cfg[key] = it.data.values[0];
      await saveCfg(guildId, cfg);
      selected = key;
      if (key === 'roles_panel') {
        try {
          await postRolePanel(cfg);
        } catch {}
      }
    } else if (act === 'clear') {
      delete cfg[key];
      await saveCfg(guildId, cfg);
    } else if (act === 'rolespanel') {
      try {
        await postRolePanel(cfg);
        return res.status(200).json(text('Role panel posted.'));
      } catch (e) {
        return res.status(200).json(text(e.message));
      }
    }
    return res.status(200).json({ type: 7, data: cfgPanel(cfg, selected) });
  }

  if (it.type !== 2) return res.status(200).json(text('Unsupported.'));

  if (name === 'config') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    return res.status(200).json(eph(cfgPanel(await loadCfg(guildId), null)));
  }
  if (name === 'setroles') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const map = {
      nfl: 'role_NFL',
      ncaaf: 'role_NCAAF',
      ncaab: 'role_NCAAB',
      nba: 'role_NBA',
      nhl: 'role_NHL',
      all: 'role_ALL',
      panel: 'roles_panel',
    };
    for (const [k, ck] of Object.entries(map)) {
      const v = opt(k);
      if (v) cfg[ck] = v;
    }
    await saveCfg(guildId, cfg);
    let extra = '';
    if (cfg.roles_panel) {
      try {
        await postRolePanel(cfg);
        extra = ` Panel → <#${cfg.roles_panel}>`;
      } catch (e) {
        extra = ` Panel: ${e.message}`;
      }
    }
    return res.status(200).json(text('Roles saved.' + extra));
  }
  if (name === 'resetchannel') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const channel = opt('channel');
    if (!channel) return res.status(200).json(text('Pick a channel.'));
    try {
      const n = await clearChannelMessages(channel);
      return res.status(200).json(text(`Cleared ~**${n}** messages in <#${channel}>.`));
    } catch (e) {
      return res.status(200).json(text(`Failed: ${e.message}`));
    }
  }
  if (name === 'testalert') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const channel = opt('channel') || cfg.alerts;
    if (!channel) return res.status(200).json(text('No alert channel.'));
    const roleId = cfg.role_NFL || cfg.alert_role;
    await sendChannel(channel, {
      content: roleId ? `<@&${roleId}>` : undefined,
      embeds: [liveAlertEmbed(sampleLiveRow(), { away_score: 17, home_score: 14, detail: 'Q3 · 08:42 remaining' })],
      allowed_mentions: roleId ? { roles: [roleId] } : { parse: [] },
    });
    return res.status(200).json(text(`Test LIVE alert → <#${channel}>`));
  }
  if (name === 'testresult') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const channel = opt('channel') || cfg.tracker;
    if (!channel) return res.status(200).json(text('No tracker channel.'));
    await sendChannel(channel, {
      embeds: [resultTrackerEmbed({ settled: 100, wins: 58, losses: 37, pushes: 5, win_rate: 61.1 })],
    });
    return res.status(200).json(text(`Test result tracker → <#${channel}>`));
  }
  if (name === 'teststat') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const channel = opt('channel') || cfg.stats;
    if (!channel) return res.status(200).json(text('No stats channel.'));
    await sendChannel(channel, {
      embeds: [
        {
          title: 'Stat breakdown · NFL Team A vs Team B',
          description: 'Demo stat card',
          color: 0x38bdf8,
          fields: [{ name: 'Team A', value: '**Demo QB** — 285 pass yds' }],
          footer: { text: 'HelpBet stat breakdown' },
        },
      ],
    });
    return res.status(200).json(text(`Test stat → <#${channel}>`));
  }
  if (name === 'post') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const league = String(opt('league') || '').toUpperCase();
    const cfg = await loadCfg(guildId);
    const channel = opt('channel') || cfg[`ch_${league}`];
    if (!channel) return res.status(200).json(text(`Set ${league} channel in /config`));
    await sendChannel(channel, {
      embeds: [
        {
          title: `${league} slate`,
          description: `Use the website **Send to channel** for the full multi-game digest, or wait for daily auto-post.\nChannel: <#${channel}>`,
          color: LEAGUE_COLORS[league] || LEAGUE_COLORS.DEFAULT,
        },
      ],
    });
    return res.status(200).json(text(`Posted note in <#${channel}>.`));
  }
  if (name === 'login' || name === 'logout' || name === 'mybets' || name === 'run') {
    return res.status(200).json(text(`/${name} — use the website account for full sync for now.`));
  }
  return res.status(200).json(text('Unknown command.'));
}

async function handleInteraction(req, res, raw) {
  if (!(await verifyDiscord(raw, req.headers['x-signature-ed25519'], req.headers['x-signature-timestamp']))) {
    return res.status(401).send('invalid request signature');
  }
  const it = JSON.parse(raw);
  if (it.type === 1) return res.status(200).json({ type: 1 });
  return handleBotInteraction(it, res);
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function postWebhook(webhook, payload) {
  const r = await fetch(webhook.includes('?') ? webhook + '&wait=true' : webhook + '?wait=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'HelpBet', allowed_mentions: { parse: [] }, ...payload }),
  });
  if (!r.ok) throw new Error(`Webhook ${r.status}: ${(await r.text()).slice(0, 120)}`);
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, 'http://localhost');
  const route = url.searchParams.get('route');

  try {
    const raw = await readRaw(req);

    if (route === 'interactions') return await handleInteraction(req, res, raw);
    if (route === 'tick' || route === 'finalize') {
      return res.status(200).json({ ok: true, note: 'tick compact mode' });
    }
    if (route === 'register') {
      return res.status(200).json({ ok: true, note: 'Use /api/cron?route=bot-register' });
    }

    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {}

    let webhook = body.webhook_url || process.env.DISCORD_WEBHOOK_URL;
    if (body.username && !webhook) {
      try {
        const rows = await sb(`user_settings?username=eq.${encodeURIComponent(body.username)}&select=discord_webhook`);
        webhook = rows?.[0]?.discord_webhook;
      } catch {}
    }
    if (!webhook || !String(webhook).includes('discord.com')) {
      return res.status(400).json({ error: 'Pass webhook_url or save webhook in Setup.' });
    }

    await postWebhook(webhook, {
      embeds: [
        {
          title: 'HelpBet · Best bets',
          description: Array.isArray(body.dates)
            ? `Days: **${body.dates.join(', ')}**\nOpen https://helpbet.vercel.app for full cards.`
            : 'Open https://helpbet.vercel.app for full cards, props, and book links.',
          color: 0x38bdf8,
        },
      ],
    });
    await postWebhook(webhook, {
      embeds: [liveAlertEmbed(sampleLiveRow(), { away_score: 17, home_score: 14, detail: 'Q3 · 08:42 remaining' })],
    });
    await postWebhook(webhook, {
      embeds: [resultTrackerEmbed({ settled: 100, wins: 58, losses: 37, pushes: 5, win_rate: 61.1 })],
    });

    return res.status(200).json({
      ok: true,
      message: 'Posted summary + sample LIVE alert + result tracker',
      today: 1,
      tomorrow: 0,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
