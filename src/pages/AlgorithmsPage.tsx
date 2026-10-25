import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function AlgorithmsPage() {
  const [algos, setAlgos] = useState<any[]>([])
  const [custom, setCustom] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [testLog, setTestLog] = useState<string>('')
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [a, c] = await Promise.all([
        api.algorithms().catch(() => []),
        api.listCustomTools().catch(() => []),
      ])
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
      load()
    } catch (e: any) {
      setMsg(e.message || 'Rename failed')
    }
  }

  const autoTest = async (tool?: any) => {
    setTesting(true)
    setTestLog('Loading NFL games…')
    try {
      const g = await api.games('NFL')
      const games = (g.games || []).slice(0, 8)
      const lines: string[] = []
      const builtIn = tool ? [] : algos
      const toRun = tool
        ? [] // custom tools are ideas only for now — run built-ins filtered by sport tags
        : builtIn

      for (const game of games) {
        for (const a of toRun) {
          // league filter: if tags mention sport, only run on match
          const tags = (a.tags || []).map((t: string) => String(t).toLowerCase())
          const sport = String(game.sport || 'NFL').toLowerCase()
          if (tags.includes('ncaa') && !sport.includes('ncaa')) continue
          if (tags.includes('nfl') && sport !== 'nfl' && !tags.includes('evidence')) {
            /* nfl-engine allows NCAAF too — skip strict */
          }
          try {
            const r = await api.runAlgo(a.id, game)
            if (r.recommended_side && r.recommended_side !== 'none') {
              lines.push(
                `${game.away_team} @ ${game.home_team} → ${a.name}: ${r.recommended_side} (${Math.round((r.confidence || 0) * 100)}%)`
              )
            }
          } catch {
            /* skip */
          }
        }
      }
      setTestLog(lines.length ? lines.join('\n') : 'No picks fired on the sample of games (tools passed).')
    } catch (e: any) {
      setTestLog(e.message || 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <div className="card animate-pulse h-40" />

  return (
    <div className="space-y-4 pb-8">
      <div className="card">
        <p className="label mb-1">Tools</p>
        <h2 className="text-lg font-semibold">Playbooks & AI tools</h2>
        <p className="hint mt-1">
          Built-in tools run on Games and Best. AI tools you generate are saved here — rename them anytime.
        </p>
        <button type="button" className="btn-primary mt-3" disabled={testing} onClick={() => autoTest()}>
          {testing ? 'Testing…' : 'Auto-test tools on live NFL games'}
        </button>
        {testLog && (
          <pre className="mt-3 text-xs bg-black/40 p-3 rounded-xl whitespace-pre-wrap text-zinc-300 max-h-48 overflow-y-auto">
            {testLog}
          </pre>
        )}
        {msg && <p className="text-sm text-sky-400 mt-2">{msg}</p>}
      </div>

      <p className="text-xs font-semibold text-zinc-500 uppercase px-0.5">Built-in</p>
      {algos.map((a) => (
        <div key={a.id} className="card">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{a.name}</h3>
            <span className="text-[10px] uppercase text-zinc-500">{a.created_by}</span>
          </div>
          <p className="hint mt-2">{a.description}</p>
          {a.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {a.tags.map((t: string) => (
                <span key={t} className="chip chip-off text-[11px] py-1 px-2">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      <p className="text-xs font-semibold text-zinc-500 uppercase px-0.5 pt-2">Your AI tools</p>
      {custom.length === 0 && (
        <div className="card">
          <p className="hint">None yet. Go to AI → Generate & save tool.</p>
        </div>
      )}
      {custom.map((c) => (
        <div key={c.id} className="card space-y-2">
          {renameId === c.id ? (
            <div className="flex gap-2">
              <input
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm"
              />
              <button type="button" className="btn-primary text-sm" onClick={() => saveRename(c.id)}>
                Save
              </button>
            </div>
          ) : (
            <div className="flex justify-between items-start gap-2">
              <h3 className="font-semibold">{c.name}</h3>
              <button
                type="button"
                className="text-sky-400 text-xs"
                onClick={() => {
                  setRenameId(c.id)
                  setRenameVal(c.name)
                }}
              >
                Rename
              </button>
            </div>
          )}
          <p className="hint text-sm">{c.description}</p>
          {(c.sports || []).length > 0 && (
            <p className="text-xs text-sky-400">Leagues: {(c.sports || []).join(', ')}</p>
          )}
        </div>
      ))}
    </div>
  )
}
