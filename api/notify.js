/**
 * Discord digest — TODAY then TOMORROW, tools + player props, working book links.
 * Batches embeds to finish under Vercel timeout and Discord rate limits.
 */

const LEAGUE_COLORS = {
  NFL: 0x013369,
  NCAAF: 0xe87722,
  NCAAB: 0x7c3aed,
  NBA: 0xc8102e,
  MLB: 0x002d72,
  NHL: 0x1e3a5f,
  DEFAULT: 0x38bdf8,
};

const LEAGUES = ['NFL', 'NBA', 'NCAAF', 'NCAAB', 'MLB', 'NHL'];

const SPORT_HUB = {
  NFL: {
    fanduel: 'https://sportsbook.fanduel.com/navigation/nfl',
    draftkings: 'https://sportsbook.draftkings.com/leagues/football/nfl',
    prizepicks: 'https://app.prizepicks.com/',
  },
  NBA: {
    fanduel: 'https://sportsbook.fanduel.com/navigation/nba',
    draftkings: 'https://sportsbook.draftkings.com/leagues/basketball/nba',
    prizepicks: 'https://app.prizepicks.com/',
  },
  MLB: {
    fanduel: 'https://sportsbook.fanduel.com/navigation/mlb',
    draftkings: 'https://sportsbook.draftkings.com/leagues/baseball/mlb',
    prizepicks: 'https://app.prizepicks.com/',
  },
  NHL: {
    fanduel: 'https://sportsbook.fanduel.com/navigation/nhl',
    draftkings: 'https://sportsbook.draftkings.com/leagues/hockey/nhl',
    prizepicks: 'https://app.prizepicks.com/',
  },
  NCAAF: {
    fanduel: 'https://sportsbook.fanduel.com/navigation/ncaaf',
    draftkings: 'https://sportsbook.draftkings.com/leagues/football/ncaaf',
    prizepicks: 'https://app.prizepicks.com/',
  },
  NCAAB: {
    fanduel: 'https://sportsbook.fanduel.com/navigation/ncaab',
    draftkings: 'https://sportsbook.draftkings.com/leagues/basketball/ncaab',
    prizepicks: 'https://app.prizepicks.com/',
  },
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
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  // Build tomorrow by parsing CT date components
  const [y, m, d] = today.split('-').map(Number);
  const tom = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  const tomorrow = tom.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  // Fallback if locale quirks
  if (tomorrow === today) {
    const t2 = new Date(Date.UTC(y, m - 1, d + 2, 12, 0, 0));
    return { today, tomorrow: t2.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) };
  }
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
  return t > Date.now() - 3 * 60e3;
}

function hubs(sport) {
  return SPORT_HUB[String(sport || '').toUpperCase()] || {
    fanduel: 'https://sportsbook.fanduel.com/',
    draftkings: 'https://sportsbook.draftkings.com/',
    prizepicks: 'https://app.prizepicks.com/',
  };
}

function bookUrls(game) {
  const h = hubs(game.sport);
  // Prefer real event id when we scraped FanDuel id like fd-NBA-123456
  const id = String(game.id || '');
  const m = id.match(/^fd-[A-Z0-9]+-(\d+)$/i);
  let fanduel = h.fanduel;
  if (m) {
    // Event page pattern used by FanDuel web
    fanduel = `https://sportsbook.fanduel.com/addToBetslip?marketId=${m[1]}`;
    // marketId may fail — fall back to sport hub which never 404s
    // Prefer hub for reliability:
    fanduel = h.fanduel;
  }
  return {
    fanduel: h.fanduel,
    draftkings: h.draftkings,
    prizepicks: h.prizepicks,
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
      reasoning: `Away ML ${fmtOdds(mlA)} shows edge after juice.`,
    });
  else if (hEV > 0.03)
    results.push({
      algorithm_name: 'Underdog Value',
      recommended_side: 'home',
      confidence: Math.min(0.8, 0.5 + hEV * 2),
      expected_value: hEV,
      reasoning: `Home ML ${fmtOdds(mlH)} shows edge after juice.`,
    });
  if (mlH >= 100 && mlH <= 180)
    results.push({
      algorithm_name: 'Home Underdog',
      recommended_side: 'home',
      confidence: 0.58,
      expected_value: 0.04,
      reasoning: `Home dog ${fmtOdds(mlH)} in the value band.`,
    });
  if (mlH <= -200)
    results.push({
      algorithm_name: 'Fade Heavy Favorite',
      recommended_side: 'away',
      confidence: 0.55,
      expected_value: 0.03,
      reasoning: `Home heavy favorite ${fmtOdds(mlH)} — fade.`,
    });
  if (mlA <= -200)
    results.push({
      algorithm_name: 'Fade Heavy Favorite',
      recommended_side: 'home',
      confidence: 0.55,
      expected_value: 0.03,
      reasoning: `Away heavy favorite ${fmtOdds(mlA)} — fade.`,
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
      reasoning: `FD vs DK spread gap ${Math.abs(fdSpr - dkSpr)} pts.`,
    });
  }
  const sport = (game.sport || '').toUpperCase();
  if (['NBA', 'NFL', 'NHL', 'NCAAB', 'NCAAF'].includes(sport))
    results.push({
      algorithm_name: 'Home Edge',
      recommended_side: 'home',
      confidence: 0.52,
      expected_value: 0.02,
      reasoning: `Small home lean for ${sport}.`,
    });
  results.sort(
    (a, b) =>
      (b.confidence || 0) * (1 + (b.expected_value || 0)) -
      (a.confidence || 0) * (1 + (a.expected_value || 0))
  );
  return results;
}

function teamTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'and'].includes(w));
}

function propsForGame(allProps, game) {
  if (!allProps?.length) return [];
  const sport = String(game.sport || '').toUpperCase();
  const tokens = [...teamTokens(game.home_team), ...teamTokens(game.away_team)];
  const lastHome = (game.home_team || '').split(/\s+/).pop()?.toLowerCase();
  const lastAway = (game.away_team || '').split(/\s+/).pop()?.toLowerCase();
  const hits = [];
  for (const p of allProps) {
    const league = String(p.league || p.sport || '').toUpperCase();
    if (league && league !== sport && !league.includes(sport) && sport !== 'NCAAB' && sport !== 'NCAAF') {
      // soft filter
      if (sport === 'NBA' && league !== 'NBA') continue;
      if (sport === 'NFL' && league !== 'NFL') continue;
    }
    const blob = `${p.team || ''} ${p.game_title || ''} ${p.player || ''}`.toLowerCase();
    const ok =
      (lastHome && blob.includes(lastHome)) ||
      (lastAway && blob.includes(lastAway)) ||
      tokens.some((t) => blob.includes(t));
    if (ok) hits.push(p);
  }
  return hits.slice(0, 5);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function postDiscord(webhook, payload) {
  for (let tryN = 0; tryN < 5; tryN++) {
    const dr = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'HelpBet', allowed_mentions: { parse: [] }, ...payload }),
    });
    const text = await dr.text();
    if (dr.ok) {
      await sleep(450);
      return;
    }
    // Link buttons sometimes rejected — strip components and retry once
    if (payload.components && dr.status === 400) {
      const { components, ...rest } = payload;
      payload = rest;
      continue;
    }
    if (dr.status === 429) {
      let wait = 1.5;
      try {
        wait = Math.min(6, Number(JSON.parse(text).retry_after) || 1.5);
      } catch {}
      await sleep(wait * 1000 + 150);
      continue;
    }
    throw new Error(`Discord ${dr.status}: ${text.slice(0, 160)}`);
  }
  throw new Error('Discord rate limited');
}

function buildGameEmbed(game, tools, props, dayLabel) {
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
    lines.push(`**Best lean: ${sideLabel(best.recommended_side, game.home_team, game.away_team)}**`);
    lines.push(`Tool: **${best.algorithm_name}** · Sure **${Math.round((best.confidence || 0) * 100)}%** · Edge **${((best.expected_value || 0) * 100).toFixed(1)}%**`);
    lines.push(`**Why:** ${best.reasoning}`);
  } else {
    lines.push('**Best lean:** No strong edge — prices only.');
  }
  if (tools.length > 1) {
    lines.push(
      'Other tools: ' +
        tools
          .slice(1, 3)
          .map((t) => `${t.algorithm_name}→${sideLabel(t.recommended_side, game.home_team, game.away_team)}`)
          .join(' · ')
    );
  }
  lines.push('');
  lines.push('**Book prices**');
  lines.push(`FanDuel ML ${fmtOdds(fd.ml_home)}/${fmtOdds(fd.ml_away)} · spr ${fd.spread ?? fd.spread_home ?? '—'} · tot ${fd.total ?? '—'}`);
  lines.push(`DraftKings ML ${fmtOdds(dk.ml_home)}/${fmtOdds(dk.ml_away)} · spr ${dk.spread ?? dk.spread_home ?? '—'} · tot ${dk.total ?? '—'}`);
  if (props.length) {
    lines.push('');
    lines.push('**Player props (PrizePicks)**');
    for (const pr of props.slice(0, 5)) {
      lines.push(`• **${pr.player}** ${pr.market_label || pr.market} **${pr.line}**`);
    }
  }
  lines.push('');
  lines.push(`Open ${sport} board:`);
  lines.push(`[FanDuel ${sport}](${urls.fanduel})`);
  lines.push(`[DraftKings ${sport}](${urls.draftkings})`);
  lines.push(`[PrizePicks](${urls.prizepicks})`);

  return {
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
    footer: { text: 'HelpBet · tools + PrizePicks props' },
  };
}

async function loadGames(base) {
  const all = [];
  await Promise.all(
    LEAGUES.map(async (sport) => {
      try {
        const r = await fetch(`${base}/api/games?sport=${sport}`);
        const text = await r.text();
        if (!r.ok || text.trim().startsWith('<')) return;
        const data = JSON.parse(text);
        for (const g of data.games || []) all.push({ ...g, sport: g.sport || sport });
      } catch {}
    })
  );
  return all;
}

async function loadAllProps(base) {
  const out = [];
  for (const sport of ['NBA', 'NFL', 'NHL', 'MLB', 'NCAAF', 'NCAAB']) {
    try {
      const r = await fetch(`${base}/api/props?sport=${sport}`);
      const text = await r.text();
      if (!r.ok || text.trim().startsWith('<')) continue;
      const data = JSON.parse(text);
      for (const p of data.props || []) out.push({ ...p, league: p.league || sport });
    } catch {}
  }
  return out;
}

async function sendDay({ webhook, games, dayLabel, banner, allProps }) {
  const h = hubs(games[0]?.sport || 'NFL');

  if (!games.length) {
    await postDiscord(webhook, {
      embeds: [
        {
          title: banner,
          description: `No upcoming ${dayLabel} games with lines right now.`,
          color: 0x71717a,
        },
      ],
    });
    return 0;
  }

  // Rank by tool strength so best games post first if we need to cap
  const ranked = games
    .map((g) => {
      const tools = runToolsOnGame(g);
      const props = propsForGame(allProps, g);
      const score = tools[0]
        ? (tools[0].confidence || 0) * (1 + (tools[0].expected_value || 0))
        : 0;
      return { g, tools, props, score };
    })
    .sort((a, b) => b.score - a.score);

  // Cap to finish within timeout (still covers main slate)
  const list = ranked.slice(0, 18);

  await postDiscord(webhook, {
    content: `**════════ ${banner} ════════**\n${list.length} of ${games.length} upcoming · tools already ran`,
    embeds: [
      {
        title: banner,
        description: `Central time · past tip-offs skipped · player props included when matched`,
        color: dayLabel === 'TODAY' ? 0x22c55e : 0x3b82f6,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: 'FanDuel', url: h.fanduel },
          { type: 2, style: 5, label: 'DraftKings', url: h.draftkings },
          { type: 2, style: 5, label: 'PrizePicks', url: h.prizepicks },
        ],
      },
    ],
  });

  // Group remaining by league for banners + batch embeds (up to 8 per message)
  const byLeague = new Map();
  for (const row of list) {
    const L = String(row.g.sport || 'OTHER').toUpperCase();
    if (!byLeague.has(L)) byLeague.set(L, []);
    byLeague.get(L).push(row);
  }

  let n = 0;
  for (const [league, rows] of [...byLeague.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const lh = hubs(league);
    await postDiscord(webhook, {
      content: `**——— DIFFERENT LEAGUE: ${league} ———**`,
      embeds: [
        {
          title: `${league} · ${dayLabel}`,
          description: `${rows.length} game(s)`,
          color: LEAGUE_COLORS[league] || LEAGUE_COLORS.DEFAULT,
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: `FanDuel ${league}`, url: lh.fanduel },
            { type: 2, style: 5, label: `DraftKings ${league}`, url: lh.draftkings },
            { type: 2, style: 5, label: 'PrizePicks', url: lh.prizepicks },
          ],
        },
      ],
    });

    for (let i = 0; i < rows.length; i += 5) {
      const chunk = rows.slice(i, i + 5);
      const embeds = chunk.map((row) => buildGameEmbed(row.g, row.tools, row.props, dayLabel));
      // Buttons on every batch message — sport board (reliable URLs)
      await postDiscord(webhook, {
        embeds,
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 5, label: 'View on FanDuel', url: lh.fanduel },
              { type: 2, style: 5, label: 'View on DraftKings', url: lh.draftkings },
              { type: 2, style: 5, label: 'View on PrizePicks', url: lh.prizepicks },
            ],
          },
        ],
      });
      n += chunk.length;
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
  return (await r.json())[0] || null;
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
  const [rawGames, allProps] = await Promise.all([loadGames(base), loadAllProps(base)]);
  let games = rawGames.filter((g) => stillUpcoming(g.start_time || g.commence_time));
  if (Array.isArray(leaguesFilter) && leaguesFilter.length) {
    const set = new Set(leaguesFilter.map((x) => String(x).toUpperCase()));
    games = games.filter((g) => set.has(String(g.sport || '').toUpperCase()));
  }

  const { today, tomorrow } = todayTomorrowKeys();
  const todayGames = games
    .filter((g) => centralDateKey(g.start_time || g.commence_time) === today)
    .sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));

  // Tomorrow CT + any game 24h–48h out if date key missing
  const tomorrowGames = games
    .filter((g) => {
      const key = centralDateKey(g.start_time || g.commence_time);
      if (key === tomorrow) return true;
      const t = new Date(g.start_time || g.commence_time).getTime();
      const hours = (t - Date.now()) / 3600e3;
      return key !== today && hours > 0 && hours < 48;
    })
    .filter((g) => !todayGames.includes(g))
    .sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));

  const nToday = await sendDay({
    webhook,
    games: todayGames,
    dayLabel: 'TODAY',
    banner: 'TODAY — UPCOMING ONLY',
    allProps,
  });

  await postDiscord(webhook, {
    embeds: [
      {
        title: 'THIS IS ALL BETS FOR TODAY',
        description: `**${nToday}** cards · **${today}** Central · past tip-offs skipped · props when available.`,
        color: 0x22c55e,
      },
    ],
  });

  const nTom = await sendDay({
    webhook,
    games: tomorrowGames,
    dayLabel: 'TOMORROW',
    banner: 'TOMORROW — NEXT DAY SLATE',
    allProps,
  });

  await postDiscord(webhook, {
    embeds: [
      {
        title: 'THIS IS ALL BETS FOR TOMORROW',
        description: `**${nTom}** cards · **${tomorrow}** Central (+ next 48h slate). Tools ran before send.`,
        color: 0x3b82f6,
        footer: { text: 'HelpBet complete' },
        timestamp: new Date().toISOString(),
      },
    ],
  });

  return {
    today: nToday,
    tomorrow: nTom,
    scanned: games.length,
    props_loaded: allProps.length,
    keys: { today, tomorrow },
  };
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
      return res.status(400).json({ error: 'Pass webhook_url or save webhook in Setup.' });
    }

    const stats = await runDigest(webhook, base, leaguesFilter);
    return res.status(200).json({
      ok: true,
      message: 'Posted TODAY + TOMORROW with tools, props, and book buttons',
      ...stats,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
