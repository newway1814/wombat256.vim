import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, streamChat } from './client'
import type { AgentEvent } from './types'

function sseResponse(chunks: string[], status = 200): Response {
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c))
      controller.close()
    },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

afterEach(() => vi.restoreAllMocks())

describe('streamChat', () => {
  it('parses events even when a network chunk splits one in half', async () => {
    const e1 = 'event: tool_call\ndata: {"type":"tool_call","step":1,"id":"a","name":"spc_chart","arguments":{}}\n\n'
    const e2 = 'event: message\ndata: {"type":"message","content":"done: ETCH-03-B"}\n\n'
    const e3 = 'event: done\ndata: {"type":"done"}\n\n'
    const all = e1 + e2 + e3
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([all.slice(0, 30), all.slice(30, 120), all.slice(120)]))

    const events: AgentEvent[] = []
    await streamChat('q', [], (e) => events.push(e))
    expect(events.map((e) => e.type)).toEqual(['tool_call', 'message', 'done'])
    expect(events[1]).toEqual({ type: 'message', content: 'done: ETCH-03-B' })
  })

  it('turns an error response into an ApiError with its code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'no_model', message: 'No model configured.' } }), { status: 503 }),
    )
    const err = await streamChat('q', [], () => {}).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 503, code: 'no_model', message: 'No model configured.' })
  })
})
