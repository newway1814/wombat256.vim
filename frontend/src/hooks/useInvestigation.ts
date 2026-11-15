import { useCallback, useReducer, useRef } from 'react'
import { ApiError, streamChat } from '../api/client'
import type { AgentEvent, ChatMessage } from '../api/types'

export interface Step {
  id: string
  name: string
  arguments: Record<string, unknown>
  startedAt: Date
  status: 'running' | 'ok' | 'error'
  durationMs?: number
  rows?: number | null
  result?: Record<string, unknown>
}

export interface Turn {
  question: string
  askedAt: Date
  steps: Step[]
  answer?: string
  answeredAt?: Date
  notice?: string // stopped at the step limit, or an error
  finished: boolean
}

type Action =
  | { type: 'ask'; question: string }
  | { type: 'event'; event: AgentEvent }
  | { type: 'fail'; message: string }
  | { type: 'reset' }

function updateLast(turns: Turn[], fn: (t: Turn) => Turn): Turn[] {
  return turns.length ? [...turns.slice(0, -1), fn(turns[turns.length - 1])] : turns
}

function reducer(turns: Turn[], action: Action): Turn[] {
  switch (action.type) {
    case 'reset':
      return []
    case 'ask':
      return [...turns, { question: action.question, askedAt: new Date(), steps: [], finished: false }]
    case 'fail':
      return updateLast(turns, (t) => ({ ...t, notice: action.message, finished: true }))
    case 'event': {
      const e = action.event
      return updateLast(turns, (t) => {
        switch (e.type) {
          case 'tool_call':
            return {
              ...t,
              steps: [
                ...t.steps,
                { id: e.id, name: e.name, arguments: e.arguments, startedAt: new Date(), status: 'running' },
              ],
            }
          case 'tool_result':
            return {
              ...t,
              steps: t.steps.map((s) =>
                s.id === e.id
                  ? { ...s, status: e.ok ? 'ok' : 'error', durationMs: e.duration_ms, rows: e.rows, result: e.result }
                  : s,
              ),
            }
          case 'message':
            return { ...t, answer: e.content, answeredAt: new Date() }
          case 'stopped':
            return { ...t, notice: e.reason }
          case 'error':
            return { ...t, notice: `The investigation failed: ${e.message}` }
          case 'done':
            return { ...t, finished: true }
        }
      })
    }
  }
}

/** One conversation with the agent: every turn, its live steps, and its answer. */
export function useInvestigation(onFinished?: () => void) {
  const [turns, dispatch] = useReducer(reducer, [])
  const abort = useRef<AbortController | null>(null)
  const running = turns.length > 0 && !turns[turns.length - 1].finished

  const ask = useCallback(
    async (question: string) => {
      const history: ChatMessage[] = turns.flatMap((t) =>
        t.answer
          ? [
              { role: 'user' as const, content: t.question },
              { role: 'assistant' as const, content: t.answer },
            ]
          : [],
      )
      dispatch({ type: 'ask', question })
      abort.current = new AbortController()
      try {
        await streamChat(question, history, (event) => dispatch({ type: 'event', event }), abort.current.signal)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const message =
          err instanceof ApiError
            ? err.code === 'no_model'
              ? `${err.message} For a demo without a key, start the backend with LLM_PROVIDER=demo.`
              : err.message
            : `Could not reach the server. It may be starting up (free hosting sleeps when idle); try again in a minute.`
        dispatch({ type: 'fail', message })
      } finally {
        onFinished?.()
      }
    },
    [turns, onFinished],
  )

  const reset = useCallback(() => {
    abort.current?.abort()
    dispatch({ type: 'reset' })
  }, [])

  return { turns, running, ask, reset }
}
