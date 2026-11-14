import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AuditEntry } from '../api/types'
import { dateTime } from '../format'

export function AuditLog() {
  const [items, setItems] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .audit(300)
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main className="page">
      <section className="panel" aria-label="Audit log">
        <div className="panel-head">
          <h2>Audit log</h2>
          <span className="panel-meta">every question, tool call and decision, newest first</span>
        </div>
        {error && <p className="empty alarm">{error}</p>}
        {!items && !error && <p className="empty">Loading…</p>}
        {items?.length === 0 && <p className="empty">Nothing recorded yet.</p>}
        {items && items.length > 0 && (
          <div className="table-box">
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>
                      {dateTime(a.at)}
                    </td>
                    <td>{a.actor}</td>
                    <td className={`mono${a.action.endsWith('_work_order') && a.actor !== 'agent' ? ' warn' : ''}`}>
                      {a.action}
                    </td>
                    <td className="mono muted" style={{ fontSize: 11.5, wordBreak: 'break-word' }}>
                      {JSON.stringify(a.detail)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
