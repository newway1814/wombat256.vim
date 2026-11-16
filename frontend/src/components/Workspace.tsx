import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { LotDetail, Ticket } from '../api/types'
import type { Step, Turn } from '../hooks/useInvestigation'
import { ChamberEventsCard } from './cards/ChamberEventsCard'
import { CommonalityCard } from './cards/CommonalityCard'
import { FlaggedLotsCard } from './cards/FlaggedLotsCard'
import { LotCard } from './cards/LotCard'
import { Panel } from './cards/Panel'
import { PmCompareCard } from './cards/PmCompareCard'
import { SourcesCard } from './cards/SourcesCard'
import { SpcCard } from './cards/SpcCard'
import { SqlCard } from './cards/SqlCard'
import { TicketCard } from './cards/TicketCard'
import { WaferMapCard } from './cards/WaferMapCard'

type Extra = { key: string; kind: 'lot'; lot: LotDetail } | { key: string; kind: 'wafer'; waferId: string }

/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are free-form JSON */
function StepCard({
  step,
  cited,
  onOpenLot,
  onOpenWafer,
  onChanged,
}: {
  step: Step
  cited: Set<string>
  onOpenLot: (id: string) => void
  onOpenWafer: (id: string) => void
  onChanged: () => void
}) {
  const r = step.result as any
  if (step.status === 'error') {
    return (
      <Panel label={`${step.name} failed`} title={<span className="mono">{step.name}</span>} meta={<span className="alarm">failed</span>}>
        <p className="panel-body">{String(r?.error ?? 'Unknown error')}</p>
      </Panel>
    )
  }
  switch (step.name) {
    case 'check_lot_yields':
      return <FlaggedLotsCard result={r} onOpenLot={onOpenLot} />
    case 'find_commonality':
      return <CommonalityCard result={r} />
    case 'get_lot':
      return <LotCard lot={r} onOpenWafer={onOpenWafer} />
    case 'classify_wafer_map':
      return <WaferMapCard waferId={r.wafer_id} classification={r} />
    case 'spc_chart':
      return <SpcCard result={r} />
    case 'compare_around_pm':
      return <PmCompareCard result={r} />
    case 'get_chamber_events':
      return <ChamberEventsCard result={r} />
    case 'search_docs':
      return <SourcesCard result={r} cited={cited} />
    case 'draft_work_order':
      return <TicketCard initial={r as Ticket} onDecided={onChanged} />
    case 'run_sql':
      return <SqlCard result={r} sql={String(step.arguments.sql ?? '')} />
    default:
      return null
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function Workspace({
  turn,
  onHide,
  onChanged,
}: {
  turn: Turn
  onHide: () => void
  onChanged: () => void
}) {
  const [extras, setExtras] = useState<Extra[]>([])
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // A new question starts a clean workspace.
  useEffect(() => setExtras([]), [turn.askedAt])

  const done = turn.steps.filter((s) => s.status !== 'running').length
  const runningStep = turn.steps.find((s) => s.status === 'running')
  const total = Math.max(turn.steps.length, 1)
  const cited = new Set([...(turn.answer ?? '').matchAll(/\[([A-Z]+-[\w-]+#\d+)\]/g)].map((m) => m[1]))

  const addExtra = (extra: Extra) => {
    setExtras((xs) => [...xs.filter((x) => x.key !== extra.key), extra])
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
  }
  const openWafer = (waferId: string) => addExtra({ key: `wafer-${waferId}`, kind: 'wafer', waferId })
  const openLot = async (lotId: string) => {
    setError(null)
    try {
      const lot = await api.lot(lotId)
      addExtra({ key: `lot-${lotId}`, kind: 'lot', lot })
      const worst = [...lot.wafers].sort((a, b) => a.yield_pct - b.yield_pct)[0]
      if (worst) openWafer(worst.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section className="workspace" aria-label="Workspace">
      <div className="panel workspace-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>Workspace</h2>
          <span className="live" aria-live="polite">
            <span className={`live-dot${turn.finished ? '' : ' on'}`} />
            {turn.finished ? 'Done' : runningStep ? runningStep.name : 'thinking'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            className="progress"
            role="progressbar"
            aria-label="Tool calls finished"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            <div style={{ width: `${turn.finished ? 100 : Math.round((100 * done) / (total + 1))}%` }} />
          </div>
          <button type="button" className="icon-btn" onClick={onHide} aria-label="Hide workspace">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="cards">
        {turn.steps
          .filter((s) => s.status !== 'running')
          .map((s) => (
            <StepCard key={s.id} step={s} cited={cited} onOpenLot={openLot} onOpenWafer={openWafer} onChanged={onChanged} />
          ))}
        {extras.map((x) =>
          x.kind === 'lot' ? (
            <LotCard key={x.key} lot={x.lot} onOpenWafer={openWafer} />
          ) : (
            <WaferMapCard key={x.key} waferId={x.waferId} />
          ),
        )}
        {error && <p className="alarm wide">{error}</p>}
        {!turn.finished && (
          <section className="panel pending wide" aria-label="In progress">
            <span className="mono muted" style={{ fontSize: 12 }}>
              {runningStep ? `Running ${runningStep.name}…` : 'Choosing the next step…'}
            </span>
            <div className="skeleton" style={{ width: '60%' }} />
            <div className="skeleton" style={{ width: '85%' }} />
            <div className="skeleton" style={{ width: '40%' }} />
          </section>
        )}
        {turn.finished && turn.steps.length === 0 && (
          <p className="empty wide">This answer needed no tool calls.</p>
        )}
      </div>
      <div ref={endRef} />
    </section>
  )
}
