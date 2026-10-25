/**
 * Games + DraftKings lines via ESPN public scoreboard (provider: DraftKings).
 * FanDuel lines via The Odds API when ODDS_API_KEY is set.
 */

const SPORT_PATHS = {
  NFL: 'football/nfl',
  NBA: 'basketball/nba',
  MLB: 'baseball/mlb',
  NHL: 'hockey/nhl',
  NCAAF: 'football/college-football',
  NCAAB: 'basketball/mens-college-basketball',
};

const ODDS_KEYS = {
  NFL: 'americanfootball_nfl',
  NBA: 'basketball_nba',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
  NCAAF: 'americanfootball_ncaaf',
  NCAAB: 'basketball_ncaab',
};

function parseAmerican(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/^\+/, ''));
  return Number.isFinite(n) ? n : null;
}

async function fetchEspn(sport) {
  const path = SPORT_PATHS[sport] || SPORT_PATHS.NFL;
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = await res.json();
  const games = [];
  for (const ev of data.events || []) {
    const comp = (ev.competitions || [])[0] || {};
    const competitors = comp.competitors || [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    const primary = (comp.odds || [])[0] || {};
    const ml = primary.moneyline || {};
    const bookName = primary.provider?.name || 'DraftKings';
    games.push({
      id: String(ev.id),
      sport,
      commence_time: ev.date,
      home_team: home?.team?.displayName || 'Home',
      away_team: away?.team?.displayName || 'Away',
      status: comp.status?.type?.description || null,
      live: (comp.status?.type?.state || '') === 'in',
      home_score: home?.score != null ? Number(home.score) : null,
      away_score: away?.score != null ? Number(away.score) : null,
      bookmakers: [
        {
          key: bookName.toLowerCase().replace(/\s/g, ''),
          title: bookName,
          markets: [
            {
              key: 'h2h',
              outcomes: [
                { name: home?.team?.displayName, price: parseAmerican(ml.home?.close?.odds) },
                { name: away?.team?.displayName, price: parseAmerican(ml.away?.close?.odds) },
              ].filter((o) => o.price != null),
            },
            {
              key: 'spreads',
              outcomes:
                primary.spread != null
                  ? [
                      {
                        name: home?.team?.displayName,
                        price: -110,
                        point: primary.details?.includes('-')
                          ? -Math.abs(Number(primary.spread))
                          : Number(primary.spread),
                      },
                      {
                        name: away?.team?.displayName,
                        price: -110,
                        point: Number(primary.spread),
                      },
                    ]
                  : [],
            },
            {
              key: 'totals',
              outcomes:
                primary.overUnder != null
                  ? [
                      { name: 'Over', price: -110, point: Number(primary.overUnder) },
                      { name: 'Under', price: -110, point: Number(primary.overUnder) },
                    ]
                  : [],
            },
          ],
        },
      ],
      details: primary.details || null,
      total: primary.overUnder != null ? Number(primary.overUnder) : null,
      spread: primary.spread != null ? Number(primary.spread) : null,
      source: 'espn-draftkings',
    });
  }
  return games;
}

async function fetchOddsApi(sport) {
  const key = process.env.ODDS_API_KEY;
  if (!key) return null;
  const sk = ODDS_KEYS[sport];
  if (!sk) return null;
  const url = `https://api.the-odds-api.com/v4/sports/${sk}/odds?apiKey=${key}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=fanduel,draftkings`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OddsAPI ${res.status}`);
  const data = await res.json();
  return (data || []).map((ev) => ({
    id: ev.id,
    sport,
    commence_time: ev.commence_time,
    home_team: ev.home_team,
    away_team: ev.away_team,
    bookmakers: ev.bookmakers || [],
    source: 'the-odds-api',
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sport = (req.query.sport || 'NFL').toUpperCase();
  let games = [];
  let source = 'espn-draftkings';
  const notes = [];

  // Prefer Odds API when key has credits (FanDuel + DraftKings side by side)
  try {
    const oa = await fetchOddsApi(sport);
    if (oa && oa.length) {
      games = oa;
      source = 'the-odds-api';
      notes.push('Live FanDuel + DraftKings from The Odds API');
    }
  } catch (e) {
    notes.push(`OddsAPI: ${e.message}`);
  }

  if (!games.length) {
    try {
      games = await fetchEspn(sport);
      source = 'espn-draftkings';
      notes.push('DraftKings lines via ESPN public scoreboard');
    } catch (e) {
      notes.push(`ESPN: ${e.message}`);
    }
  }

  return res.status(200).json({
    source,
    sport,
    count: games.length,
    games,
    note: notes.join(' | ') || null,
  });
}
