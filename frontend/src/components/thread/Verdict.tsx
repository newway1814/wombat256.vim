import { useState } from 'react'
import { api } from '../../api/client'
import type { Ticket } from '../../api/types'
import { dateTime } from '../../format'
import { Answer } from '../Answer'

/** The answer, then the approval written as a sentence. */
export function Verdict({ answer, ticket, onDecided }: { answer: string; ticket?: Ticket; onDecided: () => void }) {
  const [current, setCurrent] = useState(ticket)
  const [by, setBy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decide = async (d: 'approve' | 'reject') => {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      setCurrent(await api.decide(current.id, d, by))
      onDecided()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const wo = current ? `WO-${String(current.id).padStart(4, '0')}` : ''
  return (
    <section className="verdict" aria-label="Answer">
      <Answer text={answer} />
      {current && (
        <div className="approval">
          {current.status === 'DRAFT' ? (
            <form className="approval-line" onSubmit={(e) => e.preventDefault()}>
              <span>
                <span className="mono">{wo}</span> needs your approval.
              </span>
              <label className="visually-hidden" htmlFor={`by-${current.id}`}>
                Decide as
              </label>
              <input
                id={`by-${current.id}`}
                value={by}
                onChange={(e) => setBy(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
              <button type="button" className="btn btn-primary" disabled={busy || !by.trim()} onClick={() => decide('approve')}>
                Approve
              </button>
              <button type="button" className="btn" disabled={busy || !by.trim()} onClick={() => decide('reject')}>
                Reject
              </button>
            </form>
          ) : (
            <p className="approval-done">
              <span className="mono">{wo}</span> {current.status === 'APPROVED' ? 'approved' : 'rejected'} by {current.decided_by}
              {current.decided_at && <span className="muted"> · {dateTime(current.decided_at).slice(11)}</span>}
            </p>
          )}
          {error && <p className="alarm small">{error}</p>}
          <details className="wo-details">
            <summary className="muted">What the work order says</summary>
            <p>{current.title}</p>
            <p className="muted small">{current.body}</p>
          </details>
        </div>
      )}
    </section>
  )
}
