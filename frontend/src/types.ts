export type Role = 'boss' | 'inventory' | 'accounting' | 'facilities' | 'customer_service'

export interface Ticket {
  id: number
  type: string
  requester: string
  subject: string
  status: string
  state: 'open' | 'resolved'
  notes: string | null
  pending_requests: number
  last_run: { run_id: string; status: string } | null
}

export interface TicketsResponse {
  shop_today: string
  tickets: Ticket[]
}

export interface Cash {
  shop_today: string
  account: string
  balance: number
  balance_as_of: string
  pending_requests_total: number
  available_after_pending: number
}

export interface PaymentRequest {
  id: number
  kind: 'invoice' | 'rent' | 'purchase_order'
  ref_id: number | null
  period_due: string | null
  vendor_id: number | null
  sku: string | null
  size: string | null
  qty: number | null
  amount: number
  expected_arrival: string | null
  ticket_id: number | null
  requested_by: string
  reason: string
  status: 'pending' | 'paid' | 'rejected'
  requested_at: string
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  payment_id: number | null
}

export interface ToolCall {
  tool: string
  args: Record<string, unknown>
}

export interface AgentEvent {
  index: number
  ts: string
  run_id: string
  ticket_id: number | null
  event: string
  agent: string
  chain: string[]
  step: number | null
  node: string | null
  said: string | null
  tools: ToolCall[]
  results: { tool: string; content: string }[]
  tokens: { input: number | null; output: number | null } | null
  note: string | null
}

export interface Outcome {
  ticket_id: number
  summary: string
  decision: string
  ticket_status: string
  payment_request_ids: number[]
  draft_ids: number[]
  human_next_steps: string[]
}

export interface Run {
  run_id: string
  ticket_id: number
  status: 'running' | 'done' | 'error'
  started_at: string
  finished_at?: string
  outcome?: Outcome
  delegations?: number
  model_calls?: number
  tokens?: number
  error?: string
}

export interface AgentSummary {
  agent: Role
  asked_by: string[]
  tools: Record<string, number>
  asked: string[]
  said: string | null
  tokens: number
  steps: number
  did: string
}

export interface Summary {
  ticket_id: number
  run_id: string | null
  outcome: Outcome | null
  agents: AgentSummary[]
}
