// Shared odds math. The leading underscore keeps Vercel from exposing this file as an endpoint.

export function americanToProb(odds) {
  if (odds == null || Number.isNaN(Number(odds))) return null;
  const o = Number(odds);
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
}

/** Decimal payout multiplier for a winning $1 bet, e.g. +150 -> 2.5, -200 -> 1.5 */
export function decimalFromAmerican(odds) {
  const o = Number(odds);
  return o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);
}

/** Remove the sportsbook's cut from a two-way price. Returns [probA, probB] that sum to 1. */
export function noVig(oddsA, oddsB) {
  const a = americanToProb(oddsA);
  const b = americanToProb(oddsB);
  if (a == null || b == null) return null;
  const t = a + b;
  return [a / t, b / t];
}

/**
 * True win chance for each team, from every book that has both moneylines.
 * Also finds the best price per side and how much that price beats the fair chance by.
 */
export function consensus(game) {
  const books = Object.values(game.books || {}).filter((b) => b && b.ml_home != null && b.ml_away != null);
  if (!books.length) return null;

  let h = 0;
  let a = 0;
  for (const b of books) {
    const [ph, pa] = noVig(b.ml_home, b.ml_away);
    h += ph;
    a += pa;
  }
  const homeProb = h / books.length;
  const awayProb = a / books.length;

  const best = (key) => {
    let top = null;
    for (const b of books) {
      if (top == null || b[key] > top.price) top = { price: b[key], book: b.title || 'Book' };
    }
    return top;
  };
  const bestHome = best('ml_home');
  const bestAway = best('ml_away');
  const evHome = homeProb * decimalFromAmerican(bestHome.price) - 1;
  const evAway = awayProb * decimalFromAmerican(bestAway.price) - 1;

  return {
    books_used: books.length,
    home_prob: homeProb,
    away_prob: awayProb,
    best_home: bestHome,
    best_away: bestAway,
    edge_home: evHome,
    edge_away: evAway,
  };
}

/** Same normalization the tools expect: mirror `spread` as `spread_home` etc. */
export function normalizeForTools(game) {
  const g = { ...(game || {}) };
  const books = g.books || {};
  const fd = books.fanduel || {};
  const dk = books.draftkings || {};
  const o = { ...(g.odds || {}) };
  o.ml_home = o.ml_home ?? fd.ml_home ?? dk.ml_home ?? null;
  o.ml_away = o.ml_away ?? fd.ml_away ?? dk.ml_away ?? null;
  o.spread_home = o.spread_home ?? o.spread ?? fd.spread ?? dk.spread ?? null;
  o.spread = o.spread_home;
  o.total = o.total ?? fd.total ?? dk.total ?? null;
  g.odds = o;
  const b2 = {};
  for (const k of Object.keys(books)) {
    const b = { ...books[k] };
    if (b.spread != null && b.spread_home == null) b.spread_home = b.spread;
    b2[k] = b;
  }
  g.books = b2;
  return g;
}

/** The "Win Chance" tool, shared by /api/algorithms and /api/best-bets. */
export function winChanceTool(game) {
  const base = { algorithm_id: 'win-chance-v1', algorithm_name: 'Win Chance' };
  const c = consensus(game);
  const pct = (x) => Math.round(x * 100);
  if (!c) {
    return { ...base, recommended_side: 'none', confidence: 0.2, expected_value: 0, suggested_stake_units: 0, reasoning: 'No moneyline prices to work from.', key_factors: [] };
  }
  const info = { home_win_prob: c.home_prob, away_win_prob: c.away_prob, books_used: c.books_used };
  if (c.books_used < 2) {
    return { ...base, ...info, recommended_side: 'none', confidence: 0.3, expected_value: 0, suggested_stake_units: 0, reasoning: 'Needs prices from two sportsbooks to compare.', key_factors: ['One book only'] };
  }
  const homeBetter = c.edge_home >= c.edge_away;
  const ev = homeBetter ? c.edge_home : c.edge_away;
  if (ev < 0.01) {
    return { ...base, ...info, recommended_side: 'none', confidence: 0.35, expected_value: Math.max(0, ev), suggested_stake_units: 0, reasoning: `Both books agree on the win chance (${game.home_team} ${pct(c.home_prob)}%, ${game.away_team} ${pct(c.away_prob)}%). No price pays more than that deserves.`, key_factors: ['Prices fair'] };
  }
  const side = homeBetter ? 'home' : 'away';
  const team = homeBetter ? game.home_team : game.away_team;
  const prob = homeBetter ? c.home_prob : c.away_prob;
  const best = homeBetter ? c.best_home : c.best_away;
  const price = `${best.price > 0 ? '+' : ''}${best.price}`;
  return {
    ...base,
    ...info,
    recommended_side: side,
    confidence: Math.min(0.75, 0.5 + ev * 4),
    expected_value: ev,
    suggested_stake_units: ev >= 0.04 ? 1.25 : 1,
    reasoning: `The books imply ${team} wins about ${pct(prob)}% of the time. ${best.book} pays ${price}, which is worth more than that chance — roughly a ${(ev * 100).toFixed(1)}% edge.`,
    key_factors: [`${pct(prob)}% win chance`, `${best.book} ${price}`],
  };
}
