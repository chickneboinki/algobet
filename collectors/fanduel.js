/**
 * FanDuel browse API (sbapi).
 * Confirm: sportsbook.fanduel.com → Network → sbapi / webbrowse / content-managed-page.
 * Geo and bot protection are common; residential + state-matched IP often required.
 */
const crypto = require('crypto');
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

const uuid = () => crypto.randomUUID();

const FD_MARKETS = (competitionId) =>
  `https://sbapi.us.sportsbook.fanduel.com/api/webbrowse/ALL/v1/competition/${competitionId}/event`;

async function fetchFanDuel(competitionId = 4321) {
  const res = await fetch(FD_MARKETS(competitionId), {
    headers: { ...UA, 'X-Request-Id': uuid() },
  });
  if (!res.ok) throw new Error(`FanDuel ${res.status}`);
  const data = await res.json();
  const events = data.events || data.attachments?.events || [];
  const list = Array.isArray(events) ? events : Object.values(events || {});
  return list.map((ev) => ({
    source: 'fanduel',
    eventId: String(ev.id || ev.eventId || ''),
    sport: null,
    startTime: ev.openDate || ev.startTime || null,
    live: Boolean(ev.inPlay || ev.live),
    homeTeam: ev.homeName || null,
    awayTeam: ev.awayName || null,
    market: 'moneyline',
    selection: null,
    line: null,
    odds: null,
    player: null,
    book: 'FanDuel',
    raw: ev,
  }));
}

module.exports = { fetchFanDuel, FD_MARKETS };
