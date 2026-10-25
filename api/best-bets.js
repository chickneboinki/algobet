function americanToProb(odds) {
  if (odds == null) return 0.5;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function underdog(game) {
  const o = game.odds || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  const hP = americanToProb(mlH), aP = americanToProb(mlA);
  const hEV = 0.48 - hP, aEV = 0.52 - aP;
  if (aEV > hEV && aEV > 0.03)
    return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value', recommended_side: 'away', confidence: Math.min(0.82, 0.52 + aEV * 2.2), expected_value: aEV, reasoning: `Away shows about ${(aEV * 100).toFixed(1)}% edge after the sportsbook take.` };
  if (hEV > 0.03)
    return { algorithm_id: 'underdog-value-v1', algorithm_name: 'Underdog Value', recommended_side: 'home', confidence: Math.min(0.82, 0.52 + hEV * 2.2), expected_value: hEV, reasoning: `Home shows about ${(hEV * 100).toFixed(1)}% edge after the sportsbook take.` };
  return null;
}

function homeAdv(game) {
  const s = (game.sport || '').toUpperCase();
  if (!['NBA', 'NFL', 'NHL', 'NCAAB', 'NCAAF'].includes(s)) return null;
  return { algorithm_id: 'home-advantage-v1', algorithm_name: 'Home Edge', recommended_side: 'home', confidence: 0.56, expected_value: 0.035, reasoning: `Home teams in ${s} often get a small edge the market underprices.` };
}

function contrarian(game) {
  const o = game.odds || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  if (mlH <= -200)
    return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Fade Heavy Favorite', recommended_side: 'away', confidence: 0.55, expected_value: 0.03, reasoning: 'Home is a heavy favorite. This tool fades that side when the public usually piles on.' };
  if (mlA <= -200)
    return { algorithm_id: 'contrarian-public-v1', algorithm_name: 'Fade Heavy Favorite', recommended_side: 'home', confidence: 0.55, expected_value: 0.03, reasoning: 'Away is a heavy favorite. Fading that side.' };
  return null;
}

function softLine(game) {
  const books = game.books || {};
  const fd = books.fanduel, dk = books.draftkings;
  if (!fd || !dk) return null;
  const picks = [];
  if (fd.ml_home != null && dk.ml_home != null) {
    const betterHome = fd.ml_home > dk.ml_home ? { book: 'FanDuel', price: fd.ml_home } : { book: 'DraftKings', price: dk.ml_home };
    const worseHome = fd.ml_home > dk.ml_home ? dk.ml_home : fd.ml_home;
    if (Math.abs(fd.ml_home - dk.ml_home) >= 15) {
      picks.push({ algorithm_id: 'soft-line-v1', algorithm_name: 'Soft Line', recommended_side: 'home', confidence: 0.6, expected_value: 0.04, reasoning: `${betterHome.book} offers a better home price (${betterHome.price > 0 ? '+' : ''}${betterHome.price}) than the other book (${worseHome > 0 ? '+' : ''}${worseHome}).` });
    }
  }
  if (fd.spread_home != null && dk.spread_home != null) {
    const gap = Math.abs(fd.spread_home - dk.spread_home);
    if (gap >= 1) {
      const betterSide = fd.spread_home > dk.spread_home ? 'home' : 'away';
      picks.push({ algorithm_id: 'soft-line-v1', algorithm_name: 'Soft Line', recommended_side: betterSide, confidence: 0.62, expected_value: 0.045, reasoning: `FanDuel and DraftKings disagree on the spread by ${gap} points. Taking the softer number on the ${betterSide} side.` });
    }
  }
  return picks[0] || null;
}

function homeDog(game) {
  const o = game.odds || {};
  const mlH = o.ml_home ?? -110;
  if (mlH >= 100 && mlH <= 180) {
    return { algorithm_id: 'home-dog-v1', algorithm_name: 'Home Underdog', recommended_side: 'home', confidence: 0.58, expected_value: 0.04, reasoning: `Home underdog at ${mlH > 0 ? '+' : ''}${mlH}. Home dogs in this price band historically hold value in many leagues.` };
  }
  return null;
}

function blowoutFade(game) {
  const s = (game.sport || '').toUpperCase();
  if (s !== 'NCAAF' && s !== 'NCAAB') return null;
  const o = game.odds || {};
  const spread = o.spread_home;
  if (spread != null && Math.abs(spread) >= 17) {
    const dog = spread <= -17 ? 'away' : 'home';
    return { algorithm_id: 'blowout-fade-v1', algorithm_name: 'College Blowout Fade', recommended_side: dog, confidence: 0.54, expected_value: 0.03, reasoning: `College line is ${Math.abs(spread)} points. Big favorites often fail to cover; small lean to the underdog.` };
  }
  if ((o.ml_home ?? 0) <= -300 || (o.ml_away ?? 0) <= -300) {
    const dog = (o.ml_home ?? 0) <= -300 ? 'away' : 'home';
    return { algorithm_id: 'blowout-fade-v1', algorithm_name: 'College Blowout Fade', recommended_side: dog, confidence: 0.53, expected_value: 0.028, reasoning: 'Extreme moneyline favorite in college. Small lean to the underdog.' };
  }
  return null;
}

function nflEngine(game) {
  const s = (game.sport || '').toUpperCase();
  if (s !== 'NFL' && s !== 'NCAAF') return null;
  const o = game.odds || {};
  const books = game.books || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  const hP = americanToProb(mlH), aP = americanToProb(mlA);
  let spreadGap = 0;
  if (books.fanduel?.spread_home != null && books.draftkings?.spread_home != null)
    spreadGap = Math.abs(books.fanduel.spread_home - books.draftkings.spread_home);
  const underdogIsAway = mlA > mlH;
  const dogPrice = underdogIsAway ? mlA : mlH;
  const dogSide = underdogIsAway ? 'away' : 'home';
  const dogProb = underdogIsAway ? aP : hP;
  const priceOk = dogPrice >= 100 && dogPrice <= 220;
  const gapOk = spreadGap >= 0.5;
  if (!priceOk && !gapOk) return null;
  const modelDog = dogProb + 0.04 + (gapOk ? 0.02 : 0);
  const edge = modelDog - dogProb;
  if (edge < 0.02) return null;
  return { algorithm_id: 'nfl-engine-v1', algorithm_name: 'NFL Engine', recommended_side: dogSide, confidence: Math.min(0.78, 0.5 + edge * 3), expected_value: edge, reasoning: `Evidence path: ${gapOk ? `books disagree on spread by ${spreadGap} pts. ` : ''}${priceOk ? `Underdog at ${dogPrice > 0 ? '+' : ''}${dogPrice}. ` : ''}Leans ${dogSide}.` };
}

function ncaaEngine(game) {
  const s = (game.sport || '').toUpperCase();
  if (s !== 'NCAAF' && s !== 'NCAAB') return null;
  const o = game.odds || {};
  const books = game.books || {};
  const mlH = o.ml_home ?? -110, mlA = o.ml_away ?? -110;
  const spread = o.spread_home;
  if ((mlH <= -300) || (mlA <= -300) || (spread != null && Math.abs(spread) >= 17)) {
    const dogSide = (mlH <= -300 || (spread != null && spread <= -17)) ? 'away' : 'home';
    return { algorithm_id: 'ncaa-engine-v1', algorithm_name: 'NCAA Engine', recommended_side: dogSide, confidence: 0.54, expected_value: 0.03, reasoning: 'College market often overprices huge favorites. Small lean to dog.' };
  }
  let spreadGap = 0;
  if (books.fanduel?.spread_home != null && books.draftkings?.spread_home != null)
    spreadGap = Math.abs(books.fanduel.spread_home - books.draftkings.spread_home);
  const underdogIsAway = mlA > mlH;
  const dogSide = underdogIsAway ? 'away' : 'home';
  const dogPrice = underdogIsAway ? mlA : mlH;
  if (spreadGap < 0.5 && !(dogPrice >= 105 && dogPrice <= 180)) return null;
  const edge = 0.035 + (spreadGap >= 1 ? 0.02 : 0);
  return { algorithm_id: 'ncaa-engine-v1', algorithm_name: 'NCAA Engine', recommended_side: dogSide, confidence: Math.min(0.72, 0.48 + edge * 2.5), expected_value: edge, reasoning: `College evidence: ${spreadGap >= 0.5 ? `spread gap ${spreadGap}. ` : ''}Leans ${dogSide} underdog.` };
}

const EVALUATORS = [nflEngine, ncaaEngine, softLine, homeDog, blowoutFade, underdog, contrarian, homeAdv];

function scorePick(p, weights) {
  const w = weights[p.algorithm_id] ?? 1;
  const conf = p.confidence || 0.5;
  const ev = Math.max(0, p.expected_value || 0);
  return (conf * 0.55 + Math.min(ev, 0.12) * 4 * 0.45) * w;
}

async function loadWeights(supabaseUrl, supabaseKey) {
  const weights = {};
  if (!supabaseUrl || !supabaseKey) return weights;
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/bets?select=algorithm_id,status,profit_units&status=neq.pending`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    if (!r.ok) return weights;
    const bets = await r.json();
    const stats = {};
    for (const b of bets) {
      const id = b.algorithm_id || 'unknown';
      if (!stats[id]) stats[id] = { n: 0, wins: 0, units: 0 };
      stats[id].n += 1;
      if (b.status === 'won') stats[id].wins += 1;
      stats[id].units += Number(b.profit_units || 0);
    }
    for (const [id, s] of Object.entries(stats)) {
      if (s.n < 3) { weights[id] = 1; continue; }
      const wr = s.wins / s.n;
      const unitBonus = Math.max(-0.3, Math.min(0.4, s.units / s.n * 0.15));
      weights[id] = Math.max(0.5, Math.min(1.6, 0.7 + wr * 0.7 + unitBonus));
    }
  } catch (_) {}
  return weights;
}

async function fetchGames(oddsKey) {
  const KEYS = {
    NFL: 'americanfootball_nfl',
    NBA: 'basketball_nba',
    NCAAF: 'americanfootball_ncaaf',
    NCAAB: 'basketball_ncaab',
    MLB: 'baseball_mlb',
    NHL: 'icehockey_nhl',
  };
  if (!oddsKey) return [];
  const all = [];
  for (const [sport, key] of Object.entries(KEYS)) {
    try {
      const url = `https://api.the-odds-api.com/v4/sports/${key}/odds?apiKey=${oddsKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=fanduel,draftkings`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      for (const ev of data) {
        const books = {};
        for (const b of ev.bookmakers || []) {
          const odds = {};
          for (const m of b.markets || []) {
            if (m.key === 'h2h') for (const o of m.outcomes || []) {
              if (o.name === ev.home_team) odds.ml_home = o.price;
              if (o.name === ev.away_team) odds.ml_away = o.price;
            }
            if (m.key === 'spreads') for (const o of m.outcomes || []) {
              if (o.name === ev.home_team) odds.spread_home = o.point;
              if (o.name === ev.away_team) odds.spread_away = o.point;
            }
            if (m.key === 'totals') for (const o of m.outcomes || []) {
              if (o.name.toLowerCase() === 'over') odds.total = o.point;
            }
          }
          if (Object.keys(odds).length) books[b.key] = odds;
        }
        const primary = books.fanduel || books.draftkings || {};
        const q = encodeURIComponent(`${ev.away_team} ${ev.home_team}`);
        all.push({
          id: ev.id,
          sport,
          home_team: ev.home_team,
          away_team: ev.away_team,
          start_time: ev.commence_time,
          odds: primary,
          books,
          links: {
            fanduel: `https://sportsbook.fanduel.com/search?q=${q}`,
            draftkings: `https://sportsbook.draftkings.com/search?q=${q}`,
            prizepicks: 'https://app.prizepicks.com/',
          },
        });
      }
    } catch (_) {}
  }
  return all;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const oddsKey = process.env.ODDS_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const minConf = Number(req.query.min_confidence || 0.5);
  const limit = Math.min(Number(req.query.limit || 15), 40);

  let games = [];
  if (oddsKey) {
    games = await fetchGames(oddsKey);
  }
  if (!games.length && req.method === 'POST' && Array.isArray(req.body?.games)) {
    games = req.body.games;
  }

  const weights = await loadWeights(supabaseUrl, supabaseKey);
  const picks = [];
  for (const game of games) {
    for (const fn of EVALUATORS) {
      try {
        const p = fn(game);
        if (!p || p.recommended_side === 'none') continue;
        if ((p.confidence || 0) < minConf) continue;
        const score = scorePick(p, weights);
        picks.push({
          ...p,
          score,
          game_id: game.id,
          sport: game.sport,
          home_team: game.home_team,
          away_team: game.away_team,
          start_time: game.start_time,
          odds: game.odds,
          books: game.books,
          links: game.links,
          weight_used: weights[p.algorithm_id] ?? 1,
        });
      } catch (_) {}
    }
  }

  picks.sort((a, b) => b.score - a.score);
  const top = picks.slice(0, limit);

  if (req.query.persist === '1' && supabaseUrl && supabaseKey && top.length) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/best_bets?created_at=lt.${new Date(Date.now() - 6 * 3600e3).toISOString()}`, {
        method: 'DELETE',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Prefer: 'return=minimal' },
      });
      await fetch(`${supabaseUrl}/rest/v1/best_bets`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(top.map((p) => ({
          game_id: p.game_id,
          sport: p.sport,
          home_team: p.home_team,
          away_team: p.away_team,
          start_time: p.start_time,
          algorithm_id: p.algorithm_id,
          algorithm_name: p.algorithm_name,
          side: p.recommended_side,
          confidence: p.confidence,
          expected_value: p.expected_value,
          score: p.score,
          reasoning: p.reasoning,
          odds: p.odds,
          books: p.books,
          links: p.links,
        }))),
      });
    } catch (_) {}
  }

  return res.status(200).json({
    generated_at: new Date().toISOString(),
    games_scanned: games.length,
    pick_count: top.length,
    weights,
    picks: top,
  });
}
