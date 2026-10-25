/**
 * Discord digest:
 * 1) Pull live FanDuel/DK games
 * 2) Drop games that already started
 * 3) Split TODAY vs TOMORROW (Central)
 * 4) Run tools → best lean per game
 * 5) Post league-colored cards with book links + link-buttons
 */

const LEAGUE_COLORS = {
  NFL: 0x013369,
  NCAAF: 0xe87722,
  NCAAB: 0x7c3aed,
  NBA: 0xc8102e,
  MLB: 0x002d72,
  NHL: 0x111111,
  DEFAULT: 0x38bdf8,
};

const LEAGUES = ['NFL', 'NBA', 'NCAAF', 'NCAAB', 'MLB', 'NHL'];

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
    return String(iso);
  }
}

function centralDateKey(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  } catch {
    return null;
  }
}

function todayTomorrowKeys() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const parts = today.split('-').map(Number);
  const noonUtcGuess = Date.UTC(parts[0], parts[1] - 1, parts[2], 18, 0, 0);
  const tomorrow = new Date(noonUtcGuess + 24 * 3600e3).toLocaleDateString('en-CA', {
    timeZone: 'America/Chicago',
  });
  return { today, tomorrow };
}

function sideLabel(side, home, away) {
  if (side === 'home') return home || 'Home';
  if (side === 'away') return away || 'Away';
  return side || 'Pass';
}

function stillUpcoming(iso) {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return true;
  return t > Date.now() - 2 * 60e3;
}

function bookUrls(p) {
  const q = encodeURIComponent(`${p.away_team || ''} ${p.home_team || ''}`.trim());
  return {
    fanduel: (p.links?.fanduel || `https://sportsbook.fanduel.com/search?q=${q}`).slice(0, 500),
    draftkings: (p.links?.draftkings || `https://sportsbook.draftkings.com/search?q=${q}`).slice(0, 500),
    prizepicks: (p.links?.prizepicks || 'https://app.prizepicks.com/').slice(0, 500),
  };
}

function americanToProb(odds) {
  if (odds == null) return 0.5;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function runToolsOnGame(game) {
  const o = game.odds || {};
  const books = game.books || {};
  const mlH = o.ml_home ?? books.fanduel?.ml_home ?? books.draftkings?.ml_home ?? -110;
  const mlA = o.ml_away ?? books.fanduel?.ml_away ?? books.draftkings?.ml_away ?? -110;
  const results = [];

  const hP = americanToProb(mlH);
  const aP = americanToProb(mlA);
  const aEV = 0.52 - aP;
  const hEV = 0.48 - hP;
  if (aEV > 0.03 && aEV >= hEV)
    results.push({
      algorithm_name: 'Underdog Value',
      recommended_side: 'away',
      confidence: Math.min(0.8, 0.5 + aEV * 2),
      expected_value: aEV,
      reasoning: `Away moneyline ${fmtOdds(mlA)} still shows edge after the book take.`,
    });
  else if (hEV > 0.03)
    results.push({
      algorithm_name: 'Underdog Value',
      recommended_side: 'home',
      confidence: Math.min(0.8, 0.5 + hEV * 2),
      expected_value: hEV,
      reasoning: `Home moneyline ${fmtOdds(mlH)} shows edge after the book take.`,
    });

  if (mlH >= 100 && mlH <= 180)
    results.push({
      algorithm_name: 'Home Underdog',
      recommended_side: 'home',
      confidence: 0.58,
      expected_value: 0.04,
      reasoning: `Home dog in the +100 to +180 band (${fmtOdds(mlH)}).`,
    });

  if (mlH <= -200)
    results.push({
      algorithm_name: 'Fade Heavy Favorite',
      recommended_side: 'away',
      confidence: 0.55,
      expected_value: 0.03,
      reasoning: `Home is a heavy favorite at ${fmtOdds(mlH)}. Fading the public side.`,
    });
  if (mlA <= -200)
    results.push({
      algorithm_name: 'Fade Heavy Favorite',
      recommended_side: 'home',
      confidence: 0.55,
      expected_value: 0.03,
      reasoning: `Away is a heavy favorite at ${fmtOdds(mlA)}. Fading the public side.`,
    });

  const fd = books.fanduel || {};
  const dk = books.draftkings || {};
  const fdSpr = fd.spread ?? fd.spread_home;
  const dkSpr = dk.spread ?? dk.spread_home;
  if (fdSpr != null && dkSpr != null && Math.abs(fdSpr - dkSpr) >= 1) {
    const better = fdSpr > dkSpr ? 'home' : 'away';
    results.push({
      algorithm_name: 'Soft Line',
      recommended_side: better,
      confidence: 0.62,
      expected_value: 0.045,
      reasoning: `FanDuel and DraftKings disagree on the spread by ${Math.abs(fdSpr - dkSpr)} pts.`,
    });
  }

  const sport = (game.sport || '').toUpperCase();
  if (['NBA', 'NFL', 'NHL', 'NCAAB', 'NCAAF'].includes(sport))
    results.push({
      algorithm_name: 'Home Edge',
      recommended_side: 'home',
      confidence: 0.52,
      expected_value: 0.02,
      reasoning: `Small home lean for ${sport} when other tools are quiet.`,
    });

  results.sort(
    (a, b) =>
      (b.confidence || 0) * (1 + (b.expected_value || 0)) -
      (a.confidence || 0) * (1 + (a.expected_value || 0))
  );
  return results;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function postDiscord(webhook, payload) {
  const attempt = async (body) => {
    const dr = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'HelpBet', allowed_mentions: { parse: [] }, ...body }),
    });
    const text = await dr.text();
    return { ok: dr.ok, status: dr.status, text };
  };

  for (let tryN = 0; tryN < 4; tryN++) {
    let r = await attempt(payload);
    if (!r.ok && payload.components && r.status !== 429) {
      const { components, ...rest } = payload;
      r = await attempt(rest);
    }
    if (r.ok) {
      await sleep(1500); // stay under Discord rate limits
      return;
    }
    if (r.status === 429) {
      let wait = 2;
      try {
        wait = Math.min(8, Number(JSON.parse(r.text).retry_after) || 2);
      } catch {}
      await sleep(wait * 1000 + 200);
      continue;
    }
    throw new Error(`Discord ${r.status}: ${r.text.slice(0, 180)}`);
  }
  throw new Error('Discord rate limited — try again in a minute');
}

function gameCardEmbed(game, tools, dayLabel) {
  const sport = String(game.sport || 'SPORT').toUpperCase();
  const color = LEAGUE_COLORS[sport] || LEAGUE_COLORS.DEFAULT;
  const urls = bookUrls(game);
  const fd = game.books?.fanduel || game.odds || {};
  const dk = game.books?.draftkings || {};
  const best = tools[0];

  const lines = [];
  lines.push(`**${dayLabel}** · ${fmtWhen(game.start_time || game.commence_time)}`);
  lines.push('');
  if (best) {
    const team = sideLabel(best.recommended_side, game.home_team, game.away_team);
    lines.push(`**Best lean: ${team}** (${best.recommended_side})`);
    lines.push(`Tool: **${best.algorithm_name}**`);
    lines.push(
      `How sure: **${Math.round((best.confidence || 0) * 100)}%** · Edge: **${((best.expected_value || 0) * 100).toFixed(1)}%**`
    );
    lines.push('');
    lines.push(`**Why:** ${best.reasoning}`);
  } else {
    lines.push('**Best lean:** Tools passed — no strong edge. Lines below for reference.');
  }
  if (tools.length > 1) {
    lines.push('');
    lines.push('**Other tools**');
    for (const t of tools.slice(1, 4)) {
      lines.push(
        `• ${t.algorithm_name}: ${sideLabel(t.recommended_side, game.home_team, game.away_team)} (${Math.round((t.confidence || 0) * 100)}%)`
      );
    }
  }
  lines.push('');
  lines.push('**Live prices from the books**');
  lines.push(
    `FanDuel ML: ${fmtOdds(fd.ml_home)} / ${fmtOdds(fd.ml_away)} · spread ${fd.spread ?? fd.spread_home ?? '—'} · total ${fd.total ?? '—'}`
  );
  lines.push(
    `DraftKings ML: ${fmtOdds(dk.ml_home)} / ${fmtOdds(dk.ml_away)} · spread ${dk.spread ?? dk.spread_home ?? '—'} · total ${dk.total ?? '—'}`
  );
  lines.push('');
  lines.push('**Open this bet (tap a link):**');
  lines.push(`🔵 [View on FanDuel](${urls.fanduel})`);
  lines.push(`🟢 [View on DraftKings](${urls.draftkings})`);
  lines.push(`🟣 [View on PrizePicks](${urls.prizepicks})`);

  return {
    embeds: [
      {
        title: `${sport}: ${game.away_team} @ ${game.home_team}`,
        description: lines.join('\n').slice(0, 4000),
        color,
        fields: [
          { name: 'Starts (CT)', value: fmtWhen(game.start_time || game.commence_time), inline: true },
          { name: 'League', value: sport, inline: true },
          {
            name: 'Best side',
            value: best ? sideLabel(best.recommended_side, game.home_team, game.away_team) : 'None',
            inline: true,
          },
        ],
        footer: { text: 'HelpBet · tools ran on FanDuel + DraftKings lines' },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: 'View on FanDuel', url: urls.fanduel },
          { type: 2, style: 5, label: 'View on DraftKings', url: urls.draftkings },
          { type: 2, style: 5, label: 'View on PrizePicks', url: urls.prizepicks },
        ],
      },
    ],
  };
}

async function loadGames(base) {
  const all = [];
  for (const sport of LEAGUES) {
    try {
      const r = await fetch(`${base}/api/games?sport=${sport}`);
      const text = await r.text();
      if (!r.ok || text.trim().startsWith('<')) continue;
      const data = JSON.parse(text);
      for (const g of data.games || []) all.push({ ...g, sport: g.sport || sport });
    } catch {}
  }
  return all;
}

async function sendSection({ webhook, games, dayLabel, banner }) {
  if (!games.length) {
    await postDiscord(webhook, {
      embeds: [
        {
          title: banner,
          description: `No upcoming ${dayLabel.toLowerCase()} games with lines right now.`,
          color: 0x71717a,
        },
      ],
    });
    return 0;
  }

  await postDiscord(webhook, {
    content: `**════════ ${banner} ════════**`,
    embeds: [
      {
        title: banner,
        description: `${games.length} upcoming game(s). Tools already ran on each card.`,
        color: dayLabel === 'TODAY' ? 0x22c55e : 0x3b82f6,
      },
    ],
  });

  const byLeague = new Map();
  for (const g of games) {
    const L = String(g.sport || 'OTHER').toUpperCase();
    if (!byLeague.has(L)) byLeague.set(L, []);
    byLeague.get(L).push(g);
  }

  let n = 0;
  for (const [league, list] of [...byLeague.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    await postDiscord(webhook, {
      content: `**——— DIFFERENT LEAGUE: ${league} ———**`,
      embeds: [
        {
          title: `${league} · ${dayLabel}`,
          description: `${list.length} game(s)`,
          color: LEAGUE_COLORS[league] || LEAGUE_COLORS.DEFAULT,
        },
      ],
    });

    for (const game of list) {
      const tools = runToolsOnGame(game);
      const card = gameCardEmbed(game, tools, dayLabel);
      await postDiscord(webhook, card);
      n += 1;
    }
  }
  return n;
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
  return (await r.json()).filter((u) => String(u.discord_webhook || '').includes('discord.com'));
}

async function runDigest(webhook, base, leaguesFilter) {
  let games = await loadGames(base);
  games = games.filter((g) => stillUpcoming(g.start_time || g.commence_time));
  if (Array.isArray(leaguesFilter) && leaguesFilter.length) {
    const set = new Set(leaguesFilter.map((x) => String(x).toUpperCase()));
    games = games.filter((g) => set.has(String(g.sport || '').toUpperCase()));
  }

  const { today, tomorrow } = todayTomorrowKeys();
  const todayGames = games
    .filter((g) => centralDateKey(g.start_time || g.commence_time) === today)
    .sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
  const tomorrowGames = games
    .filter((g) => centralDateKey(g.start_time || g.commence_time) === tomorrow)
    .sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));

  const nToday = await sendSection({
    webhook,
    games: todayGames,
    dayLabel: 'TODAY',
    banner: 'TODAY — UPCOMING ONLY',
  });

  await postDiscord(webhook, {
    embeds: [
      {
        title: 'THIS IS ALL BETS FOR TODAY',
        description: `Posted **${nToday}** upcoming game card(s) for **${today}** (Central). Past tip-offs were skipped.`,
        color: 0x22c55e,
      },
    ],
  });

  const nTom = await sendSection({
    webhook,
    games: tomorrowGames,
    dayLabel: 'TOMORROW',
    banner: 'TOMORROW — FULL SLATE',
  });

  await postDiscord(webhook, {
    embeds: [
      {
        title: 'THIS IS ALL BETS FOR TOMORROW',
        description: `Posted **${nTom}** game card(s) for **${tomorrow}** (Central). Tools ran on FanDuel + DraftKings lines before each send.`,
        color: 0x3b82f6,
        footer: { text: 'HelpBet complete' },
        timestamp: new Date().toISOString(),
      },
    ],
  });

  return { today: nToday, tomorrow: nTom, scanned: games.length };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const base = process.env.APP_URL || 'https://helpbet.vercel.app';

  try {
    const body = req.body || {};

    if (body.all_users || req.query.all_users === '1') {
      const users = await listUsersWithWebhooks();
      const out = [];
      for (const u of users) {
        try {
          const stats = await runDigest(u.discord_webhook, base, u.notify_config?.auto_post_leagues);
          out.push({ username: u.username, ok: true, ...stats });
        } catch (e) {
          out.push({ username: u.username, ok: false, error: e.message });
        }
      }
      return res.status(200).json({ ok: true, mode: 'all_users', users: out });
    }

    let webhook = body.webhook_url || null;
    let leaguesFilter = body.leagues;
    if (body.username && !webhook) {
      const us = await loadUserConfig(body.username);
      if (!us?.discord_webhook)
        return res.status(400).json({ error: 'No webhook on this account. Add one in Setup.' });
      webhook = us.discord_webhook;
      if (!leaguesFilter) leaguesFilter = us.notify_config?.auto_post_leagues;
    }
    if (!webhook || !String(webhook).includes('discord.com')) {
      return res.status(400).json({ error: 'Pass webhook_url or log in and save your webhook in Setup.' });
    }

    const stats = await runDigest(webhook, base, leaguesFilter);
    return res.status(200).json({
      ok: true,
      message: 'Posted TODAY then TOMORROW digests with tools + book buttons',
      ...stats,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
