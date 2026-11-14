import { useState } from 'react'
import type { Step } from '../hooks/useInvestigation'
import { argsText, clock } from '../format'

export function Trace({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!steps.length) return null
  const total = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0)
  const finished = steps.filter((s) => s.status !== 'running').length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Trace</span>
        <span className="mono" style={{ letterSpacing: 0, textTransform: 'none' }}>
          {finished} call{finished === 1 ? '' : 's'} · {total} ms
        </span>
      </div>
      <ol className="trace">
        {steps.map((s) => {
          const isOpen = open === s.id && s.status !== 'running'
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`trace-line${s.status === 'running' ? ' running' : ''}`}
                aria-expanded={isOpen}
                disabled={s.status === 'running'}
                onClick={() => setOpen(isOpen ? null : s.id)}
              >
                <span className="muted">{clock(s.startedAt)}</span>
                <span className="muted">{s.status === 'running' ? '·' : isOpen ? '▾' : '▸'}</span>
                <span className="trace-name">
                  {s.name}
                  <span className="muted">({argsText(s.arguments)})</span>
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  {s.status === 'running' && <span className="muted">… running</span>}
                  {s.status === 'ok' && (
                    <span className="muted">
                      ✓ {s.durationMs} ms{s.rows != null ? `  ${s.rows} rows` : ''}
                    </span>
                  )}
                  {s.status === 'error' && <span className="alarm">✕ {s.durationMs} ms</span>}
                </span>
              </button>
              {isOpen && <pre className="trace-detail">{JSON.stringify(s.result, null, 1)}</pre>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
