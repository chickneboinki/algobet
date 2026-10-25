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

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const g = await api.games(sport)
      setGames(Array.isArray(g?.games) ? g.games : [])
      setSource(g?.source || '')
      setNote(g?.note || '')
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
      setTimeout(() => setToast(''), 2500)
    }
  }

  // ——— DETAIL (Games tab click) ———
  if (selected) {
    const books = selected.books || {}
    const bets = Array.isArray(selected.bets) ? selected.bets : []
    const when = formatWhen(selected.start_time || selected.commence_time)

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
          {selected.status ? <p className="text-xs text-zinc-500">{selected.status}</p> : null}
        </div>

        {/* On-site book lines — FanDuel / DraftKings */}
        <div className="card space-y-3">
          <p className="font-semibold">Live lines on this site</p>
          <p className="hint text-xs">Pulled from FanDuel and DraftKings — not a link away.</p>

          {Object.keys(books).length === 0 && bets.length === 0 && (
            <p className="text-sm text-zinc-400">No game lines for this matchup yet.</p>
          )}

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
                  <p className="font-bold odds-num text-base">{oddsLabel(b?.ml_home)}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{selected.home_team}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-2 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">Away ML</p>
                  <p className="font-bold odds-num text-base">{oddsLabel(b?.ml_away)}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{selected.away_team}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-2 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">Spread</p>
                  <p className="font-bold odds-num text-base">{b?.spread != null ? oddsLabel(b.spread) : '—'}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-2 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">Total O/U</p>
                  <p className="font-bold odds-num text-base">{b?.total != null ? b.total : '—'}</p>
                </div>
              </div>
            </div>
          ))}

          {bets.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase">All bets from books</p>
              {bets.map((bet: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{bet.selection}</p>
                    <p className="text-[11px] text-zinc-500">
                      {bet.book} · {bet.market}
                      {bet.line != null ? ` · ${bet.line}` : ''}
                    </p>
                  </div>
                  <p className="font-bold odds-num text-sky-300 shrink-0">{oddsLabel(bet.odds)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Player props on-site */}
        <div className="card space-y-3">
          <p className="font-semibold">Player bets (PrizePicks / Underdog)</p>
          <p className="hint text-xs">Shown here on AlgoBet — over/under lines pulled live.</p>
          {propsLoading && <p className="text-sm text-zinc-500">Loading player lines…</p>}
          {propsNote && <p className="text-[11px] text-zinc-500">{propsNote}</p>}
          {!propsLoading && propsList.length === 0 && (
            <p className="text-sm text-zinc-400">No player lines for this game filter right now.</p>
          )}
          <div className="space-y-2">
            {propsList.slice(0, 50).map((prop: any) => (
              <div
                key={prop.id || `${prop.player}-${prop.line}-${prop.market}`}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2"
              >
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{prop.player}</p>
                    <p className="text-xs text-zinc-500">
                      {prop.market_label || prop.market} · {prop.book || prop.source}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-sky-300 odds-num">{prop.line}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5"
                    onClick={() => saveProp(prop, 'over')}
                  >
                    <p className="text-[10px] uppercase text-emerald-400 font-semibold">Over / More</p>
                    <p className="font-bold odds-num text-emerald-300">{oddsLabel(prop.over)}</p>
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5"
                    onClick={() => saveProp(prop, 'under')}
                  >
                    <p className="text-[10px] uppercase text-rose-400 font-semibold">Under / Less</p>
                    <p className="font-bold odds-num text-rose-300">{oddsLabel(prop.under)}</p>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-sky-500 text-black px-4 py-2 rounded-full text-sm font-semibold">
            {toast}
          </div>
        )}
      </div>
    )
  }

  // ——— LIST ———
  return (
    <div className="space-y-3.5 pb-8">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SPORTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSport(s)}
            className={`chip ${sport === s ? 'chip-on' : 'chip-off'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {source ? <p className="text-xs text-emerald-400/90 px-0.5">Live: {source}</p> : null}
      {note ? <p className="text-xs text-zinc-500 px-0.5">{note}</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {loading ? <p className="text-center text-zinc-500 py-12 text-sm">Loading games…</p> : null}

      <div className="space-y-2.5">
        {games.map((g) => {
          const books = g.books || {}
          const fd = books.fanduel
          const dk = books.draftkings
          const when = formatWhen(g.start_time || g.commence_time)
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => openGame(g)}
              className="card w-full text-left space-y-2 active:scale-[0.99] transition"
            >
              <div>
                <p className="font-semibold text-[15px] leading-snug">
                  {g.away_team || 'Away'}
                  <span className="text-zinc-500 font-normal"> at </span>
                  {g.home_team || 'Home'}
                </p>
                <p className="text-xs text-zinc-300 mt-1.5">
                  <span className="text-sky-400 font-semibold">{g.sport || sport}</span>
                  <span className="mx-1.5 text-zinc-600">·</span>
                  {when}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {fd && (
                  <span className="text-[11px] rounded-lg bg-sky-500/15 text-sky-300 px-2 py-1 font-medium">
                    FD {oddsLabel(fd.ml_home)}/{oddsLabel(fd.ml_away)}
                    {fd.total != null ? ` O/U ${fd.total}` : ''}
                  </span>
                )}
                {dk && (
                  <span className="text-[11px] rounded-lg bg-emerald-500/15 text-emerald-300 px-2 py-1 font-medium">
                    DK {oddsLabel(dk.ml_home)}/{oddsLabel(dk.ml_away)}
                    {dk.total != null ? ` O/U ${dk.total}` : ''}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {!loading && games.length === 0 && !error && (
        <div className="card text-center py-10">
          <p className="font-medium">No games loaded</p>
          <p className="hint mt-1">Try NFL</p>
        </div>
      )}
    </div>
  )
}
