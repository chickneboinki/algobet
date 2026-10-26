import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { loadSession, saveSession, authRequest } from '../lib/auth'
import { loadLocalWebhook, saveLocalWebhook } from '../lib/webhook'

const ALL_LEAGUES = ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL']

type DiscordBotInfo = {
  linked?: boolean
  discord_user_id?: string | null
  guild_id?: string | null
  channels?: { key: string; label: string; id: string }[]
  roles?: { key: string; label: string; id: string }[]
}

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
  const [discordBot, setDiscordBot] = useState<DiscordBotInfo | null>(null)

  const loadSettings = async () => {
    const local = loadLocalWebhook()
    if (local) setDefaultWebhook(local)

    if (!loadSession()) {
      setDiscordBot(null)
      return
    }
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
      setDiscordBot(s?.discord_bot || null)
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
      if (saved?.discord_bot) setDiscordBot(saved.discord_bot)
      setMsg(
        saved?.discord_bot?.channels?.length
          ? `Saved. Discord bot: ${saved.discord_bot.channels.length} channel(s), ${saved.discord_bot.roles?.length || 0} role(s) linked from /config.`
          : 'Saved on this phone and to your account.'
      )
    } catch (e: any) {
      setMsg(e.message || 'Save failed')
    }
  }

  const useOneChannel = () => {
    setMode('single')
    setMultiOpen(false)
    setLeagueHooks({})
  }

  const testSend = async () => {
    const hasBotChannels = (discordBot?.channels || []).some((c) => c.key.startsWith('ch_') || c.key === 'alerts')
    const wh = defaultWebhook.trim()
    if (!hasBotChannels && !wh.includes('discord.com/api/webhooks')) {
      setMsg('Link Discord with /login after /config, or paste a webhook first.')
      return
    }
    if (wh) saveLocalWebhook(wh)
    setTesting(true)
    setMsg('')
    try {
      if (loadSession()) {
        try {
          await api.saveUserSettings({
            discord_webhook: wh || null,
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
        webhook_url: wh || undefined,
      })
      if (r.ok) {
        setMsg(
          r.sent
            ? `Posted ${r.sent} pick(s) to Discord channels: ${(r.leagues || []).join(', ')} (roles pinged when set).`
            : r.message || 'Sent'
        )
      } else {
        setMsg(r.error || 'Send failed')
      }
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
          ? 'Account created. In Discord run /login with this username + password to link channels from /config.'
          : 'Logged in — loading Discord link…'
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
    setDiscordBot(null)
    setMsg('Logged out (webhook stays on this phone)')
  }

  const botChannels = discordBot?.channels || []
  const botRoles = discordBot?.roles || []
  const linked = Boolean(discordBot?.linked || discordBot?.discord_user_id)

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h2 className="page-title">Setup</h2>
        <p className="hint mt-1">
          Link Discord with /login so this page uses the same channels and roles you set with /config.
        </p>
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
        <h3 className="font-semibold">Discord bot channels & roles</h3>
        {!session ? (
          <p className="hint text-xs">Log in first, then run /login in Discord with the same username and password.</p>
        ) : !linked && !botChannels.length ? (
          <div className="space-y-2 text-xs text-zinc-400">
            <p>Not linked to Discord yet.</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>In Discord: /config — set each league channel + roles</li>
              <li>In Discord: /login username:… password:… (same as this site)</li>
              <li>Refresh this page — channels and roles appear here</li>
            </ol>
            <button type="button" className="btn-ghost text-sm" onClick={() => loadSettings()}>
              Refresh link status
            </button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-emerald-400">
              {linked ? 'Discord account linked' : 'Guild config loaded'}
              {discordBot?.guild_id ? ` · guild ${discordBot.guild_id}` : ''}
            </p>
            <div>
              <p className="text-xs text-zinc-400 mb-1 font-semibold">Channels from /config</p>
              {botChannels.length ? (
                <ul className="space-y-1 text-xs">
                  {botChannels.map((c) => (
                    <li key={c.key} className="flex justify-between gap-2 border border-white/5 rounded-lg px-2 py-1.5">
                      <span>{c.label}</span>
                      <span className="text-sky-300 font-mono">#{c.id}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint text-xs">No channels set yet — use /config in Discord.</p>
              )}
            </div>
            <div>
              <p className="text-xs text-zinc-400 mb-1 font-semibold">Roles (pinged on Send)</p>
              {botRoles.length ? (
                <ul className="space-y-1 text-xs">
                  {botRoles.map((r) => (
                    <li key={r.key} className="flex justify-between gap-2 border border-white/5 rounded-lg px-2 py-1.5">
                      <span>{r.label}</span>
                      <span className="text-sky-300 font-mono">@{r.id}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint text-xs">No roles set — use /setroles or /config.</p>
              )}
            </div>
            <p className="hint text-xs">
              When you click Send, picks go to each league channel and ping that league role (or All Sports).
            </p>
            <button type="button" className="btn-ghost text-sm" onClick={() => loadSettings()}>
              Refresh from Discord
            </button>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Backup webhook (optional)</h3>
        <p className="hint text-xs">Only used if bot channels are not linked. Prefer /config channels above.</p>
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
            Different webhooks per league…
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
          {testing ? 'Sending…' : 'Send to Discord'}
        </button>
      </div>

      <Link to="/" className="text-sky-400 text-sm block">
        ← Back to Best
      </Link>
    </div>
  )
}
