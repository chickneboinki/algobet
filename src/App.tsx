import { Routes, Route, NavLink } from 'react-router-dom'
import GamesPage from './pages/GamesPage'
import AlgorithmsPage from './pages/AlgorithmsPage'
import AILabPage from './pages/AILabPage'
import HistoryPage from './pages/HistoryPage'
import WatchPage from './pages/WatchPage'
import SettingsPage from './pages/SettingsPage'

const tabs = [
  { to: '/', label: 'Games', icon: '🏈' },
  { to: '/algorithms', label: 'Tools', icon: '⚡' },
  { to: '/ai', label: 'AI', icon: '✨' },
  { to: '/watch', label: 'Watch', icon: '👁' },
  { to: '/history', label: 'Bets', icon: '📋' },
  { to: '/settings', label: 'Setup', icon: '⚙' },
]

export default function App() {
  return (
    <div className="shell flex flex-col text-[15px]">
      <header className="sticky top-0 z-20 px-4 py-3.5 border-b border-white/[0.06] bg-[#07080c]/90 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-500/20">A</div>
            <div>
              <h1 className="text-[17px] font-semibold leading-tight tracking-tight">AlgoBet</h1>
              <p className="text-[11px] text-zinc-500 leading-none">Live lines · your tools</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-28 px-3.5 pt-3">
        <Routes>
          <Route path="/" element={<GamesPage />} />
          <Route path="/algorithms" element={<AlgorithmsPage />} />
          <Route path="/ai" element={<AILabPage />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <nav className="nav-bar">
        <div className="max-w-[480px] mx-auto grid grid-cols-6 py-2">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 text-[10px] py-1.5 transition ${
                  isActive ? 'text-blue-400' : 'text-zinc-500'
                }`
              }
            >
              <span className="text-[18px] leading-none">{t.icon}</span>
              <span className="font-medium">{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
