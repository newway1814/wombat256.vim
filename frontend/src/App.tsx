import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { api } from './api/client'
import type { Status, Ticket } from './api/types'
import { Icon, Sidebar, type View } from './components/shell/Sidebar'
import { MIN_WIDTH, Workspace } from './components/shell/Workspace'
import { isRunning, useConversations } from './hooks/useConversations'
import { AuditLog } from './pages/AuditLog'
import { Chat } from './pages/Chat'
import { Lots } from './pages/Lots'
import { WorkOrders } from './pages/WorkOrders'
import { tabKey, WorkspaceContext, type Tab } from './workspace'

type Theme = 'system' | 'light' | 'dark'
const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const VIEW_TITLE: Record<View, string> = { chat: 'New investigation', lots: 'Lots', tickets: 'Work orders', audit: 'Audit log' }

/** The side panel's state for one chat: its tabs, which is showing, and whether it is open. */
interface Panel {
  tabs: Tab[]
  active: string | null
  open: boolean
  bump?: number // grows each time a tab is asked for, so the panel visibly answers
}
const CLOSED: Panel = { tabs: [], active: null, open: false }

function stored<T extends string>(key: string, ok: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && ok.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: just not remembered */
  }
}

const narrow = () => window.matchMedia?.('(max-width: 900px)').matches ?? false

export default function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const refresh = useCallback(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
  }, [])
  useEffect(refresh, [refresh])

  const { convs, ask, stop, remove, setTicket } = useConversations(refresh)
  const [view, setView] = useState<View>('chat')
  const [activeId, setActiveId] = useState<string | null>(null)
  const conv = convs.find((c) => c.id === activeId)

  const [theme, setTheme] = useState<Theme>(() => stored('theme', ['light', 'dark', 'system'] as const, 'system'))
  const [collapsed, setCollapsed] = useState(() => stored('fabcopilot.side', ['1', '0'] as const, '0') === '1')
  const [mobileSide, setMobileSide] = useState(false)
  const [panels, setPanels] = useState<Record<string, Panel>>({})
  const [expanded, setExpanded] = useState(false)
  const [width, setWidth] = useState(() => {
    let w = 0
    try {
      w = Number(localStorage.getItem('fabcopilot.ws')) || 0
    } catch {
      /* not remembered */
    }
    return w >= MIN_WIDTH ? w : 520
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    remember('theme', theme)
  }, [theme])
  useEffect(() => remember('fabcopilot.side', collapsed ? '1' : '0'), [collapsed])

  const panel = (activeId && panels[activeId]) || CLOSED
  const showPanel = view === 'chat' && !!conv && panel.open && panel.tabs.length > 0
  const setPanel = (id: string, fn: (p: Panel) => Panel) => setPanels((all) => ({ ...all, [id]: fn(all[id] ?? CLOSED) }))

  const openTab = useCallback((tab: Tab) => {
    const key = tabKey(tab)
    setPanels((all) => {
      const p = all[tab.convId] ?? CLOSED
      const tabs = p.tabs.some((t) => tabKey(t) === key) ? p.tabs : [...p.tabs, tab]
      return { ...all, [tab.convId]: { tabs, active: key, open: true, bump: (p.bump ?? 0) + 1 } }
    })
  }, [])
  const showing = useCallback((tab: Tab) => showPanel && panel.active === tabKey(tab), [showPanel, panel.active])
  const hide = useCallback(() => {
    if (!activeId) return
    setExpanded(false)
    setPanels((all) => ({ ...all, [activeId]: { ...(all[activeId] ?? CLOSED), open: false } }))
  }, [activeId])
  const workspace = useMemo(() => ({ open: openTab, showing, hide }), [openTab, showing, hide])

  const resize = (w: number) => {
    const side = collapsed ? 56 : 260
    const max = Math.max(MIN_WIDTH, window.innerWidth - side - 380)
    const next = Math.min(Math.max(w, MIN_WIDTH), max)
    setWidth(next)
    remember('fabcopilot.ws', String(Math.round(next)))
  }

  const onAsk = (q: string) => {
    const go = () => {
      const ids = ask(view === 'chat' && conv ? conv.id : null, q)
      setView('chat')
      setActiveId(ids.convId)
      // The trace opens beside the chat, like watching the agent work. On a phone it waits to be asked for.
      if (!narrow()) openTab({ kind: 'trace', convId: ids.convId, turnId: ids.turnId })
    }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!conv && doc.startViewTransition && !calm) doc.startViewTransition(() => flushSync(go))
    else go()
  }

  const newChat = () => {
    setView('chat')
    setActiveId(null)
    setMobileSide(false)
  }
  const pick = (id: string) => {
    setView('chat')
    setActiveId(id)
    setMobileSide(false)
  }
  const del = (id: string) => {
    remove(id)
    setPanels((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== id)))
    if (id === activeId) setActiveId(null)
  }
  const onTicket = (convId: string, t: Ticket) => {
    setTicket(convId, t)
    refresh()
  }

  const title = view === 'chat' && conv ? conv.title : VIEW_TITLE[view]
  const demo = status?.model?.startsWith('demo') ?? false

  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className={`app${collapsed ? ' side-collapsed' : ''}${showPanel ? ' with-panel' : ''}${showPanel && expanded ? ' panel-full' : ''}`}>
        <Sidebar
          convs={convs}
          activeId={activeId}
          view={view}
          status={status}
          theme={theme}
          collapsed={collapsed && !mobileSide}
          mobileOpen={mobileSide}
          onToggle={() => (mobileSide ? setMobileSide(false) : setCollapsed(!collapsed))}
          onNew={newChat}
          onPick={pick}
          onDelete={del}
          onView={(v) => {
            setView(v)
            setMobileSide(false)
          }}
          onTheme={() => setTheme(NEXT_THEME[theme])}
        />
        <div className={`scrim${mobileSide ? ' show' : ''}`} onClick={() => setMobileSide(false)} aria-hidden="true" />

        <main className="main">
          <header className="main-bar">
            <button type="button" className="icon only-narrow" aria-label="Open menu" onClick={() => setMobileSide(true)}>
              <Icon d={<path d="M2 4h10M2 7h10M2 10h10" />} />
            </button>
            <h1 className="main-title" key={title}>
              {title}
            </h1>
            {view === 'chat' && conv && panel.tabs.length > 0 && !showPanel && (
              <button
                type="button"
                className="icon"
                aria-label="Show evidence panel"
                onClick={() => setPanel(conv.id, (p) => ({ ...p, open: true }))}
              >
                <Icon
                  d={
                    <>
                      <rect x="1.5" y="2.5" width="11" height="9" rx="2" />
                      <path d="M8.5 2.5v9" />
                    </>
                  }
                />
              </button>
            )}
          </header>
          <div className="main-body" key={view}>
            {view === 'chat' && (
              <Chat
                key={conv?.id ?? 'home'}
                conv={conv}
                onAsk={onAsk}
                onStop={() => conv && stop(conv.id)}
                demo={demo}
              />
            )}
            {view === 'lots' && <Lots baseline={status?.baseline_yield ?? null} />}
            {view === 'tickets' && <WorkOrders onChanged={refresh} />}
            {view === 'audit' && <AuditLog />}
          </div>
        </main>

        <div className={`ws-wrap${showPanel ? ' open' : ''}`} style={{ ['--ws-w' as string]: `${width}px` }}>
          {conv && panel.tabs.length > 0 && (
            <Workspace
              tabs={panel.tabs}
              active={panel.active}
              bump={panel.bump ?? 0}
              convs={convs}
              width={width}
              expanded={expanded}
              onSelect={(key) => setPanel(conv.id, (p) => ({ ...p, active: key }))}
              onClose={(key) =>
                setPanel(conv.id, (p) => {
                  const i = p.tabs.findIndex((t) => tabKey(t) === key)
                  const tabs = p.tabs.filter((t) => tabKey(t) !== key)
                  const next = tabs[Math.min(i, tabs.length - 1)]
                  return { tabs, active: p.active === key ? (next ? tabKey(next) : null) : p.active, open: tabs.length > 0 }
                })
              }
              onHide={() => {
                setExpanded(false)
                setPanel(conv.id, (p) => ({ ...p, open: false }))
              }}
              onExpand={() => setExpanded(!expanded)}
              onResize={resize}
              onTicket={onTicket}
              onOpen={openTab}
            />
          )}
        </div>
      </div>
      {conv && isRunning(conv) && <span className="visually-hidden" role="status">Investigating</span>}
    </WorkspaceContext.Provider>
  )
}
