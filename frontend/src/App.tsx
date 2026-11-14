import { useCallback, useEffect, useState } from 'react'
import { api, STATIC_DEMO } from './api/client'
import type { Status } from './api/types'
import { Header, type View } from './components/Header'
import { AuditLog } from './pages/AuditLog'
import { Investigate } from './pages/Investigate'
import { Lots } from './pages/Lots'
import { WorkOrders } from './pages/WorkOrders'

type Theme = 'system' | 'light' | 'dark'
const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

function savedTheme(): Theme {
  try {
    const t = localStorage.getItem('theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export default function App() {
  const [view, setView] = useState<View>('investigate')
  const [status, setStatus] = useState<Status | null>(null)
  const [theme, setTheme] = useState<Theme>(savedTheme)

  const refresh = useCallback(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
  }, [])
  useEffect(refresh, [refresh])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* private mode: theme just isn't remembered */
    }
  }, [theme])

  return (
    <div className="app">
      <Header
        view={view}
        onView={setView}
        status={status}
        theme={theme}
        onTheme={() => setTheme(NEXT_THEME[theme])}
        demo={STATIC_DEMO}
      />
      {/* Investigate stays mounted so a running investigation survives a look at another tab. */}
      <div style={{ display: view === 'investigate' ? 'contents' : 'none' }}>
        <Investigate onChanged={refresh} demo={STATIC_DEMO} />
      </div>
      {view === 'lots' && <Lots baseline={status?.baseline_yield ?? null} />}
      {view === 'tickets' && <WorkOrders onChanged={refresh} />}
      {view === 'audit' && <AuditLog />}
    </div>
  )
}
