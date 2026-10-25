/**
 * ESPN public scoreboard — DraftKings-sourced spreads, totals, moneylines. No key.
 */
const SPORT_PATHS = {
  NFL: 'football/nfl',
  NBA: 'basketball/nba',
  MLB: 'baseball/mlb',
  NHL: 'hockey/nhl',
  NCAAF: 'football/college-football',
  NCAAB: 'basketball/mens-college-basketball',
};

function parseAmerican(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/^\+/, ''));
  return Number.isFinite(n) ? n : null;
}

async function fetchEspnScoreboard(sport = 'NFL') {
  const path = SPORT_PATHS[(sport || 'NFL').toUpperCase()] || SPORT_PATHS.NFL;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = await res.json();
  const out = [];
  for (const ev of data.events || []) {
    const comp = (ev.competitions || [])[0] || {};
    const competitors = comp.competitors || [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    const oddsList = comp.odds || [];
    const primary = oddsList[0] || {};
    const ml = primary.moneyline || {};
    out.push({
      source: 'espn',
      eventId: String(ev.id),
      sport: (sport || '').toUpperCase(),
      startTime: ev.date || null,
      live: (comp.status?.type?.state || '') === 'in',
      homeTeam: home?.team?.displayName || null,
      awayTeam: away?.team?.displayName || null,
      market: 'game',
      book: primary.provider?.name || 'DraftKings',
      name: ev.name,
      status: comp.status?.type?.description || null,
      home_score: home?.score != null ? Number(home.score) : null,
      away_score: away?.score != null ? Number(away.score) : null,
      spread: primary.spread != null ? Number(primary.spread) : null,
      total: primary.overUnder != null ? Number(primary.overUnder) : null,
      home_ml: parseAmerican(ml.home?.close?.odds || ml.home?.odds),
      away_ml: parseAmerican(ml.away?.close?.odds || ml.away?.odds),
      details: primary.details || null,
      dk_link: primary.link?.href || null,
    });
  }
  return out;
}

module.exports = { fetchEspnScoreboard, SPORT_PATHS };
