const SPORT_KEYS = {
  NFL: 'americanfootball_nfl',
  NBA: 'basketball_nba',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
  NCAAF: 'americanfootball_ncaaf',
  NCAAB: 'basketball_ncaab',
};

const MARKETS_BY_SPORT = {
  NBA: ['player_points', 'player_rebounds', 'player_assists', 'player_threes'],
  NFL: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds', 'player_pass_tds', 'player_receptions'],
  MLB: ['player_strikeouts', 'player_hits', 'player_total_bases'],
  NHL: ['player_points', 'player_shots_on_goal', 'player_goals'],
  NCAAF: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds'],
  NCAAB: ['player_points', 'player_rebounds', 'player_assists'],
};

const MARKET_LABELS = {
  player_points: 'Points',
  player_rebounds: 'Rebounds',
  player_assists: 'Assists',
  player_threes: '3-Pointers',
  player_pass_yds: 'Pass Yards',
  player_rush_yds: 'Rush Yards',
  player_reception_yds: 'Receiving Yards',
  player_pass_tds: 'Pass TDs',
  player_receptions: 'Receptions',
  player_strikeouts: 'Strikeouts',
  player_hits: 'Hits',
  player_total_bases: 'Total Bases',
  player_shots_on_goal: 'Shots on Goal',
  player_goals: 'Goals',
};

function mockProps(sport, home, away) {
  const s = (sport || 'NBA').toUpperCase();
  if (s === 'NBA' || s === 'NCAAB') {
    return [
      { player: 'Star Guard', market: 'player_points', market_label: 'Points', line: 24.5, over: -115, under: -105, book: 'FanDuel' },
      { player: 'Star Guard', market: 'player_assists', market_label: 'Assists', line: 6.5, over: -110, under: -110, book: 'DraftKings' },
      { player: 'Big Man', market: 'player_points', market_label: 'Points', line: 22.5, over: -120, under: 100, book: 'FanDuel' },
      { player: 'Big Man', market: 'player_rebounds', market_label: 'Rebounds', line: 10.5, over: -105, under: -115, book: 'DraftKings' },
      { player: 'Wing', market: 'player_threes', market_label: '3-Pointers', line: 2.5, over: -110, under: -110, book: 'FanDuel' },
      { player: 'Wing', market: 'player_points', market_label: 'Points', line: 18.5, over: -108, under: -112, book: 'DraftKings' },
    ].map((p, i) => ({ ...p, id: `mock-${i}`, home_team: home, away_team: away, sport: s }));
  }
  if (s === 'NFL' || s === 'NCAAF') {
    return [
      { player: 'Starting QB', market: 'player_pass_yds', market_label: 'Pass Yards', line: 265.5, over: -110, under: -110, book: 'FanDuel' },
      { player: 'Starting QB', market: 'player_pass_tds', market_label: 'Pass TDs', line: 1.5, over: -130, under: 105, book: 'DraftKings' },
      { player: 'Lead RB', market: 'player_rush_yds', market_label: 'Rush Yards', line: 72.5, over: -115, under: -105, book: 'FanDuel' },
      { player: 'WR1', market: 'player_reception_yds', market_label: 'Receiving Yards', line: 68.5, over: -110, under: -110, book: 'DraftKings' },
      { player: 'WR1', market: 'player_receptions', market_label: 'Receptions', line: 5.5, over: -120, under: 100, book: 'FanDuel' },
    ].map((p, i) => ({ ...p, id: `mock-${i}`, home_team: home, away_team: away, sport: s }));
  }
  return [
    { player: 'Top Player', market: 'player_points', market_label: 'Points', line: 1.5, over: -110, under: -110, book: 'FanDuel', id: 'mock-0', home_team: home, away_team: away, sport: s },
  ];
}

function parseProps(eventData, sport) {
  const out = [];
  const home = eventData.home_team;
  const away = eventData.away_team;
  for (const book of eventData.bookmakers || []) {
    const bookName = book.title || book.key;
    for (const market of book.markets || []) {
      const mKey = market.key;
      const label = MARKET_LABELS[mKey] || mKey.replace(/^player_/, '').replace(/_/g, ' ');
      const byPlayer = {};
      for (const o of market.outcomes || []) {
        const name = o.description || o.name;
        if (!name) continue;
        if (!byPlayer[name]) byPlayer[name] = { player: name, line: o.point };
        const side = (o.name || '').toLowerCase();
        if (side === 'over') byPlayer[name].over = o.price;
        if (side === 'under') byPlayer[name].under = o.price;
        if (o.point != null) byPlayer[name].line = o.point;
      }
      for (const p of Object.values(byPlayer)) {
        if (p.line == null) continue;
        out.push({
          id: `${book.key}-${mKey}-${p.player}-${p.line}`,
          player: p.player,
          market: mKey,
          market_label: label,
          line: p.line,
          over: p.over,
          under: p.under,
          book: bookName,
          home_team: home,
          away_team: away,
          sport,
        });
      }
    }
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sport = (req.query.sport || 'NBA').toUpperCase();
  const eventId = req.query.eventId || req.query.event_id;
  const home = req.query.home || '';
  const away = req.query.away || '';
  const apiKey = process.env.ODDS_API_KEY;
  const sportKey = SPORT_KEYS[sport];
  const markets = (MARKETS_BY_SPORT[sport] || MARKETS_BY_SPORT.NBA).slice(0, 3).join(',');

  if (apiKey && eventId && sportKey && !String(eventId).startsWith('nfl-') && !String(eventId).startsWith('nba-') && !String(eventId).startsWith('mock')) {
    try {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${markets}&oddsFormat=american&bookmakers=fanduel,draftkings`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        const props = parseProps(data, sport);
        if (props.length) {
          return res.status(200).json({ source: 'the-odds-api', sport, event_id: eventId, props, count: props.length });
        }
      }
    } catch (e) {
      console.error('props fetch', e);
    }
  }

  const props = mockProps(sport, home, away);
  return res.status(200).json({
    source: 'sample',
    sport,
    event_id: eventId || null,
    props,
    count: props.length,
    note: 'Sample player lines for layout. Live props use The Odds API event endpoint when credits and coverage allow (costs extra credits per market).',
  });
}
