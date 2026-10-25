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

const PP_LEAGUE = { NBA: 7, NFL: 9, MLB: 2, NHL: 8, NCAAF: 15, NCAAB: 20 };

function mockProps(sport, home, away) {
  const s = (sport || 'NBA').toUpperCase();
  if (s === 'NBA' || s === 'NCAAB') {
    return [
      { player: 'Star Guard', market: 'player_points', market_label: 'Points', line: 24.5, over: -115, under: -105, book: 'Sample' },
      { player: 'Star Guard', market: 'player_assists', market_label: 'Assists', line: 6.5, over: -110, under: -110, book: 'Sample' },
      { player: 'Big Man', market: 'player_points', market_label: 'Points', line: 22.5, over: -120, under: 100, book: 'Sample' },
      { player: 'Big Man', market: 'player_rebounds', market_label: 'Rebounds', line: 10.5, over: -105, under: -115, book: 'Sample' },
      { player: 'Wing', market: 'player_threes', market_label: '3-Pointers', line: 2.5, over: -110, under: -110, book: 'Sample' },
      { player: 'Wing', market: 'player_points', market_label: 'Points', line: 18.5, over: -108, under: -112, book: 'Sample' },
    ].map((p, i) => ({ ...p, id: `mock-${i}`, home_team: home, away_team: away, sport: s, source: 'sample' }));
  }
  if (s === 'NFL' || s === 'NCAAF') {
    return [
      { player: 'Starting QB', market: 'player_pass_yds', market_label: 'Pass Yards', line: 265.5, over: -110, under: -110, book: 'Sample' },
      { player: 'Starting QB', market: 'player_pass_tds', market_label: 'Pass TDs', line: 1.5, over: -130, under: 110, book: 'Sample' },
      { player: 'Lead RB', market: 'player_rush_yds', market_label: 'Rush Yards', line: 72.5, over: -115, under: -105, book: 'Sample' },
      { player: 'WR1', market: 'player_reception_yds', market_label: 'Receiving Yards', line: 68.5, over: -110, under: -110, book: 'Sample' },
      { player: 'WR1', market: 'player_receptions', market_label: 'Receptions', line: 5.5, over: -105, under: -115, book: 'Sample' },
    ].map((p, i) => ({ ...p, id: `mock-${i}`, home_team: home, away_team: away, sport: s, source: 'sample' }));
  }
  return [
    { player: 'Top Player', market: 'player_points', market_label: 'Points', line: 1.5, over: -110, under: -110, book: 'Sample', id: 'mock-0', home_team: home, away_team: away, sport: s, source: 'sample' },
  ];
}

async function fetchPrizePicks(sport) {
  const leagueId = PP_LEAGUE[(sport || '').toUpperCase()];
  const q = new URLSearchParams({ single_stat: 'true', per_page: '250' });
  if (leagueId) q.set('league_id', String(leagueId));
  const url = `https://api.prizepicks.com/projections?${q}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json',
      Origin: 'https://app.prizepicks.com',
      Referer: 'https://app.prizepicks.com/',
    },
  });
  if (!res.ok) throw new Error(`PP ${res.status}`);
  const body = await res.json();
  if (!body || !body.data) throw new Error('PP empty');
  const players = {};
  for (const row of body.included || []) {
    if (row.type === 'new_player') {
      players[row.id] = {
        name: row.attributes?.name,
        team: row.attributes?.team,
      };
    }
  }
  const map = new Map();
  for (const d of body.data) {
    const a = d.attributes || {};
    const pid = d.relationships?.new_player?.data?.id;
    const p = players[pid] || {};
    const line = a.line_score != null ? Number(a.line_score) : null;
    const marketLabel = a.stat_type || a.description || 'Prop';
    const key = `${p.name}|${marketLabel}|${line}`;
    if (!map.has(key)) {
      map.set(key, {
        id: `pp-${d.id}`,
        player: p.name || 'Unknown',
        team: p.team || null,
        market: marketLabel,
        market_label: marketLabel,
        line,
        over: null,
        under: null,
        book: 'PrizePicks',
        source: 'prizepicks',
        sport: (sport || '').toUpperCase(),
        live: Boolean(a.is_live),
        start_time: a.start_time || a.board_time || null,
      });
    }
  }
  return Array.from(map.values());
}

async function fetchOddsApiProps(sport, eventId, home, away) {
  const key = process.env.ODDS_API_KEY;
  if (!key) return null;
  const sportKey = SPORT_KEYS[(sport || '').toUpperCase()];
  if (!sportKey) return null;
  const markets = (MARKETS_BY_SPORT[(sport || '').toUpperCase()] || ['player_points']).join(',');
  let url;
  if (eventId && !String(eventId).startsWith('mock')) {
    url = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${eventId}/odds?apiKey=${key}&regions=us&markets=${markets}&oddsFormat=american&bookmakers=fanduel,draftkings`;
  } else {
    url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${key}&regions=us&markets=${markets}&oddsFormat=american&bookmakers=fanduel,draftkings`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OddsAPI ${res.status} ${t.slice(0, 100)}`);
  }
  const data = await res.json();
  const events = Array.isArray(data) ? data : data ? [data] : [];
  const props = [];
  for (const ev of events) {
    for (const book of ev.bookmakers || []) {
      if (!['fanduel', 'draftkings'].includes((book.key || '').toLowerCase())) continue;
      for (const m of book.markets || []) {
        const label = MARKET_LABELS[m.key] || m.key;
        const byPlayer = {};
        for (const o of m.outcomes || []) {
          const name = o.description || o.name;
          if (!name) continue;
          if (!byPlayer[name]) byPlayer[name] = { player: name, line: o.point, over: null, under: null };
          const side = (o.name || '').toLowerCase();
          if (side === 'over') byPlayer[name].over = o.price;
          else if (side === 'under') byPlayer[name].under = o.price;
          if (o.point != null) byPlayer[name].line = o.point;
        }
        for (const row of Object.values(byPlayer)) {
          props.push({
            id: `oa-${book.key}-${m.key}-${row.player}-${row.line}`,
            player: row.player,
            market: m.key,
            market_label: label,
            line: row.line,
            over: row.over,
            under: row.under,
            book: book.title || book.key,
            source: 'oddsapi',
            sport: (sport || '').toUpperCase(),
            home_team: ev.home_team || home,
            away_team: ev.away_team || away,
          });
        }
      }
    }
  }
  return props;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sport = (req.query.sport || 'NBA').toUpperCase();
  const home = req.query.home || '';
  const away = req.query.away || '';
  const eventId = req.query.eventId || req.query.event_id || '';

  const sourcesTried = [];
  let props = [];
  let source = 'sample';

  try {
    const pp = await fetchPrizePicks(sport);
    if (pp && pp.length) {
      let filtered = pp;
      if (home || away) {
        const tokens = `${home} ${away}`.toLowerCase().split(/\s+/).filter(Boolean);
        const soft = pp.filter((p) => {
          const t = (p.team || '').toLowerCase();
          return !t || tokens.some((x) => t.includes(x.slice(0, 3)));
        });
        if (soft.length) filtered = soft;
      }
      props = filtered.slice(0, 80);
      source = 'prizepicks';
      sourcesTried.push({ prizepicks: props.length });
    }
  } catch (e) {
    sourcesTried.push({ prizepicks: e.message });
  }

  if (!props.length) {
    try {
      const oa = await fetchOddsApiProps(sport, eventId, home, away);
      if (oa && oa.length) {
        props = oa.slice(0, 80);
        source = 'oddsapi';
        sourcesTried.push({ oddsapi: props.length });
      } else {
        sourcesTried.push({ oddsapi: 'empty' });
      }
    } catch (e) {
      sourcesTried.push({ oddsapi: e.message });
    }
  }

  if (!props.length) {
    props = mockProps(sport, home, away);
    source = 'sample';
    sourcesTried.push({ sample: props.length });
  }

  return res.status(200).json({
    source,
    sport,
    home_team: home,
    away_team: away,
    count: props.length,
    props,
    note:
      source === 'sample'
        ? 'Live player feeds blocked from this server or Odds API props not available on current plan/credits. Showing samples. Open FanDuel / DraftKings / PrizePicks for real boards.'
        : source === 'prizepicks'
          ? 'Live PrizePicks projection lines (More / Less).'
          : 'Live player props from sportsbooks via The Odds API.',
    sources_tried: sourcesTried,
  });
}
