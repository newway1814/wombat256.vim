import type { LotDetail } from '../../api/types'
import { dateTime } from '../../format'
import { Panel } from './Panel'

/** A lot's worst wafers, and which chambers ran it at the etch steps. */
export function LotCard({ lot, onOpenWafer }: { lot: LotDetail; onOpenWafer: (id: string) => void }) {
  const worst = [...lot.wafers].sort((a, b) => a.yield_pct - b.yield_pct).slice(0, 6)
  const etch = lot.route.filter((s) => s.step.startsWith('ETCH'))
  return (
    <Panel
      label={`Lot ${lot.id}`}
      title={<span className="mono">{lot.id}</span>}
      meta={`${lot.product} · started ${dateTime(lot.started_at)} · mean ${lot.mean_yield?.toFixed(2)}%`}
    >
      <div className="table-box">
        <table className="data">
          <thead>
            <tr>
              <th>Worst wafers</th>
              <th className="num">Slot</th>
              <th className="num">Yield</th>
            </tr>
          </thead>
          <tbody>
            {worst.map((w) => (
              <tr key={w.id}>
                <td>
                  <button type="button" className="link-btn" onClick={() => onOpenWafer(w.id)}>
                    {w.id}
                  </button>
                </td>
                <td className="num">{w.slot}</td>
                <td className="num">{w.yield_pct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="kv" style={{ padding: '4px 12px 12px' }}>
        {etch.map((s) => (
          <div key={s.seq} style={{ display: 'contents' }}>
            <dt>{s.step}</dt>
            <dd className="mono">{s.chambers.map((c) => `${c.chamber_id} ×${c.wafers}`).join('   ')}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
