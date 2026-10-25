/**
 * Post best picks to Discord as rich embeds.
 * Supports single webhook or per-league webhooks from app_settings.
 * Default webhook can be DISCORD_WEBHOOK_URL env.
 */

const DEFAULT_WEBHOOK =
  process.env.DISCORD_WEBHOOK_URL ||
  'https://discord.com/api/webhooks/1564027144898871338/Vu_tPC5-u5IniRiqO4CPCJuonZ9nAz459-xzvUxKd4asb4MtxYxbCHtsJ9awTKAlca7S';

function fmtOdds(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  return v > 0 ? `+${v}` : `${v}`;
}

function fmtWhen(iso) {
  if (!iso) return 'Time TBA';
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function sideLabel(side, home, away) {
  if (side === 'home') return home || 'Home';
  if (side === 'away') return away || 'Away';
  return side || '—';
}

function groupByGame(picks) {
  const map = new Map();
  for (const p of picks || []) {
    const key = `${p.sport}|${p.away_team}|${p.home_team}|${p.game_id || p.start_time}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return map;
}

function buildEmbeds({ picks, propsByGame, title }) {
  const groups = groupByGame(picks);
  const embeds = [];
  embeds.push({
    title: title || 'HelpBet · Best picks',
    description: `Ranked tool picks · times in Central · ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}`,
    color: 0x38bdf8,
    footer: { text: 'HelpBet · track results so tools learn' },
    timestamp: new Date().toISOString(),
  });

  for (const [, list] of groups) {
    if (embeds.length >= 9) break;
    list.sort((a, b) => (b.score || b.confidence || 0) - (a.score || a.confidence || 0));
    const top = list[0];
    const sport = top.sport || 'Sport';
    const away = top.away_team || 'Away';
    const home = top.home_team || 'Home';
    const when = fmtWhen(top.start_time || top.commence_time);
    const lines = [];
    for (const p of list.slice(0, 4)) {
      const team = sideLabel(p.recommended_side, home, away);
      const ml =
        p.recommended_side === 'home'
          ? p.odds?.ml_home
          : p.recommended_side === 'away'
            ? p.odds?.ml_away
            : null;
      lines.push(
        `**${team}** (${p.algorithm_name}) · sure ${Math.round((p.confidence || 0) * 100)}% · edge ${((p.expected_value || 0) * 100).toFixed(1)}%${ml != null ? ` · ${fmtOdds(ml)}` : ''}`
      );
      if (p.reasoning) lines.push(`_${String(p.reasoning).slice(0, 140)}_`);
    }
    const propKey = `${sport}|${away}|${home}`;
    const props = propsByGame?.[propKey] || [];
    if (props.length) {
      lines.push('');
      lines.push('**Player bets**');
      for (const pr of props.slice(0, 4)) {
        lines.push(`• ${pr.player} · ${pr.market_label || pr.market} **${pr.line}** (${pr.book || 'prop'})`);
      }
    }
    embeds.push({
      title: `${sport}: ${away} @ ${home}`,
      description: lines.join('\n').slice(0, 4000),
      color: 0x0ea5e9,
      fields: [
        { name: 'Starts', value: when, inline: true },
        { name: 'League', value: sport, inline: true },
        { name: 'Top lean', value: sideLabel(top.recommended_side, home, away), inline: true },
      ],
    });
  }
  if (embeds.length === 1) {
    embeds.push({
      title: 'No strong picks yet',
      description: 'Tools did not clear the confidence bar.',
      color: 0x71717a,
    });
  }
  return embeds;
}

async function loadNotifyConfig() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const fallback = {
    mode: 'single',
    default_webhook: DEFAULT_WEBHOOK,
    league_webhooks: {},
    auto_post_leagues: ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL'],
    auto_post_hour_ct: 6,
  };
  if (!supabaseUrl || !supabaseKey) return fallback;
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/app_settings?id=eq.default&select=discord_webhook,notify_config`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!r.ok) return fallback;
    const rows = await r.json();
    const row = rows[0] || {};
    const cfg = row.notify_config && typeof row.notify_config === 'object' ? row.notify_config : {};
    return {
      mode: cfg.mode === 'per_league' ? 'per_league' : 'single',
      default_webhook: cfg.default_webhook || row.discord_webhook || DEFAULT_WEBHOOK,
      league_webhooks: cfg.league_webhooks || {},
      auto_post_leagues: Array.isArray(cfg.auto_post_leagues)
        ? cfg.auto_post_leagues
        : fallback.auto_post_leagues,
      auto_post_hour_ct: Number(cfg.auto_post_hour_ct ?? 6),
    };
  } catch {
    return fallback;
  }
}

async function postDiscord(webhook, embeds, content) {
  const dr = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'HelpBet', content: content || null, embeds }),
  });
  if (!dr.ok) {
    const t = await dr.text();
    throw new Error(`Discord ${dr.status}: ${t.slice(0, 200)}`);
  }
}

async function fetchPicks(base) {
  const r = await fetch(`${base}/api/best-bets?min_confidence=0.5&limit=30&persist=1`);
  if (!r.ok) throw new Error(`best-bets ${r.status}`);
  return r.json();
}

async function fetchPropsSample(base, picks) {
  const propsByGame = {};
  const seen = new Set();
  for (const p of (picks || []).slice(0, 8)) {
    const key = `${p.sport}|${p.away_team}|${p.home_team}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const q = new URLSearchParams({
        sport: p.sport || 'NFL',
        home: p.home_team || '',
        away: p.away_team || '',
      });
      const r = await fetch(`${base}/api/props?${q}`);
      if (!r.ok) continue;
      const data = await r.json();
      propsByGame[key] = (data.props || []).slice(0, 6);
    } catch {}
  }
  return propsByGame;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_URL || 'https://helpbet.vercel.app';

  try {
    const body = req.body || {};
    const cfg = await loadNotifyConfig();
    const data = body.picks ? { picks: body.picks } : await fetchPicks(base);
    let picks = data.picks || [];

    // Filter leagues if requested
    const leagues = body.leagues || cfg.auto_post_leagues;
    if (Array.isArray(leagues) && leagues.length) {
      const set = new Set(leagues.map((x) => String(x).toUpperCase()));
      picks = picks.filter((p) => set.has(String(p.sport || '').toUpperCase()));
    }

    const propsByGame = await fetchPropsSample(base, picks);
    const results = [];

    if (body.webhook_url) {
      const embeds = buildEmbeds({ picks, propsByGame, title: body.title }).slice(0, 10);
      await postDiscord(body.webhook_url, embeds, body.content);
      results.push({ channel: 'override', embeds: embeds.length });
    } else if (cfg.mode === 'per_league' && Object.keys(cfg.league_webhooks || {}).length) {
      const byLeague = {};
      for (const p of picks) {
        const s = String(p.sport || 'OTHER').toUpperCase();
        if (!byLeague[s]) byLeague[s] = [];
        byLeague[s].push(p);
      }
      for (const [sport, list] of Object.entries(byLeague)) {
        const wh = cfg.league_webhooks[sport] || cfg.default_webhook || DEFAULT_WEBHOOK;
        if (!wh) continue;
        const embeds = buildEmbeds({
          picks: list,
          propsByGame,
          title: body.title || `HelpBet · ${sport}`,
        }).slice(0, 10);
        await postDiscord(wh, embeds, body.content || null);
        results.push({ channel: sport, embeds: embeds.length, webhook_tail: String(wh).slice(-8) });
      }
    } else {
      const wh = cfg.default_webhook || DEFAULT_WEBHOOK;
      const embeds = buildEmbeds({
        picks,
        propsByGame,
        title: body.title || 'HelpBet · Best picks',
      }).slice(0, 10);
      await postDiscord(wh, embeds, body.content || null);
      results.push({ channel: 'default', embeds: embeds.length });
    }

    return res.status(200).json({
      ok: true,
      mode: cfg.mode,
      picks: picks.length,
      results,
      message: 'Posted rich embeds to Discord',
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
