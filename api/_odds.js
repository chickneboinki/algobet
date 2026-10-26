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

export { americanToProb };
