import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { loadSession, saveSession, authRequest } from '../lib/auth'

const ALL_LEAGUES = ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL']

const DEFAULT_WEBHOOK =
  'https://discord.com/api/webhooks/1564027144898871338/Vu_tPC5-u5IniRiqO4CPCJuonZ9nAz459-xzvUxKd4asb4MtxYxbCHtsJ9awTKAlca7S'

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const [testing, setTesting] = useState(false)

  // notify config
  const [mode, setMode] = useState<'single' | 'per_league'>('single')
  const [defaultWebhook, setDefaultWebhook] = useState(DEFAULT_WEBHOOK)
  const [leagueHooks, setLeagueHooks] = useState<Record<string, string>>({})
  const [multiOpen, setMultiOpen] = useState(false)
  const [leagues, setLeagues] = useState<string[]>([...ALL_LEAGUES])
  const [hourCt, setHourCt] = useState(6)

  // auth
  const [session, setSession] = useState(loadSession())
  const [authUser, setAuthUser] = useState('')
  const [authPass, setAuthPass] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  useEffect(() => {
    Promise.all([api.settings().catch(() => null), api.health().catch(() => null)]).then(([s, h]) => {
      setSettings(s || {})
      setHealth(h)
      const cfg = s?.notify_config || {}
      if (cfg.mode === 'per_league') {
        setMode('per_league')
        setMultiOpen(true)
      }
      setDefaultWebhook(cfg.default_webhook || s?.discord_webhook || DEFAULT_WEBHOOK)
      setLeagueHooks(cfg.league_webhooks || {})
      if (Array.isArray(cfg.auto_post_leagues) && cfg.auto_post_leagues.length) setLeagues(cfg.auto_post_leagues)
      if (cfg.auto_post_hour_ct != null) setHourCt(Number(cfg.auto_post_hour_ct))
    })
  }, [])

  const toggleLeague = (L: string) => {
    setLeagues((prev) => (prev.includes(L) ? prev.filter((x) => x !== L) : [...prev, L]))
  }

  const saveNotify = async () => {
    setMsg('')
    const notify_config = {
      mode,
      default_webhook: defaultWebhook.trim(),
      league_webhooks: mode === 'per_league' ? leagueHooks : {},
      auto_post_leagues: leagues,
      auto_post_hour_ct: hourCt,
    }
    try {
      const s = await api.updateSettings({
        discord_webhook: defaultWebhook.trim(),
        notify_config,
      })
      setSettings(s)
      setMsg('Saved. Daily posts use these settings (server cron ~6 AM CT on Hobby plan).')
    } catch (e: any) {
      setMsg(
        e.message ||
          'Save failed. In Supabase run: alter table app_settings add column if not exists notify_config jsonb; alter table app_settings add column if not exists discord_webhook text;'
      )
    }
  }

  const useOneChannel = () => {
    setMode('single')
    setMultiOpen(false)
    setMsg('Switched to one channel for all leagues. Tap Save settings.')
  }

  const testSend = async () => {
    setTesting(true)
    setMsg('')
    try {
      const r = await api.notifyDiscord({
        webhook_url: mode === 'single' ? defaultWebhook.trim() : undefined,
        title: 'HelpBet · Test post',
        content: 'Test from Setup',
        leagues,
      })
      setMsg(r.ok ? `Posted OK (${r.picks ?? 0} picks)` : r.error || 'Done')
    } catch (e: any) {
      setMsg(e.message || 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  const doAuth = async (action: 'login' | 'register') => {
    setAuthBusy(true)
    setMsg('')
    try {
      const r = await authRequest(action, authUser, authPass)
      const s = { username: r.username, token: r.token }
      saveSession(s)
      setSession(s)
      setMsg(action === 'register' ? 'Account created — you stay logged in on this phone' : 'Logged in')
      setAuthPass('')
    } catch (e: any) {
      setMsg(e.message || 'Auth failed')
    } finally {
      setAuthBusy(false)
    }
  }

  const logout = () => {
    saveSession(null)
    setSession(null)
    setMsg('Logged out')
  }

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h2 className="page-title">Setup</h2>
        <p className="hint mt-1">Discord posts, leagues, schedule, and your account.</p>
      </div>

      {msg && <div className="card text-sm text-sky-300">{msg}</div>}

      {/* Account */}
      <div className="card space-y-3">
        <h3 className="font-semibold">Account</h3>
        <p className="hint text-xs">Username + password only. Stays signed in on this device (no email codes).</p>
        {session ? (
          <div className="flex items-center justify-between">
            <p className="text-sm">
              Signed in as <span className="text-sky-300 font-medium">{session.username}</span>
            </p>
            <button type="button" className="btn-ghost text-sm" onClick={logout}>
              Log out
            </button>
          </div>
        ) : (
          <>
            <input
              value={authUser}
              onChange={(e) => setAuthUser(e.target.value)}
              placeholder="Username"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
              autoComplete="username"
            />
            <input
              type="password"
              value={authPass}
              onChange={(e) => setAuthPass(e.target.value)}
              placeholder="Password"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1" disabled={authBusy} onClick={() => doAuth('login')}>
                Log in
              </button>
              <button type="button" className="btn-ghost flex-1" disabled={authBusy} onClick={() => doAuth('register')}>
                Create account
              </button>
            </div>
          </>
        )}
      </div>

      {/* Webhook */}
      <div className="card space-y-3">
        <h3 className="font-semibold">Discord webhook</h3>
        <p className="hint text-xs">Main channel URL. Your webhook is already filled in.</p>
        <input
          value={defaultWebhook}
          onChange={(e) => setDefaultWebhook(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs"
        />

        {!multiOpen ? (
          <button
            type="button"
            className="btn-ghost w-full text-sm"
            onClick={() => {
              setMultiOpen(true)
              setMode('per_league')
            }}
          >
            Different channels per league…
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-white/10 p-3">
            <p className="text-sm text-zinc-300">Each league can post to its own webhook. Leave blank to use the main one.</p>
            {ALL_LEAGUES.map((L) => (
              <label key={L} className="block text-xs">
                <span className="text-zinc-400 font-semibold">{L}</span>
                <input
                  value={leagueHooks[L] || ''}
                  onChange={(e) => setLeagueHooks((prev) => ({ ...prev, [L]: e.target.value }))}
                  placeholder="Webhook URL (optional)"
                  className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs"
                />
              </label>
            ))}
            <button type="button" className="btn-ghost w-full text-sm" onClick={useOneChannel}>
              Revert to one channel for everything
            </button>
          </div>
        )}
      </div>

      {/* Schedule + leagues */}
      <div className="card space-y-3">
        <h3 className="font-semibold">Auto-post</h3>
        <p className="hint text-xs">
          Preferred time is Central. Vercel free plan runs <strong className="text-zinc-300">once daily ~6 AM CT</strong>{' '}
          (we store your preferred hour for when you upgrade).
        </p>
        <label className="block text-sm">
          <span className="text-zinc-400">Preferred hour (Central, 0–23)</span>
          <input
            type="number"
            min={0}
            max={23}
            value={hourCt}
            onChange={(e) => setHourCt(Number(e.target.value))}
            className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5"
          />
        </label>
        <p className="text-xs text-zinc-500">Leagues to include in auto / Send:</p>
        <div className="flex flex-wrap gap-2">
          {ALL_LEAGUES.map((L) => (
            <button key={L} type="button" className={`chip ${leagues.includes(L) ? 'chip-on' : 'chip-off'}`} onClick={() => toggleLeague(L)}>
              {L}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={saveNotify}>
          Save settings
        </button>
        <button type="button" className="btn-ghost flex-1" disabled={testing} onClick={testSend}>
          {testing ? 'Sending…' : 'Test post'}
        </button>
      </div>

      <div className="card space-y-2">
        <h3 className="font-semibold text-sm">Connections</h3>
        <p className="text-sm flex justify-between">
          <span className="text-zinc-400">AI</span>
          <span className={health?.openrouter_configured ? 'text-emerald-400' : 'text-amber-400'}>
            {health?.openrouter_configured ? 'Ready' : 'Not set'}
          </span>
        </p>
        <p className="text-sm flex justify-between">
          <span className="text-zinc-400">Odds API</span>
          <span className={health?.odds_api_configured ? 'text-emerald-400' : 'text-amber-400'}>
            {health?.odds_api_configured ? 'Live' : 'Fallback feeds'}
          </span>
        </p>
        <Link to="/" className="text-sky-400 text-sm">
          ← Back to Best
        </Link>
      </div>
    </div>
  )
}
