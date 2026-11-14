import { Panel } from './Panel'

interface Result {
  baseline_yield: number
  limit: number
  k: number
  flagged: { id: string; yield_pct: number; sigmas_below: number }[]
}

export function FlaggedLotsCard({ result, onOpenLot }: { result: Result; onOpenLot: (id: string) => void }) {
  return (
    <Panel label="Flagged lots" title="Flagged lots" meta={`baseline ${result.baseline_yield.toFixed(1)}%`}>
      {result.flagged.length === 0 ? (
        <p className="empty">No lot is unusually low.</p>
      ) : (
        <div className="table-box">
          <table className="data">
            <tbody>
              {result.flagged.map((f) => (
                <tr key={f.id}>
                  <td>
                    <button type="button" className="link-btn" onClick={() => onOpenLot(f.id)}>
                      {f.id}
                    </button>
                  </td>
                  <td className="num">{f.yield_pct.toFixed(1)}%</td>
                  <td className="num alarm">−{f.sigmas_below.toFixed(1)}σ</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
