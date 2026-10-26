/** Daily: settle → rank all sports → post each user's own Discord webhook.
 *  Also serves /api/health (?route=health) so the two tiny endpoints share
 *  one Vercel Serverless Function — Hobby plan caps a deployment at 12. */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('route') === 'health') {
    return res.status(200).json({
      ok: true,
      openrouter_configured: Boolean(process.env.OPENROUTER_API_KEY),
      odds_api_configured: Boolean(process.env.ODDS_API_KEY),
      balldontlie_configured: Boolean(process.env.BALLDONTLIE_API_KEY),
      time: new Date().toISOString(),
    });
  }

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

  try {
    const f = await fetch(`${base}/api/notify?route=finalize`);
    out.steps.finalize = await f.json().catch(() => ({}));
  } catch (e) {
    out.steps.finalize = { error: e.message };
  }

  return res.status(200).json({ ok: true, ...out });
}
