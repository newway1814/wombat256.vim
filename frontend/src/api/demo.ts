// Static demo: the same API surface as client.ts, served from a recording in /demo/.
// Used for static hosting (Netlify), where the Python backend can't run. The recording is a
// real demo-mode investigation on the fake fab; approvals and the audit log live in memory.
import type {
  AgentEvent,
  AuditEntry,
  LotDetail,
  LotSummary,
  Status,
  Ticket,
  WaferMap,
} from './types'

type CompactMap = Omit<WaferMap, 'dies'> & { d: [number, number, number][] }

const cache = new Map<string, Promise<unknown>>()
function load<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    cache.set(
      file,
      fetch(`${import.meta.env.BASE_URL}demo/${file}`).then((r) => {
        if (!r.ok) throw new Error(`Not in this demo (${r.status})`)
        return r.json()
      }),
    )
  }
  return cache.get(file) as Promise<T>
}

const tickets: Ticket[] = []
const audit: AuditEntry[] = []
const now = () => new Date().toISOString().slice(0, 19)
function log(actor: string, action: string, detail: Record<string, unknown>) {
  audit.unshift({ id: audit.length + 1, at: now(), actor, action, detail })
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

export const demoApi = {
  status: async (): Promise<Status> => ({
    ...(await load<Status>('status.json')),
    open_work_orders: tickets.filter((t) => t.status === 'DRAFT').length,
  }),
  lots: (limit = 50) =>
    load<{ items: LotSummary[]; total: number }>('lots.json').then((r) => ({ ...r, items: r.items.slice(0, limit) })),
  lot: async (id: string) => {
    const lot = (await load<Record<string, LotDetail>>('lot-details.json'))[id]
    if (!lot) throw new Error(`Lot ${id} not found`)
    return lot
  },
  waferMap: async (id: string): Promise<WaferMap> => {
    const lotId = id.replace(/-\d+$/, '')
    const map = (await load<Record<string, CompactMap>>(`maps/${lotId}.json`))[id]
    if (!map) throw new Error(`This demo includes the worst four wafers of each lot; ${id} isn't one of them.`)
    const { d, ...rest } = map
    return { ...rest, dies: d.map(([x, y, bin]) => ({ x, y, bin })) }
  },
  tickets: async () => ({ items: [...tickets].reverse() }),
  audit: async (limit = 100) => ({ items: audit.slice(0, limit) }),
  decide: async (id: number, decision: 'approve' | 'reject', by: string): Promise<Ticket> => {
    const t = tickets.find((x) => x.id === id)
    if (!t) throw new Error(`Work order ${id} not found`)
    if (!by.trim()) throw new Error("'by' (the engineer's name) is required")
    if (t.status !== 'DRAFT') throw new Error(`Work order ${id} is already ${t.status}`)
    t.status = decision === 'approve' ? 'APPROVED' : 'REJECTED'
    t.decided_at = now()
    t.decided_by = by.trim()
    log(t.decided_by, `${t.status.toLowerCase()}_work_order`, { work_order_id: id })
    return { ...t }
  },
}

/** Replays the recorded investigation with realistic pacing, whatever the question. */
export async function demoStreamChat(
  message: string,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { events } = await load<{ events: AgentEvent[] }>('chat.json')
  log('user', 'chat', { message: message.slice(0, 500), model: 'demo/recorded' })
  for (const e of events) {
    await sleep(e.type === 'tool_call' ? 450 : e.type === 'tool_result' ? 250 + Math.random() * 300 : 600, signal)
    if (e.type === 'tool_result') {
      log('agent', `tool:${e.name}`, { ok: e.ok })
      if (e.name === 'draft_work_order') {
        const ticket = { ...(e.result as unknown as Ticket), id: tickets.length + 1, created_at: now() }
        tickets.push(ticket)
        log('agent', 'draft_work_order', { work_order_id: ticket.id })
        const answerFix = (s: string) => s.replace(/WO-\d{4}/, `WO-${String(ticket.id).padStart(4, '0')}`)
        events
          .filter((x) => x.type === 'message')
          .forEach((x) => (x as { content: string }).content = answerFix((x as { content: string }).content))
        onEvent({ ...e, result: ticket as unknown as Record<string, unknown> })
        continue
      }
    }
    onEvent(e)
  }
  onEvent({ type: 'done' })
}
