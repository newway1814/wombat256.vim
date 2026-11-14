import { pValue, pct } from '../../format'
import { Panel } from './Panel'

interface Row {
  step: string
  chamber_id: string
  bad_in_chamber: number
  wafers_in_chamber: number
  bad_rate_in: number
  bad_rate_out: number
  p_adjusted: number
}

export function CommonalityCard({ result }: { result: { bad_wafers: number; wafers: number; ranking: Row[] } }) {
  const rows = result.ranking
  return (
    <Panel
      label="Commonality"
      title="Commonality"
      meta={`find_commonality · ${result.bad_wafers} bad of ${result.wafers} wafers`}
    >
      <div className="table-box">
        <table className="data">
          <thead>
            <tr>
              <th>Step</th>
              <th>Chamber</th>
              <th className="num">Bad / run</th>
              <th className="num">Bad rate</th>
              <th className="num">Elsewhere</th>
              <th className="num">p (adj.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const significant = r.p_adjusted < 0.01
              return (
                <tr key={`${r.step}-${r.chamber_id}`} className={i === 0 && significant ? 'top' : undefined}>
                  <td className="mono muted">{r.step}</td>
                  <td className="mono">{r.chamber_id}</td>
                  <td className="num">
                    {r.bad_in_chamber} / {r.wafers_in_chamber}
                  </td>
                  <td className="num">{pct(100 * r.bad_rate_in)}</td>
                  <td className="num muted">{pct(100 * r.bad_rate_out)}</td>
                  <td className={`num ${significant ? 'alarm' : 'muted'}`}>{pValue(r.p_adjusted)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
