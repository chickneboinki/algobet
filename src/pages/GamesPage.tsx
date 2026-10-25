import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { algoInfo, teamFor, confidenceWord, confidenceColor } from '../lib/algoInfo'
import { winChance, price, spreadText } from '../lib/odds'

const SPORTS = ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL']

function oddsLabel(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  return v > 0 ? `+${v}` : `${v}`
}

function formatWhen(iso?: string | null) {
  if (!iso) return 'Time TBA'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return 'Time TBA'
    return d.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return 'Time TBA'
  }
}

export default function GamesPage() {
  const [games, setGames] = useState<any[]>([])
  const [source, setSource] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sport, setSport] = useState('NFL')
  const [selected, setSelected] = useState<any>(null)
  const [propsList, setPropsList] = useState<any[]>([])
  const [propsLoading, setPropsLoading] = useState(false)
  const [propsNote, setPropsNote] = useState('')
  const [propsLive, setPropsLive] = useState(0)
  const [topPlays, setTopPlays] = useState<any[]>([])
  const [playerSel, setPlayerSel] = useState('')
  const [showAllLines, setShowAllLines] = useState(false)
  const [toast, setToast] = useState('')

  // tools + AI on game
  const [algos, setAlgos] = useState<any[]>([])
  const [toolResults, setToolResults] = useState<any[]>([])
  const [runningAll, setRunningAll] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatLog, setChatLog] = useState<{ role: string; text: string }[]>([])
  const [chatBusy, setChatBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [g, a] = await Promise.all([api.games(sport), api.algorithms().catch(() => [])])
      setGames(Array.isArray(g?.games) ? g.games : [])
      setSource(g?.source || '')
      setNote(g?.note || '')
      setAlgos(Array.isArray(a) ? a : [])
    } catch (e: any) {
      setError(String(e?.message || e || 'Load failed'))
      setGames([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [sport])

  const loadProps = async (g: any, silent = false) => {
    if (!silent) setPropsLoading(true)
    try {
      const p = await api.playerProps({ sport: g.sport || sport, home: g.home_team, away: g.away_team })
      setPropsList(Array.isArray(p?.props) ? p.props : [])
      setPropsNote(p?.note || '')
      setPropsLive(Number(p?.live_count || 0))
      setTopPlays(Array.isArray(p?.top_plays) ? p.top_plays : [])
    } catch (e: any) {
      if (!silent) {
        setPropsNote(String(e?.message || 'Could not load player bets'))
        setPropsList([])
      }
    } finally {
      if (!silent) setPropsLoading(false)
    }
  }

  const openGame = async (g: any) => {
    setSelected(g)
    setPropsList([])
    setPropsNote('')
    setPropsLive(0)
    setTopPlays([])
    setPlayerSel('')
    setShowAllLines(false)
    setToolResults([])
    setChatLog([])
    setChatInput('')
    loadProps(g)
  }

  // Keep player bets fresh while a game is open (live lines move)
  useEffect(() => {
    if (!selected) return
    const t = setInterval(() => loadProps(selected, true), 30000)
    return () => clearInterval(t)
  }, [selected])

  const runOne = async (algoId: string) => {
    if (!selected) return
    setRunningId(algoId)
    try {
      const r = await api.runAlgo(algoId, selected)
      setToolResults((prev) => {
        const rest = prev.filter((x) => x.algorithm_id !== algoId)
        return [...rest, r]
      })
    } catch (e: any) {
      setToast(String(e?.message || 'Tool failed'))
      setTimeout(() => setToast(''), 2500)
    } finally {
      setRunningId(null)
    }
  }

  const runAllTools = async () => {
    if (!selected || !algos.length) return
    setRunningAll(true)
    const results: any[] = []
    for (const a of algos) {
      try {
        const r = await api.runAlgo(a.id, selected)
        results.push(r)
      } catch {
        /* skip */
      }
    }
    setToolResults(results)
    setRunningAll(false)

    // auto AI summary after tools
    try {
      setChatBusy(true)
      const ans = await api.chatGame(selected, results, 'Explain this game and the best bet based on these tools.')
      setChatLog([
        { role: 'you', text: 'Explain this game and best bet from the tools' },
        { role: 'ai', text: ans.reply || JSON.stringify(ans) },
      ])
    } catch (e: any) {
      setChatLog([{ role: 'ai', text: String(e?.message || 'AI chat failed') }])
    } finally {
      setChatBusy(false)
    }
  }

  const sendChat = async () => {
    if (!selected || !chatInput.trim()) return
    const q = chatInput.trim()
    setChatInput('')
    setChatLog((p) => [...p, { role: 'you', text: q }])
    setChatBusy(true)
    try {
      const ans = await api.chatGame(selected, toolResults, q)
      setChatLog((p) => [...p, { role: 'ai', text: ans.reply || JSON.stringify(ans) }])
    } catch (e: any) {
      setChatLog((p) => [...p, { role: 'ai', text: String(e?.message || 'Failed') }])
    } finally {
      setChatBusy(false)
    }
  }

  const saveResult = async (result: any) => {
    if (!selected || !result || result.recommended_side === 'none') return
    try {
      await api.trackBet({
        game_id: selected.id,
        sport: selected.sport,
        home_team: selected.home_team,
        away_team: selected.away_team,
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
      setToast('Saved to My Bets')
      setTimeout(() => setToast(''), 2000)
    } catch (e: any) {
      setToast(String(e?.message || 'Save failed'))
    }
  }

  const saveProp = async (prop: any, side: 'over' | 'under') => {
    if (!selected) return
    try {
      await api.trackBet({
        game_id: selected.id,
        sport: selected.sport,
        home_team: selected.home_team,
        away_team: selected.away_team,
        algorithm_id: 'player-prop',
        algorithm_name: `${prop.player} ${prop.market_label || prop.market} (${prop.book})`,
        recommended_side: side,
        side: `${side} ${prop.line}`,
        confidence: 0.5,
        expected_value: 0,
        stake_units: 1,
        odds_taken: side === 'over' ? prop.over : prop.under,
        status: 'pending',
        placed_at: new Date().toISOString(),
      })
      setToast('Saved to My Bets')
      setTimeout(() => setToast(''), 2000)
    } catch (e: any) {
      setToast(String(e?.message || 'Save failed'))
    }
  }

  if (selected) {
    const books = selected.books || {}
    const bets = Array.isArray(selected.bets) ? selected.bets : []
    const when = formatWhen(selected.start_time || selected.commence_time)
    const picks = toolResults.filter((t) => t.recommended_side && t.recommended_side !== 'none')
    const hasRun = toolResults.length > 0
    const wc = winChance(books)
    const homeName = selected.home_team || 'Home'
    const awayName = selected.away_team || 'Away'
    const mainBook: any = books.fanduel || books.draftkings || Object.values(books)[0] || {}

    // Players: one entry per player, then show only the chosen player's lines
    const byPlayer: Record<string, any[]> = {}
    for (const pr of propsList) (byPlayer[pr.player] ||= []).push(pr)
    const playerNames = Object.keys(byPlayer).sort((x, y) => {
      const lx = byPlayer[x].some((r: any) => r.live) ? 1 : 0
      const ly = byPlayer[y].some((r: any) => r.live) ? 1 : 0
      return ly - lx || x.localeCompare(y)
    })
    const MAIN_RE = /(yards|receptions|attempts|touchdown|td|points|rebounds|assists|goals|shots|saves|strikeouts|hits)/i
    const rank = (r: any) => (/^(1q|2q|3q|4q|1h|2h)/i.test(r.market) ? 3 : MAIN_RE.test(r.market) ? 1 : 2)
    const chosenRows = (byPlayer[playerSel] || [])
      .slice()
      .sort((x: any, y: any) => rank(x) - rank(y) || String(x.market).localeCompare(String(y.market)))
    const LINES_SHOWN = 6
    const visibleRows = showAllLines ? chosenRows : chosenRows.slice(0, LINES_SHOWN)
    const leanStyle = (st: string) =>
      st === 'High' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' : st === 'Medium' ? 'text-sky-300 bg-sky-500/10 border-sky-500/25' : 'text-zinc-300 bg-white/[0.05] border-white/10'

    return (
      <div className="space-y-4 pb-8">
        <button type="button" onClick={() => setSelected(null)} className="text-sky-400 text-[15px] font-medium py-1">
          ‹ All games
        </button>

        {/* Matchup */}
        <div className="card text-center space-y-1">
          <span className="pill">{selected.sport || sport}</span>
          <p className="text-lg font-semibold leading-snug pt-2">{selected.away_team || 'Away'}</p>
          <p className="text-zinc-500 text-sm">at</p>
          <p className="text-lg font-semibold leading-snug">{selected.home_team || 'Home'}</p>
          <p className="text-sky-300 font-medium text-sm pt-2">{when}</p>
        </div>

        {/* Win chance */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-[15px]">Win chance</p>
            {wc && <span className="pill">{wc.books === 1 ? '1 sportsbook' : `${wc.books} sportsbooks`}</span>}
          </div>
          {wc ? (
            <>
              <div className="flex justify-between items-end gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-zinc-400 truncate">{awayName}</p>
                  <p className="text-2xl font-bold odds-num tracking-tight">{Math.round(wc.away * 100)}%</p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-[13px] text-zinc-400 truncate">{homeName}</p>
                  <p className="text-2xl font-bold odds-num tracking-tight">{Math.round(wc.home * 100)}%</p>
                </div>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden flex bg-white/[0.06]">
                <div className="bg-sky-400/80" style={{ width: `${wc.away * 100}%` }} />
                <div className="bg-violet-400/80" style={{ width: `${wc.home * 100}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="stat-box">
                  <p className="label">Spread</p>
                  <p className="text-sm font-semibold mt-1 odds-num">{spreadText(homeName, mainBook.spread)}</p>
                </div>
                <div className="stat-box">
                  <p className="label">Total</p>
                  <p className="text-sm font-semibold mt-1 odds-num">{mainBook.total != null ? mainBook.total : '—'}</p>
                </div>
                <div className="stat-box">
                  <p className="label">Best price</p>
                  <p className="text-sm font-semibold mt-1 odds-num">
                    {wc.home >= wc.away ? price(wc.bestHome.price) : price(wc.bestAway.price)}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">
                Worked out from the sportsbooks’ prices with their cut taken out. It is the market’s view, not a guarantee.
              </p>
            </>
          ) : (
            <p className="hint">Win chance shows up once sportsbooks post moneyline prices.</p>
          )}
        </div>

        {/* Step 1: picks */}
        <div className="card space-y-3">
          <div>
            <p className="font-semibold text-[15px]">Tool picks</p>
            <p className="hint mt-1">Every tool checks this game. If one sees an edge, it gives a pick.</p>
          </div>
          <button type="button" className="btn-primary" disabled={runningAll} onClick={runAllTools}>
            {runningAll ? 'Checking…' : hasRun ? 'Run again' : 'Check this game'}
          </button>

          {picks.map((r) => (
            <div key={r.algorithm_id} className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="label">{r.algorithm_name} says</p>
                  <p className="text-lg font-semibold tracking-tight mt-0.5">
                    {teamFor(r.recommended_side, selected.home_team, selected.away_team)}
                  </p>
                </div>
                <span className={`text-sm font-semibold shrink-0 ${confidenceColor(r.confidence)}`}>
                  {confidenceWord(r.confidence)}
                </span>
              </div>
              <p className="text-sm text-zinc-300">{r.reasoning}</p>
              <button type="button" className="btn-ghost w-full" onClick={() => saveResult(r)}>
                Save this bet
              </button>
            </div>
          ))}

          {hasRun && picks.length === 0 && (
            <p className="text-sm text-zinc-400 bg-white/[0.03] rounded-xl p-3">
              No tool sees an edge here. Passing on a game is a fine call.
            </p>
          )}

          <details className="group">
            <summary className="text-sm text-sky-400 cursor-pointer py-1 list-none">Run one tool at a time ›</summary>
            <div className="space-y-2 pt-2">
              {algos.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={runningId === a.id || runningAll}
                  onClick={() => runOne(a.id)}
                  className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 disabled:opacity-50"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-sm">{a.name}</span>
                    <span className="text-sky-400 text-sm">{runningId === a.id ? '…' : 'Run'}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{algoInfo(a.id)?.what || a.description}</p>
                </button>
              ))}
            </div>
          </details>
        </div>

        {/* AI */}
        <div className="card space-y-3">
          <div>
            <p className="font-semibold text-[15px]">Ask AI</p>
            <p className="hint mt-1">Get the picks explained in plain English, or ask your own question.</p>
          </div>
          {(chatLog.length > 0 || chatBusy) && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {chatLog.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'you' ? 'bg-sky-500/15 text-sky-100 ml-8' : 'bg-white/[0.05] text-zinc-200 mr-4'
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {chatBusy && <p className="text-xs text-zinc-500 px-1">Thinking…</p>}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              placeholder="Who should I take and why?"
              className="flex-1 min-w-0"
            />
            <button type="button" className="btn-primary !w-auto px-5" disabled={chatBusy || !chatInput.trim()} onClick={sendChat}>
              Ask
            </button>
          </div>
        </div>

        {/* Lines */}
        <div className="card space-y-3">
          <p className="font-semibold text-[15px]">Odds</p>
          {Object.keys(books).length === 0 && <p className="hint">No odds available for this game yet.</p>}
          {Object.entries(books).map(([key, b]: [string, any]) => (
            <div key={key} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
              <p className="text-sm font-semibold" style={{ color: key.includes('fan') ? '#4aa8ff' : key.includes('draft') ? '#5fdc45' : '#93c5fd' }}>
                {b?.title || key}
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  ['Home', oddsLabel(b?.ml_home)],
                  ['Away', oddsLabel(b?.ml_away)],
                  ['Spread', b?.spread != null ? oddsLabel(b.spread) : '—'],
                  ['Total', b?.total != null ? String(b.total) : '—'],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-lg bg-black/25 py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
                    <p className="font-semibold odds-num text-sm mt-0.5">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {bets.length > 0 && (
            <details>
              <summary className="text-sm text-sky-400 cursor-pointer py-1 list-none">More lines ›</summary>
              <div className="pt-1">
                {bets.slice(0, 12).map((bet: any, i: number) => (
                  <div key={i} className="flex justify-between gap-3 text-sm border-b border-white/5 py-2">
                    <span className="text-zinc-400 truncate">
                      {bet.book} · {bet.market} · {bet.selection}
                      {bet.line != null ? ` ${bet.line}` : ''}
                    </span>
                    <span className="odds-num text-sky-300 font-semibold shrink-0">{oddsLabel(bet.odds)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Player bets */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-[15px]">Player bets</p>
            {propsLive > 0 ? (
              <span className="pill pill-good">● {propsLive} live</span>
            ) : (
              propsList.length > 0 && <span className="pill">{playerNames.length} players</span>
            )}
          </div>

          {propsLoading && <p className="text-sm text-zinc-500">Loading player bets…</p>}
          {!propsLoading && propsList.length === 0 && (
            <p className="hint">{propsNote || 'No player bets for this game yet.'}</p>
          )}

          {topPlays.length > 0 && (
            <div className="space-y-2">
              <div>
                <p className="label">Best player bets</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Where the books disagree, or the prices lean one way.</p>
              </div>
              {topPlays.slice(0, 5).map((t: any) => {
                const lab = (t.labels || ['Over', 'Under'])[t.lean.side === 'over' ? 0 : 1]
                return (
                  <div key={t.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[15px] truncate">{t.player}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {t.market_label || t.market} · {lab} {t.line}
                        </p>
                      </div>
                      <span className={`text-[11px] font-semibold border rounded-full px-2.5 py-0.5 shrink-0 ${leanStyle(t.lean.strength)}`}>
                        {t.lean.strength}
                      </span>
                    </div>
                    <p className="text-[13px] text-zinc-300 leading-relaxed">{t.lean.why}</p>
                    <button type="button" className="btn-ghost w-full" onClick={() => saveProp(t, t.lean.side)}>
                      Save {lab} {t.line}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {playerNames.length > 0 && (
            <div className="space-y-3">
              <label className="block">
                <span className="label">View a player’s lines</span>
                <select
                  value={playerSel}
                  onChange={(e) => {
                    setPlayerSel(e.target.value)
                    setShowAllLines(false)
                  }}
                  className="w-full mt-1.5"
                >
                  <option value="">Choose a player…</option>
                  {playerNames.map((n) => {
                    const t = byPlayer[n].find((r: any) => r.team)?.team
                    return (
                      <option key={n} value={n}>
                        {n}
                        {t ? ` · ${t}` : ''} ({byPlayer[n].length})
                      </option>
                    )
                  })}
                </select>
              </label>

              {!playerSel && <p className="hint">Pick a player to see their lines and save a bet.</p>}

              {playerSel && (
                <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
                  <div className="px-3.5 py-3 bg-white/[0.03] flex items-center justify-between gap-2">
                    <p className="font-semibold text-[15px] truncate">{playerSel}</p>
                    <span className="text-xs text-zinc-500 shrink-0">{chosenRows.length} lines</span>
                  </div>
                  <div className="divide-y divide-white/[0.05]">
                    {visibleRows.map((prop: any) => {
                      const labs = prop.labels || ['Over', 'Under']
                      return (
                        <div key={prop.id} className="px-3.5 py-3 space-y-2.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-zinc-200">{prop.market_label || prop.market}</p>
                              <p className="text-[11px] text-zinc-500 mt-0.5">
                                {prop.book}
                                {prop.live ? ' · LIVE' : ''}
                              </p>
                            </div>
                            <p className="text-xl font-bold text-sky-300 odds-num">{prop.line}</p>
                          </div>
                          {prop.lean && (
                            <p className={`text-[12px] rounded-lg border px-2.5 py-1.5 ${leanStyle(prop.lean.strength)}`}>
                              <span className="font-semibold">
                                {labs[prop.lean.side === 'over' ? 0 : 1]} · {prop.lean.strength}
                              </span>{' '}
                              — {prop.lean.why}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-medium active:bg-emerald-500/20"
                              onClick={() => saveProp(prop, 'over')}
                            >
                              {labs[0]} {prop.over != null ? oddsLabel(prop.over) : ''}
                            </button>
                            <button
                              type="button"
                              className="rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-sm font-medium active:bg-rose-500/20"
                              onClick={() => saveProp(prop, 'under')}
                            >
                              {labs[1]} {prop.under != null ? oddsLabel(prop.under) : ''}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {chosenRows.length > LINES_SHOWN && (
                    <button
                      type="button"
                      className="w-full py-3 text-sm text-sky-400 border-t border-white/[0.05]"
                      onClick={() => setShowAllLines((v) => !v)}
                    >
                      {showAllLines ? 'Show fewer lines' : `Show all ${chosenRows.length} lines`}
                    </button>
                  )}
                </div>
              )}
              <p className="text-[11px] text-zinc-600">Updates every 30 seconds while this page is open.</p>
            </div>
          )}
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h2 className="page-title">Games</h2>
        <p className="hint mt-1">Pick a league, then tap a game to check it.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-4 px-4">
        {SPORTS.map((s) => (
          <button key={s} type="button" onClick={() => setSport(s)} className={`chip ${sport === s ? 'chip-on' : 'chip-off'}`}>
            {s}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {loading ? <p className="text-center text-zinc-500 py-12 text-sm">Loading games…</p> : null}
      {!loading && !error && games.length === 0 && (
        <div className="card text-center space-y-1">
          <p className="font-medium">No {sport} games right now</p>
          <p className="hint">{note || 'Try another league.'}</p>
        </div>
      )}

      <div className="space-y-2.5">
        {games.map((g) => {
          const books = g.books || {}
          const fd = books.fanduel
          const dk = books.draftkings
          return (
            <button key={g.id} type="button" onClick={() => openGame(g)} className="card w-full text-left space-y-2 active:bg-white/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-[15px] leading-snug">
                  {g.away_team} <span className="text-zinc-500 font-normal">at</span> {g.home_team}
                </p>
                <span className="text-zinc-600 text-lg leading-none">›</span>
              </div>
              <p className="text-xs text-zinc-400">{formatWhen(g.start_time || g.commence_time)}</p>
              {(fd || dk) && (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {fd && <span className="pill">FanDuel {oddsLabel(fd.ml_home)} / {oddsLabel(fd.ml_away)}</span>}
                  {dk && <span className="pill">DraftKings {oddsLabel(dk.ml_home)} / {oddsLabel(dk.ml_away)}</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
