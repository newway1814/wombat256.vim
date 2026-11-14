import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { WaferMap as WaferMapData } from '../../api/types'
import { binColor } from '../../domain'
import { pct } from '../../format'
import { WaferMap } from '../WaferMap'
import { Panel } from './Panel'

interface Classification {
  label: string
  edge_fail_rate: number
  inner_fail_rate: number
}

const PATTERN: Record<string, string> = { edge_ring: 'Edge ring', cluster: 'Cluster', random: 'Random', clean: 'Clean' }

export function WaferMapCard({ waferId, classification }: { waferId: string; classification?: Classification }) {
  const [map, setMap] = useState<WaferMapData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api
      .waferMap(waferId)
      .then((m) => live && setMap(m))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [waferId])

  const abnormal = classification && (classification.label === 'edge_ring' || classification.label === 'cluster')
  const fails = map ? Object.entries(map.bin_counts).filter(([b]) => b !== '1').sort((a, b) => b[1] - a[1]) : []
  return (
    <Panel
      wide
      label={`Wafer map ${waferId}`}
      title={<span className="mono">{waferId}</span>}
      meta={map ? `${map.yield_pct.toFixed(1)}% yield` : undefined}
    >
      <div className="panel-body">
        {error && <p className="alarm">{error}</p>}
        {!map && !error && <p className="muted">Loading…</p>}
        {map && (
          <div className="wafer-wrap">
            <WaferMap
              data={map}
              label={`Wafer map of ${waferId}${classification ? `: ${PATTERN[classification.label]?.toLowerCase()}` : ''}`}
            />
            <div className="wafer-facts">
              {classification && (
                <div className="headline">
                  <span className={`big${abnormal ? ' warn' : ''}`}>{PATTERN[classification.label] ?? classification.label}</span>
                  <span className="muted">
                    {pct(100 * classification.edge_fail_rate, 0)} of edge dies fail, {pct(100 * classification.inner_fail_rate, 0)} inside
                  </span>
                </div>
              )}
              <ul className="legend">
                <li>
                  <span className="swatch" style={{ background: binColor(1) }} />
                  Pass <span className="mono muted">{map.bin_counts['1'] ?? 0}</span>
                </li>
                {fails.map(([bin, n]) => (
                  <li key={bin}>
                    <span className="swatch" style={{ background: binColor(Number(bin)) }} />
                    Bin {bin} <span className="mono muted">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
