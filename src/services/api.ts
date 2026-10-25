import { supabase } from './supabase'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  })
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
  return res.json()
}

export const api = {
  health: () => req<any>('/health'),
  games: (sport?: string) => req<{ source: string; games: any[]; note?: string }>(`/games${sport ? `?sport=${sport}` : ''}`),
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
  notifyDiscord: (opts?: { webhook_url?: string; title?: string; content?: string; leagues?: string[] }) =>
    req<any>('/notify', { method: 'POST', body: JSON.stringify(opts || {}) }),
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
    const { data, error } = await supabase.from('bets').select('*').order('placed_at', { ascending: false })
    if (error) throw error
    return data || []
  },
  async trackBet(body: any) {
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
    if (!primary.recommended_side && body.side) primary.recommended_side = body.side
    if (!primary.status) primary.status = 'pending'
    if (!primary.placed_at) primary.placed_at = new Date().toISOString()
    if (primary.stake_units == null) primary.stake_units = 1

    let { data, error } = await supabase.from('bets').insert(primary).select().single()
    if (error && /column|schema cache/i.test(error.message || '')) {
      const minimal = {
        game_id: primary.game_id,
        sport: primary.sport,
        home_team: primary.home_team,
        away_team: primary.away_team,
        algorithm_id: primary.algorithm_id,
        algorithm_name: primary.algorithm_name,
        recommended_side: primary.recommended_side,
        status: primary.status || 'pending',
        placed_at: primary.placed_at,
        stake_units: primary.stake_units ?? 1,
      }
      const retry = await supabase.from('bets').insert(minimal).select().single()
      data = retry.data
      error = retry.error
    }
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
    const { data, error } = await supabase.from('app_settings').select('*').eq('id', 'default').single()
    if (error) throw error
    return data
  },
  async updateSettings(patch: any) {
    const { data, error } = await supabase
      .from('app_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', 'default')
      .select()
      .single()
    if (error) throw error
    return data
  },
  async watchLog() {
    const { data, error } = await supabase.from('watch_log').select('*').order('ts', { ascending: false }).limit(20)
    if (error) throw error
    return data || []
  },
  async addWatchLog(entry: any) {
    const { data, error } = await supabase.from('watch_log').insert(entry).select().single()
    if (error) throw error
    return data
  },
  async savedBestBets() {
    const { data, error } = await supabase.from('best_bets').select('*').order('score', { ascending: false }).limit(30)
    if (error) throw error
    return data || []
  },
  async listCustomTools() {
    const { data, error } = await supabase.from('custom_tools').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },
  async saveCustomTool(tool: any) {
    const row = {
      name: tool.name,
      description: tool.description || tool.explanation || '',
      sports: tool.sports || [],
      prompt: tool.prompt || '',
      suggested_code: tool.suggested_code || '',
      meta: { explanation: tool.explanation, key_features: tool.key_features || [] },
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
