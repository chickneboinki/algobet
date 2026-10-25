const FREE_MODELS = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'poolside/laguna-s-2.1:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

async function callOpenRouter(key, model, messages, temperature) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://algobet-bro-2917.vercel.app',
      'X-Title': 'AlgoBet',
    },
    body: JSON.stringify({ model, temperature, messages }),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { ok: r.ok, status: r.status, data, text };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const key = process.env.OPENROUTER_API_KEY;
  const preferred = process.env.OPENROUTER_MODEL;
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
      suggested_code: '// Add OPENROUTER_API_KEY in Vercel',
      explanation: 'OpenRouter not configured on server.',
      key_features: [],
      confidence: 0.5,
    });
  }

  let system, user;
  if (action === 'analyze') {
    system =
      'You are a sports betting coach. Reply with JSON only, no markdown: {"summary":"plain English","suggestions":["..."],"new_algorithm_ideas":["..."]}';
    user = summary || 'No bets yet';
  } else {
    system =
      'You build simple sports betting tools. Reply with JSON only, no markdown: {"name":"...","description":"...","suggested_code":"...","explanation":"plain English","key_features":["..."],"confidence":0.0-1.0}';
    user = `Create algorithm: ${prompt}\nSports: ${(sports || []).join(', ') || 'all'}`;
  }

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const temperature = action === 'analyze' ? 0.3 : 0.5;

  const modelsToTry = [];
  if (preferred && !preferred.includes('claude-3.5-sonnet') && !preferred.includes('claude-3-5-sonnet')) {
    modelsToTry.push(preferred);
  }
  for (const m of FREE_MODELS) {
    if (!modelsToTry.includes(m)) modelsToTry.push(m);
  }

  let lastError = '';
  for (const model of modelsToTry) {
    try {
      const { ok, data, text } = await callOpenRouter(key, model, messages, temperature);
      if (!ok) {
        lastError = data?.error?.message || text;
        if (String(lastError).includes('no longer available') || String(lastError).includes('404')) continue;
        if (String(lastError).toLowerCase().includes('rate')) continue;
        continue;
      }
      let raw = data.choices?.[0]?.message?.content || '';
      raw = raw.trim();
      if (raw.startsWith('```')) {
        raw = raw.split('\n').slice(1).join('\n');
        if (raw.endsWith('```')) raw = raw.slice(0, -3);
        raw = raw.trim();
      }
      try {
        const parsed = JSON.parse(raw);
        parsed._model_used = model;
        return res.status(200).json(parsed);
      } catch {
        if (action === 'analyze') {
          return res.status(200).json({ summary: raw, suggestions: [], new_algorithm_ideas: [], _model_used: model });
        }
        return res.status(200).json({
          name: 'AI Generated',
          description: prompt,
          suggested_code: raw,
          explanation: 'Raw output from free model',
          key_features: [],
          confidence: 0.6,
          _model_used: model,
        });
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  return res.status(502).json({
    error: lastError || 'All free models failed. Try again in a minute (free tier is rate-limited).',
  });
}
