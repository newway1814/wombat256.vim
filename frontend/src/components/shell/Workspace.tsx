/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are free-form JSON */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { api } from '../../api/client'
import type { LotDetail, Ticket } from '../../api/types'
import type { Conversation, Turn } from '../../hooks/useConversations'
import { tabKey, type Tab } from '../../workspace'
import { woName } from '../../format'
import { Approval } from '../chat/Approval'
import { Beat } from '../thread/Beat'
import { TOOL_LABEL } from '../thread/findings'
import { LotView } from '../thread/visuals'

export const MIN_WIDTH = 340

function find(convs: Conversation[], convId: string, turnId: string) {
  const conv = convs.find((c) => c.id === convId)
  return { conv, turn: conv?.turns.find((t) => t.id === turnId) }
}

const citedIn = (turn: Turn) => new Set([...(turn.answer ?? '').matchAll(/\[([A-Z]+-[\w-]+#\d+)\]/g)].map((m) => m[1]))

function tabTitle(tab: Tab, convs: Conversation[]): string {
  switch (tab.kind) {
    case 'trace':
      return 'Investigation'
    case 'step': {
      const step = find(convs, tab.convId, tab.turnId).turn?.steps.find((s) => s.id === tab.stepId)
      const r = step?.result as any
      if (!step) return 'Step'
      if (step.name === 'spc_chart' && r?.chamber_id) return `SPC ${r.chamber_id}`
      if (step.name === 'get_lot' && r?.id) return r.id
      if (step.name === 'classify_wafer_map' && r?.wafer_id) return r.wafer_id
      return TOOL_LABEL[step.name] ?? step.name
    }
    case 'source':
      return tab.chunkId
    case 'lot':
      return tab.lotId
    case 'wo':
      return woName(tab.ticketId)
  }
}

/** The side panel: evidence opened from the chat, one tab per item, resizable. */
export function Workspace({
  tabs,
  active,
  bump,
  convs,
  width,
  expanded,
  onSelect,
  onClose,
  onHide,
  onExpand,
  onResize,
  onTicket,
  onOpen,
}: {
  tabs: Tab[]
  active: string | null
  bump: number
  convs: Conversation[]
  width: number
  expanded: boolean
  onSelect: (key: string) => void
  onClose: (key: string) => void
  onHide: () => void
  onExpand: () => void
  onResize: (w: number) => void
  onTicket: (convId: string, t: Ticket) => void
  onOpen: (t: Tab) => void
}) {
  const tab = tabs.find((t) => tabKey(t) === active) ?? tabs[tabs.length - 1]
  const strip = useRef<HTMLDivElement>(null)

  // Keep the active tab in view when many are open.
  useEffect(() => {
    strip.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  return (
    <aside className="ws" aria-label="Evidence">
      {!expanded && <Resizer width={width} onResize={onResize} />}
      <div className="ws-bar">
        <div className="ws-tabs" role="tablist" ref={strip}>
          {tabs.map((t) => {
            const key = tabKey(t)
            const on = tab && key === tabKey(tab)
            const live = t.kind === 'trace' && !find(convs, t.convId, t.turnId).turn?.finished
            return (
              <div key={key} className={`ws-tab${on ? ' on' : ''}`}>
                <button type="button" role="tab" aria-selected={on} onClick={() => onSelect(key)}>
                  {live && <span className="live-dot" aria-label="running" />}
                  {tabTitle(t, convs)}
                </button>
                <button type="button" className="ws-x" aria-label={`Close ${tabTitle(t, convs)}`} onClick={() => onClose(key)}>
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                    <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
        <button type="button" className="icon" aria-label={expanded ? 'Restore panel size' : 'Expand panel'} onClick={onExpand}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            {expanded ? (
              <path d="M6 2v4H2M8 12V8h4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            ) : (
              <path d="M8.5 2H12v3.5M5.5 12H2V8.5M12 2L8 6M2 12l4-4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            )}
          </svg>
        </button>
        <button type="button" className="icon" aria-label="Hide panel" onClick={onHide}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="1.5" y="2.5" width="11" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8.5 2.5v9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
      <div className="ws-body" key={`${tab ? tabKey(tab) : 'none'}:${bump}`}>
        {tab ? <TabView tab={tab} convs={convs} onTicket={onTicket} onOpen={onOpen} /> : null}
      </div>
    </aside>
  )
}

function TabView({
  tab,
  convs,
  onTicket,
  onOpen,
}: {
  tab: Tab
  convs: Conversation[]
  onTicket: (convId: string, t: Ticket) => void
  onOpen: (t: Tab) => void
}) {
  if (tab.kind === 'lot') return <LotTab lotId={tab.lotId} />
  if (tab.kind === 'wo') {
    const conv = convs.find((c) => c.id === tab.convId)
    const step = conv?.turns
      .flatMap((t) => t.steps)
      .find((s) => s.name === 'draft_work_order' && (s.result as any)?.id === tab.ticketId)
    if (!step) return <p className="ws-empty">This chat was deleted.</p>
    return <Approval ticket={step.result as unknown as Ticket} onDecided={(t) => onTicket(tab.convId, t)} />
  }
  const { turn } = find(convs, tab.convId, tab.turnId)
  if (!turn) return <p className="ws-empty">This chat was deleted.</p>
  const cited = citedIn(turn)
  const openSource = (chunkId: string) => onOpen({ kind: 'source', convId: tab.convId, turnId: tab.turnId, chunkId })

  if (tab.kind === 'trace') {
    const thinking = !turn.finished && !turn.steps.some((s) => s.status === 'running')
    return (
      <div className="ws-pad">
        <p className="ws-kicker">Investigation</p>
        <h2 className="ws-title">{turn.question}</h2>
        <ol className="thread" aria-label="Investigation steps">
          {turn.steps.map((s) => (
            <Beat key={s.id} step={s} cited={cited} onSource={openSource} />
          ))}
          {thinking && (
            <li className="beat running">
              <span className="node" aria-hidden="true" />
              <div className="beat-body">
                <p className="beat-finding muted">Deciding the next step…</p>
              </div>
            </li>
          )}
        </ol>
      </div>
    )
  }

  if (tab.kind === 'step') {
    const step = turn.steps.find((s) => s.id === tab.stepId)
    if (!step) return <p className="ws-empty">Step not found.</p>
    return (
      <div className="ws-pad">
        <ol className="thread single" aria-label="Step">
          <Beat step={step} cited={cited} onSource={openSource} />
        </ol>
      </div>
    )
  }

  // A cited passage from the manuals or logs.
  const hits = turn.steps.filter((s) => s.name === 'search_docs' && s.status === 'ok').flatMap((s) => (s.result as any).hits)
  const hit = hits.find((h: any) => h.chunk_id === tab.chunkId)
  return (
    <div className="ws-pad">
      <p className="ws-kicker mono">{tab.chunkId}</p>
      {hit ? (
        <>
          <h2 className="ws-title">{hit.doc_title}</h2>
          {cited.has(tab.chunkId) && <p className="ws-note">Cited in the answer</p>}
          <div className="passage">{hit.text}</div>
          {hits.length > 1 && (
            <>
              <p className="ws-kicker">Also retrieved</p>
              <ul className="srcs">
                {hits
                  .filter((h: any) => h.chunk_id !== tab.chunkId)
                  .map((h: any) => (
                    <li key={h.chunk_id} className={cited.has(h.chunk_id) ? 'cited' : undefined}>
                      <button type="button" className="linkish mono" onClick={() => openSource(h.chunk_id)}>
                        {h.chunk_id}
                      </button>
                      <span>{h.doc_title.replace(/^[A-Z]+-[\w-]+ /, '')}</span>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p className="ws-empty">The agent cited this passage, but it was not in what the search returned.</p>
      )}
    </div>
  )
}

function LotTab({ lotId }: { lotId: string }) {
  const [lot, setLot] = useState<LotDetail | null>(null)
  const [wafer, setWafer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api
      .lot(lotId)
      .then((d) => {
        if (!live) return
        setLot(d)
        setWafer([...d.wafers].sort((a, b) => a.yield_pct - b.yield_pct)[0]?.id ?? null)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [lotId])
  return (
    <div className="ws-pad">
      <p className="ws-kicker">Lot</p>
      <h2 className="ws-title mono">{lotId}</h2>
      {error && <p className="alarm small">{error}</p>}
      {!lot && !error && <p className="muted">Loading…</p>}
      {lot && (
        <>
          <p className="ws-note">
            {lot.product} · {lot.wafers.length} wafers · {lot.mean_yield?.toFixed(1)}% mean yield
          </p>
          <LotView lot={lot} wafer={wafer} onWafer={setWafer} />
        </>
      )}
    </div>
  )
}

/** The drag handle between chat and panel. Arrow keys work too. */
function Resizer({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const start = useRef<{ x: number; w: number } | null>(null)
  const down = (e: PointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, w: width }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.documentElement.classList.add('resizing')
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current) onResize(start.current.w + (start.current.x - e.clientX))
  }
  const up = () => {
    start.current = null
    document.documentElement.classList.remove('resizing')
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') onResize(width + 24)
    if (e.key === 'ArrowRight') onResize(width - 24)
  }
  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      onDoubleClick={() => onResize(480)}
    />
  )
}
