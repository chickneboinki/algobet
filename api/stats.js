export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const team = (req.query.team || '').trim();
  const sport = (req.query.sport || 'NBA').toUpperCase();

  if (sport !== 'NBA') {
    return res.status(200).json({
      source: 'none',
      note: 'Free team/player stats are wired for NBA first. Other leagues need a paid feed.',
      team,
      sport,
      stats: null,
    });
  }

  try {
    const search = encodeURIComponent(team.split(' ').pop() || team);
    const teamsRes = await fetch(`https://api.balldontlie.io/v1/teams`, {
      headers: process.env.BALLDONTLIE_API_KEY
        ? { Authorization: process.env.BALLDONTLIE_API_KEY }
        : {},
    });
    if (!teamsRes.ok) {
      return res.status(200).json({
        source: 'balldontlie-unavailable',
        note: 'NBA stats service unavailable or needs a free key (BALLDONTLIE_API_KEY).',
        team,
        stats: null,
      });
    }
    const teamsData = await teamsRes.json();
    const list = teamsData.data || teamsData || [];
    const match = list.find(
      (t) =>
        (t.full_name || '').toLowerCase().includes(team.toLowerCase()) ||
        (t.name || '').toLowerCase().includes(team.toLowerCase()) ||
        (t.abbreviation || '').toLowerCase() === team.toLowerCase()
    );
    if (!match) {
      return res.status(200).json({ source: 'balldontlie', team, stats: null, note: 'Team not found' });
    }

    const season = new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const gamesRes = await fetch(
      `https://api.balldontlie.io/v1/games?team_ids[]=${match.id}&seasons[]=${season}&per_page=5`,
      { headers: process.env.BALLDONTLIE_API_KEY ? { Authorization: process.env.BALLDONTLIE_API_KEY } : {} }
    );
    let recent = [];
    if (gamesRes.ok) {
      const gd = await gamesRes.json();
      recent = (gd.data || []).map((g) => ({
        date: g.date,
        home: g.home_team?.full_name,
        away: g.visitor_team?.full_name || g.away_team?.full_name,
        home_score: g.home_team_score,
        away_score: g.visitor_team_score || g.away_team_score,
        status: g.status,
      }));
    }

    return res.status(200).json({
      source: 'balldontlie',
      team: match.full_name || match.name,
      abbreviation: match.abbreviation,
      conference: match.conference,
      division: match.division,
      recent_games: recent,
      note: 'Last few games this season. Add BALLDONTLIE_API_KEY in Vercel for higher rate limits.',
    });
  } catch (e) {
    return res.status(200).json({ source: 'error', note: e.message, stats: null });
  }
}
