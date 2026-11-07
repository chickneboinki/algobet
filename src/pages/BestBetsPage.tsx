import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { confidenceWord, confidenceColor } from '../lib/algoInfo'
import { loadSession } from '../lib/auth'
import { loadLocalWebhook } from '../lib/webhook'

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
  const [showDays, setShowDays] = useState(false)
  const [days, setDays] = useState<{ date: string; label: string; count: number; sports: string[]; by_league?: Record<string, number> }[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [loadingDays, setLoadingDays] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
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

  async function openSendModal() {
    setShowDays(true)
    setLoadingDays(true)
    setPicked([])
    try {
      const res = await api.betDays()
      const list = res.days || []
      setDays(list)
      setPicked(list.slice(0, 2).map((d: any) => d.date))
    } catch (e: any) {
      showToast(e.message || 'Could not load days')
      setDays([])
    } finally {
      setLoadingDays(false)
    }
  }

  function toggleDay(date: string) {
    setPicked((prev) => (prev.includes(date) ? prev.filter((x) => x !== date) : [...prev, date]))
  }

  async function confirmSend() {
    if (!picked.length) {
      showToast('Pick at least one day')
      return
    }
    const webhook = loadLocalWebhook()
    const session = loadSession()
    if (!webhook && !session) {
      showToast('Save your Discord webhook in Setup first')
      return
    }
    setSending(true)
    try {
      const r = await api.notifyDiscord({
        title: 'HelpBet · Selected days',
        dates: picked,
        webhook_url: webhook || undefined,
        username: session?.username,
      })
      setShowDays(false)
      showToast(
        r.ok
          ? r.sent
            ? `Posted ${r.sent} pick(s) for ${(r.dates || picked).join(', ')}${r.leagues?.length ? ' → ' + r.leagues.join(', ') : ''}`
            : r.message || `No picks on selected day(s)`
          : r.error || 'Sent'
      )
    } catch (e: any) {
      showToast(e.message || 'Send failed — check Setup webhook')
    } finally {
      setSending(false)
    }
  }

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
      {toast && (
        <div className="fixed top-14 left-4 right-4 z-50 card text-sm text-sky-300 shadow-lg">{toast}</div>
      )}

      {showDays && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div className="card w-full max-w-md space-y-4 max-h-[85vh] overflow-y-auto">
            <div>
              <h3 className="text-lg font-semibold">Send which days?</h3>
              <p className="hint text-xs mt-1">Only the days you select will be sent (Central time). Only those games.</p>
            </div>
            {loadingDays ? (
              <p className="text-sm text-zinc-400">Loading days with lines…</p>
            ) : days.length === 0 ? (
              <p className="text-sm text-zinc-400">No upcoming days with lines right now. Refresh later.</p>
            ) : (
              <div className="space-y-2">
                {days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => toggleDay(d.date)}
                    className={`w-full text-left rounded-xl border px-3 py-3 ${
                      picked.includes(d.date)
                        ? 'border-sky-400 bg-sky-400/10'
                        : 'border-white/10 bg-black/30'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{d.label}</span>
                      <span className="text-xs text-zinc-400">{d.count} games</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {d.by_league && Object.keys(d.by_league).length
                        ? Object.entries(d.by_league)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([L, n]) => `${L} ${n}`)
                            .join(' · ')
                        : (d.sports || []).join(' · ')}
                    </p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setShowDays(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={sending || !picked.length}
                onClick={confirmSend}
              >
                {sending ? 'Sending…' : `Send ${picked.length || ''} day(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

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
          <button type="button" className="btn-primary" onClick={openSendModal}>
            Send to channel
          </button>
        </div>
      </div>

      {error && <div className="card text-sm text-amber-300">{error}</div>}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {SPORTS.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip ${sport === s ? 'chip-on' : 'chip-off'}`}
            onClick={() => setSport(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {picks.length === 0 && (
        <div className="card text-sm text-zinc-400">No strong picks for this filter yet.</div>
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
                <p className={`text-base font-semibold mt-1 ${confidenceColor(p.confidence)}`}>
                  {confidenceWord(p.confidence)}
                </p>
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
