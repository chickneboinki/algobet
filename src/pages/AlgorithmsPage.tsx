import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function AlgorithmsPage() {
  const [algos, setAlgos] = useState<any[]>([])

  useEffect(() => {
    api.algorithms().then(setAlgos).catch(console.error)
  }, [])

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <h2 className="font-semibold text-lg">Your tools</h2>
        <p className="hint">
          These are simple rules that look at a game and say who they like.
          Open a game on the Games tab, then tap one of these to run it.
        </p>
      </div>

      {algos.map((a) => (
        <div key={a.id} className="card space-y-2">
          <h3 className="font-semibold text-base">{a.name}</h3>
          <p className="hint">{a.description}</p>
          {a.tags && (
            <div className="flex gap-1.5 flex-wrap pt-1">
              {a.tags.map((t: string) => (
                <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-[#00BFFF]/15 text-[#00BFFF]">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="card border-dashed border-white/20 text-center py-8">
        <p className="font-medium mb-1">Want a new tool?</p>
        <p className="hint text-sm">Go to the AI tab and describe what you want in plain English.</p>
      </div>
    </div>
  )
}
