export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const results = { at: new Date().toISOString() };

  try {
    const r = await fetch('https://partner-api.prizepicks.com/projections?per_page=50', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const n = (d.data || []).length;
    const players = {};
    for (const row of d.included || []) {
      if (row.type === 'new_player') players[row.id] = row.attributes || {};
    }
    const first = (d.data || [])[0];
    const p = players[first?.relationships?.new_player?.data?.id] || {};
    const a = first?.attributes || {};
    results.prizepicks = {
      ok: true,
      count: n,
      sample: p.name ? `${p.name} ${a.stat_type} ${a.line_score}` : null,
    };
  } catch (e) {
    results.prizepicks = { ok: false, error: e.message };
  }

  try {
    const r = await fetch('https://api.underdogfantasy.com/v1/over_under_lines', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        Accept: 'application/json',
      },
    });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    results.underdog = { ok: true, count: (d.over_under_lines || []).length };
  } catch (e) {
    results.underdog = { ok: false, error: e.message };
  }

  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    const d = await r.json();
    const withOdds = (d.events || []).filter((e) => (e.competitions?.[0]?.odds || []).length);
    results.draftkings_via_espn = {
      ok: true,
      games: (d.events || []).length,
      with_odds: withOdds.length,
      sample: withOdds.slice(0, 2).map((e) => {
        const o = e.competitions[0].odds[0];
        return `${e.name} | ${o.details} ou ${o.overUnder} (${o.provider?.name})`;
      }),
    };
  } catch (e) {
    results.draftkings_via_espn = { ok: false, error: e.message };
  }

  results.fanduel = {
    ok: Boolean(process.env.ODDS_API_KEY),
    note: process.env.ODDS_API_KEY
      ? 'ODDS_API_KEY set — /api/games returns FanDuel + DraftKings when credits remain'
      : 'Direct FanDuel blocked. Keep ODDS_API_KEY in Vercel for FanDuel lines.',
  };

  const ok = results.prizepicks?.ok || results.underdog?.ok || results.draftkings_via_espn?.ok;
  return res.status(200).json({
    ok,
    message: ok
      ? 'Live: PrizePicks props + DraftKings game lines (ESPN) + Underdog props'
      : 'No feeds',
    results,
  });
}
