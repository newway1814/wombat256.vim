import { useCallback, useEffect, useReducer, useRef } from 'react'
import { ApiError, streamChat } from '../api/client'
import type { AgentEvent, ChatMessage, Ticket } from '../api/types'

export interface Step {
  id: string
  name: string
  arguments: Record<string, unknown>
  startedAt: number
  status: 'running' | 'ok' | 'error'
  durationMs?: number
  rows?: number | null
  result?: Record<string, unknown>
}

export interface Turn {
  id: string
  question: string
  askedAt: number
  steps: Step[]
  answer?: string
  notice?: string // stopped at the step limit, or an error
  finished: boolean
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  turns: Turn[]
}

type Action =
  | { type: 'ask'; convId: string; turnId: string; question: string }
  | { type: 'event'; convId: string; event: AgentEvent }
  | { type: 'fail'; convId: string; message: string }
  | { type: 'remove'; convId: string }
  | { type: 'ticket'; convId: string; ticket: Ticket }

const KEY = 'fabcopilot.chats.v1'
const MAX_SAVED = 40

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export function titleFor(question: string): string {
  const q = question.replace(/\s+/g, ' ').trim()
  return q.length > 48 ? `${q.slice(0, 46).trimEnd()}…` : q
}

function onLastTurn(conv: Conversation, fn: (t: Turn) => Turn): Conversation {
  const turns = conv.turns
  if (!turns.length) return conv
  return { ...conv, updatedAt: Date.now(), turns: [...turns.slice(0, -1), fn(turns[turns.length - 1])] }
}

function applyEvent(t: Turn, e: AgentEvent): Turn {
  switch (e.type) {
    case 'tool_call':
      return {
        ...t,
        steps: [...t.steps, { id: e.id, name: e.name, arguments: e.arguments, startedAt: Date.now(), status: 'running' }],
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
      return { ...t, answer: e.content }
    case 'stopped':
      return { ...t, notice: e.reason }
    case 'error':
      return { ...t, notice: `The investigation failed: ${e.message}` }
    case 'done':
      return { ...t, finished: true }
  }
}

export function reducer(convs: Conversation[], a: Action): Conversation[] {
  const map = (fn: (c: Conversation) => Conversation) => convs.map((c) => (c.id === a.convId ? fn(c) : c))
  switch (a.type) {
    case 'ask': {
      const turn: Turn = { id: a.turnId, question: a.question, askedAt: Date.now(), steps: [], finished: false }
      const existing = convs.find((c) => c.id === a.convId)
      const conv: Conversation = existing
        ? { ...existing, updatedAt: Date.now(), turns: [...existing.turns, turn] }
        : { id: a.convId, title: titleFor(a.question), createdAt: Date.now(), updatedAt: Date.now(), turns: [turn] }
      // The conversation being worked on moves to the top of the list.
      return [conv, ...convs.filter((c) => c.id !== a.convId)]
    }
    case 'event':
      return map((c) => onLastTurn(c, (t) => applyEvent(t, a.event)))
    case 'fail':
      return map((c) => onLastTurn(c, (t) => ({ ...t, notice: a.message, finished: true })))
    case 'remove':
      return convs.filter((c) => c.id !== a.convId)
    case 'ticket':
      return map((c) => ({
        ...c,
        turns: c.turns.map((t) => ({
          ...t,
          steps: t.steps.map((s) =>
            s.name === 'draft_work_order' && (s.result as { id?: number } | undefined)?.id === a.ticket.id
              ? { ...s, result: a.ticket as unknown as Record<string, unknown> }
              : s,
          ),
        })),
      }))
  }
}

/** Saved chats from this browser. A turn still running when the page closed is marked as cut off. */
export function load(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY)
    const convs = raw ? (JSON.parse(raw) as Conversation[]) : []
    if (!Array.isArray(convs)) return []
    return convs.map((c) => ({
      ...c,
      turns: c.turns.map((t) =>
        t.finished
          ? t
          : {
              ...t,
              finished: true,
              notice: t.notice ?? 'This investigation was cut off when the page closed.',
              steps: t.steps.map((s) => (s.status === 'running' ? { ...s, status: 'error' as const } : s)),
            },
      ),
    }))
  } catch {
    return []
  }
}

function save(convs: Conversation[]) {
  let keep = convs.slice(0, MAX_SAVED)
  // On a full quota, drop the oldest chats until it fits.
  while (keep.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(keep))
      return
    } catch {
      keep = keep.slice(0, -1)
    }
  }
}

export const isRunning = (c: Conversation | undefined) => !!c && c.turns.length > 0 && !c.turns[c.turns.length - 1].finished

/** Every saved chat, and the one call that asks the agent and streams its steps into a chat. */
export function useConversations(onFinished?: () => void) {
  const [convs, dispatch] = useReducer(reducer, undefined, load)
  const aborts = useRef(new Map<string, AbortController>())
  const latest = useRef(convs)
  latest.current = convs

  useEffect(() => {
    const t = window.setTimeout(() => save(convs), 300)
    return () => window.clearTimeout(t)
  }, [convs])

  /** Ask in a chat (or start one when convId is null). Returns the chat's and the turn's ids at once. */
  const ask = useCallback(
    (convId: string | null, question: string): { convId: string; turnId: string } => {
      const id = convId ?? newId()
      const turnId = newId()
      const prior = latest.current.find((c) => c.id === id)
      const history: ChatMessage[] = (prior?.turns ?? []).flatMap((t) =>
        t.answer
          ? [
              { role: 'user' as const, content: t.question },
              { role: 'assistant' as const, content: t.answer },
            ]
          : [],
      )
      dispatch({ type: 'ask', convId: id, turnId, question })
      const ctrl = new AbortController()
      aborts.current.set(id, ctrl)
      streamChat(question, history, (event) => dispatch({ type: 'event', convId: id, event }), ctrl.signal)
        .catch((err: Error) => {
          const message =
            err.name === 'AbortError'
              ? 'Stopped.'
              : err instanceof ApiError
                ? err.code === 'no_model'
                  ? `${err.message} For a demo without a key, start the backend with LLM_PROVIDER=demo.`
                  : err.message
                : 'Could not reach the server. It may be starting up (free hosting sleeps when idle); try again in a minute.'
          dispatch({ type: 'fail', convId: id, message })
        })
        .finally(() => {
          aborts.current.delete(id)
          onFinished?.()
        })
      return { convId: id, turnId }
    },
    [onFinished],
  )

  const stop = useCallback((convId: string) => aborts.current.get(convId)?.abort(), [])

  const remove = useCallback((convId: string) => {
    aborts.current.get(convId)?.abort()
    dispatch({ type: 'remove', convId })
  }, [])

  const setTicket = useCallback((convId: string, ticket: Ticket) => dispatch({ type: 'ticket', convId, ticket }), [])

  return { convs, ask, stop, remove, setTicket }
}
