const KEY = 'helpbet_auth'

export type AuthSession = { username: string; token: string }

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const j = JSON.parse(raw)
    if (j?.username && j?.token) return j
  } catch {}
  return null
}

export function saveSession(s: AuthSession | null) {
  if (!s) localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, JSON.stringify(s))
}

export async function authRequest(action: 'login' | 'register', username: string, password: string) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, username, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data as { ok: boolean; username: string; token: string }
}
