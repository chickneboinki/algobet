export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(200).json({
    ok: true,
    openrouter_configured: Boolean(process.env.OPENROUTER_API_KEY),
    odds_api_configured: Boolean(process.env.ODDS_API_KEY),
    balldontlie_configured: Boolean(process.env.BALLDONTLIE_API_KEY),
    time: new Date().toISOString(),
  });
}
