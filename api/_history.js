/* Player game-log history from ESPN, used to back up player-prop picks. */
const PATHS = {
  NFL: ['football', 'nfl'], NCAAF: ['football', 'college-football'],
  NBA: ['basketball', 'nba'], NCAAB: ['basketball', 'mens-college-basketball'],
  MLB: ['baseball', 'mlb'], NHL: ['hockey', 'nhl'],
};
const H = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/\s+/g, ' ').trim();
const idCache = new Map();
const logCache = new Map();

async function getJson(url, ms = 7000) {
  const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
}

function flattenPeople(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((x) => flattenPeople(x, out)); return out; }
  if ((node.displayName || node.name) && node.id && (node.type === 'player' || node.uid?.includes('~a:') || node.link)) out.push(node);
  for (const v of Object.values(node)) if (v && typeof v === 'object') flattenPeople(v, out);
  return out;
}

export async function findAthlete(sport, name) {
  const key = `${sport}|${norm(name)}`;
  if (idCache.has(key)) return idCache.get(key);
  const p = (async () => {
    const [a, b] = PATHS[sport] || [];
    if (!a) return null;
    const j = await getJson(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=10&type=player`);
    const people = flattenPeople(j).filter((x) => {
      const hay = `${x.uid || ''} ${x.link || ''} ${x.league || ''} ${x.sport || ''}`.toLowerCase();
      return hay.includes(b.replace('mens-college-basketball', 'mens-college-basketball')) || hay.includes(`/${a}/`) || hay.includes(a);
    });
    const want = norm(name);
    const exact = people.find((x) => norm(x.displayName || x.name) === want);
    const id = (exact || people[0])?.id;
    return id ? String(id) : null;
  })().catch(() => null);
  idCache.set(key, p);
  return p;
}

export function parseGameLog(j) {
  const events = j?.events || {};
  const topLabels = j?.labels || j?.names || [];
  const byGame = new Map();
  const consume = (cat, catName) => {
    const labels = cat.labels || cat.names || topLabels;
    // NFL/NCAAF lists passing, rushing and receiving stats back-to-back with repeated labels
    const groupAt = [];
    let grp = catName;
    labels.forEach((l, i) => {
      if (l === 'CMP') grp = 'passing';
      else if (l === 'CAR') grp = 'rushing';
      else if (l === 'REC') grp = 'receiving';
      groupAt[i] = grp;
    });
    for (const ev of cat.events || []) {
      if (!ev?.stats) continue;
      const meta = events[ev.eventId] || {};
      const g = byGame.get(ev.eventId) || { id: ev.eventId, date: meta.gameDate || '', rec: {} };
      labels.forEach((l, i) => {
        const v = ev.stats[i];
        if (v == null) return;
        if (g.rec[l] == null) g.rec[l] = v;
        const k = `${groupAt[i]}.${l}`;
        if (g.rec[k] == null) g.rec[k] = v;
      });
      byGame.set(ev.eventId, g);
    }
  };
  for (const st of j?.seasonTypes || []) for (const cat of st.categories || []) consume(cat, String(cat.displayName || cat.name || cat.type || 'main').toLowerCase());
  for (const cat of j?.categories || []) consume(cat, String(cat.displayName || cat.name || cat.type || 'main').toLowerCase());
  return [...byGame.values()].filter((g) => Object.keys(g.rec).length).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function getLog(sport, name) {
  const key = `${sport}|${norm(name)}`;
  if (logCache.has(key)) return logCache.get(key);
  const p = (async () => {
    const id = await findAthlete(sport, name);
    if (!id) return null;
    const [a, b] = PATHS[sport];
    const j = await getJson(`https://site.web.api.espn.com/apis/common/v3/sports/${a}/${b}/athletes/${id}/gamelog`);
    return parseGameLog(j);
  })().catch(() => null);
  logCache.set(key, p);
  setTimeout(() => logCache.delete(key), 20 * 60e3).unref?.();
  return p;
}

const n0 = (v) => { if (v == null) return null; const x = parseFloat(String(v).split('-')[0]); return Number.isFinite(x) ? x : null; };
const sum = (...xs) => (xs.some((x) => x == null) ? null : xs.reduce((a, b) => a + b, 0));

/** Value of a prop market for one game record, or null when we can't compute it. */
export function statValue(sport, market, rec) {
  const m = String(market || '').toLowerCase();
  if (/fantasy|quarter|half|1st|2nd|first|longest|attempt.*yards/.test(m) && !/pass attempts/.test(m)) return null;
  const g = (k) => n0(rec[k]);
  if (sport === 'NBA' || sport === 'NCAAB') {
    const parts = [];
    if (/point|pts/.test(m)) parts.push(g('PTS'));
    if (/reb/.test(m)) parts.push(g('REB'));
    if (/assist|ast/.test(m)) parts.push(g('AST'));
    if (/steal|stl/.test(m)) parts.push(g('STL'));
    if (/block|blk/.test(m)) parts.push(g('BLK'));
    if (/3-?pt|three|3pm|3-point/.test(m)) parts.push(g('3PT'));
    if (/turnover/.test(m)) parts.push(g('TO'));
    if (/free throw/.test(m)) parts.push(g('FT'));
    return parts.length ? sum(...parts) : null;
  }
  if (sport === 'NHL') {
    if (/save/.test(m)) return g('SV');
    if (/shot/.test(m)) return g('S');
    if (/point/.test(m)) return g('PTS');
    if (/goal/.test(m)) return g('G');
    if (/assist/.test(m)) return g('A');
    if (/block/.test(m)) return g('BS');
    return null;
  }
  if (sport === 'MLB') {
    const parts = [];
    if (/total bases/.test(m)) return sum(g('H'), g('2B'), g('3B') == null ? null : g('3B') * 2, g('HR') == null ? null : g('HR') * 3);
    if (/strikeout/.test(m)) return g('K') ?? g('SO');
    if (/hit/.test(m)) parts.push(g('H'));
    if (/run(?!s batted)/.test(m) && !/rbi/.test(m)) parts.push(g('R'));
    if (/rbi/.test(m)) parts.push(g('RBI'));
    if (/home run/.test(m)) return g('HR');
    return parts.length ? sum(...parts) : null;
  }
  if (sport === 'NFL' || sport === 'NCAAF') {
    const c = (cat, l) => n0(rec[`${cat}.${l}`]);
    if (/passing yards|pass yds/.test(m)) return c('passing', 'YDS');
    if (/pass(ing)? td/.test(m)) return c('passing', 'TD');
    if (/completion/.test(m)) return c('passing', 'CMP') ?? c('passing', 'C/ATT');
    if (/interception/.test(m)) return c('passing', 'INT');
    if (/rush.*rec|rec.*rush/.test(m)) return sum(c('rushing', 'YDS'), c('receiving', 'YDS'));
    if (/rushing yards|rush yds/.test(m)) return c('rushing', 'YDS');
    if (/receiving yards|rec yds/.test(m)) return c('receiving', 'YDS');
    if (/reception/.test(m)) return c('receiving', 'REC');
    return null;
  }
  return null;
}

/** Last-10 backing for a prop: how often the picked side would have hit. */
export async function propBacking(sport, prop) {
  const log = await getLog(sport, prop.player);
  if (!log?.length) return null;
  const line = Number(prop.line);
  const side = prop.lean?.side;
  if (!Number.isFinite(line) || (side !== 'over' && side !== 'under')) return null;
  const vals = [];
  for (const g of log) {
    const v = statValue(sport, prop.market, g.rec);
    if (v != null) vals.push(v);
    if (vals.length >= 10) break;
  }
  if (vals.length < 4) return null;
  const hits = vals.filter((v) => (side === 'over' ? v > line : v < line)).length;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { n: vals.length, hits, rate: hits / vals.length, avg, vals };
}
