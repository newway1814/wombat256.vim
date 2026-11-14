import { pValue } from '../../format'
import { Panel } from './Panel'
import { PARAMS } from '../../domain'

interface Result {
  chamber_id: string
  param: string
  pm_at: string
  window_days: number
  n_before: number
  n_after: number
  mean_before: number
  mean_after: number
  shift: number
  p_value: number
}

export function PmCompareCard({ result }: { result: Result }) {
  const p = PARAMS[result.param] ?? { name: result.param, unit: '' }
  const significant = result.p_value < 0.01
  return (
    <Panel
      label="Before and after PM"
      title={
        <>
          Before / after PM · <span className="mono">{result.chamber_id}</span>
        </>
      }
      meta={`compare_around_pm · ${result.window_days} days either side of ${result.pm_at.slice(0, 16).replace('T', ' ')}`}
    >
      <div className="panel-body">
        <dl className="stat-row">
          <div>
            <dt>Before</dt>
            <dd>
              {result.mean_before.toFixed(2)} {p.unit} · n {result.n_before}
            </dd>
          </div>
          <div>
            <dt>After</dt>
            <dd>
              {result.mean_after.toFixed(2)} {p.unit} · n {result.n_after}
            </dd>
          </div>
          <div>
            <dt>Shift</dt>
            <dd className={significant ? 'alarm' : undefined}>
              {result.shift >= 0 ? '+' : ''}
              {result.shift.toFixed(2)} {p.unit} · p {pValue(result.p_value)}
            </dd>
          </div>
        </dl>
      </div>
    </Panel>
  )
}
