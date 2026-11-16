import { useState } from 'react'
import type { Step } from '../hooks/useInvestigation'

export function Trace({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!steps.length) return null
  const finished = steps.filter((s) => s.status !== 'running').length
  return (
    <div className="trace-wrap">
      <div className="label">
        Trace · {finished} call{finished === 1 ? '' : 's'}
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
                {s.status === 'running' ? <span className="pulse" aria-hidden="true" /> : <span className="muted">{isOpen ? '▾' : '▸'}</span>}
                <span className="trace-name">{s.name}</span>
                {s.status === 'running' && <span className="muted">running</span>}
                {s.status === 'ok' && (
                  <span className="muted">
                    <span className="tick">✓</span> {s.durationMs} ms
                  </span>
                )}
                {s.status === 'error' && <span className="alarm">✕ failed</span>}
              </button>
              {isOpen && (
                <pre className="trace-detail">
                  {JSON.stringify({ arguments: s.arguments, result: s.result }, null, 1)}
                </pre>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
