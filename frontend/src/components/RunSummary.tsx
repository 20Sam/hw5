import { AGENTS, agentName, plain } from '../agents'
import type { Summary } from '../types'
import { Dragon } from './Dragon'

const clip = (s: string | null, n: number) => (!s ? '' : s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** After a run: one card per agent that took part, plus the boss's call. */
export function RunSummary({ summary, ticketId }: { summary: Summary | null; ticketId: number | null }) {
  if (ticketId === null) return null
  if (!summary || !summary.run_id) {
    return (
      <section className="panel summary" aria-labelledby="sum-title">
        <h2 id="sum-title" className="panel-title">What each agent did</h2>
        <p className="panel-hint">Ticket {ticketId} hasn’t been worked yet. Hand it to the team and the recap appears here.</p>
      </section>
    )
  }
  const o = summary.outcome
  return (
    <section className="panel summary" aria-labelledby="sum-title">
      <h2 id="sum-title" className="panel-title">Crew log · what each agent did on ticket {summary.ticket_id}</h2>
      {o && (
        <div className="boss-call">
          <span className="boss-call-label">Captain Nova’s call</span>
          <p className="boss-decision">{o.decision}</p>
          <p className="boss-summary">{o.summary}</p>
          {o.human_next_steps.length > 0 && (
            <ul className="next-steps">
              {o.human_next_steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="sum-grid">
        {summary.agents.map((a) => (
          <article key={a.agent} className="sum-card" style={{ ['--c' as string]: AGENTS[a.agent].color }}>
            <header>
              <Dragon role={a.agent} mood="done" badge />
              <div>
                <h3>{AGENTS[a.agent].name}</h3>
                <span className="sum-asked">asked by {a.asked_by.map(agentName).join(', ')}</span>
              </div>
            </header>
            <p className="sum-did">{a.did}.</p>
            {a.said && a.agent !== 'boss' && <p className="sum-said">“{clip(plain(a.said), 220)}”</p>}
            <span className="sum-tokens">{a.steps} loop steps · {a.tokens.toLocaleString()} tokens</span>
          </article>
        ))}
      </div>
    </section>
  )
}
