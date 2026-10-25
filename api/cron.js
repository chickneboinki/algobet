/** Daily: settle → rank all sports → post each user's own Discord webhook. */
export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    if (req.headers['x-vercel-cron'] !== '1') return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.APP_URL || 'https://helpbet.vercel.app';
  const out = { at: new Date().toISOString(), steps: {} };

  try {
    const s = await fetch(`${base}/api/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    out.steps.settle = await s.json().catch(() => ({}));
  } catch (e) {
    out.steps.settle = { error: e.message };
  }

  try {
    const g = await fetch(`${base}/api/games?sport=ALL`);
    out.steps.games = { status: g.status, ...(await g.json().catch(() => ({}))) };
  } catch (e) {
    out.steps.games = { error: e.message };
  }

  try {
    const b = await fetch(`${base}/api/best-bets?persist=1&min_confidence=0.45&limit=80`);
    out.steps.best_bets = await b.json().catch(() => ({}));
  } catch (e) {
    out.steps.best_bets = { error: e.message };
  }

  try {
    const n = await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all_users: true, title: 'HelpBet · Daily — all bets for today' }),
    });
    out.steps.notify = await n.json().catch(() => ({}));
  } catch (e) {
    out.steps.notify = { error: e.message };
  }

  return res.status(200).json({ ok: true, ...out });
}
