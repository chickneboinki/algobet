import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function HistoryPage() {
  const [bets, setBets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setBets(await api.bets()) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

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

  const remove = async (id: string) => { await api.deleteBet(id); load() }

  const settled = bets.filter((b) => b.status !== 'pending')
  const wins = settled.filter((b) => b.status === 'won').length
  const losses = settled.filter((b) => b.status === 'lost').length
  const units = settled.reduce((s, b) => s + (b.profit_units || 0), 0)

  return (
    <div className="space-y-4">
      <div className="card space-y-1">
        <h2 className="font-semibold text-lg">Your tracked bets</h2>
        <p className="hint">After a game finishes, mark it won or lost so the AI can learn from you.</p>
      </div>

      {bets.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="stat-box">
            <div className="text-xl font-bold text-[#00BFFF]">{wins}-{losses}</div>
            <div className="label mt-1">Wins–Losses</div>
          </div>
          <div className="stat-box">
            <div className="text-xl font-bold text-[#00BFFF]">{units >= 0 ? '+' : ''}{units.toFixed(1)}</div>
            <div className="label mt-1">Units</div>
          </div>
          <div className="stat-box">
            <div className="text-xl font-bold text-[#00BFFF]">{bets.filter((b) => b.status === 'pending').length}</div>
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
              <span className="font-medium">{b.away_team} at {b.home_team}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold shrink-0 ${
                b.status === 'won' ? 'bg-green-500/20 text-green-400' :
                b.status === 'lost' ? 'bg-red-500/20 text-red-400' :
                b.status === 'push' ? 'bg-amber-500/20 text-amber-400' :
                'bg-[#00BFFF]/20 text-[#00BFFF]'
              }`}>{b.status === 'pending' ? 'open' : b.status}</span>
            </div>
            <p className="text-sm text-zinc-400">Tool: {b.algorithm_name} · liked <span className="text-[#00BFFF] uppercase">{b.recommended_side}</span></p>
            {b.status === 'pending' ? (
              <div className="flex gap-2 pt-1">
                <button onClick={() => settle(b, 'won')} className="flex-1 text-sm py-2.5 rounded-xl bg-green-500/20 text-green-400 font-semibold">Won</button>
                <button onClick={() => settle(b, 'lost')} className="flex-1 text-sm py-2.5 rounded-xl bg-red-500/20 text-red-400 font-semibold">Lost</button>
                <button onClick={() => settle(b, 'push')} className="flex-1 text-sm py-2.5 rounded-xl bg-zinc-500/20 text-zinc-300 font-medium">Push</button>
              </div>
            ) : (
              <button onClick={() => remove(b.id)} className="text-xs text-zinc-500">Remove</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
