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
  const [showHelp, setShowHelp] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [g, a] = await Promise.all([api.games(sport || undefined), api.algorithms()])
      setGames(g.games || [])
      setSource(g.source)
      setAlgos(a)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [sport])

  const run = async (algoId: string) => {
    if (!selectedGame) return
    setRunning(true)
    setResult(null)
    try { setResult(await api.runAlgo(algoId, selectedGame)) }
    catch (e: any) { setToast(e.message || 'Something went wrong') }
    finally { setRunning(false) }
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
      setToast('Saved to your bet list ✓')
      setTimeout(() => setToast(''), 2500)
    } catch (e: any) { setToast(e.message) }
  }

  const oddsLabel = (n?: number) => (n == null ? '—' : n > 0 ? `+${n}` : `${n}`)

  if (selectedGame) {
    return (
      <div className="space-y-4">
        <button onClick={() => { setSelectedGame(null); setResult(null) }} className="text-[#00BFFF] text-sm font-medium">← Back to all games</button>

        <div className="card text-center space-y-2">
          <p className="label">{selectedGame.sport}</p>
          <div className="text-2xl font-bold tracking-tight">
            {selectedGame.away_team}<span className="text-zinc-500 text-lg mx-2">at</span>{selectedGame.home_team}
          </div>
          {selectedGame.status === 'live' && (
            <p className="text-red-400 font-bold text-sm">LIVE · {selectedGame.away_score}-{selectedGame.home_score}</p>
          )}
        </div>

        {selectedGame.odds && (
          <div className="card space-y-3">
            <p className="font-semibold">What the books are offering</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="stat-box">
                <p className="label mb-1">Home win payout</p>
                <p className="text-xl font-mono font-bold">{oddsLabel(selectedGame.odds.ml_home)}</p>
              </div>
              <div className="stat-box">
                <p className="label mb-1">Away win payout</p>
                <p className="text-xl font-mono font-bold">{oddsLabel(selectedGame.odds.ml_away)}</p>
              </div>
            </div>
            <p className="hint text-xs">
              <strong className="text-zinc-300">+150</strong> means bet $100 to win $150 profit.
              {' '}<strong className="text-zinc-300">−150</strong> means bet $150 to win $100 profit.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="font-semibold px-1">Pick a tool to check this game</p>
          <p className="hint px-1">Each tool looks at the game differently and tells you who it likes.</p>
          {algos.map((a) => (
            <button key={a.id} onClick={() => run(a.id)} disabled={running}
              className="card w-full text-left flex justify-between items-center disabled:opacity-50">
              <div>
                <div className="font-semibold">{a.name}</div>
                <div className="hint text-xs mt-0.5">{a.description}</div>
              </div>
              <span className="text-[#00BFFF] text-2xl pl-3">→</span>
            </button>
          ))}
        </div>

        {running && <p className="text-center text-zinc-400 py-4">Checking the numbers…</p>}

        {result && (
          <div className="card border-[#00BFFF]/40 space-y-4">
            <p className="font-semibold text-[#00BFFF]">What the tool says</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="stat-box">
                <p className="label mb-1">Pick</p>
                <p className="font-bold text-lg uppercase">{result.recommended_side === 'none' ? 'Pass' : result.recommended_side}</p>
              </div>
              <div className="stat-box">
                <p className="label mb-1">How sure</p>
                <p className="font-bold text-lg">{Math.round(result.confidence * 100)}%</p>
              </div>
              <div className="stat-box">
                <p className="label mb-1">Edge</p>
                <p className="font-bold text-lg">{(result.expected_value * 100).toFixed(1)}%</p>
              </div>
            </div>
            <div className="bg-black/30 rounded-xl p-3 space-y-1">
              <p className="hint text-xs"><strong className="text-zinc-300">How sure</strong> = confidence (higher is better).</p>
              <p className="hint text-xs"><strong className="text-zinc-300">Edge</strong> = value vs the odds. Positive = good.</p>
              <p className="hint text-xs"><strong className="text-zinc-300">Pass</strong> = no clear play.</p>
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed">{result.reasoning}</p>
            {result.recommended_side !== 'none' && (
              <button onClick={track} className="btn-primary">Save this as a bet I’m tracking</button>
            )}
          </div>
        )}

        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#00BFFF] text-black px-5 py-2.5 rounded-full text-sm font-bold shadow-xl z-50">{toast}</div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showHelp && (
        <div className="card border-[#00BFFF]/30 space-y-2">
          <div className="flex justify-between items-start">
            <p className="font-semibold">How to use this</p>
            <button onClick={() => setShowHelp(false)} className="text-zinc-500 text-sm">Dismiss</button>
          </div>
          <ol className="hint space-y-1.5 list-decimal list-inside">
            <li>Pick a game below</li>
            <li>Run a tool — it tells you who it likes and why</li>
            <li>If you like the pick, save it to track later</li>
          </ol>
          <p className="hint text-xs pt-1">Need real odds? Open <span className="text-[#00BFFF]">Setup</span> and follow the steps.</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {['', 'NFL', 'NBA', 'NCAAF', 'MLB', 'NHL'].map((s) => (
          <button key={s || 'all'} onClick={() => setSport(s)}
            className={`chip ${sport === s ? 'chip-on' : 'chip-off'}`}>{s || 'All'}</button>
        ))}
      </div>

      {source === 'mock' && (
        <p className="hint px-1 text-xs">Showing sample games. Add a free Odds API key in Setup for real lines.</p>
      )}
      {source && source !== 'mock' && (
        <p className="hint px-1 text-xs text-green-400/80">Live odds loaded ✓</p>
      )}

      {loading && <p className="text-zinc-400 text-center py-12">Loading games…</p>}

      <div className="space-y-3">
        {games.map((g) => (
          <button key={g.id} onClick={() => setSelectedGame(g)}
            className="card w-full text-left active:scale-[0.99] transition">
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-base">
                  {g.away_team}<span className="text-zinc-500 font-normal"> at </span>{g.home_team}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-400">{g.sport}</span>
                  {g.status === 'live' && <span className="text-xs font-bold text-red-400">LIVE</span>}
                </div>
              </div>
              {g.odds && (
                <div className="text-right shrink-0">
                  <div className="font-mono font-semibold">{oddsLabel(g.odds.ml_home)}</div>
                  <div className="text-xs text-zinc-500">home</div>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {!loading && games.length === 0 && (
        <div className="card text-center py-10">
          <p className="font-medium mb-1">No games right now</p>
          <p className="hint">Try another sport or check back later</p>
        </div>
      )}
    </div>
  )
}
