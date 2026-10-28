import crypto from 'node:crypto';
import { americanToProb, normalizeForTools } from './_odds.js';
import { runAllTools } from './best-bets.js';
import { getGames } from './games.js';
import { fetchPropsForGame, bestPlayerLean } from './props.js';
import { fetchCompleted, fetchScoreboard } from './settle.js';

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

function chainKey() { return crypto.createHash('sha256').update(String(process.env.DISCORD_BOT_TOKEN || 'none')).digest('hex').slice(0, 40); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function botApi(method, path, body) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if (r.status === 429) {
      let wait = 1.5;
      try { wait = Math.min(6, Number(JSON.parse(text).retry_after) || 1.5); } catch {}
      await sleep(wait * 1000 + 100);
      continue;
    }
    throw new Error(`Discord ${r.status}: ${text.slice(0, 180)}`);
  }
  throw new Error('Discord rate limited');
}

function sbHeaders() {
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
}
function sbUrl() { return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL; }
async function sb(path, opts = {}) {
  const headers = { ...sbHeaders() };
  if (opts.prefer) headers.Prefer = opts.prefer;
  const r = await fetch(`${sbUrl()}/rest/v1/${path}`, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}
async function loadCfg(guildId) {
  if (!guildId) return {};
  try { const rows = await sb(`discord_config?guild_id=eq.${guildId}&select=config&limit=1`); return rows?.[0]?.config || {}; } catch { return {}; }
}
async function saveCfg(guildId, cfg) {
  await sb('discord_config', { method: 'POST', body: { guild_id: guildId, config: cfg, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
}
function isAdmin(it) {
  try { const p = BigInt(it.member?.permissions || 0); return (p & 0x20n) !== 0n || (p & 0x8n) !== 0n; } catch { return false; }
}
function text(content) { return { type: 4, data: { flags: 64, content } }; }
function eph(data) { return { type: 4, data: { flags: 64, ...data } }; }
async function sendChannel(channelId, payload) { return botApi('POST', `/channels/${channelId}/messages`, payload); }

function liveAlertEmbed(row, m) {
  const away = row.away_team || row.snapshot?.game?.away_team || 'Away';
  const home = row.home_team || row.snapshot?.game?.home_team || 'Home';
  return {
    title: 'LIVE GAME ALERT',
    description: `**${String(row.sport||'SPORT').toUpperCase()}** · Live\n**${away} vs. ${home}**\n**Score:** ${m.away_score??0} — ${m.home_score??0}\n**Status:** ${m.detail||'In progress'}`,
    color: 0xef4444, footer: { text: 'LIVE' },
  };
}
function resultTrackerEmbed(stats) {
  const wins = stats.wins??0, losses = stats.losses??0, denom = wins+losses;
  const rate = stats.win_rate != null ? stats.win_rate : denom ? (wins/denom)*100 : 0;
  return { title: 'Result tracker', description: `**Settled:** ${stats.settled??0}\n**Wins:** ${wins}\n**Losses:** ${losses}\n**Pushes:** ${stats.pushes??0}\n**Win rate:** ${rate.toFixed(1)}%`, color: 0x111111 };
}
function rolePanelPayload(cfg) {
  const buttons = ROLE_PANEL_KEYS.map((r) => {
    const roleId = cfg[r.key];
    return { type: 2, style: 1, label: r.label, custom_id: `role|${r.key}`, disabled: !roleId };
  });
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push({ type: 1, components: buttons.slice(i, i + 5) });
  return {
    embeds: [{ title: 'LeanLab · Role self-assign', description: 'Click a button to get the alert role for that league (or All Sports).', color: 0x38bdf8 }],
    components: rows,
  };
}
async function postRolePanel(cfg) {
  const ch = cfg.roles_panel;
  if (!ch) throw new Error('Set roles_panel channel first');
  return sendChannel(ch, rolePanelPayload(cfg));
}
function pickEmbed(p) {
  const sport = String(p.sport || 'SPORT').toUpperCase();
  const conf = p.confidence != null ? Math.round(Number(p.confidence) * 100) : null;
  const side = String(p.recommended_side || p.side || '').toUpperCase();
  const title = `${sport} · ${p.away_team || 'Away'} vs ${p.home_team || 'Home'}`;
  let desc = `**Lean:** **${side || '?'}**`;
  if (conf != null) desc += ` · ${conf}%`;
  if (p.algorithm_name) desc += `\n**Model:** ${p.algorithm_name}`;
  if (p.edge != null) desc += `\n**Edge:** ${Number(p.edge).toFixed(1)}%`;
  if (p.note) desc += `\n${p.note}`;
  const components = [];
  const gid = p.game_id || p.id || '';
  if (gid) {
    components.push({ type: 1, components: [
      { type: 2, style: 5, label: 'FanDuel', url: 'https://sportsbook.fanduel.com' },
      { type: 2, style: 5, label: 'DraftKings', url: 'https://sportsbook.draftkings.com' },
      { type: 2, style: 5, label: 'PrizePicks', url: 'https://prizepicks.com' },
    ]});
    components.push({ type: 1, components: [
      { type: 2, style: 1, label: 'Player props / stats', custom_id: `pp|open|${gid}` },
    ]});
  }
  return {
    embeds: [{ title, description: desc, color: LEAGUE_COLORS[sport] || LEAGUE_COLORS.DEFAULT, footer: { text: `game:${gid}` } }],
    components,
  };
}
function ctDayKey(d) { return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }
function addDaysCT(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function gameDayKey(iso) {
  if (!iso) return null;
  return ctDayKey(new Date(iso));
}
function resolveDayRange(daysOpt, startOff, endOff) {
  const now = new Date();
  let rangeStart, rangeEnd;
  if (daysOpt === 'today') { rangeStart = ctDayKey(now); rangeEnd = rangeStart; }
  else if (daysOpt === 'tomorrow') { rangeStart = ctDayKey(addDaysCT(now, 1)); rangeEnd = rangeStart; }
  else if (daysOpt === 'today_and_tomorrow') { rangeStart = ctDayKey(now); rangeEnd = ctDayKey(addDaysCT(now, 1)); }
  else if (daysOpt === 'next_3') { rangeStart = ctDayKey(now); rangeEnd = ctDayKey(addDaysCT(now, 2)); }
  else {
    const s = startOff != null ? Number(startOff) : 0;
    const e = endOff != null ? Number(endOff) : s;
    rangeStart = ctDayKey(addDaysCT(now, s));
    rangeEnd = ctDayKey(addDaysCT(now, e));
  }
  return { rangeStart, rangeEnd };
}
function teamsMatchLoose(a, b) {
  const aa = String(a || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const bb = String(b || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  const ap = aa.split(/\s+/).pop();
  const bp = bb.split(/\s+/).pop();
  return (ap && bb.includes(ap)) || (bp && aa.includes(bp));
}
function encId(s) { return Buffer.from(String(s || '')).toString('base64url').slice(0, 80); }
function decId(s) { try { return Buffer.from(String(s || ''), 'base64url').toString('utf8'); } catch { return ''; } }

async function clearChannelMessages(channelId) {
  let total = 0;
  for (let pass = 0; pass < 8; pass++) {
    const msgs = await botApi('GET', `/channels/${channelId}/messages?limit=100`);
    if (!msgs || !msgs.length) break;
    const bulk = msgs.filter((m) => m.id && !m.pinned).map((m) => m.id);
    if (bulk.length >= 2) {
      try {
        await botApi('POST', `/channels/${channelId}/messages/bulk-delete`, { messages: bulk.slice(0, 100) });
        total += bulk.length;
      } catch {
        for (const id of bulk) {
          try { await botApi('DELETE', `/channels/${channelId}/messages/${id}`); total += 1; } catch {}
          await sleep(200);
        }
      }
    } else {
      for (const m of msgs) {
        if (m.pinned) continue;
        try { await botApi('DELETE', `/channels/${channelId}/messages/${m.id}`); total += 1; } catch {}
        await sleep(200);
      }
    }
    await sleep(400);
  }
  return total;
}

async function alreadyPosted(gameId, channelId, side) {
  try {
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const rows = await sb(`discord_posts?game_id=eq.${encodeURIComponent(gameId)}&channel_id=eq.${channelId}&created_at=gte.${since}&select=id&limit=1`);
    return Boolean(rows?.length);
  } catch { return false; }
}

async function sendPickTracked(channel, p, guildId, opts = {}) {
  const gid = p.game_id || p.id;
  if (!gid || !channel) return false;
  if ((opts.known && opts.known.has(gid)) || await alreadyPosted(gid, channel)) return false;
  const payload = pickEmbed(p);
  let msg;
  try { msg = await sendChannel(channel, payload); } catch (e) { console.error('sendPick', e.message); return false; }
  if (!msg?.id) return false;
  if (opts.known) opts.known.add(gid);
  try {
    await sb('discord_posts', {
      method: 'POST',
      body: {
        guild_id: guildId || GUILD(),
        channel_id: channel,
        message_id: msg.id,
        game_id: gid,
        sport: p.sport,
        home_team: p.home_team,
        away_team: p.away_team,
        status: 'pending',
        snapshot: { recommended_side: p.recommended_side || p.side, confidence: p.confidence, algorithm_name: p.algorithm_name, props: p.props || [], top_plays: p.top_plays || [] },
      },
      prefer: 'return=minimal',
    });
  } catch {}
  return true;
}

async function settlePostedPicks() {
  let pending;
  try {
    pending = await sb(`discord_posts?status=in.(pending,live)&select=*&order=created_at.asc&limit=150`);
  } catch { return { checked: 0, settled: 0, live_alerts: 0 }; }
  if (!pending?.length) return { checked: 0, settled: 0, live_alerts: 0 };

  const sports = [...new Set(pending.map((r) => String(r.sport || 'NFL').toUpperCase()))];
  const board = [];
  for (const s of sports) {
    try { board.push(...(await fetchScoreboard(s))); } catch {}
  }

  const guildIds = [...new Set(pending.map((r) => r.guild_id).filter(Boolean))];
  const cfgByGuild = {};
  for (const gid of guildIds) {
    try { cfgByGuild[gid] = await loadCfg(gid); } catch { cfgByGuild[gid] = {}; }
  }
  const defaultGuild = GUILD();
  if (defaultGuild && !cfgByGuild[defaultGuild]) {
    try { cfgByGuild[defaultGuild] = await loadCfg(defaultGuild); } catch { cfgByGuild[defaultGuild] = {}; }
  }

  let settled = 0, liveAlerts = 0, trackerPosts = 0, statsPosts = 0;

  for (const row of pending) {
    const match = board.find((f) =>
      String(f.sport).toUpperCase() === String(row.sport).toUpperCase() &&
      teamsMatchLoose(f.home_team, row.home_team) && teamsMatchLoose(f.away_team, row.away_team)
    );
    if (!match) continue;

    const cfg = cfgByGuild[row.guild_id] || cfgByGuild[defaultGuild] || {};
    const side = String(row.snapshot?.recommended_side || '').toLowerCase();
    const sportU = String(row.sport || '').toUpperCase();

    if (match.state === 'live' && row.status === 'pending') {
      if (row.channel_id && row.message_id) {
        try {
          await botApi('PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, {
            embeds: [{
              title: `${sportU} · LIVE`,
              description: `**${row.away_team} vs ${row.home_team}**\n**Score:** ${match.away_score} — ${match.home_score}\n**Status:** ${match.detail || 'In progress'}\n**Lean:** **${(side || '?').toUpperCase()}**`,
              color: 0xef4444,
              footer: { text: 'LIVE' },
            }],
          });
        } catch {}
      }
      if (cfg.alerts) {
        try {
          const roleId = cfg.alert_role || cfg[`role_${sportU}`] || cfg.role_ALL;
          await sendChannel(cfg.alerts, {
            content: roleId ? `<@&${roleId}>` : undefined,
            embeds: [liveAlertEmbed(row, match)],
            allowed_mentions: roleId ? { roles: [roleId] } : { parse: [] },
          });
          liveAlerts += 1;
        } catch {}
      }
      try {
        await sb(`discord_posts?id=eq.${row.id}`, {
          method: 'PATCH',
          body: { status: 'live' },
          prefer: 'return=minimal',
        });
      } catch {}
      continue;
    }

    if (match.state === 'live' && row.status === 'live' && row.channel_id && row.message_id) {
      try {
        await botApi('PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, {
          embeds: [{
            title: `${sportU} · LIVE`,
            description: `**${row.away_team} vs ${row.home_team}**\n**Score:** ${match.away_score} — ${match.home_score}\n**Status:** ${match.detail || 'In progress'}\n**Lean:** **${(side || '?').toUpperCase()}**`,
            color: 0xef4444,
            footer: { text: 'LIVE' },
          }],
        });
      } catch {}
      continue;
    }

    if (match.state !== 'final') continue;

    let hit = null;
    if (side === 'home' || side === 'away') {
      if (match.home_score === match.away_score) hit = 'push';
      else {
        const homeWon = match.home_score > match.away_score;
        hit = (side === 'home' && homeWon) || (side === 'away' && !homeWon) ? 'hit' : 'miss';
      }
    }
    const resultText =
      `**FINAL:** ${match.away_team} ${match.away_score} — ${match.home_score} ${match.home_team}` +
      (hit
        ? `\n**Bet result:** ${hit === 'hit' ? '✅ HIT' : hit === 'push' ? '➖ PUSH' : '❌ MISS'} (lean was **${side.toUpperCase()}**)`
        : '');

    if (row.channel_id && row.message_id) {
      try {
        await botApi('PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, {
          embeds: [{
            title: `${sportU} · COMPLETE`,
            description: `**${row.away_team} vs ${row.home_team}**\n${resultText}`,
            color: hit === 'hit' ? 0x22c55e : hit === 'miss' ? 0xef4444 : 0x6b7280,
            footer: { text: 'FINAL' },
          }],
          components: [],
        });
      } catch {}
    }

    if (cfg.tracker) {
      try {
        await sendChannel(cfg.tracker, {
          embeds: [{
            title: `${sportU} · Result`,
            description: `**${row.away_team} vs ${row.home_team}**\n${resultText}`,
            color: hit === 'hit' ? 0x22c55e : hit === 'miss' ? 0xef4444 : 0x6b7280,
          }],
        });
        trackerPosts += 1;
      } catch {}
    }

    if (cfg.stats) {
      try {
        const conf = row.snapshot?.confidence != null ? Math.round(Number(row.snapshot.confidence) * 100) : null;
        const algo = row.snapshot?.algorithm_name || 'LeanLab';
        await sendChannel(cfg.stats, {
          embeds: [{
            title: `${sportU} · Stat breakdown`,
            description: [
              `**${row.away_team} vs ${row.home_team}**`,
              `**Final:** ${match.away_score} — ${match.home_score}`,
              `**Lean:** **${(side || '?').toUpperCase()}**${conf != null ? ` · ${conf}%` : ''}`,
              `**Model:** ${algo}`,
              hit ? `**Outcome:** ${hit === 'hit' ? 'HIT ✅' : hit === 'push' ? 'PUSH' : 'MISS ❌'}` : null,
            ].filter(Boolean).join('\n'),
            color: 0x38bdf8,
          }],
        });
        statsPosts += 1;
      } catch {}
    }

    try {
      await sb(`discord_posts?id=eq.${row.id}`, {
        method: 'PATCH',
        body: { status: 'final', result: { home_score: match.home_score, away_score: match.away_score, hit } },
        prefer: 'return=minimal',
      });
    } catch {}
    settled += 1;
  }

  return { checked: pending.length, settled, live_alerts: liveAlerts, tracker: trackerPosts, stats: statsPosts };
}
