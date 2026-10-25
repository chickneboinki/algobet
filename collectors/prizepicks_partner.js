/**
 * PrizePicks partner API — WORKS without Cloudflare (tested 2026-10-25).
 * GET https://partner-api.prizepicks.com/projections
 * Returns ~20k projections. Rate-limit carefully (429 if hammered).
 */
const ENDPOINT = 'https://partner-api.prizepicks.com/projections';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

async function fetchPrizePicksPartner({ perPage = 250, league = null } = {}) {
  const q = new URLSearchParams();
  if (perPage) q.set('per_page', String(perPage));
  // partner API often returns a large default board without league filter
  const url = q.toString() ? `${ENDPOINT}?${q}` : ENDPOINT;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PrizePicks partner ${res.status}: ${t.slice(0, 120)}`);
  }
  const body = await res.json();
  const players = {};
  const leagues = {};
  const games = {};
  for (const row of body.included || []) {
    if (row.type === 'new_player') players[row.id] = row.attributes || {};
    if (row.type === 'league') leagues[row.id] = row.attributes || {};
    if (row.type === 'game') games[row.id] = row.attributes || {};
  }

  const out = [];
  for (const d of body.data || []) {
    const a = d.attributes || {};
    if (a.status && a.status !== 'pre_game' && a.status !== 'in_game' && a.status !== 'active') {
      // keep pre_game and live-ish
    }
    const pid = d.relationships?.new_player?.data?.id;
    const lid = d.relationships?.league?.data?.id;
    const gid = d.relationships?.game?.data?.id;
    const player = players[pid] || {};
    const leagueObj = leagues[lid] || {};
    const game = games[gid] || {};
    const sport = a.league_ppid || leagueObj.name || player.league || null;

    if (league && sport && String(sport).toUpperCase() !== String(league).toUpperCase()) {
      // soft filter: league_ppid is often NFL, NBA, etc.
      if (!String(sport).toUpperCase().includes(String(league).toUpperCase())) continue;
    }

    const market = a.stat_type || a.stat_display_name || a.projection_type || 'Prop';
    const line = a.line_score != null ? Number(a.line_score) : null;
    const name = player.name || player.display_name || null;

    out.push({
      source: 'prizepicks',
      eventId: String(a.game_id || gid || d.id),
      sport,
      startTime: a.start_time || a.board_time || null,
      live: Boolean(a.is_live || a.in_game),
      homeTeam: null,
      awayTeam: null,
      market,
      selection: null,
      line,
      odds: null,
      player: name,
      team: player.team_name || player.team || null,
      book: 'PrizePicks',
      over: null,
      under: null,
      market_label: market,
      id: `pp-${d.id}`,
      description: a.description || null,
    });
  }
  return out;
}

module.exports = { fetchPrizePicksPartner, ENDPOINT };
