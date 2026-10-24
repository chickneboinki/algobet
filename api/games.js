const MOCK = [
  { id: 'nfl-1', sport: 'NFL', home_team: 'Kansas City Chiefs', away_team: 'Buffalo Bills', home_abbr: 'KC', away_abbr: 'BUF', start_time: new Date(Date.now()+5*3600e3).toISOString(), status: 'scheduled',
    odds: { ml_home: -145, ml_away: 125, spread_home: -3, total: 48.5 },
    books: {
      fanduel: { ml_home: -145, ml_away: 125, spread_home: -3, total: 48.5 },
      draftkings: { ml_home: -148, ml_away: 124, spread_home: -3, total: 48 },
    }},
  { id: 'nba-1', sport: 'NBA', home_team: 'Boston Celtics', away_team: 'Milwaukee Bucks', home_abbr: 'BOS', away_abbr: 'MIL', start_time: new Date(Date.now()+3*3600e3).toISOString(), status: 'scheduled',
    odds: { ml_home: -180, ml_away: 155, spread_home: -4.5, total: 228.5 },
    books: {
      fanduel: { ml_home: -180, ml_away: 155, spread_home: -4.5, total: 228.5 },
      draftkings: { ml_home: -175, ml_away: 150, spread_home: -4.5, total: 229 },
    }},
  { id: 'ncaaf-1', sport: 'NCAAF', home_team: 'Alabama', away_team: 'Georgia', home_abbr: 'ALA', away_abbr: 'UGA', start_time: new Date(Date.now()+8*3600e3).toISOString(), status: 'scheduled',
    odds: { ml_home: 140, ml_away: -165, spread_home: 3.5, total: 51.5 },
    books: {
      fanduel: { ml_home: 140, ml_away: -165, spread_home: 3.5, total: 51.5 },
      draftkings: { ml_home: 135, ml_away: -160, spread_home: 3.5, total: 52 },
    }},
  { id: 'ncaab-1', sport: 'NCAAB', home_team: 'Duke', away_team: 'North Carolina', home_abbr: 'DUKE', away_abbr: 'UNC', start_time: new Date(Date.now()+6*3600e3).toISOString(), status: 'scheduled',
    odds: { ml_home: -120, ml_away: 100, spread_home: -2, total: 148.5 },
    books: {
      fanduel: { ml_home: -120, ml_away: 100, spread_home: -2, total: 148.5 },
      draftkings: { ml_home: -115, ml_away: -105, spread_home: -1.5, total: 149 },
    }},
];

const KEYS = {
  NFL: 'americanfootball_nfl',
  NBA: 'basketball_nba',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
  NCAAF: 'americanfootball_ncaaf',
  NCAAB: 'basketball_ncaab',
};

const BOOK_KEYS = ['fanduel', 'draftkings', 'betmgm', 'caesars'];

function parseBook(book, home, away) {
  if (!book) return null;
  const odds = {};
  for (const m of book.markets || []) {
    if (m.key === 'h2h') for (const o of m.outcomes || []) {
      if (o.name === home) odds.ml_home = o.price;
      if (o.name === away) odds.ml_away = o.price;
    }
    if (m.key === 'spreads') for (const o of m.outcomes || []) {
      if (o.name === home) { odds.spread_home = o.point; odds.spread_home_price = o.price; }
      if (o.name === away) { odds.spread_away = o.point; odds.spread_away_price = o.price; }
    }
    if (m.key === 'totals') for (const o of m.outcomes || []) {
      if (o.name.toLowerCase() === 'over') { odds.total = o.point; odds.over_price = o.price; }
      if (o.name.toLowerCase() === 'under') odds.under_price = o.price;
    }
  }
  return Object.keys(odds).length ? odds : null;
}

function deepLinks(sport, home, away) {
  const q = encodeURIComponent(`${away} ${home}`);
  return {
    fanduel: `https://sportsbook.fanduel.com/search?q=${q}`,
    draftkings: `https://sportsbook.draftkings.com/search?q=${q}`,
    prizepicks: `https://app.prizepicks.com/`,
  };
}

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
        const url = `https://api.the-odds-api.com/v4/sports/${key}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=fanduel,draftkings,betmgm,caesars`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const data = await r.json();
        for (const ev of data) {
          const books = {};
          for (const b of ev.bookmakers || []) {
            if (!BOOK_KEYS.includes(b.key)) continue;
            const parsed = parseBook(b, ev.home_team, ev.away_team);
            if (parsed) books[b.key] = parsed;
          }
          const primary = books.fanduel || books.draftkings || Object.values(books)[0] || {};
          all.push({
            id: ev.id,
            sport: s,
            home_team: ev.home_team,
            away_team: ev.away_team,
            home_abbr: (ev.home_team || '').split(' ').pop().slice(0, 3).toUpperCase(),
            away_abbr: (ev.away_team || '').split(' ').pop().slice(0, 3).toUpperCase(),
            start_time: ev.commence_time,
            status: 'scheduled',
            odds: primary,
            books,
            links: deepLinks(s, ev.home_team, ev.away_team),
          });
        }
      }
      if (all.length) return res.status(200).json({ source: 'the-odds-api', games: all });
    } catch (e) {
      console.error(e);
    }
  }

  let games = MOCK.map(g => ({ ...g, links: deepLinks(g.sport, g.home_team, g.away_team) }));
  if (sport) games = games.filter(g => g.sport === sport);
  return res.status(200).json({ source: 'mock', games });
}
