import { useState } from 'react'
import { api } from '../services/api'

export default function AILabPage() {
  const [prompt, setPrompt] = useState('')
  const [sports, setSports] = useState<string[]>(['NFL'])
  const [generating, setGenerating] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [generated, setGenerated] = useState<any>(null)
  const [saved, setSaved] = useState<any>(null)
  const [insight, setInsight] = useState<any>(null)
  const [error, setError] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  const toggleSport = (s: string) => {
    setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const generate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setError('')
    setSaved(null)
    setSaveMsg('')
    try {
      const out = await api.generate(prompt, sports)
      setGenerated(out)
      // Auto-save to Supabase custom_tools
      try {
        const row = await api.saveCustomTool({
          name: out.name || `AI: ${prompt.slice(0, 32)}`,
          description: out.description || out.explanation,
          sports: out.sports?.length ? out.sports : sports,
          prompt,
          suggested_code: out.suggested_code,
          explanation: out.explanation,
          key_features: out.key_features,
        })
        setSaved(row)
        setSaveMsg('Saved automatically to Tools. You can rename it there.')
      } catch (e: any) {
        setSaveMsg(
          `Generated, but auto-save failed: ${e.message || e}. Create a custom_tools table in Supabase if missing.`
        )
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setGenerating(false)
    }
  }

  const analyze = async () => {
    setAnalyzing(true)
    setError('')
    try {
      const bets = await api.bets()
      const settled = bets.filter((b: any) => b.status !== 'pending')
      const wins = settled.filter((b: any) => b.status === 'won').length
      const losses = settled.filter((b: any) => b.status === 'lost').length
      const units = settled.reduce((s: number, b: any) => s + (b.profit_units || 0), 0)
      const byTool: Record<string, { n: number; w: number }> = {}
      for (const b of settled) {
        const id = b.algorithm_name || b.algorithm_id || 'unknown'
        if (!byTool[id]) byTool[id] = { n: 0, w: 0 }
        byTool[id].n += 1
        if (b.status === 'won') byTool[id].w += 1
      }
      const toolLines = Object.entries(byTool)
        .map(([k, v]) => `${k}: ${v.w}-${v.n - v.w}`)
        .join('; ')
      const summary = `Total bets: ${bets.length}. Settled: ${settled.length} (wins ${wins}, losses ${losses}). Net units: ${units.toFixed(2)}. By tool: ${toolLines || 'none'}.`
      setInsight(await api.analyze(summary))
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="card space-y-3">
        <p className="label">AI Lab</p>
        <h2 className="text-lg font-semibold">Build a new tool</h2>
        <p className="hint">Describe a strategy. It saves automatically so you can rename it and test it on games.</p>
        <div className="flex flex-wrap gap-2">
          {['NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL'].map((s) => (
            <button key={s} type="button" className={`chip ${sports.includes(s) ? 'chip-on' : 'chip-off'}`} onClick={() => toggleSport(s)}>
              {s}
            </button>
          ))}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Example: NFL home underdogs when FanDuel is softer than DraftKings"
          className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm min-h-[120px] focus:outline-none focus:border-sky-500/50"
        />
        <button type="button" onClick={generate} disabled={generating || !prompt.trim()} className="btn-primary disabled:opacity-50">
          {generating ? 'Working…' : 'Generate & save tool'}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {saveMsg && <p className="text-sm text-emerald-400/90">{saveMsg}</p>}
      </div>

      {generated && (
        <div className="card space-y-2 border-sky-500/30">
          <h3 className="font-semibold">{generated.name}</h3>
          <p className="text-sm text-zinc-300">{generated.explanation || generated.description}</p>
          {(generated.sports || sports)?.length > 0 && (
            <p className="text-xs text-sky-400">Leagues: {(generated.sports || sports).join(', ')}</p>
          )}
          {saved?.id && <p className="text-xs text-zinc-500">Saved id: {saved.id}</p>}
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Learn from your results</h2>
        <button type="button" onClick={analyze} disabled={analyzing} className="btn-ghost w-full disabled:opacity-50">
          {analyzing ? 'Reviewing…' : 'Review my history'}
        </button>
        {insight && (
          <div className="space-y-2">
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{insight.summary}</p>
            {(insight.suggestions || []).map((s: string, i: number) => (
              <p key={i} className="text-sm text-zinc-400">
                · {s}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
