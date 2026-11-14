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
  const status =
    ticket.status === 'DRAFT' ? (
      <span className="warn">Draft · needs approval</span>
    ) : (
      <span className="muted">{ticket.status === 'APPROVED' ? 'Approved' : 'Rejected'}</span>
    )
  return (
    <Panel
      wide
      label={`Work order ${id}`}
      title={
        <>
          Work order <span className="mono">{id}</span>
        </>
      }
      meta={status}
    >
      <div className="ticket">
        <dl className="ticket-fields">
          <dt>Chamber</dt>
          <dd className="mono">{ticket.chamber_id}</dd>
          <dt>Title</dt>
          <dd>{ticket.title}</dd>
          <dt>Details</dt>
          <dd>{ticket.body}</dd>
          <dt>Drafted</dt>
          <dd className="mono muted" style={{ fontSize: 12 }}>
            FabCopilot · {dateTime(ticket.created_at)}
          </dd>
        </dl>
        <div className="ticket-decide">
          {ticket.status === 'DRAFT' ? (
            <form
              onSubmit={(e) => e.preventDefault()}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <label className="label" htmlFor={`by-${ticket.id}`}>
                Decide as
              </label>
              <input
                id={`by-${ticket.id}`}
                value={by}
                onChange={(e) => setBy(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !by.trim()}
                  onClick={() => decide('approve')}
                >
                  Approve
                </button>
                <button type="button" className="btn" disabled={busy || !by.trim()} onClick={() => decide('reject')}>
                  Reject
                </button>
              </div>
              {error && <p className="alarm">{error}</p>}
              <p className="muted" style={{ fontSize: 12 }}>
                FabCopilot can draft, never approve. Your decision is written to the audit log.
              </p>
            </form>
          ) : (
            <p>
              {ticket.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {ticket.decided_by} ·{' '}
              <span className="mono">{ticket.decided_at && dateTime(ticket.decided_at).slice(11)}</span>
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}
