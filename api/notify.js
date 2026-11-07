import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE = '/tmp/leanlab_notify_v5.mjs';
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
  const oldPost = `async function postParlays(day, dayLabel, allPicks, byLeague, botCfg, guildId) {
  let posted = 0;
  const jobs = [];
  const mixCh = botCfg.parlays || botCfg.alerts || botCfg.tracker;
  if (mixCh) for (const par of buildParlays(allPicks, 'mix')) jobs.push({ par, channel: mixCh, sport: 'MIX' });
  for (const L of Object.keys(byLeague)) {
    const ch = botCfg[\`ch_${L}\`];
    if (!ch) continue;
    for (const par of buildParlays(byLeague[L], 'league')) jobs.push({ par, channel: ch, sport: L });
  }`;

  const newPost = `async function postParlays(day, dayLabel, allPicks, byLeague, botCfg, guildId, opts = {}) {
  let posted = 0;
  const jobs = [];
  const parlayCh = botCfg.parlays;
  if (!parlayCh) return 0;
  const leagueFilter = opts.leagues ? new Set(opts.leagues.map((x) => String(x).toUpperCase())) : null;
  if (!leagueFilter || leagueFilter.size > 1) {
    for (const par of buildParlays(allPicks, 'mix')) jobs.push({ par, channel: parlayCh, sport: 'MIX' });
  }
  for (const L of Object.keys(byLeague)) {
    if (leagueFilter && !leagueFilter.has(L)) continue;
    for (const par of buildParlays(byLeague[L], 'league')) jobs.push({ par, channel: parlayCh, sport: L });
  }`;

  if (code.includes(oldPost)) code = code.replace(oldPost, newPost);
  else console.warn('postParlays patch skipped');

  const oldFields = `    fields: [
      { name: 'Parlay odds', value: \`**${fmtAm(par.odds_american)}**\`, inline: true },
      { name: '$10 pays', value: \`$${(10 * dec).toFixed(2)}\`, inline: true },
      { name: 'Model chance', value: \`${Math.round((par.win_prob || 0) * 100)}%\`, inline: true },
    ],
    footer: { text: done ? 'FINAL · FanDuel prices when posted' : 'Tracking live · FanDuel prices when posted' },
  };
}`;

  const newFields = `    fields: [
      { name: 'Parlay odds', value: \`**${fmtAm(par.odds_american)}**\`, inline: true },
      { name: done && par.hit ? '$10 won' : '$10 pays', value: done && !par.hit ? '$0.00' : \`$${(10 * dec).toFixed(2)}\`, inline: true },
      { name: done ? 'Legs' : 'Model chance', value: done
        ? \`✅ ${(par.legs || []).filter((l) => l.status === 'hit').length} · ❌ ${(par.legs || []).filter((l) => l.status === 'miss').length} · ➖ ${(par.legs || []).filter((l) => l.status === 'push' || l.status === 'void').length}\`
        : \`${Math.round((par.win_prob || 0) * 100)}%\`, inline: true },
    ],
    footer: { text: done ? (par.hit ? 'HIT · full parlay paid' : 'MISSED · ticket dead') : 'Tracking · updates when legs finish' },
  };
}`;

  if (code.includes(oldFields)) code = code.replace(oldFields, newFields);
  else console.warn('embed fields patch skipped');

  code = code.replace(
    "if (k.startsWith('ch_') || k === 'alerts' || k === 'tracker' || k === 'stats' || k === 'roles_panel')",
    "if (k.startsWith('ch_') || k === 'alerts' || k === 'tracker' || k === 'stats' || k === 'parlays' || k === 'roles_panel')"
  );

  const marker = `      const allDates = Array.isArray(body.dates) ? body.dates.map((d) => String(d).trim()).filter(Boolean).sort() : [];
      const resume = body._resume === true;`;

  const insert = `      const allDates = Array.isArray(body.dates) ? body.dates.map((d) => String(d).trim()).filter(Boolean).sort() : [];
      if (body.parlays_only === true) {
        if (!botCfg.parlays) {
          return res.status(400).json({ error: 'Set a Parlays channel in Discord /config first.' });
        }
        const leagueFilter = Array.isArray(body.leagues) && body.leagues.length
          ? body.leagues.map((x) => String(x).toUpperCase()).filter((x) => x && x !== 'ALL')
          : null;
        let picks = await fetchPicksForSend('ALL', 0, allDates.length ? 0 : 2, allDates.length ? allDates : null);
        if (leagueFilter?.length) picks = picks.filter((p) => leagueFilter.includes(String(p.sport || '').toUpperCase()));
        const byDate = {};
        for (const p of picks) {
          const k = pickDayKey(p) || 'unknown';
          (byDate[k] ||= []).push(p);
        }
        if (allDates.length) {
          for (const k of Object.keys(byDate)) {
            if (!allDates.includes(k)) delete byDate[k];
          }
        }
        let posted = 0;
        const daysDone = [];
        for (const day of Object.keys(byDate).sort()) {
          const dayPicks = byDate[day] || [];
          const byLeague = {};
          for (const p of dayPicks) {
            const s2 = String(p.sport || 'OTHER').toUpperCase();
            (byLeague[s2] ||= []).push(p);
          }
          const dayLabel = new Date(\`${day}T12:00:00Z\`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
          const n = await postParlays(day, dayLabel, dayPicks, byLeague, botCfg, guildId, { leagues: leagueFilter }).catch(() => 0);
          posted += n || 0;
          daysDone.push(day);
        }
        return res.status(200).json({
          ok: true,
          parlays_only: true,
          sent: posted,
          message: posted
            ? \`Posted **${posted}** parlay ticket(s) → <#${botCfg.parlays}> for ${daysDone.join(', ')}\`
            : \`No parlays built for ${allDates.join(', ') || 'selected days'}. Need enough strong legs.\`,
          dates: allDates,
          channel: botCfg.parlays,
        });
      }
      const resume = body._resume === true;`;

  if (code.includes(marker)) code = code.replace(marker, insert);
  else console.warn('parlays_only patch skipped');

  return code;
}

async function loadHandler() {
  if (handlerPromise) return handlerPromise;
  handlerPromise = (async () => {
    try { if (existsSync(CACHE)) unlinkSync(CACHE); } catch {}
    const r = await fetch(SOURCE);
    if (!r.ok) throw new Error(`Failed to fetch notify.js: ${r.status}`);
    let code = await r.text();
    if (!code.includes('export default') && !code.includes('handler')) {
      throw new Error('Fetched notify.js looks invalid');
    }
    code = applyParlayPatches(code);
    code = rewriteImports(code);
    writeFileSync(CACHE, code);
    const mod = await import(pathToFileURL(CACHE).href);
    return mod.default;
  })();
  return handlerPromise;
}

export default async function handler(req, res) {
  try {
    const h = await loadHandler();
    return await h(req, res);
  } catch (e) {
    console.error('notify load error', e);
    if (res.headersSent) return;
    return res.status(500).json({ error: e.message || String(e) });
  }
}
