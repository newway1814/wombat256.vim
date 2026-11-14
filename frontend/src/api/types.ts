// Shapes returned by the Flask API. Kept loose where the agent's tools return free-form data.

export interface Status {
  lots: number
  baseline_yield: number | null
  flagged_lots: number
  open_work_orders: number
  model: string | null
  embedder: string
}

export interface LotSummary {
  id: string
  product: string
  status: string
  wafer_count: number
  started_at: string
  completed_at: string
  mean_yield: number
}

export interface LotDetail {
  id: string
  product: string
  status: string
  started_at: string
  completed_at: string
  mean_yield: number | null
  wafers: { id: string; slot: number; yield_pct: number }[]
  route: {
    seq: number
    step: string
    chambers: { chamber_id: string; wafers: number }[]
    started_at: string
    ended_at: string
  }[]
}

export interface WaferMap {
  wafer_id: string
  lot_id: string
  die_total: number
  die_pass: number
  yield_pct: number
  bin_counts: Record<string, number>
  dies: { x: number; y: number; bin: number }[]
}

export interface Ticket {
  id: number
  chamber_id: string
  title: string
  body: string
  status: 'DRAFT' | 'APPROVED' | 'REJECTED'
  created_at: string
  decided_at: string | null
  decided_by: string | null
}

export interface AuditEntry {
  id: number
  at: string
  actor: string
  action: string
  detail: Record<string, unknown>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Server-Sent Events from POST /api/chat
export type AgentEvent =
  | { type: 'tool_call'; step: number; id: string; name: string; arguments: Record<string, unknown> }
  | {
      type: 'tool_result'
      step: number
      id: string
      name: string
      ok: boolean
      duration_ms: number
      rows: number | null
      result: Record<string, unknown>
    }
  | { type: 'message'; content: string }
  | { type: 'stopped'; reason: string }
  | { type: 'error'; message: string }
  | { type: 'done' }
