/** Multi-day Discord digest — always posts day header then every pick card. */
import crypto from 'node:crypto';

const LEAGUE_COLORS = { NFL: 0x013369, NCAAF: 0xe87722, NCAAB: 0x7c3aed, NBA: 0xc8102e, MLB: 0x002d72, NHL: 0x1e3a5f, DEFAULT: 0x38bdf8 };

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function chainKey() {
  return crypto.createHash('sha256').update(String(process.env.DISCORD_BOT_TOKEN || 'none')).digest('hex').slice(0, 40);
}
function ctDayKey(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}
function pickDayKey(p) {
  const iso = p.start_time || p.commence_time;
  if (!iso) return null;
  return ctDayKey(new Date(iso));
}

async function botApi(method, path, body) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if (r.status === 429) {
      let wait = 1.5;
      try { wait = Math.min(8, Number(JSON.parse(text).retry_after) || 1.5); } catch {}
      await sleep(wait * 1000 + 150);
      continue;
    }
    if (r.status >= 500 && i < 3) { await sleep(800 * (i + 1)); continue; }
    throw new Error(`Discord ${r.status}: ${text.slice(0, 160)}`);
  }
  throw new Error('Discord rate limited');
}
async function sendChannel(channelId, payload) {
  return botApi('POST', `/channels/${channelId}/messages`, payload);
}

function sbHeaders(prefer) {
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' };
}
function sbUrl() { return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL; }
async function sb(path, opts = {}) {
  const r = await fetch(`${sbUrl()}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: sbHeaders(opts.prefer),
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) return null;
  if (opts.prefer?.includes('minimal')) return null;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function loadCfg(guildId) {
  if (!guildId) return {};
  try {
    const rows = await sb(`discord_config?guild_id=eq.${guildId}&select=config&limit=1`);
    return rows?.[0]?.config || {};
  } catch { return {}; }
}
async function headerAlreadyPosted(channelId, day, league) {
  const gid = `header:${league}:${day || 'all'}`;
  try {
    const rows = await sb(`discord_posts?channel_id=eq.${channelId}&game_id=eq.${encodeURIComponent(gid)}&select=id,created_at&limit=1`);
    if (!rows?.length) return false;
    const age = Date.now() - new Date(rows[0].created_at || 0).getTime();
    return age < 3 * 3600 * 1000;
  } catch { return false; }
}
async function recordPost(channelId, guildId, gameId, sport, extra = {}) {
  try {
    await sb('discord_posts', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        id: crypto.randomUUID(),
        message_id: extra.message_id || null,
        channel_id: channelId,
        guild_id: guildId || null,
        game_id: gameId || null,
        sport: String(sport || '').toUpperCase(),
        home_team: extra.home_team || null,
        away_team: extra.away_team || null,
        start_time: extra.start_time || null,
        snapshot: extra.snapshot || {},
        status: extra.status || 'pending',
        created_at: new Date().toISOString(),
      },
    });
  } catch {}
}

function pickEmbedFast(p) {
  const sport = String(p.sport || 'SPORT').toUpperCase();
  const side = p.recommended_side || p.side || '?';
  const conf = p.confidence != null ? Math.round(Number(p.confidence) * 100) : null;
  const when = p.start_time
    ? new Date(p.start_time).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    : 'TBD';
  const fd = p.links?.fanduel || 'https://sportsbook.fanduel.com';
  const dk = p.links?.draftkings || 'https://sportsbook.draftkings.com';
  const pp = p.links?.prizepicks || 'https://prizepicks.com';
  const desc = [
    `**${p.away_team || 'Away'} vs ${p.home_team || 'Home'}**`,
    `**When:** ${when}`,
    `**Lean:** **${String(side).toUpperCase()}**${conf != null ? ` · ${conf}%` : ''}`,
    p.algorithm_name ? `**Tool:** ${p.algorithm_name}` : null,
    p.reasoning ? `**Why:** ${String(p.reasoning).slice(0, 240)}` : null,
  ].filter(Boolean).join('\n');
  const gid = `${sport}:${p.game_id || ''}`;
  return {
    embeds: [{
      title: `${sport} · Best pick`,
      description: desc,
      color: LEAGUE_COLORS[sport] || LEAGUE_COLORS.DEFAULT,
      footer: { text: `game:${p.game_id || ''}` },
    }],
    components: [
      { type: 1, components: [
        { type: 2, style: 5, label: 'FanDuel', url: String(fd).slice(0, 512) },
        { type: 2, style: 5, label: 'DraftKings', url: String(dk).slice(0, 512) },
        { type: 2, style: 5, label: 'PrizePicks', url: String(pp).slice(0, 512) },
      ]},
      { type: 1, components: [
        { type: 2, style: 1, label: 'Player props / stats', custom_id: `pp|load|${gid}`.slice(0, 100) },
      ]},
    ],
  };
}

async function fetchPicks(dates) {
  const base = process.env.APP_URL || 'https://helpbet.vercel.app';
  const r = await fetch(`${base}/api/best-bets?min_confidence=0.30&limit=250`);
  const data = await r.json().catch(() => ({}));
  let picks = Array.isArray(data.picks) ? data.picks : [];
  if (dates?.length) {
    const allowed = new Set(dates);
    picks = picks.filter((p) => allowed.has(pickDayKey(p)));
  }
  try {
    const dateQ = dates?.length ? dates.join(',') : '';
    const gUrl = dateQ ? `${base}/api/games?sport=ALL&dates=${encodeURIComponent(dateQ)}` : `${base}/api/games?sport=ALL`;
    const gr = await fetch(gUrl);
    const gd = await gr.json().catch(() => ({}));
    const games = Array.isArray(gd.games) ? gd.games : [];
    const seen = new Set(picks.map((p) => `${String(p.sport || '').toUpperCase()}|${p.home_team}|${p.away_team}`));
    for (const g of games) {
      const k = pickDayKey(g);
      if (dates?.length && !dates.includes(k)) continue;
      const sport = String(g.sport || '').toUpperCase();
      const key = `${sport}|${g.home_team}|${g.away_team}`;
      if (seen.has(key)) continue;
      const odds = g.odds || {};
      if (odds.ml_home == null && odds.ml_away == null) continue;
      let side = 'home';
      if (odds.ml_home != null && odds.ml_away != null && odds.ml_away > odds.ml_home) side = 'away';
      picks.push({
        game_id: g.id, sport, home_team: g.home_team, away_team: g.away_team,
        start_time: g.start_time || g.commence_time, recommended_side: side,
        confidence: 0.55, algorithm_name: 'Board lean',
        reasoning: 'Live board lean from available moneyline.', odds, links: g.links,
      });
      seen.add(key);
    }
  } catch {}
  const best = new Map();
  for (const p of picks) {
    const k = `${String(p.sport || '').toUpperCase()}|${p.home_team}|${p.away_team}`;
    if (!best.has(k) || (p.confidence || 0) > (best.get(k).confidence || 0)) best.set(k, p);
  }
  return [...best.values()].sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-hb-chain');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const allDates = Array.isArray(body.dates) ? body.dates.map((d) => String(d).trim()).filter(Boolean).sort() : [];
    const day = allDates[0] || null;
    const rest = allDates.slice(1);
    const force = body.force === true || body.force === '1';
    const guildId = process.env.DISCORD_GUILD_ID || '';
    const botCfg = await loadCfg(guildId);
    if (!Object.keys(botCfg).length) {
      return res.status(400).json({ error: 'No Discord channels in /config' });
    }

    let picks = await fetchPicks(day ? [day] : null);
    if (day) picks = picks.filter((p) => pickDayKey(p) === day);

    const byLeague = {};
    for (const p of picks) {
      const L = String(p.sport || 'OTHER').toUpperCase();
      (byLeague[L] ||= []).push(p);
    }
    const nice = (k) => {
      try {
        return new Date(`${k}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
      } catch { return k; }
    };

    let sent = 0, headersPosted = 0, headersSkipped = 0;
    const posted = [], errors = [], startedAt = Date.now();

    for (const L of Object.keys(byLeague).sort()) {
      const list = byLeague[L].slice(0, 25);
      const channel = botCfg[`ch_${L}`] || botCfg.alerts;
      if (!channel || !list.length) continue;
      const roleId = botCfg[`role_${L}`] || botCfg.role_ALL || botCfg.alert_role;
      const skipHeader = !force && await headerAlreadyPosted(channel, day, L);

      try {
        if (body._cont) {
          await sendChannel(channel, { content: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━' });
          await sleep(150);
        }
        if (!skipHeader) {
          await sendChannel(channel, {
            content: roleId ? `<@&${roleId}>` : undefined,
            embeds: [{
              title: day ? `📅 ${nice(day)}` : '📅 Picks',
              description: `**${L}** · **${list.length}** pick(s)\n_Games listed below_`,
              color: LEAGUE_COLORS[L] || LEAGUE_COLORS.DEFAULT,
            }],
            allowed_mentions: roleId ? { roles: [roleId] } : { parse: [] },
          });
          headersPosted += 1;
          await recordPost(channel, guildId, `header:${L}:${day || 'all'}`, L, {
            status: 'header', snapshot: { day, count: list.length },
          });
          await sleep(250);
        } else {
          headersSkipped += 1;
        }

        for (const p of list) {
          if (Date.now() - startedAt > 8000) {
            errors.push(`timeout before finishing ${L}`);
            break;
          }
          try {
            const msg = await sendChannel(channel, pickEmbedFast(p));
            sent += 1;
            await recordPost(channel, guildId, p.game_id, L, {
              message_id: msg?.id, home_team: p.home_team, away_team: p.away_team,
              start_time: p.start_time,
              snapshot: { recommended_side: p.recommended_side || p.side, confidence: p.confidence, algorithm_name: p.algorithm_name },
              status: 'pending',
            });
          } catch (e) {
            errors.push(`${L}: ${String(e.message || e).slice(0, 60)}`);
            await sleep(500);
          }
          await sleep(280);
        }
        posted.push(L);
      } catch (e) {
        errors.push(`${L} batch: ${String(e.message || e).slice(0, 80)}`);
      }
      await sleep(200);
    }

    if (rest.length) {
      const base = process.env.APP_URL || 'https://helpbet.vercel.app';
      fetch(`${base}/api/send-days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hb-chain': chainKey() },
        body: JSON.stringify({ ...body, dates: rest, _cont: true, force }),
      }).catch(() => {});
    }

    return res.status(200).json({
      ok: true, sent, headers_posted: headersPosted, headers_skipped: headersSkipped,
      leagues: posted, dates: allDates, errors: errors.slice(0, 6),
      message: `Posted ${sent} pick card(s)${day ? ` for ${day}` : ''}` +
        (headersSkipped ? ` · skipped ${headersSkipped} duplicate header(s)` : '') +
        (rest.length ? ` · chaining: ${rest.join(', ')}` : ''),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
