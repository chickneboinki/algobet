import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function AlgorithmsPage() {
  const [algos, setAlgos] = useState<any[]>([])
  useEffect(() => { api.algorithms().then(setAlgos).catch(console.error) }, [])

  return (
    <div className="space-y-3.5">
      <div className="card space-y-1.5">
        <h2 className="font-semibold text-lg">Your tools</h2>
        <p className="hint">
          Includes your <strong className="text-zinc-300">NFL Engine</strong> and <strong className="text-zinc-300">NCAA Engine</strong>
          (evidence-gated style from the files you uploaded). Open a game, then run one.
        </p>
      </div>

      {algos.map((a) => (
        <div key={a.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold">{a.name}</h3>
            {a.created_by === 'user' && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 shrink-0">Yours</span>
            )}
          </div>
          <p className="hint text-[13px]">{a.description}</p>
          {a.tags && (
            <div className="flex gap-1.5 flex-wrap">
              {a.tags.map((t: string) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-zinc-400">{t}</span>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="card text-center py-8 border-dashed border-white/10">
        <p className="font-medium mb-1">Want another tool?</p>
        <p className="hint text-sm">Go to AI and describe it in plain English.</p>
      </div>
    </div>
  )
}
