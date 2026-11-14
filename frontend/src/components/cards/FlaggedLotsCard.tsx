import { Panel } from './Panel'

interface Result {
  baseline_yield: number
  limit: number
  k: number
  checked: number
  flagged: { id: string; yield_pct: number; sigmas_below: number }[]
}

export function FlaggedLotsCard({ result, onOpenLot }: { result: Result; onOpenLot: (id: string) => void }) {
  return (
    <Panel
      label="Flagged lots"
      title="Flagged lots"
      meta={`check_lot_yields · baseline ${result.baseline_yield}% · limit ${result.limit}%`}
    >
      {result.flagged.length === 0 ? (
        <p className="empty">No lot is more than {result.k} sigma below the baseline.</p>
      ) : (
        <div className="table-box">
          <table className="data">
            <thead>
              <tr>
                <th>Lot</th>
                <th className="num">Mean yield</th>
                <th className="num">Below baseline</th>
              </tr>
            </thead>
            <tbody>
              {result.flagged.map((f) => (
                <tr key={f.id}>
                  <td>
                    <button type="button" className="link-btn" onClick={() => onOpenLot(f.id)}>
                      {f.id}
                    </button>
                  </td>
                  <td className="num">{f.yield_pct.toFixed(2)}%</td>
                  <td className="num alarm">{f.sigmas_below.toFixed(1)}σ</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

