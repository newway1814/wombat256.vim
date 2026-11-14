import { PARAMS } from '../../domain'
import { pValue } from '../../format'
import { Panel } from './Panel'

interface Result {
  chamber_id: string
  param: string
  pm_at: string
  window_days: number
  mean_before: number
  mean_after: number
  shift: number
  p_value: number
}

export function PmCompareCard({ result }: { result: Result }) {
  const p = PARAMS[result.param] ?? { name: result.param, unit: '' }
  const significant = result.p_value < 0.01
  return (
    <Panel label="Before and after PM" title="Before / after PM" meta={`PM ${result.pm_at.slice(0, 10)}`}>
      <div className="headline panel-body">
        <span className="big mono">
          {result.mean_before.toFixed(1)} → <span className={significant ? 'alarm' : undefined}>{result.mean_after.toFixed(1)}</span> {p.unit}
        </span>
        <span className="muted">
          {p.name}, {result.window_days} days either side · p {pValue(result.p_value)}
        </span>
      </div>
    </Panel>
  )
}
