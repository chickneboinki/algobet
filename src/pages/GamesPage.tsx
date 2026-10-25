import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { algoInfo, teamFor, confidenceWord, confidenceColor } from '../lib/algoInfo'

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

  const openGame = async (g: any) => {
    setSelected(g)
    setPropsList([])
    setPropsNote('')
    setToolResults([])
    setChatLog([])
    setChatInput('')
    setPropsLoading(true)
    try {
      const p = await api.playerProps({
        sport: g.sport || sport,
        home: g.home_team,
        away: g.away_team,
      })
      setPropsList(Array.isArray(p?.props) ? p.props : [])
      setPropsNote(p?.note || p?.source || '')
    } catch (e: any) {
      setPropsNote(String(e?.message || 'Props failed'))
      setPropsList([])
    } finally {
      setPropsLoading(false)
    }
  }

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

        {/* Props */}
        <div className="card space-y-3">
          <p className="font-semibold text-[15px]">Player bets</p>
          {propsLoading && <p className="text-sm text-zinc-500">Loading…</p>}
          {!propsLoading && propsList.length === 0 && <p className="hint">No player bets available for this game.</p>}
          {propsList.slice(0, 30).map((prop: any) => (
            <div key={prop.id || `${prop.player}-${prop.line}`} className="rounded-xl border border-white/[0.08] p-3 space-y-2.5">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[15px] truncate">{prop.player}</p>
                  <p className="text-xs text-zinc-500">
                    {prop.market_label || prop.market} · {prop.book}
                  </p>
                </div>
                <p className="text-lg font-bold text-sky-300 odds-num shrink-0">{prop.line}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-3 text-sm font-medium" onClick={() => saveProp(prop, 'over')}>
                  Over {oddsLabel(prop.over)}
                </button>
                <button type="button" className="rounded-xl border border-rose-500/30 bg-rose-500/10 py-3 text-sm font-medium" onClick={() => saveProp(prop, 'under')}>
                  Under {oddsLabel(prop.under)}
                </button>
              </div>
            </div>
          ))}
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
