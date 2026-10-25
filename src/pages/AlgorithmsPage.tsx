import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function AlgorithmsPage() {
  const [algos, setAlgos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.algorithms()
      .then(setAlgos)
      .catch(() => setAlgos([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card animate-pulse h-40" />

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="label mb-1">Tools</p>
        <h2 className="text-lg font-semibold">Built-in playbooks</h2>
        <p className="hint mt-1">
          Each tool is a fixed rule set. Open a game and run one, or let Best Bets run them all and rank the results.
        </p>
      </div>
      {algos.map((a) => (
        <div key={a.id} className="card">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{a.name}</h3>
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">{a.created_by}</span>
          </div>
          <p className="hint mt-2">{a.description}</p>
          {a.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {a.tags.map((t: string) => (
                <span key={t} className="chip chip-off text-[11px] py-1 px-2">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
