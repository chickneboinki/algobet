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
      {bets.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center py-3">
            <div className="text-xl font-bold text-neon">{wins}-{losses}</div>
            <div className="text-[10px] text-zinc-400 uppercase">Record</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-xl font-bold text-neon">{units >= 0 ? '+' : ''}{units.toFixed(1)}</div>
            <div className="text-[10px] text-zinc-400 uppercase">Units</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-xl font-bold text-neon">{bets.filter((b) => b.status === 'pending').length}</div>
            <div className="text-[10px] text-zinc-400 uppercase">Pending</div>
          </div>
        </div>
      )}
      {loading && <p className="text-zinc-400 text-center py-10">Loading…</p>}
      {!loading && bets.length === 0 && (
        <div className="card text-center text-zinc-400 py-12">
          <p className="text-lg mb-2">No bets tracked</p>
          <p className="text-sm">Open a game → run algorithm → Track this bet</p>
        </div>
      )}
      <div className="space-y-3">
        {bets.map((b) => (
          <div key={b.id} className="card space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">{b.away_team} @ {b.home_team}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${
                b.status === 'won' ? 'bg-green-500/20 text-green-400' :
                b.status === 'lost' ? 'bg-red-500/20 text-red-400' :
                b.status === 'push' ? 'bg-amber-500/20 text-amber-400' : 'bg-neon/20 text-neon'
              }`}>{b.status}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">{b.algorithm_name}</span>
              <span className="text-neon font-mono uppercase">{b.recommended_side}</span>
            </div>
            <div className="text-xs text-zinc-500">
              Conf {Math.round(b.confidence * 100)}% · EV {(b.expected_value * 100).toFixed(1)}% · {b.stake_units}u
              {b.profit_units != null && b.status !== 'pending' && (
                <span className={b.profit_units >= 0 ? ' text-green-400' : ' text-red-400'}>
                  {' '}· {b.profit_units >= 0 ? '+' : ''}{Number(b.profit_units).toFixed(2)}u
                </span>
              )}
            </div>
            {b.status === 'pending' ? (
              <div className="flex gap-2 pt-1">
                <button onClick={() => settle(b, 'won')} className="flex-1 text-sm py-2 rounded-lg bg-green-500/20 text-green-400 font-medium">Won</button>
                <button onClick={() => settle(b, 'lost')} className="flex-1 text-sm py-2 rounded-lg bg-red-500/20 text-red-400 font-medium">Lost</button>
                <button onClick={() => settle(b, 'push')} className="flex-1 text-sm py-2 rounded-lg bg-zinc-500/20 text-zinc-300">Push</button>
              </div>
            ) : (
              <button onClick={() => remove(b.id)} className="text-xs text-zinc-500 hover:text-red-400">Delete</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
