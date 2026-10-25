import { winChanceTool } from './_odds.js';

function americanToProb(odds) {
  if (odds == null) return 0.5;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function normalizeGame(game) {
  const g = { ...(game || {}) };
  const books = g.books || {};
  // prefer explicit odds, else first book, else flatten
  let o = { ...(g.odds || {}) };
  const fd = books.fanduel || {};
  const dk = books.draftkings || {};
  o.ml_home = o.ml_home ?? fd.ml_home ?? dk.ml_home ?? null;
  o.ml_away = o.ml_away ?? fd.ml_away ?? dk.ml_away ?? null;
  o.spread_home = o.spread_home ?? o.spread ?? fd.spread ?? dk.spread ?? null;
  o.spread = o.spread_home;
  o.total = o.total ?? fd.total ?? dk.total ?? null;
  g.odds = o;
  // mirror spread_home on books for soft-line
  const books2 = { ...books };
  for (const k of Object.keys(books2)) {
    const b = { ...books2[k] };
    if (b.spread != null && b.spread_home == null) b.spread_home = b.spread;
    books2[k] = b;
  }
  g.books = books2;
  return g;
}

function underdog(game) {
  const o = game.odds || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  const hP = americanToProb(mlH), aP = americanToProb(mlA);
  const hEV = 0.48 - hP, aEV = 0.52 - aP;
  if (aEV > hEV && aEV > 0.03)
    return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value', recommended_side: 'away', confidence: Math.min(0.82, 0.52 + aEV * 2.2), expected_value: aEV, suggested_stake_units: 1.5, reasoning: `Away shows about ${(aEV * 100).toFixed(1)}% edge after the sportsbook take.`, key_factors: ['Market price'] };
  if (hEV > 0.03)
    return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value', recommended_side: 'home', confidence: Math.min(0.82, 0.52 + hEV * 2.2), expected_value: hEV, suggested_stake_units: 1.5, reasoning: `Home shows about ${(hEV * 100).toFixed(1)}% edge after the sportsbook take.`, key_factors: ['Market price'] };
  return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value', recommended_side: 'none', confidence: 0.35, expected_value: 0, suggested_stake_units: 0, reasoning: 'No clear value edge right now.', key_factors: [] };
}

function homeAdv(game) {
  const s = (game.sport || '').toUpperCase();
  if (!['NBA', 'NFL', 'NHL', 'NCAAB', 'NCAAF'].includes(s))
    return { algorithm_id: 'home-advantage-v1', algorithm_name: 'Home Edge', recommended_side: 'none', confidence: 0.25, expected_value: 0, suggested_stake_units: 0, reasoning: `Home edge is less reliable in ${s}.`, key_factors: [] };
  return { algorithm_id: 'home-advantage-v1', algorithm_name: 'Home Edge', recommended_side: 'home', confidence: 0.56, expected_value: 0.035, suggested_stake_units: 1, reasoning: `Home teams in ${s} often get a small edge the market underprices.`, key_factors: ['Home field or court'] };
}

function contrarian(game) {
  const o = game.odds || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  if (mlH <= -200)
    return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Fade Heavy Favorite', recommended_side: 'away', confidence: 0.55, expected_value: 0.03, suggested_stake_units: 0.75, reasoning: 'Home is a heavy favorite. This tool fades that side when the public usually piles on.', key_factors: ['Heavy favorite'] };
  if (mlA <= -200)
    return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Fade Heavy Favorite', recommended_side: 'home', confidence: 0.55, expected_value: 0.03, suggested_stake_units: 0.75, reasoning: 'Away is a heavy favorite. Fading that side.', key_factors: ['Heavy favorite'] };
  return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Fade Heavy Favorite', recommended_side: 'none', confidence: 0.3, expected_value: 0, suggested_stake_units: 0, reasoning: 'No extreme favorite to fade.', key_factors: [] };
}

function softLine(game) {
  const books = game.books || {};
  const fd = books.fanduel, dk = books.draftkings;
  if (!fd || !dk)
    return { algorithm_id: 'soft-line-v1', algorithm_name: 'Soft Line', recommended_side: 'none', confidence: 0.2, expected_value: 0, suggested_stake_units: 0, reasoning: 'Need both FanDuel and DraftKings lines to compare.', key_factors: [] };
  const fdSpr = fd.spread_home ?? fd.spread;
  const dkSpr = dk.spread_home ?? dk.spread;
  if (fdSpr != null && dkSpr != null) {
    const gap = Math.abs(fdSpr - dkSpr);
    if (gap >= 1) {
      const betterSide = fdSpr > dkSpr ? 'home' : 'away';
      return { algorithm_id: 'soft-line-v1', algorithm_name: 'Soft Line', recommended_side: betterSide, confidence: 0.62, expected_value: 0.045, suggested_stake_units: 1, reasoning: `FanDuel and DraftKings disagree on the spread by ${gap} points. Taking the softer number on the ${betterSide} side.`, key_factors: [`Spread gap ${gap}`] };
    }
  }
  if (fd.ml_home != null && dk.ml_home != null && Math.abs(fd.ml_home - dk.ml_home) >= 15) {
    const betterHome = fd.ml_home > dk.ml_home;
    return { algorithm_id: 'soft-line-v1', algorithm_name: 'Soft Line', recommended_side: 'home', confidence: 0.58, expected_value: 0.035, suggested_stake_units: 0.75, reasoning: betterHome ? 'FanDuel offers a better home price than DraftKings.' : 'DraftKings offers a better home price than FanDuel.', key_factors: ['Moneyline gap'] };
  }
  return { algorithm_id: 'soft-line-v1', algorithm_name: 'Soft Line', recommended_side: 'none', confidence: 0.3, expected_value: 0, suggested_stake_units: 0, reasoning: 'Books are close enough — no soft line.', key_factors: [] };
}

function homeDog(game) {
  const o = game.odds || {};
  const mlH = o.ml_home ?? -110;
  if (mlH >= 100 && mlH <= 180)
    return { algorithm_id: 'home-dog-v1', algorithm_name: 'Home Underdog', recommended_side: 'home', confidence: 0.58, expected_value: 0.04, suggested_stake_units: 1, reasoning: `Home underdog at ${mlH > 0 ? '+' : ''}${mlH}. This price band often holds value.`, key_factors: ['Home dog price'] };
  return { algorithm_id: 'home-dog-v1', algorithm_name: 'Home Underdog', recommended_side: 'none', confidence: 0.25, expected_value: 0, suggested_stake_units: 0, reasoning: 'Home is not a mid-range underdog (+100 to +180).', key_factors: [] };
}

function blowoutFade(game) {
  const s = (game.sport || '').toUpperCase();
  if (s !== 'NCAAF' && s !== 'NCAAB')
    return { algorithm_id: 'blowout-fade-v1', algorithm_name: 'College Blowout Fade', recommended_side: 'none', confidence: 0.2, expected_value: 0, suggested_stake_units: 0, reasoning: 'Only for college football or basketball.', key_factors: [] };
  const o = game.odds || {};
  const spread = o.spread_home ?? o.spread;
  if (spread != null && Math.abs(spread) >= 17) {
    const dog = spread <= -17 ? 'away' : 'home';
    return { algorithm_id: 'blowout-fade-v1', algorithm_name: 'College Blowout Fade', recommended_side: dog, confidence: 0.54, expected_value: 0.03, suggested_stake_units: 0.5, reasoning: `Line is ${Math.abs(spread)} points. Big college favorites often fail to cover.`, key_factors: ['Large spread'] };
  }
  if ((o.ml_home ?? 0) <= -300 || (o.ml_away ?? 0) <= -300) {
    const dog = (o.ml_home ?? 0) <= -300 ? 'away' : 'home';
    return { algorithm_id: 'blowout-fade-v1', algorithm_name: 'College Blowout Fade', recommended_side: dog, confidence: 0.53, expected_value: 0.028, suggested_stake_units: 0.5, reasoning: 'Extreme moneyline favorite. Small lean to the underdog.', key_factors: ['Extreme ML'] };
  }
  return { algorithm_id: 'blowout-fade-v1', algorithm_name: 'College Blowout Fade', recommended_side: 'none', confidence: 0.3, expected_value: 0, suggested_stake_units: 0, reasoning: 'No blowout-sized line.', key_factors: [] };
}

function nflEngine(game) {
  const s = (game.sport || '').toUpperCase();
  if (s !== 'NFL' && s !== 'NCAAF') {
    return { algorithm_id: 'nfl-engine-v1', algorithm_name: 'NFL Engine', recommended_side: 'none', confidence: 0.2, expected_value: 0, suggested_stake_units: 0, reasoning: 'Built for NFL and college football only.', key_factors: ['Sport gate'] };
  }
  const o = game.odds || {};
  const books = game.books || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  const hP = americanToProb(mlH), aP = americanToProb(mlA);
  let spreadGap = 0;
  const fdSpr = books.fanduel?.spread_home ?? books.fanduel?.spread;
  const dkSpr = books.draftkings?.spread_home ?? books.draftkings?.spread;
  if (fdSpr != null && dkSpr != null) spreadGap = Math.abs(fdSpr - dkSpr);
  const underdogIsAway = mlA > mlH;
  const dogPrice = underdogIsAway ? mlA : mlH;
  const dogSide = underdogIsAway ? 'away' : 'home';
  const dogProb = underdogIsAway ? aP : hP;
  const priceOk = dogPrice >= 100 && dogPrice <= 220;
  const gapOk = spreadGap >= 0.5;
  if (!priceOk && !gapOk)
    return { algorithm_id: 'nfl-engine-v1', algorithm_name: 'NFL Engine', recommended_side: 'none', confidence: 0.32, expected_value: 0, suggested_stake_units: 0, reasoning: 'No clear book disagreement and no mid-range underdog price. Pass.', key_factors: ['Evidence gate'] };
  const modelDog = dogProb + 0.04 + (gapOk ? 0.02 : 0);
  const edge = modelDog - dogProb;
  if (edge < 0.02)
    return { algorithm_id: 'nfl-engine-v1', algorithm_name: 'NFL Engine', recommended_side: 'none', confidence: 0.4, expected_value: edge, suggested_stake_units: 0, reasoning: 'Gates passed but edge is too small. Pass.', key_factors: ['Calibration'] };
  return { algorithm_id: 'nfl-engine-v1', algorithm_name: 'NFL Engine', recommended_side: dogSide, confidence: Math.min(0.78, 0.5 + edge * 3), expected_value: edge, suggested_stake_units: edge > 0.05 ? 1.25 : 0.75, reasoning: `Evidence path: ${gapOk ? `books disagree on spread by ${spreadGap} pts. ` : ''}${priceOk ? `Underdog at ${dogPrice > 0 ? '+' : ''}${dogPrice}. ` : ''}Leans ${dogSide}.`, key_factors: [gapOk ? `Spread gap ${spreadGap}` : 'Price gate', s] };
}

function ncaaEngine(game) {
  const s = (game.sport || '').toUpperCase();
  if (s !== 'NCAAF' && s !== 'NCAAB') {
    return { algorithm_id: 'ncaa-engine-v1', algorithm_name: 'NCAA Engine', recommended_side: 'none', confidence: 0.2, expected_value: 0, suggested_stake_units: 0, reasoning: 'For college football or basketball only.', key_factors: ['Sport gate'] };
  }
  const o = game.odds || {};
  const books = game.books || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  const spread = o.spread_home ?? o.spread;
  if ((mlH <= -300) || (mlA <= -300) || (spread != null && Math.abs(spread) >= 17)) {
    const dogSide = (mlH <= -300 || (spread != null && spread <= -17)) ? 'away' : 'home';
    return { algorithm_id: 'ncaa-engine-v1', algorithm_name: 'NCAA Engine', recommended_side: dogSide, confidence: 0.54, expected_value: 0.03, suggested_stake_units: 0.5, reasoning: 'College market often overprices huge favorites. Small lean to dog.', key_factors: ['Extreme line'] };
  }
  let spreadGap = 0;
  const fdSpr = books.fanduel?.spread_home ?? books.fanduel?.spread;
  const dkSpr = books.draftkings?.spread_home ?? books.draftkings?.spread;
  if (fdSpr != null && dkSpr != null) spreadGap = Math.abs(fdSpr - dkSpr);
  const underdogIsAway = mlA > mlH;
  const dogSide = underdogIsAway ? 'away' : 'home';
  const dogPrice = underdogIsAway ? mlA : mlH;
  if (spreadGap < 0.5 && !(dogPrice >= 105 && dogPrice <= 180))
    return { algorithm_id: 'ncaa-engine-v1', algorithm_name: 'NCAA Engine', recommended_side: 'none', confidence: 0.3, expected_value: 0, suggested_stake_units: 0, reasoning: 'Books agree and no mid-range dog price. Pass.', key_factors: ['Evidence gate'] };
  const edge = 0.035 + (spreadGap >= 1 ? 0.02 : 0);
  return { algorithm_id: 'ncaa-engine-v1', algorithm_name: 'NCAA Engine', recommended_side: dogSide, confidence: Math.min(0.72, 0.48 + edge * 2.5), expected_value: edge, suggested_stake_units: 0.75, reasoning: `College evidence: ${spreadGap >= 0.5 ? `spread gap ${spreadGap}. ` : ''}Leans ${dogSide} underdog.`, key_factors: [s, spreadGap >= 0.5 ? `Gap ${spreadGap}` : 'Price band'] };
}

const ALGOS = {
  'win-chance-v1': { id: 'win-chance-v1', name: 'Win Chance', description: 'Works out each team’s true win chance from both books, then looks for a price that pays more than that chance deserves.', created_by: 'system', tags: ['value', 'win-chance'], evaluate: winChanceTool },
  'nfl-engine-v1': { id: 'nfl-engine-v1', name: 'NFL Engine', description: 'Your evidence-style football tool. Needs a clear price or book disagreement before it picks.', created_by: 'user', tags: ['nfl', 'evidence'], evaluate: nflEngine },
  'ncaa-engine-v1': { id: 'ncaa-engine-v1', name: 'NCAA Engine', description: 'Your college tool for football and basketball. Passes when evidence is weak.', created_by: 'user', tags: ['ncaa'], evaluate: ncaaEngine },
  'soft-line-v1': { id: 'soft-line-v1', name: 'Soft Line', description: 'Compares FanDuel vs DraftKings. Picks the softer number when books disagree.', created_by: 'system', tags: ['arbitrage-style'], evaluate: softLine },
  'home-dog-v1': { id: 'home-dog-v1', name: 'Home Underdog', description: 'Home dogs priced +100 to +180.', created_by: 'system', tags: ['preset'], evaluate: homeDog },
  'blowout-fade-v1': { id: 'blowout-fade-v1', name: 'College Blowout Fade', description: 'Fades huge college favorites (−17 or worse / −300 ML).', created_by: 'system', tags: ['college', 'preset'], evaluate: blowoutFade },
  'underdog-value-v1': { id: 'underdog-value-v1', name: 'Underdog Value', description: 'Looks for sides with positive edge after the sportsbook take.', created_by: 'system', tags: ['value'], evaluate: underdog },
  'home-advantage-v1': { id: 'home-advantage-v1', name: 'Home Edge', description: 'Favors home when the market may underprice home field or court.', created_by: 'system', tags: ['home'], evaluate: homeAdv },
  'contrarian-public-v1': { id: 'contrarian-public-v1', name: 'Fade Heavy Favorite', description: 'Fades favorites at −200 or worse.', created_by: 'system', tags: ['contrarian'], evaluate: contrarian },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    return res.status(200).json(Object.values(ALGOS).map(({ evaluate, ...a }) => a));
  }
  if (req.method === 'POST') {
    const { algorithm_id, game } = req.body || {};
    const algo = ALGOS[algorithm_id];
    if (!algo) return res.status(404).json({ error: 'Tool not found' });
    const result = algo.evaluate(normalizeGame(game || {}));
    result.timestamp = new Date().toISOString();
    result.game_id = game?.id;
    return res.status(200).json(result);
  }
  return res.status(405).end();
}
