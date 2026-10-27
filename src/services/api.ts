import { loadSession } from '../lib/auth'

const BASE = ''

async function req<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const text = await r.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text || r.statusText }
  }
  if (!r.ok) {
    const msg = data?.error || data?.message || text || r.statusText
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data as T
}

function authHeaders(): HeadersInit {
  const s = loadSession()
  return s?.token ? { Authorization: `Bearer ${s.token}` } : {}
}

export const api = {
  games: (sport = 'ALL') => req<any>(`/games?sport=${encodeURIComponent(sport)}`),
  betDays: () => req<{ days: any[]; timezone: string }>('/games?days=1'),
  props: (gameId: string, sport?: string) =>
    req<any>(`/props?game_id=${encodeURIComponent(gameId)}${sport ? `&sport=${encodeURIComponent(sport)}` : ''}`),
  bestBets: (opts?: { min_confidence?: number; limit?: number; persist?: boolean }) => {
    const q = new URLSearchParams()
    if (opts?.min_confidence != null) q.set('min_confidence', String(opts.min_confidence))
    if (opts?.limit != null) q.set('limit', String(opts.limit))
    if (opts?.persist) q.set('persist', '1')
    const s = q.toString()
    return req<any>(`/best-bets${s ? `?${s}` : ''}`)
  },
  notifyDiscord: (opts?: {
    webhook_url?: string
    title?: string
    content?: string
    leagues?: string[]
    username?: string
    dates?: string[]
    force?: boolean
  }) => {
    const session = loadSession()
    return req<any>('/send-days', {
      method: 'POST',
      body: JSON.stringify({
        ...opts,
        // Explicit website Send always posts cards under headers (force)
        force: opts?.force !== false,
        username: opts?.username || session?.username,
        token: session?.token,
      }),
    })
  },
  userSettings: () => {
    const session = loadSession()
    return req<any>('/user-settings', {
      headers: authHeaders(),
      method: 'GET',
    }).catch(async (e) => {
      if (session?.token) {
        return req<any>(`/user-settings?token=${encodeURIComponent(session.token)}`)
      }
      throw e
    })
  },
  saveUserSettings: (body: any) =>
    req<any>('/user-settings', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    }),
  trackBet: (body: any) =>
    req<any>('/track-bet', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    }),
  myBets: () =>
    req<any>('/my-bets', {
      headers: authHeaders(),
    }),
}
