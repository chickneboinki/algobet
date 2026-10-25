import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)

  useEffect(() => {
    Promise.all([api.settings(), api.health()])
      .then(([s, h]) => {
        setSettings(s)
        setHealth(h)
      })
      .catch(console.error)
  }, [])

  const save = async (patch: any) => {
    setSettings(await api.updateSettings(patch))
  }

  if (!settings) return <p className="text-zinc-400 text-center py-10 text-sm">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="label">Setup</p>
        <h2 className="text-lg font-semibold">Connections</h2>
        <div className="space-y-0 text-sm">
          <div className="flex justify-between items-center py-2.5 border-b border-white/5">
            <span className="text-zinc-300">AI (OpenRouter)</span>
            <span className={health?.openrouter_configured ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
              {health?.openrouter_configured ? 'Ready' : 'Not set'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2.5 border-b border-white/5">
            <span className="text-zinc-300">Live odds</span>
            <span className={health?.odds_api_configured ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
              {health?.odds_api_configured ? 'Live' : 'Sample data'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2.5">
            <span className="text-zinc-300">Saved bets</span>
            <span className="text-emerald-400 font-medium">Connected</span>
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Free live odds</h2>
        <p className="hint">If you only see sample games, add a free key from The Odds API.</p>
        <ol className="space-y-3 text-sm">
          {[
            ['Open the-odds-api.com and start the free plan'],
            ['Copy the API key from their email'],
            ['In Vercel → algobet → Settings → Environment Variables, add ODDS_API_KEY'],
            ['Redeploy once, then refresh this app'],
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-sky-500 text-black font-bold flex items-center justify-center text-sm">
                {i + 1}
              </span>
              <p className="pt-1 text-zinc-300">{step[0]}</p>
            </li>
          ))}
        </ol>
        <a
          href="https://the-odds-api.com/"
          target="_blank"
          rel="noreferrer"
          className="book-badge text-sky-400 border-sky-500/30"
        >
          Open The Odds API
        </a>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Auto scan</h2>
        <p className="hint">Server runs ranked scans twice daily. You can also run a scan from the Watch screen.</p>
        <label className="flex items-center justify-between text-sm py-1">
          <span>Prefer auto-watch</span>
          <input
            type="checkbox"
            checked={!!(settings.auto_watch_enabled ?? settings.watcher_enabled)}
            onChange={(e) => save({ auto_watch_enabled: e.target.checked, watcher_enabled: e.target.checked })}
            className="w-5 h-5 accent-sky-500"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Minimum how sure to keep a pick (0–1)</span>
          <input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={settings.min_confidence_to_alert ?? 0.52}
            onChange={(e) => save({ min_confidence_to_alert: Number(e.target.value) })}
            className="mt-1.5 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5"
          />
        </label>
      </div>

      <div className="card-soft">
        <p className="label mb-1">Honest limits</p>
        <p className="hint">
          Free odds credits are limited. Player props and deep team stats need paid feeds. Tools use prices and book
          disagreement first; your tracked results train ranking weights over time.
        </p>
      </div>
    </div>
  )
}
