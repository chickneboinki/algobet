/**
 * PrizePicks public projections feed (the same JSON the website loads).
 * To confirm current URL: open app.prizepicks.com → Network → filter XHR → "projections".
 */
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Origin: 'https://app.prizepicks.com',
  Referer: 'https://app.prizepicks.com/',
};

const PP_URL = (single = true, leagueId) => {
  const q = new URLSearchParams({ single_stat: String(single), per_page: '250' });
  if (leagueId) q.set('league_id', String(leagueId));
  return `https://api.prizepicks.com/projections?${q}`;
};

const LEAGUE_IDS = {
  NBA: 7,
  NFL: 9,
  MLB: 2,
  NHL: 8,
  NCAAF: 15,
  NCAAB: 20,
};

async function fetchPrizePicks({ singleStat = true, league = null } = {}) {
  const leagueId = league ? LEAGUE_IDS[String(league).toUpperCase()] : null;
  const url = PP_URL(singleStat, leagueId);
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PrizePicks ${res.status}: ${t.slice(0, 120)}`);
  }
  const body = await res.json();
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
    const playerId = d.relationships?.new_player?.data?.id;
    const leagueRel = d.relationships?.league?.data?.id;
    const player = players[playerId] || {};
    const line = a.line_score != null ? Number(a.line_score) : null;
    const market = a.stat_type || a.description || 'Prop';
    const sport = leagues[leagueRel] || league || null;
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

module.exports = { fetchPrizePicks, LEAGUE_IDS };
