import { AGENTS, ROLES } from '../agents'
import type { LiveAgent } from '../agents'
import type { Role } from '../types'
import { Dragon } from './Dragon'

const MOOD_LABEL: Record<LiveAgent['mood'], string> = {
  idle: 'On deck',
  thinking: 'Thinking',
  working: 'Working',
  waiting: 'Waiting',
  done: 'Done',
  error: 'Hit a snag',
}

interface Props {
  live: Record<Role, LiveAgent>
  running: boolean
  roaring: Role[]
  ticketLabel: string | null
  lastHandoff: { from: Role; to: Role; text: string } | null
  onPoke: (role: Role) => void
}

/** The bridge of the flight deck: the dragon crew on hoverboards, the boss at the head. */
export function Desk({ live, running, roaring, ticketLabel, lastHandoff, onPoke }: Props) {
  return (
    <section className={`panel bridge ${running ? 'is-running' : ''}`} aria-labelledby="bridge-title">
      <div className="bridge-sky" aria-hidden="true">
        <span className="orb" />
        <span className="orbit orbit-1" />
        <span className="orbit orbit-2" />
      </div>
      <header className="bridge-head">
        <div>
          <p className="eyebrow">The bridge</p>
          <h2 id="bridge-title">
            The dragon <em>crew</em>
          </h2>
        </div>
        <span className="bridge-ticket">{ticketLabel ?? 'No ticket on deck'}</span>
      </header>
      <div className="formation">
        <div className="holo" aria-live="polite">
          {lastHandoff ? (
            <>
              <span className="holo-route">
                {AGENTS[lastHandoff.from].name} → {AGENTS[lastHandoff.to].name}
              </span>
              <span className="holo-text">{lastHandoff.text}</span>
            </>
          ) : (
            <span className="holo-text muted">
              {running ? 'Captain Nova is reading the slip…' : 'Orders passed between dragons appear here.'}
            </span>
          )}
        </div>
        {ROLES.map((role) => {
          const a = live[role]
          const meta = AGENTS[role]
          // A dragon roars for as long as it is actually on the job; the big shake marks the moment work arrives.
          const active = a.mood === 'thinking' || a.mood === 'working'
          const burst = roaring.includes(role)
          const roars = active || burst
          return (
            <article
              key={role}
              className={`seat seat-${role} mood-${a.mood} ${a.touched ? 'touched' : ''} ${roars ? 'roars' : ''} ${burst ? 'burst' : ''}`}
              style={{ ['--c' as string]: meta.color }}
            >
              <div
                className="seat-dragon"
                role="button"
                tabIndex={0}
                title={`Click to hear ${meta.nick} roar`}
                aria-label={`Hear ${meta.nick}, the ${meta.name.toLowerCase()} dragon, roar`}
                onClick={() => onPoke(role)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPoke(role))}
              >
                <Dragon role={role} mood={a.mood} roar={roars} />
                {roars && <span className="roar-word" aria-hidden="true">ROAR</span>}
              </div>
              <div className="seat-body">
                <header>
                  <h3>{meta.name}</h3>
                  <span className="nick">{meta.nick}</span>
                  <span className={`mood-pill pill-${a.mood}`}>
                    {a.mood === 'waiting' && a.waitingOn.length
                      ? `Waiting on ${a.waitingOn.map((r) => AGENTS[r].name).join(' & ')}`
                      : MOOD_LABEL[a.mood]}
                  </span>
                </header>
                <p className="seat-job">{meta.job}</p>
                {a.doing && <p className="seat-doing">{a.doing}</p>}
                <p className={`bubble ${a.line ? '' : 'empty'}`}>
                  {a.line ?? (running && !a.touched ? 'Not needed on this ticket (yet).' : 'Holding position.')}
                </p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
