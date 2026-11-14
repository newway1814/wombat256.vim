import { pValue } from '../../format'
import { Panel } from './Panel'

interface Row {
  step: string
  chamber_id: string
  bad_in_chamber: number
  wafers_in_chamber: number
  p_adjusted: number
}

export function CommonalityCard({ result }: { result: { bad_wafers: number; ranking: Row[] } }) {
  const top = result.ranking[0]
  const significant = top && top.p_adjusted < 0.01
  return (
    <Panel label="Commonality" title="Shared chamber" meta={`${result.bad_wafers} bad wafers`}>
      {top && significant && (
        <div className="headline">
          <span className="mono big">{top.chamber_id}</span>
          <span className="muted">
            {top.bad_in_chamber} of {result.bad_wafers} bad wafers · {top.step}
          </span>
        </div>
      )}
      <div className="table-box">
        <table className="data">
          <tbody>
            {result.ranking.slice(0, 3).map((r, i) => (
              <tr key={`${r.step}-${r.chamber_id}`} className={i === 0 && significant ? 'top' : undefined}>
                <td className="mono">{r.chamber_id}</td>
                <td className="num">
                  {r.bad_in_chamber}/{r.wafers_in_chamber}
                </td>
                <td className={`num ${r.p_adjusted < 0.01 ? 'alarm' : 'muted'}`}>p {pValue(r.p_adjusted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
