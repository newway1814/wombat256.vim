import type { ReactNode } from 'react'
import type { Status } from '../../api/types'
import { isRunning, type Conversation } from '../../hooks/useConversations'

export type View = 'chat' | 'lots' | 'tickets' | 'audit'
type Theme = 'system' | 'light' | 'dark'
const THEME_LABEL = { system: 'Auto theme', light: 'Light theme', dark: 'Dark theme' } as const

const I = {
  new: <path d="M9.5 2.5l2 2L6 10H4V8zM2.5 12.5h9" />,
  lots: (
    <>
      <circle cx="7" cy="7" r="5" />
      <path d="M2 9h10" />
    </>
  ),
  tickets: <path d="M3 2.5h8v9H3zM5 5.5h4M5 8h3" />,
  audit: <path d="M7 3.5V7l2.5 1.5M7 12.5A5.5 5.5 0 1 0 7 1.5a5.5 5.5 0 0 0 0 11z" />,
  side: (
    <>
      <rect x="1.5" y="2.5" width="11" height="9" rx="2" />
      <path d="M5.5 2.5v9" />
    </>
  ),
  theme: <path d="M7 1.5a5.5 5.5 0 1 0 0 11zM7 1.5a5.5 5.5 0 0 1 0 11" />,
}

export function Icon({ d }: { d: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      {d}
    </svg>
  )
}

function ago(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return d.toTimeString().slice(0, 5)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function Sidebar({
  convs,
  activeId,
  view,
  status,
  theme,
  collapsed,
  mobileOpen,
  onToggle,
  onNew,
  onPick,
  onDelete,
  onView,
  onTheme,
}: {
  convs: Conversation[]
  activeId: string | null
  view: View
  status: Status | null
  theme: Theme
  collapsed: boolean
  mobileOpen?: boolean
  onToggle: () => void
  onNew: () => void
  onPick: (id: string) => void
  onDelete: (id: string) => void
  onView: (v: View) => void
  onTheme: () => void
}) {
  const demo = status?.model?.startsWith('demo')
  const nav: { id: View; label: string; icon: ReactNode; count?: number }[] = [
    { id: 'lots', label: 'Lots', icon: I.lots, count: status?.flagged_lots },
    { id: 'tickets', label: 'Work orders', icon: I.tickets, count: status?.open_work_orders },
    { id: 'audit', label: 'Audit log', icon: I.audit },
  ]
  return (
    <nav className={`side${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`} aria-label="Main">
      <div className="side-top">
        <span className="brand">
          <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3 9.5h8" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span className="side-label">FabCopilot</span>
          {demo && <span className="tag side-label">Demo</span>}
        </span>
        <button type="button" className="icon" aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'} onClick={onToggle}>
          <Icon d={I.side} />
        </button>
      </div>

      <div className="side-group">
        <button type="button" className="side-row" onClick={onNew} title="New investigation">
          <Icon d={I.new} />
          <span className="side-label">New investigation</span>
        </button>
        {nav.map((n) => (
          <button
            key={n.id}
            type="button"
            className="side-row"
            aria-current={view === n.id ? 'page' : undefined}
            onClick={() => onView(n.id)}
            title={n.label}
          >
            <Icon d={n.icon} />
            <span className="side-label">{n.label}</span>
            {!!n.count && <span className={`count side-label ${n.id === 'lots' ? 'alarm' : 'warn'}`}>{n.count}</span>}
          </button>
        ))}
      </div>

      <div className="side-recents side-label">
        <p className="side-head">Recents</p>
        {convs.length === 0 && <p className="side-empty">Your investigations are saved here, in this browser.</p>}
        <ul>
          {convs.map((c) => (
            <li key={c.id} className={view === 'chat' && c.id === activeId ? 'on' : undefined}>
              <button type="button" className="recent" onClick={() => onPick(c.id)} title={c.title}>
                {isRunning(c) && <span className="live-dot" aria-label="running" />}
                <span className="recent-title">{c.title}</span>
                <span className="recent-when">{ago(c.updatedAt)}</span>
              </button>
              <button type="button" className="recent-x" aria-label={`Delete ${c.title}`} onClick={() => onDelete(c.id)}>
                <svg width="9" height="9" viewBox="0 0 8 8" aria-hidden="true">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="side-foot">
        <button type="button" className="side-row" onClick={onTheme} title={THEME_LABEL[theme]}>
          <Icon d={I.theme} />
          <span className="side-label">{THEME_LABEL[theme]}</span>
        </button>
        {status?.model && (
          <p className="side-model side-label mono" title="Model serving the agent">
            {status.model}
          </p>
        )}
      </div>
    </nav>
  )
}
