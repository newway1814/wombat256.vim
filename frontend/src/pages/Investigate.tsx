import { useEffect, useRef, useState } from 'react'
import { Answer } from '../components/Answer'
import { Composer } from '../components/Composer'
import { Trace } from '../components/Trace'
import { Workspace } from '../components/Workspace'
import type { Turn } from '../hooks/useInvestigation'
import { useInvestigation } from '../hooks/useInvestigation'

const SUGGESTIONS = [
  'Yield dropped on recent lots. Find the cause and recommend an action.',
  'Is ETCH-03-B in control since its last PM?',
  'Which chambers ran lot L2610040?',
]

function TurnView({ turn, running }: { turn: Turn; running: boolean }) {
  return (
    <div className="turn">
      <p className="msg-text question">{turn.question}</p>
      <Trace steps={turn.steps} />
      {running && !turn.answer && <p className="muted">Working…</p>}
      {turn.answer && <Answer text={turn.answer} />}
      {turn.notice && <p className="notice">{turn.notice}</p>}
    </div>
  )
}

export function Investigate({ onChanged, demo }: { onChanged: () => void; demo?: boolean }) {
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
              Demo: replays a recorded investigation on synthetic fab data, whatever you ask.
            </p>
          )}
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
              className="btn btn-small"
              onClick={() => {
                reset()
                setDraft('')
              }}
            >
              New
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
          placeholder={running ? 'Working…' : 'Ask a follow-up'}
          onSend={start}
          disabled={running}
        />
      </section>
      {showPanel && <Workspace turn={last} onHide={() => setPanel(false)} onChanged={onChanged} />}
    </main>
  )
}
