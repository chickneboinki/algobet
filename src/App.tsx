import { Routes, Route, NavLink } from 'react-router-dom'
import GamesPage from './pages/GamesPage'
import AlgorithmsPage from './pages/AlgorithmsPage'
import AILabPage from './pages/AILabPage'
import HistoryPage from './pages/HistoryPage'
import WatchPage from './pages/WatchPage'
import SettingsPage from './pages/SettingsPage'

const tabs = [
  { to: '/', label: 'Games', icon: '🏟️' },
  { to: '/algorithms', label: 'Algos', icon: 'ƒ' },
  { to: '/ai', label: 'AI Lab', icon: '🧠' },
  { to: '/watch', label: 'Watch', icon: '👁️' },
  { to: '/history', label: 'History', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function App() {
  return (
    <div className="min-h-dvh flex flex-col max-w-lg mx-auto bg-zinc-950 text-white">
      <header className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-neon">Algo</span>Bet
        </h1>
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">v1.0</span>
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

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/98 backdrop-blur border-t border-white/10">
        <div className="max-w-lg mx-auto grid grid-cols-6 py-2">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center text-[10px] px-0.5 py-1 transition ${
                  isActive ? 'text-neon' : 'text-zinc-500'
                }`
              }
            >
              <span className="text-base leading-none mb-0.5">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
