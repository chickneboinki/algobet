import { useEffect, useState } from 'react'
import { api } from '../services/api'

const SPORTS = ['', 'NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL']

function oddsLabel(n?: number) {
  if (n == null) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

function BookRow({ name, data, color }: { name: string; data?: any; color: string }) {
  if (!data) return null
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05] last:border-0">
      <span className="text-sm font-semibold" style={{ color }}>
        {name}
      </span>
      <div className="flex gap-4 text-sm odds-num">
        <div className="text-right min-w-[52px]">
          <div className="text-[10px] text-zinc-500 uppercase">ML H</div>
          <div className="font-semibold">{oddsLabel(data.ml_home)}</div>
        </div>
        <div className="text-right min-w-[52px]">
          <div className="text-[10px] text-zinc-500 uppercase">ML A</div>
          <div className="font-semibold">{oddsLabel(data.ml_away)}</div>
        </div>
        <div className="text-right min-w-[52px]">
          <div className="text-[10px] text-zinc-500 uppercase">Spr</div>
          <div className="font-semibold">{data.spread_home != null ? oddsLabel(data.spread_home) : '—'}</div>
        </div>
        <div className="text-right min-w-[44px]">
          <div className="text-[10px] text-zinc-500 uppercase">O/U</div>
          <div className="font-semibold">{data.total ?? '—'}</div>
        </div>
      </div>
    </div>
  )
}

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
  const [teamInfo, setTeamInfo] = useState<any>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [g, a] = await Promise.all([api.games(sport || undefined), api.algorithms()])
      setGames(g.games || [])
      setSource(g.source)
      setAlgos(a)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [sport])

  const openGame = async (g: any) => {
    setSelectedGame(g)
    setResult(null)
    setTeamInfo(null)
    if ((g.sport || '').toUpperCase() === 'NBA') {
      try {
        const s = await api.teamStats(g.home_team, 'NBA')
        setTeamInfo(s)
      } catch (_) {}
    }
  }

  const run = async (algoId: string) => {
    if (!selectedGame) return
    setRunning(true)
    setResult(null)
    try {
      setResult(await api.runAlgo(algoId, selectedGame))
    } catch (e: any) {
      setToast(e.message || 'Something went wrong')
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
        home_team: selectedGame.home_team,
        away_team: selectedGame.away_team,
        algorithm_id: result.algorithm_id,
        algorithm_name: result.algorithm_name,
        recommended_side: result.recommended_side,
        side: result.recommended_side,
        confidence: result.confidence,
        expected_value: result.expected_value,
        stake_units: result.suggested_stake_units || 1,
        odds_taken: selectedGame.odds?.ml_home,
        status: 'pending',
        placed_at: new Date().toISOString(),
      })
      setToast('Saved to your bets')
      setTimeout(() => setToast(''), 2200)
    } catch (e: any) {
      setToast(e.message)
    }
  }

  if (selectedGame) {
    const books = selectedGame.books || {}
    const links = selectedGame.links || {}
    return (
      <div className="space-y-3.5">
        <button
          type="button"
          onClick={() => {
            setSelectedGame(null)
            setResult(null)
          }}
          className="text-sky-400 text-sm font-medium"
        >
          Back to all games
        </button>

        <div className="card text-center space-y-1.5">
          <p className="label">{selectedGame.sport}</p>
          <div className="text-[20px] font-semibold tracking-tight leading-snug">
            {selectedGame.away_team}
            <span className="text-zinc-500 font-normal text-base mx-2">at</span>
            {selectedGame.home_team}
          </div>
          {selectedGame.start_time && (
            <p className="text-xs text-zinc-500">{new Date(selectedGame.start_time).toLocaleString()}</p>
          )}
        </div>

        <div className="card space-y-1">
          <div className="flex items-center justify-between mb-1">
            <p className="font-semibold">Live lines</p>
            <p className="text-[11px] text-zinc-500">FanDuel · DraftKings</p>
          </div>
          <BookRow name="FanDuel" data={books.fanduel || selectedGame.odds} color="#1493ff" />
          <BookRow name="DraftKings" data={books.draftkings} color="#53d337" />
          <p className="hint text-[12px] pt-2">
            <strong className="text-zinc-300">+150</strong> means bet $100 to win $150 profit.
            <strong className="text-zinc-300"> −150</strong> means bet $150 to win $100.
          </p>
        </div>

        {teamInfo?.recent_games?.length > 0 && (
          <div className="card space-y-2">
            <p className="font-semibold text-sm">Recent form · {teamInfo.team || selectedGame.home_team}</p>
            <p className="hint text-[12px]">{teamInfo.note}</p>
            <ul className="text-sm space-y-1.5">
              {teamInfo.recent_games.slice(0, 5).map((g: any, i: number) => (
                <li key={i} className="flex justify-between text-zinc-300">
                  <span className="truncate pr-2">
                    {(g.away || '').split(' ').pop()} @ {(g.home || '').split(' ').pop()}
                  </span>
                  <span className="odds-num shrink-0">
                    {g.away_score != null ? `${g.away_score}-${g.home_score}` : g.status || '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card space-y-2">
          <p className="font-semibold text-sm">Open on a sportsbook</p>
          <div className="grid grid-cols-3 gap-2">
            <a href={links.fanduel || 'https://sportsbook.fanduel.com/'} target="_blank" rel="noreferrer" className="book-badge justify-center" style={{ color: '#1493ff' }}>
              FanDuel
            </a>
            <a href={links.draftkings || 'https://sportsbook.draftkings.com/'} target="_blank" rel="noreferrer" className="book-badge justify-center" style={{ color: '#53d337' }}>
              DraftKings
            </a>
            <a href={links.prizepicks || 'https://app.prizepicks.com/'} target="_blank" rel="noreferrer" className="book-badge justify-center" style={{ color: '#a78bfa' }}>
              PrizePicks
            </a>
          </div>
          <p className="hint text-[11px]">Opens the site or app so you can place the bet. This app never places bets for you.</p>
        </div>

        <div className="space-y-2">
          <p className="font-semibold px-0.5">Run a tool</p>
          <p className="hint px-0.5 text-[12px]">Your NFL and NCAA engines show first when the sport matches.</p>
          {algos.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => run(a.id)}
              disabled={running}
              className="card w-full text-left flex justify-between items-center disabled:opacity-50"
            >
              <div className="min-w-0 pr-2">
                <div className="font-semibold text-[14px]">{a.name}</div>
                <div className="hint text-[12px] mt-0.5 line-clamp-2">{a.description}</div>
              </div>
              <span className="text-sky-400 shrink-0 text-lg">→</span>
            </button>
          ))}
        </div>

        {running && <p className="text-center text-zinc-400 py-3 text-sm">Checking…</p>}

        {result && (
          <div className="card space-y-3 border-sky-500/30">
            <p className="font-semibold text-sky-400">Result · {result.algorithm_name}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="stat-box">
                <p className="label mb-1">Pick</p>
                <p className="font-bold text-base uppercase">
                  {result.recommended_side === 'none' ? 'Pass' : result.recommended_side}
                </p>
              </div>
              <div className="stat-box">
                <p className="label mb-1">How sure</p>
                <p className="font-bold text-base">{Math.round(result.confidence * 100)}%</p>
              </div>
              <div className="stat-box">
                <p className="label mb-1">Edge</p>
                <p className="font-bold text-base">{(result.expected_value * 100).toFixed(1)}%</p>
              </div>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{result.reasoning}</p>
            {result.key_factors?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.key_factors.map((f: string, i: number) => (
                  <span key={i} className="text-[11px] px-2 py-1 rounded-lg bg-sky-500/10 text-sky-300">
                    {f}
                  </span>
                ))}
              </div>
            )}
            {result.recommended_side !== 'none' && (
              <button type="button" onClick={track} className="btn-primary">
                Save to my bets
              </button>
            )}
          </div>
        )}

        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-sky-500 text-black px-5 py-2.5 rounded-full text-sm font-semibold shadow-xl z-50">
            {toast}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3.5">
      {showHelp && (
        <div className="card space-y-2 border-sky-500/25">
          <div className="flex justify-between">
            <p className="font-semibold">Quick start</p>
            <button type="button" onClick={() => setShowHelp(false)} className="text-zinc-500 text-xs">
              Dismiss
            </button>
          </div>
          <ol className="hint space-y-1 list-decimal list-inside text-[13px]">
            <li>Open Best for ranked picks across all tools</li>
            <li>Or pick a game here and run one tool</li>
            <li>Save bets, then mark won or lost later</li>
          </ol>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {SPORTS.map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setSport(s)} className={`chip ${sport === s ? 'chip-on' : 'chip-off'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {source === 'mock' && (
        <p className="hint text-[12px] px-0.5">Sample games. Add ODDS_API_KEY under Setup for live books.</p>
      )}
      {source && source !== 'mock' && (
        <p className="text-[12px] text-emerald-400/90 px-0.5 font-medium">Live lines from sportsbooks</p>
      )}

      {loading && <p className="text-zinc-500 text-center py-14 text-sm">Loading games…</p>}

      <div className="space-y-2.5">
        {games.map((g) => {
          const fd = g.books?.fanduel || g.odds
          const dk = g.books?.draftkings
          return (
            <button key={g.id} type="button" onClick={() => openGame(g)} className="card w-full text-left space-y-2">
              <div className="min-w-0">
                <div className="font-semibold text-[15px] leading-snug">
                  {g.away_team}
                  <span className="text-zinc-500 font-normal"> at </span>
                  {g.home_team}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] font-semibold text-sky-400/90 bg-sky-500/10 px-1.5 py-0.5 rounded">{g.sport}</span>
                  {g.start_time && (
                    <span className="text-[11px] text-zinc-500">
                      {new Date(g.start_time).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
              </div>
              {(fd || dk) && (
                <div className="flex gap-2 pt-0.5">
                  {fd && (
                    <div className="book-badge flex-1 justify-between">
                      <span style={{ color: '#1493ff' }}>FD</span>
                      <span className="odds-num text-zinc-200">
                        {oddsLabel(fd.ml_home)} / {oddsLabel(fd.ml_away)}
                      </span>
                    </div>
                  )}
                  {dk && (
                    <div className="book-badge flex-1 justify-between">
                      <span style={{ color: '#53d337' }}>DK</span>
                      <span className="odds-num text-zinc-200">
                        {oddsLabel(dk.ml_home)} / {oddsLabel(dk.ml_away)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {!loading && games.length === 0 && (
        <div className="card text-center py-12">
          <p className="font-medium mb-1">No games right now</p>
          <p className="hint">Try NFL, NCAAF, or NCAAB</p>
        </div>
      )}
    </div>
  )
}
