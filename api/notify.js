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
  const g = row.snapshot?.game || {};
  return {
    title: 'LIVE GAME ALERT',
    description: `**${String(row.sport||'SPORT').toUpperCase()}** · Live\n**${g.away_team||'Away'} vs. ${g.home_team||'Home'}**\n**Score:** ${m.away_score??0} — ${m.home_score??0}\n**Status:** ${m.detail||'In progress'}`,
    color: 0xef4444, footer: { text: 'LIVE' },
  };
}
function resultTrackerEmbed(stats) {
  const wins = stats.wins??0, losses = stats.losses??0, denom = wins+losses;
  const rate = stats.win_rate != null ? stats.win_rate : denom ? (wins/denom)*100 : 0;
  return { title: 'Result tracker', description: `**Settled:** ${stats.settled??0}\n**Wins:** ${wins}\n**Losses:** ${losses}\n**Pushes:** ${stats.pushes??0}\n**Win rate:** ${rate.toFixed(1)}%`, color: 0x111111 };
}
function rolePanelPayload(cfg) {
  const lines = ['**Pick your alert roles**', 'Tap a button to get or remove that role.', ''];
  for (const r of ROLE_PANEL_KEYS) lines.push(`**${r.label}** ${cfg[r.key] ? `<@&${cfg[r.key]}>` : '_(set with /setroles)_'}`);
  const rows = [];
  for (let i = 0; i < ROLE_PANEL_KEYS.length; i += 5) {
    rows.push({ type: 1, components: ROLE_PANEL_KEYS.slice(i,i+5).map((r) => ({ type: 2, style: 2, label: r.label.slice(0,80), custom_id: `role|${r.key}` })) });
  }
  return { embeds: [{ title: 'HelpBet alert roles', description: lines.join('\n'), color: 0x38bdf8 }], components: rows };
}
async function postRolePanel(cfg) {
  if (!cfg.roles_panel) throw new Error('Set role panel channel first');
  return sendChannel(cfg.roles_panel, rolePanelPayload(cfg));
}
async function clearChannelMessages(channelId) {
  let deleted = 0;
  for (let pass = 0; pass < 5; pass++) {
    const list = await botApi('GET', `/channels/${channelId}/messages?limit=100`);
    if (!Array.isArray(list) || !list.length) break;
    const bulk = list.filter((m) => Date.now() - new Date(m.timestamp).getTime() < 13.9*24*3600e3).map((m) => m.id);
    if (bulk.length >= 2) { await botApi('POST', `/channels/${channelId}/messages/bulk-delete`, { messages: bulk }); deleted += bulk.length; }
    else if (bulk.length === 1) { await botApi('DELETE', `/channels/${channelId}/messages/${bulk[0]}`); deleted += 1; }
    if (list.length < 100) break;
    await sleep(400);
  }
  return deleted;
}
function cfgPanel(cfg, selected) {
  const val = (it) => { const v = cfg[it.key]; return v ? (it.kind === 'role' ? `<@&${v}>` : `<#${v}>`) : '_not set_'; };
  const item = selected ? CFG_ITEMS.find((x) => x.key === selected) : null;
  return {
    embeds: [{ title: 'HelpBet admin', description: CFG_ITEMS.map((it) => `**${it.label}:** ${val(it)}`).join('\n').slice(0,4000), color: 0x38bdf8 }],
    components: [
      { type: 1, components: [{ type: 3, custom_id: 'cfg|pick', placeholder: 'Choose a setting', options: CFG_ITEMS.slice(0,25).map((it) => ({ label: it.label.slice(0,100), value: it.key })) }] },
      ...(item ? [{ type: 1, components: [item.kind === 'role' ? { type: 6, custom_id: `cfg|role|${item.key}`, placeholder: item.label } : { type: 8, custom_id: `cfg|ch|${item.key}`, channel_types: [0,5], placeholder: item.label }] }] : []),
      { type: 1, components: [...(item ? [{ type: 2, style: 4, label: 'Clear', custom_id: `cfg|clear|${item.key}` }] : []), { type: 2, style: 3, label: 'Post role panel', custom_id: 'cfg|rolespanel' }] },
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
  } catch { return false; }
}
function verifyPassword(password, salt, hash) {
  try {
    const h = crypto.scryptSync(String(password), salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
  } catch { return false; }
}
function ctDayKey(d) { return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }
function addDaysCT(base, n) { return new Date(base.getTime() + n * 86400000); }
function pickEmbed(p) {
  const sport = String(p.sport || 'SPORT').toUpperCase();
  const side = p.recommended_side || p.side || '?';
  const conf = p.confidence != null ? Math.round(Number(p.confidence) * 100) : null;
  const when = p.start_time ? new Date(p.start_time).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'TBD';
  const fd = p.links?.fanduel || 'https://sportsbook.fanduel.com';
  const dk = p.links?.draftkings || 'https://sportsbook.draftkings.com';
  const pp = p.links?.prizepicks || 'https://prizepicks.com';
  return {
    embeds: [{ title: `${sport} · Best pick`, description: `**${p.away_team||'Away'} vs ${p.home_team||'Home'}**\n**When:** ${when}\n**Lean:** **${String(side).toUpperCase()}**${conf!=null?` · ${conf}%`:''}\n${p.reasoning?`**Why:** ${String(p.reasoning).slice(0,280)}`:''}`, color: LEAGUE_COLORS[sport]||LEAGUE_COLORS.DEFAULT }],
    components: [{ type: 1, components: [
      { type: 2, style: 5, label: 'FanDuel', url: String(fd).slice(0,512) },
      { type: 2, style: 5, label: 'DraftKings', url: String(dk).slice(0,512) },
      { type: 2, style: 5, label: 'PrizePicks', url: String(pp).slice(0,512) },
    ]}],
  };
}
function pickDayKey(p) {
  const iso = p.start_time || p.commence_time;
  if (!iso) return null;
  return ctDayKey(new Date(iso));
}
async function fetchPicksForSend(league, startOff, endOff, dateList) {
  const base = process.env.APP_URL || 'https://helpbet.vercel.app';
  const r = await fetch(`${base}/api/best-bets?min_confidence=0.45&limit=120`);
  const data = await r.json().catch(() => ({}));
  let picks = Array.isArray(data.picks) ? data.picks : [];
  if (league && league !== 'ALL') picks = picks.filter((p) => String(p.sport||'').toUpperCase() === league);
  const now = new Date();
  const cutoff = Date.now() - 2 * 3600e3;
  let allowed = null;
  let rangeStart = null, rangeEnd = null;
  if (Array.isArray(dateList) && dateList.length) {
    allowed = new Set(dateList.map((d) => String(d).trim()).filter(Boolean));
  } else {
    rangeStart = ctDayKey(addDaysCT(now, startOff));
    rangeEnd = ctDayKey(addDaysCT(now, endOff));
  }
  return picks.filter((p) => {
    const k = pickDayKey(p);
    if (!k) return false;
    if (allowed) return allowed.has(k);
    if (k < rangeStart || k > rangeEnd) return false;
    if (k === ctDayKey(now) && p.start_time && new Date(p.start_time).getTime() < cutoff && !p.live) return false;
    return true;
  });
}
async function runSendCommand(it, guildId, opt) {
  const league = String(opt('league') || 'ALL').toUpperCase();
  const daysChoice = String(opt('days') || 'today_and_tomorrow');
  let startOff = Number(opt('start_day'));
  let endOff = Number(opt('end_day'));
  if (Number.isNaN(startOff) || opt('start_day') == null) {
    if (daysChoice === 'today') { startOff = 0; endOff = 0; }
    else if (daysChoice === 'tomorrow') { startOff = 1; endOff = 1; }
    else if (daysChoice === 'next_3') { startOff = 0; endOff = 2; }
    else { startOff = 0; endOff = 1; }
  }
  if (Number.isNaN(endOff) || opt('end_day') == null) endOff = startOff;
  if (endOff < startOff) endOff = startOff;
  startOff = Math.max(-7, Math.min(30, startOff));
  endOff = Math.max(startOff, Math.min(30, endOff));
  const cfg = await loadCfg(guildId);
  const picks = await fetchPicksForSend(league, startOff, endOff, null);
  const follow = async (content) => { await botApi('POST', `/webhooks/${it.application_id}/${it.token}/messages/@original`, { content }); };
  if (!picks.length) { await follow(`No picks for **${league}** days ${startOff}→${endOff} (0=today CT).`); return; }
  const byLeague = {};
  for (const p of picks) { const s = String(p.sport||'OTHER').toUpperCase(); (byLeague[s] ||= []).push(p); }
  const leagues = league === 'ALL' ? Object.keys(byLeague).sort() : [league];
  let sent = 0;
  for (const L of leagues) {
    const list = byLeague[L] || [];
    if (!list.length) continue;
    const channel = opt('channel') || cfg[`ch_${L}`] || cfg.alerts;
    if (!channel) { await follow(`Skip **${L}**: set channel in /config`); continue; }
    await sendChannel(channel, { embeds: [{ title: `═══ ${L} ═══`, description: `**${list.length}** pick(s) · days **${startOff}** to **${endOff}**`, color: LEAGUE_COLORS[L]||LEAGUE_COLORS.DEFAULT }] });
    await sleep(400);
    for (const p of list.slice(0, 25)) { await sendChannel(channel, pickEmbed(p)); sent += 1; await sleep(1200); }
    await sendChannel(channel, { embeds: [{ title: `End of ${L}`, description: `All **${L}** picks for this range.`, color: LEAGUE_COLORS[L]||LEAGUE_COLORS.DEFAULT }] });
    await sleep(500);
  }
  await follow(`Done. Posted **${sent}** pick(s) for **${league}** (days ${startOff}→${endOff}).`);
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
      if (has) { await botApi('DELETE', `/guilds/${guildId}/members/${uid}/roles/${roleId}`); return res.status(200).json(text(`Removed **${ROLE_PANEL_KEYS.find((r)=>r.key===roleKey)?.label||roleKey}**.`)); }
      await botApi('PUT', `/guilds/${guildId}/members/${uid}/roles/${roleId}`);
      return res.status(200).json(text(`Added **${ROLE_PANEL_KEYS.find((r)=>r.key===roleKey)?.label||roleKey}**.`));
    } catch (e) { return res.status(200).json(text(`Role failed: ${e.message}`)); }
  }
  if (it.type === 3 && String(it.data?.custom_id || '').startsWith('cfg|')) {
    if (!isAdmin(it)) return res.status(200).json(text('Admin only.'));
    const parts = String(it.data.custom_id).split('|');
    const act = parts[1], key = parts[2];
    const cfg = await loadCfg(guildId);
    let selected = null;
    if (act === 'pick') selected = it.data.values?.[0];
    else if (act === 'ch' || act === 'role') { cfg[key] = it.data.values[0]; await saveCfg(guildId, cfg); selected = key; if (key === 'roles_panel') { try { await postRolePanel(cfg); } catch {} } }
    else if (act === 'clear') { delete cfg[key]; await saveCfg(guildId, cfg); }
    else if (act === 'rolespanel') { try { await postRolePanel(cfg); return res.status(200).json(text('Role panel posted.')); } catch (e) { return res.status(200).json(text(e.message)); } }
    return res.status(200).json({ type: 7, data: cfgPanel(cfg, selected) });
  }
  if (it.type !== 2) return res.status(200).json(text('Unsupported.'));

  if (name === 'config') { if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.')); return res.status(200).json(eph(cfgPanel(await loadCfg(guildId), null))); }
  if (name === 'setroles') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const map = { nfl: 'role_NFL', ncaaf: 'role_NCAAF', ncaab: 'role_NCAAB', nba: 'role_NBA', nhl: 'role_NHL', all: 'role_ALL', panel: 'roles_panel' };
    for (const [k, ck] of Object.entries(map)) { const v = opt(k); if (v) cfg[ck] = v; }
    await saveCfg(guildId, cfg);
    let extra = '';
    if (cfg.roles_panel) { try { await postRolePanel(cfg); extra = ` Panel → <#${cfg.roles_panel}>`; } catch (e) { extra = ` Panel: ${e.message}`; } }
    return res.status(200).json(text('Roles saved.' + extra));
  }
  if (name === 'resetchannel') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const channel = opt('channel');
    if (!channel) return res.status(200).json(text('Pick a channel.'));
    try { const n = await clearChannelMessages(channel); return res.status(200).json(text(`Cleared ~**${n}** messages in <#${channel}>.`)); }
    catch (e) { return res.status(200).json(text(`Failed: ${e.message}`)); }
  }
  if (name === 'wipeallchannel') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    res.status(200).json({ type: 5 });
    try {
      const cfg = await loadCfg(guildId);
      const ids = new Set();
      for (const [k, v] of Object.entries(cfg || {})) {
        if (!v) continue;
        if (k.startsWith('ch_') || k === 'alerts' || k === 'tracker' || k === 'stats' || k === 'roles_panel') ids.add(String(v));
      }
      if (!ids.size) {
        await botApi('POST', `/webhooks/${it.application_id}/${it.token}/messages/@original`, { content: 'No channels in /config to wipe.' });
        return;
      }
      let total = 0;
      const lines = [];
      for (const id of ids) {
        try {
          const nDel = await clearChannelMessages(id);
          total += nDel;
          lines.push(`<#${id}> ~${nDel}`);
        } catch (e) {
          lines.push(`<#${id}> fail: ${e.message}`);
        }
        await sleep(500);
      }
      await botApi('POST', `/webhooks/${it.application_id}/${it.token}/messages/@original`, {
        content: `Wiped **${ids.size}** configured channel(s) · ~**${total}** messages.\n${lines.join('\n')}`.slice(0, 1900),
      });
    } catch (e) {
      try { await botApi('POST', `/webhooks/${it.application_id}/${it.token}/messages/@original`, { content: `Wipe failed: ${e.message||e}` }); } catch {}
    }
    return;
  }
  if (name === 'testalert') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const channel = opt('channel') || cfg.alerts;
    if (!channel) return res.status(200).json(text('No alert channel.'));
    const roleId = cfg.role_NFL || cfg.alert_role;
    await sendChannel(channel, { content: roleId ? `<@&${roleId}>` : undefined, embeds: [liveAlertEmbed({ sport: 'NFL', snapshot: { game: { away_team: 'Team A', home_team: 'Team B' } } }, { away_score: 17, home_score: 14, detail: 'Q3 · 08:42' })], allowed_mentions: roleId ? { roles: [roleId] } : { parse: [] } });
    return res.status(200).json(text(`Test LIVE alert → <#${channel}>`));
  }
  if (name === 'testresult') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const channel = opt('channel') || cfg.tracker;
    if (!channel) return res.status(200).json(text('No tracker channel.'));
    await sendChannel(channel, { embeds: [resultTrackerEmbed({ settled: 100, wins: 58, losses: 37, pushes: 5, win_rate: 61.1 })] });
    return res.status(200).json(text(`Test result tracker → <#${channel}>`));
  }
  if (name === 'teststat') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const channel = opt('channel') || cfg.stats;
    if (!channel) return res.status(200).json(text('No stats channel.'));
    await sendChannel(channel, { embeds: [{ title: 'Stat breakdown · NFL Team A vs Team B', description: 'Demo', color: 0x38bdf8 }] });
    return res.status(200).json(text(`Test stat → <#${channel}>`));
  }
  if (name === 'post') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const league = String(opt('league') || '').toUpperCase();
    const cfg = await loadCfg(guildId);
    const channel = opt('channel') || cfg[`ch_${league}`];
    if (!channel) return res.status(200).json(text(`Set ${league} channel in /config`));
    await sendChannel(channel, { embeds: [{ title: `${league} slate`, description: `Use **/send** for full picks.`, color: LEAGUE_COLORS[league]||LEAGUE_COLORS.DEFAULT }] });
    return res.status(200).json(text(`Posted note in <#${channel}>.`));
  }
  if (name === 'send') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    res.status(200).json({ type: 5 });
    try { await runSendCommand(it, guildId, opt); } catch (e) {
      try { await botApi('POST', `/webhooks/${it.application_id}/${it.token}/messages/@original`, { content: `Send failed: ${e.message||e}` }); } catch {}
    }
    return;
  }
  if (name === 'login') {
    const username = String(opt('username')||'').trim().toLowerCase().replace(/[^a-z0-9_\-.]/g,'').slice(0,32);
    const password = String(opt('password')||'');
    if (!username || username.length < 3) return res.status(200).json(text('Username at least 3 characters.'));
    if (!password || password.length < 4) return res.status(200).json(text('Password at least 4 characters.'));
    try {
      const rows = await sb(`hb_users?username=eq.${encodeURIComponent(username)}&select=username,password_hash,salt`);
      if (!rows?.[0] || !verifyPassword(password, rows[0].salt, rows[0].password_hash)) return res.status(200).json(text('Wrong username or password.'));
      const discordId = String(it.member?.user?.id || it.user?.id || '');
      await sb('discord_links', { method: 'POST', body: { discord_user_id: discordId, username, linked_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
      let prevCfg = {};
      try { const us = await sb(`user_settings?username=eq.${encodeURIComponent(username)}&select=notify_config,discord_webhook`); if (us?.[0]?.notify_config) prevCfg = us[0].notify_config || {}; } catch {}
      let botCfg = {};
      try { botCfg = await loadCfg(guildId); } catch {}
      const merged = {
        ...prevCfg,
        linked_discord_user_id: discordId,
        linked_guild_id: guildId,
        discord_channels: botCfg,
        delivery: Object.keys(botCfg || {}).length ? 'bot_channels' : (prevCfg.delivery || 'webhook'),
      };
      try {
        await sb('user_settings', { method: 'POST', body: { username, notify_config: merged, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
      } catch {}
      const chCount = Object.keys(botCfg || {}).filter((k) => k.startsWith('ch_') || k === 'alerts').length;
      const roleCount = Object.keys(botCfg || {}).filter((k) => k.startsWith('role_')).length;
      return res.status(200).json(text(`Linked **${username}** · ${chCount} channel(s) · ${roleCount} role(s) from /config will show on the website Setup tab.`));
    } catch (e) { return res.status(200).json(text(`Login failed: ${e.message}`)); }
  }
  if (name === 'logout') {
    const discordId = String(it.member?.user?.id || it.user?.id || '');
    try { await fetch(`${sbUrl()}/rest/v1/discord_links?discord_user_id=eq.${discordId}`, { method: 'DELETE', headers: sbHeaders() }); return res.status(200).json(text('Unlinked.')); }
    catch (e) { return res.status(200).json(text(`Logout failed: ${e.message}`)); }
  }
  if (name === 'mybets') {
    const discordId = String(it.member?.user?.id || it.user?.id || '');
    try {
      const links = await sb(`discord_links?discord_user_id=eq.${discordId}&select=username&limit=1`);
      const username = links?.[0]?.username;
      if (!username) return res.status(200).json(text('Not linked. Use /login first.'));
      const bets = await sb(`bets?username=eq.${encodeURIComponent(username)}&select=sport,home_team,away_team,recommended_side,status&order=placed_at.desc&limit=10`);
      if (!bets?.length) return res.status(200).json(text(`**${username}**: no bets yet.`));
      return res.status(200).json(text(`**${username}**\n` + bets.map((b)=>`• **${b.sport}** ${b.away_team}@${b.home_team} → ${b.recommended_side} (${b.status})`).join('\n')));
    } catch (e) { return res.status(200).json(text(`mybets failed: ${e.message}`)); }
  }
  if (name === 'run') return res.status(200).json(text('/run — use the website Games tab.'));
  return res.status(200).json(text('Unknown command.'));
}

async function handleInteraction(req, res, raw) {
  if (!(await verifyDiscord(raw, req.headers['x-signature-ed25519'], req.headers['x-signature-timestamp']))) return res.status(401).send('invalid request signature');
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
  const r = await fetch(webhook.includes('?') ? webhook + '&wait=true' : webhook + '?wait=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'HelpBet', allowed_mentions: { parse: [] }, ...payload }) });
  if (!r.ok) throw new Error(`Webhook ${r.status}: ${(await r.text()).slice(0,120)}`);
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
    if (route === 'tick' || route === 'finalize') return res.status(200).json({ ok: true, note: 'tick compact' });
    if (route === 'register') return res.status(200).json({ ok: true, note: 'Use /api/cron?route=bot-register' });
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    const username = body.username || null;
    let userRow = null;
    if (username) {
      try {
        const rows = await sb(`user_settings?username=eq.${encodeURIComponent(username)}&select=*`);
        userRow = rows?.[0] || null;
      } catch {}
    }
    const cfg = userRow?.notify_config || {};
    const guildId = cfg.linked_guild_id || GUILD();
    let botCfg = cfg.discord_channels || {};
    if ((!botCfg || !Object.keys(botCfg).length) && guildId) {
      try { botCfg = await loadCfg(guildId); } catch { botCfg = {}; }
    }

    if (botCfg && Object.keys(botCfg).length) {
      const dates = Array.isArray(body.dates) ? body.dates.map((d) => String(d).trim()).filter(Boolean) : [];
      let picks = await fetchPicksForSend('ALL', 0, dates.length ? 0 : 1, dates.length ? dates : null);
      const leagueFilter = Array.isArray(body.leagues) && body.leagues.length ? body.leagues.map((x) => String(x).toUpperCase()) : null;
      if (leagueFilter) picks = picks.filter((p) => leagueFilter.includes(String(p.sport || '').toUpperCase()));
      const byDate = {};
      for (const p of picks) {
        const k = pickDayKey(p) || 'unknown';
        (byDate[k] ||= []).push(p);
      }
      if (dates.length) {
        for (const k of Object.keys(byDate)) {
          if (!dates.includes(k)) delete byDate[k];
        }
      }
      const finalDates = Object.keys(byDate).sort();
      let sent = 0;
      const posted = [];
      const perDay = {};
      for (const day of finalDates) {
        const dayPicks = byDate[day] || [];
        const byLeague = {};
        for (const p of dayPicks) {
          const s = String(p.sport || 'OTHER').toUpperCase();
          (byLeague[s] ||= []).push(p);
        }
        const leagueSummary = Object.keys(byLeague).sort().map((L) => `${L} ${byLeague[L].length}`).join(' · ');
        perDay[day] = { total: dayPicks.length, by_league: Object.fromEntries(Object.keys(byLeague).map((L) => [L, byLeague[L].length])) };
        const bannerChannel = botCfg.alerts || botCfg[`ch_${Object.keys(byLeague)[0]}`];
        if (bannerChannel) {
          await sendChannel(bannerChannel, {
            embeds: [{ title: `═══ ${day} ═══`, description: `**${dayPicks.length}** pick(s)\n${leagueSummary}`, color: 0x38bdf8 }],
          });
          await sleep(400);
        }
        for (const L of Object.keys(byLeague).sort()) {
          const list = byLeague[L] || [];
          if (!list.length) continue;
          const channel = botCfg[`ch_${L}`] || botCfg.alerts;
          if (!channel) continue;
          const roleId = botCfg[`role_${L}`] || botCfg.role_ALL || botCfg.alert_role;
          await sendChannel(channel, {
            content: roleId ? `<@&${roleId}> · **${L}** · ${day}` : `**${L}** · ${day}`,
            embeds: [{ title: `═══ ${L} · ${day} ═══`, description: `**${list.length}** pick(s)`, color: LEAGUE_COLORS[L] || LEAGUE_COLORS.DEFAULT }],
            allowed_mentions: roleId ? { roles: [roleId] } : { parse: [] },
          });
          await sleep(400);
          for (const p of list.slice(0, 20)) {
            await sendChannel(channel, pickEmbed(p));
            sent += 1;
            await sleep(1100);
          }
          if (!posted.includes(L)) posted.push(L);
          await sleep(400);
        }
      }
      if (!sent) {
        return res.status(200).json({ ok: true, message: dates.length ? `No picks on selected day(s): ${dates.join(', ')}` : 'No picks matched. Set league channels in /config.', dates, per_day: perDay, channels_used: posted });
      }
      return res.status(200).json({ ok: true, message: `Posted ${sent} pick(s) for ${finalDates.join(', ')} → ${posted.join(', ')}`, sent, leagues: posted, dates: finalDates, per_day: perDay });
    }

    let webhook = body.webhook_url || userRow?.discord_webhook || cfg.default_webhook || process.env.DISCORD_WEBHOOK_URL;
    if (!webhook || !String(webhook).includes('discord.com')) {
      return res.status(400).json({ error: 'No Discord channels linked. Run /config + /login in Discord, or paste a webhook in Setup.' });
    }
    await postWebhook(webhook, { embeds: [{ title: 'HelpBet · Best bets', description: 'Open https://helpbet.vercel.app for full cards. Link Discord with /login to post into your /config channels.', color: 0x38bdf8 }] });
    return res.status(200).json({ ok: true, message: 'Posted summary to webhook (link Discord with /login for channel + role delivery)' });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
