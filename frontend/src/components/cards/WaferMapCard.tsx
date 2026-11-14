import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { WaferMap as WaferMapData } from '../../api/types'
import { pct } from '../../format'
import { binColor } from '../../domain'
import { WaferMap } from '../WaferMap'
import { Panel } from './Panel'

interface Classification {
  label: string
  edge_fail_rate: number
  inner_fail_rate: number
  largest_cluster: number
}

const PATTERN: Record<string, string> = {
  edge_ring: 'Edge ring',
  cluster: 'Cluster',
  random: 'Random',
  clean: 'Clean',
}

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

  const abnormal = classification && classification.label !== 'clean' && classification.label !== 'random'
  return (
    <Panel
      wide
      label={`Wafer map ${waferId}`}
      title={
        <>
          Wafer map <span className="mono">{waferId}</span>
        </>
      }
      meta={map ? `${classification ? 'classify_wafer_map · ' : ''}${map.yield_pct.toFixed(2)}% yield` : undefined}
    >
      <div className="panel-body">
        {error && <p className="alarm">{error}</p>}
        {!map && !error && <p className="muted">Loading wafer map…</p>}
        {map && (
          <div className="wafer-wrap">
            <WaferMap
              data={map}
              label={`Wafer map of ${waferId}${classification ? `: ${PATTERN[classification.label]?.toLowerCase()}` : ''}`}
            />
            <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <table className="data" style={{ maxWidth: 320 }}>
                <thead>
                  <tr>
                    <th>Bin</th>
                    <th className="num">Dies</th>
                    <th className="num">%</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(map.bin_counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([bin, n]) => (
                      <tr key={bin}>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span className="swatch" style={{ background: binColor(Number(bin)) }} />
                            <span className="mono">{bin}</span>
                            <span className="muted">{bin === '1' ? 'pass' : ''}</span>
                          </span>
                        </td>
                        <td className="num">{n}</td>
                        <td className="num">{((100 * n) / map.die_total).toFixed(1)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {classification && (
                <dl className="kv" style={{ maxWidth: 320 }}>
                  <dt>Pattern</dt>
                  <dd className={abnormal ? 'warn' : undefined}>{PATTERN[classification.label] ?? classification.label}</dd>
                  <dt>Edge fails</dt>
                  <dd className="mono">{pct(100 * classification.edge_fail_rate)}</dd>
                  <dt>Inner fails</dt>
                  <dd className="mono">{pct(100 * classification.inner_fail_rate)}</dd>
                  <dt>Largest cluster</dt>
                  <dd className="mono">{classification.largest_cluster} dies</dd>
                </dl>
              )}
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
