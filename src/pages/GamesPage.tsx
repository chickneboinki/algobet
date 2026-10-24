import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function GamesPage() {
  const [games, setGames] = useState<any[]>([])
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [sport, setSport] = useState('')
  const [algos, setAlgos] = useState<any[]>([])
  const [selectedGame, setSelectedGame] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [toast, setToast] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [g, a] = await Promise.all([
        api.games(sport || undefined),
        api.algorithms(),
      ])
      setGames(g.games || [])
      setSource(g.source)
      setAlgos(a)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sport])

  const run = async (algoId: string) => {
    if (!selectedGame) return
    setRunning(true)
    setResult(null)
    try {
      const r = await api.runAlgo(algoId, selectedGame)
      setResult(r)
    } catch (e: any) {
      setToast(e.message || 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  const track = async () => {
    if (!result || !selectedGame || result.recommended_side === 'none') return
    try {
      await api.trackBet({
        game_id: selectedGame.id,
        sport: selectedGame.sport,
        home_team: selectedGame.home_abbr || selectedGame.home_team,
        away_team: selectedGame.away_abbr || selectedGame.away_team,
        algorithm_id: result.algorithm_id,
        algorithm_name: result.algorithm_name,
        recommended_side: result.recommended_side,
        confidence: result.confidence,
        expected_value: result.expected_value,
        stake_units: result.suggested_stake_units || 1,
        odds_taken: selectedGame.odds?.ml_home,
      })
      setToast('Bet tracked ✓')
      setTimeout(() => setToast(''), 2000)
    } catch (e: any) {
      setToast(e.message)
    }
  }

  if (selectedGame) {
    return (
      <div className="space-y-4">
        <button onClick={() => { setSelectedGame(null); setResult(null) }} className="text-neon text-sm">
          ← Back to games
        </button>

        <div className="card">
          <div className="text-center">
            <div className="text-2xl font-bold">
              {selectedGame.away_abbr || selectedGame.away_team}
              <span className="text-zinc-500 mx-2">@</span>
              {selectedGame.home_abbr || selectedGame.home_team}
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              {selectedGame.sport} · {selectedGame.status}
              {selectedGame.status === 'live' && selectedGame.home_score != null && (
                <span className="ml-2 text-red-400 font-bold">
                  LIVE {selectedGame.away_score}-{selectedGame.home_score}
                </span>
              )}
            </div>
          </div>
          {selectedGame.odds && (
            <div className="grid grid-cols-3 gap-2 mt-4 text-center text-sm">
              <div>
                <div className="text-zinc-500 text-xs">ML Home</div>
                <div className="font-mono">{selectedGame.odds.ml_home > 0 ? '+' : ''}{selectedGame.odds.ml_home ?? '—'}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs">ML Away</div>
                <div className="font-mono">{selectedGame.odds.ml_away > 0 ? '+' : ''}{selectedGame.odds.ml_away ?? '—'}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs">Total</div>
                <div className="font-mono">{selectedGame.odds.total ?? '—'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-sm text-zinc-300">Run Algorithm</h3>
          {algos.map((a) => (
            <button
              key={a.id}
              onClick={() => run(a.id)}
              disabled={running}
              className="card w-full text-left flex justify-between items-center hover:border-neon/40 transition disabled:opacity-50"
            >
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-zinc-400 line-clamp-1">{a.description}</div>
              </div>
              <span className="text-neon text-xl">▶</span>
            </button>
          ))}
        </div>

        {running && <p className="text-center text-zinc-400">Running…</p>}

        {result && (
          <div className="card border-neon/40 space-y-3">
            <div className="font-semibold text-neon">Result — {result.algorithm_name}</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-zinc-500">Side</div>
                <div className="font-bold uppercase">{result.recommended_side}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Confidence</div>
                <div className="font-bold">{Math.round(result.confidence * 100)}%</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">EV</div>
                <div className="font-bold">{(result.expected_value * 100).toFixed(1)}%</div>
              </div>
            </div>
            <p className="text-sm text-zinc-300">{result.reasoning}</p>
            {result.key_factors?.length > 0 && (
              <ul className="text-xs text-zinc-400 space-y-0.5">
                {result.key_factors.map((f: string, i: number) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            )}
            {result.recommended_side !== 'none' && (
              <button onClick={track} className="btn-neon w-full">
                Track this bet
              </button>
            )}
          </div>
        )}

        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-neon text-black px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
            {toast}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['', 'NFL', 'NBA', 'NCAAF', 'MLB', 'NHL', 'UFC'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setSport(s)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              sport === s ? 'bg-neon text-black font-semibold' : 'bg-white/10 text-zinc-300'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {source && (
        <p className="text-xs text-zinc-500 px-1">
          Source: {source === 'mock' ? 'Mock data (add Odds API key for live)' : source}
        </p>
      )}

      {loading && <p className="text-zinc-400 text-center py-10">Loading games…</p>}

      <div className="space-y-3">
        {games.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelectedGame(g)}
            className="card w-full text-left hover:border-neon/30 transition"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">
                  {g.away_abbr || g.away_team} <span className="text-zinc-500">@</span> {g.home_abbr || g.home_team}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  {g.sport}
                  {g.status === 'live' && <span className="ml-2 text-red-400 font-bold">LIVE</span>}
                </div>
              </div>
              {g.odds && (
                <div className="text-right text-sm font-mono">
                  <div>{g.odds.ml_home > 0 ? `+${g.odds.ml_home}` : g.odds.ml_home}</div>
                  {g.odds.spread_home != null && (
                    <div className="text-xs text-zinc-400">{g.odds.spread_home > 0 ? '+' : ''}{g.odds.spread_home}</div>
                  )}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
