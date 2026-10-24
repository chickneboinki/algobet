import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function AlgorithmsPage() {
  const [algos, setAlgos] = useState<any[]>([])

  useEffect(() => {
    api.algorithms().then(setAlgos).catch(console.error)
  }, [])

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400 px-1">
        Built-in algorithms that actually evaluate games. AI-generated ones appear as code you can adapt.
      </p>
      {algos.map((a) => (
        <div key={a.id} className="card">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-semibold">{a.name}</h3>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-zinc-400 shrink-0">
              {a.created_by}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">{a.description}</p>
          {a.tags && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {a.tags.map((t: string) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-neon/10 text-neon">{t}</span>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="card border-dashed border-white/20 text-center text-zinc-500 py-8 text-sm">
        Generate more in the AI Lab tab
      </div>
    </div>
  )
}
