/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are free-form JSON */
import { useState } from 'react'
import { api } from '../../api/client'
import type { LotDetail } from '../../api/types'
import { PARAMS } from '../../domain'
import type { Step } from '../../hooks/useConversations'
import { finding, TOOL_LABEL } from './findings'
import { BeforeAfter, ChamberBars, EventLine, LotStrip, LotView, Sources, SpcView, WaferView } from './visuals'

/** One step of the investigation: the tool, one plain sentence, and its picture. */
export function Beat({ step, cited, onSource }: { step: Step; cited: Set<string>; onSource?: (chunkId: string) => void }) {
  const [raw, setRaw] = useState(false)
  const [lot, setLot] = useState<LotDetail | null>(null)
  const [wafer, setWafer] = useState<string | null>(null)
  const [lotError, setLotError] = useState<string | null>(null)
  const r = step.result as any

  const openLot = async (id: string) => {
    setLotError(null)
    try {
      const detail = await api.lot(id)
      setLot(detail)
      setWafer([...detail.wafers].sort((a, b) => a.yield_pct - b.yield_pct)[0]?.id ?? null)
    } catch (e) {
      setLotError((e as Error).message)
    }
  }

  if (step.status === 'running') {
    return (
      <li className="beat running">
        <span className="node" aria-hidden="true" />
        <div className="beat-body">
          <span className="beat-tool mono">{step.name}</span>
          <p className="beat-finding muted">Working…</p>
        </div>
      </li>
    )
  }

  const label =
    step.name === 'spc_chart' && r?.chamber_id
      ? `SPC chart ${r.chamber_id}`
      : step.name === 'get_lot' && r?.id
        ? `Lot ${r.id}`
        : (TOOL_LABEL[step.name] ?? step.name)
  const p = r?.param ? (PARAMS[r.param] ?? { name: r.param, unit: '' }) : { name: '', unit: '' }

  let visual = null
  if (step.status === 'ok') {
    switch (step.name) {
      case 'check_lot_yields':
        visual = r.flagged.length ? <LotStrip r={r} onOpen={openLot} /> : null
        break
      case 'find_commonality':
        visual = <ChamberBars r={r} />
        break
      case 'get_lot':
        visual = <LotView lot={r} wafer={wafer} onWafer={setWafer} />
        break
      case 'classify_wafer_map':
        visual = <WaferView waferId={r.wafer_id} />
        break
      case 'spc_chart':
        visual = <SpcView r={r} unit={p.unit} label={`${p.name} for ${r.chamber_id}`} />
        break
      case 'compare_around_pm':
        visual = <BeforeAfter r={r} unit={p.unit} />
        break
      case 'get_chamber_events':
        visual = <EventLine r={r} />
        break
      case 'search_docs':
        visual = <Sources r={r} cited={cited} onOpen={onSource} />
        break
    }
  }

  return (
    <li className={`beat${step.status === 'error' ? ' failed' : ''}`}>
      <span className="node" aria-hidden="true" />
      <section className="beat-body" aria-label={label}>
        <button type="button" className="beat-tool mono" aria-expanded={raw} onClick={() => setRaw(!raw)}>
          {step.name}
          <span className="muted"> · {step.durationMs} ms</span>
        </button>
        <p className={`beat-finding${step.status === 'error' ? ' alarm' : ''}`}>
          {step.status === 'error' ? String(r?.error ?? 'This step failed.') : finding(step.name, r)}
        </p>
        {raw && <pre className="beat-raw">{JSON.stringify({ arguments: step.arguments, result: r }, null, 1)}</pre>}
        {visual && <div className="beat-visual">{visual}</div>}
        {lotError && <p className="alarm small">{lotError}</p>}
        {lot && step.name === 'check_lot_yields' && (
          <div className="beat-visual">
            <LotView lot={lot} wafer={wafer} onWafer={setWafer} />
          </div>
        )}
      </section>
    </li>
  )
}
