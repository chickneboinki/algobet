/**
 * Live player props:
 * 1) PrizePicks partner-api (real PP board)
 * 2) Underdog Fantasy
 * 3) Sample fallback
 */

async function fetchPrizePicks({ limit = 120, q = '', sport = '' } = {}) {
  const res = await fetch('https://partner-api.prizepicks.com/projections?per_page=200', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`PP ${res.status}`);
  const body = await res.json();
  const players = {};
  for (const row of body.included || []) {
    if (row.type === 'new_player') players[row.id] = row.attributes || {};
  }
  const query = (q || '').toLowerCase().trim();
  const sportU = (sport || '').toUpperCase();
  const out = [];
  for (const d of body.data || []) {
    const a = d.attributes || {};
    const p = players[d.relationships?.new_player?.data?.id] || {};
    const name = p.name || p.display_name || 'Player';
    const market = a.stat_type || a.stat_display_name || 'Prop';
    const league = a.league_ppid || p.league || '';
    if (sportU && league && !String(league).toUpperCase().includes(sportU.replace('NCAAF', 'CFB').replace('NCAAB', 'CBB'))) {
      // keep loose — still include NFL/NBA matches
      if (sportU === 'NFL' && !/NFL|CFB/i.test(league)) continue;
      if (sportU === 'NBA' && !/NBA/i.test(league)) continue;
    }
    if (query) {
      const blob = `${name} ${market} ${league} ${a.description || ''}`.toLowerCase();
      if (!blob.includes(query)) continue;
    }
    out.push({
      id: `pp-${d.id}`,
      player: name,
      market,
      market_label: market,
      line: a.line_score != null ? Number(a.line_score) : null,
      over: null,
      under: null,
      book: 'PrizePicks',
      source: 'prizepicks',
      live: Boolean(a.is_live),
      team: p.team_name || p.team || null,
      sport: league || sportU,
      game_title: a.description || null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchUnderdog({ limit = 80, q = '' } = {}) {
  const res = await fetch('https://api.underdogfantasy.com/v1/over_under_lines', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`UD ${res.status}`);
  const data = await res.json();
  const players = Object.fromEntries((data.players || []).map((p) => [p.id, p]));
  const apps = Object.fromEntries((data.appearances || []).map((a) => [a.id, a]));
  const games = Object.fromEntries((data.games || []).map((g) => [g.id, g]));
  const query = (q || '').toLowerCase().trim();
  const out = [];
  for (const line of data.over_under_lines || []) {
    if (line.status && line.status !== 'active') continue;
    const ou = line.over_under || {};
    const st = ou.appearance_stat || {};
    const app = apps[st.appearance_id] || {};
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
    const market = st.display_stat || st.stat || 'Prop';
    const gameTitle = game.full_team_names_title || game.abbreviated_title || '';
    if (query) {
      const blob = `${playerName || ''} ${market} ${gameTitle}`.toLowerCase();
      if (!blob.includes(query)) continue;
    }
    out.push({
      id: `ud-${line.id}`,
      player: playerName || 'Player',
      market,
      market_label: market,
      line: line.stat_value != null ? Number(line.stat_value) : null,
      over,
      under,
      book: 'Underdog',
      source: 'underdog',
      live: Boolean(line.live_event),
      game_title: gameTitle || null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sport = (req.query.sport || '').toUpperCase();
  const home = req.query.home || '';
  const away = req.query.away || '';
  const q = req.query.q || [home, away].filter(Boolean).join(' ');
  const book = (req.query.book || 'all').toLowerCase();

  const sources = [];
  let props = [];

  if (book === 'all' || book === 'prizepicks' || book === 'pp') {
    try {
      const pp = await fetchPrizePicks({ limit: 100, q, sport });
      if (pp.length) {
        props = props.concat(pp);
        sources.push({ prizepicks: pp.length });
      }
    } catch (e) {
      sources.push({ prizepicks: e.message });
    }
  }

  if (book === 'all' || book === 'underdog') {
    try {
      const ud = await fetchUnderdog({ limit: 60, q });
      if (ud.length) {
        props = props.concat(ud);
        sources.push({ underdog: ud.length });
      }
    } catch (e) {
      sources.push({ underdog: e.message });
    }
  }

  if (!props.length) {
    return res.status(200).json({
      source: 'empty',
      count: 0,
      props: [],
      sources_tried: sources,
      note: 'No live props right now (rate limit or filter). Retry in a minute.',
    });
  }

  return res.status(200).json({
    source: sources.map((s) => Object.keys(s)[0]).join('+'),
    count: props.length,
    props,
    sources_tried: sources,
    note: 'Live player props: PrizePicks (More/Less) and/or Underdog (Higher/Lower).',
  });
}
