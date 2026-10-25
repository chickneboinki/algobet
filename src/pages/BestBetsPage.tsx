import { useEffect, useState } from 'react'
import { api } from '../services/api'

function fmtOdds(n?: number | null) {
  if (n == null) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

function sideLabel(side: string, home: string, away: string) {
  if (side === 'home') return home
  if (side === 'away') return away
  return side
}

export default function BestBetsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tracking, setTracking] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.bestBets({ min_confidence: 0.5, limit: 20 })
      setData(res)
    } catch (e: any) {
      setError(e.message || 'Could not load picks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function track(p: any) {
    setTracking(p.game_id + p.algorithm_id)
    try {
      await api.trackBet({
        game_id: p.game_id,
        sport: p.sport,
        home_team: p.home_team,
        away_team: p.away_team,
        side: p.recommended_side,
        algorithm_id: p.algorithm_id,
        algorithm_name: p.algorithm_name,
        confidence: p.confidence,
        expected_value: p.expected_value,
        odds: p.odds,
        stake_units: 1,
        status: 'pending',
        placed_at: new Date().toISOString(),
      })
      alert('Saved to your bets. Mark won or lost later on the Bets tab.')
    } catch (e: any) {
      alert(e.message || 'Could not save')
    } finally {
      setTracking(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="card animate-pulse h-24" />
        <div className="card animate-pulse h-40" />
        <div className="card animate-pulse h-40" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label mb-1">Today</p>
            <h2 className="text-lg font-semibold">Best ranked picks</h2>
            <p className="hint mt-1">
              Every tool runs on live lines. Picks are ranked by edge and how sure the tool is.
              Tools that win more for you rank higher over time.
            </p>
          </div>
          <button type="button" className="btn-ghost text-sm shrink-0" onClick={load}>
            Refresh
          </button>
        </div>
        {data && (
          <p className="text-xs text-zinc-500 mt-3">
            Scanned {data.games_scanned} games · {data.pick_count} picks
            {data.generated_at ? ` · ${new Date(data.generated_at).toLocaleTimeString()}` : ''}
          </p>
        )}
      </div>

      {error && (
        <div className="card border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      {!error && (!data?.picks || data.picks.length === 0) && (
        <div className="card">
          <p className="font-medium">No strong picks right now</p>
          <p className="hint mt-1">
            Tools only surface plays that clear a minimum bar. Check Games for all matchups, or try again closer to tip-off.
          </p>
        </div>
      )}

      {(data?.picks || []).map((p: any, i: number) => {
        const pickTeam = sideLabel(p.recommended_side, p.home_team, p.away_team)
        const ml =
          p.recommended_side === 'home'
            ? p.odds?.ml_home
            : p.recommended_side === 'away'
              ? p.odds?.ml_away
              : null
        return (
          <div key={`${p.game_id}-${p.algorithm_id}-${i}`} className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-sky-400 tracking-wide">{p.sport}</span>
              <span className="text-xs text-zinc-500">Rank #{i + 1}</span>
            </div>
            <div>
              <p className="text-sm text-zinc-400">{p.away_team} at {p.home_team}</p>
              <p className="text-xl font-semibold mt-1 tracking-tight">{pickTeam}</p>
              <p className="text-sm text-zinc-400 mt-0.5">
                {p.algorithm_name}
                {ml != null && <span className="odds-num text-zinc-300"> · {fmtOdds(ml)}</span>}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="stat-box">
                <p className="label">How sure</p>
                <p className="text-base font-semibold mt-1">{Math.round((p.confidence || 0) * 100)}%</p>
              </div>
              <div className="stat-box">
                <p className="label">Edge</p>
                <p className="text-base font-semibold mt-1">{((p.expected_value || 0) * 100).toFixed(1)}%</p>
              </div>
              <div className="stat-box">
                <p className="label">Score</p>
                <p className="text-base font-semibold mt-1">{(p.score || 0).toFixed(2)}</p>
              </div>
            </div>
            <p className="hint">{p.reasoning}</p>
            <div className="flex flex-wrap gap-2">
              {p.links?.fanduel && (
                <a className="book-badge" href={p.links.fanduel} target="_blank" rel="noreferrer">
                  FanDuel
                </a>
              )}
              {p.links?.draftkings && (
                <a className="book-badge" href={p.links.draftkings} target="_blank" rel="noreferrer">
                  DraftKings
                </a>
              )}
              {p.links?.prizepicks && (
                <a className="book-badge" href={p.links.prizepicks} target="_blank" rel="noreferrer">
                  PrizePicks
                </a>
              )}
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={tracking === p.game_id + p.algorithm_id}
              onClick={() => track(p)}
            >
              {tracking === p.game_id + p.algorithm_id ? 'Saving…' : 'Save this bet'}
            </button>
          </div>
        )
      })}

      <div className="card-soft">
        <p className="label mb-1">What the numbers mean</p>
        <p className="hint">
          <strong className="text-zinc-300">How sure</strong> is the tool’s confidence (not a guarantee).
          <strong className="text-zinc-300"> Edge</strong> is estimated value after the sportsbook cut.
          <strong className="text-zinc-300"> Score</strong> ranks picks; your past results adjust tool weights.
        </p>
      </div>
    </div>
  )
}
