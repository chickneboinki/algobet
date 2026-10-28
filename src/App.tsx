import { Routes, Route, NavLink, Link } from 'react-router-dom'
import BestBetsPage from './pages/BestBetsPage'
import GamesPage from './pages/GamesPage'
import AlgorithmsPage from './pages/AlgorithmsPage'
import AILabPage from './pages/AILabPage'
import HistoryPage from './pages/HistoryPage'
import WatchPage from './pages/WatchPage'
import SettingsPage from './pages/SettingsPage'
import LearnPage from './pages/LearnPage'
import { loadSession } from './lib/auth'
import { useEffect, useState } from 'react'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
}

const icons: Record<string, JSX.Element> = {
  Best: (
    <svg {...stroke}>
      <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z" />
    </svg>
  ),
  Games: (
    <svg {...stroke}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18M9 5v14" />
    </svg>
  ),
  Tools: (
    <svg {...stroke}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  ),
  AI: (
    <svg {...stroke}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Bets: (
    <svg {...stroke}>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  ),
  Learn: (
    <svg {...stroke}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10 9.5v5l4.5-2.5L10 9.5z" />
    </svg>
  ),
  Setup: (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
}

const tabs = [
  { to: '/', label: 'Best' },
  { to: '/games', label: 'Games' },
  { to: '/tools', label: 'Tools' },
  { to: '/bets', label: 'Bets' },
  { to: '/learn', label: 'Learn' },
  { to: '/setup', label: 'Setup' },
]

export default function App() {
  const [user, setUser] = useState<string | null>(null)
  useEffect(() => {
    setUser(loadSession()?.username || null)
  }, [])

  return (
    <div className="shell flex flex-col">
      <header className="app-header">
        <div className="flex items-center justify-between gap-3">
          <div className="brand-block flex items-center gap-3">
            <div className="brand-mark">L</div>
            <div>
              <h1 className="brand-name leading-tight">LeanLab</h1>
              <p className="text-[12px] text-zinc-400 leading-none mt-0.5">Find the lean. Track the edge.</p>
            </div>
          </div>
          <Link to="/setup" className="account-chip">
            <i>{user ? user[0].toUpperCase() : '?'}</i>
            {user ? user : 'Sign in'}
          </Link>
        </div>
      </header>

      <main className="app-main flex-1 pb-28 px-4 pt-5">
        <Routes>
          <Route path="/" element={<BestBetsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/tools" element={<AlgorithmsPage />} />
          <Route path="/algorithms" element={<AlgorithmsPage />} />
          <Route path="/ai" element={<AILabPage />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/bets" element={<HistoryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/setup" element={<SettingsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <nav className="nav-bar" aria-label="Main">
        <div className="side-brand">
          <div className="brand-mark">L</div>
          <div>
            <div className="brand-name leading-tight">LeanLab</div>
            <div className="text-[12px] text-zinc-400 leading-none mt-1 whitespace-nowrap">Find the lean.</div>
          </div>
        </div>
        <div className="nav-inner">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
            >
              {icons[t.label]}
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
