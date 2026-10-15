import { TICKET_TYPES } from '../agents'
import type { Ticket } from '../types'

interface Props {
  tickets: Ticket[]
  selected: number | null
  runningTicket: number | null
  busy: boolean
  onSelect: (id: number) => void
  onRun: (id: number) => void
}

/** Paper order slips clipped to a rail; a rubber stamp shows open, on the desk, or resolved. */
export function TicketRail({ tickets, selected, runningTicket, busy, onSelect, onRun }: Props) {
  return (
    <section className="panel rail" aria-labelledby="rail-title">
      <h2 id="rail-title" className="panel-title">Ticket rail</h2>
      <p className="panel-hint">Pick a slip, then hand it to the crew.</p>
      <div className="rail-wire" aria-hidden="true" />
      <ul className="slips">
        {tickets.map((t, i) => {
          const running = runningTicket === t.id
          const stamp = running ? 'On the bridge' : t.state === 'resolved' ? 'Resolved' : 'Open'
          const isSelected = selected === t.id
          return (
            <li key={t.id} style={{ ['--tilt' as string]: `${(i % 2 ? 1 : -1) * 0.8}deg` }}>
              <article
                className={`slip ${isSelected ? 'selected' : ''} ${t.state} ${running ? 'running' : ''}`}
                onClick={() => onSelect(t.id)}
                onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(t.id))}
                tabIndex={0}
                aria-current={isSelected ? 'true' : undefined}
                aria-label={`Ticket ${t.id}, ${t.subject}, ${stamp}${isSelected ? ', selected' : ''}`}
              >
                <span className="clip" aria-hidden="true" />
                <header>
                  <span className="slip-no">No. {t.id}</span>
                  <span className="slip-type">{TICKET_TYPES[t.type] ?? t.type}</span>
                </header>
                <h3>{t.subject}</h3>
                <p className="slip-from">from {t.requester}</p>
                <span className={`stamp stamp-${running ? 'running' : t.state}`}>{stamp}</span>
                {t.pending_requests > 0 && (
                  <span className="slip-flag">{t.pending_requests} payment{t.pending_requests > 1 ? 's' : ''} for you to approve</span>
                )}
                {isSelected && (
                  <button
                    className="btn btn-primary slip-run"
                    disabled={busy || t.state === 'resolved'}
                    title={t.state === 'resolved' ? 'Resolved tickets stay as they are. Use Fresh start to run all three again.' : undefined}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRun(t.id)
                    }}
                  >
                    {running ? 'The crew is on it…' : t.state === 'resolved' ? 'Resolved · Fresh start to rerun' : 'Hand to the crew'}
                  </button>
                )}
              </article>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
