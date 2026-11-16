// The pictures inside the thread: drawn straight onto the page, no boxes.
/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are free-form JSON */
import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { LotDetail, WaferMap as WaferMapData } from '../../api/types'
import { binColor } from '../../domain'
import { pValue, shortDate } from '../../format'
import { SpcChart } from '../SpcChart'
import { WaferMap } from '../WaferMap'

/** Flagged lots as rows on one shared yield scale, with the limit and the baseline marked. */
export function LotStrip({ r, onOpen }: { r: any; onOpen: (id: string) => void }) {
  const ys = r.flagged.map((f: any) => f.yield_pct)
  const lo = Math.floor(Math.min(...ys, r.limit) - 2)
  const hi = Math.ceil(r.baseline_yield + 1)
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  return (
    <div className="lotrows" role="group" aria-label="Flagged lots by yield">
      <p className="lotrows-key mono">
        <span>
          <i className="dash" /> limit {r.limit.toFixed(1)}%
        </span>
        <span>
          <i className="solid" /> baseline {r.baseline_yield.toFixed(1)}%
        </span>
      </p>
      {r.flagged.map((f: any, i: number) => (
        <button
          key={f.id}
          type="button"
          className="lotrow"
          style={{ animationDelay: `${80 + i * 70}ms` }}
          onClick={() => onOpen(f.id)}
          aria-label={`${f.id}, ${f.yield_pct.toFixed(1)}% yield`}
        >
          <span className="mono">{f.id}</span>
          <span className="lotrow-track">
            <span className="lotrow-fill" style={{ width: at(f.yield_pct) }} />
            <span className="lotrow-mark dash" style={{ left: at(r.limit) }} />
            <span className="lotrow-mark solid" style={{ left: at(r.baseline_yield) }} />
          </span>
          <span className="mono">{f.yield_pct.toFixed(1)}%</span>
        </button>
      ))}
    </div>
  )
}

/** Bad wafers per chamber as thin bars, the shared chamber in the accent. */
export function ChamberBars({ r }: { r: any }) {
  const rows = r.ranking.slice(0, 4)
  const max = Math.max(...rows.map((x: any) => x.bad_in_chamber), 1)
  return (
    <ul className="bars">
      {rows.map((x: any, i: number) => {
        const hit = i === 0 && x.p_adjusted < 0.01
        return (
          <li key={`${x.step}-${x.chamber_id}`} className={hit ? 'hit' : undefined}>
            <span className="mono">{x.chamber_id}</span>
            <span className="bar-track">
              <span className="bar" style={{ width: `${(100 * x.bad_in_chamber) / max}%`, animationDelay: `${i * 80}ms` }} />
            </span>
            <span className="mono muted">p {pValue(x.p_adjusted)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** PM and alarms on a small time line. */
export function EventLine({ r }: { r: any }) {
  const events = [
    ...r.maintenance.map((m: any) => ({ at: m.performed_at, kind: 'pm' })),
    ...r.alarms.map((a: any) => ({ at: a.raised_at, kind: a.severity === 'ALARM' ? 'alarm' : 'warn' })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  if (!events.length) return null
  const t = (s: string) => Date.parse(s)
  const lo = t(events[0].at)
  const hi = t(events[events.length - 1].at)
  const at = (s: string) => `${hi === lo ? 50 : ((t(s) - lo) / (hi - lo)) * 100}%`
  return (
    <div className="eventline" role="img" aria-label={`${r.maintenance.length} maintenance events and ${r.alarm_count} alarms`}>
      <div className="strip-axis" />
      {events.map((e, i) => (
        <span key={i} className={`ev ${e.kind}`} style={{ left: at(e.at), animationDelay: `${i * 60}ms` }} title={`${e.kind.toUpperCase()} ${e.at.replace('T', ' ')}`} />
      ))}
      <span className="ev-label" style={{ left: '0%' }}>{shortDate(events[0].at)}</span>
      <span className="ev-label end" style={{ left: '100%' }}>{shortDate(events[events.length - 1].at)}</span>
      <span className="ev-key">
        <span className="ev pm static" /> PM <span className="ev warn static" /> alarm
      </span>
    </div>
  )
}

/** "10.9 → 18.3 W" set as type. */
export function BeforeAfter({ r, unit }: { r: any; unit: string }) {
  const significant = r.p_value < 0.01
  return (
    <p className="ba">
      <span>{r.mean_before.toFixed(1)}</span>
      <span className="ba-arrow">→</span>
      <span className={significant ? 'alarm' : undefined}>{r.mean_after.toFixed(1)}</span>
      <span className="ba-unit">{unit}</span>
      <span className="ba-note mono muted">
        {r.window_days} days either side · p {pValue(r.p_value)}
      </span>
    </p>
  )
}

export function Sources({ r, cited, onOpen }: { r: any; cited: Set<string>; onOpen?: (chunkId: string) => void }) {
  return (
    <ul className="srcs">
      {r.hits.map((h: any) => (
        <li key={h.chunk_id} className={cited.has(h.chunk_id) ? 'cited' : undefined}>
          {onOpen ? (
            <button type="button" className="linkish mono" onClick={() => onOpen(h.chunk_id)}>
              {h.chunk_id}
            </button>
          ) : (
            <span className="mono">{h.chunk_id}</span>
          )}
          <span>{h.doc_title.replace(/^[A-Z]+-[\w-]+ /, '')}</span>
        </li>
      ))}
    </ul>
  )
}

export function SpcView({ r, unit, label }: { r: any; unit: string; label: string }) {
  const ooc = new Set<number>(r.violations.map((v: any) => v.index))
  r.points.forEach((p: any, i: number) => {
    if (p.mean > p.ucl || p.mean < p.lcl) ooc.add(i)
  })
  return (
    <div className="visual-wide">
      <SpcChart points={r.points} centre={r.centre} pmAt={r.pm_at} outOfControl={ooc} unit={unit} label={label} />
    </div>
  )
}

/** A wafer map fetched on demand, with a one-line legend. */
export function WaferView({ waferId }: { waferId: string }) {
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
  if (error) return <p className="alarm small">{error}</p>
  if (!map) return <p className="muted small">Loading {waferId}…</p>
  const fails = Object.entries(map.bin_counts)
    .filter(([b]) => b !== '1')
    .sort((a, b) => b[1] - a[1])
  return (
    <figure className="waferfig">
      <WaferMap data={map} die={11} label={`Wafer map of ${waferId}`} />
      <figcaption>
        <span className="mono">{waferId}</span>
        <span className="muted">{map.yield_pct.toFixed(1)}% yield</span>
        <span className="legend">
          <span>
            <i style={{ background: binColor(1) }} /> pass
          </span>
          {fails.slice(0, 3).map(([b]) => (
            <span key={b}>
              <i style={{ background: binColor(Number(b)) }} /> bin {b}
            </span>
          ))}
        </span>
      </figcaption>
    </figure>
  )
}

/** A lot opened from the thread: its worst wafers, each opening its map in place. */
export function LotView({ lot, onWafer, wafer }: { lot: LotDetail; onWafer: (id: string) => void; wafer: string | null }) {
  const worst = [...lot.wafers].sort((a, b) => a.yield_pct - b.yield_pct).slice(0, 4)
  return (
    <section className="lotview" aria-label={`Lot ${lot.id}`}>
      <p className="lot-wafers">
        <span className="muted">Worst wafers</span>
        {worst.map((w) => (
          <button key={w.id} type="button" className={`linkish${wafer === w.id ? ' on' : ''}`} onClick={() => onWafer(w.id)}>
            <span className="mono">{w.id.slice(-2)}</span> {w.yield_pct.toFixed(0)}%
          </button>
        ))}
      </p>
      {wafer && <WaferView key={wafer} waferId={wafer} />}
    </section>
  )
}
