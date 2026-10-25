/**
 * Scheduled refresh: pull FanDuel + DraftKings games, PrizePicks props, rank best bets.
 * Runs every 2 hours (vercel.json).
 */
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

  const out = { at: new Date().toISOString(), steps: {} };

  try {
    const g = await fetch(`${base}/api/games?sport=NFL`);
    out.steps.games = await g.json();
  } catch (e) {
    out.steps.games = { error: e.message };
  }

  try {
    const p = await fetch(`${base}/api/props?sport=NFL`);
    out.steps.props = await p.json();
  } catch (e) {
    out.steps.props = { error: e.message };
  }

  try {
    const b = await fetch(`${base}/api/best-bets?persist=1&min_confidence=0.52&limit=20`);
    out.steps.best_bets = await b.json();
  } catch (e) {
    out.steps.best_bets = { error: e.message };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/watch_log`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          message: `Refresh ${out.at}: games=${out.steps.games?.count ?? '?'} props=${out.steps.props?.count ?? '?'} picks=${out.steps.best_bets?.pick_count ?? '?'}`,
        }),
      });
    } catch {}
  }

  return res.status(200).json({ ok: true, ...out });
}
