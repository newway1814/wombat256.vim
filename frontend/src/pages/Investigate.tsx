import { useEffect, useRef, useState } from 'react'
import { Answer } from '../components/Answer'
import { Composer } from '../components/Composer'
import { Trace } from '../components/Trace'
import { Workspace } from '../components/Workspace'
import type { Turn } from '../hooks/useInvestigation'
import { useInvestigation } from '../hooks/useInvestigation'
import { clock } from '../format'

const SUGGESTIONS = [
  'Yield dropped on recent lots. Find the cause and recommend an action.',
  'Is ETCH-03-B in control since its last PM?',
  'Which chambers ran lot L2610040 at gate etch?',
]

function TurnView({ turn, running }: { turn: Turn; running: boolean }) {
  return (
    <div className="turn">
      <div className="msg">
        <div className="label">
          You <span className="mono" style={{ letterSpacing: 0 }}>{clock(turn.askedAt)}</span>
        </div>
        <p className="msg-text">{turn.question}</p>
      </div>
      <Trace steps={turn.steps} />
      {running && !turn.answer && (
        <p className="muted">
          Working · {turn.steps.length ? `step ${turn.steps.length}` : 'reading the question'}. Results open in the
          workspace as they arrive.
        </p>
      )}
      {turn.answer && (
        <div className="msg">
          <div className="label">
            FabCopilot{' '}
            <span className="mono" style={{ letterSpacing: 0 }}>
              {turn.answeredAt && clock(turn.answeredAt)}
            </span>
          </div>
          <Answer text={turn.answer} />
        </div>
      )}
      {turn.notice && <p className="notice">{turn.notice}</p>}
    </div>
  )
}

export function Investigate({ onChanged }: { onChanged: () => void }) {
  const { turns, running, ask, reset } = useInvestigation(onChanged)
  const [panel, setPanel] = useState(true)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const last = turns[turns.length - 1]

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const start = (q: string) => {
    setPanel(true)
    void ask(q)
  }

  if (!last) {
    return (
      <main className="home">
        <div className="home-inner">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1>What should we look into?</h1>
            <p className="muted">
              FabCopilot reads lots, wafer maps, chamber sensors and maintenance records. It can draft a work order;
              only you can approve one.
            </p>
          </div>
          <Composer
            label="Question"
            placeholder="e.g. Yield dropped on recent lots. Find the cause."
            onSend={start}
            autoFocus
            value={draft}
            onValueChange={setDraft}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="label">Try</span>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => start(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  const showPanel = panel && last.steps.length + (last.finished ? 0 : 1) > 0
  return (
    <main className="investigate">
      <section aria-label="Conversation" className={`panel conversation${showPanel ? '' : ' alone'}`}>
        <div className="panel-head" style={{ paddingRight: 8 }}>
          <h2>Investigation</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {!showPanel && last.steps.length > 0 && (
              <button type="button" className="btn btn-small" onClick={() => setPanel(true)}>
                Show workspace
              </button>
            )}
            <button
              type="button"
              className="btn btn-small muted"
              onClick={() => {
                reset()
                setDraft('')
              }}
            >
              New investigation
            </button>
          </div>
        </div>
        <div className="conversation-scroll" ref={scrollRef}>
          {turns.map((t, i) => (
            <TurnView key={t.askedAt.getTime()} turn={t} running={running && i === turns.length - 1} />
          ))}
        </div>
        <Composer
          compact
          label="Follow-up"
          placeholder={running ? 'Wait for this investigation to finish' : 'Ask a follow-up'}
          onSend={start}
          disabled={running}
        />
      </section>
      {showPanel && <Workspace turn={last} onHide={() => setPanel(false)} onChanged={onChanged} />}
    </main>
  )
}
