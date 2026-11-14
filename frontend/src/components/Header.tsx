import type { Status } from '../api/types'

export type View = 'investigate' | 'lots' | 'tickets' | 'audit'
const VIEWS: { id: View; label: string }[] = [
  { id: 'investigate', label: 'Investigate' },
  { id: 'lots', label: 'Lots' },
  { id: 'tickets', label: 'Work orders' },
  { id: 'audit', label: 'Audit log' },
]

export function Header({
  view,
  onView,
  status,
  theme,
  onTheme,
}: {
  view: View
  onView: (v: View) => void
  status: Status | null
  theme: 'system' | 'light' | 'dark'
  onTheme: () => void
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 9.5h8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        FabCopilot
      </div>
      <nav className="nav" aria-label="Main">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-current={view === v.id ? 'page' : undefined} onClick={() => onView(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>
      <div className="spacer" />
      {status && (
        <dl className="status">
          <div>
            <dt className="label">Lots</dt>
            <dd>{status.lots}</dd>
          </div>
          <div>
            <dt className="label">Baseline yield</dt>
            <dd>{status.baseline_yield != null ? `${status.baseline_yield.toFixed(2)}%` : '–'}</dd>
          </div>
          <div>
            <dt className="label">Flagged lots</dt>
            <dd className={status.flagged_lots ? 'alarm' : undefined}>{status.flagged_lots}</dd>
          </div>
          <div>
            <dt className="label">Open work orders</dt>
            <dd className={status.open_work_orders ? 'warn' : undefined}>{status.open_work_orders}</dd>
          </div>
          <div>
            <dt className="label">Model</dt>
            <dd className="muted">{status.model ?? 'none'}</dd>
          </div>
        </dl>
      )}
      <button type="button" className="btn btn-small" onClick={onTheme} aria-label={`Theme: ${theme}. Change theme`}>
        {theme === 'system' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}
      </button>
    </header>
  )
}
