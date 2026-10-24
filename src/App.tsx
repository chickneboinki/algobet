import { Routes, Route, NavLink } from 'react-router-dom'
import GamesPage from './pages/GamesPage'
import AlgorithmsPage from './pages/AlgorithmsPage'
import AILabPage from './pages/AILabPage'
import HistoryPage from './pages/HistoryPage'
import WatchPage from './pages/WatchPage'
import SettingsPage from './pages/SettingsPage'

const tabs = [
  { to: '/', label: 'Games', icon: '🏈' },
  { to: '/algorithms', label: 'Tools', icon: '🔧' },
  { to: '/ai', label: 'AI', icon: '✨' },
  { to: '/watch', label: 'Watch', icon: '👀' },
  { to: '/history', label: 'Bets', icon: '📒' },
  { to: '/settings', label: 'Setup', icon: '⚙️' },
]

export default function App() {
  return (
    <div className="min-h-dvh flex flex-col max-w-lg mx-auto bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0f]/95 backdrop-blur border-b border-white/10 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">
            <span className="text-[#00BFFF]">Algo</span>Bet
          </h1>
          <span className="text-xs text-zinc-500">Your betting helper</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-28 px-3 pt-3">
        <Routes>
          <Route path="/" element={<GamesPage />} />
          <Route path="/algorithms" element={<AlgorithmsPage />} />
          <Route path="/ai" element={<AILabPage />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0f]/98 backdrop-blur border-t border-white/10 pb-safe">
        <div className="max-w-lg mx-auto grid grid-cols-6 py-2">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 text-[10px] px-0.5 py-1.5 transition ${
                  isActive ? 'text-[#00BFFF]' : 'text-zinc-500'
                }`
              }
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="font-medium">{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
