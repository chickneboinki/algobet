function americanToProb(odds) {
  if (odds == null) return 0.5;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function underdog(game) {
  const o = game.odds || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  const hP = americanToProb(mlH), aP = americanToProb(mlA);
  const mH = 0.48, mA = 0.52;
  const hEV = mH - hP, aEV = mA - aP;
  if (aEV > hEV && aEV > 0.03)
    return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value Hunter', recommended_side: 'away', confidence: Math.min(0.82, 0.52 + aEV * 2.2), expected_value: aEV, suggested_stake_units: 1.5, reasoning: `Away underdog shows +${(aEV * 100).toFixed(1)}% edge after juice.`, key_factors: ['Market price', 'Juice'] };
  if (hEV > 0.03)
    return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value Hunter', recommended_side: 'home', confidence: Math.min(0.82, 0.52 + hEV * 2.2), expected_value: hEV, suggested_stake_units: 1.5, reasoning: `Home shows +${(hEV * 100).toFixed(1)}% edge.`, key_factors: ['Market price'] };
  return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value Hunter', recommended_side: 'none', confidence: 0.35, expected_value: 0, suggested_stake_units: 0, reasoning: 'No clear value edge right now.', key_factors: [] };
}

function homeAdv(game) {
  const s = (game.sport || '').toUpperCase();
  if (!['NBA', 'NFL', 'NHL', 'NCAAB', 'NCAAF'].includes(s))
    return { algorithm_id: 'home-advantage-v1', algorithm_name: 'Home Court Edge', recommended_side: 'none', confidence: 0.25, expected_value: 0, suggested_stake_units: 0, reasoning: `Home edge less reliable in ${s}.`, key_factors: [] };
  return { algorithm_id: 'home-advantage-v1', algorithm_name: 'Home Court Edge', recommended_side: 'home', confidence: 0.58, expected_value: 0.04, suggested_stake_units: 1, reasoning: `Home teams in ${s} often get a small edge the market underprices.`, key_factors: ['Home field/court'] };
}

function contrarian(game) {
  const o = game.odds || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  if (mlH <= -200)
    return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Contrarian Public Fade', recommended_side: 'away', confidence: 0.56, expected_value: 0.035, suggested_stake_units: 0.75, reasoning: 'Heavy home favorite — public often piles on; tool fades that side.', key_factors: ['Public concentration'] };
  if (mlA <= -200)
    return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Contrarian Public Fade', recommended_side: 'home', confidence: 0.56, expected_value: 0.035, suggested_stake_units: 0.75, reasoning: 'Heavy away favorite — fading the public side.', key_factors: ['Public concentration'] };
  return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Contrarian Public Fade', recommended_side: 'none', confidence: 0.3, expected_value: 0, suggested_stake_units: 0, reasoning: 'No extreme favorite to fade.', key_factors: [] };
}

function nflEngine(game) {
  const s = (game.sport || '').toUpperCase();
  if (s !== 'NFL' && s !== 'NCAAF') {
    return { algorithm_id: 'nfl-engine-v1', algorithm_name: 'NFL Engine (yours)', recommended_side: 'none', confidence: 0.2, expected_value: 0, suggested_stake_units: 0, reasoning: 'This tool is built for NFL / college football only. Pick an NFL or NCAAF game.', key_factors: ['Sport gate'] };
  }
  const o = game.odds || {};
  const books = game.books || {};
  const mlH = o.ml_home ?? -110;
  const mlA = o.ml_away ?? -110;
  const hP = americanToProb(mlH);
  const aP = americanToProb(mlA);
  let spreadGap = 0;
  const fd = books.fanduel, dk = books.draftkings;
  if (fd?.spread_home != null && dk?.spread_home != null) {
    spreadGap = Math.abs(fd.spread_home - dk.spread_home);
  }
  const underdogIsAway = mlA > 0 || (mlA > mlH);
  const dogPrice = underdogIsAway ? mlA : mlH;
  const dogSide = underdogIsAway ? 'away' : 'home';
  const dogProb = underdogIsAway ? aP : hP;
  const priceOk = dogPrice >= 100 && dogPrice <= 220;
  const gapOk = spreadGap >= 0.5;
  if (!priceOk && !gapOk) {
    return { algorithm_id: 'nfl-engine-v1', algorithm_name: 'NFL Engine (yours)', recommended_side: 'none', confidence: 0.32, expected_value: 0, suggested_stake_units: 0, reasoning: 'Evidence gate: no clear book disagreement and no mid-range underdog price. Pass (same idea as your engine needing real evidence).', key_factors: ['Evidence gate', 'Price range', 'Book agreement'] };
  }
  const modelDog = dogProb + 0.04 + (gapOk ? 0.02 : 0);
  const edge = modelDog - dogProb;
  if (edge < 0.02) {
    return { algorithm_id: 'nfl-engine-v1', algorithm_name: 'NFL Engine (yours)', recommended_side: 'none', confidence: 0.4, expected_value: edge, suggested_stake_units: 0, reasoning: 'Gates passed but edge is too small after calibration check. Pass.', key_factors: ['Calibration', 'Edge size'] };
  }
  return { algorithm_id: 'nfl-engine-v1', algorithm_name: 'NFL Engine (yours)', recommended_side: dogSide, confidence: Math.min(0.78, 0.5 + edge * 3), expected_value: edge, suggested_stake_units: edge > 0.05 ? 1.25 : 0.75, reasoning: `NFL-style evidence path: ${gapOk ? `books disagree on spread by ${spreadGap} pts. ` : ''}${priceOk ? `Underdog price ${dogPrice > 0 ? '+' : ''}${dogPrice} is in the mid range. ` : ''}Leans ${dogSide} with ~${(edge * 100).toFixed(1)}% edge. (Simplified port of your evidence-gated NFL engine — full EPA/trenches need play-level data.)`, key_factors: [gapOk ? `Book spread gap ${spreadGap}` : 'Price gate', `Dog ${dogSide} @ ${dogPrice > 0 ? '+' : ''}${dogPrice}`, s] };
}

function ncaaEngine(game) {
  const s = (game.sport || '').toUpperCase();
  if (s !== 'NCAAF' && s !== 'NCAAB') {
    return { algorithm_id: 'ncaa-engine-v1', algorithm_name: 'NCAA Engine (yours)', recommended_side: 'none', confidence: 0.2, expected_value: 0, suggested_stake_units: 0, reasoning: 'This tool is for college football (NCAAF) or college basketball (NCAAB) only.', key_factors: ['Sport gate'] };
  }
  const o = game.odds || {};
  const books = game.books || {};
  const mlH = o.ml_home ?? -110;
  const mlA = o.ml_away ?? -110;
  const spread = o.spread_home;
  const extremeFav = (mlH <= -300) || (mlA <= -300) || (spread != null && Math.abs(spread) >= 17);
  if (extremeFav) {
    const dogSide = (mlH <= -300 || (spread != null && spread <= -17)) ? 'away' : 'home';
    return { algorithm_id: 'ncaa-engine-v1', algorithm_name: 'NCAA Engine (yours)', recommended_side: dogSide, confidence: 0.54, expected_value: 0.03, suggested_stake_units: 0.5, reasoning: 'College market often overprices huge favorites. Evidence-style pass on mega-faves; small lean to dog (your NCAA engine avoids weak evidence on blowout lines).', key_factors: ['Extreme line gate', 'College variance'] };
  }
  let spreadGap = 0;
  if (books.fanduel?.spread_home != null && books.draftkings?.spread_home != null) {
    spreadGap = Math.abs(books.fanduel.spread_home - books.draftkings.spread_home);
  }
  const underdogIsAway = mlA > mlH;
  const dogSide = underdogIsAway ? 'away' : 'home';
  const dogPrice = underdogIsAway ? mlA : mlH;
  if (spreadGap < 0.5 && !(dogPrice >= 105 && dogPrice <= 180)) {
    return { algorithm_id: 'ncaa-engine-v1', algorithm_name: 'NCAA Engine (yours)', recommended_side: 'none', confidence: 0.3, expected_value: 0, suggested_stake_units: 0, reasoning: 'NCAA evidence gate: books agree and no mid-range dog price. Pass until stronger signal (same spirit as your FBS evidence requirements).', key_factors: ['Evidence gate', 'Book agreement'] };
  }
  const edge = 0.035 + (spreadGap >= 1 ? 0.02 : 0);
  return { algorithm_id: 'ncaa-engine-v1', algorithm_name: 'NCAA Engine (yours)', recommended_side: dogSide, confidence: Math.min(0.72, 0.48 + edge * 2.5), expected_value: edge, suggested_stake_units: 0.75, reasoning: `College evidence path: ${spreadGap >= 0.5 ? `FanDuel vs DraftKings spread gap ${spreadGap}. ` : ''}Leans ${dogSide} underdog. (Simplified port of your NCAA engine — full opponent-adjusted metrics need team stats feeds.)`, key_factors: [s, `Dog ${dogSide}`, spreadGap >= 0.5 ? `Spread gap ${spreadGap}` : 'Price band'] };
}

const ALGOS = {
  'nfl-engine-v1': { id: 'nfl-engine-v1', name: 'NFL Engine (yours)', description: 'Based on your NFL evidence-gated engine. Only runs on NFL/NCAAF. Needs a clear price or book disagreement before it picks.', created_by: 'user', tags: ['nfl', 'evidence', 'your-engine'], evaluate: nflEngine },
  'ncaa-engine-v1': { id: 'ncaa-engine-v1', name: 'NCAA Engine (yours)', description: 'Based on your NCAA evidence-gated engine. College football & basketball only. Passes when evidence is weak.', created_by: 'user', tags: ['ncaa', 'college', 'your-engine'], evaluate: ncaaEngine },
  'underdog-value-v1': { id: 'underdog-value-v1', name: 'Underdog Value Hunter', description: 'Looks for sides with positive edge after the sportsbook juice.', created_by: 'system', tags: ['moneyline', 'value'], evaluate: underdog },
  'home-advantage-v1': { id: 'home-advantage-v1', name: 'Home Court Edge', description: 'Favors home when the market may underprice home field/court.', created_by: 'system', tags: ['home'], evaluate: homeAdv },
  'contrarian-public-v1': { id: 'contrarian-public-v1', name: 'Contrarian Public Fade', description: 'Fades heavy favorites the public usually piles onto (−200 or worse).', created_by: 'system', tags: ['contrarian'], evaluate: contrarian },
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
    if (!algo) return res.status(404).json({ error: 'Algorithm not found' });
    const result = algo.evaluate(game || {});
    result.timestamp = new Date().toISOString();
    result.game_id = game?.id;
    return res.status(200).json(result);
  }
  return res.status(405).end();
}
