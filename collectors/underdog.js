/**
 * Underdog Fantasy public over/under lines — WORKS from cloud IPs (tested 2026-10-25).
 * Endpoint: GET https://api.underdogfantasy.com/v1/over_under_lines
 */
const ENDPOINT = 'https://api.underdogfantasy.com/v1/over_under_lines';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'application/json',
};

function parseAmerican(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/^\+/, ''));
  return Number.isFinite(n) ? n : null;
}

async function fetchUnderdogRaw() {
  const res = await fetch(ENDPOINT, { headers: HEADERS });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Underdog ${res.status}: ${t.slice(0, 120)}`);
  }
  return res.json();
}

async function fetchUnderdog({ limit = 800 } = {}) {
  const data = await fetchUnderdogRaw();
  const players = Object.fromEntries((data.players || []).map((p) => [p.id, p]));
  const apps = Object.fromEntries((data.appearances || []).map((a) => [a.id, a]));
  const games = Object.fromEntries((data.games || []).map((g) => [g.id, g]));

  const out = [];
  for (const line of data.over_under_lines || []) {
    if (line.status && line.status !== 'active') continue;
    const ou = line.over_under || {};
    const appearanceStat = ou.appearance_stat || {};
    const app = apps[appearanceStat.appearance_id] || {};
    const player = players[app.player_id] || {};
    const game = games[app.match_id] || {};

    const market =
      appearanceStat.display_stat ||
      appearanceStat.stat ||
      (ou.title || '').replace(/\s+O\/U$/, '') ||
      'Prop';
    const lineVal = line.stat_value != null ? Number(line.stat_value) : null;

    let over = null;
    let under = null;
    let playerName =
      player.first_name && player.last_name
        ? `${player.first_name} ${player.last_name}`
        : player.name || null;

    for (const opt of line.options || []) {
      if (!playerName && opt.selection_header) playerName = opt.selection_header;
      const price = parseAmerican(opt.american_price || opt.odds?.fantasy?.american);
      const choice = (opt.choice || '').toLowerCase();
      if (choice === 'higher' || choice === 'over') over = price;
      if (choice === 'lower' || choice === 'under') under = price;
    }

    out.push({
      source: 'underdog',
      eventId: String(app.match_id || game.id || line.id),
      sport: null,
      startTime: null,
      live: Boolean(line.live_event),
      homeTeam: null,
      awayTeam: null,
      market,
      selection: null,
      line: lineVal,
      odds: null,
      player: playerName,
      team: null,
      book: 'Underdog',
      over,
      under,
      market_label: market,
      game_title: game.full_team_names_title || game.abbreviated_title || null,
      game_progress: game.match_progress || null,
      id: `ud-${line.id}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = { fetchUnderdog, fetchUnderdogRaw, ENDPOINT };
