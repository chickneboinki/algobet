/**
 * Live games:
 * 1) FanDuel sbapi (moneylines/spreads/totals) — works
 * 2) ESPN DraftKings lines — works
 * 3) The Odds API when key has credits (FD+DK together)
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

const FD_PAGE = { NFL: 'nfl', NBA: 'nba', MLB: 'mlb', NHL: 'nhl', NCAAF: 'ncaaf', NCAAB: 'ncaab' };
const FD_AK = process.env.FD_AK || 'FhMFpcPWXMeyZxOx';
const FD_STATE = process.env.FD_STATE || 'il';

function parseAmerican(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/^\+/, ''));
  return Number.isFinite(n) ? n : null;
}

async function fetchFanDuel(sport) {
  const pageId = FD_PAGE[sport] || 'nfl';
  const q = new URLSearchParams({
    page: 'CUSTOM',
    customPageId: pageId,
    language: 'en',
    regionCode: 'NAMERICA',
    _ak: FD_AK,
  });
  const url = `https://sbapi.${FD_STATE}.sportsbook.fanduel.com/api/content-managed-page?${q}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'application/json',
      'X-Application': 'Whistler',
      'X-Request-Id': crypto.randomUUID?.() || String(Date.now()),
      Referer: 'https://sportsbook.fanduel.com/',
      Origin: 'https://sportsbook.fanduel.com',
    },
  });
  if (!res.ok) throw new Error(`FanDuel ${res.status}`);
  const data = await res.json();
  const events = data.attachments?.events || {};
  const markets = data.attachments?.markets || {};
  const byEvent = {};
  for (const m of Object.values(markets)) {
    const eid = String(m.eventId);
    if (!byEvent[eid]) byEvent[eid] = [];
    byEvent[eid].push(m);
  }
  const games = [];
  for (const [eid, ev] of Object.entries(events)) {
    const name = ev.name || '';
    if (!name || name === sport || name === 'NFL' || name === 'NBA') continue;
    if (!/@|\sv\s|\svs/i.test(name) && !name.includes('@')) continue;
    const parts = name.split(/\s+@\s+|\s+v\s+|\s+vs\.?\s+/i);
    const awayTeam = parts[0]?.trim() || '';
    const homeTeam = parts[1]?.trim() || name;
    const mlist = byEvent[eid] || [];
    const fdMarkets = [];
    for (const m of mlist) {
      const mname = m.marketName || '';
      const runners = m.runners || [];
      if (!runners.length) continue;
      const outcomes = runners.map((r) => ({
        name: r.runnerName,
        price: r.winRunnerOdds?.americanDisplayOdds?.americanOdds ?? null,
        point: r.handicap != null ? Number(r.handicap) : undefined,
      }));
      if (/^moneyline$/i.test(mname)) fdMarkets.push({ key: 'h2h', outcomes });
      else if (/spread|handicap/i.test(mname)) fdMarkets.push({ key: 'spreads', outcomes });
      else if (/total|over\/under/i.test(mname)) fdMarkets.push({ key: 'totals', outcomes });
    }
    games.push({
      id: `fd-${eid}`,
      sport,
      commence_time: ev.openDate,
      home_team: homeTeam,
      away_team: awayTeam,
      name,
      live: mlist.some((m) => m.inPlay),
      bookmakers: [{ key: 'fanduel', title: 'FanDuel', markets: fdMarkets }],
      source: 'fanduel',
    });
  }
  return games;
}

async function fetchEspnDk(sport) {
  const path = SPORT_PATHS[sport] || SPORT_PATHS.NFL;
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = await res.json();
  return (data.events || []).map((ev) => {
    const comp = (ev.competitions || [])[0] || {};
    const competitors = comp.competitors || [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    const primary = (comp.odds || [])[0] || {};
    const ml = primary.moneyline || {};
    const markets = [];
    const homeMl = parseAmerican(ml.home?.close?.odds);
    const awayMl = parseAmerican(ml.away?.close?.odds);
    if (homeMl != null || awayMl != null) {
      markets.push({
        key: 'h2h',
        outcomes: [
          { name: home?.team?.displayName, price: homeMl },
          { name: away?.team?.displayName, price: awayMl },
        ].filter((o) => o.price != null),
      });
    }
    if (primary.overUnder != null) {
      markets.push({
        key: 'totals',
        outcomes: [
          { name: 'Over', price: -110, point: Number(primary.overUnder) },
          { name: 'Under', price: -110, point: Number(primary.overUnder) },
        ],
      });
    }
    if (primary.spread != null) {
      markets.push({
        key: 'spreads',
        outcomes: [
          { name: home?.team?.displayName, price: -110, point: Number(primary.spread) },
          { name: away?.team?.displayName, price: -110, point: -Number(primary.spread) },
        ],
      });
    }
    return {
      id: String(ev.id),
      sport,
      commence_time: ev.date,
      home_team: home?.team?.displayName,
      away_team: away?.team?.displayName,
      status: comp.status?.type?.description,
      live: (comp.status?.type?.state || '') === 'in',
      bookmakers: [{ key: 'draftkings', title: 'DraftKings', markets }],
      details: primary.details,
      source: 'espn-draftkings',
    };
  });
}

function mergeByTeams(fdGames, dkGames) {
  const out = [];
  const used = new Set();
  for (const g of dkGames) {
    const key = `${(g.home_team || '').toLowerCase()}|${(g.away_team || '').toLowerCase()}`;
    const fd = fdGames.find((f) => {
      const fh = (f.home_team || '').toLowerCase();
      const fa = (f.away_team || '').toLowerCase();
      return (
        (fh.includes((g.home_team || '').toLowerCase().split(' ').pop()) &&
          fa.includes((g.away_team || '').toLowerCase().split(' ').pop())) ||
        (f.name || '').includes(g.home_team?.split(' ').pop() || '___')
      );
    });
    const bookmakers = [...(g.bookmakers || [])];
    if (fd) {
      used.add(fd.id);
      bookmakers.push(...(fd.bookmakers || []));
    }
    out.push({ ...g, bookmakers, sources: [g.source, fd?.source].filter(Boolean) });
  }
  for (const f of fdGames) {
    if (!used.has(f.id)) out.push(f);
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sport = (req.query.sport || 'NFL').toUpperCase();
  const notes = [];
  let fd = [];
  let dk = [];

  try {
    fd = await fetchFanDuel(sport);
    notes.push(`FanDuel ${fd.length} games`);
  } catch (e) {
    notes.push(`FanDuel: ${e.message}`);
  }

  try {
    dk = await fetchEspnDk(sport);
    notes.push(`DraftKings(ESPN) ${dk.length} games`);
  } catch (e) {
    notes.push(`ESPN: ${e.message}`);
  }

  // Optional Odds API merge if key works
  try {
    const key = process.env.ODDS_API_KEY;
    if (key && ODDS_KEYS[sport]) {
      const url = `https://api.the-odds-api.com/v4/sports/${ODDS_KEYS[sport]}/odds?apiKey=${key}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=fanduel,draftkings`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        if (data?.length) {
          notes.push(`OddsAPI ${data.length}`);
          return res.status(200).json({
            source: 'the-odds-api+live',
            sport,
            count: data.length,
            games: data.map((ev) => ({
              id: ev.id,
              sport,
              commence_time: ev.commence_time,
              home_team: ev.home_team,
              away_team: ev.away_team,
              bookmakers: ev.bookmakers,
              source: 'the-odds-api',
            })),
            note: notes.join(' | '),
          });
        }
      }
    }
  } catch (e) {
    notes.push(`OddsAPI: ${e.message}`);
  }

  const games = mergeByTeams(fd, dk);
  return res.status(200).json({
    source: 'fanduel+draftkings',
    sport,
    count: games.length,
    games,
    note: notes.join(' | '),
    refreshed_at: new Date().toISOString(),
  });
}
