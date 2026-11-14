import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { LotDetail, LotSummary } from '../api/types'
import { LotCard } from '../components/cards/LotCard'
import { WaferMapCard } from '../components/cards/WaferMapCard'
import { dateTime } from '../format'

export function Lots({ baseline }: { baseline: number | null }) {
  const [lots, setLots] = useState<LotSummary[] | null>(null)
  const [lot, setLot] = useState<LotDetail | null>(null)
  const [wafer, setWafer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .lots(200)
      .then((r) => setLots(r.items))
      .catch((e: Error) => setError(e.message))
  }, [])

  const open = async (id: string) => {
    try {
      const detail = await api.lot(id)
      setLot(detail)
      setWafer([...detail.wafers].sort((a, b) => a.yield_pct - b.yield_pct)[0]?.id ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <main className="page">
      <div className="page-grid">
        <section className="panel" aria-label="Lots">
          <div className="panel-head">
            <h2>Lots</h2>
            <span className="panel-meta">{lots ? `${lots.length} lots, newest first` : ''}</span>
          </div>
          {error && <p className="empty alarm">{error}</p>}
          {!lots && !error && <p className="empty">Loading lots…</p>}
          {lots && (
            <div className="table-box" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Started</th>
                    <th>Status</th>
                    <th className="num">Mean yield</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => (
                    <tr key={l.id} className={lot?.id === l.id ? 'top' : undefined}>
                      <td>
                        <button type="button" className="link-btn" onClick={() => open(l.id)}>
                          {l.id}
                        </button>
                      </td>
                      <td className="mono muted">{dateTime(l.started_at)}</td>
                      <td className="muted">{l.status.toLowerCase()}</td>
                      <td className={`num${baseline && l.mean_yield < baseline - 5 ? ' alarm' : ''}`}>
                        {l.mean_yield.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {lot ? (
            <>
              <LotCard lot={lot} onOpenWafer={setWafer} />
              {wafer && <WaferMapCard key={wafer} waferId={wafer} />}
            </>
          ) : (
            <p className="panel empty">No lot selected. Pick a lot to see its worst wafers and wafer map.</p>
          )}
        </div>
      </div>
    </main>
  )
}
