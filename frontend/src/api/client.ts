import type {
  AgentEvent,
  AuditEntry,
  ChatMessage,
  DocDetail,
  LotDetail,
  LotSummary,
  Status,
  Ticket,
  WaferMap,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw await toError(res)
  return (await res.json()) as T
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json()
    return new ApiError(res.status, body.error?.code ?? 'error', body.error?.message ?? res.statusText)
  } catch {
    return new ApiError(res.status, 'error', `${res.status} ${res.statusText}`)
  }
}

/** Where the API lives. Empty = same site (dev proxy, Docker/nginx); set VITE_API_URL at build
 * time when the screen and the API are hosted separately (e.g. Netlify + Render). */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const api = {
  status: () => request<Status>('/status'),
  lots: (limit = 50) => request<{ items: LotSummary[]; total: number }>(`/lots?limit=${limit}`),
  lot: (id: string) => request<LotDetail>(`/lots/${encodeURIComponent(id)}`),
  waferMap: (id: string) => request<WaferMap>(`/wafers/${encodeURIComponent(id)}/map`),
  doc: (id: string) => request<DocDetail>(`/docs/${encodeURIComponent(id)}`),
  tickets: () => request<{ items: Ticket[] }>('/tickets'),
  audit: (limit = 100) => request<{ items: AuditEntry[] }>(`/audit?limit=${limit}`),
  decide: (id: number, decision: 'approve' | 'reject', by: string) =>
    request<Ticket>(`/tickets/${id}/${decision}`, { method: 'POST', body: JSON.stringify({ by }) }),
}

/** POST /api/chat and call onEvent for every Server-Sent Event as it arrives. */
export async function streamChat(
  message: string,
  history: ChatMessage[],
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message, history }),
    signal,
  })
  if (!res.ok || !res.body) throw await toError(res)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let end: number
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')
      if (data) onEvent(JSON.parse(data) as AgentEvent)
    }
  }
}
