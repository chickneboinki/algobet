const MOCK = [
  { id: 'nfl-1', sport: 'NFL', home_team: 'Kansas City Chiefs', away_team: 'Buffalo Bills', home_abbr: 'KC', away_abbr: 'BUF', start_time: new Date(Date.now()+5*3600e3).toISOString(), status: 'scheduled', odds: { ml_home: -145, ml_away: 125, spread_home: -3, total: 48.5 } },
  { id: 'nba-1', sport: 'NBA', home_team: 'Boston Celtics', away_team: 'Milwaukee Bucks', home_abbr: 'BOS', away_abbr: 'MIL', start_time: new Date(Date.now()+3*3600e3).toISOString(), status: 'scheduled', odds: { ml_home: -180, ml_away: 155, spread_home: -4.5, total: 228.5 } },
  { id: 'nba-live', sport: 'NBA', home_team: 'Los Angeles Lakers', away_team: 'Golden State Warriors', home_abbr: 'LAL', away_abbr: 'GSW', start_time: new Date(Date.now()-3600e3).toISOString(), status: 'live', home_score: 78, away_score: 82, odds: { ml_home: 110, ml_away: -130 } },
  { id: 'ncaaf-1', sport: 'NCAAF', home_team: 'Alabama', away_team: 'Georgia', home_abbr: 'ALA', away_abbr: 'UGA', start_time: new Date(Date.now()+8*3600e3).toISOString(), status: 'scheduled', odds: { ml_home: 140, ml_away: -165, spread_home: 3.5, total: 51.5 } },
  { id: 'mlb-1', sport: 'MLB', home_team: 'New York Yankees', away_team: 'Boston Red Sox', home_abbr: 'NYY', away_abbr: 'BOS', start_time: new Date(Date.now()+2*3600e3).toISOString(), status: 'scheduled', odds: { ml_home: -160, ml_away: 140, total: 8.5 } },
  { id: 'nhl-1', sport: 'NHL', home_team: 'Colorado Avalanche', away_team: 'Vegas Golden Knights', home_abbr: 'COL', away_abbr: 'VGK', start_time: new Date(Date.now()+4*3600e3).toISOString(), status: 'scheduled', odds: { ml_home: -130, ml_away: 110, total: 6 } },
];

const KEYS = { NFL: 'americanfootball_nfl', NBA: 'basketball_nba', MLB: 'baseball_mlb', NHL: 'icehockey_nhl', NCAAF: 'americanfootball_ncaaf', NCAAB: 'basketball_ncaab' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sport = (req.query.sport || '').toUpperCase();
  const apiKey = process.env.ODDS_API_KEY;
  if (apiKey) {
    try {
      const sports = sport ? [sport] : Object.keys(KEYS);
      const all = [];
      for (const s of sports) {
        const key = KEYS[s];
        if (!key) continue;
        const url = `https://api.the-odds-api.com/v4/sports/${key}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const data = await r.json();
        for (const ev of data) {
          const book = (ev.bookmakers || []).find(b => ['fanduel','draftkings'].includes(b.key)) || (ev.bookmakers || [])[0];
          const odds = {};
          if (book) {
            for (const m of book.markets || []) {
              if (m.key === 'h2h') for (const o of m.outcomes || []) {
                if (o.name === ev.home_team) odds.ml_home = o.price;
                if (o.name === ev.away_team) odds.ml_away = o.price;
              }
              if (m.key === 'spreads') for (const o of m.outcomes || []) {
                if (o.name === ev.home_team) odds.spread_home = o.point;
              }
              if (m.key === 'totals') for (const o of m.outcomes || []) {
                if (o.name.toLowerCase() === 'over') odds.total = o.point;
              }
            }
          }
          all.push({
            id: ev.id, sport: s, home_team: ev.home_team, away_team: ev.away_team,
            home_abbr: ev.home_team.slice(0,3).toUpperCase(), away_abbr: ev.away_team.slice(0,3).toUpperCase(),
            start_time: ev.commence_time, status: 'scheduled', odds,
          });
        }
      }
      if (all.length) return res.status(200).json({ source: 'the-odds-api', games: all });
    } catch (e) {}
  }
  let games = MOCK;
  if (sport) games = games.filter(g => g.sport === sport);
  return res.status(200).json({ source: 'mock', games });
}
