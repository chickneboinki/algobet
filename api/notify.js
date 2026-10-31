/** LeanLab Discord bot — interactions + website send */
import crypto from 'node:crypto';
import { fetchScoreboard } from './settle.js';

const GUILD = () => process.env.DISCORD_GUILD_ID || '1363232146743099435';
const LEAGUE_KEYS = ['NFL', 'NBA', 'NCAAF', 'NCAAB', 'MLB', 'NHL'];
const LEAGUE_COLORS = { NFL: 0x013369, NBA: 0xc8102e, NCAAF: 0x7c2d12, NCAAB: 0x1d4ed8, MLB: 0x002d72, NHL: 0x111827, DEFAULT: 0x38bdf8 };
const ROLE_PANEL_KEYS = [
  { key: 'role_NFL', label: 'NFL Alerts' },
  { key: 'role_NCAAF', label: 'NCAAF Alerts' },
  { key: 'role_NCAAB', label: 'NCAAB Alerts' },
  { key: 'role_NBA', label: 'NBA Alerts' },
  { key: 'role_NHL', label: 'NHL Alerts' },
  { key: 'role_MLB', label: 'MLB Alerts' },
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ctDayKey(d) { return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }
function pickDayKey(p) {
  const iso = p.start_time || p.commence_time;
  if (!iso) return null;
  return ctDayKey(new Date(iso));
}

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

function teamsMatchLoose(a, b) {
  const aa = String(a || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const bb = String(b || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  const ap = aa.split(/\s+/).pop();
  const bp = bb.split(/\s+/).pop();
  return (ap && bb.includes(ap)) || (bp && aa.includes(bp));
}

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

async function alreadyPosted(gameId, channelId) {
  if (!gameId) return false;
  try {
    const rows = await sb(`discord_posts?game_id=eq.${encodeURIComponent(gameId)}&channel_id=eq.${channelId}&created_at=gt.${new Date(Date.now() - 20 * 3600e3).toISOString()}&select=id&limit=1`);
    return Boolean(rows?.length);
  } catch { return false; }
}

function simplePickEmbed(p) {
  const sport = String(p.sport || '').toUpperCase();
  const side = String(p.recommended_side || p.side || '').toLowerCase();
  const lean = side === 'home' ? p.home_team : side === 'away' ? p.away_team : (side || '?');
  const conf = p.confidence != null ? `${Math.round(Number(p.confidence) * 100)}%` : '—';
  const when = p.start_time || p.commence_time
    ? new Date(p.start_time || p.commence_time).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'TBD';
  const algo = p.algorithm_name || p.algo || 'LeanLab';
  const desc = [
    `**${p.away_team} @ ${p.home_team}**`,
    `**Lean:** ${lean}`,
    `**Confidence:** ${conf}`,
    `**Kickoff (CT):** ${when}`,
    `**Model:** ${algo}`,
  ].join('\n');
  return {
    embeds: [{
      title: `${sport} · Best pick`,
      description: desc,
      color: LEAGUE_COLORS[sport] || LEAGUE_COLORS.DEFAULT,
      footer: { text: `game:${p.game_id || ''}` },
    }],
  };
}

async function sendPickTracked(channel, p, guildId) {
  if (await alreadyPosted(p.game_id, channel)) return false;
  const payload = simplePickEmbed(p);
  const msg = await sendChannel(channel, payload);
  try {
    await sb('discord_posts', {
      method: 'POST',
      body: {
        id: crypto.randomUUID(),
        message_id: msg?.id || null,
        channel_id: channel,
        guild_id: guildId || null,
        game_id: p.game_id || null,
        sport: String(p.sport || '').toUpperCase(),
        home_team: p.home_team,
        away_team: p.away_team,
        start_time: p.start_time || null,
        snapshot: { recommended_side: p.recommended_side || p.side, confidence: p.confidence, algorithm_name: p.algorithm_name },
        status: 'pending',
      },
      prefer: 'return=minimal',
    });
  } catch {}
  return true;
}

async function fetchPicksForSend(dateList) {
  const base = process.env.APP_URL || 'https://helpbet.vercel.app';
  const allowed = Array.isArray(dateList) && dateList.length
    ? new Set(dateList.map((d) => String(d).trim()).filter(Boolean))
    : null;
  const inRange = (p) => {
    const k = pickDayKey(p);
    if (!k) return false;
    if (allowed) return allowed.has(k);
    const today = ctDayKey(new Date());
    const tomorrow = ctDayKey(new Date(Date.now() + 86400000));
    return k === today || k === tomorrow;
  };
  const r = await fetch(`${base}/api/best-bets?min_confidence=0.30&limit=300`);
  const data = await r.json().catch(() => ({}));
  let picks = (Array.isArray(data.picks) ? data.picks : []).filter(inRange);
  try {
    const dateQ = allowed ? [...allowed].join(',') : '';
    const gUrl = dateQ
      ? `${base}/api/games?sport=ALL&dates=${encodeURIComponent(dateQ)}`
      : `${base}/api/games?sport=ALL`;
    const gr = await fetch(gUrl);
    const gd = await gr.json().catch(() => ({}));
    const games = Array.isArray(gd.games) ? gd.games : [];
    const seen = new Set(picks.map((p) => `${String(p.sport || '').toUpperCase()}|${p.home_team}|${p.away_team}`));
    for (const g of games) {
      if (!inRange(g)) continue;
      const sport = String(g.sport || '').toUpperCase();
      const key = `${sport}|${g.home_team}|${g.away_team}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push({
        game_id: g.id,
        sport,
        home_team: g.home_team,
        away_team: g.away_team,
        start_time: g.start_time || g.commence_time,
        recommended_side: g.recommended_side || null,
        confidence: g.confidence || null,
        algorithm_name: 'Market',
      });
    }
  } catch {}
  return picks;
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
  let settled = 0, liveAlerts = 0;
  for (const row of pending) {
    const match = board.find((f) =>
      String(f.sport).toUpperCase() === String(row.sport).toUpperCase() &&
      teamsMatchLoose(f.home_team, row.home_team) && teamsMatchLoose(f.away_team, row.away_team)
    );
    if (!match) continue;
    const side = String(row.snapshot?.recommended_side || '').toLowerCase();
    const sportU = String(row.sport || '').toUpperCase();
    const cfg = await loadCfg(row.guild_id || GUILD()).catch(() => ({}));
    if (match.state === 'live' && (row.status === 'pending' || row.status === 'live')) {
      if (row.channel_id && row.message_id) {
        try {
          await botApi('PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, {
            embeds: [{ title: `${sportU} · LIVE`, description: `**${row.away_team} vs ${row.home_team}**\n**Score:** ${match.away_score} — ${match.home_score}\n**Lean:** **${(side || '?').toUpperCase()}**`, color: 0xef4444, footer: { text: 'LIVE' } }],
          });
        } catch {}
      }
      if (row.status === 'pending' && cfg.alerts) {
        try {
          const roleId = cfg.alert_role || cfg[`role_${sportU}`] || cfg.role_ALL;
          await sendChannel(cfg.alerts, {
            content: roleId ? `<@&${roleId}>` : undefined,
            embeds: [{ title: 'LIVE GAME ALERT', description: `**${sportU}** · ${row.away_team} vs ${row.home_team}`, color: 0xef4444 }],
            allowed_mentions: roleId ? { roles: [roleId] } : { parse: [] },
          });
          liveAlerts += 1;
        } catch {}
      }
      if (row.status === 'pending') {
        try { await sb(`discord_posts?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'live' }, prefer: 'return=minimal' }); } catch {}
      }
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
    const resultText = `**FINAL:** ${match.away_team} ${match.away_score} — ${match.home_score} ${match.home_team}` +
      (hit ? `\n**Bet result:** ${hit === 'hit' ? '✅ HIT' : hit === 'push' ? '➖ PUSH' : '❌ MISS'}` : '');
    if (row.channel_id && row.message_id) {
      try {
        await botApi('PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, {
          embeds: [{ title: `${sportU} · COMPLETE`, description: `**${row.away_team} vs ${row.home_team}**\n${resultText}`, color: hit === 'hit' ? 0x22c55e : hit === 'miss' ? 0xef4444 : 0x6b7280, footer: { text: 'FINAL' } }],
          components: [],
        });
      } catch {}
    }
    if (cfg.tracker) {
      try {
        await sendChannel(cfg.tracker, { embeds: [{ title: `${sportU} · Result`, description: resultText, color: hit === 'hit' ? 0x22c55e : 0xef4444 }] });
      } catch {}
    }
    try {
      await sb(`discord_posts?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'final', result: { home_score: match.home_score, away_score: match.away_score, hit } }, prefer: 'return=minimal' });
    } catch {}
    settled += 1;
  }
  return { checked: pending.length, settled, live_alerts: liveAlerts };
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function followUp(it, content) {
  try {
    await botApi('POST', `/webhooks/${it.application_id}/${it.token}/messages/@original`, { content: String(content).slice(0, 1900) });
  } catch {
    try { await botApi('POST', `/webhooks/${it.application_id}/${it.token}`, { content: String(content).slice(0, 1900) }); } catch {}
  }
}

async function handleInteraction(req, res, raw) {
  let it;
  try { it = JSON.parse(raw || '{}'); } catch { return res.status(400).send('bad json'); }
  if (it.type === 1) return res.status(200).json({ type: 1 });
  const guildId = it.guild_id || GUILD();
  const opt = (name) => {
    const o = (it.data?.options || []).find((x) => x.name === name);
    return o?.value;
  };
  if (it.type === 3 && String(it.data?.custom_id || '').startsWith('role|')) {
    const key = String(it.data.custom_id).split('|')[1];
    const cfg = await loadCfg(guildId);
    const roleId = cfg[key];
    if (!roleId) return res.status(200).json(text('Role not configured. Use /setroles first.'));
    const memberId = it.member?.user?.id || it.user?.id;
    const has = (it.member?.roles || []).includes(roleId);
    try {
      if (has) {
        await botApi('DELETE', `/guilds/${guildId}/members/${memberId}/roles/${roleId}`);
        return res.status(200).json(text(`Removed <@&${roleId}>`));
      }
      await botApi('PUT', `/guilds/${guildId}/members/${memberId}/roles/${roleId}`);
      return res.status(200).json(text(`Added <@&${roleId}>`));
    } catch (e) {
      return res.status(200).json(text(`Role update failed: ${e.message}`));
    }
  }
  if (it.type !== 2) return res.status(200).json(text('Unsupported.'));
  const name = it.data?.name;
  if (name === 'config') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const map = {
      nfl: 'ch_NFL', nba: 'ch_NBA', ncaaf: 'ch_NCAAF', ncaab: 'ch_NCAAB', mlb: 'ch_MLB', nhl: 'ch_NHL',
      tracker: 'tracker', stats: 'stats', alerts: 'alerts', roles_panel: 'roles_panel', alert_role: 'alert_role',
    };
    const changed = [];
    for (const [optName, cfgKey] of Object.entries(map)) {
      const v = opt(optName);
      if (v != null && v !== '') { cfg[cfgKey] = String(v); changed.push(cfgKey); }
    }
    if (changed.length) await saveCfg(guildId, cfg);
    const lines = CFG_ITEMS.map((c) => {
      const v = cfg[c.key];
      return `**${c.label}:** ${v ? (c.kind === 'channel' ? `<#${v}>` : `<@&${v}>`) : '_not set_'}`;
    });
    const header = changed.length ? `Saved **${changed.length}** setting(s).\n\n` : 'No changes (pass options to set).\n\n';
    return res.status(200).json(eph({ embeds: [{ title: 'LeanLab /config', description: header + lines.join('\n'), color: 0x38bdf8 }] }));
  }
  if (name === 'wipeallchannel') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    res.status(200).json({ type: 5 });
    try {
      const cfg = await loadCfg(guildId);
      const ids = [];
      for (const [k, v] of Object.entries(cfg || {})) {
        if (!v) continue;
        if (k.startsWith('ch_') || ['alerts','tracker','stats','roles_panel'].includes(k)) {
          const id = String(v); if (!ids.includes(id)) ids.push(id);
        }
      }
      if (!ids.length) { await followUp(it, 'No channels set.'); return; }
      await followUp(it, `Wiping **${ids.length}** channel(s)…`);
      let total = 0; const lines = [];
      for (const id of ids) {
        try { const n = await clearChannelMessages(id); total += n; lines.push(`<#${id}> ~${n}`); }
        catch { lines.push(`<#${id}> fail`); }
        await sleep(300);
      }
      await followUp(it, `Done. ~**${total}** messages.\n${lines.join('\n')}`);
    } catch (e) { await followUp(it, `Wipe failed: ${e.message || e}`); }
    return;
  }
  if (name === 'resetchannel') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const channel = opt('channel');
    if (!channel) return res.status(200).json(text('Pick a channel.'));
    res.status(200).json({ type: 5 });
    try { const n = await clearChannelMessages(channel); await followUp(it, `Cleared ~**${n}** in <#${channel}>.`); }
    catch (e) { await followUp(it, `Failed: ${e.message}`); }
    return;
  }
  if (name === 'setroles') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    for (const r of ROLE_PANEL_KEYS) {
      const short = r.key.replace('role_', '').toLowerCase();
      const v = opt(short) || opt(r.key);
      if (v) cfg[r.key] = String(v);
    }
    const panel = opt('panel');
    if (panel) cfg.roles_panel = String(panel);
    await saveCfg(guildId, cfg);
    let extra = '';
    if (cfg.roles_panel) {
      try {
        const buttons = ROLE_PANEL_KEYS.map((r) => ({ type: 2, style: 1, label: r.label, custom_id: `role|${r.key}`, disabled: !cfg[r.key] }));
        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) rows.push({ type: 1, components: buttons.slice(i, i + 5) });
        await sendChannel(cfg.roles_panel, { embeds: [{ title: 'LeanLab · Role self-assign', description: 'Click for alert roles.', color: 0x38bdf8 }], components: rows });
        extra = ' Panel posted.';
      } catch (e) { extra = ` Panel error: ${e.message}`; }
    }
    return res.status(200).json(text('Roles saved.' + extra));
  }
  if (name === 'testalert' || name === 'testresult' || name === 'teststat') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const ch = opt('channel') || (name === 'testalert' ? cfg.alerts : name === 'testresult' ? cfg.tracker : cfg.stats);
    if (!ch) return res.status(200).json(text('Set channel first.'));
    await sendChannel(ch, { embeds: [{ title: 'LeanLab sample', description: 'Test message.', color: 0x38bdf8 }] });
    return res.status(200).json(text('Sample sent.'));
  }
  if (name === 'send' || name === 'post') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    res.status(200).json({ type: 5 });
    try {
      const league = String(opt('league') || 'ALL').toUpperCase();
      const cfg = await loadCfg(guildId);
      const days = opt('days') || 'today';
      let dateList = [];
      const today = ctDayKey(new Date());
      const tmr = ctDayKey(new Date(Date.now() + 86400000));
      const d2 = ctDayKey(new Date(Date.now() + 2 * 86400000));
      if (days === 'today') dateList = [today];
      else if (days === 'tomorrow') dateList = [tmr];
      else if (days === 'today_and_tomorrow') dateList = [today, tmr];
      else if (days === 'next_3') dateList = [today, tmr, d2];
      else dateList = [today, tmr];
      const startOff = opt('start_day');
      const endOff = opt('end_day');
      if (startOff != null || endOff != null) {
        const s = Number(startOff ?? 0); const e = Number(endOff ?? s);
        dateList = [];
        for (let i = s; i <= e; i++) dateList.push(ctDayKey(new Date(Date.now() + i * 86400000)));
      }
      let picks = await fetchPicksForSend(dateList);
      if (league !== 'ALL') picks = picks.filter((p) => String(p.sport || '').toUpperCase() === league);
      const override = opt('channel');
      let sent = 0;
      const byLeague = {};
      for (const p of picks) { const L = String(p.sport || '').toUpperCase(); (byLeague[L] ||= []).push(p); }
      for (const [L, list] of Object.entries(byLeague)) {
        const channel = override || cfg[`ch_${L}`];
        if (!channel) continue;
        await sendChannel(channel, { embeds: [{ title: `${L} · ${dateList.join(', ')}`, description: `Posting **${list.length}** picks`, color: LEAGUE_COLORS[L] || LEAGUE_COLORS.DEFAULT }] });
        for (const p of list) { if (await sendPickTracked(channel, p, guildId)) sent += 1; await sleep(250); }
      }
      await followUp(it, sent ? `Posted **${sent}** pick(s) for ${dateList.join(', ')}.` : `No picks for ${dateList.join(', ')}. Check /config league channels.`);
    } catch (e) { await followUp(it, `Send failed: ${e.message || e}`); }
    return;
  }
  if (name === 'login' || name === 'logout' || name === 'mybets' || name === 'run') {
    return res.status(200).json(text('Use the website: https://helpbet.vercel.app'));
  }
  return res.status(200).json(text(`Unknown: ${name}`));
}

async function handleWebsiteSend(body) {
  const username = body.username || null;
  let userRow = null;
  if (username) {
    try {
      const rows = await sb(`user_settings?username=eq.${encodeURIComponent(username)}&select=*`);
      userRow = rows?.[0] || null;
    } catch {}
  }
  const cfgUser = userRow?.notify_config || {};
  const guildId = cfgUser.linked_guild_id || GUILD();
  let botCfg = cfgUser.discord_channels || {};
  if ((!botCfg || !Object.keys(botCfg).length) && guildId) {
    try { botCfg = await loadCfg(guildId); } catch { botCfg = {}; }
  }
  if (!botCfg || !Object.keys(botCfg).length) {
    return { status: 400, body: { error: 'No Discord channels set. Run /config in Discord first (set league channels).' } };
  }
  const allDates = Array.isArray(body.dates) ? body.dates.map((d) => String(d).trim()).filter(Boolean).sort() : [];
  let picks = await fetchPicksForSend(allDates.length ? allDates : null);
  const leagueFilter = Array.isArray(body.leagues) && body.leagues.length
    ? body.leagues.map((x) => String(x).toUpperCase()) : null;
  if (leagueFilter) picks = picks.filter((p) => leagueFilter.includes(String(p.sport || '').toUpperCase()));
  const byLeague = {};
  for (const p of picks) { const L = String(p.sport || '').toUpperCase(); (byLeague[L] ||= []).push(p); }
  let sent = 0;
  const posted = [];
  const perDay = {};
  for (const p of picks) { const k = pickDayKey(p) || 'unknown'; perDay[k] = (perDay[k] || 0) + 1; }
  for (const [L, list] of Object.entries(byLeague)) {
    const channel = botCfg[`ch_${L}`];
    if (!channel) continue;
    const days = [...new Set(list.map((p) => pickDayKey(p)).filter(Boolean))].sort();
    try {
      await sendChannel(channel, {
        embeds: [{
          title: `${L} · LeanLab picks`,
          description: days.length ? `**Days:** ${days.join(', ')}\n**Picks:** ${list.length}` : `**Picks:** ${list.length}`,
          color: LEAGUE_COLORS[L] || LEAGUE_COLORS.DEFAULT,
        }],
      });
    } catch {}
    for (const p of list) {
      try {
        if (await sendPickTracked(channel, p, guildId)) {
          sent += 1;
          if (!posted.includes(L)) posted.push(L);
        }
      } catch {}
      await sleep(250);
    }
  }
  if (!sent) {
    return {
      status: 200,
      body: {
        ok: true,
        message: allDates.length
          ? `No picks found for selected day(s): ${allDates.join(', ')}. Make sure league channels are set in /config.`
          : 'No picks matched. Set league channels with /config.',
        dates: allDates, per_day: perDay, channels_used: posted,
      },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      message: `Posted ${sent} pick(s)${allDates.length ? ` for ${allDates.join(', ')}` : ''}`,
      sent, leagues: posted, dates: allDates, per_day: perDay,
    },
  };
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const url = new URL(req.url, 'http://localhost');
  const route = url.searchParams.get('route');
  try {
    const raw = await readRaw(req);
    if (route === 'interactions' || (!route && req.method === 'POST' && req.headers['x-signature-ed25519'])) {
      return await handleInteraction(req, res, raw);
    }
    if (route === 'tick' || route === 'finalize') {
      const out = await settlePostedPicks().catch((e) => ({ error: e.message || String(e) }));
      return res.status(200).json({ ok: true, ...out });
    }
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    if (req.method === 'POST') {
      const result = await handleWebsiteSend(body);
      return res.status(result.status).json(result.body);
    }
    return res.status(200).json({ ok: true, message: 'LeanLab notify online — POST with dates to send picks' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
