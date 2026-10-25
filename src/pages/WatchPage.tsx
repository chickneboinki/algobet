import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function WatchPage() {
  const [log, setLog] = useState<any[]>([])
  const [running, setRunning] = useState(false)
  const [last, setLast] = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)

  async function refresh() {
    try {
      const [l, s] = await Promise.all([api.watchLog(), api.settings().catch(() => null)])
      setLog(l)
      setSettings(s)
    } catch (_) {}
  }

  useEffect(() => {
    refresh()
  }, [])

  async function runScan() {
    setRunning(true)
    try {
      const res = await api.bestBets({ min_confidence: 0.52, limit: 15, persist: true })
      setLast(res)
      await api.addWatchLog({
        message: `Manual scan: ${res.games_scanned} games, ${res.pick_count} ranked picks`,
        meta: { pick_count: res.pick_count, games_scanned: res.games_scanned },
      })
      await refresh()
    } catch (e: any) {
      alert(e.message || 'Scan failed')
    } finally {
      setRunning(false)
    }
  }

  async function toggleWatcher() {
    if (!settings) return
    try {
      const next = !(settings.watcher_enabled)
      const s = await api.updateSettings({ watcher_enabled: next })
      setSettings(s)
    } catch (e: any) {
      alert(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="label mb-1">Auto watch</p>
        <h2 className="text-lg font-semibold">Scan games for you</h2>
        <p className="hint mt-1">
          Runs all tools on live lines and saves ranked picks. Scheduled scans run twice a day on the server.
          You can also run one now.
        </p>
        <div className="flex gap-2 mt-4">
          <button type="button" className="btn-primary flex-1" disabled={running} onClick={runScan}>
            {running ? 'Scanning…' : 'Run scan now'}
          </button>
          <button type="button" className="btn-ghost" onClick={toggleWatcher}>
            {settings?.watcher_enabled ? 'Watcher on' : 'Watcher off'}
          </button>
        </div>
      </div>

      {last && (
        <div className="card">
          <p className="label mb-1">Last scan</p>
          <p className="text-sm">
            {last.games_scanned} games · {last.pick_count} picks
          </p>
          <p className="hint mt-1">Open the Best tab to see the ranked list.</p>
        </div>
      )}

      <div className="card">
        <p className="label mb-2">Activity</p>
        {log.length === 0 && <p className="hint">No scans yet.</p>}
        <ul className="space-y-2">
          {log.map((row) => (
            <li key={row.id} className="card-soft text-sm">
              <p>{row.message}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {row.ts ? new Date(row.ts).toLocaleString() : ''}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
