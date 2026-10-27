export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const results = { at: new Date().toISOString() };

  // PrizePicks
  try {
    const r = await fetch('https://partner-api.prizepicks.com/projections?per_page=30', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    results.prizepicks = { ok: true, count: (d.data || []).length };
  } catch (e) {
    results.prizepicks = { ok: false, error: e.message };
  }

  // FanDuel
  try {
    const q = new URLSearchParams({
      page: 'CUSTOM',
      customPageId: 'nfl',
      language: 'en',
      regionCode: 'NAMERICA',
      _ak: process.env.FD_AK || 'FhMFpcPWXMeyZxOx',
    });
    const r = await fetch(
      `https://sbapi.il.sportsbook.fanduel.com/api/content-managed-page?${q}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'application/json',
          'X-Application': 'Whistler',
          Referer: 'https://sportsbook.fanduel.com/',
        },
      }
    );
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const markets = Object.keys(d.attachments?.markets || {}).length;
    const events = Object.keys(d.attachments?.events || {}).length;
    results.fanduel = { ok: true, events, markets };
  } catch (e) {
    results.fanduel = { ok: false, error: e.message };
  }

  // DraftKings via ESPN
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    const d = await r.json();
    const withOdds = (d.events || []).filter((e) => (e.competitions?.[0]?.odds || []).length);
    results.draftkings = {
      ok: true,
      games: (d.events || []).length,
      with_odds: withOdds.length,
      sample: withOdds.slice(0, 2).map((e) => {
        const o = e.competitions[0].odds[0];
        return `${e.name} | ${o.details} (${o.provider?.name})`;
      }),
    };
  } catch (e) {
    results.draftkings = { ok: false, error: e.message };
  }

  const ok = results.prizepicks?.ok || results.fanduel?.ok || results.draftkings?.ok;
  return res.status(200).json({
    ok,
    message: 'PrizePicks + FanDuel + DraftKings live feeds',
    results,
  });
}
