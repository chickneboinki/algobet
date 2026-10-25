/**
 * Player props — prefers live Underdog Fantasy board (works without API key).
 */
async function fetchUnderdogProps({ limit = 120, q = '' } = {}) {
  const res = await fetch('https://api.underdogfantasy.com/v1/over_under_lines', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Underdog ${res.status}`);
  const data = await res.json();
  const players = Object.fromEntries((data.players || []).map((p) => [p.id, p]));
  const apps = Object.fromEntries((data.appearances || []).map((a) => [a.id, a]));
  const games = Object.fromEntries((data.games || []).map((g) => [g.id, g]));

  const query = (q || '').toLowerCase().trim();
  const out = [];
  for (const line of data.over_under_lines || []) {
    if (line.status && line.status !== 'active') continue;
    const ou = line.over_under || {};
    const appearanceStat = ou.appearance_stat || {};
    const app = apps[appearanceStat.appearance_id] || {};
    const player = players[app.player_id] || {};
    const game = games[app.match_id] || {};

    let playerName =
      player.first_name && player.last_name
        ? `${player.first_name} ${player.last_name}`
        : player.name || null;

    let over = null;
    let under = null;
    for (const opt of line.options || []) {
      if (!playerName && opt.selection_header) playerName = opt.selection_header;
      const priceRaw = opt.american_price || opt.odds?.fantasy?.american;
      const price = priceRaw != null ? Number(String(priceRaw).replace(/^\+/, '')) : null;
      const choice = (opt.choice || '').toLowerCase();
      if (choice === 'higher' || choice === 'over') over = Number.isFinite(price) ? price : null;
      if (choice === 'lower' || choice === 'under') under = Number.isFinite(price) ? price : null;
    }

    const market =
      appearanceStat.display_stat ||
      appearanceStat.stat ||
      (ou.title || '').replace(/\s+O\/U$/, '') ||
      'Prop';
    const gameTitle = game.full_team_names_title || game.abbreviated_title || '';
    const lineVal = line.stat_value != null ? Number(line.stat_value) : null;

    if (query) {
      const blob = `${playerName || ''} ${market} ${gameTitle}`.toLowerCase();
      if (!blob.includes(query)) continue;
    }

    out.push({
      id: `ud-${line.id}`,
      player: playerName || 'Player',
      market,
      market_label: market,
      line: lineVal,
      over,
      under,
      book: 'Underdog',
      source: 'underdog',
      live: Boolean(line.live_event),
      game_title: gameTitle || null,
      game_progress: game.match_progress || null,
      home_team: null,
      away_team: null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function mockProps(sport, home, away) {
  return [
    {
      id: 'mock-0',
      player: 'Sample Player',
      market: 'Points',
      market_label: 'Points',
      line: 22.5,
      over: -110,
      under: -110,
      book: 'Sample',
      source: 'sample',
      home_team: home,
      away_team: away,
      sport,
    },
  ];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sport = (req.query.sport || 'NFL').toUpperCase();
  const home = req.query.home || '';
  const away = req.query.away || '';
  const q = req.query.q || [home, away].filter(Boolean).join(' ') || '';

  let udErr = '';
  try {
    const props = await fetchUnderdogProps({ limit: 150, q });
    if (props.length) {
      return res.status(200).json({
        source: 'underdog',
        sport,
        count: props.length,
        props,
        note: 'Live player props from Underdog Fantasy (Higher / Lower). Real names, real lines.',
      });
    }
  } catch (e) {
    udErr = e.message;
  }

  const props = mockProps(sport, home, away);
  return res.status(200).json({
    source: 'sample',
    sport,
    count: props.length,
    props,
    note: `Underdog unavailable (${udErr || 'empty'}). Showing sample.`,
  });
}
