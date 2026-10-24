function americanToProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function underdog(game) {
  const o = game.odds || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  const hP = americanToProb(mlH), aP = americanToProb(mlA);
  const mH = 0.48, mA = 0.52;
  const hEV = mH - hP, aEV = mA - aP;
  if (aEV > hEV && aEV > 0.03) return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value Hunter', recommended_side: 'away', confidence: Math.min(0.82, 0.52 + aEV * 2.2), expected_value: aEV, suggested_stake_units: 1.5, reasoning: `Away underdog shows +${(aEV*100).toFixed(1)}% EV.`, key_factors: ['Market probability', 'Juice awareness'] };
  if (hEV > 0.03) return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value Hunter', recommended_side: 'home', confidence: Math.min(0.82, 0.52 + hEV * 2.2), expected_value: hEV, suggested_stake_units: 1.5, reasoning: `Home shows +${(hEV*100).toFixed(1)}% EV.`, key_factors: ['Market probability'] };
  return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value Hunter', recommended_side: 'none', confidence: 0.35, expected_value: 0, suggested_stake_units: 0, reasoning: 'No clear value edge.', key_factors: [] };
}

function homeAdv(game) {
  const s = (game.sport || '').toUpperCase();
  if (!['NBA','NFL','NHL','NCAAB'].includes(s)) return { algorithm_id: 'home-advantage-v1', algorithm_name: 'Home Court Edge', recommended_side: 'none', confidence: 0.25, expected_value: 0, suggested_stake_units: 0, reasoning: `Home edge less reliable in ${s}.`, key_factors: [] };
  return { algorithm_id: 'home-advantage-v1', algorithm_name: 'Home Court Edge', recommended_side: 'home', confidence: 0.58, expected_value: 0.04, suggested_stake_units: 1, reasoning: `Historical home edge in ${s} underpriced.`, key_factors: ['Home field/court'] };
}

function contrarian(game) {
  const o = game.odds || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  if (mlH <= -200) return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Contrarian Public Fade', recommended_side: 'away', confidence: 0.56, expected_value: 0.035, suggested_stake_units: 0.75, reasoning: 'Heavy home favorite — fading public.', key_factors: ['Public concentration'] };
  if (mlA <= -200) return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Contrarian Public Fade', recommended_side: 'home', confidence: 0.56, expected_value: 0.035, suggested_stake_units: 0.75, reasoning: 'Heavy away favorite — fading public.', key_factors: ['Public concentration'] };
  return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Contrarian Public Fade', recommended_side: 'none', confidence: 0.3, expected_value: 0, suggested_stake_units: 0, reasoning: 'No extreme favorite.', key_factors: [] };
}

const ALGOS = {
  'underdog-value-v1': { id: 'underdog-value-v1', name: 'Underdog Value Hunter', description: 'Looks for sides with positive EV after juice.', created_by: 'user', tags: ['moneyline','value'], evaluate: underdog },
  'home-advantage-v1': { id: 'home-advantage-v1', name: 'Home Court Edge', description: 'Favors home when historical edge is underpriced.', created_by: 'user', tags: ['home','spread'], evaluate: homeAdv },
  'contrarian-public-v1': { id: 'contrarian-public-v1', name: 'Contrarian Public Fade', description: 'Fades heavy public favorites (-200+).', created_by: 'user', tags: ['contrarian'], evaluate: contrarian },
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
