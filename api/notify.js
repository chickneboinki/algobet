import crypto from 'node:crypto';

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

function sbEnv() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  };
}

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = sbEnv();
  if (!url || !key) throw new Error('Supabase not configured');
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

const botOn = () => Boolean(process.env.DISCORD_BOT_TOKEN);

async function botApi(method, path, body) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify({ allowed_mentions: { parse: [] }, ...body }) : undefined,
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if (r.status === 429) {
      let wait = 1.5;
      try {
        wait = Math.min(6, Number(JSON.parse(text).retry_after) || 1.5);
      } catch {}
      await sleep(wait * 1000 + 150);
      continue;
    }
    throw new Error(`Discord bot ${r.status}: ${text.slice(0, 160)}`);
  }
  throw new Error('Discord bot rate limited');
}

/** Channel the webhook posts into, so the bot can post interactive messages there. */
async function channelFromWebhook(webhook) {
  try {
    const r = await fetch(webhook);
    if (!r.ok) return null;
    return (await r.json()).channel_id || null;
  } catch {
    return null;
  }
}

async function postDiscord(webhook, payload, wantMessage = false) {
  const wait = webhook.includes('?') ? '&wait=true' : '?wait=true';
  for (let tryN = 0; tryN < 5; tryN++) {
    const dr = await fetch(webhook + wait, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'HelpBet', allowed_mentions: { parse: [] }, ...payload }),
    });
    const text = await dr.text();
    if (dr.ok) {
      await sleep(350);
      if (!wantMessage) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
    // Buttons rejected — strip components and retry
    if (payload.components && dr.status === 400) {
      const { components, ...rest } = payload;
      payload = rest;
      continue;
    }
    if (dr.status === 429) {
      let w = 1.5;
      try {
        w = Math.min(6, Number(JSON.parse(text).retry_after) || 1.5);
      } catch {}
      await sleep(w * 1000 + 150);
      continue;
    }
    throw new Error(`Discord ${dr.status}: ${text.slice(0, 160)}`);
  }
  throw new Error('Discord rate limited');
}

/** Select menu + DraftKings / FanDuel / Kings Sum buttons, shown under every game embed. */
function gameComponents(id) {
  return [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `cat|${id}`,
          placeholder: 'Pick a category…',
          options: [
            { label: 'Players & stats', value: 'players', description: 'Every player line for this game', emoji: { name: '🏀' } },
            { label: 'What to bet on', value: 'bet', description: 'Best team + player picks', emoji: { name: '🎯' } },
            { label: 'Best chances (all stats)', value: 'chances', description: 'Everything ranked by hit chance', emoji: { name: '📈' } },
          ],
        },
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: 'DraftKings', custom_id: `bk|dk|${id}`, emoji: { name: '🟢' } },
        { type: 2, style: 1, label: 'FanDuel', custom_id: `bk|fd|${id}`, emoji: { name: '🔵' } },
        { type: 2, style: 3, label: 'Kings Sum', custom_id: `bk|ks|${id}`, emoji: { name: '👑' } },
      ],
    },
  ];
}

function buildGameEmbed(game, tools, props, dayLabel, interactive = false) {
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
    lines.push('**Top player plays**');
    for (const pr of props.slice(0, 4)) {
      const lean = pr.lean ? ` → **${String(pr.lean.side).toUpperCase()}** (${pr.lean.strength})` : '';
      lines.push(`• **${pr.player}** ${pr.market} **${pr.line}**${lean}`);
    }
  }
  lines.push('');
  if (interactive) {
    lines.push('_Use the menu and buttons below for players, what to bet on, and each book\'s best picks._');
  } else {
    lines.push(`Open ${sport} board:`);
    lines.push(`[FanDuel ${sport}](${urls.fanduel})`);
    lines.push(`[DraftKings ${sport}](${urls.draftkings})`);
    lines.push(`[PrizePicks](${urls.prizepicks})`);
  }

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

const DAYS_AHEAD = 3; // today + next 3 days, same for manual Send and the daily auto-send
const PER_DAY_CAP = 10;

function dayKeys(n) {
  const { today } = todayTomorrowKeys();
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: n + 1 }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d + i, 12)).toISOString().slice(0, 10)
  );
}

function dayLabelFor(key, i) {
  if (i === 0) return 'TODAY';
  if (i === 1) return 'TOMORROW';
  return new Date(`${key}T12:00:00Z`)
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
    .toUpperCase();
}

const slimProp = (p) => ({
  player: p.player,
  team: p.team || null,
  market: p.market_label || p.market,
  line: p.line,
  book: p.book,
  over: p.over ?? null,
  under: p.under ?? null,
  lean: p.lean || null,
});

async function loadGameProps(base, g) {
  const empty = { props: [], top_plays: [] };
  try {
    const q = new URLSearchParams({
      sport: String(g.sport || '').toUpperCase(),
      home: g.home_team || '',
      away: g.away_team || '',
    });
    const r = await fetch(`${base}/api/props?${q}`);
    const text = await r.text();
    if (!r.ok || text.trim().startsWith('<')) return empty;
    const d = JSON.parse(text);
    return { props: (d.props || []).slice(0, 60).map(slimProp), top_plays: (d.top_plays || []).map(slimProp) };
  } catch {
    return empty;
  }
}

const slimGame = (g) => ({
  id: g.id,
  sport: g.sport,
  home_team: g.home_team,
  away_team: g.away_team,
  start_time: g.start_time || g.commence_time || null,
  odds: g.odds || null,
  books: g.books || null,
});

async function sendDay(ctx, { games, dayLabel, banner, color }) {
  const { webhook, channelId, base, state } = ctx;
  const interactive = () => Boolean(botOn() && channelId && !state.botError);

  // Banners/summary go through the same sender as the cards so the channel looks consistent
  const say = async (payload) => {
    if (interactive()) {
      try {
        await botApi('POST', `/channels/${channelId}/messages`, payload);
        await sleep(300);
        return;
      } catch (e) {
        state.botError = e.message;
      }
    }
    await postDiscord(webhook, payload);
  };

  if (!games.length) {
    await say({
      embeds: [{ title: banner, description: `No upcoming games with lines for ${dayLabel.toLowerCase()} yet.`, color: 0x71717a }],
    });
    return 0;
  }

  const ranked = games
    .map((g) => {
      const tools = runToolsOnGame(g);
      const score = tools[0] ? (tools[0].confidence || 0) * (1 + (tools[0].expected_value || 0)) : 0;
      return { g, tools, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, PER_DAY_CAP)
    .sort(
      (a, b) =>
        String(a.g.sport).localeCompare(String(b.g.sport)) ||
        new Date(a.g.start_time || a.g.commence_time || 0) - new Date(b.g.start_time || b.g.commence_time || 0)
    );

  for (let i = 0; i < ranked.length; i += 8) {
    await Promise.all(
      ranked.slice(i, i + 8).map(async (row) => {
        row.pp = await loadGameProps(base, row.g);
      })
    );
  }

  await say({
    content: `**════════ ${banner} ════════**\n${ranked.length} of ${games.length} games · pick a category or tap DraftKings / FanDuel / Kings Sum under any card`,
    embeds: [{ title: banner, description: 'Central time · past tip-offs skipped · cards update to FINAL when the game ends', color }],
  });

  const saved = [];
  for (const row of ranked) {
    const id = crypto.randomUUID();
    const lh = hubs(row.g.sport);
    let msg = null;
    let via = 'webhook';

    if (interactive()) {
      try {
        msg = await botApi('POST', `/channels/${channelId}/messages`, {
          embeds: [buildGameEmbed(row.g, row.tools, row.pp.top_plays, dayLabel, true)],
          components: gameComponents(id),
        });
        via = 'bot';
        await sleep(300);
      } catch (e) {
        state.botError = e.message;
      }
    }
    if (!msg) {
      msg = await postDiscord(
        webhook,
        {
          embeds: [buildGameEmbed(row.g, row.tools, row.pp.top_plays, dayLabel, false)],
          components: [
            {
              type: 1,
              components: [
                { type: 2, style: 5, label: 'DraftKings', url: lh.draftkings },
                { type: 2, style: 5, label: 'FanDuel', url: lh.fanduel },
                { type: 2, style: 5, label: 'PrizePicks', url: lh.prizepicks },
              ],
            },
          ],
        },
        true
      );
    }
    if (msg?.id) {
      saved.push({
        id,
        message_id: msg.id,
        channel_id: msg.channel_id || channelId || null,
        via,
        webhook: via === 'webhook' ? webhook : null,
        game_id: String(row.g.id || ''),
        sport: String(row.g.sport || '').toUpperCase(),
        home_team: row.g.home_team,
        away_team: row.g.away_team,
        start_time: row.g.start_time || row.g.commence_time || null,
        snapshot: { game: slimGame(row.g), tools: row.tools, props: row.pp.props, top_plays: row.pp.top_plays },
      });
    }
    if (via === 'bot') state.interactive += 1;
  }

  if (saved.length) {
    try {
      await sb('discord_posts', { method: 'POST', body: saved, prefer: 'return=minimal' });
    } catch (e) {
      state.tableError = e.message;
    }
  }
  return ranked.length;
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
  const rawGames = await loadGames(base);
  let games = rawGames.filter((g) => stillUpcoming(g.start_time || g.commence_time));
  if (Array.isArray(leaguesFilter) && leaguesFilter.length) {
    const set = new Set(leaguesFilter.map((x) => String(x).toUpperCase()));
    games = games.filter((g) => set.has(String(g.sport || '').toUpperCase()));
  }

  const keys = dayKeys(DAYS_AHEAD);
  const channelId = botOn() ? await channelFromWebhook(webhook) : null;
  const ctx = { webhook, channelId, base, state: { botError: null, tableError: null, interactive: 0 } };
  const COLORS = [0x22c55e, 0x3b82f6, 0xa855f7, 0xf59e0b];
  const days = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const label = dayLabelFor(key, i);
    const dayGames = games
      .filter((g) => centralDateKey(g.start_time || g.commence_time) === key)
      .sort((a, b) => new Date(a.start_time || a.commence_time || 0) - new Date(b.start_time || b.commence_time || 0));
    const n = await sendDay(ctx, {
      games: dayGames,
      dayLabel: label,
      banner: i === 0 ? 'TODAY — UPCOMING ONLY' : `${label} — ADVANCE SLATE`,
      color: COLORS[i % COLORS.length],
    });
    days.push({ date: key, label, cards: n });
  }

  const total = days.reduce((s, d) => s + d.cards, 0);
  const summary = {
    embeds: [
      {
        title: `THIS IS ALL BETS FOR THE NEXT ${DAYS_AHEAD} DAYS`,
        description: days.map((d) => `**${d.label}** · ${d.cards} cards`).join('\n') + `\n\n${total} cards total · tools ran before send.`,
        color: 0x22c55e,
        footer: { text: 'HelpBet complete' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
  if (botOn() && channelId && !ctx.state.botError) {
    try {
      await botApi('POST', `/channels/${channelId}/messages`, summary);
    } catch {
      await postDiscord(webhook, summary);
    }
  } else {
    await postDiscord(webhook, summary);
  }

  return {
    days,
    today: days[0]?.cards ?? 0,
    tomorrow: days[1]?.cards ?? 0,
    total,
    scanned: games.length,
    interactive_cards: ctx.state.interactive,
    bot_error: ctx.state.botError || (botOn() ? null : 'Bot not configured — cards use link buttons only'),
    table_error: ctx.state.tableError,
    keys,
  };
}

/* ───────────── Interactive replies (hidden "Only you can see this" messages) ───────────── */

const BOOKS = { dk: { name: 'DraftKings', key: 'draftkings' }, fd: { name: 'FanDuel', key: 'fanduel' } };
const STRENGTH_PCT = { High: 0.68, Medium: 0.6, Low: 0.55 };

function mlPrice(game, bookKey, side) {
  const b = game.books?.[bookKey] || (bookKey === 'fanduel' ? game.odds : null) || {};
  return side === 'home' ? b.ml_home ?? null : side === 'away' ? b.ml_away ?? null : null;
}

/** Best ML price for a side across both books. */
function bestPrice(game, side) {
  const cands = Object.values(BOOKS)
    .map((b) => ({ book: b.name, price: mlPrice(game, b.key, side) }))
    .filter((c) => c.price != null);
  if (!cands.length) return null;
  return cands.sort((a, b) => b.price - a.price)[0];
}

function propLine(p) {
  const side = p.lean?.side ? p.lean.side.toUpperCase() : '';
  const tag = p.lean ? ` — **${side}** (${p.lean.strength})` : '';
  return `• **${p.player}**${p.team ? ` (${p.team})` : ''} ${p.market} **${p.line}**${tag}`;
}

function teamLine(game, t, bookKey) {
  const name = sideLabel(t.recommended_side, game.home_team, game.away_team);
  let price = '';
  if (bookKey) {
    const p = mlPrice(game, bookKey, t.recommended_side);
    price = p != null ? ` · ML **${fmtOdds(p)}**` : '';
  } else {
    const bp = bestPrice(game, t.recommended_side);
    price = bp ? ` · best ML **${fmtOdds(bp.price)}** @ ${bp.book}` : '';
  }
  return `**${name}** — ${t.algorithm_name} · Sure **${Math.round((t.confidence || 0) * 100)}%** · Edge **${((t.expected_value || 0) * 100).toFixed(1)}%**${price}\n_${t.reasoning}_`;
}

function propChance(p) {
  if (p.lean?.prob) return p.lean.prob;
  return STRENGTH_PCT[p.lean?.strength] || 0.5;
}

function bookReply(s, bk) {
  const g = s.game;
  const title = `${g.away_team} @ ${g.home_team}`;
  const tools = s.tools || [];
  const plays = (s.top_plays || []).slice(0, 4);

  if (bk === 'ks') {
    const votes = { home: 0, away: 0 };
    for (const t of tools) if (votes[t.recommended_side] != null) votes[t.recommended_side] += 1;
    const lines = [];
    lines.push(`**Tool vote:** ${g.home_team} ${votes.home} · ${g.away_team} ${votes.away}`);
    lines.push('');
    lines.push('**Team picks (best price shown)**');
    if (tools.length) for (const t of tools.slice(0, 3)) lines.push(teamLine(g, t, null));
    else lines.push('No strong team edge on this one.');
    lines.push('');
    lines.push('**Player plays**');
    if (plays.length) for (const p of plays) lines.push(propLine(p));
    else lines.push('No player props posted yet — they usually appear 1–2 days before kickoff.');
    lines.push('');
    lines.push('**Line shop**');
    for (const b of Object.values(BOOKS)) {
      const bb = g.books?.[b.key] || {};
      lines.push(`${b.name}: ML ${fmtOdds(bb.ml_home)}/${fmtOdds(bb.ml_away)} · spr ${bb.spread ?? bb.spread_home ?? '—'} · tot ${bb.total ?? '—'}`);
    }
    return { title: `👑 Kings Sum · ${title}`, description: lines.join('\n'), color: 0xf5b301 };
  }

  const b = BOOKS[bk];
  const other = bk === 'dk' ? BOOKS.fd : BOOKS.dk;
  const bb = g.books?.[b.key] || (bk === 'fd' ? g.odds : null) || {};
  const lines = [];
  lines.push(`**Prices at ${b.name}**`);
  lines.push(`ML ${fmtOdds(bb.ml_home)} (${g.home_team}) / ${fmtOdds(bb.ml_away)} (${g.away_team}) · spr ${bb.spread ?? bb.spread_home ?? '—'} · tot ${bb.total ?? '—'}`);
  lines.push('');
  lines.push(`**Best picks for ${b.name}**`);
  if (tools.length) {
    for (const t of tools.slice(0, 2)) {
      lines.push(teamLine(g, t, b.key));
      const mine = mlPrice(g, b.key, t.recommended_side);
      const theirs = mlPrice(g, other.key, t.recommended_side);
      if (mine != null && theirs != null) {
        lines.push(mine >= theirs ? `✅ ${b.name} has the best price on this side.` : `⚠️ ${other.name} pays more (${fmtOdds(theirs)}).`);
      }
    }
  } else lines.push('No strong team edge here.');
  lines.push('');
  lines.push('**Player plays**');
  if (plays.length) {
    for (const p of plays.slice(0, 3)) lines.push(propLine(p));
    lines.push(`_Player lines come from PrizePicks/Underdog — use them as a guide for player markets at ${b.name}._`);
  } else lines.push('No player props posted yet.');
  return { title: `${b.name} · ${title}`, description: lines.join('\n'), color: bk === 'dk' ? 0x53d337 : 0x1493ff };
}

function categoryReply(s, cat) {
  const g = s.game;
  const title = `${g.away_team} @ ${g.home_team}`;
  const tools = s.tools || [];
  const props = s.props || [];
  const plays = s.top_plays || [];
  const lines = [];

  if (cat === 'players') {
    const byPlayer = new Map();
    for (const p of props) {
      if (!byPlayer.has(p.player)) byPlayer.set(p.player, { team: p.team, rows: new Map() });
      byPlayer.get(p.player).rows.set(p.market, p.line);
    }
    if (!byPlayer.size) lines.push('No player props posted yet — they usually appear 1–2 days before kickoff.');
    for (const [name, v] of [...byPlayer.entries()].slice(0, 14)) {
      lines.push(`**${name}**${v.team ? ` (${v.team})` : ''} — ` + [...v.rows.entries()].slice(0, 5).map(([m, l]) => `${m} ${l}`).join(' · '));
    }
    return { title: `🏀 Players & stats · ${title}`, description: lines.join('\n'), color: 0x38bdf8 };
  }

  if (cat === 'bet') {
    lines.push('**Best team bet**');
    lines.push(tools[0] ? teamLine(g, tools[0], null) : 'No strong team edge — prices only.');
    lines.push('');
    lines.push('**Best player bets**');
    if (plays.length) for (const p of plays.slice(0, 5)) lines.push(`${propLine(p)}\n_${p.lean.why}_`);
    else lines.push('No player props with an edge yet.');
    return { title: `🎯 What to bet on · ${title}`, description: lines.join('\n'), color: 0x22c55e };
  }

  const ranked = [
    ...tools.map((t) => ({ pct: t.confidence || 0, text: `**TEAM** ${sideLabel(t.recommended_side, g.home_team, g.away_team)} ML — ${t.algorithm_name}` })),
    ...plays.map((p) => ({ pct: propChance(p), text: `**PLAYER** ${p.player} ${p.lean.side.toUpperCase()} ${p.line} ${p.market}` })),
  ]
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);
  if (!ranked.length) lines.push('Nothing has an edge on this game yet.');
  ranked.forEach((r, i) => lines.push(`${i + 1}. ${r.text} — **${Math.round(r.pct * 100)}%**`));
  lines.push('');
  lines.push('_Percent = tool confidence / market-implied chance. An estimate, not a guarantee._');
  return { title: `📈 Best chances · ${title}`, description: lines.join('\n'), color: 0xa855f7 };
}

function verifyDiscord(raw, sig, ts) {
  const pub = process.env.DISCORD_PUBLIC_KEY;
  if (!pub || !sig || !ts) return false;
  try {
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pub, 'hex')]);
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(ts + raw), key, Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}

async function handleInteraction(req, res, raw) {
  if (!verifyDiscord(raw, req.headers['x-signature-ed25519'], req.headers['x-signature-timestamp'])) {
    return res.status(401).send('invalid request signature');
  }
  const it = JSON.parse(raw);
  if (it.type === 1) return res.status(200).json({ type: 1 }); // PING

  const reply = (embed) =>
    res.status(200).json({
      type: 4,
      data: { flags: 64, embeds: [{ ...embed, description: String(embed.description).slice(0, 4000), footer: { text: 'HelpBet · only you can see this' } }] },
    });
  const say = (text) => res.status(200).json({ type: 4, data: { flags: 64, content: text } });

  if (it.type !== 3) return say('Unsupported action.');
  const [kind, a, b] = String(it.data?.custom_id || '').split('|');
  const postId = kind === 'cat' ? a : b;
  try {
    const rows = await sb(`discord_posts?id=eq.${encodeURIComponent(postId)}&select=snapshot,status,result&limit=1`);
    const row = rows?.[0];
    if (!row) return say('That card has expired. Ask for a fresh send.');
    const s = row.snapshot;
    if (kind === 'bk') return reply(bookReply(s, a));
    if (kind === 'cat') return reply(categoryReply(s, it.data?.values?.[0]));
  } catch (e) {
    return say(`Could not load picks: ${e.message}`);
  }
  return say('Unknown button.');
}

/* ───────────── Game over → edit the message with final score + bet result ───────────── */

const ESPN_PATHS = {
  NFL: 'football/nfl',
  NCAAF: 'football/college-football',
  NBA: 'basketball/nba',
  NCAAB: 'basketball/mens-college-basketball',
  MLB: 'baseball/mlb',
  NHL: 'hockey/nhl',
};

function tKey(n) {
  return String(n || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}
function sameTeam(a, b) {
  const x = tKey(a);
  const y = tKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xp = x.split(/\s+/).pop();
  const yp = y.split(/\s+/).pop();
  return Boolean((xp && y.includes(xp)) || (yp && x.includes(yp)));
}

async function loadScoreboard(sport, fromKey, toKey) {
  const path = ESPN_PATHS[sport];
  if (!path) return [];
  const f = (k) => k.replace(/-/g, '');
  const r = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${f(fromKey)}-${f(toKey)}&limit=400`,
    { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
  );
  if (!r.ok) return [];
  const data = await r.json();
  const out = [];
  for (const ev of data.events || []) {
    const comp = (ev.competitions || [])[0] || {};
    const st = comp.status?.type || {};
    const home = (comp.competitors || []).find((c) => c.homeAway === 'home');
    const away = (comp.competitors || []).find((c) => c.homeAway === 'away');
    if (!home || !away) continue;
    out.push({
      final: Boolean(st.completed) || st.state === 'post' || st.name === 'STATUS_FINAL',
      voided: ['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_CANCELLED'].includes(st.name),
      detail: st.shortDetail || st.description || '',
      home_team: home.team?.displayName,
      away_team: away.team?.displayName,
      home_score: Number(home.score),
      away_score: Number(away.score),
    });
  }
  return out;
}

function gradeSide(side, hs, as) {
  if (hs === as) return 'push';
  const homeWon = hs > as;
  return (side === 'home' && homeWon) || (side === 'away' && !homeWon) ? 'hit' : 'miss';
}

const GRADE_TXT = { hit: '✅ HIT', miss: '❌ MISSED', push: '➖ PUSH' };

function finalEmbed(row, m) {
  const g = row.snapshot.game;
  const tools = row.snapshot.tools || [];
  const sport = String(row.sport || '').toUpperCase();
  const title = `${sport}: ${g.away_team} @ ${g.home_team}`;
  if (m.voided) {
    return { title: `⚠️ ${title}`, description: `**GAME NOT PLAYED** — ${m.detail || 'postponed / cancelled'}\nBet is void.`, color: 0x71717a, footer: { text: 'HelpBet · final' } };
  }
  const winner = m.home_score === m.away_score ? 'Tie' : m.home_score > m.away_score ? g.home_team : g.away_team;
  const lines = [`**GAME IS OVER**`, `**Final: ${g.away_team} ${m.away_score} – ${m.home_score} ${g.home_team}** (${winner === 'Tie' ? 'tie' : `${winner} win`})`, ''];
  let color = 0x71717a;
  if (tools[0]) {
    const gr = gradeSide(tools[0].recommended_side, m.home_score, m.away_score);
    color = gr === 'hit' ? 0x22c55e : gr === 'miss' ? 0xef4444 : 0x71717a;
    lines.push(`**Best bet: ${sideLabel(tools[0].recommended_side, g.home_team, g.away_team)} ML (${tools[0].algorithm_name}) → ${GRADE_TXT[gr]}**`);
    const rest = tools.slice(1, 4).map((t) => `${t.algorithm_name} → ${sideLabel(t.recommended_side, g.home_team, g.away_team)} ${GRADE_TXT[gradeSide(t.recommended_side, m.home_score, m.away_score)]}`);
    if (rest.length) lines.push('Other tools: ' + rest.join(' · '));
  } else {
    lines.push('No strong lean was posted for this game.');
  }
  lines.push('', '_Team bets graded on the moneyline. Player props are not auto-graded._');
  return { title: `🏁 FINAL · ${title}`, description: lines.join('\n'), color, footer: { text: 'HelpBet · final result' } };
}

async function editPostedMessage(row, embed) {
  const body = { content: '', embeds: [embed], components: [] };
  if (row.via === 'bot' && botOn()) {
    return botApi('PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, body);
  }
  if (row.webhook) {
    const r = await fetch(`${row.webhook}/messages/${row.message_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Discord ${r.status}`);
    return null;
  }
  throw new Error('No way to edit this message');
}

async function finalizeGames() {
  const cutoff = new Date(Date.now() - 150 * 60e3).toISOString();
  const rows = await sb(`discord_posts?status=eq.open&start_time=lt.${cutoff}&order=start_time.asc&limit=40&select=*`);
  const out = { checked: rows?.length || 0, finalized: 0, still_open: 0, errors: [] };
  if (!rows?.length) return out;

  const bySport = new Map();
  for (const r of rows) {
    const k = centralDateKey(r.start_time);
    if (!k) continue;
    const cur = bySport.get(r.sport) || { from: k, to: k };
    if (k < cur.from) cur.from = k;
    if (k > cur.to) cur.to = k;
    bySport.set(r.sport, cur);
  }
  const boards = new Map();
  for (const [sport, range] of bySport) {
    const [y, m, d] = range.to.split('-').map(Number);
    const to = new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString().slice(0, 10);
    try {
      boards.set(sport, await loadScoreboard(sport, range.from, to));
    } catch {
      boards.set(sport, []);
    }
  }

  for (const row of rows) {
    const m = (boards.get(row.sport) || []).find(
      (x) => (x.final || x.voided) && sameTeam(x.home_team, row.home_team) && sameTeam(x.away_team, row.away_team)
    );
    if (!m) {
      if (Date.now() - new Date(row.start_time).getTime() > 48 * 3600e3) {
        await sb(`discord_posts?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'expired' }, prefer: 'return=minimal' }).catch(() => {});
      } else out.still_open += 1;
      continue;
    }
    try {
      await editPostedMessage(row, finalEmbed(row, m));
      await sleep(300);
    } catch (e) {
      out.errors.push(`${row.id}: ${e.message}`);
    }
    await sb(`discord_posts?id=eq.${row.id}`, {
      method: 'PATCH',
      body: { status: m.voided ? 'void' : 'final', result: { home_score: m.home_score, away_score: m.away_score, voided: m.voided } },
      prefer: 'return=minimal',
    }).catch(() => {});
    out.finalized += 1;
  }
  return out;
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const base = process.env.APP_URL || 'https://helpbet.vercel.app';
  const params = new URL(req.url, 'http://localhost').searchParams;
  const route = params.get('route');

  try {
    const raw = await readRaw(req);

    if (route === 'interactions') return await handleInteraction(req, res, raw);
    if (route === 'finalize') return res.status(200).json({ ok: true, ...(await finalizeGames()) });

    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {}

    if (body.all_users || params.get('all_users') === '1') {
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
      if (!us?.discord_webhook) return res.status(400).json({ error: 'No webhook on this account. Add one in Setup.' });
      webhook = us.discord_webhook;
      if (!leaguesFilter) leaguesFilter = us.notify_config?.auto_post_leagues;
    }
    if (!webhook || !String(webhook).includes('discord.com')) {
      return res.status(400).json({ error: 'Pass webhook_url or save webhook in Setup.' });
    }

    const stats = await runDigest(webhook, base, leaguesFilter);
    return res.status(200).json({
      ok: true,
      message: `Posted the next ${DAYS_AHEAD} days with tools, props, and buttons`,
      ...stats,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
