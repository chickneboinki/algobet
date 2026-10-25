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
  games: (sport?: string) => req<{ source: string; games: any[] }>(`/games${sport ? `?sport=${sport}` : ''}`),
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
  teamStats: (team: string, sport = 'NBA') =>
    req<any>(`/stats?team=${encodeURIComponent(team)}&sport=${encodeURIComponent(sport)}`),
  generate: (prompt: string, sports: string[] = []) =>
    req<any>('/ai', { method: 'POST', body: JSON.stringify({ action: 'generate', prompt, sports }) }),
  analyze: (summary: string) =>
    req<any>('/ai', { method: 'POST', body: JSON.stringify({ action: 'analyze', summary }) }),

  async bets() {
    const { data, error } = await supabase.from('bets').select('*').order('placed_at', { ascending: false })
    if (error) throw error
    return data || []
  },
  async trackBet(body: any) {
    const { data, error } = await supabase.from('bets').insert(body).select().single()
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
}
