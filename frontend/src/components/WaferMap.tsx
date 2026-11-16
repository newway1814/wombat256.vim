import type { WaferMap as WaferMapData } from '../api/types'
import { binColor } from '../domain'


/** Square dies on a grid with 1px gaps, inside the wafer's outline. */
export function WaferMap({ data, die = 12, label }: { data: WaferMapData; die?: number; label: string }) {
  const xs = data.dies.map((d) => d.x)
  const ys = data.dies.map((d) => d.y)
  const minX = Math.min(...xs)
  const maxY = Math.max(...ys)
  const cols = Math.max(...xs) - minX + 1
  const rows = maxY - Math.min(...ys) + 1
  const gridW = cols * die + (cols - 1)
  const gridH = rows * die + (rows - 1)
  const size = Math.max(gridW, gridH) + 2 * die
  return (
    <div className="wafer" role="img" aria-label={label} style={{ width: size, height: size }}>
      <div className="wafer-outline" />
      <div
        className="wafer-grid"
        style={{
          left: (size - gridW) / 2,
          top: (size - gridH) / 2,
          gridTemplateColumns: `repeat(${cols}, ${die}px)`,
          gridAutoRows: `${die}px`,
        }}
      >
        {data.dies.map((d) => (
          <div
            key={`${d.x},${d.y}`}
            className="die"
            style={{
              gridColumn: d.x - minX + 1,
              gridRow: maxY - d.y + 1,
              background: binColor(d.bin),
              animationDelay: `${Math.round(Math.hypot(d.x, d.y) * 28)}ms`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
