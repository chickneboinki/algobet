import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  const [webhook, setWebhook] = useState('')
  const [msg, setMsg] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    Promise.all([api.settings(), api.health()])
      .then(([s, h]) => {
        setSettings(s)
        setHealth(h)
        if (s?.discord_webhook) setWebhook(s.discord_webhook)
      })
      .catch(console.error)
  }, [])

  const save = async (patch: any) => {
    setSettings(await api.updateSettings(patch))
  }

  const saveWebhook = async () => {
    try {
      await save({ discord_webhook: webhook.trim() })
      setMsg('Webhook saved — daily posts at ~6 AM Central + Send to channel on Best')
    } catch (e: any) {
      setMsg(
        e.message ||
          'Save failed. Add column: alter table app_settings add column if not exists discord_webhook text;'
      )
    }
  }

  const testSend = async () => {
    setTesting(true)
    setMsg('')
    try {
      const r = await api.notifyDiscord({
        webhook_url: webhook.trim() || undefined,
        title: 'HelpBet · Test post',
        content: 'Test from Setup',
      })
      setMsg(r.ok ? `Test OK — ${r.embeds_sent} embeds` : r.error || 'Done')
    } catch (e: any) {
      setMsg(e.message || 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  if (!settings) return <p className="text-zinc-400 text-center py-10 text-sm">Loading…</p>

  return (
    <div className="space-y-4 pb-8">
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
        <h2 className="text-lg font-semibold">Discord channel</h2>
        <p className="hint">
          Rich embeds: matchup, league, start time (Central), tool leans, and player bets. Posts daily ~6 AM Central and
          anytime you tap Send to channel on Best.
        </p>
        <ol className="hint text-xs space-y-1 list-decimal list-inside">
          <li>Discord channel → Edit channel → Integrations → Webhooks → New Webhook</li>
          <li>Copy webhook URL</li>
          <li>Paste below (or set DISCORD_WEBHOOK_URL in Vercel env)</li>
        </ol>
        <input
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
        />
        <div className="flex gap-2">
          <button type="button" className="btn-primary flex-1" onClick={saveWebhook}>
            Save webhook
          </button>
          <button type="button" className="btn-ghost flex-1" disabled={testing} onClick={testSend}>
            {testing ? 'Sending…' : 'Test post'}
          </button>
        </div>
        {msg && <p className="text-sm text-sky-400">{msg}</p>}
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Learning</h2>
        <p className="hint">
          Daily job auto-settles finished home/away bets from scores, then ranks tools higher when they win. Mark props
          won/lost on Bets if needed.
        </p>
        <label className="block text-sm">
          <span className="text-zinc-400">Minimum confidence to keep a pick (0–1)</span>
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
        <p className="label mb-1">Cron</p>
        <p className="hint">Vercel Hobby: one daily run at 11:00 UTC (~6 AM Central Daylight Time).</p>
      </div>
    </div>
  )
}
