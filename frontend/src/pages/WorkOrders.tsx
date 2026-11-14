import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Ticket } from '../api/types'
import { TicketCard } from '../components/cards/TicketCard'

export function WorkOrders({ onChanged }: { onChanged: () => void }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .tickets()
      .then((r) => setTickets(r.items))
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main className="page">
      {error && <p className="panel empty alarm">{error}</p>}
      {!tickets && !error && <p className="panel empty">Loading work orders…</p>}
      {tickets?.length === 0 && (
        <p className="panel empty">No work orders yet. FabCopilot drafts them during an investigation.</p>
      )}
      {tickets?.map((t) => <TicketCard key={t.id} initial={t} onDecided={onChanged} />)}
    </main>
  )
}
