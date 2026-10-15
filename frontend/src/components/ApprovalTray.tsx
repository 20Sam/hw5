import { useState } from 'react'
import { agentName, money } from '../agents'
import type { PaymentRequest } from '../types'

const NAME_KEY = 'campus-customs-approver'

function title(r: PaymentRequest) {
  if (r.kind === 'invoice') return `Vendor invoice #${r.ref_id}`
  if (r.kind === 'rent') return `Rent · lease ${r.ref_id}${r.period_due ? ` · due ${r.period_due}` : ''}`
  return `Restock order · ${r.qty} × ${r.sku} ${r.size}`
}

interface Props {
  requests: PaymentRequest[]
  balance: number | null
  onApprove: (id: number, name: string) => Promise<void>
  onReject: (id: number, name: string, reason: string) => Promise<void>
}

/** Envelopes the agents prepared. Only a person clicking Approve here moves money. */
export function ApprovalTray({ requests, balance, onApprove, onReject }: Props) {
  const [open, setOpen] = useState<{ id: number; mode: 'approve' | 'reject' } | null>(null)
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (r: PaymentRequest) => {
    if (name.trim().length < 2) return setError('Type your full name first.')
    if (open?.mode === 'reject' && reason.trim().length < 2) return setError('Say briefly why.')
    setBusy(true)
    setError(null)
    try {
      localStorage.setItem(NAME_KEY, name.trim())
      if (open?.mode === 'approve') await onApprove(r.id, name.trim())
      else await onReject(r.id, name.trim(), reason.trim())
      setOpen(null)
      setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel tray" aria-labelledby="tray-title">
      <h2 id="tray-title" className="panel-title">
        Approval tray {requests.length > 0 && <span className="count">{requests.length}</span>}
      </h2>
      {requests.length === 0 && <p className="tray-empty">Nothing waiting. Agents can only prepare payments; you approve them here.</p>}
      <ul className="envelopes">
        {requests.map((r) => {
          const short = balance !== null && r.amount > balance
          const isOpen = open?.id === r.id
          return (
            <li key={r.id} className={`envelope kind-${r.kind}`}>
              <div className="env-top">
                <span className="env-title">{title(r)}</span>
                <span className="env-amount">{money(r.amount)}</span>
              </div>
              <p className="env-meta">
                Prepared by {agentName(r.requested_by)} for ticket {r.ticket_id}
                {r.expected_arrival ? ` · arrives as early as ${r.expected_arrival}` : ''}
              </p>
              <p className="env-reason">{r.reason}</p>
              {short && <p className="env-warn">More than the {money(balance ?? 0)} in checking: the till will refuse it.</p>}
              {!isOpen && (
                <div className="env-actions">
                  <button className="btn btn-approve" onClick={() => (setOpen({ id: r.id, mode: 'approve' }), setError(null))}>
                    Approve & pay
                  </button>
                  <button className="btn btn-quiet" onClick={() => (setOpen({ id: r.id, mode: 'reject' }), setError(null))}>
                    Reject
                  </button>
                </div>
              )}
              {isOpen && (
                <form
                  className="env-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void submit(r)
                  }}
                >
                  <label>
                    Your full name
                    <input value={name} onChange={(e) => (setName(e.target.value), setError(null))} placeholder="e.g. Sam Hernandez" autoFocus />
                  </label>
                  {open.mode === 'reject' && (
                    <label>
                      Why not?
                      <input value={reason} onChange={(e) => (setReason(e.target.value), setError(null))} placeholder="Short reason" />
                    </label>
                  )}
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <div className="env-actions">
                    <button type="submit" className={`btn ${open.mode === 'approve' ? 'btn-approve' : 'btn-danger'}`} disabled={busy}>
                      {busy ? 'Working…' : open.mode === 'approve' ? `Pay ${money(r.amount)}` : 'Reject request'}
                    </button>
                    <button type="button" className="btn btn-quiet" onClick={() => setOpen(null)} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
