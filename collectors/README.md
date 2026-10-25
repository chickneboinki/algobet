# Sportsbook feed collectors

Personal-use helpers that read the **same JSON** DraftKings, FanDuel, and PrizePicks load in the browser, then normalize into one schema.

## Important

- These are **undocumented** browse endpoints. They change without notice.
- Calling them from a cloud server (Vercel, AWS, etc.) is often blocked by Cloudflare / geo / bot checks.
- Sportsbook Terms of Use usually forbid automated access. Use only for **personal research**. Do not redistribute lines commercially.
- Preferred production path for AlgoBet: **The Odds API** player markets (legitimate key) + PrizePicks when the feed answers.

## Unified schema

Each selection becomes:

```json
{
  "source": "prizepicks|draftkings|fanduel|oddsapi",
  "eventId": "string",
  "sport": "NBA",
  "startTime": "ISO-8601 or null",
  "live": false,
  "homeTeam": "string|null",
  "awayTeam": "string|null",
  "market": "Points",
  "selection": "Over|Under|team name",
  "line": 24.5,
  "odds": -110,
  "player": "Player Name|null",
  "book": "PrizePicks"
}
```

## How to find the current feed URL (when one breaks)

1. Open the sportsbook in Chrome (logged in if needed).
2. F12 → **Network** → filter **Fetch/XHR**.
3. Click a sport or a game so odds load.
4. Look for JSON responses that contain events, markets, or projections.
5. Copy the request URL + required headers (User-Agent, Origin, Referer, sometimes a request id).
6. Update the matching file under `collectors/` and the comment block at the top.

### PrizePicks

- Known feed: `https://api.prizepicks.com/projections?single_stat=true`
- Often works from a residential browser; cloud IPs frequently get Cloudflare challenge pages.
- League filter: `league_id` query param (NBA, NFL, etc. — inspect Network for current ids).

### DraftKings

- Site loads structured JSON under `sportsbook.draftkings.com`.
- Older path shape: `/api/betfare/v1/games?category=nba&format=json` (may 301/403 now).
- Filter Network for `siteservices` or `eventgroup` JSON.

### FanDuel

- Browse API host pattern: `sbapi.{state}.sportsbook.fanduel.com` or `sbapi.us.sportsbook.fanduel.com`.
- Often needs `X-Request-Id` (any UUID) and state-matched IP.
- Look for `content-managed-page` or `webbrowse` calls.

## Local runner

```bash
cd collectors
node runner.js
```

Writes `cache/prizepicks.json`, `cache/draftkings.json`, `cache/fanduel.json` when a feed succeeds.

## AlgoBet integration

`/api/props` tries, in order:

1. PrizePicks projections (if reachable)
2. The Odds API player markets (needs `ODDS_API_KEY` with prop access)
3. Sample props so the UI never goes empty
