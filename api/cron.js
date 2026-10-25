/**
 * Daily job ~6:00 AM Central (11:00 UTC during CDT).
 * 1) Auto-settle finished bets (learn from results)
 * 2) Rank best bets with history weights
 * 3) Post Discord rich embeds if webhook configured
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
    : process.env.APP_URL || 'https://helpbet.vercel.app';

  const out = { at: new Date().toISOString(), steps: {} };

  // Learn: settle finished games first so weights update on next best-bets
  try {
    const s = await fetch(`${base}/api/settle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    out.steps.settle = await s.json();
  } catch (e) {
    out.steps.settle = { error: e.message };
  }

  try {
    const g = await fetch(`${base}/api/games?sport=NFL`);
    out.steps.games = { status: g.status, ...(await g.json().catch(() => ({}))) };
  } catch (e) {
    out.steps.games = { error: e.message };
  }

  try {
    const b = await fetch(`${base}/api/best-bets?persist=1&min_confidence=0.5&limit=25`);
    out.steps.best_bets = await b.json();
  } catch (e) {
    out.steps.best_bets = { error: e.message };
  }

  // Daily Discord digest
  try {
    const n = await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'HelpBet · Daily best picks (6 AM CT)',
        content: 'Morning card — game lines, tool leans, and player bets.',
      }),
    });
    out.steps.notify = await n.json();
  } catch (e) {
    out.steps.notify = { error: e.message };
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
          message: `Daily cron ${out.at}: settled=${out.steps.settle?.settled ?? '?'} picks=${out.steps.best_bets?.pick_count ?? '?'} notify=${out.steps.notify?.ok ? 'ok' : out.steps.notify?.error || 'skip'}`,
        }),
      });
    } catch {}
  }

  return res.status(200).json({ ok: true, ...out });
}
