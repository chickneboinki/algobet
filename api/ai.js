// Paid Llama slug first (the :free variant is no longer available), free models as fallbacks
const FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

async function callOpenRouter(key, model, messages, temperature) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://algobet-bro-2917.vercel.app',
      'X-Title': 'HelpBet',
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
  const { action, prompt, sports, summary, game, tool_results, message } = req.body || {};

  if (!key) {
    if (action === 'explain_game' || action === 'chat_game') {
      const picks = (tool_results || []).filter((t) => t.recommended_side && t.recommended_side !== 'none');
      const best = picks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
      return res.status(200).json({
        reply: best
          ? `Best lean from your tools: ${best.recommended_side} (${best.algorithm_name}). ${best.reasoning || ''} Add OPENROUTER_API_KEY for fuller AI chat.`
          : 'Your tools did not find a strong edge on this game. You can still compare FanDuel and DraftKings lines above.',
        best_pick: best || null,
      });
    }
    if (action === 'analyze') {
      return res.status(200).json({
        summary: summary || 'No OpenRouter key set.',
        suggestions: ['Add OPENROUTER_API_KEY in Vercel'],
        new_algorithm_ideas: [],
      });
    }
    return res.status(200).json({
      name: `AI: ${(prompt || '').slice(0, 40)}`,
      description: prompt,
      sports: sports || [],
      suggested_code: '// Add OPENROUTER_API_KEY',
      explanation: 'OpenRouter not configured.',
      key_features: [],
      confidence: 0.5,
    });
  }

  let system, user, temperature = 0.4;

  if (action === 'explain_game' || action === 'chat_game') {
    system =
      'You are a friendly sports betting helper. Use plain English. No jargon. Based on the game lines and tool results, explain the matchup and what the best lean is. Reply with JSON only: {"reply":"...","best_side":"home|away|none","best_tool":"...","confidence":0-1}';
    user = JSON.stringify({
      question: message || 'Explain this game and the best bet from the tools.',
      game: {
        sport: game?.sport,
        home: game?.home_team,
        away: game?.away_team,
        start: game?.start_time || game?.commence_time,
        books: game?.books,
        odds: game?.odds,
      },
      tool_results: tool_results || [],
    });
  } else if (action === 'analyze') {
    system =
      'You are a sports betting coach. Reply JSON only: {"summary":"plain English","suggestions":["..."],"new_algorithm_ideas":["..."]}';
    user = summary || 'No bets yet';
    temperature = 0.3;
  } else {
    system =
      'You build simple sports betting tools. Reply JSON only, no markdown: {"name":"short name","description":"plain English","sports":["NFL"],"suggested_code":"...","explanation":"...","key_features":["..."],"confidence":0.0-1.0}. sports must be the leagues this tool is for (NFL,NBA,NCAAF,NCAAB,MLB,NHL).';
    user = `Create algorithm: ${prompt}\nSports focus: ${(sports || []).join(', ') || 'infer from prompt'}`;
  }

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  const modelsToTry = [];
  if (preferred && !String(preferred).includes('claude-3.5-sonnet') && !String(preferred).includes('claude-3-5-sonnet')) {
    modelsToTry.push(preferred);
  }
  for (const m of FREE_MODELS) if (!modelsToTry.includes(m)) modelsToTry.push(m);

  let lastError = '';
  for (const model of modelsToTry) {
    try {
      const { ok, data, text } = await callOpenRouter(key, model, messages, temperature);
      if (!ok) {
        lastError = data?.error?.message || text;
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
        if (action === 'explain_game' || action === 'chat_game') {
          return res.status(200).json({
            reply: parsed.reply || raw,
            best_side: parsed.best_side,
            best_tool: parsed.best_tool,
            confidence: parsed.confidence,
            _model_used: model,
          });
        }
        return res.status(200).json(parsed);
      } catch {
        if (action === 'explain_game' || action === 'chat_game') {
          return res.status(200).json({ reply: raw, _model_used: model });
        }
        if (action === 'analyze') {
          return res.status(200).json({ summary: raw, suggestions: [], new_algorithm_ideas: [], _model_used: model });
        }
        return res.status(200).json({
          name: 'AI Generated',
          description: prompt,
          sports: sports || [],
          suggested_code: raw,
          explanation: raw.slice(0, 400),
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
    error: lastError || 'All free models failed. Try again in a minute.',
  });
}
