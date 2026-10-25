import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { algoInfo, PLAYER_TOOLS } from '../lib/algoInfo'

export default function AlgorithmsPage() {
  const [algos, setAlgos] = useState<any[]>([])
  const [custom, setCustom] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [testLog, setTestLog] = useState('')
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [a, c] = await Promise.all([api.algorithms().catch(() => []), api.listCustomTools().catch(() => [])])
      setAlgos(Array.isArray(a) ? a : [])
      setCustom(Array.isArray(c) ? c : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const saveRename = async (id: string) => {
    if (!renameVal.trim()) return
    try {
      await api.renameCustomTool(id, renameVal.trim())
      setRenameId(null)
      setMsg('Renamed')
      setTimeout(() => setMsg(''), 2000)
      load()
    } catch (e: any) {
      setMsg(e.message || 'Rename failed')
    }
  }

  const autoTest = async () => {
    setTesting(true)
    setTestLog('Loading live NFL games…')
    try {
      const g = await api.games('NFL')
      const games = (g.games || []).slice(0, 8)
      const lines: string[] = []
      for (const game of games) {
        for (const a of algos) {
          try {
            const r = await api.runAlgo(a.id, game)
            if (r.recommended_side && r.recommended_side !== 'none') {
              const team = r.recommended_side === 'home' ? game.home_team : game.away_team
              lines.push(`${a.name} picks ${team} (${game.away_team} at ${game.home_team})`)
            }
          } catch {
            /* skip */
          }
        }
      }
      setTestLog(lines.length ? lines.join('\n') : 'No tool found a pick on these games. That is normal — tools pass when there is no edge.')
    } catch (e: any) {
      setTestLog(e.message || 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <div className="card animate-pulse h-40" />

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h2 className="page-title">Tools</h2>
        <p className="hint mt-1">
          Each tool is one simple idea. It looks at a game’s odds and either gives a pick or says “pass”. Tap a tool to
          see exactly when it picks.
        </p>
      </div>

      <section className="space-y-2.5">
        <p className="section-title">Built-in tools</p>
        {algos.map((a) => {
          const info = algoInfo(a.id)
          const isOpen = open === a.id
          return (
            <div key={a.id} className="card !p-0 overflow-hidden">
              <button
                type="button"
                className="w-full text-left p-4 flex items-start justify-between gap-3"
                onClick={() => setOpen(isOpen ? null : a.id)}
                aria-expanded={isOpen}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[15px]">{a.name}</p>
                  <p className="hint mt-1">{info?.what || a.description}</p>
                </div>
                <span className={`text-zinc-500 text-lg leading-none mt-0.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
              </button>
              {isOpen && info && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
                  <div>
                    <p className="label">Picks when</p>
                    <p className="text-sm text-zinc-200 mt-1">{info.picksWhen}</p>
                  </div>
                  <div>
                    <p className="label">Passes when</p>
                    <p className="text-sm text-zinc-200 mt-1">{info.skipsWhen}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className="pill">{info.leagues}</span>
                    <span className="pill">{info.style}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="space-y-2.5">
        <p className="section-title">Player bet tools</p>
        <p className="hint px-0.5">These run on their own inside every game’s Player bets section.</p>
        {PLAYER_TOOLS.map((t) => (
          <div key={t.name} className="card space-y-2">
            <p className="font-semibold text-[15px]">{t.name}</p>
            <p className="hint">{t.what}</p>
            <div>
              <p className="label">Picks when</p>
              <p className="text-sm text-zinc-200 mt-1">{t.picksWhen}</p>
            </div>
            <div>
              <p className="label">Strength</p>
              <p className="text-sm text-zinc-200 mt-1">{t.strength}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2.5">
        <p className="section-title">Your AI tools</p>
        {custom.length === 0 && (
          <div className="card">
            <p className="hint">None yet. Open the AI tab and describe a strategy to create one.</p>
          </div>
        )}
        {custom.map((c) => (
          <div key={c.id} className="card space-y-2">
            {renameId === c.id ? (
              <div className="flex gap-2">
                <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} className="flex-1 min-w-0" />
                <button type="button" className="btn-primary !w-auto px-4" onClick={() => saveRename(c.id)}>
                  Save
                </button>
              </div>
            ) : (
              <div className="flex justify-between items-start gap-3">
                <p className="font-semibold text-[15px]">{c.name}</p>
                <button
                  type="button"
                  className="text-sky-400 text-sm shrink-0 py-1"
                  onClick={() => {
                    setRenameId(c.id)
                    setRenameVal(c.name)
                  }}
                >
                  Rename
                </button>
              </div>
            )}
            <p className="hint">{c.description}</p>
            {(c.sports || []).length > 0 && <span className="pill">{(c.sports || []).join(', ')}</span>}
          </div>
        ))}
        {msg && <p className="text-sm text-sky-400">{msg}</p>}
      </section>

      <section className="card space-y-3">
        <div>
          <p className="font-semibold text-[15px]">Try them on live games</p>
          <p className="hint mt-1">Runs every tool on today’s NFL games and shows who they would pick.</p>
        </div>
        <button type="button" className="btn-ghost w-full" disabled={testing} onClick={autoTest}>
          {testing ? 'Testing…' : 'Run test'}
        </button>
        {testLog && (
          <pre className="text-xs bg-black/30 p-3 rounded-xl whitespace-pre-wrap text-zinc-300 max-h-52 overflow-y-auto font-sans leading-relaxed">
            {testLog}
          </pre>
        )}
      </section>
    </div>
  )
}
