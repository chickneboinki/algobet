/**
 * Trial endpoint: attempt PrizePicks / DraftKings / FanDuel feeds server-side.
 * Returns whatever succeeds. Expect blocks from cloud IPs — that is useful signal.
 */
import { createClient } from '@supabase/supabase-js';

const PP_LEAGUE = { NBA: 7, NFL: 9, MLB: 2, NHL: 8, NCAAF: 15, NCAAB: 20 };

function ppHeaders() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'application/json',
    Origin: 'https://app.prizepicks.com',
    Referer: 'https://app.prizepicks.com/',
    'X-Device-ID': crypto.randomUUID?.() || String(Date.now()),
  };
}

async function tryPrizePicks(sport) {
  const q = new URLSearchParams({ single_stat: 'true', per_page: '100', game_mode: 'pickem' });
  const lid = PP_LEAGUE[(sport || 'NBA').toUpperCase()];
  if (lid) q.set('league_id', String(lid));
  const res = await fetch(`https://api.prizepicks.com/projections?${q}`, { headers: ppHeaders() });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 200) };
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, error: 'non-json body (captcha?)' };
  }
  const players = {};
  for (const row of body.included || []) {
    if (row.type === 'new_player') {
      players[row.id] = { name: row.attributes?.name, team: row.attributes?.team };
    }
  }
  const rows = [];
  for (const d of body.data || []) {
    const a = d.attributes || {};
    const p = players[d.relationships?.new_player?.data?.id] || {};
    rows.push({
      source: 'prizepicks',
      eventId: String(a.game_id || d.id),
      sport: (sport || 'NBA').toUpperCase(),
      startTime: a.start_time || null,
      live: Boolean(a.is_live),
      market: a.stat_type || 'Prop',
      selection: 'Over',
      line: a.line_score != null ? Number(a.line_score) : null,
      odds: null,
      player: p.name || null,
      team: p.team || null,
      book: 'PrizePicks',
    });
  }
  return { ok: true, count: rows.length, sample: rows.slice(0, 5), rows };
}

async function tryDraftKings(league = 'nba') {
  const ids = { nba: '42648', nfl: '88808', mlb: '84240', nhl: '42133' };
  const id = ids[league] || ids.nba;
  const url = `https://sportsbook.draftkings.com//sites/US-SB/api/v5/eventgroups/${id}?format=json`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'application/json',
      Referer: 'https://sportsbook.draftkings.com/',
    },
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 200) };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, error: 'non-json' };
  }
  const events = data.eventGroup?.events || [];
  const rows = events.map((ev) => ({
    source: 'draftkings',
    eventId: String(ev.eventId || ''),
    sport: league.toUpperCase(),
    startTime: ev.startDate || null,
    live: Boolean(ev.eventStatus?.state === 'STARTED'),
    homeTeam: ev.teamName2 || null,
    awayTeam: ev.teamName1 || null,
    market: 'event',
    selection: null,
    line: null,
    odds: null,
    player: null,
    book: 'DraftKings',
    name: ev.name || null,
  }));
  return { ok: true, count: rows.length, sample: rows.slice(0, 5), rows };
}

async function tryFanDuel() {
  const url =
    'https://sbapi.us.sportsbook.fanduel.com/api/content-managed-page?page=CUSTOM&customPageId=nba&language=en&regionCode=NAMERICA';
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'application/json',
      'X-Request-Id': crypto.randomUUID?.() || String(Date.now()),
      Referer: 'https://sportsbook.fanduel.com/',
    },
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 200) };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, error: 'non-json' };
  }
  const events = data.attachments?.events ? Object.values(data.attachments.events) : data.events || [];
  const rows = (events || []).map((ev) => ({
    source: 'fanduel',
    eventId: String(ev.eventId || ev.id || ''),
    sport: 'NBA',
    startTime: ev.openDate || null,
    live: Boolean(ev.inPlay),
    homeTeam: ev.homeName || null,
    awayTeam: ev.awayName || null,
    market: 'event',
    selection: null,
    line: null,
    odds: null,
    player: null,
    book: 'FanDuel',
    name: ev.name || null,
  }));
  return { ok: true, count: rows.length, sample: rows.slice(0, 5), rows };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sport = (req.query.sport || 'NBA').toUpperCase();
  const league = sport === 'NFL' ? 'nfl' : sport === 'NBA' ? 'nba' : 'nba';

  const results = {
    at: new Date().toISOString(),
    prizepicks: null,
    draftkings: null,
    fanduel: null,
  };

  results.prizepicks = await tryPrizePicks(sport);
  results.draftkings = await tryDraftKings(league);
  results.fanduel = await tryFanDuel();

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  let stored = null;
  if (url && key) {
    try {
      const sb = createClient(url, key);
      const blob = {
        prizepicks: results.prizepicks.ok ? results.prizepicks.count : 0,
        draftkings: results.draftkings.ok ? results.draftkings.count : 0,
        fanduel: results.fanduel.ok ? results.fanduel.count : 0,
      };
      await sb.from('watch_log').insert({
        message: `ingest trial ${JSON.stringify(blob)}`,
        created_at: new Date().toISOString(),
      });
      stored = true;
    } catch (e) {
      stored = e.message;
    }
  }

  const anyOk =
    results.prizepicks.ok || results.draftkings.ok || results.fanduel.ok;

  return res.status(200).json({
    ok: anyOk,
    message: anyOk
      ? 'At least one feed answered. Use sample/rows below.'
      : 'All feeds blocked from this server IP. Run collectors locally: cd collectors && node runner.js',
    stored,
    results: {
      prizepicks: {
        ok: results.prizepicks.ok,
        status: results.prizepicks.status,
        count: results.prizepicks.count,
        error: results.prizepicks.error,
        sample: results.prizepicks.sample,
      },
      draftkings: {
        ok: results.draftkings.ok,
        status: results.draftkings.status,
        count: results.draftkings.count,
        error: results.draftkings.error,
        sample: results.draftkings.sample,
      },
      fanduel: {
        ok: results.fanduel.ok,
        status: results.fanduel.status,
        count: results.fanduel.count,
        error: results.fanduel.error,
        sample: results.fanduel.sample,
      },
    },
  });
}
