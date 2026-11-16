import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Ticket } from '../api/types'
import { Composer } from '../components/Composer'
import { Beat } from '../components/thread/Beat'
import { Verdict } from '../components/thread/Verdict'
import type { Turn } from '../hooks/useInvestigation'
import { useInvestigation } from '../hooks/useInvestigation'
import { clock } from '../format'

const SUGGESTIONS = [
  'Yield dropped on recent lots. Find the cause and recommend an action.',
  'Is ETCH-03-B in control since its last PM?',
  'Which chambers ran lot L2610040?',
]

/** One question and its investigation, told as a single thread from top to bottom. */
function Chapter({ turn, running, onChanged }: { turn: Turn; running: boolean; onChanged: () => void }) {
  const cited = new Set([...(turn.answer ?? '').matchAll(/\[([A-Z]+-[\w-]+#\d+)\]/g)].map((m) => m[1]))
  const done = turn.steps.filter((s) => s.status !== 'running').length
  const ms = turn.steps.reduce((t, s) => t + (s.durationMs ?? 0), 0)
  const ticket = turn.steps.find((s) => s.name === 'draft_work_order' && s.status === 'ok')?.result as unknown as
    | Ticket
    | undefined
  const thinking = running && !turn.answer && !turn.steps.some((s) => s.status === 'running')

  return (
    <article className="chapter">
      <header className="chapter-head">
        <p className="eyebrow mono">
          {clock(turn.askedAt)} · {running ? `step ${Math.max(done, 1)}` : `${done} steps · ${ms} ms in tools`}
        </p>
        <h1 className="chapter-q">{turn.question}</h1>
      </header>
      <ol className="thread" aria-label="Investigation steps">
        {turn.steps.map((s) => (
          <Beat key={s.id} step={s} cited={cited} />
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
      {turn.answer && <Verdict answer={turn.answer} ticket={ticket} onDecided={onChanged} />}
      {turn.notice && <p className="notice">{turn.notice}</p>}
    </article>
  )
}

export function Investigate({ onChanged, demo }: { onChanged: () => void; demo?: boolean }) {
  const { turns, running, ask, reset } = useInvestigation(onChanged)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const last = turns[turns.length - 1]
  const progress = last ? last.steps.length + (last.answer ? 1 : 0) : 0

  // Follow the thread as it grows.
  useEffect(() => {
    if (progress) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [progress, turns.length])

  // Pressing Enter on the home screen morphs the question box into the dock
  // (View Transitions API, where the browser has it).
  const start = (q: string) => {
    const go = () => void ask(q)
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!last && doc.startViewTransition && !calm) doc.startViewTransition(() => flushSync(go))
    else go()
  }

  if (!last) {
    return (
      <main className="home">
        <div className="home-inner">
          <h1>What should we look into?</h1>
          <Composer
            label="Question"
            placeholder="Ask about lots, wafers or chambers"
            onSend={start}
            autoFocus
            value={draft}
            onValueChange={setDraft}
          />
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => start(s)}>
                {s}
              </button>
            ))}
          </div>
          {demo && (
            <p className="muted small">
              Demo mode: no AI key is set, so a scripted model runs the real tools on synthetic fab data, and always
              investigates the same yield drop.
            </p>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="case">
      <div className="case-col">
        {turns.map((t, i) => (
          <Chapter key={t.askedAt.getTime()} turn={t} running={running && i === turns.length - 1} onChanged={onChanged} />
        ))}
        <div ref={endRef} className="case-end" />
      </div>
      <div className="dock">
        <button
          type="button"
          className="btn btn-small dock-new"
          onClick={() => {
            reset()
            setDraft('')
          }}
        >
          New
        </button>
        <Composer
          compact
          label="Follow-up"
          placeholder={running ? 'Working…' : 'Ask a follow-up'}
          onSend={start}
          disabled={running}
        />
      </div>
    </main>
  )
}
