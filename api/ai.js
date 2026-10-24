export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
  const { action, prompt, sports, summary } = req.body || {};

  if (!key) {
    if (action === 'analyze') {
      return res.status(200).json({
        summary: summary || 'No OpenRouter key set.',
        suggestions: ['Add OPENROUTER_API_KEY in Vercel env vars', 'Track more bets'],
        new_algorithm_ideas: ['Weather-adjusted totals', 'Rest-advantage NBA filter'],
      });
    }
    return res.status(200).json({
      name: `AI: ${(prompt || '').slice(0, 40)}`,
      description: prompt,
      suggested_code: '// Add OPENROUTER_API_KEY in Vercel project settings → Environment Variables',
      explanation: 'OpenRouter not configured on server.',
      key_features: [],
      confidence: 0.5,
    });
  }

  try {
    let system, user;
    if (action === 'analyze') {
      system = 'Quantitative sports betting coach. Reply JSON only: {"summary":"...","suggestions":["..."],"new_algorithm_ideas":["..."]}';
      user = summary || 'No bets yet';
    } else {
      system = `You build evidence-gated sports algorithms. Reply JSON only:\n{"name":"...","description":"...","suggested_code":"...","explanation":"...","key_features":["..."],"confidence":0.0-1.0}`;
      user = `Create algorithm: ${prompt}\nSports: ${(sports||[]).join(', ') || 'all'}`;
    }

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://algobet.vercel.app',
        'X-Title': 'AlgoBet',
      },
      body: JSON.stringify({
        model,
        temperature: action === 'analyze' ? 0.3 : 0.5,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: t });
    }
    const data = await r.json();
    let raw = data.choices?.[0]?.message?.content || '';
    raw = raw.trim();
    if (raw.startsWith('```')) {
      raw = raw.split('\n').slice(1).join('\n');
      if (raw.endsWith('```')) raw = raw.slice(0, -3);
    }
    try {
      return res.status(200).json(JSON.parse(raw));
    } catch {
      if (action === 'analyze') return res.status(200).json({ summary: raw, suggestions: [], new_algorithm_ideas: [] });
      return res.status(200).json({ name: 'AI Generated', description: prompt, suggested_code: raw, explanation: 'Raw output', key_features: [], confidence: 0.6 });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
