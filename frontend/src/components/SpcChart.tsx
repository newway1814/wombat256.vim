import { shortDate } from '../format'

export interface SpcPoint {
  at: string
  mean: number
  ucl: number
  lcl: number
  baseline: boolean
  lot_id?: string
}

interface Props {
  points: SpcPoint[]
  centre: number
  pmAt: string | null
  outOfControl: Set<number>
  unit: string
  label: string
}

const W = 760
const H = 236
const L = 48 // y labels
const R = 112 // limit labels
const T = 18
const B = 32

/** X-bar chart: thin data line, dashed limits labelled at the right edge, PM marker, no legend. */
export function SpcChart({ points, centre, pmAt, outOfControl, unit, label }: Props) {
  if (!points.length) return <p className="empty">No sensor data for this chamber.</p>
  const values = points.flatMap((p) => [p.mean, p.ucl, p.lcl])
  const pad = (Math.max(...values) - Math.min(...values)) * 0.08 || 1
  const lo = Math.min(...values) - pad
  const hi = Math.max(...values) + pad
  const plotW = W - L - R
  const plotH = H - T - B
  const step = points.length > 1 ? (plotW - 24) / (points.length - 1) : 0
  const x = (i: number) => L + 12 + i * step
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * plotH
  const steps = (key: 'ucl' | 'lcl') =>
    points.map((p, i) => `${x(i) - step / 2},${y(p[key])} ${x(i) + step / 2},${y(p[key])}`).join(' ')
  const ticks = niceTicks(lo, hi, 4)
  const pmIndex = pmAt ? points.findIndex((p) => p.at >= pmAt) : -1
  const pmX = pmIndex > 0 ? (x(pmIndex - 1) + x(pmIndex)) / 2 : null
  const last = points[points.length - 1]
  const xTicks = [...new Set([0, Math.round((points.length - 1) / 3), Math.round((2 * (points.length - 1)) / 3), points.length - 1])]

  // Right-edge labels, nudged apart so they never overlap.
  const right = spread(
    [
      { text: `UCL ${last.ucl.toFixed(2)}`, y: y(last.ucl), cls: 'muted' },
      { text: `CL ${centre.toFixed(2)}`, y: y(centre), cls: 'muted' },
      { text: `LCL ${last.lcl.toFixed(2)}`, y: y(last.lcl), cls: 'muted' },
      ...(outOfControl.has(points.length - 1)
        ? [{ text: `${last.mean.toFixed(2)} ${unit}`, y: y(last.mean), cls: 'alarm' }]
        : []),
    ],
    13,
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 900, display: 'block' }} role="img" aria-label={label}>
      <g fontFamily="var(--mono)" fontSize="11">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={L + plotW} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
        <line x1={L} x2={L + plotW} y1={y(centre)} y2={y(centre)} stroke="var(--muted)" />
        <polyline points={steps('ucl')} fill="none" stroke="var(--muted)" strokeDasharray="4 3" />
        <polyline points={steps('lcl')} fill="none" stroke="var(--muted)" strokeDasharray="4 3" />
        {pmX !== null && (
          <g>
            <line x1={pmX} x2={pmX} y1={T - 4} y2={T + plotH} stroke="var(--accent)" />
            <text x={pmX + 6} y={T - 6} fill="var(--accent)">
              PM {pmAt!.slice(5, 16).replace('T', ' ')}
            </text>
          </g>
        )}
        <polyline
          className="spc-line"
          pathLength={1}
          points={points.map((p, i) => `${x(i)},${y(p.mean)}`).join(' ')}
          fill="none"
          stroke="var(--text)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            className="spc-dot"
            style={{ animationDelay: `${200 + (900 * i) / points.length}ms` }}
            cx={x(i)}
            cy={y(p.mean)}
            r={outOfControl.has(i) ? 3.5 : 2.5}
            fill={outOfControl.has(i) ? 'var(--alarm)' : 'var(--text)'}
          >
            <title>{`${p.lot_id ?? ''} ${p.at.replace('T', ' ')}  ${p.mean.toFixed(3)} ${unit}`}</title>
          </circle>
        ))}
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fill="var(--muted)">
            {shortDate(points[i].at)}
          </text>
        ))}
        {right.map((r) => (
          <text
            key={r.text}
            x={L + plotW + 8}
            y={r.y + 4}
            fill={r.cls === 'alarm' ? 'var(--alarm)' : 'var(--muted)'}
            fontWeight={r.cls === 'alarm' ? 500 : 400}
          >
            {r.text}
          </text>
        ))}
      </g>
    </svg>
  )
}

function niceTicks(lo: number, hi: number, count: number): number[] {
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Number(v.toFixed(6)))
  return out
}

function spread<T extends { y: number }>(items: T[], gap: number): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < gap) sorted[i] = { ...sorted[i], y: sorted[i - 1].y + gap }
  }
  return sorted
}
