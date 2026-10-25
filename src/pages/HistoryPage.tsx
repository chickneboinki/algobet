import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function HistoryPage() {
  const [bets, setBets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [settling, setSettling] = useState(false)
  const [settleMsg, setSettleMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setBets(await api.bets())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const settle = async (b: any, status: string) => {
    let profit = 0
    if (status === 'won') {
      const odds = b.odds_taken ?? -110
      profit = odds > 0 ? b.stake_units * (odds / 100) : b.stake_units * (100 / Math.abs(odds))
    } else if (status === 'lost') {
      profit = -b.stake_units
    }
    await api.settleBet(b.id, status, profit)
    load()
  }

  const remove = async (id: string) => {
    await api.deleteBet(id)
    load()
  }

  const autoSettle = async () => {
    setSettling(true)
    setSettleMsg('')
    try {
      const r = await api.autoSettle()
      setSettleMsg(
        r.settled
          ? `Auto-settled ${r.settled} bet(s). ${r.skipped ? r.skipped + ' still open (not final yet).' : ''}`
          : r.message || 'No bets to settle (games may not be final yet).'
      )
      await load()
    } catch (e: any) {
      setSettleMsg(e.message || 'Auto-settle failed')
    } finally {
      setSettling(false)
    }
  }

  const settled = bets.filter((b) => b.status !== 'pending')
  const wins = settled.filter((b) => b.status === 'won').length
  const losses = settled.filter((b) => b.status === 'lost').length
  const units = settled.reduce((s, b) => s + (b.profit_units || 0), 0)

  return (
    <div className="space-y-4 pb-8">
      <div className="card space-y-2">
        <h2 className="font-semibold text-lg">Your tracked bets</h2>
        <p className="hint">Mark results by hand, or auto-settle finished home/away picks from final scores.</p>
        <button type="button" className="btn-primary" disabled={settling} onClick={autoSettle}>
          {settling ? 'Checking scores…' : 'Auto-settle finished games'}
        </button>
        {settleMsg && <p className="text-sm text-sky-400">{settleMsg}</p>}
        <p className="hint text-xs">
          Also see <span className="text-zinc-300">Bankroll</span> on the bottom nav (under Bets flow / Setup link) — open
          /bankroll from Setup if needed.
        </p>
      </div>

      {bets.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="stat-box">
            <div className="text-xl font-bold text-sky-300">
              {wins}-{losses}
            </div>
            <div className="label mt-1">Wins–Losses</div>
          </div>
          <div className="stat-box">
            <div className="text-xl font-bold text-sky-300">
              {units >= 0 ? '+' : ''}
              {units.toFixed(1)}
            </div>
            <div className="label mt-1">Units</div>
          </div>
          <div className="stat-box">
            <div className="text-xl font-bold text-sky-300">{bets.filter((b) => b.status === 'pending').length}</div>
            <div className="label mt-1">Open</div>
          </div>
        </div>
      )}

      {loading && <p className="text-zinc-400 text-center py-10">Loading…</p>}

      {!loading && bets.length === 0 && (
        <div className="card text-center py-12 space-y-2">
          <p className="font-medium text-lg">No bets yet</p>
          <p className="hint">Open a game → run a tool → save the bet</p>
        </div>
      )}

      <div className="space-y-3">
        {bets.map((b) => (
          <div key={b.id} className="card space-y-2">
            <div className="flex justify-between items-start gap-2">
              <span className="font-medium">
                {b.away_team} at {b.home_team}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold shrink-0 ${
                  b.status === 'won'
                    ? 'bg-green-500/20 text-green-400'
                    : b.status === 'lost'
                      ? 'bg-red-500/20 text-red-400'
                      : b.status === 'push'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-sky-500/20 text-sky-300'
                }`}
              >
                {b.status === 'pending' ? 'open' : b.status}
              </span>
            </div>
            <p className="text-sm text-zinc-400">
              {b.sport ? `${b.sport} · ` : ''}
              Tool: {b.algorithm_name} ·{' '}
              <span className="text-sky-300 uppercase">{b.recommended_side || b.side}</span>
            </p>
            {b.settle_note && <p className="text-[11px] text-zinc-500">{b.settle_note}</p>}
            {b.status === 'pending' ? (
              <div className="flex gap-2 pt-1">
                <button onClick={() => settle(b, 'won')} className="flex-1 text-sm py-2.5 rounded-xl bg-green-500/20 text-green-400 font-semibold">
                  Won
                </button>
                <button onClick={() => settle(b, 'lost')} className="flex-1 text-sm py-2.5 rounded-xl bg-red-500/20 text-red-400 font-semibold">
                  Lost
                </button>
                <button onClick={() => settle(b, 'push')} className="flex-1 text-sm py-2.5 rounded-xl bg-zinc-500/20 text-zinc-300 font-medium">
                  Push
                </button>
              </div>
            ) : (
              <button onClick={() => remove(b.id)} className="text-xs text-zinc-500">
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
