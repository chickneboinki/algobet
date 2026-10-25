/**
 * PrizePicks projections feed (same JSON the site uses).
 * Find current URL: app.prizepicks.com → F12 Network → filter XHR → "projections"
 */
const crypto = require('crypto');

const LEAGUE_IDS = {
  NBA: 7,
  NFL: 9,
  MLB: 2,
  NHL: 8,
  NCAAF: 15,
  NCAAB: 20,
  WNBA: 3,
  MLS: 10,
};

function headers() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://app.prizepicks.com',
    Referer: 'https://app.prizepicks.com/',
    'X-Device-ID': crypto.randomUUID(),
    'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
  };
}

function buildUrl({ singleStat = true, league = null, perPage = 250 } = {}) {
  const q = new URLSearchParams({
    single_stat: String(singleStat),
    per_page: String(perPage),
    game_mode: 'pickem',
  });
  const id = league ? LEAGUE_IDS[String(league).toUpperCase()] : null;
  if (id) q.set('league_id', String(id));
  return `https://api.prizepicks.com/projections?${q}`;
}

async function fetchPrizePicks(opts = {}) {
  const url = buildUrl(opts);
  const res = await fetch(url, { headers: headers() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PrizePicks ${res.status}: ${text.slice(0, 160)}`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('PrizePicks returned non-JSON (likely captcha/block page)');
  }
  const included = body.included || [];
  const data = body.data || [];
  const players = {};
  const leagues = {};
  for (const row of included) {
    if (row.type === 'new_player') {
      players[row.id] = {
        name: row.attributes?.name,
        team: row.attributes?.team,
        position: row.attributes?.position,
      };
    }
    if (row.type === 'league') {
      leagues[row.id] = row.attributes?.name;
    }
  }
  const out = [];
  for (const d of data) {
    const a = d.attributes || {};
    const player = players[d.relationships?.new_player?.data?.id] || {};
    const sport = leagues[d.relationships?.league?.data?.id] || opts.league || null;
    const line = a.line_score != null ? Number(a.line_score) : null;
    const market = a.stat_type || a.description || 'Prop';
    const base = {
      source: 'prizepicks',
      eventId: String(a.game_id || d.id),
      sport,
      startTime: a.start_time || a.board_time || null,
      live: Boolean(a.is_live),
      homeTeam: null,
      awayTeam: null,
      market,
      line,
      odds: null,
      player: player.name || null,
      team: player.team || null,
      book: 'PrizePicks',
      projectionId: d.id,
    };
    out.push({ ...base, selection: 'Over' });
    out.push({ ...base, selection: 'Under' });
  }
  return out;
}

module.exports = { fetchPrizePicks, LEAGUE_IDS, buildUrl };
