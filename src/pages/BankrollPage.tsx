import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function BankrollPage() {
  const [bets, setBets] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [start, setStart] = useState('1000')
  const [unit, setUnit] = useState('10')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [b, s] = await Promise.all([api.bets(), api.settings().catch(() => null)])
      setBets(Array.isArray(b) ? b : [])
      if (s) {
        setSettings(s)
        if (s.bankroll_start != null) setStart(String(s.bankroll_start))
        if (s.unit_size != null) setUnit(String(s.unit_size))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const saveBankroll = async () => {
    try {
      const s = await api.updateSettings({
        bankroll_start: Number(start) || 0,
        unit_size: Number(unit) || 1,
      })
      setSettings(s)
      setMsg('Saved')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: any) {
      setMsg(e.message || 'Save failed — add bankroll_start / unit_size columns on app_settings if needed')
    }
  }

  const settled = bets.filter((b) => b.status !== 'pending')
  const pending = bets.filter((b) => b.status === 'pending')
  const wins = settled.filter((b) => b.status === 'won').length
  const losses = settled.filter((b) => b.status === 'lost').length
  const pushes = settled.filter((b) => b.status === 'push').length
  const netUnits = settled.reduce((s, b) => s + Number(b.profit_units || 0), 0)
  const unitSize = Number(unit) || 10
  const startBr = Number(start) || 0
  const netMoney = netUnits * unitSize
  const current = startBr + netMoney
  const winRate = settled.length ? wins / (wins + losses || 1) : 0

  // by tool
  const byTool: Record<string, { n: number; w: number; units: number }> = {}
  for (const b of settled) {
    const k = b.algorithm_name || b.algorithm_id || 'unknown'
    if (!byTool[k]) byTool[k] = { n: 0, w: 0, units: 0 }
    byTool[k].n += 1
    if (b.status === 'won') byTool[k].w += 1
    byTool[k].units += Number(b.profit_units || 0)
  }
  const toolRows = Object.entries(byTool).sort((a, b) => b[1].units - a[1].units)

  if (loading) return <p className="text-zinc-500 text-center py-12 text-sm">Loading bankroll…</p>

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h2 className="page-title">Bank</h2>
        <p className="hint mt-1">Your money so far. Set your starting amount and unit (one standard bet size).</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="stat-box">
          <p className="label">Current</p>
          <p className="text-xl font-bold text-sky-300 mt-1">${current.toFixed(0)}</p>
        </div>
        <div className="stat-box">
          <p className="label">Net</p>
          <p className={`text-xl font-bold mt-1 ${netMoney >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {netMoney >= 0 ? '+' : ''}${netMoney.toFixed(0)}
          </p>
        </div>
        <div className="stat-box">
          <p className="label">Units</p>
          <p className="text-xl font-bold mt-1">
            {netUnits >= 0 ? '+' : ''}
            {netUnits.toFixed(1)}
          </p>
        </div>
        <div className="stat-box">
          <p className="label">Record</p>
          <p className="text-xl font-bold mt-1">
            {wins}-{losses}
            {pushes ? `-${pushes}` : ''}
          </p>
        </div>
      </div>

      <div className="card space-y-3">
        <p className="font-semibold text-[15px]">Settings</p>
        <label className="block text-sm">
          <span className="text-zinc-400">Starting bankroll ($)</span>
          <input
            value={start}
            onChange={(e) => setStart(e.target.value)}
            type="number"
            className="mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Unit size ($)</span>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            type="number"
            className="mt-1 w-full"
          />
        </label>
        <button type="button" className="btn-primary" onClick={saveBankroll}>
          Save bankroll settings
        </button>
        {msg && <p className="text-sm text-sky-400">{msg}</p>}
        <p className="hint text-xs">
          Win rate (no pushes): {wins + losses ? `${Math.round(winRate * 100)}%` : '—'} · Open bets:{' '}
          {pending.length}
        </p>
      </div>

      <div className="card space-y-2">
        <p className="font-semibold text-[15px]">Which tools are working</p>
        {toolRows.length === 0 && <p className="hint">Settle some bets to see which tools make money.</p>}
        {toolRows.map(([name, s]) => (
          <div key={name} className="flex justify-between text-sm border-b border-white/5 py-2">
            <div>
              <p className="font-medium">{name}</p>
              <p className="text-[11px] text-zinc-500">
                {s.w}-{s.n - s.w} · {s.n} bets
              </p>
            </div>
            <p className={`font-semibold odds-num ${s.units >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {s.units >= 0 ? '+' : ''}
              {s.units.toFixed(1)}u
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
