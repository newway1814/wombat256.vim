import { useState } from 'react'
import { api } from '../../api/client'
import type { Ticket } from '../../api/types'
import { dateTime } from '../../format'
import { Panel } from './Panel'

export function TicketCard({ initial, onDecided }: { initial: Ticket; onDecided?: () => void }) {
  const [ticket, setTicket] = useState(initial)
  const [by, setBy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true)
    setError(null)
    try {
      setTicket(await api.decide(ticket.id, decision, by))
      onDecided?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const id = `WO-${String(ticket.id).padStart(4, '0')}`
  return (
    <Panel
      wide
      label={`Work order ${id}`}
      title={
        <>
          Work order <span className="mono">{id}</span>
        </>
      }
      meta={
        ticket.status === 'DRAFT' ? (
          <span className="warn">Needs approval</span>
        ) : (
          <span className="muted">{ticket.status === 'APPROVED' ? 'Approved' : 'Rejected'}</span>
        )
      }
    >
      <div className="ticket">
        <div className="ticket-main">
          <p className="ticket-title">{ticket.title}</p>
          <details>
            <summary className="muted">Details</summary>
            <p className="ticket-body">{ticket.body}</p>
            <p className="muted small">Drafted by FabCopilot · {dateTime(ticket.created_at)}</p>
          </details>
        </div>
        <div className="ticket-decide">
          {ticket.status === 'DRAFT' ? (
            <form onSubmit={(e) => e.preventDefault()}>
              <label className="visually-hidden" htmlFor={`by-${ticket.id}`}>
                Decide as
              </label>
              <input
                id={`by-${ticket.id}`}
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
              {error && <p className="alarm small">{error}</p>}
            </form>
          ) : (
            <p>
              {ticket.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {ticket.decided_by}
              {ticket.decided_at && <span className="mono muted"> · {dateTime(ticket.decided_at).slice(11)}</span>}
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}
