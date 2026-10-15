import { useEffect, useRef } from 'react'
import { AGENTS, agentName } from '../agents'
import type { FeedLine } from '../agents'
import { Dragon } from './Dragon'

const time = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })

/** The team's group chat: hand-offs, tool use and what each agent said, newest at the bottom. */
export function LiveFeed({ lines, running }: { lines: FeedLine[]; running: boolean }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lines.length])

  return (
    <section className="panel feed" aria-labelledby="feed-title">
      <div className="feed-head">
        <h2 id="feed-title" className="panel-title">Team chatter</h2>
        {running && <span className="live-dot">live</span>}
      </div>
      <div className="feed-scroll" role="log" aria-live="polite">
        {lines.length === 0 && <p className="feed-empty">When a ticket is on the desk, every hand-off, tool and reply shows up here.</p>}
        {lines.map((l) => (
          <div key={l.key} className={`line line-${l.kind}`} style={l.agent ? { ['--c' as string]: AGENTS[l.agent].color } : undefined}>
            {l.agent && (l.kind === 'said' || l.kind === 'reply' || l.kind === 'handoff') && <Dragon role={l.agent} badge />}
            <div className="line-body">
              <span className="line-meta">
                {l.agent ? agentName(l.agent) : 'Desk'}
                {l.kind === 'handoff' && l.to ? ` → ${agentName(l.to)}` : ''}
                {l.kind === 'reply' ? ' replies' : ''}
                <time>{time(l.ts)}</time>
              </span>
              <span className="line-text">{l.text}</span>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
    </section>
  )
}
