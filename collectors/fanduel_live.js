/**
 * FanDuel LIVE odds via state sbapi (tested IL 2026-10-25).
 * https://sbapi.il.sportsbook.fanduel.com/api/content-managed-page?page=CUSTOM&customPageId=nfl&_ak=...
 * Returns events + markets with americanOdds on runners.
 */
const crypto = require('crypto');

const FD_AK = process.env.FD_AK || 'FhMFpcPWXMeyZxOx';
const STATE = process.env.FD_STATE || 'il'; // il, nj, pa, mi worked in tests

const PAGE_IDS = {
  NFL: 'nfl',
  NBA: 'nba',
  MLB: 'mlb',
  NHL: 'nhl',
  NCAAF: 'ncaaf',
  NCAAB: 'ncaab',
};

function headers() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'application/json',
    'X-Application': 'Whistler',
    'X-Request-Id': crypto.randomUUID(),
    Referer: 'https://sportsbook.fanduel.com/',
    Origin: 'https://sportsbook.fanduel.com',
  };
}

function pageUrl(sport = 'NFL') {
  const pageId = PAGE_IDS[(sport || 'NFL').toUpperCase()] || 'nfl';
  const q = new URLSearchParams({
    page: 'CUSTOM',
    customPageId: pageId,
    language: 'en',
    regionCode: 'NAMERICA',
    _ak: FD_AK,
  });
  return `https://sbapi.${STATE}.sportsbook.fanduel.com/api/content-managed-page?${q}`;
}

function americanFromRunner(r) {
  const o =
    r?.winRunnerOdds?.americanDisplayOdds?.americanOdds ??
    r?.winRunnerOdds?.americanDisplayOdds?.americanOddsInt ??
    null;
  return o != null ? Number(o) : null;
}

async function fetchFanDuelLive(sport = 'NFL') {
  const res = await fetch(pageUrl(sport), { headers: headers() });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`FanDuel ${res.status}: ${t.slice(0, 120)}`);
  }
  const data = await res.json();
  const events = data.attachments?.events || {};
  const markets = data.attachments?.markets || {};

  // group markets by eventId
  const byEvent = {};
  for (const m of Object.values(markets)) {
    const eid = String(m.eventId);
    if (!byEvent[eid]) byEvent[eid] = [];
    byEvent[eid].push(m);
  }

  const games = [];
  for (const [eid, ev] of Object.entries(events)) {
    const name = ev.name || '';
    // skip pure league labels
    if (!name || name === 'NFL' || name === 'NBA') continue;
    const parts = name.split(/\s+@\s+|\s+v\s+|\s+vs\.?\s+/i);
    let awayTeam = null;
    let homeTeam = null;
    if (parts.length === 2) {
      awayTeam = parts[0].trim();
      homeTeam = parts[1].trim();
    }

    const mlist = byEvent[eid] || [];
    const bookmakers = [
      {
        key: 'fanduel',
        title: 'FanDuel',
        markets: [],
      },
    ];
    const bm = bookmakers[0];

    for (const m of mlist) {
      const mname = m.marketName || m.marketType || '';
      const runners = m.runners || [];
      if (!runners.length) continue;

      if (/^moneyline$/i.test(mname) || /^match odds$/i.test(mname)) {
        bm.markets.push({
          key: 'h2h',
          outcomes: runners.map((r) => ({
            name: r.runnerName,
            price: americanFromRunner(r),
          })),
        });
      } else if (/spread|handicap/i.test(mname)) {
        bm.markets.push({
          key: 'spreads',
          outcomes: runners.map((r) => ({
            name: r.runnerName,
            price: americanFromRunner(r),
            point: r.handicap != null ? Number(r.handicap) : null,
          })),
        });
      } else if (/total|over\/under/i.test(mname)) {
        bm.markets.push({
          key: 'totals',
          outcomes: runners.map((r) => ({
            name: r.runnerName,
            price: americanFromRunner(r),
            point: r.handicap != null ? Number(r.handicap) : null,
          })),
        });
      }
    }

    games.push({
      id: `fd-${eid}`,
      sport: (sport || 'NFL').toUpperCase(),
      commence_time: ev.openDate || null,
      home_team: homeTeam || name,
      away_team: awayTeam || '',
      name,
      live: Boolean(mlist.some((m) => m.inPlay)),
      bookmakers,
      source: 'fanduel-sbapi',
    });
  }

  // also flat selections for debug
  const selections = [];
  for (const m of Object.values(markets)) {
    for (const r of m.runners || []) {
      selections.push({
        source: 'fanduel',
        eventId: String(m.eventId),
        market: m.marketName,
        selection: r.runnerName,
        line: r.handicap != null ? Number(r.handicap) : null,
        odds: americanFromRunner(r),
        book: 'FanDuel',
        live: Boolean(m.inPlay),
      });
    }
  }

  return { games, selections, eventCount: Object.keys(events).length, marketCount: Object.keys(markets).length };
}

module.exports = { fetchFanDuelLive, pageUrl, PAGE_IDS };
