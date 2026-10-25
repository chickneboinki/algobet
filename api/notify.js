/**
 * Post best picks to Discord as rich embeds.
 * Uses DISCORD_WEBHOOK_URL env, or body.webhook_url / app_settings.discord_webhook.
 */

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
  const header = {
    title: title || 'HelpBet · Daily best picks',
    description: `Ranked tool picks · times in Central · ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}`,
    color: 0x38bdf8,
    footer: { text: 'HelpBet · track results so tools learn' },
    timestamp: new Date().toISOString(),
  };
  embeds.push(header);

  let i = 0;
  for (const [, list] of groups) {
    if (embeds.length >= 9) break; // Discord max 10 embeds
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

    // player props for this matchup if provided
    const propKey = `${sport}|${away}|${home}`;
    const props = propsByGame?.[propKey] || propsByGame?.[top.game_id] || [];
    if (props.length) {
      lines.push('');
      lines.push('**Player bets**');
      for (const pr of props.slice(0, 4)) {
        lines.push(
          `• ${pr.player} · ${pr.market_label || pr.market} **${pr.line}** (${pr.book || pr.source || 'prop'})`
        );
      }
    }

    embeds.push({
      title: `${sport}: ${away} @ ${home}`,
      description: lines.join('\n').slice(0, 4000),
      color: 0x0ea5e9,
      fields: [
        { name: 'Starts', value: when, inline: true },
        { name: 'League', value: sport, inline: true },
        {
          name: 'Top lean',
          value: sideLabel(top.recommended_side, home, away),
          inline: true,
        },
      ],
    });
    i += 1;
  }

  if (embeds.length === 1) {
    embeds.push({
      title: 'No strong picks yet',
      description: 'Tools did not clear the confidence bar. Check HelpBet Games later.',
      color: 0x71717a,
    });
  }
  return embeds;
}

async function resolveWebhook(bodyWebhook) {
  if (bodyWebhook && String(bodyWebhook).includes('discord.com/api/webhooks')) return bodyWebhook;
  if (process.env.DISCORD_WEBHOOK_URL) return process.env.DISCORD_WEBHOOK_URL;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/app_settings?id=eq.default&select=discord_webhook`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      });
      if (r.ok) {
        const rows = await r.json();
        if (rows[0]?.discord_webhook) return rows[0].discord_webhook;
      }
    } catch {}
  }
  return null;
}

async function fetchPicks(base) {
  const r = await fetch(`${base}/api/best-bets?min_confidence=0.5&limit=25&persist=1`);
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
    const webhook = await resolveWebhook(body.webhook_url);
    if (!webhook) {
      return res.status(400).json({
        error:
          'No Discord webhook. Add DISCORD_WEBHOOK_URL in Vercel, or save discord_webhook in app_settings, or pass webhook_url.',
      });
    }

    const data = body.picks ? { picks: body.picks } : await fetchPicks(base);
    const picks = data.picks || [];
    const propsByGame = await fetchPropsSample(base, picks);
    const embeds = buildEmbeds({
      picks,
      propsByGame,
      title: body.title || 'HelpBet · Best picks',
    });

    // Discord allows max 10 embeds per message
    const chunk = embeds.slice(0, 10);
    const dr = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'HelpBet',
        content: body.content || null,
        embeds: chunk,
      }),
    });
    if (!dr.ok) {
      const t = await dr.text();
      return res.status(502).json({ error: `Discord ${dr.status}: ${t.slice(0, 300)}` });
    }

    return res.status(200).json({
      ok: true,
      embeds_sent: chunk.length,
      picks: picks.length,
      message: 'Posted rich embeds to Discord',
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
