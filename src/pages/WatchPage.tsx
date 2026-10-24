import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function WatchPage() {
  const [settings, setSettings] = useState<any>(null)
  const [log, setLog] = useState<any[]>([])
  const [running, setRunning] = useState(false)
  const [last, setLast] = useState<any>(null)

  const load = async () => {
    try {
      const [s, l] = await Promise.all([api.settings(), api.watchLog()])
      setSettings(s); setLog(l)
    } catch (e) { console.error(e) }
  }
  useEffect(() => { load() }, [])

  const toggleWatch = async () => {
    if (!settings) return
    setSettings(await api.updateSettings({ auto_watch_enabled: !settings.auto_watch_enabled }))
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const [gamesRes, algos] = await Promise.all([api.games(), api.algorithms()])
      const games = gamesRes.games || []
      const sports = settings?.sports_to_watch || ['NFL', 'NBA', 'NCAAF']
      const algoIds = settings?.auto_run_algorithms || algos.map((a: any) => a.id)
      const minConf = settings?.min_confidence_to_alert ?? 0.55
      const filtered = games.filter((g: any) => sports.includes(g.sport))
      const alerts: any[] = []
      for (const game of filtered) {
        for (const aid of algoIds) {
          try {
            const r = await api.runAlgo(aid, game)
            if (r.recommended_side !== 'none' && r.confidence >= minConf) {
              alerts.push({
                matchup: `${game.away_abbr || game.away_team} @ ${game.home_abbr || game.home_team}`,
                sport: game.sport, algorithm: r.algorithm_name, side: r.recommended_side,
                confidence: r.confidence, expected_value: r.expected_value, reasoning: r.reasoning,
              })
            }
          } catch {}
        }
      }
      const entry = { source: gamesRes.source, games_scanned: filtered.length, alerts }
      await api.addWatchLog(entry)
      setLast({ ...entry, ts: new Date().toISOString() })
      await load()
    } catch (e: any) { alert(e.message) }
    finally { setRunning(false) }
  }

  if (!settings) return <p className="text-zinc-400 text-center py-10">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Auto Watcher</h2>
            <p className="text-xs text-zinc-400">Scans games and runs selected algorithms</p>
          </div>
          <button onClick={toggleWatch} className={`px-4 py-2 rounded-xl text-sm font-semibold ${settings.auto_watch_enabled ? 'bg-neon text-black' : 'bg-white/10 text-zinc-300'}`}>
            {settings.auto_watch_enabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="text-sm text-zinc-400 space-y-1">
          <div>Sports: {(settings.sports_to_watch || []).join(', ')}</div>
          <div>Min confidence: {Math.round((settings.min_confidence_to_alert || 0) * 100)}%</div>
        </div>
        <button onClick={runNow} disabled={running} className="btn-neon w-full disabled:opacity-50">
          {running ? 'Scanning…' : 'Run watch cycle now'}
        </button>
      </div>
      {last && (
        <div className="card border-neon/30 space-y-2">
          <div className="font-semibold text-neon">Last scan</div>
          <div className="text-sm">{last.games_scanned} games · {last.alerts?.length || 0} alerts</div>
          {(last.alerts || []).map((a: any, i: number) => (
            <div key={i} className="bg-black/40 rounded-xl p-3 text-sm">
              <div className="font-medium">{a.matchup} · {a.sport}</div>
              <div className="text-neon">{a.algorithm} → {String(a.side).toUpperCase()}</div>
              <div className="text-xs text-zinc-400">Conf {Math.round(a.confidence * 100)}% · EV {(a.expected_value * 100).toFixed(1)}%</div>
            </div>
          ))}
          {(!last.alerts || last.alerts.length === 0) && <p className="text-sm text-zinc-500">No alerts above threshold.</p>}
        </div>
      )}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-zinc-400">Watch log</h3>
        {log.slice(0, 8).map((entry: any) => (
          <div key={entry.id} className="card text-sm">
            <div className="flex justify-between text-zinc-400 text-xs">
              <span>{new Date(entry.ts).toLocaleString()}</span>
              <span>{entry.games_scanned} games · {(entry.alerts || []).length} alerts</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
