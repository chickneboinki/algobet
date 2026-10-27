import { supabase } from './supabase'
import { loadSession } from '../lib/auth'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  }
  const res = await fetch(`/api${path}`, { ...options, headers })
  const text = await res.text()
  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text }
  }
  if (!res.ok) throw new Error(data.error || text || res.statusText)
  return data as T
}

function authHeaders(): Record<string, string> {
  const s = loadSession()
  if (!s?.token) return {}
  return { Authorization: `Bearer ${s.token}` }
}

export const api = {
  health: () => req<any>('/health'),
  games: (sport?: string) =>
    req<{ source: string; games: any[]; note?: string }>(`/games${sport ? `?sport=${sport}` : ''}`),
  betDays: () => req<{ days: any[]; timezone: string }>('/games?days=1'),
  algorithms: () => req<any[]>('/algorithms'),
  runAlgo: (algorithm_id: string, game: any) =>
    req<any>('/algorithms', { method: 'POST', body: JSON.stringify({ algorithm_id, game }) }),
  bestBets: (opts?: { min_confidence?: number; limit?: number; persist?: boolean }) => {
    const q = new URLSearchParams()
    if (opts?.min_confidence != null) q.set('min_confidence', String(opts.min_confidence))
    if (opts?.limit != null) q.set('limit', String(opts.limit))
    if (opts?.persist) q.set('persist', '1')
    const s = q.toString()
    return req<any>(`/best-bets${s ? `?${s}` : ''}`)
  },
  autoSettle: () => req<any>('/settle', { method: 'POST', body: '{}' }),
  notifyDiscord: (opts?: {
    webhook_url?: string
    title?: string
    content?: string
    leagues?: string[]
    username?: string
    dates?: string[]
  }) => {
    const session = loadSession()
    return req<any>('/notify', {
      method: 'POST',
      body: JSON.stringify({
        ...opts,
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
      // retry with token in query if header stripped
      if (session?.token) {
        return req<any>(`/user-settings?token=${encodeURIComponent(session.token)}`)
      }
      throw e
    })
  },
  saveUserSettings: (patch: any) => {
    const session = loadSession()
    return req<any>('/user-settings', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...patch, token: session?.token }),
    })
  },
  teamStats: (team: string, sport = 'NBA') =>
    req<any>(`/stats?team=${encodeURIComponent(team)}&sport=${encodeURIComponent(sport)}`),
  playerProps: (opts: { sport: string; eventId?: string; home?: string; away?: string }) => {
    const q = new URLSearchParams()
    q.set('sport', opts.sport)
    if (opts.eventId) q.set('eventId', opts.eventId)
    if (opts.home) q.set('home', opts.home)
    if (opts.away) q.set('away', opts.away)
    return req<{ source: string; props: any[]; note?: string }>(`/props?${q.toString()}`)
  },
  generate: (prompt: string, sports: string[] = []) =>
    req<any>('/ai', { method: 'POST', body: JSON.stringify({ action: 'generate', prompt, sports }) }),
  analyze: (summary: string) =>
    req<any>('/ai', { method: 'POST', body: JSON.stringify({ action: 'analyze', summary }) }),
  chatGame: (game: any, tool_results: any[], message?: string) =>
    req<any>('/ai', {
      method: 'POST',
      body: JSON.stringify({ action: 'chat_game', game, tool_results, message }),
    }),

  async bets() {
    const session = loadSession()
    let q = supabase.from('bets').select('*').order('placed_at', { ascending: false })
    if (session?.username) q = q.eq('username', session.username)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },
  async trackBet(body: any) {
    const session = loadSession()
    const primary: Record<string, any> = {}
    for (const k of [
      'game_id',
      'sport',
      'home_team',
      'away_team',
      'algorithm_id',
      'algorithm_name',
      'recommended_side',
      'confidence',
      'expected_value',
      'stake_units',
      'odds_taken',
      'notes',
      'placed_at',
      'status',
      'profit_units',
    ]) {
      if (body[k] !== undefined && body[k] !== null) primary[k] = body[k]
    }
    if (session?.username) primary.username = session.username
    if (!primary.recommended_side && body.side) primary.recommended_side = body.side
    if (!primary.status) primary.status = 'pending'
    if (!primary.placed_at) primary.placed_at = new Date().toISOString()
    if (primary.stake_units == null) primary.stake_units = 1
    const { data, error } = await supabase.from('bets').insert(primary).select().single()
    if (error) throw error
    return data
  },
  async settleBet(id: string, status: string, profit_units: number) {
    const { data, error } = await supabase.from('bets').update({ status, profit_units }).eq('id', id).select().single()
    if (error) throw error
    return data
  },
  async deleteBet(id: string) {
    const { error } = await supabase.from('bets').delete().eq('id', id)
    if (error) throw error
  },
  async settings() {
    try {
      return await this.userSettings()
    } catch {
      return {
        discord_webhook: null,
        notify_config: {
          mode: 'single',
          default_webhook: '',
          league_webhooks: {},
          auto_post_leagues: ['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL'],
          auto_post_hour_ct: 6,
        },
      }
    }
  },
  async updateSettings(patch: any) {
    return this.saveUserSettings(patch)
  },
  async listCustomTools() {
    const session = loadSession()
    let q = supabase.from('custom_tools').select('*').order('created_at', { ascending: false })
    if (session?.username) q = q.eq('username', session.username)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },
  async saveCustomTool(tool: any) {
    const session = loadSession()
    const row = {
      name: tool.name,
      description: tool.description || tool.explanation || '',
      sports: tool.sports || [],
      prompt: tool.prompt || '',
      suggested_code: tool.suggested_code || '',
      meta: { explanation: tool.explanation, key_features: tool.key_features || [] },
      username: session?.username || null,
      created_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('custom_tools').insert(row).select().single()
    if (error) throw error
    return data
  },
  async renameCustomTool(id: string, name: string) {
    const { data, error } = await supabase.from('custom_tools').update({ name }).eq('id', id).select().single()
    if (error) throw error
    return data
  },
  async deleteCustomTool(id: string) {
    const { error } = await supabase.from('custom_tools').delete().eq('id', id)
    if (error) throw error
  },
}
