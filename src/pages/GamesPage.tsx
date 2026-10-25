import { useEffect, useState } from 'react'
import { api } from '../services/api'

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

    return (
      <div className="space-y-4 pb-8">
        <button type="button" onClick={() => setSelected(null)} className="text-sky-400 text-sm font-medium">
          ← Back to games
        </button>

        <div className="card space-y-2 text-center">
          <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide">{selected.sport || sport}</p>
          <p className="text-lg font-semibold leading-snug">{selected.away_team || 'Away'}</p>
          <p className="text-zinc-500 text-sm">at</p>
          <p className="text-lg font-semibold leading-snug">{selected.home_team || 'Home'}</p>
          <p className="text-sky-300 font-medium text-sm pt-1">{when}</p>
        </div>

        {/* Lines */}
        <div className="card space-y-3">
          <p className="font-semibold">Live lines on this site</p>
          {Object.entries(books).map(([key, b]: [string, any]) => (
            <div key={key} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
              <p
                className="text-sm font-bold"
                style={{ color: key.includes('fan') ? '#1493ff' : key.includes('draft') ? '#53d337' : '#93c5fd' }}
              >
                {b?.title || key}
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-black/30 p-2 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">Home ML</p>
                  <p className="font-bold odds-num">{oddsLabel(b?.ml_home)}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-2 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">Away ML</p>
                  <p className="font-bold odds-num">{oddsLabel(b?.ml_away)}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-2 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">Spread</p>
                  <p className="font-bold odds-num">{b?.spread != null ? oddsLabel(b.spread) : '—'}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-2 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">Total</p>
                  <p className="font-bold odds-num">{b?.total != null ? b.total : '—'}</p>
                </div>
              </div>
            </div>
          ))}
          {bets.slice(0, 12).map((bet: any, i: number) => (
            <div key={i} className="flex justify-between text-sm border-b border-white/5 py-1.5">
              <span className="text-zinc-400 truncate">
                {bet.book} · {bet.market} · {bet.selection}
                {bet.line != null ? ` ${bet.line}` : ''}
              </span>
              <span className="odds-num text-sky-300 font-semibold">{oddsLabel(bet.odds)}</span>
            </div>
          ))}
        </div>

        {/* Run tools */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Run tools (algorithms)</p>
              <p className="hint text-xs">Each tool scores this game. Then AI can explain the best lean.</p>
            </div>
            <button type="button" className="btn-primary text-sm shrink-0" disabled={runningAll} onClick={runAllTools}>
              {runningAll ? 'Running…' : 'Run all'}
            </button>
          </div>
          <div className="space-y-2">
            {algos.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={runningId === a.id || runningAll}
                onClick={() => runOne(a.id)}
                className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 disabled:opacity-50"
              >
                <div className="flex justify-between">
                  <span className="font-medium text-sm">{a.name}</span>
                  <span className="text-sky-400 text-sm">{runningId === a.id ? '…' : 'Run'}</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{a.description}</p>
              </button>
            ))}
          </div>

          {picks.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-emerald-400 uppercase">Tool picks</p>
              {picks.map((r) => (
                <div key={r.algorithm_id} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                  <p className="font-semibold text-sm">
                    {r.algorithm_name}: <span className="uppercase text-sky-300">{r.recommended_side}</span>
                  </p>
                  <p className="text-xs text-zinc-400">
                    Sure {Math.round((r.confidence || 0) * 100)}% · Edge {((r.expected_value || 0) * 100).toFixed(1)}%
                  </p>
                  <p className="text-sm text-zinc-300">{r.reasoning}</p>
                  <button type="button" className="btn-ghost text-sm w-full" onClick={() => saveResult(r)}>
                    Save this pick
                  </button>
                </div>
              ))}
            </div>
          )}
          {toolResults.length > 0 && picks.length === 0 && (
            <p className="text-sm text-zinc-400">Tools ran — no strong edge (they passed).</p>
          )}
        </div>

        {/* AI chat */}
        <div className="card space-y-3">
          <p className="font-semibold">AI on this game</p>
          <p className="hint text-xs">Ask what the tools mean, or get a plain-English best bet.</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {chatLog.length === 0 && (
              <p className="text-sm text-zinc-500">Tap “Run all” above, or type a question.</p>
            )}
            {chatLog.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2 text-sm ${m.role === 'you' ? 'bg-sky-500/15 text-sky-100 ml-6' : 'bg-white/5 text-zinc-200 mr-4'}`}
              >
                {m.text}
              </div>
            ))}
            {chatBusy && <p className="text-xs text-zinc-500">AI thinking…</p>}
          </div>
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              placeholder="e.g. What’s the best side and why?"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-500/50"
            />
            <button type="button" className="btn-primary shrink-0" disabled={chatBusy || !chatInput.trim()} onClick={sendChat}>
              Send
            </button>
          </div>
        </div>

        {/* Props */}
        <div className="card space-y-3">
          <p className="font-semibold">Player bets</p>
          {propsLoading && <p className="text-sm text-zinc-500">Loading…</p>}
          {propsNote && <p className="text-[11px] text-zinc-500">{propsNote}</p>}
          {propsList.slice(0, 30).map((prop: any) => (
            <div key={prop.id || `${prop.player}-${prop.line}`} className="rounded-xl border border-white/10 p-3 space-y-2">
              <div className="flex justify-between">
                <div>
                  <p className="font-semibold">{prop.player}</p>
                  <p className="text-xs text-zinc-500">
                    {prop.market_label || prop.market} · {prop.book}
                  </p>
                </div>
                <p className="text-lg font-bold text-sky-300 odds-num">{prop.line}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2" onClick={() => saveProp(prop, 'over')}>
                  Over {oddsLabel(prop.over)}
                </button>
                <button type="button" className="rounded-xl border border-rose-500/30 bg-rose-500/10 py-2" onClick={() => saveProp(prop, 'under')}>
                  Under {oddsLabel(prop.under)}
                </button>
              </div>
            </div>
          ))}
        </div>

        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-sky-500 text-black px-4 py-2 rounded-full text-sm font-semibold">
            {toast}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3.5 pb-8">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SPORTS.map((s) => (
          <button key={s} type="button" onClick={() => setSport(s)} className={`chip ${sport === s ? 'chip-on' : 'chip-off'}`}>
            {s}
          </button>
        ))}
      </div>
      {source ? <p className="text-xs text-emerald-400/90">Live: {source}</p> : null}
      {note ? <p className="text-xs text-zinc-500">{note}</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {loading ? <p className="text-center text-zinc-500 py-12 text-sm">Loading games…</p> : null}

      <div className="space-y-2.5">
        {games.map((g) => {
          const books = g.books || {}
          const fd = books.fanduel
          const dk = books.draftkings
          return (
            <button key={g.id} type="button" onClick={() => openGame(g)} className="card w-full text-left space-y-2">
              <p className="font-semibold text-[15px]">
                {g.away_team} <span className="text-zinc-500 font-normal">at</span> {g.home_team}
              </p>
              <p className="text-xs text-zinc-300">
                <span className="text-sky-400 font-semibold">{g.sport || sport}</span>
                <span className="mx-1.5 text-zinc-600">·</span>
                {formatWhen(g.start_time || g.commence_time)}
              </p>
              <div className="flex flex-wrap gap-2">
                {fd && (
                  <span className="text-[11px] rounded-lg bg-sky-500/15 text-sky-300 px-2 py-1">
                    FD {oddsLabel(fd.ml_home)}/{oddsLabel(fd.ml_away)}
                  </span>
                )}
                {dk && (
                  <span className="text-[11px] rounded-lg bg-emerald-500/15 text-emerald-300 px-2 py-1">
                    DK {oddsLabel(dk.ml_home)}/{oddsLabel(dk.ml_away)}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
