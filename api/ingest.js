/**
 * Live feed trial: Underdog (works) + ESPN games + optional blocked books.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const results = { at: new Date().toISOString() };

  try {
    const r = await fetch('https://api.underdogfantasy.com/v1/over_under_lines', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Accept: 'application/json',
      },
    });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const n = (d.over_under_lines || []).length;
    const sampleLine = (d.over_under_lines || [])[0];
    const name = sampleLine?.options?.[0]?.selection_header;
    const sub = sampleLine?.options?.[0]?.selection_subheader;
    results.underdog = {
      ok: true,
      count: n,
      sample: name ? `${name} — ${sub}` : null,
    };
  } catch (e) {
    results.underdog = { ok: false, error: e.message };
  }

  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    const d = await r.json();
    const events = d.events || [];
    results.espn_nfl = {
      ok: true,
      count: events.length,
      sample: events.slice(0, 3).map((e) => e.name),
    };
  } catch (e) {
    results.espn_nfl = { ok: false, error: e.message };
  }

  try {
    const r = await fetch('https://api.prizepicks.com/projections?single_stat=true&per_page=3', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
        Origin: 'https://app.prizepicks.com',
      },
    });
    results.prizepicks = { ok: r.ok, status: r.status };
  } catch (e) {
    results.prizepicks = { ok: false, error: e.message };
  }

  const ok = Boolean(results.underdog?.ok || results.espn_nfl?.ok);
  return res.status(200).json({
    ok,
    message: ok
      ? 'Live feeds available (Underdog player props + ESPN games/odds).'
      : 'No live feed answered',
    results,
  });
}
