import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { confidenceWord, confidenceColor } from '../lib/algoInfo'

const SPORTS = ['ALL', 'NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL']

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
  const [sport, setSport] = useState('ALL')
  const [toast, setToast] = useState('')
  const [sending, setSending] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.bestBets({ min_confidence: 0.5, limit: 40 })
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
        recommended_side: p.recommended_side,
        algorithm_id: p.algorithm_id,
        algorithm_name: p.algorithm_name,
        confidence: p.confidence,
        expected_value: p.expected_value,
        odds_taken:
          p.recommended_side === 'home'
            ? p.odds?.ml_home
            : p.recommended_side === 'away'
              ? p.odds?.ml_away
              : null,
        stake_units: 1,
        status: 'pending',
        placed_at: new Date().toISOString(),
      })
      showToast('Saved to My Bets')
    } catch (e: any) {
      showToast(e.message || 'Could not save')
    } finally {
      setTracking(null)
    }
  }

  async function sendToChannel() {
    setSending(true)
    try {
      const r = await api.notifyDiscord({
        title: 'HelpBet · Best picks now',
        content: 'Manual send from the app',
      })
      showToast(r.ok ? `Sent ${r.embeds_sent || ''} embeds to Discord` : r.error || 'Sent')
    } catch (e: any) {
      showToast(e.message || 'Send failed — set Discord webhook in Setup')
    } finally {
      setSending(false)
    }
  }

  const picks = (data?.picks || []).filter((p: any) => {
    if (sport === 'ALL') return true
    return String(p.sport || '').toUpperCase() === sport
  })

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="card animate-pulse h-24" />
        <div className="card animate-pulse h-40" />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="page-title">Best picks</h2>
          <p className="hint mt-1">
            Strongest tool picks first.
            {data ? ` Checked ${data.games_scanned} games.` : ''}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button type="button" className="btn-ghost" onClick={load}>
            Refresh
          </button>
          <button type="button" className="btn-primary text-sm" disabled={sending} onClick={sendToChannel}>
            {sending ? 'Sending…' : 'Send to channel'}
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-4 px-4">
        {SPORTS.map((s) => (
          <button key={s} type="button" onClick={() => setSport(s)} className={`chip ${sport === s ? 'chip-on' : 'chip-off'}`}>
            {s === 'ALL' ? 'All' : s}
          </button>
        ))}
      </div>

      {error && <div className="card border-red-500/30 text-red-300 text-sm">{error}</div>}

      {!error && picks.length === 0 && (
        <div className="card">
          <p className="font-medium">No strong picks{sport !== 'ALL' ? ` for ${sport}` : ''} right now</p>
          <p className="hint mt-1">Try another league, or open Games and check a matchup yourself.</p>
        </div>
      )}

      {picks.map((p: any, i: number) => {
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
              <span className="text-[11px] font-semibold text-sky-300 tracking-wide px-2 py-0.5 rounded-full bg-sky-400/10">
                {p.sport}
              </span>
              <span className="text-xs text-zinc-500 odds-num">#{i + 1}</span>
            </div>
            <div>
              <p className="text-sm text-zinc-400">
                {p.away_team} at {p.home_team}
              </p>
              <p className="text-xl font-semibold mt-1 tracking-tight">{pickTeam}</p>
              <p className="text-sm text-zinc-400 mt-0.5">
                Pick from {p.algorithm_name}
                {ml != null && <span className="odds-num text-zinc-300"> · {fmtOdds(ml)}</span>}
              </p>
              {(p.start_time || p.commence_time) && (
                <p className="text-xs text-zinc-500 mt-1">
                  {new Date(p.start_time || p.commence_time).toLocaleString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="stat-box">
                <p className="label">Confidence</p>
                <p className={`text-base font-semibold mt-1 ${confidenceColor(p.confidence)}`}>{confidenceWord(p.confidence)}</p>
              </div>
              <div className="stat-box">
                <p className="label">Value edge</p>
                <p className="text-base font-semibold mt-1">+{((p.expected_value || 0) * 100).toFixed(1)}%</p>
              </div>
            </div>
            <p className="hint">{p.reasoning}</p>
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
    </div>
  )
}
