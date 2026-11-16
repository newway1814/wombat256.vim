import { useState } from 'react'
import { api } from '../../api/client'
import type { Ticket } from '../../api/types'
import { dateTime, woName } from '../../format'
import { Prose } from '../Prose'

/** A drafted work order and the human decision on it. The agent can only draft. */
export function Approval({
  ticket,
  onDecided,
  onCite,
}: {
  ticket: Ticket
  onDecided: (t: Ticket) => void
  onCite?: (chunkId: string) => void
}) {
  const [by, setBy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decide = async (d: 'approve' | 'reject') => {
    setBusy(true)
    setError(null)
    try {
      onDecided(await api.decide(ticket.id, d, by))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wo">
      <p className="wo-meta mono">
        {woName(ticket.id)} · {ticket.chamber_id} · {dateTime(ticket.created_at)}
      </p>
      <h2 className="wo-title">{ticket.title}</h2>
      <div className="wo-body">
        <Prose text={ticket.body} resolve={(kind, id) => (kind === 'cite' && onCite ? () => onCite(id) : null)} />
      </div>
      {ticket.status === 'DRAFT' ? (
        <form className="wo-decide" onSubmit={(e) => e.preventDefault()}>
          <p>Only an engineer can approve this. The agent drafts; it never acts.</p>
          <div className="wo-row">
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
          </div>
        </form>
      ) : (
        <p className={`wo-done ${ticket.status === 'APPROVED' ? 'ok' : ''}`}>
          {ticket.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {ticket.decided_by}
          {ticket.decided_at && <span className="muted"> · {dateTime(ticket.decided_at)}</span>}
        </p>
      )}
      {error && <p className="alarm small">{error}</p>}
    </div>
  )
}
