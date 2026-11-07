import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE = '/tmp/leanlab_notify_v7.mjs';
const SOURCE =
  'https://raw.githubusercontent.com/chickneboinki/algobet/f6ba816008acb88c15e7e99782e37713391c45c5/api/notify.js';
const API_DIR = dirname(fileURLToPath(import.meta.url));
const API_URL = pathToFileURL(API_DIR.endsWith('/') ? API_DIR : API_DIR + '/').href;

let handlerPromise = null;

function rewriteImports(code) {
  return code
    .replace(/from\s+['"]\.\//g, `from '${API_URL}`)
    .replace(/from\s+['"]\.\.\//g, `from '${API_URL}`);
}

function applyParlayPatches(code) {
  // Route all parlays to botCfg.parlays only
  code = code.replace(
    /const mixCh = botCfg\.parlays \|\| botCfg\.alerts \|\| botCfg\.tracker;\n  if \(mixCh\) for \(const par of buildParlays\(allPicks, 'mix'\)\) jobs\.push\(\{ par, channel: mixCh, sport: 'MIX' \}\);\n  for \(const L of Object\.keys\(byLeague\)\) \{\n    const ch = botCfg\[`ch_\$\{L\}`\];\n    if \(!ch\) continue;\n    for \(const par of buildParlays\(byLeague\[L\], 'league'\)\) jobs\.push\(\{ par, channel: ch, sport: L \}\);\n  }/,
    `const parlayCh = botCfg.parlays;\n  if (!parlayCh) return 0;\n  const leagueFilter = (typeof opts !== 'undefined' && opts && opts.leagues) ? new Set(opts.leagues.map((x) => String(x).toUpperCase())) : null;\n  if (!leagueFilter || leagueFilter.size > 1) {\n    for (const par of buildParlays(allPicks, 'mix')) jobs.push({ par, channel: parlayCh, sport: 'MIX' });\n  }\n  for (const L of Object.keys(byLeague)) {\n    if (leagueFilter && !leagueFilter.has(L)) continue;\n    for (const par of buildParlays(byLeague[L], 'league')) jobs.push({ par, channel: parlayCh, sport: L });\n  }`
  );

  // postParlays signature opts
  code = code.replace(
    'async function postParlays(day, dayLabel, allPicks, byLeague, botCfg, guildId) {',
    'async function postParlays(day, dayLabel, allPicks, byLeague, botCfg, guildId, opts = {}) {'
  );

  // wipe includes parlays
  code = code.replace(
    "if (k.startsWith('ch_') || k === 'alerts' || k === 'tracker' || k === 'stats' || k === 'roles_panel')",
    "if (k.startsWith('ch_') || k === 'alerts' || k === 'tracker' || k === 'stats' || k === 'parlays' || k === 'roles_panel')"
  );

  // Guard: never mass-send without explicit intent
  if (!code.includes('hasIntent')) {
    code = code.replace(
      'if (botCfg && Object.keys(botCfg).length) {',
      `if (botCfg && Object.keys(botCfg).length) {
      const hasIntent = (Array.isArray(body.dates) && body.dates.length) || body.all_users === true || body.parlays_only === true || body._cont === true || body._resume === true;
      if (!hasIntent) {
        return res.status(200).json({ ok: true, noop: true, message: 'No send — pass dates, parlays_only, or all_users.' });
      }`
    );
  }

  // parlays_only path after allDates
  if (!code.includes('parlays_only === true')) {
    code = code.replace(
      "const allDates = Array.isArray(body.dates) ? body.dates.map((d) => String(d).trim()).filter(Boolean).sort() : [];\n      const resume = body._resume === true;",
      `const allDates = Array.isArray(body.dates) ? body.dates.map((d) => String(d).trim()).filter(Boolean).sort() : [];
      if (body.parlays_only === true) {
        if (!botCfg.parlays) return res.status(400).json({ error: 'Set a Parlays channel in Discord /config first.' });
        const leagueFilter = Array.isArray(body.leagues) && body.leagues.length
          ? body.leagues.map((x) => String(x).toUpperCase()).filter((x) => x && x !== 'ALL') : null;
        let picks = await fetchPicksForSend('ALL', 0, allDates.length ? 0 : 2, allDates.length ? allDates : null);
        if (leagueFilter?.length) picks = picks.filter((p) => leagueFilter.includes(String(p.sport || '').toUpperCase()));
        const byDate = {};
        for (const p of picks) { const k = pickDayKey(p) || 'unknown'; (byDate[k] ||= []).push(p); }
        if (allDates.length) for (const k of Object.keys(byDate)) if (!allDates.includes(k)) delete byDate[k];
        let posted = 0; const daysDone = [];
        for (const day of Object.keys(byDate).sort()) {
          const dayPicks = byDate[day] || [];
          const byLeague = {};
          for (const p of dayPicks) { const s2 = String(p.sport || 'OTHER').toUpperCase(); (byLeague[s2] ||= []).push(p); }
          const dayLabel = new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
          posted += (await postParlays(day, dayLabel, dayPicks, byLeague, botCfg, guildId, { leagues: leagueFilter }).catch(() => 0)) || 0;
          daysDone.push(day);
        }
        return res.status(200).json({ ok: true, parlays_only: true, sent: posted, dates: allDates, channel: botCfg.parlays,
          message: posted ? ('Posted ' + posted + ' parlay(s) for ' + daysDone.join(', ')) : 'No parlays built for selected days.' });
      }
      const resume = body._resume === true;`
    );
  }

  return code;
}

async function loadHandler() {
  if (handlerPromise) return handlerPromise;
  handlerPromise = (async () => {
    if (!existsSync(CACHE)) {
      const r = await fetch(SOURCE);
      if (!r.ok) throw new Error('Failed to fetch notify.js: ' + r.status);
      let code = await r.text();
      code = applyParlayPatches(code);
      code = rewriteImports(code);
      writeFileSync(CACHE, code);
    }
    const mod = await import(pathToFileURL(CACHE).href + '?v=7');
    return mod.default;
  })();
  return handlerPromise;
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on?.('data', (c) => { raw += c; });
    req.on?.('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    // Vercel often already parsed
    if (!req.on) {
      try { resolve(typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})); }
      catch { resolve({}); }
    }
  });
}

export default async function handler(req, res) {
  res.setHeader?.('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url || '/', 'http://localhost');
  const route = url.searchParams.get('route');

  // Discord interactions + tick always load full bot
  if (route === 'interactions' || route === 'tick' || route === 'finalize' || route === 'register') {
    try {
      const h = await loadHandler();
      return await h(req, res);
    } catch (e) {
      console.error('notify load error', e);
      if (!res.headersSent) return res.status(500).json({ error: e.message || String(e) });
      return;
    }
  }

  // Early no-op for empty/health probes — never mass-send
  let body = {};
  try {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) body = req.body;
    else if (typeof req.body === 'string') body = JSON.parse(req.body || '{}');
  } catch { body = {}; }

  const hasIntent =
    (Array.isArray(body.dates) && body.dates.length > 0) ||
    body.all_users === true ||
    body.parlays_only === true ||
    body._cont === true ||
    body._resume === true ||
    body.type === 1 || // discord ping sometimes posted without route
    body.type === 2 ||
    body.type === 3;

  if (!hasIntent) {
    return res.status(200).json({
      ok: true,
      noop: true,
      message: 'No send — pass dates, parlays_only, or all_users.',
    });
  }

  try {
    const h = await loadHandler();
    return await h(req, res);
  } catch (e) {
    console.error('notify load error', e);
    if (!res.headersSent) return res.status(500).json({ error: e.message || String(e) });
  }
}
