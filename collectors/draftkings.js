/**
 * DraftKings sportsbook JSON (eventgroups API used by their site).
 * Confirm: sportsbook.draftkings.com → Network → filter eventgroups / siteservices
 *
 * League eventGroup ids (re-check in Network if empty):
 * NBA 42648, NFL 88808, MLB 84240, NHL 42133, NCAAF 92488, NCAAB 92489
 */
const EVENT_GROUPS = {
  nba: '42648',
  nfl: '88808',
  mlb: '84240',
  nhl: '42133',
  ncaaf: '92488',
  ncaab: '92489',
};

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://sportsbook.draftkings.com/',
  Origin: 'https://sportsbook.draftkings.com',
};

function eventGroupUrl(league = 'nba') {
  const id = EVENT_GROUPS[String(league).toLowerCase()] || EVENT_GROUPS.nba;
  return `https://sportsbook.draftkings.com//sites/US-SB/api/v5/eventgroups/${id}?format=json`;
}

function normalizeEvent(ev, league) {
  return {
    source: 'draftkings',
    eventId: String(ev.eventId || ev.id || ''),
    sport: (league || '').toUpperCase(),
    startTime: ev.startDate || ev.startTime || null,
    live: Boolean(ev.eventStatus?.state === 'STARTED' || ev.isLive),
    homeTeam: ev.teamName2 || ev.homeTeamName || null,
    awayTeam: ev.teamName1 || ev.awayTeamName || null,
    market: 'event',
    selection: null,
    line: null,
    odds: null,
    player: null,
    book: 'DraftKings',
    name: ev.name || null,
  };
}

function extractOffers(payload, league) {
  const out = [];
  const eg = payload.eventGroup || payload;
  const events = eg.events || [];
  for (const ev of events) {
    out.push(normalizeEvent(ev, league));
  }
  const cats = eg.offerCategories || [];
  for (const cat of cats) {
    for (const desc of cat.offerSubcategoryDescriptors || []) {
      const sub = desc.offerSubcategory;
      if (!sub) continue;
      for (const offerGroup of sub.offers || []) {
        const list = Array.isArray(offerGroup) ? offerGroup : [offerGroup];
        for (const offer of list) {
          for (const o of offer.outcomes || []) {
            out.push({
              source: 'draftkings',
              eventId: String(offer.eventId || ''),
              sport: (league || '').toUpperCase(),
              startTime: null,
              live: false,
              homeTeam: null,
              awayTeam: null,
              market: offer.label || desc.name || cat.name || 'market',
              selection: o.label || o.participant || null,
              line: o.line != null ? Number(o.line) : o.points != null ? Number(o.points) : null,
              odds: o.oddsAmerican != null ? Number(o.oddsAmerican) : o.odds != null ? Number(o.odds) : null,
              player: o.participant || null,
              book: 'DraftKings',
            });
          }
        }
      }
    }
  }
  return out;
}

async function fetchDraftKings(league = 'nba') {
  const url = eventGroupUrl(league);
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  const text = await res.text();
  if (!res.ok) throw new Error(`DraftKings ${res.status}: ${text.slice(0, 120)}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('DraftKings returned non-JSON (blocked or HTML)');
  }
  return extractOffers(data, league);
}

module.exports = { fetchDraftKings, eventGroupUrl, EVENT_GROUPS };
