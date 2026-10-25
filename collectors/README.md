# HelpBet sportsbook collectors

Node service that reads the public JSON feeds sportsbook **websites** use, normalizes them, caches to disk, and retries on errors.

## Schema

```json
{
  "source": "prizepicks|draftkings|fanduel",
  "eventId": "string",
  "sport": "NBA",
  "startTime": "ISO-8601|null",
  "live": false,
  "homeTeam": "string|null",
  "awayTeam": "string|null",
  "market": "Points|moneyline|...",
  "selection": "Over|Under|team",
  "line": 24.5,
  "odds": -110,
  "player": "Name|null",
  "book": "PrizePicks"
}
```

## Run (local)

```bash
cd collectors
node runner.js          # one shot
node runner.js --poll   # live interval + slower full refresh
```

Writes `cache/*.json`. Cloud IPs (Vercel, many datacenters) are often blocked by Cloudflare / geo. **Run on your home machine** for the best chance of real data.

## Find a broken endpoint again

1. Open the sportsbook site in Chrome.
2. F12 → Network → Fetch/XHR.
3. Click a sport so odds load.
4. Copy the JSON request URL + headers.
5. Update the matching file (`prizepicks.js`, `draftkings.js`, `fanduel.js`).

### Hints

| Book | What to filter in Network |
|------|---------------------------|
| PrizePicks | `projections` |
| DraftKings | `eventgroups`, `siteservices` |
| FanDuel | `sbapi`, `content-managed-page`, `webbrowse` |

## Env

- `LIVE_POLL_MS` (default 60000)
- `UPCOMING_POLL_MS` (default 300000)
- `FD_COMPETITION_ID` optional FanDuel competition id

## Legal note

Undocumented browse endpoints can violate sportsbook Terms of Use. Personal research only. Do not sell or redistribute lines.
