import type { LotDetail } from '../../api/types'
import { Panel } from './Panel'

export function LotCard({ lot, onOpenWafer }: { lot: LotDetail; onOpenWafer: (id: string) => void }) {
  const worst = [...lot.wafers].sort((a, b) => a.yield_pct - b.yield_pct).slice(0, 4)
  const gate = lot.route.find((s) => s.step === 'ETCH-GATE')
  return (
    <Panel
      label={`Lot ${lot.id}`}
      title={<span className="mono">{lot.id}</span>}
      meta={lot.mean_yield != null ? `${lot.mean_yield.toFixed(1)}% yield` : undefined}
    >
      <div className="table-box">
        <table className="data">
          <tbody>
            {worst.map((w) => (
              <tr key={w.id}>
                <td>
                  <button type="button" className="link-btn" onClick={() => onOpenWafer(w.id)}>
                    {w.id}
                  </button>
                </td>
                <td className="num">{w.yield_pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gate && (
        <p className="card-foot muted">
          Gate etch: <span className="mono">{gate.chambers.map((c) => `${c.chamber_id} ×${c.wafers}`).join(', ')}</span>
        </p>
      )}
    </Panel>
  )
}
