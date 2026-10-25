import { useEffect, useState } from 'react'
import { api } from '../services/api'

const SPORTS = ['', 'NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL']

function oddsLabel(n?: number | null) {
  if (n == null || Number.isNaN(n)) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

function formatWhen(iso?: string | null) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

/** Normalize Odds API / FanDuel / ESPN shapes into simple book cards */
function extractBooks(g: any) {
  const books: Record<string, any> = { ...(g.books || {}) }

  // legacy flat odds
  if (g.odds && !books.fanduel && !books.draftkings) {
    books.primary = g.odds
  }

  for (const bm of g.bookmakers || []) {
    const key = (bm.key || bm.title || 'book').toLowerCase().replace(/\s/g, '')
    const row: any = { title: bm.title || key }
    for (const m of bm.markets || []) {
      const outcomes = m.outcomes || []
      if (m.key === 'h2h' || m.key === 'moneyline') {
        // try match home/away by name
        for (const o of outcomes) {
          const name = (o.name || '').toLowerCase()
          const home = (g.home_team || '').toLowerCase()
          const away = (g.away_team || '').toLowerCase()
          if (home && name.includes(home.split(' ').pop() || '___')) row.ml_home = o.price
          else if (away && name.includes(away.split(' ').pop() || '___')) row.ml_away = o.price
        }
        if (row.ml_home == null && outcomes[0]) row.ml_home = outcomes[0].price
        if (row.ml_away == null && outcomes[1]) row.ml_away = outcomes[1].price
      }
      if (m.key === 'spreads') {
        const o = outcomes[0]
        if (o?.point != null) row.spread = o.point
        if (o?.price != null) row.spread_price = o.price
      }
      if (m.key === 'totals') {
        const o = outcomes.find((x: any) => /over/i.test(x.name || '')) || outcomes[0]
        if (o?.point != null) row.total = o.point
        if (o?.price != null) row.total_price = o.price
      }
    }
    books[key] = { ...books[key], ...row }
  }

  // ESPN flat fields
  if (g.spread != null || g.total != null || g.home_ml != null) {
    books.draftkings = {
      ...(books.draftkings || {}),
      title: 'DraftKings',
      ml_home: books.draftkings?.ml_home ?? g.home_ml,
      ml_away: books.draftkings?.ml_away ?? g.away_ml,
      spread: books.draftkings?.spread ?? g.spread,
      total: books.draftkings?.total ?? g.total,
    }
  }

  return books
}

function gameTime(g: any) {
  return g.commence_time || g.start_time || g.startTime || null
}

export default function GamesPage() {
  const [games, setGames] = useState<any[]>([])
  const [source, setSource] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sport, setSport] = useState('NFL')
  const [algos, setAlgos] = useState<any[]>([])
  const [selectedGame, setSelectedGame] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [toast, setToast] = useState('')
  const [propsData, setPropsData] = useState<any>(null)
  const [propsLoading, setPropsLoading] = useState(false)
  const [propFilter, setPropFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [g, a] = await Promise.all([api.games(sport || undefined), api.algorithms().catch(() => [])])
      setGames(Array.isArray(g.games) ? g.games : [])
      setSource(g.source || '')
      setNote(g.note || '')
      setAlgos(Array.isArray(a) ? a : [])
    } catch (e: any) {
      setError(e.message || 'Could not load games')
      setGames([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [sport])

  const openGame = async (g: any) => {
    try {
      setSelectedGame(g)
      setResult(null)
      setPropsData(null)
      setPropFilter('all')
      setPropsLoading(true)
      const p = await api.playerProps({
        sport: g.sport || sport || 'NFL',
        eventId: g.id,
        home: g.home_team,
        away: g.away_team,
      })
      setPropsData(p)
    } catch (e: any) {
      setPropsData({ props: [], source: 'error', note: e.message })
    } finally {
      setPropsLoading(false)
    }
  }

  const run = async (algoId: string) => {
    if (!selectedGame) return
    setRunning(true)
    setResult(null)
    try {
      setResult(await api.runAlgo(algoId, selectedGame))
    } catch (e: any) {
      setToast(e.message || 'Tool failed')
      setTimeout(() => setToast(''), 2500)
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
        status: 'pending',
        placed_at: new Date().toISOString(),
      })
      setToast('Saved to your bets')
      setTimeout(() => setToast(''), 2200)
    } catch (e: any) {
      setToast(e.message || 'Save failed')
    }
  }

  const trackProp = async (prop: any, side: 'over' | 'under') => {
    if (!selectedGame) return
    try {
      await api.trackBet({
        game_id: selectedGame.id,
        sport: selectedGame.sport,
        home_team: selectedGame.home_team,
        away_team: selectedGame.away_team,
        algorithm_id: 'player-prop',
        algorithm_name: `${prop.player} ${prop.market_label || prop.market}`,
        recommended_side: side,
        side: `${side} ${prop.line}`,
        confidence: 0.5,
        expected_value: 0,
        stake_units: 1,
        odds_taken: side === 'over' ? prop.over : prop.under,
        status: 'pending',
        placed_at: new Date().toISOString(),
      })
      setToast(`Saved ${prop.player} ${side.toUpperCase()} ${prop.line}`)
      setTimeout(() => setToast(''), 2200)
    } catch (e: any) {
      setToast(e.message || 'Save failed')
    }
  }

  // ——— Game detail ———
  if (selectedGame) {
    const books = extractBooks(selectedGame)
    const when = formatWhen(gameTime(selectedGame))
    const allProps = propsData?.props || []
    const markets = Array.from(new Set(allProps.map((p: any) => p.market_label || p.market).filter(Boolean))) as string[]
    const filtered =
      propFilter === 'all'
        ? allProps
        : allProps.filter((p: any) => (p.market_label || p.market) === propFilter)

    const fdSearch = encodeURIComponent(
      `${selectedGame.away_team || ''} ${selectedGame.home_team || ''}`.trim()
    )

    return (
      <div className="space-y-3.5">
        <button
          type="button"
          onClick={() => {
            setSelectedGame(null)
            setResult(null)
            setPropsData(null)
          }}
          className="text-sky-400 text-sm font-medium"
        >
          ← Back to all games
        </button>

        <div className="card text-center space-y-2">
          <p className="label">{selectedGame.sport || sport}</p>
          <div className="text-[18px] font-semibold tracking-tight leading-snug">
            {selectedGame.away_team || selectedGame.name || 'Away'}
            <div className="text-zinc-500 font-normal text-sm my-1">at</div>
            {selectedGame.home_team || 'Home'}
          </div>
          {when && <p className="text-sm text-sky-300/90 font-medium">{when}</p>}
          {selectedGame.status && <p className="text-xs text-zinc-500">{selectedGame.status}</p>}
          {selectedGame.live && (
            <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide">Live</p>
          )}
        </div>

        {/* Book lines */}
        <div className="card space-y-2">
          <p className="font-semibold">Lines from books</p>
          {Object.keys(books).length === 0 && (
            <p className="hint text-sm">No lines on this game yet — open a sportsbook below.</p>
          )}
          {Object.entries(books).map(([key, b]: [string, any]) => (
            <div key={key} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
              <p className="text-sm font-semibold capitalize" style={{ color: key.includes('fan') ? '#1493ff' : key.includes('draft') ? '#53d337' : '#a5b4fc' }}>
                {b.title || key}
              </p>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase">Home ML</p>
                  <p className="font-semibold odds-num">{oddsLabel(b.ml_home)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase">Away ML</p>
                  <p className="font-semibold odds-num">{oddsLabel(b.ml_away)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase">Total</p>
                  <p className="font-semibold odds-num">{b.total ?? '—'}</p>
                </div>
              </div>
              {b.spread != null && (
                <p className="text-xs text-zinc-400 text-center">Spread {oddsLabel(b.spread)}</p>
              )}
            </div>
          ))}
        </div>

        {/* Open on sites */}
        <div className="card space-y-2">
          <p className="font-semibold text-sm">View bets on</p>
          <div className="grid grid-cols-1 gap-2">
            <a
              href={`https://sportsbook.fanduel.com/navigation/nfl`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-center font-semibold text-sky-300"
            >
              Open FanDuel
            </a>
            <a
              href="https://sportsbook.draftkings.com/leagues/football/nfl"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center font-semibold text-emerald-300"
            >
              Open DraftKings
            </a>
            <a
              href="https://app.prizepicks.com/"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-center font-semibold text-violet-300"
            >
              Open PrizePicks
            </a>
            <a
              href="https://underdogfantasy.com/"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center font-semibold text-amber-200"
            >
              Open Underdog
            </a>
          </div>
          <p className="hint text-[11px]">We show lines here so you can compare. Bets are placed on the sportsbook apps.</p>
        </div>

        {/* Player props */}
        <div className="card space-y-3">
          <div>
            <p className="font-semibold">Player bets</p>
            <p className="hint text-[12px] mt-0.5">Over / under style lines from PrizePicks and Underdog.</p>
          </div>
          {markets.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" className={`chip ${propFilter === 'all' ? 'chip-on' : 'chip-off'}`} onClick={() => setPropFilter('all')}>
                All
              </button>
              {markets.slice(0, 12).map((m) => (
                <button key={m} type="button" className={`chip ${propFilter === m ? 'chip-on' : 'chip-off'}`} onClick={() => setPropFilter(m)}>
                  {m}
                </button>
              ))}
            </div>
          )}
          {propsLoading && <p className="text-sm text-zinc-500">Loading player lines…</p>}
          {!propsLoading && filtered.length === 0 && (
            <p className="hint">No player lines matched this game. Try the Best tab or open PrizePicks.</p>
          )}
          {propsData?.note && <p className="text-[11px] text-zinc-500">{propsData.note}</p>}
          <div className="space-y-2">
            {filtered.slice(0, 40).map((prop: any) => (
              <div key={prop.id || `${prop.player}-${prop.line}`} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold text-[15px]">{prop.player}</p>
                    <p className="text-xs text-zinc-500">
                      {prop.market_label || prop.market} · {prop.book || prop.source}
                    </p>
                  </div>
                  <p className="text-lg font-semibold odds-num text-sky-300">{prop.line}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-3 px-2 text-center"
                    onClick={() => trackProp(prop, 'over')}
                  >
                    <p className="text-[11px] text-emerald-400/80 uppercase font-semibold">Over</p>
                    <p className="font-bold odds-num text-emerald-300 mt-0.5">{oddsLabel(prop.over)}</p>
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 py-3 px-2 text-center"
                    onClick={() => trackProp(prop, 'under')}
                  >
                    <p className="text-[11px] text-rose-400/80 uppercase font-semibold">Under</p>
                    <p className="font-bold odds-num text-rose-300 mt-0.5">{oddsLabel(prop.under)}</p>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tools */}
        {algos.length > 0 && (
          <div className="space-y-2">
            <p className="font-semibold px-0.5">Run a tool on this game</p>
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
        )}

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
                <p className="font-bold text-base">{Math.round((result.confidence || 0) * 100)}%</p>
              </div>
              <div className="stat-box">
                <p className="label mb-1">Edge</p>
                <p className="font-bold text-base">{((result.expected_value || 0) * 100).toFixed(1)}%</p>
              </div>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{result.reasoning}</p>
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

  // ——— List ———
  return (
    <div className="space-y-3.5">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {SPORTS.map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setSport(s || 'NFL')} className={`chip ${sport === (s || 'NFL') ? 'chip-on' : 'chip-off'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {note && <p className="text-[12px] text-zinc-500 px-0.5">{note}</p>}
      {source && <p className="text-[12px] text-emerald-400/90 px-0.5 font-medium">Source: {source}</p>}
      {error && <p className="text-sm text-rose-400 px-0.5">{error}</p>}

      {loading && <p className="text-zinc-500 text-center py-14 text-sm">Loading games…</p>}

      <div className="space-y-2.5">
        {games.map((g) => {
          const books = extractBooks(g)
          const fd = books.fanduel
          const dk = books.draftkings
          const when = formatWhen(gameTime(g))
          return (
            <button key={g.id || g.name} type="button" onClick={() => openGame(g)} className="card w-full text-left space-y-2">
              <div className="min-w-0">
                <div className="font-semibold text-[15px] leading-snug">
                  {g.away_team || g.name || 'Away'}
                  <span className="text-zinc-500 font-normal"> at </span>
                  {g.home_team || 'Home'}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="text-[11px] font-semibold text-sky-400/90 bg-sky-500/10 px-1.5 py-0.5 rounded">
                    {g.sport || sport}
                  </span>
                  {when && <span className="text-[12px] text-zinc-300 font-medium">{when}</span>}
                  {g.live && <span className="text-[11px] text-rose-400 font-semibold">LIVE</span>}
                </div>
              </div>
              {(fd || dk) && (
                <div className="flex gap-2 pt-0.5">
                  {fd && (
                    <div className="book-badge flex-1 justify-between">
                      <span style={{ color: '#1493ff' }}>FD</span>
                      <span className="odds-num text-zinc-200 text-xs">
                        {oddsLabel(fd.ml_home)} / {oddsLabel(fd.ml_away)}
                      </span>
                    </div>
                  )}
                  {dk && (
                    <div className="book-badge flex-1 justify-between">
                      <span style={{ color: '#53d337' }}>DK</span>
                      <span className="odds-num text-zinc-200 text-xs">
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

      {!loading && games.length === 0 && !error && (
        <div className="card text-center py-12">
          <p className="font-medium mb-1">No games right now</p>
          <p className="hint">Try NFL or another sport</p>
        </div>
      )}
    </div>
  )
}
