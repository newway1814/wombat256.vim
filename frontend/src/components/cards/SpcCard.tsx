import { SpcChart, type SpcPoint } from '../SpcChart'
import { PARAMS } from '../../domain'
import { Panel } from './Panel'

interface Result {
  chamber_id: string
  param: string
  centre: number
  pm_at: string | null
  points: SpcPoint[]
  violations: { index: number }[]
  points_out_of_control?: number
  points_out_of_control_after_baseline?: number
  out_of_control: boolean
}

export function SpcCard({ result }: { result: Result }) {
  const p = PARAMS[result.param] ?? { name: result.param, unit: '' }
  // The tool trims its violation list; points outside the limits are always out of control.
  const ooc = new Set(result.violations.map((v) => v.index))
  result.points.forEach((pt, i) => {
    if (pt.mean > pt.ucl || pt.mean < pt.lcl) ooc.add(i)
  })
  const after = result.points_out_of_control_after_baseline ?? 0
  return (
    <Panel
      wide
      label={`SPC chart ${result.chamber_id}`}
      title={
        <>
          <span className="mono">{result.chamber_id}</span> · {p.name}
        </>
      }
      meta={
        result.out_of_control ? (
          <span className="alarm">
            {after} point{after === 1 ? '' : 's'} out of control
          </span>
        ) : (
          'in control'
        )
      }
    >
      <div className="panel-body" style={{ overflowX: 'auto' }}>
        <SpcChart
          points={result.points}
          centre={result.centre}
          pmAt={result.pm_at}
          outOfControl={ooc}
          unit={p.unit}
          label={`${p.name} for ${result.chamber_id}${result.out_of_control ? ', out of control after the baseline' : ', in control'}`}
        />
      </div>
    </Panel>
  )
}
