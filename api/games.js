/**
 * Live games: FanDuel sbapi + ESPN DraftKings.
 * Always returns normalized: start_time, books.{fanduel,draftkings}, bets[]
 */

const SPORT_PATHS = {
  NFL: 'football/nfl',
  NBA: 'basketball/nba',
  MLB: 'baseball/mlb',
  NHL: 'hockey/nhl',
  NCAAF: 'football/college-football',
  NCAAB: 'basketball/mens-college-basketball',
};

const FD_PAGE = { NFL: 'nfl', NBA: 'nba', MLB: 'mlb', NHL: 'nhl', NCAAF: 'ncaaf', NCAAB: 'ncaab' };
const FD_AK = process.env.FD_AK || 'FhMFpcPWXMeyZxOx';
const FD_STATE = process.env.FD_STATE || 'il';

function parseAmerican(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/^\+/, ''));
  return Number.isFinite(n) ? n : null;
}

function teamMatch(a, b) {
  if (!a || !b) return false;
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa === bb) return true;
  const ap = aa.split(/\s+/).pop();
  const bp = bb.split(/\s+/).pop();
  return ap && bp && (aa.includes(bp) || bb.includes(ap));
}

function booksFromBookmakers(bookmakers, home, away) {
  const books = {};
  const bets = [];
  for (const bm of bookmakers || []) {
    const key = (bm.key || bm.title || 'book').toLowerCase().replace(/\s/g, '');
    const row = { title: bm.title || key, ml_home: null, ml_away: null, spread: null, total: null };
    for (const m of bm.markets || []) {
      const outcomes = m.outcomes || [];
      if (m.key === 'h2h') {
        for (const o of outcomes) {
          if (teamMatch(o.name, home)) row.ml_home = o.price;
          else if (teamMatch(o.name, away)) row.ml_away = o.price;
        }
        if (row.ml_home == null && outcomes[0]) row.ml_home = outcomes[0].price;
        if (row.ml_away == null && outcomes[1]) row.ml_away = outcomes[1].price;
        for (const o of outcomes) {
          bets.push({
            book: bm.title || key,
            market: 'Moneyline',
            selection: o.name,
            line: null,
            odds: o.price,
          });
        }
      }
      if (m.key === 'spreads') {
        for (const o of outcomes) {
          if (row.spread == null && o.point != null) row.spread = o.point;
          bets.push({
            book: bm.title || key,
            market: 'Spread',
            selection: o.name,
            line: o.point ?? null,
            odds: o.price,
          });
        }
      }
      if (m.key === 'totals') {
        for (const o of outcomes) {
          if (row.total == null && o.point != null) row.total = o.point;
          bets.push({
            book: bm.title || key,
            market: 'Total',
            selection: o.name,
            line: o.point ?? null,
            odds: o.price,
          });
        }
      }
    }
    books[key] = row;
  }
  return { books, bets };
}

function normalizeGame(g) {
  const home = g.home_team || '';
  const away = g.away_team || '';
  const { books, bets } = booksFromBookmakers(g.bookmakers, home, away);
  const start = g.commence_time || g.start_time || null;
  return {
    ...g,
    start_time: start,
    commence_time: start,
    books,
    bets,
    odds: books.fanduel || books.draftkings || Object.values(books)[0] || null,
  };
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
      'X-Request-Id': String(Date.now()) + Math.random(),
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
    if (!name.includes('@') && !/\sv\s|\svs/i.test(name)) continue;
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
    const fd = fdGames.find((f) => {
      return (
        teamMatch(f.home_team, g.home_team) && teamMatch(f.away_team, g.away_team)
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
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sport = (req.query.sport || 'NFL').toUpperCase();
  const notes = [];
  let fd = [];
  let dk = [];

  try {
    fd = await fetchFanDuel(sport);
    notes.push(`FanDuel ${fd.length}`);
  } catch (e) {
    notes.push(`FanDuel: ${e.message}`);
  }

  try {
    dk = await fetchEspnDk(sport);
    notes.push(`DraftKings ${dk.length}`);
  } catch (e) {
    notes.push(`ESPN: ${e.message}`);
  }

  const merged = mergeByTeams(fd, dk).map(normalizeGame);

  return res.status(200).json({
    source: 'fanduel+draftkings',
    sport,
    count: merged.length,
    games: merged,
    note: notes.join(' | '),
    refreshed_at: new Date().toISOString(),
  });
}
