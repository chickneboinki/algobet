/**
 * Per-user Discord digests: ALL picks for the day, grouped by league,
 * DIFFERENT LEAGUE banners, colored embeds, FanDuel/DK/PrizePicks link buttons.
 */

const LEAGUE_COLORS = {
  NFL: 0x013369,
  NCAAF: 0xb45309,
  NCAAB: 0x6d28d9,
  NBA: 0xc8102e,
  MLB: 0x002d72,
  NHL: 0x111827,
  DEFAULT: 0x38bdf8,
};

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

function searchQ(away, home) {
  return encodeURIComponent(`${away || ''} ${home || ''}`.trim());
}

function bookLinks(p) {
  const q = searchQ(p.away_team, p.home_team);
  const fd = p.books?.fanduel || p.odds || {};
  const dk = p.books?.draftkings || {};
  return {
    fanduel: p.links?.fanduel || `https://sportsbook.fanduel.com/navigation/nfl?search=${q}`,
    draftkings: p.links?.draftkings || `https://sportsbook.draftkings.com/sportsbook?search=${q}`,
    prizepicks: p.links?.prizepicks || 'https://app.prizepicks.com/',
    fd_ml: `FD ML ${fmtOdds(fd.ml_home)} / ${fmtOdds(fd.ml_away)}`,
    dk_ml: `DK ML ${fmtOdds(dk.ml_home)} / ${fmtOdds(dk.ml_away)}`,
  };
}

function groupByLeagueThenGame(picks) {
  const byLeague = new Map();
  for (const p of picks || []) {
    const league = String(p.sport || 'OTHER').toUpperCase();
    if (!byLeague.has(league)) byLeague.set(league, new Map());
    const games = byLeague.get(league);
    const gkey = `${p.away_team}|${p.home_team}|${p.game_id || ''}`;
    if (!games.has(gkey)) games.set(gkey, []);
    games.get(gkey).push(p);
  }
  return byLeague;
}

function isTodayCentral(iso) {
  if (!iso) return true;
  try {
    const d = new Date(iso);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const day = d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    // include next ~36h so evening posts still catch tonight + tomorrow early
    const diff = d.getTime() - Date.now();
    return day === today || (diff > 0 && diff < 36 * 3600e3);
  } catch {
    return true;
  }
}

async function postDiscord(webhook, payload) {
  const dr = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'HelpBet', ...payload }),
  });
  if (!dr.ok) {
    const t = await dr.text();
    throw new Error(`Discord ${dr.status}: ${t.slice(0, 200)}`);
  }
}

async function fetchPicks(base) {
  try {
    const r = await fetch(`${base}/api/best-bets?min_confidence=0.45&limit=80&persist=1`);
    const text = await r.text();
    if (!r.ok || text.trim().startsWith('<')) return { picks: [] };
    return JSON.parse(text);
  } catch {
    return { picks: [] };
  }
}

async function fetchPropsSample(base, picks) {
  const propsByGame = {};
  const seen = new Set();
  for (const p of (picks || []).slice(0, 12)) {
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
      const text = await r.text();
      if (!r.ok || text.trim().startsWith('<')) continue;
      const data = JSON.parse(text);
      propsByGame[key] = (data.props || []).slice(0, 5);
    } catch {}
  }
  return propsByGame;
}

async function loadUserConfig(username) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey || !username) return null;
  const r = await fetch(
    `${supabaseUrl}/rest/v1/user_settings?username=eq.${encodeURIComponent(username)}&select=*`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function listUsersWithWebhooks() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return [];
  const r = await fetch(
    `${supabaseUrl}/rest/v1/user_settings?discord_webhook=not.is.null&select=username,discord_webhook,notify_config`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  if (!r.ok) return [];
  const rows = await r.json();
  return (rows || []).filter((u) => u.discord_webhook && String(u.discord_webhook).includes('discord.com'));
}

async function sendDigest({ webhook, picks, propsByGame, title, mode, league_webhooks }) {
  const dayPicks = picks.filter((p) => isTodayCentral(p.start_time || p.commence_time));
  const byLeague = groupByLeagueThenGame(dayPicks.length ? dayPicks : picks);
  const leagues = [...byLeague.keys()].sort();
  const results = [];

  if (!leagues.length) {
    await postDiscord(webhook, {
      content: null,
      embeds: [
        {
          title: title || 'HelpBet · Today',
          description: 'No ranked picks cleared the bar for today yet.',
          color: LEAGUE_COLORS.DEFAULT,
        },
      ],
    });
    return [{ channel: 'empty', embeds: 1 }];
  }

  for (let li = 0; li < leagues.length; li++) {
    const league = leagues[li];
    const games = byLeague.get(league);
    const color = LEAGUE_COLORS[league] || LEAGUE_COLORS.DEFAULT;
    const targetWh =
      mode === 'per_league' && league_webhooks?.[league] ? league_webhooks[league] : webhook;

    // Banner message
    await postDiscord(targetWh, {
      content: `**——— DIFFERENT LEAGUE: ${league} ———**`,
      embeds: [
        {
          title: `${league} PICKS`,
          description: `${games.size} game(s) · Central times`,
          color,
        },
      ],
    });

    let gameIndex = 0;
    for (const [, list] of games) {
      list.sort((a, b) => (b.score || b.confidence || 0) - (a.score || a.confidence || 0));
      const top = list[0];
      const away = top.away_team;
      const home = top.home_team;
      const links = bookLinks(top);
      const lines = [];
      for (const p of list.slice(0, 5)) {
        const team = sideLabel(p.recommended_side, home, away);
        lines.push(
          `**${team}** · ${p.algorithm_name} · ${Math.round((p.confidence || 0) * 100)}% · edge ${((p.expected_value || 0) * 100).toFixed(1)}%`
        );
        if (p.reasoning) lines.push(`_${String(p.reasoning).slice(0, 120)}_`);
      }
      const propKey = `${league}|${away}|${home}`;
      const props = propsByGame[propKey] || [];
      if (props.length) {
        lines.push('');
        lines.push('**Player bets**');
        for (const pr of props.slice(0, 4)) {
          lines.push(`• ${pr.player} ${pr.market_label || pr.market} **${pr.line}**`);
        }
      }
      lines.push('');
      lines.push(`${links.fd_ml}`);
      lines.push(`${links.dk_ml}`);

      const embeds = [
        {
          title: `${league}: ${away} @ ${home}`,
          description: lines.join('\n').slice(0, 3900),
          color,
          fields: [
            { name: 'Starts', value: fmtWhen(top.start_time || top.commence_time), inline: true },
            { name: 'League', value: league, inline: true },
            { name: 'Top lean', value: sideLabel(top.recommended_side, home, away), inline: true },
          ],
        },
      ];

      // Link buttons (open books privately in the user's browser — no shared channel leak)
      const components = [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: 'View on FanDuel', url: links.fanduel.slice(0, 512) },
            { type: 2, style: 5, label: 'View on DraftKings', url: links.draftkings.slice(0, 512) },
            { type: 2, style: 5, label: 'View on PrizePicks', url: links.prizepicks.slice(0, 512) },
          ],
        },
      ];

      await postDiscord(targetWh, { embeds, components });
      gameIndex += 1;
      results.push({ league, game: `${away}@${home}` });
      // soft rate limit
      if (gameIndex % 4 === 0) await new Promise((r) => setTimeout(r, 800));
    }
  }

  // End banner on primary webhook
  await postDiscord(webhook, {
    embeds: [
      {
        title: 'THIS IS ALL BETS FOR TODAY',
        description: `Finished posting **${results.length}** game card(s) across **${leagues.length}** league(s). Track results in HelpBet so tools learn.`,
        color: 0x22c55e,
        footer: { text: 'HelpBet daily card' },
        timestamp: new Date().toISOString(),
      },
    ],
  });

  return results;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const base = process.env.APP_URL || 'https://helpbet.vercel.app';

  try {
    const body = req.body || {};
    const data = body.picks ? { picks: body.picks } : await fetchPicks(base);
    let picks = data.picks || [];
    const propsByGame = await fetchPropsSample(base, picks);

    // Cron: fan-out to every user who saved their own webhook
    if (body.all_users || req.query.all_users === '1') {
      const users = await listUsersWithWebhooks();
      const out = [];
      for (const u of users) {
        const cfg = u.notify_config || {};
        const leagues = cfg.auto_post_leagues;
        let userPicks = picks;
        if (Array.isArray(leagues) && leagues.length) {
          const set = new Set(leagues.map((x) => String(x).toUpperCase()));
          userPicks = picks.filter((p) => set.has(String(p.sport || '').toUpperCase()));
        }
        try {
          const r = await sendDigest({
            webhook: u.discord_webhook,
            picks: userPicks,
            propsByGame,
            title: `HelpBet · ${u.username} · Today`,
            mode: cfg.mode,
            league_webhooks: cfg.league_webhooks,
          });
          out.push({ username: u.username, ok: true, cards: r.length });
        } catch (e) {
          out.push({ username: u.username, ok: false, error: e.message });
        }
      }
      return res.status(200).json({ ok: true, mode: 'all_users', users: out });
    }

    // Single send: require explicit webhook or logged-in user settings
    let webhook = body.webhook_url || null;
    let mode = 'single';
    let league_webhooks = {};
    let leaguesFilter = body.leagues;

    if (body.username) {
      const us = await loadUserConfig(body.username);
      if (!us?.discord_webhook) {
        return res.status(400).json({
          error: 'No webhook on this account. Add one in Setup (each person has their own).',
        });
      }
      webhook = us.discord_webhook;
      mode = us.notify_config?.mode || 'single';
      league_webhooks = us.notify_config?.league_webhooks || {};
      if (!leaguesFilter) leaguesFilter = us.notify_config?.auto_post_leagues;
    }

    if (!webhook || !String(webhook).includes('discord.com')) {
      return res.status(400).json({
        error: 'Log in and save YOUR Discord webhook in Setup first. New accounts start with no webhook.',
      });
    }

    if (Array.isArray(leaguesFilter) && leaguesFilter.length) {
      const set = new Set(leaguesFilter.map((x) => String(x).toUpperCase()));
      picks = picks.filter((p) => set.has(String(p.sport || '').toUpperCase()));
    }

    const results = await sendDigest({
      webhook,
      picks,
      propsByGame,
      title: body.title || 'HelpBet · All bets for today',
      mode,
      league_webhooks,
    });

    return res.status(200).json({
      ok: true,
      picks: picks.length,
      cards: results.length,
      message: 'Posted all bets for today (grouped by league)',
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
