import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)

  useEffect(() => {
    Promise.all([api.settings(), api.health()]).then(([s, h]) => { setSettings(s); setHealth(h) }).catch(console.error)
  }, [])

  const save = async (patch: any) => {
    setSettings(await api.updateSettings(patch))
  }

  if (!settings) return <p className="text-zinc-400 text-center py-10">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="font-semibold">API Status</h2>
        <div className="text-xs space-y-1">
          <div className="flex justify-between"><span className="text-zinc-400">OpenRouter</span>
            <span className={health?.openrouter_configured ? 'text-green-400' : 'text-amber-400'}>{health?.openrouter_configured ? 'Configured' : 'Add in Vercel env'}</span></div>
          <div className="flex justify-between"><span className="text-zinc-400">Odds API</span>
            <span className={health?.odds_api_configured ? 'text-green-400' : 'text-amber-400'}>{health?.odds_api_configured ? 'Live' : 'Mock data'}</span></div>
          <div className="flex justify-between"><span className="text-zinc-400">Supabase</span><span className="text-green-400">Connected</span></div>
        </div>
        <p className="text-xs text-zinc-500">Set OPENROUTER_API_KEY and ODDS_API_KEY in Vercel → Project → Settings → Environment Variables</p>
      </div>
      <div className="card space-y-3">
        <h2 className="font-semibold">Watcher</h2>
        <label className="flex items-center justify-between text-sm">
          <span>Enabled</span>
          <input type="checkbox" checked={!!settings.auto_watch_enabled} onChange={(e) => save({ auto_watch_enabled: e.target.checked })} className="w-5 h-5 accent-[#00BFFF]" />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Min confidence (0–1)</span>
          <input type="number" step={0.01} min={0} max={1} value={settings.min_confidence_to_alert ?? 0.62}
            onChange={(e) => save({ min_confidence_to_alert: Number(e.target.value) })}
            className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2" />
        </label>
      </div>
      <div className="card text-sm text-zinc-400 space-y-1">
        <div className="flex justify-between"><span>Version</span><span className="text-white">1.0.0</span></div>
        <div className="flex justify-between"><span>Host</span><span className="text-white">Vercel + Supabase</span></div>
      </div>
    </div>
  )
}
