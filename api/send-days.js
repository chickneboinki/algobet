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
async function sendChannel(channelId, payload) {
  return botApi('POST', `/channels/${channelId}/messages`, payload);
}

function sbHeaders() {
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
}
function sbUrl() { return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL; }
async function loadCfg(guildId) {
  if (!guildId) return {};
  try {
    const r = await fetch(`${sbUrl()}/rest/v1/discord_config?guild_id=eq.${guildId}&select=config&limit=1`, { headers: sbHeaders() });
    const rows = r.ok ? await r.json() : [];
    return rows?.[0]?.config || {};
  } catch { return {}; }
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
    p.reasoning ? `**Why:** ${String(p.reasoning).slice(0, 280)}` : null,
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
        game_id: g.id,
        sport,
        home_team: g.home_team,
        away_team: g.away_team,
        start_time: g.start_time || g.commence_time,
        recommended_side: side,
        confidence: 0.55,
        algorithm_name: 'Board lean',
        reasoning: 'Live board lean from available moneyline.',
        odds,
        links: g.links,
      });
      seen.add(key);
    }
  } catch {}
  const best = new Map();
  for (const p of picks) {
    const k = `${String(p.sport || '').toUpperCase()}|${p.home_team}|${p.away_team}`;
    const sc = p.confidence || 0;
    if (!best.has(k) || sc > (best.get(k).confidence || 0)) best.set(k, p);
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

    let sent = 0;
    const posted = [];
    const startedAt = Date.now();

    for (const L of Object.keys(byLeague).sort()) {
      const list = byLeague[L].slice(0, 40);
      const channel = botCfg[`ch_${L}`] || botCfg.alerts;
      if (!channel || !list.length) continue;
      const roleId = botCfg[`role_${L}`] || botCfg.role_ALL || botCfg.alert_role;
      try {
        if (body._cont) {
          await sendChannel(channel, { content: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━' });
          await sleep(200);
        }
        await sendChannel(channel, {
          content: roleId ? `<@&${roleId}>` : undefined,
          embeds: [{
            title: day ? `📅 ${nice(day)}` : '📅 Picks',
            description: `**${L}** · **${list.length}** pick(s)\n_Games listed below_`,
            color: LEAGUE_COLORS[L] || LEAGUE_COLORS.DEFAULT,
          }],
          allowed_mentions: roleId ? { roles: [roleId] } : { parse: [] },
        });
        await sleep(300);
        for (const p of list) {
          if (Date.now() - startedAt > 50000) break;
          try {
            await sendChannel(channel, pickEmbedFast(p));
            sent += 1;
          } catch {}
          await sleep(450);
        }
        posted.push(L);
      } catch {}
      await sleep(250);
    }

    if (rest.length) {
      const base = process.env.APP_URL || 'https://helpbet.vercel.app';
      fetch(`${base}/api/send-days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hb-chain': chainKey() },
        body: JSON.stringify({ ...body, dates: rest, _cont: true }),
      }).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      sent,
      leagues: posted,
      dates: allDates,
      message: `Posted ${sent} pick(s)${day ? ` for ${day}` : ''}${rest.length ? ` · next: ${rest.join(', ')}` : ''}`,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
