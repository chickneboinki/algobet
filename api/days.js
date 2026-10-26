/** Days (Central) that still have upcoming games with lines — for Send picker. */

const LEAGUES = ['NFL', 'NBA', 'NCAAF', 'NCAAB', 'MLB', 'NHL'];

function centralDateKey(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  } catch {
    return null;
  }
}

function labelFor(key) {
  try {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
    return dt.toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return key;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const base = process.env.APP_URL || 'https://helpbet.vercel.app';
  const now = Date.now();
  const counts = new Map();

  await Promise.all(
    LEAGUES.map(async (sport) => {
      try {
        const r = await fetch(`${base}/api/games?sport=${sport}`);
        const text = await r.text();
        if (!r.ok || text.trim().startsWith('<')) return;
        const data = JSON.parse(text);
        for (const g of data.games || []) {
          const iso = g.start_time || g.commence_time;
          if (!iso) continue;
          const t = new Date(iso).getTime();
          if (!Number.isFinite(t) || t < now - 2 * 60e3) continue;
          if (!(g.odds || (g.books && Object.keys(g.books).length))) continue;
          const key = centralDateKey(iso);
          if (!key) continue;
          if (!counts.has(key)) counts.set(key, { date: key, count: 0, sports: new Set() });
          const row = counts.get(key);
          row.count += 1;
          row.sports.add(String(g.sport || sport).toUpperCase());
        }
      } catch {}
    })
  );

  const days = [...counts.values()]
    .map((d) => ({
      date: d.date,
      label: labelFor(d.date),
      count: d.count,
      sports: [...d.sports].sort(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return res.status(200).json({
    timezone: 'America/Chicago',
    days,
    refreshed_at: new Date().toISOString(),
  });
}
