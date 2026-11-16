/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are free-form JSON */
import { useEffect, useRef, useState } from 'react'
import type { Ticket } from '../api/types'
import { woName } from '../format'
import { StepLog } from '../components/chat/StepLog'
import { Composer } from '../components/Composer'
import { Prose, type Resolve } from '../components/Prose'
import { isRunning, type Conversation, type Turn } from '../hooks/useConversations'
import { useWorkspace } from '../workspace'

const SUGGESTIONS = [
  'Yield dropped on recent lots. Find the cause and recommend an action.',
  'Is ETCH-03-B in control since its last PM?',
  'Which chambers ran lot L2610040?',
]

export function Chat({
  conv,
  onAsk,
  onStop,
  demo,
}: {
  conv: Conversation | undefined
  onAsk: (q: string) => void
  onStop: () => void
  demo: boolean
}) {
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const [away, setAway] = useState(false)
  const running = isRunning(conv)
  const last = conv?.turns[conv.turns.length - 1]
  const progress = last ? `${conv?.id}:${conv?.turns.length}:${last.steps.length}:${last.steps.filter((s) => s.status !== 'running').length}:${last.answer ? 1 : 0}` : ''

  // Follow the conversation as it grows, unless the reader has scrolled up.
  useEffect(() => {
    const el = scroller.current
    if (el && !away) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow only when content grows
  }, [progress])

  // A different chat opens at its end.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
    setAway(false)
  }, [conv?.id])

  const onScroll = () => {
    const el = scroller.current
    if (el) setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 160)
  }
  const toBottom = () => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })

  if (!conv) {
    return (
      <div className="home">
        <div className="home-inner">
          <h1>What should we look into?</h1>
          <Composer
            label="Question"
            placeholder="Ask about lots, wafers or chambers"
            onSend={onAsk}
            autoFocus
            value={draft}
            onValueChange={setDraft}
          />
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => onAsk(s)}>
                {s}
              </button>
            ))}
          </div>
          {demo && (
            <p className="home-note">
              Demo mode: a scripted model runs the real tools on synthetic fab data, and always investigates the same
              yield drop.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scroller} onScroll={onScroll}>
        <div className="chat-col">
          {conv.turns.map((t, i) => (
            <TurnView key={t.id} convId={conv.id} turn={t} running={running && i === conv.turns.length - 1} />
          ))}
        </div>
      </div>
      <div className="chat-dock">
        <button type="button" className={`jump${away ? ' show' : ''}`} onClick={toBottom} aria-label="Jump to latest" tabIndex={away ? 0 : -1}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 2v10M2.5 7.5L7 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <Composer
          compact
          label="Follow-up"
          placeholder={running ? 'Working…' : 'Ask a follow-up'}
          onSend={onAsk}
          disabled={running}
          onStop={running ? onStop : undefined}
        />
      </div>
    </div>
  )
}

function TurnView({ convId, turn, running }: { convId: string; turn: Turn; running: boolean }) {
  const { open, showing, hide } = useWorkspace()
  const trace = { kind: 'trace' as const, convId, turnId: turn.id }
  const shown = showing(trace)
  const [copied, setCopied] = useState(false)
  const ticket = turn.steps.find((s) => s.name === 'draft_work_order' && s.status === 'ok')?.result as unknown as
    | Ticket
    | undefined

  const stepFor = (pred: (name: string, r: any) => boolean) => turn.steps.find((s) => s.status === 'ok' && pred(s.name, s.result))
  const resolve: Resolve = (kind, id) => {
    if (kind === 'cite') return () => open({ kind: 'source', convId, turnId: turn.id, chunkId: id })
    if (kind === 'lot') return () => open({ kind: 'lot', convId, lotId: id.slice(0, 8) })
    const step =
      stepFor((n, r) => n === 'spc_chart' && r?.chamber_id === id) ??
      stepFor((n, r) => n === 'get_chamber_events' && r?.chamber_id === id) ??
      stepFor((n, r) => n === 'find_commonality' && r?.ranking?.some((x: any) => x.chamber_id === id))
    return step ? () => open({ kind: 'step', convId, turnId: turn.id, stepId: step.id }) : null
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(turn.answer ?? '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked: nothing to do */
    }
  }

  return (
    <section className="turn" aria-label={turn.question}>
      <div className="q">
        <p>{turn.question}</p>
      </div>
      <StepLog convId={convId} turn={turn} running={running} />
      {turn.answer && (
        <div className="a">
          <Prose text={turn.answer} resolve={resolve} />
          {ticket && (
            <button type="button" className={`wo-line ${ticket.status.toLowerCase()}`} onClick={() => open({ kind: 'wo', convId, ticketId: ticket.id })}>
              <span className="mono">{woName(ticket.id)}</span>
              <span>
                {ticket.status === 'DRAFT'
                  ? 'needs your approval'
                  : `${ticket.status === 'APPROVED' ? 'approved' : 'rejected'} by ${ticket.decided_by}`}
              </span>
              <span className="wo-go">{ticket.status === 'DRAFT' ? 'Review' : 'Open'} →</span>
            </button>
          )}
          <div className="a-actions">
            <button type="button" className="icon" onClick={copy} aria-label={copied ? 'Copied' : 'Copy answer'} title={copied ? 'Copied' : 'Copy'}>
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />
                  <path d="M9.5 4.5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h1.5" />
                </svg>
              )}
            </button>
            <button type="button" className="textlink" aria-pressed={shown} onClick={() => (shown ? hide() : open(trace))}>
              {shown ? 'Hide evidence' : 'Show evidence'}
            </button>
          </div>
        </div>
      )}
      {turn.notice && <p className="notice">{turn.notice}</p>}
    </section>
  )
}
