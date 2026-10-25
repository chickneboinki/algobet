/**
 * FanDuel sbapi browse endpoints.
 * Confirm: sportsbook.fanduel.com → Network → sbapi / content-managed-page / webbrowse
 */
const crypto = require('crypto');

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://sportsbook.fanduel.com/',
  Origin: 'https://sportsbook.fanduel.com',
};

const DEFAULT_COMPETITION = process.env.FD_COMPETITION_ID || '84176';

function contentManagedUrl(pageId = 'nba') {
  const q = new URLSearchParams({
    page: 'CUSTOM',
    customPageId: pageId,
    language: 'en',
    regionCode: 'NAMERICA',
  });
  return `https://sbapi.us.sportsbook.fanduel.com/api/content-managed-page?${q}`;
}

function webbrowseUrl(competitionId) {
  return `https://sbapi.us.sportsbook.fanduel.com/api/webbrowse/ALL/v1/competition/${competitionId}/event`;
}

async function fetchFanDuel({ pageId = 'nba', competitionId = DEFAULT_COMPETITION } = {}) {
  const headers = { ...UA, 'X-Request-Id': crypto.randomUUID() };
  const urls = [contentManagedUrl(pageId), webbrowseUrl(competitionId)];
  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      if (!res.ok) {
        lastErr = new Error(`FanDuel ${res.status} on ${url}: ${text.slice(0, 100)}`);
        continue;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        lastErr = new Error('FanDuel non-JSON');
        continue;
      }
      return normalizeFanDuel(data);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('FanDuel failed');
}

function normalizeFanDuel(data) {
  const out = [];
  const events =
    data.events ||
    (data.attachments && data.attachments.events
      ? Object.values(data.attachments.events)
      : []) ||
    [];
  for (const ev of events) {
    out.push({
      source: 'fanduel',
      eventId: String(ev.eventId || ev.id || ''),
      sport: null,
      startTime: ev.openDate || ev.startTime || null,
      live: Boolean(ev.inPlay || ev.live),
      homeTeam: ev.homeName || null,
      awayTeam: ev.awayName || null,
      market: 'event',
      selection: null,
      line: null,
      odds: null,
      player: null,
      book: 'FanDuel',
      name: ev.name || null,
    });
  }
  const markets =
    data.attachments && data.attachments.markets
      ? Object.values(data.attachments.markets)
      : data.markets || [];
  for (const m of markets) {
    for (const r of m.runners || []) {
      const odds = r.winRunnerOdds?.americanOdds ?? r.americanOdds ?? null;
      out.push({
        source: 'fanduel',
        eventId: String(m.eventId || ''),
        sport: null,
        startTime: null,
        live: false,
        homeTeam: null,
        awayTeam: null,
        market: m.marketName || m.name || 'market',
        selection: r.runnerName || r.name || null,
        line: r.handicap != null ? Number(r.handicap) : null,
        odds: odds != null ? Number(odds) : null,
        player: r.runnerName || null,
        book: 'FanDuel',
      });
    }
  }
  return out;
}

module.exports = { fetchFanDuel, contentManagedUrl, webbrowseUrl };
