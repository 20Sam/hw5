import type { AgentEvent, Cash, PaymentRequest, Run, Summary, TicketsResponse } from './types'

// The FastAPI backend from Problem 7 (start it from backend/: uvicorn main:app --reload --port 8000).
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = (body as { detail?: unknown }).detail
    throw new Error(typeof detail === 'string' ? detail : `The backend answered ${res.status}.`)
  }
  return body as T
}

export const api = {
  tickets: () => call<TicketsResponse>('/tickets'),
  cash: () => call<Cash>('/cash'),
  payments: (status: 'pending' | 'paid' | 'all' = 'pending') =>
    call<{ count: number; requests: PaymentRequest[] }>(`/payments?status=${status}`),
  startRun: (ticketId: number) => call<Run>(`/tickets/${ticketId}/run`, { method: 'POST' }),
  run: (runId: string) => call<Run>(`/runs/${runId}`),
  runs: () => call<{ runs: Run[] }>('/runs'),
  events: (runId: string, since: number) =>
    call<{ count: number; next_since: number; events: AgentEvent[] }>(
      `/events?run_id=${encodeURIComponent(runId)}&since=${since}&limit=500`,
    ),
  summary: (ticketId: number, runId?: string | null) =>
    call<Summary>(`/tickets/${ticketId}/summary${runId ? `?run_id=${encodeURIComponent(runId)}` : ''}`),
  approve: (requestId: number, approvedBy: string) =>
    call<Record<string, unknown>>(`/payments/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved_by: approvedBy }),
    }),
  reject: (requestId: number, decidedBy: string, reason: string) =>
    call<Record<string, unknown>>(`/payments/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ decided_by: decidedBy, reason }),
    }),
  reset: () => call<Record<string, unknown>>('/reset', { method: 'POST' }),
}
