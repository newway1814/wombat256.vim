import { describe, expect, it } from 'vitest'
import { reducer, titleFor } from './useConversations'

describe('saved chats', () => {
  it('starts a chat, streams steps into it, and moves it to the top', () => {
    let s = reducer([], { type: 'ask', convId: 'a', turnId: 't1', question: 'First question' })
    s = reducer(s, { type: 'ask', convId: 'b', turnId: 't2', question: 'Second' })
    s = reducer(s, { type: 'event', convId: 'a', event: { type: 'tool_call', step: 1, id: 'x', name: 'get_lot', arguments: {} } })
    s = reducer(s, {
      type: 'event',
      convId: 'a',
      event: { type: 'tool_result', step: 1, id: 'x', name: 'get_lot', ok: true, duration_ms: 3, rows: null, result: {} },
    })
    s = reducer(s, { type: 'event', convId: 'a', event: { type: 'message', content: 'Done.' } })
    s = reducer(s, { type: 'event', convId: 'a', event: { type: 'done' } })
    expect(s.map((c) => c.id)).toEqual(['b', 'a'])
    const a = s.find((c) => c.id === 'a')!
    expect(a.turns[0]).toMatchObject({ answer: 'Done.', finished: true })
    expect(a.turns[0].steps[0]).toMatchObject({ status: 'ok', durationMs: 3 })

    // A follow-up in an existing chat brings it back to the top.
    s = reducer(s, { type: 'ask', convId: 'a', turnId: 't3', question: 'And then?' })
    expect(s[0].id).toBe('a')
    expect(s[0].turns).toHaveLength(2)
    expect(reducer(s, { type: 'remove', convId: 'a' }).map((c) => c.id)).toEqual(['b'])
  })

  it('titles a chat from its first question', () => {
    expect(titleFor('  Short  question ')).toBe('Short question')
    expect(titleFor('x'.repeat(80)).length).toBeLessThanOrEqual(48)
  })
})
