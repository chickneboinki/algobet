export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    status: 'ok',
    version: '1.0.0',
    openrouter_configured: !!process.env.OPENROUTER_API_KEY,
    odds_api_configured: !!process.env.ODDS_API_KEY,
  });
}
