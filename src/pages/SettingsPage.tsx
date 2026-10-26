import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { loadSession, saveSession, authRequest } from '../lib/auth'
import { loadLocalWebhook, saveLocalWebhook } from '../lib/webhook'

const ALL_LEAGUES = ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL']

export default function SettingsPage() {
  const [msg, setMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [mode, setMode] = useState<'single' | 'per_league'>('single')
  const [defaultWebhook, setDefaultWebhook] = useState(() => loadLocalWebhook())
  const [leagueHooks, setLeagueHooks] = useState<Record<string, string>>({})
  const [multiOpen, setMultiOpen] = useState(false)
  const [leagues, setLeagues] = useState<string[]>([...ALL_LEAGUES])
  const [hourCt, setHourCt] = useState(6)
  const [session, setSession] = useState(loadSession())
  const [authUser, setAuthUser] = useState('')
  const [authPass, setAuthPass] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const loadSettings = async () => {
    // Always restore local backup first so the field never looks empty after refresh
    const local = loadLocalWebhook()
    if (local) setDefaultWebhook(local)

    if (!loadSession()) return
    try {
      const s = await api.userSettings()
      const cfg = s?.notify_config || {}
      if (cfg.mode === 'per_league') {
        setMode('per_league')
        setMultiOpen(true)
      }
      const fromAccount = s?.discord_webhook || cfg.default_webhook || ''
      if (fromAccount) {
        setDefaultWebhook(fromAccount)
        saveLocalWebhook(fromAccount)
      }
      setLeagueHooks(cfg.league_webhooks || {})
      if (Array.isArray(cfg.auto_post_leagues) && cfg.auto_post_leagues.length) setLeagues(cfg.auto_post_leagues)
      if (cfg.auto_post_hour_ct != null) setHourCt(Number(cfg.auto_post_hour_ct))
    } catch (e: any) {
      setMsg(e.message || 'Could not load account settings — local webhook still kept')
    }
  }

  useEffect(() => {
    loadSettings()
  }, [session?.username])

  const toggleLeague = (L: string) => {
    setLeagues((prev) => (prev.includes(L) ? prev.filter((x) => x !== L) : [...prev, L]))
  }

  const saveNotify = async () => {
    setMsg('')
    const wh = defaultWebhook.trim()
    saveLocalWebhook(wh)

    if (!loadSession()) {
      setMsg(wh ? 'Webhook saved on this phone. Log in to also save it to your account.' : 'Cleared local webhook')
      return
    }

    const notify_config = {
      mode,
      default_webhook: wh,
      league_webhooks: mode === 'per_league' ? leagueHooks : {},
      auto_post_leagues: leagues,
      auto_post_hour_ct: hourCt,
    }
    try {
      const saved = await api.saveUserSettings({
        discord_webhook: wh || null,
        notify_config,
      })
      if (saved?.discord_webhook) setDefaultWebhook(saved.discord_webhook)
      setMsg('Saved on this phone and to your account.')
    } catch (e: any) {
      setMsg((e.message || 'Account save failed') + ' — kept on this phone anyway.')
    }
  }

  const useOneChannel = () => {
    setMode('single')
    setMultiOpen(false)
    setMsg('One channel for all leagues. Tap Save.')
  }

  const testSend = async () => {
    const wh = defaultWebhook.trim()
    if (!wh.includes('discord.com/api/webhooks')) {
      setMsg('Paste your Discord webhook above first, then Save, then Send.')
      return
    }
    saveLocalWebhook(wh)
    setTesting(true)
    setMsg('')
    try {
      if (loadSession()) {
        try {
          await api.saveUserSettings({
            discord_webhook: wh,
            notify_config: {
              mode,
              default_webhook: wh,
              league_webhooks: mode === 'per_league' ? leagueHooks : {},
              auto_post_leagues: leagues,
              auto_post_hour_ct: hourCt,
            },
          })
        } catch {}
      }
      const r = await api.notifyDiscord({
        title: 'HelpBet · All bets',
        leagues,
        webhook_url: wh,
      })
      setMsg(r.ok ? `Posted — today ${r.today ?? 0} · tomorrow ${r.tomorrow ?? 0} cards` : r.error || 'Done')
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
      setMsg(
        action === 'register'
          ? 'Account created. Paste webhook → Save.'
          : 'Logged in'
      )
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
    // keep webhook on phone
    setMsg('Logged out (webhook stays on this phone)')
  }

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h2 className="page-title">Setup</h2>
        <p className="hint mt-1">Your account, your webhook, your bets. Nothing is shared.</p>
      </div>

      {msg && <div className="card text-sm text-sky-300">{msg}</div>}

      <div className="card space-y-3">
        <h3 className="font-semibold">Account</h3>
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
            />
            <input
              type="password"
              value={authPass}
              onChange={(e) => setAuthPass(e.target.value)}
              placeholder="Password"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
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

      <div className="card space-y-3">
        <h3 className="font-semibold">Your Discord webhook</h3>
        <p className="hint text-xs">Saved on this phone always. Also saved to account when logged in.</p>
        <input
          value={defaultWebhook}
          onChange={(e) => {
            setDefaultWebhook(e.target.value)
            saveLocalWebhook(e.target.value.trim())
          }}
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
            {ALL_LEAGUES.map((L) => (
              <label key={L} className="block text-xs">
                <span className="text-zinc-400 font-semibold">{L}</span>
                <input
                  value={leagueHooks[L] || ''}
                  onChange={(e) => setLeagueHooks((prev) => ({ ...prev, [L]: e.target.value }))}
                  placeholder="Webhook (optional)"
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

      <div className="card space-y-3">
        <h3 className="font-semibold">Auto-post</h3>
        <p className="hint text-xs">Daily ~6 AM CT · league colors · book buttons.</p>
        <label className="block text-sm">
          <span className="text-zinc-400">Preferred hour (Central)</span>
          <input
            type="number"
            min={0}
            max={23}
            value={hourCt}
            onChange={(e) => setHourCt(Number(e.target.value))}
            className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5"
          />
        </label>
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
          {testing ? 'Sending…' : 'Send all today'}
        </button>
      </div>

      <Link to="/" className="text-sky-400 text-sm block">
        ← Back to Best
      </Link>
    </div>
  )
}
