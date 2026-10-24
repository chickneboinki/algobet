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
    setGenerating(true); setError('')
    try { setGenerated(await api.generate(prompt)) }
    catch (e: any) { setError(e.message || 'Failed') }
    finally { setGenerating(false) }
  }

  const analyze = async () => {
    setAnalyzing(true); setError('')
    try {
      const bets = await api.bets()
      const settled = bets.filter((b: any) => b.status !== 'pending')
      const wins = settled.filter((b: any) => b.status === 'won').length
      const losses = settled.filter((b: any) => b.status === 'lost').length
      const units = settled.reduce((s: number, b: any) => s + (b.profit_units || 0), 0)
      const summary = `Total: ${bets.length}\nSettled: ${settled.length} (W-L ${wins}-${losses})\nNet units: ${units.toFixed(2)}\nRecent: ${settled.slice(0,10).map((b: any) => `${b.recommended_side}(${b.status})`).join(', ')}`
      setInsight(await api.analyze(summary))
    } catch (e: any) { setError(e.message || 'Failed') }
    finally { setAnalyzing(false) }
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-3">
        <h2 className="font-semibold text-lg">Create Algorithm with AI</h2>
        <p className="text-sm text-zinc-400">Describe a strategy. AI uses evidence-gated style.</p>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. NFL underdog ML when road team has rest edge..."
          className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm min-h-[110px] focus:outline-none focus:border-neon" />
        <button onClick={generate} disabled={generating || !prompt.trim()} className="btn-neon w-full disabled:opacity-50">
          {generating ? 'Generating…' : '✨ Generate with OpenRouter'}
        </button>
        {error && <p className="text-red-400 text-sm break-all">{error}</p>}
      </div>
      {generated && (
        <div className="card border-neon/40 space-y-2">
          <div className="flex justify-between">
            <h3 className="font-semibold">{generated.name}</h3>
            {generated.confidence != null && <span className="text-neon text-sm font-mono">{Math.round(generated.confidence * 100)}%</span>}
          </div>
          <p className="text-sm text-zinc-300">{generated.explanation || generated.description}</p>
          {generated.suggested_code && (
            <pre className="text-xs bg-black/50 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap font-mono text-baby">{generated.suggested_code}</pre>
          )}
        </div>
      )}
      <div className="card space-y-3">
        <h2 className="font-semibold text-lg">Learn from Results</h2>
        <p className="text-sm text-zinc-400">Reviews tracked bets and suggests improvements.</p>
        <button onClick={analyze} disabled={analyzing} className="btn-outline w-full disabled:opacity-50">
          {analyzing ? 'Analyzing…' : '🧠 Analyze My History'}
        </button>
        {insight && (
          <div className="space-y-2 pt-1">
            <p className="text-sm whitespace-pre-wrap">{insight.summary}</p>
            {insight.suggestions?.length > 0 && (
              <><p className="text-xs font-bold text-zinc-400 mt-2">Suggestions</p>
              <ul className="text-sm space-y-1">{insight.suggestions.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul></>
            )}
            {insight.new_algorithm_ideas?.length > 0 && (
              <><p className="text-xs font-bold text-zinc-400 mt-2">New Ideas</p>
              <ul className="text-sm space-y-1">{insight.new_algorithm_ideas.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul></>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
