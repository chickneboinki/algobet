export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    if (!isVercelCron) return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://algobet-bro-2917.vercel.app';

  try {
    const r = await fetch(`${base}/api/best-bets?persist=1&min_confidence=0.52&limit=20`);
    const data = await r.json();

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      await fetch(`${supabaseUrl}/rest/v1/watch_log`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          message: `Auto scan: ${data.games_scanned || 0} games, ${data.pick_count || 0} ranked picks`,
          meta: { pick_count: data.pick_count, games_scanned: data.games_scanned },
        }),
      });
    }

    return res.status(200).json({ ok: true, ...data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
