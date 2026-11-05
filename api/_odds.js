/** Shared odds helpers used by best-bets.js and algorithms.js */

function americanToProb(odds) {
  if (odds == null || !Number.isFinite(Number(odds))) return 0.5;
  const o = Number(odds);
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
}

/** Normalize game shape so engines always see ml_home / ml_away / spread_home. */
export function normalizeForTools(game) {
  const g = { ...(game || {}) };
  const booksIn = g.books || {};
  const books = {};

  for (const [key, raw] of Object.entries(booksIn)) {
    if (!raw || typeof raw !== 'object') continue;
    const row = { ...raw };
    // games.js stores spread on the home side as `spread`
    if (row.spread_home == null && row.spread != null) row.spread_home = row.spread;
    if (row.spread_away == null && row.spread_home != null) row.spread_away = -Number(row.spread_home);
    books[key] = row;
  }

  const fd = books.fanduel || {};
  const dk = books.draftkings || {};
  const primary = g.odds || fd || dk || {};

  const odds = {
    ...(typeof primary === 'object' ? primary : {}),
    ml_home: primary.ml_home ?? fd.ml_home ?? dk.ml_home ?? null,
    ml_away: primary.ml_away ?? fd.ml_away ?? dk.ml_away ?? null,
    spread_home:
      primary.spread_home ??
      primary.spread ??
      fd.spread_home ??
      fd.spread ??
      dk.spread_home ??
      dk.spread ??
      null,
    total: primary.total ?? fd.total ?? dk.total ?? null,
  };
  if (odds.spread == null && odds.spread_home != null) odds.spread = odds.spread_home;

  return {
    ...g,
    sport: g.sport || 'NFL',
    home_team: g.home_team || '',
    away_team: g.away_team || '',
    start_time: g.start_time || g.commence_time || null,
    books,
    odds,
    links: g.links || {},
  };
}

/** Simple moneyline lean from market-implied probability. */
export function winChanceTool(game) {
  const o = game?.odds || {};
  const mlH = o.ml_home;
  const mlA = o.ml_away;
  if (mlH == null && mlA == null) return null;

  const pH = americanToProb(mlH ?? -110);
  const pA = americanToProb(mlA ?? -110);
  const sum = pH + pA || 1;
  const fairH = pH / sum;
  const fairA = pA / sum;

  // Slight home nudge; only fire when one side is clearly stronger in the market
  const homeEdge = fairH + 0.02 - 0.5;
  const awayEdge = fairA - 0.5;

  if (fairH >= 0.55) {
    return {
      algorithm_id: 'win-chance-v1',
      algorithm_name: 'Win Chance',
      recommended_side: 'home',
      confidence: Math.min(0.72, 0.5 + (fairH - 0.5) * 1.2),
      expected_value: Math.max(0.02, homeEdge * 0.4),
      reasoning: `Market implies about ${Math.round(fairH * 100)}% for ${game.home_team || 'home'}. Tool leans home.`,
    };
  }
  if (fairA >= 0.58) {
    return {
      algorithm_id: 'win-chance-v1',
      algorithm_name: 'Win Chance',
      recommended_side: 'away',
      confidence: Math.min(0.7, 0.5 + (fairA - 0.5) * 1.1),
      expected_value: Math.max(0.02, awayEdge * 0.35),
      reasoning: `Market implies about ${Math.round(fairA * 100)}% for ${game.away_team || 'away'}. Tool leans away.`,
    };
  }
  return null;
}

/** Prefer live underdogs in a healthy plus-money band. */
export function underdogValueTool(game) {
  const o = game?.odds || {};
  const mlH = o.ml_home ?? -110;
  const mlA = o.ml_away ?? -110;
  const underdogIsAway = mlA > mlH;
  const dogPrice = underdogIsAway ? mlA : mlH;
  const dogSide = underdogIsAway ? 'away' : 'home';

  // Plus-money underdogs that are not huge longshots
  if (!(dogPrice >= 105 && dogPrice <= 200)) return null;

  const dogProb = americanToProb(dogPrice);
  const edge = 0.03 + Math.min(0.04, (dogPrice - 100) / 2000);

  return {
    algorithm_id: 'underdog-value-v1',
    algorithm_name: 'Underdog Value',
    recommended_side: dogSide,
    confidence: Math.min(0.68, 0.5 + edge * 2),
    expected_value: edge,
    reasoning: `Underdog at ${dogPrice > 0 ? '+' : ''}${dogPrice} on the ${dogSide} side. Small value lean when the price is in this band.`,
  };
}

/* ───────── Team strength (ESPN standings) + consensus model ───────── */
const STANDINGS = { NFL: 'football/nfl', NCAAF: 'football/college-football', NBA: 'basketball/nba', NCAAB: 'basketball/mens-college-basketball', MLB: 'baseball/mlb', NHL: 'hockey/nhl' };
const PD_SCALE = { NBA: 12, NFL: 10, NHL: 1.2, MLB: 1.5, NCAAB: 15, NCAAF: 20 };
const FORM = { at: 0, map: new Map() };
const nk = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
function collectEntries(node, out) {
  if (!node || typeof node !== 'object') return;
  for (const e of node.standings?.entries || []) out.push(e);
  for (const c of node.children || []) collectEntries(c, out);
}
export async function primeForm() {
  if (Date.now() - FORM.at < 30 * 60e3 && FORM.map.size) return FORM.map.size;
  await Promise.all(Object.entries(STANDINGS).map(async ([sport, path]) => {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/v2/sports/${path}/standings?level=3`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
      if (!r.ok) return;
      const entries = [];
      collectEntries(await r.json(), entries);
      for (const e of entries) {
        const st = {};
        for (const x of e.stats || []) st[x.name] = Number(x.value);
        const w = st.wins ?? st.gamesWon, l = st.losses ?? st.gamesLost;
        const gp = st.gamesPlayed ?? ((w ?? 0) + (l ?? 0) + (st.ties ?? 0) + (st.otLosses ?? 0));
        if (!gp) continue;
        const winPct = st.winPercent ?? st.leagueWinPercent ?? ((w ?? 0) / gp);
        const pd = st.pointDifferential ?? st.differential ?? st.pointDiff ?? null;
        const pdpg = pd != null && Number.isFinite(pd) ? pd / gp : null;
        const raw = (Number.isFinite(winPct) ? winPct - 0.5 : 0) * 0.5 + (pdpg != null ? Math.max(-0.5, Math.min(0.5, pdpg / (PD_SCALE[sport] || 10) / 2)) * 0.5 : 0);
        const name = e.team?.displayName || e.team?.name;
        if (name) FORM.map.set(`${sport}|${nk(name)}`, { strength: raw, gp });
      }
    } catch {}
  }));
  if (FORM.map.size) FORM.at = Date.now();
  return FORM.map.size;
}
function formFor(sport, team) {
  const k = `${String(sport).toUpperCase()}|${nk(team)}`;
  if (FORM.map.has(k)) return FORM.map.get(k);
  const last = nk(team).split(' ').pop();
  for (const [kk, v] of FORM.map) if (kk.startsWith(`${String(sport).toUpperCase()}|`) && kk.endsWith(` ${last}`)) return v;
  return null;
}

/** Primary model: devigged consensus of every book, nudged by team strength. */
export function consensusModel(game) {
  const books = Object.values(game?.books || {});
  const rows = books.length ? books : [game?.odds || {}];
  const ps = [];
  for (const b of rows) {
    if (b?.ml_home == null || b?.ml_away == null) continue;
    const h = americanToProb(b.ml_home), a = americanToProb(b.ml_away);
    if (h + a > 0) ps.push(h / (h + a));
  }
  if (!ps.length) return null;
  const mkt = ps.reduce((x, y) => x + y, 0) / ps.length;
  const fh = formFor(game.sport, game.home_team), fa = formFor(game.sport, game.away_team);
  let adj = 0;
  if (fh && fa) {
    const shrink = Math.min(fh.gp, fa.gp) / (Math.min(fh.gp, fa.gp) + 8);
    adj = Math.max(-0.05, Math.min(0.05, (fh.strength - fa.strength) * 0.15 * shrink));
  }
  const pHome = Math.max(0.03, Math.min(0.97, mkt + adj));
  const side = pHome >= 0.5 ? 'home' : 'away';
  const p = side === 'home' ? pHome : 1 - pHome;
  const name = side === 'home' ? game.home_team : game.away_team;
  return {
    algorithm_id: 'consensus-v2',
    algorithm_name: 'Consensus Model',
    recommended_side: side,
    confidence: Math.min(0.92, p),
    expected_value: Math.max(0.01, (p - 0.5) * 0.3),
    consensus: true,
    reasoning: `All books combined give ${name} about ${Math.round((side === 'home' ? mkt : 1 - mkt) * 100)}%${adj ? `; team record and scoring margin adjust that to ${Math.round(p * 100)}%` : ''}.${p < 0.53 ? ' Toss-up game, small lean only.' : ''}`,
  };
}

export { americanToProb };
