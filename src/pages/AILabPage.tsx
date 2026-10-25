import { useState } from 'react'
import { api } from '../services/api'

export default function AILabPage() {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [generated, setGenerated] = useState<any>(null)
  const [insight, setInsight] = useState<any>(null)
  const [error, setError] = useState('')

  const generate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setError('')
    try {
      setGenerated(await api.generate(prompt))
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
      const summary = `Total bets: ${bets.length}. Settled: ${settled.length} (wins ${wins}, losses ${losses}). Net units: ${units.toFixed(2)}. By tool: ${toolLines || 'none'}. Recent: ${settled
        .slice(0, 12)
        .map((b: any) => `${b.recommended_side || b.side}(${b.status})`)
        .join(', ')}`
      setInsight(await api.analyze(summary))
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="label">AI Lab</p>
        <h2 className="text-lg font-semibold">Build a new tool</h2>
        <p className="hint">
          Describe a strategy in plain English. The AI drafts a tool in the same evidence-first style as your engines.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Example: NFL home underdogs when DraftKings is softer than FanDuel on the spread"
          className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm min-h-[120px] focus:outline-none focus:border-sky-500/50"
        />
        <button type="button" onClick={generate} disabled={generating || !prompt.trim()} className="btn-primary disabled:opacity-50">
          {generating ? 'Working…' : 'Generate tool idea'}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      {generated && (
        <div className="card space-y-2 border-sky-500/30">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-semibold">{generated.name}</h3>
            {generated.confidence != null && (
              <span className="text-sky-400 text-sm odds-num">{Math.round(generated.confidence * 100)}%</span>
            )}
          </div>
          <p className="text-sm text-zinc-300">{generated.explanation || generated.description}</p>
          {generated.key_features?.length > 0 && (
            <ul className="text-sm text-zinc-400 space-y-1">
              {generated.key_features.map((f: string, i: number) => (
                <li key={i}>· {f}</li>
              ))}
            </ul>
          )}
          {generated.suggested_code && (
            <pre className="text-xs bg-black/50 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap font-mono text-zinc-400">
              {generated.suggested_code}
            </pre>
          )}
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Learn from your results</h2>
        <p className="hint">
          Reads your tracked bets and suggests which tools to trust more, and what to try next.
        </p>
        <button type="button" onClick={analyze} disabled={analyzing} className="btn-ghost w-full disabled:opacity-50">
          {analyzing ? 'Reviewing…' : 'Review my history'}
        </button>
        {insight && (
          <div className="space-y-3 pt-1">
            <p className="text-sm whitespace-pre-wrap text-zinc-300">{insight.summary}</p>
            {insight.suggestions?.length > 0 && (
              <div>
                <p className="label mb-1">Suggestions</p>
                <ul className="text-sm space-y-1 text-zinc-300">
                  {insight.suggestions.map((s: string, i: number) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {insight.new_algorithm_ideas?.length > 0 && (
              <div>
                <p className="label mb-1">Ideas for new tools</p>
                <ul className="text-sm space-y-1 text-zinc-300">
                  {insight.new_algorithm_ideas.map((s: string, i: number) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
