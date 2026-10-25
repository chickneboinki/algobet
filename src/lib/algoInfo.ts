// Plain-English explanations of every built-in tool (algorithm).
// Matches the real rules in api/algorithms.js.

export type AlgoInfo = {
  what: string // one simple sentence
  picksWhen: string // when it gives a pick
  skipsWhen: string // when it says "pass"
  leagues: string // where it works
  style: string // short label for the kind of idea
}

export const ALGO_INFO: Record<string, AlgoInfo> = {
  'underdog-value-v1': {
    what: 'Looks for a team whose odds pay more than their real chance of winning.',
    picksWhen: 'A team’s price looks too generous once the sportsbook’s cut is removed.',
    skipsWhen: 'The prices on both teams look fair.',
    leagues: 'All leagues',
    style: 'Value',
  },
  'home-advantage-v1': {
    what: 'Backs the home team in sports where playing at home really helps.',
    picksWhen: 'The game is NFL, NBA, NHL or college football/basketball.',
    skipsWhen: 'The sport is one where home field matters less (like MLB).',
    leagues: 'NFL, NBA, NHL, NCAAF, NCAAB',
    style: 'Simple',
  },
  'contrarian-public-v1': {
    what: 'Bets against a very heavy favorite, since the crowd often overpays for them.',
    picksWhen: 'One team is a big favorite (−200 or shorter odds).',
    skipsWhen: 'No team is a heavy favorite.',
    leagues: 'All leagues',
    style: 'Contrarian',
  },
  'soft-line-v1': {
    what: 'Compares FanDuel and DraftKings and takes the better number.',
    picksWhen: 'The two books disagree on the spread by 1+ point, or on the home odds by 15+.',
    skipsWhen: 'The books agree, or one of them has no line.',
    leagues: 'All leagues',
    style: 'Line shopping',
  },
  'home-dog-v1': {
    what: 'Backs home underdogs in a price range that has tended to hold value.',
    picksWhen: 'The home team is an underdog between +100 and +180.',
    skipsWhen: 'The home team is a favorite or a very long shot.',
    leagues: 'All leagues',
    style: 'Underdog',
  },
  'blowout-fade-v1': {
    what: 'Takes the underdog when a college favorite is expected to win by a huge margin.',
    picksWhen: 'The college spread is 17+ points, or a team is −300 or shorter.',
    skipsWhen: 'The game is not college, or the line is not that lopsided.',
    leagues: 'NCAAF, NCAAB',
    style: 'Contrarian',
  },
  'nfl-engine-v1': {
    what: 'A football tool that needs real evidence before it picks an underdog.',
    picksWhen: 'The underdog is +100 to +220, or FanDuel and DraftKings differ by half a point or more.',
    skipsWhen: 'Neither of those is true, or the edge is too small.',
    leagues: 'NFL, NCAAF',
    style: 'Evidence',
  },
  'ncaa-engine-v1': {
    what: 'A college tool that fades huge favorites and otherwise needs evidence.',
    picksWhen: 'The line is lopsided, the books disagree, or the underdog is +105 to +180.',
    skipsWhen: 'The books agree and there is no mid-range underdog.',
    leagues: 'NCAAF, NCAAB',
    style: 'Evidence',
  },
}

export function algoInfo(id: string): AlgoInfo | null {
  return ALGO_INFO[id] || null
}

/** "home" / "away" -> the actual team name */
export function teamFor(side: string | undefined, home?: string, away?: string) {
  if (side === 'home') return home || 'Home team'
  if (side === 'away') return away || 'Away team'
  return side || '—'
}

/** 0.62 -> "Medium" etc. Easy words instead of raw numbers. */
export function confidenceWord(c?: number) {
  const v = c || 0
  if (v >= 0.65) return 'High'
  if (v >= 0.55) return 'Medium'
  return 'Low'
}

export function confidenceColor(c?: number) {
  const v = c || 0
  if (v >= 0.65) return 'text-emerald-400'
  if (v >= 0.55) return 'text-sky-300'
  return 'text-zinc-400'
}
