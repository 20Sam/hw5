import type { AgentEvent, Role } from './types'

export const ROLES: Role[] = ['boss', 'inventory', 'accounting', 'facilities', 'customer_service']

export interface AgentMeta {
  name: string
  nick: string
  job: string
  color: string
  prop: 'cap' | 'box' | 'coin' | 'key' | 'heart'
}

export const AGENTS: Record<Role, AgentMeta> = {
  boss: { name: 'Boss', nick: 'Captain Nova', job: 'Reads the ticket, routes the work, makes the call', color: '#e3a345', prop: 'cap' },
  inventory: { name: 'Inventory', nick: 'Atlas', job: 'Shelves, sizes and restocks', color: '#5c968a', prop: 'box' },
  accounting: { name: 'Accounting', nick: 'Ledger', job: 'Cash, bills and margins', color: '#c08a2b', prop: 'coin' },
  facilities: { name: 'Facilities', nick: 'Keystone', job: 'Lease, rent and the landlord', color: '#c0584a', prop: 'key' },
  customer_service: { name: 'Customer service', nick: 'Echo', job: 'Drafts every message', color: '#e8695a', prop: 'heart' },
}

export const isRole = (x: string): x is Role => (ROLES as string[]).includes(x)
export const agentName = (x: string) => (isRole(x) ? AGENTS[x].name : x === 'human' ? 'You' : x)

export const TICKET_TYPES: Record<string, string> = {
  customer_order: 'Customer order',
  rent_notice: 'Rent notice',
  price_override: 'Price request',
}

// What a tool call looks like while it happens.
export const TOOL_ING: Record<string, string> = {
  list_open_tickets: 'reading the ticket',
  check_stock_and_price: 'checking stock and price',
  check_invoice_hold: 'checking the invoice hold',
  get_rent_due: 'reading the lease',
  get_cash_balance: 'counting the cash',
  find_vendors: 'looking up vendors',
  list_payment_requests: 'checking payment requests',
  list_drafts: 'checking drafts',
  request_payment: 'requesting a payment',
  request_purchase_order: 'requesting a restock order',
  add_ticket_note: 'writing a ticket note',
  set_ticket_status: 'setting the ticket status',
  save_customer_draft: 'drafting a message',
  final_result: 'writing up the decision',
}

export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export function shopDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** Agents write light markdown; the board shows plain sentences. */
export const plain = (s: string) =>
  s.replace(/\*\*|__|`/g, '').replace(/^\s*[-*]\s+/gm, '').replace(/^#+\s*/gm, '').replace(/\s*\n+\s*/g, ' ').trim()

function argHint(args: Record<string, unknown>) {
  const keys = ['sku', 'size', 'qty', 'qty_needed', 'invoice_id', 'lease_id', 'kind', 'ref_id', 'status', 'specialty_contains', 'recipient']
  const bits = keys.filter((k) => args[k] !== undefined && args[k] !== null).map((k) => `${args[k]}`)
  return bits.length ? ` (${bits.join(', ')})` : ''
}

export type Mood = 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error'

export interface LiveAgent {
  mood: Mood
  line: string | null       // what it is saying / doing right now
  doing: string | null      // the tool it is using right now
  waitingOn: Role[]
  askedBy: string | null
  touched: boolean          // took part in this run
}

/** Replay the run's audit events into one live state per agent. */
export function deriveLive(events: AgentEvent[]): Record<Role, LiveAgent> {
  const fresh = (): LiveAgent => ({ mood: 'idle', line: null, doing: null, waitingOn: [], askedBy: null, touched: false })
  const live = Object.fromEntries(ROLES.map((r) => [r, fresh()])) as Record<Role, LiveAgent>
  for (const e of events) {
    if (!isRole(e.agent)) continue
    const a = live[e.agent]
    a.touched = true
    if (e.event === 'run_start') {
      a.mood = 'thinking'
      a.doing = null
      a.waitingOn = []
      a.askedBy = e.chain.length >= 3 ? e.chain[e.chain.length - 2] : 'human'
      a.line = a.askedBy === 'human' ? 'Picking up the ticket…' : `${agentName(a.askedBy)} asked me for help.`
    } else if (e.event === 'step' && e.tools.length) {
      const asks = e.tools.filter((t) => t.tool === 'ask_teammate').map((t) => String(t.args.teammate ?? '')).filter(isRole)
      if (asks.length) {
        a.mood = 'waiting'
        a.waitingOn = asks
        a.doing = `asking ${asks.map((r) => AGENTS[r].name).join(' and ')}`
      } else {
        a.mood = 'working'
        a.waitingOn = []
        a.doing = e.tools.map((t) => (TOOL_ING[t.tool] ?? t.tool) + argHint(t.args)).join(' · ')
      }
      if (e.said) a.line = plain(e.said)
    } else if (e.event === 'step') {
      // A model request (including the one carrying a teammate's reply) means the agent is thinking again.
      if (e.said && e.node === 'CallToolsNode') a.line = plain(e.said)
      if (e.node !== 'End') {
        a.mood = 'thinking'
        a.doing = null
        a.waitingOn = []
      }
    } else if (e.event === 'run_end') {
      a.mood = 'done'
      a.doing = null
      a.waitingOn = []
      if (e.said && !e.said.startsWith('{')) a.line = plain(e.said)
    } else if (e.event === 'run_error') {
      a.mood = 'error'
      a.doing = null
      a.line = e.note
    }
  }
  return live
}

export interface FeedLine {
  key: string
  kind: 'start' | 'handoff' | 'tool' | 'said' | 'reply' | 'error' | 'end' | 'refused'
  agent?: Role
  to?: Role
  text: string
  ts: string
}

/** Turn audit events into readable feed lines, oldest first. */
export function feedLines(events: AgentEvent[]): FeedLine[] {
  const out: FeedLine[] = []
  for (const e of events) {
    const agent = isRole(e.agent) ? e.agent : undefined
    const base = { ts: e.ts, agent }
    if (e.event === 'ticket_start') out.push({ ...base, key: `${e.index}`, kind: 'start', text: `Ticket ${e.ticket_id} handed to the team.` })
    else if (e.event === 'delegation') {
      const to = (e.note ?? '').match(/-> (\w+)/)?.[1] ?? ''
      const refused = (e.note ?? '').includes('REFUSED')
      out.push({
        ...base, key: `${e.index}`, kind: refused ? 'refused' : 'handoff', to: isRole(to) ? to : undefined,
        text: refused ? `Could not ask ${agentName(to)}: ${(e.note ?? '').split('REFUSED: ')[1] ?? ''}` : clip(plain(e.said ?? ''), 260),
      })
    } else if (e.event === 'step') {
      e.tools.filter((t) => t.tool !== 'ask_teammate' && t.tool !== 'final_result').forEach((t, i) =>
        out.push({ ...base, key: `${e.index}-${i}`, kind: 'tool', text: `${TOOL_ING[t.tool] ?? t.tool}${argHint(t.args)}` }),
      )
      if (e.said && e.node === 'CallToolsNode') out.push({ ...base, key: `${e.index}-s`, kind: 'said', text: clip(plain(e.said), 280) })
    } else if (e.event === 'run_end' && agent && agent !== 'boss' && e.said) {
      out.push({ ...base, key: `${e.index}`, kind: 'reply', text: clip(plain(e.said), 320) })
    } else if (e.event === 'run_error') out.push({ ...base, key: `${e.index}`, kind: 'error', text: e.note ?? 'Something went wrong.' })
    else if (e.event === 'ticket_end') out.push({ ...base, key: `${e.index}`, kind: 'end', text: `Run finished: ${e.note ?? ''}.` })
  }
  return out
}
