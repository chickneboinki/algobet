import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)

  useEffect(() => {
    Promise.all([api.settings(), api.health()])
      .then(([s, h]) => { setSettings(s); setHealth(h) })
      .catch(console.error)
  }, [])

  const save = async (patch: any) => {
    setSettings(await api.updateSettings(patch))
  }

  if (!settings) return <p className="text-zinc-400 text-center py-10">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="font-semibold text-lg">Is everything connected?</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <span className="text-zinc-300">AI helper (OpenRouter)</span>
            <span className={health?.openrouter_configured ? 'text-green-400 font-medium' : 'text-amber-400'}>
              {health?.openrouter_configured ? 'Ready ✓' : 'Not set'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <span className="text-zinc-300">Live odds</span>
            <span className={health?.odds_api_configured ? 'text-green-400 font-medium' : 'text-amber-400'}>
              {health?.odds_api_configured ? 'Live ✓' : 'Using sample games'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-zinc-300">Saved bets (Supabase)</span>
            <span className="text-green-400 font-medium">Connected ✓</span>
          </div>
        </div>
      </div>

      <div className="card space-y-3 border-[#00BFFF]/30">
        <h2 className="font-semibold text-lg">Get free live odds (step by step)</h2>
        <p className="hint">
          Right now you see sample games. A free key from The Odds API unlocks real lines.
        </p>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-[#00BFFF] text-black font-bold flex items-center justify-center text-sm">1</span>
            <div>
              <p className="font-medium">Open the website</p>
              <a href="https://the-odds-api.com/" target="_blank" rel="noreferrer" className="text-[#00BFFF] underline break-all">the-odds-api.com</a>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-[#00BFFF] text-black font-bold flex items-center justify-center text-sm">2</span>
            <div>
              <p className="font-medium">Click Get API Key or Start</p>
              <p className="hint text-xs mt-0.5">Sign up with your email. Free plan is fine.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-[#00BFFF] text-black font-bold flex items-center justify-center text-sm">3</span>
            <div>
              <p className="font-medium">Copy the long key they email you</p>
              <p className="hint text-xs mt-0.5">It looks like a random string of letters and numbers.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-[#00BFFF] text-black font-bold flex items-center justify-center text-sm">4</span>
            <div>
              <p className="font-medium">Paste it into Vercel</p>
              <p className="hint text-xs mt-0.5">Open Vercel → algobet → Settings → Environment Variables. Add name ODDS_API_KEY and paste your key. Apply to Production + Preview.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-[#00BFFF] text-black font-bold flex items-center justify-center text-sm">5</span>
            <div>
              <p className="font-medium">Redeploy once</p>
              <p className="hint text-xs mt-0.5">Vercel → Deployments → latest → Redeploy. Then refresh the app.</p>
            </div>
          </li>
        </ol>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Auto-watch settings</h2>
        <label className="flex items-center justify-between text-sm py-1">
          <span>Turn auto-watch on</span>
          <input type="checkbox" checked={!!settings.auto_watch_enabled} onChange={(e) => save({ auto_watch_enabled: e.target.checked })} className="w-5 h-5 accent-[#00BFFF]" />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Minimum how sure to alert (0–1)</span>
          <input type="number" step={0.05} min={0} max={1} value={settings.min_confidence_to_alert ?? 0.62}
            onChange={(e) => save({ min_confidence_to_alert: Number(e.target.value) })}
            className="mt-1.5 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5" />
        </label>
      </div>
    </div>
  )
}
