import { Routes, Route, NavLink } from 'react-router-dom'
import BestBetsPage from './pages/BestBetsPage'
import GamesPage from './pages/GamesPage'
import AlgorithmsPage from './pages/AlgorithmsPage'
import AILabPage from './pages/AILabPage'
import HistoryPage from './pages/HistoryPage'
import WatchPage from './pages/WatchPage'
import SettingsPage from './pages/SettingsPage'

const tabs = [
  { to: '/', label: 'Best' },
  { to: '/games', label: 'Games' },
  { to: '/tools', label: 'Tools' },
  { to: '/ai', label: 'AI' },
  { to: '/bets', label: 'Bets' },
  { to: '/setup', label: 'Setup' },
]

export default function App() {
  return (
    <div className="shell flex flex-col">
      <header className="sticky top-0 z-20 px-4 py-3 border-b border-white/[0.06] bg-[#07080c]/95 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-blue-500/25">
            A
          </div>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight leading-tight">AlgoBet</h1>
            <p className="text-[11px] text-zinc-500 leading-none mt-0.5">Find value. Track results. Improve.</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-28 px-3.5 pt-3">
        <Routes>
          <Route path="/" element={<BestBetsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/tools" element={<AlgorithmsPage />} />
          <Route path="/algorithms" element={<AlgorithmsPage />} />
          <Route path="/ai" element={<AILabPage />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/bets" element={<HistoryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/setup" element={<SettingsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <nav className="nav-bar">
        <div className="max-w-[480px] mx-auto grid grid-cols-6 py-2.5">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 text-[10px] font-medium transition ${
                  isActive ? 'text-sky-400' : 'text-zinc-500'
                }`
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${t.to === '/' ? '' : 'opacity-0'} bg-sky-400`}
                style={{ opacity: undefined }}
              />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
