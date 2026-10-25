import { americanToProb } from './_odds.js';

/**
 * Live player props for ONE game.
 * Sources: PrizePicks (More/Less) + Underdog (Higher/Lower, with prices).
 * The game is matched by team name, so every prop returned belongs to that game.
 */

// PrizePicks league ids (used to narrow the board; falls back to the full board if empty)
const PP_LEAGUE_ID = { NFL: 9, NBA: 7, NHL: 8, MLB: 2, NCAAF: 15, NCAAB: 20 };

const PARTIAL_RE = /\b(1st|2nd|3rd|4th|1h|2h|1q|2q|3q|4q|1st half|2nd half|first half|second half)\b/i;
const UD_PARTIAL_RE = /^(1q|2q|3q|4q|1h|2h)\b/i;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Words that identify a team: full name, nickname, and (for college) the school name. */
function teamKeys(name, sport) {
  const full = norm(name);
  if (!full) return [];
  const words = full.split(' ');
  const keys = new Set([full]);
  if (words.length > 1) keys.add(words[words.length - 1]); // nickname: "saints"
  if ((sport === 'NCAAF' || sport === 'NCAAB') && words.length > 1) keys.add(words.slice(0, -1).join(' ')); // "alabama"
  return [...keys].filter((k) => k.length >= 3);
}

function textHasTeam(text, keys) {
  const t = ` ${norm(text)} `;
  return keys.some((k) => t.includes(` ${k} `));
}


/** Make "Rush+Rec Yds" and "Rush + Rec Yards" look the same so books can be compared. */
function marketKey(m) {
  return norm(String(m || '').replace(/\s*\+\s*/g, '+'))
    .replace(/\byds\b/g, 'yards')
    .replace(/\brec\b/g, 'receiving')
    .replace(/\breceiving\+/g, 'rec+');
}

const STRENGTH_RANK = { High: 3, Medium: 2, Low: 1 };

/**
 * Two simple player tools:
 *  1) Line Gap   - PrizePicks and Underdog post different lines for the same stat.
 *                  The lower number is the easier Over, the higher number the easier Under.
 *  2) Market Lean - Underdog's Over/Under prices show which side the market thinks is likelier.
 */
function addPlayerTools(props) {
  const groups = new Map();
  for (const p of props) {
    const k = `${norm(p.player)}|${marketKey(p.market)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }

  for (const rows of groups.values()) {
    const pp = rows.find((r) => r.source === 'prizepicks');
    const ud = rows.find((r) => r.source === 'underdog');

    // 1) Line gap
    if (pp && ud && pp.line != null && ud.line != null) {
      const diff = Math.abs(pp.line - ud.line);
      const avg = (pp.line + ud.line) / 2;
      const needed = Math.max(1, avg * 0.04);
      if (diff >= needed) {
        const low = pp.line < ud.line ? pp : ud;
        const high = low === pp ? ud : pp;
        const pct = diff / avg;
        const strength = pct >= 0.08 ? 'High' : pct >= 0.05 ? 'Medium' : 'Low';
        low.lean = {
          side: 'over', strength, type: 'Line gap', gap: diff,
          why: `${high.book} has this at ${high.line} but ${low.book} has it at ${low.line}. Over ${low.line} is the easier number.`,
        };
        high.lean = {
          side: 'under', strength, type: 'Line gap', gap: diff,
          why: `${high.book} has this at ${high.line} but ${low.book} has it at ${low.line}. Under ${high.line} is the easier number.`,
        };
      }
    }

    // 2) Market lean (only if no line gap already set, and both prices exist)
    for (const r of rows) {
      if (r.lean || r.over == null || r.under == null) continue;
      const po = americanToProb(r.over);
      const pu = americanToProb(r.under);
      if (po == null || pu == null) continue;
      const overProb = po / (po + pu);
      const side = overProb >= 0.5 ? 'over' : 'under';
      const prob = side === 'over' ? overProb : 1 - overProb;
      if (prob < 0.54) continue;
      r.lean = {
        side,
        strength: prob >= 0.6 ? 'High' : prob >= 0.57 ? 'Medium' : 'Low',
        type: 'Market lean',
        prob,
        why: `${r.book}'s prices imply the ${side} hits about ${Math.round(prob * 100)}% of the time.`,
      };
    }
  }
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function fetchPrizePicks(sport) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json',
  };
  const base = 'https://partner-api.prizepicks.com/projections?single_stat=true&per_page=1000';
  let body;
  const lid = PP_LEAGUE_ID[sport];
  if (lid) {
    try {
      body = await fetchJson(`${base}&league_id=${lid}`, headers);
      if (!(body.data || []).length) body = null;
    } catch {
      body = null;
    }
  }
  if (!body) body = await fetchJson(base, headers);

  const players = {};
  for (const row of body.included || []) {
    if (row.type === 'new_player') players[row.id] = row.attributes || {};
  }
  const out = [];
  for (const d of body.data || []) {
    const a = d.attributes || {};
    if (a.odds_type && a.odds_type !== 'standard') continue; // skip demon/goblin alternate lines
    const p = players[d.relationships?.new_player?.data?.id] || {};
    const market = a.stat_type || a.stat_display_name || 'Prop';
    out.push({
      id: `pp-${d.id}`,
      player: p.display_name || p.name || 'Player',
      market,
      market_label: market,
      line: a.line_score != null ? Number(a.line_score) : null,
      over: null,
      under: null,
      labels: ['More', 'Less'],
      book: 'PrizePicks',
      source: 'prizepicks',
      live: Boolean(a.is_live) || a.status === 'in_progress',
      team: p.team_name || p.team || null,
      league: String(p.league || a.league || '').toUpperCase(),
      game_title: a.description || null,
      partial: PARTIAL_RE.test(a.description || '') || PARTIAL_RE.test(market),
    });
  }
  return out;
}

async function fetchUnderdog() {
  const data = await fetchJson('https://api.underdogfantasy.com/v1/over_under_lines', {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    Accept: 'application/json',
  });
  const players = Object.fromEntries((data.players || []).map((p) => [p.id, p]));
  const apps = Object.fromEntries((data.appearances || []).map((a) => [a.id, a]));
  const games = Object.fromEntries((data.games || []).map((g) => [g.id, g]));
  const out = [];
  for (const line of data.over_under_lines || []) {
    if (line.status && line.status !== 'active') continue;
    const ou = line.over_under || {};
    const st = ou.appearance_stat || {};
    const app = apps[st.appearance_id] || {};
    const player = players[app.player_id] || {};
    const game = games[app.match_id] || {};
    let playerName =
      player.first_name && player.last_name ? `${player.first_name} ${player.last_name}` : player.name || null;
    let over = null;
    let under = null;
    for (const opt of line.options || []) {
      if (!playerName && opt.selection_header) playerName = opt.selection_header;
      const priceRaw = opt.american_price || opt.odds?.fantasy?.american;
      const price = priceRaw != null ? Number(String(priceRaw).replace(/^\+/, '')) : null;
      const choice = (opt.choice || '').toLowerCase();
      if (choice === 'higher' || choice === 'over') over = Number.isFinite(price) ? price : null;
      if (choice === 'lower' || choice === 'under') under = Number.isFinite(price) ? price : null;
    }
    const market = st.display_stat || st.stat || 'Prop';
    out.push({
      id: `ud-${line.id}`,
      player: playerName || 'Player',
      market,
      market_label: market,
      line: line.stat_value != null ? Number(line.stat_value) : null,
      over,
      under,
      labels: ['Over', 'Under'],
      book: 'Underdog',
      source: 'underdog',
      live: Boolean(line.live_event) || Boolean(game.live),
      team: null,
      league: String(game.sport_id || '').toUpperCase(),
      game_title: game.full_team_names_title || game.abbreviated_title || '',
      partial: UD_PARTIAL_RE.test(market),
    });
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sport = String(req.query.sport || '').toUpperCase();
  const home = String(req.query.home || '');
  const away = String(req.query.away || '');
  const scope = String(req.query.scope || 'game'); // "game" = full-game only, "all" = include halves/quarters
  const combos = req.query.combos === '1';

  const homeKeys = teamKeys(home, sport);
  const awayKeys = teamKeys(away, sport);
  const haveTeams = homeKeys.length > 0 && awayKeys.length > 0;

  const sources = {};
  const [pp, ud] = await Promise.all([
    fetchPrizePicks(sport).catch((e) => ((sources.prizepicks = `error ${e.message}`), [])),
    fetchUnderdog().catch((e) => ((sources.underdog = `error ${e.message}`), [])),
  ]);

  const keep = (p, isPP) => {
    if (!combos && / \+ /.test(p.player)) return false; // combo props (two players)
    if (scope !== 'all' && p.partial) return false;
    if (p.line == null) return false;
    if (!haveTeams) return true;
    if (isPP) {
      // PrizePicks gives the player's team; it must be one of the two teams playing
      return textHasTeam(p.team, homeKeys) || textHasTeam(p.team, awayKeys);
    }
    // Underdog gives "Away Team @ Home Team"; both teams must appear
    return textHasTeam(p.game_title, homeKeys) && textHasTeam(p.game_title, awayKeys);
  };

  const ppKept = pp.filter((p) => keep(p, true));
  const udKept = ud.filter((p) => keep(p, false));
  sources.prizepicks = sources.prizepicks || ppKept.length;
  sources.underdog = sources.underdog || udKept.length;

  const seen = new Set();
  const props = [...udKept, ...ppKept]
    .filter((p) => {
      const k = `${p.book}|${p.player}|${p.market}|${p.line}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => Number(b.live) - Number(a.live) || a.player.localeCompare(b.player))
    .slice(0, 400);

  // Fill in each player's team (Underdog does not say; PrizePicks does)
  const teamOf = {};
  for (const p of props) if (p.team) teamOf[norm(p.player)] = p.team;
  for (const p of props) if (!p.team) p.team = teamOf[norm(p.player)] || null;

  addPlayerTools(props);

  const top_plays = props
    .filter((p) => p.lean)
    .sort(
      (a, b) =>
        STRENGTH_RANK[b.lean.strength] - STRENGTH_RANK[a.lean.strength] ||
        (b.lean.type === 'Line gap') - (a.lean.type === 'Line gap') ||
        (b.lean.gap || b.lean.prob || 0) - (a.lean.gap || a.lean.prob || 0)
    )
    .slice(0, 8);

  const live_count = props.filter((p) => p.live).length;

  return res.status(200).json({
    source: props.length ? 'live' : 'empty',
    count: props.length,
    live_count,
    top_plays,
    props,
    sources_tried: sources,
    note: props.length
      ? 'Live player props from PrizePicks and Underdog.'
      : 'No player props are posted for this game yet. They usually appear a day or two before kickoff.',
  });
}
