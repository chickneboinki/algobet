/**
 * DraftKings browse JSON.
 * Confirm current feed: sportsbook.draftkings.com → F12 Network → filter XHR/JSON → open a sport.
 * Older path (often blocked now): /api/betfare/v1/games?category=nba&format=json
 */
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

const DK_REGIONAL = (cat) =>
  `https://sportsbook.draftkings.com/api/betfare/v1/games?category=${encodeURIComponent(cat)}&format=json`;

async function fetchDraftKings(category = 'nba') {
  const res = await fetch(DK_REGIONAL(category), {
    headers: UA,
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`DraftKings ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) {
    throw new Error('DraftKings returned non-JSON (likely block or redirect page)');
  }
  const data = await res.json();
  const events = data.events || data.Event || data || [];
  const list = Array.isArray(events) ? events : [];
  return list.map((ev) => ({
    source: 'draftkings',
    eventId: String(ev.id ?? ev.eventId ?? ev.event_id ?? ''),
    sport: category?.toUpperCase?.() || null,
    startTime: ev.startDate || ev.start_time || ev.startTime || null,
    live: Boolean(ev.isLive || ev.live),
    homeTeam: ev.homeTeamName || ev.home_team || ev.homeName || null,
    awayTeam: ev.awayTeamName || ev.away_team || ev.awayName || null,
    market: 'moneyline',
    selection: null,
    line: null,
    odds: null,
    player: null,
    book: 'DraftKings',
    raw: ev,
  }));
}

module.exports = { fetchDraftKings, DK_REGIONAL };
