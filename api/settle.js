/**
 * Auto-settle pending moneyline-style bets from ESPN final scores.
 * Matches home/away team names; sets won/lost/push + profit_units.
 */

const SPORT_PATHS = {
  NFL: 'football/nfl',
  NCAAF: 'football/college-football',
  NBA: 'basketball/nba',
  NCAAB: 'basketball/mens-college-basketball',
  MLB: 'baseball/mlb',
  NHL: 'hockey/nhl',
};

function teamKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function teamsMatch(a, b) {
  const aa = teamKey(a);
  const bb = teamKey(b);
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  const ap = aa.split(/\s+/).pop();
  const bp = bb.split(/\s+/).pop();
  return (ap && bb.includes(ap)) || (bp && aa.includes(bp));
}

function profitUnits(status, stake, odds) {
  const s = Number(stake) || 1;
  if (status === 'push' || status === 'void') return 0;
  if (status === 'lost') return -s;
  if (status === 'won') {
    const o = odds == null ? -110 : Number(odds);
    if (!Number.isFinite(o)) return s;
    return o > 0 ? s * (o / 100) : s * (100 / Math.abs(o));
  }
  return 0;
}

export async function fetchCompleted(sport) {
  const all = await fetchScoreboard(sport);
  return all.filter((g) => g.state === 'final');
}

/** Live + final games from ESPN scoreboard for one sport. */
export async function fetchScoreboard(sport) {
  const path = SPORT_PATHS[sport] || SPORT_PATHS.NFL;
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const out = [];
  for (const ev of data.events || []) {
    const comp = (ev.competitions || [])[0] || {};
    const st = comp.status?.type || {};
    const state = String(st.state || '').toLowerCase();
    const completed = Boolean(st.completed) || st.name === 'STATUS_FINAL' || state === 'post';
    const live = !completed && (state === 'in' || st.name === 'STATUS_IN_PROGRESS' || st.name === 'STATUS_HALFTIME');
    if (!completed && !live) continue;
    const competitors = comp.competitors || [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    if (!home || !away) continue;
    out.push({
      sport,
      home_team: home.team?.displayName,
      away_team: away.team?.displayName,
      home_score: Number(home.score ?? 0),
      away_score: Number(away.score ?? 0),
      name: ev.name,
      detail: st.detail || st.description || (live ? 'In progress' : 'Final'),
      state: completed ? 'final' : 'live',
    });
  }
  return out;
}

function settleSide(bet, result) {
  const side = String(bet.recommended_side || bet.side || '').toLowerCase();
  if (side !== 'home' && side !== 'away') {
    return { ok: false, reason: 'Only home/away moneylines auto-settle' };
  }
  if (!Number.isFinite(result.home_score) || !Number.isFinite(result.away_score)) {
    return { ok: false, reason: 'Missing scores' };
  }
  if (result.home_score === result.away_score) {
    return { ok: true, status: 'push' };
  }
  const homeWon = result.home_score > result.away_score;
  const won = (side === 'home' && homeWon) || (side === 'away' && !homeWon);
  return { ok: true, status: won ? 'won' : 'lost' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  const br = await fetch(
    `${supabaseUrl}/rest/v1/bets?status=eq.pending&select=*&order=placed_at.desc&limit=200`,
    { headers }
  );
  if (!br.ok) {
    return res.status(502).json({ error: `Load bets failed: ${await br.text()}` });
  }
  const pending = await br.json();
  if (!pending.length) {
    return res.status(200).json({ ok: true, settled: 0, message: 'No open bets' });
  }

  const sports = [...new Set(pending.map((b) => String(b.sport || 'NFL').toUpperCase()))];
  const results = [];
  for (const s of sports) {
    try {
      results.push(...(await fetchCompleted(s)));
    } catch (_) {}
  }

  const updates = [];
  const skipped = [];

  for (const bet of pending) {
    const match = results.find(
      (r) =>
        teamsMatch(r.home_team, bet.home_team) &&
        teamsMatch(r.away_team, bet.away_team) &&
        (!bet.sport || String(r.sport).toUpperCase() === String(bet.sport).toUpperCase())
    );
    if (!match) {
      skipped.push({ id: bet.id, reason: 'Game not final or not found' });
      continue;
    }
    const decision = settleSide(bet, match);
    if (!decision.ok) {
      skipped.push({ id: bet.id, reason: decision.reason });
      continue;
    }
    const odds =
      bet.odds_taken ??
      (bet.recommended_side === 'home'
        ? bet.odds?.ml_home
        : bet.recommended_side === 'away'
          ? bet.odds?.ml_away
          : null);
    const profit = profitUnits(decision.status, bet.stake_units, odds);
    const patch = {
      status: decision.status,
      profit_units: profit,
      settled_at: new Date().toISOString(),
      settle_note: `Auto: ${match.away_team} ${match.away_score}-${match.home_score} ${match.home_team}`,
    };
    const ur = await fetch(`${supabaseUrl}/rest/v1/bets?id=eq.${bet.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (ur.ok) {
      updates.push({ id: bet.id, ...patch, match: match.name });
    } else {
      skipped.push({ id: bet.id, reason: await ur.text() });
    }
  }

  return res.status(200).json({
    ok: true,
    settled: updates.length,
    skipped: skipped.length,
    updates,
    skipped_detail: skipped.slice(0, 20),
    finals_found: results.length,
  });
}
