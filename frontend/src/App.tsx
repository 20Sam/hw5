import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE, api } from './api'
import { roar, unlockAudio } from './roar'
import { setSingers, startGroove, stopGroove } from './groove'
import { AGENTS, ROLES, deriveLive, feedLines, isRole, money, shopDate } from './agents'
import type { Role } from './types'
import type { AgentEvent, Cash, PaymentRequest, Run, Summary, Ticket } from './types'
import { ApprovalTray } from './components/ApprovalTray'
import { CashTill } from './components/CashTill'
import { Desk } from './components/Desk'
import { LiveFeed } from './components/LiveFeed'
import { RunSummary } from './components/RunSummary'
import { TicketRail } from './components/TicketRail'

type Toast = { text: string; tone: 'good' | 'bad' | 'info' }

/** Embers and smoke drifting up the screen; hotter while the crew is working. */
function Embers({ hot }: { hot: boolean }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 38 }, (_, i) => {
        const r = (n: number) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1
        return {
          smoke: i % 4 === 0,
          left: `${(r(1) * 100).toFixed(2)}%`,
          delay: `${(-r(2) * 16).toFixed(2)}s`,
          duration: `${(8 + r(3) * 10).toFixed(2)}s`,
          size: `${(2 + r(4) * 4).toFixed(1)}px`,
          drift: `${((r(5) - 0.5) * 140).toFixed(0)}px`,
        }
      }),
    [],
  )
  return (
    <div className={`embers ${hot ? 'hot' : ''}`} aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className={b.smoke ? 'smoke' : 'ember'}
          style={{ left: b.left, animationDelay: b.delay, animationDuration: b.duration, ['--size' as string]: b.size, ['--drift' as string]: b.drift }}
        />
      ))}
    </div>
  )
}

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [shopToday, setShopToday] = useState<string | null>(null)
  const [cash, setCash] = useState<Cash | null>(null)
  const [pending, setPending] = useState<PaymentRequest[]>([])
  // ?ticket=101 opens the board on that ticket (handy for links and screenshots).
  const [selected, setSelected] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get('ticket')) || null)
  const [run, setRun] = useState<Run | null>(null)
  const [watchId, setWatchId] = useState<string | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [offline, setOffline] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const since = useRef(0)
  const [roaring, setRoaring] = useState<Role[]>([])
  const seen = useRef<{ id: string | null; n: number }>({ id: null, n: 0 })
  const roarTimers = useRef<Partial<Record<Role, number>>>({})
  const [voices, setVoices] = useState(() => localStorage.getItem('cc-voices') !== 'off')
  const voicesRef = useRef(voices)
  voicesRef.current = voices

  const runningRef = useRef(false)
  // Browsers allow sound only after a click; the first click anywhere wakes the dragons' voices.
  useEffect(() => {
    const wake = () => {
      unlockAudio()
      window.setTimeout(() => runningRef.current && voicesRef.current && startGroove(), 120)
    }
    window.addEventListener('pointerdown', wake, { once: true })
    window.addEventListener('keydown', wake, { once: true })
    return () => {
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  const burst = useCallback((roles: Role[]) => {
    roles.forEach((role) => {
      window.clearTimeout(roarTimers.current[role])
      roarTimers.current[role] = window.setTimeout(() => setRoaring((prev) => prev.filter((r) => r !== role)), 2600)
    })
    if (roles.length) setRoaring((prev) => [...new Set([...prev, ...roles])])
  }, [])

  // Click a dragon to hear its voice.
  const poke = useCallback((role: Role) => {
    unlockAudio()
    if (voicesRef.current) window.setTimeout(() => roar(role), 30)
    burst([role])
  }, [burst])

  const running = run?.status === 'running'
  const say = (text: string, tone: Toast['tone'] = 'info') => {
    setToast({ text, tone })
    window.setTimeout(() => setToast(null), 5000)
  }

  const refresh = useCallback(async () => {
    try {
      const [t, c, p] = await Promise.all([api.tickets(), api.cash(), api.payments()])
      setTickets(t.tickets)
      setShopToday(t.shop_today)
      setCash(c)
      setPending(p.requests)
      setOffline(false)
      setSelected((s) => s ?? t.tickets[0]?.id ?? null)
    } catch {
      setOffline(true)
    }
  }, [])

  // ?ticket=101&run=<run_id> pins the board to one run of that ticket (used for the full-run screenshots).
  const pinnedRun = useRef(new URLSearchParams(window.location.search).get('run'))
  const loadSummary = useCallback(async (ticketId: number) => {
    try {
      const s = await api.summary(ticketId, pinnedRun.current)
      setSummary(s)
      return s
    } catch {
      return null
    }
  }, [])

  // Keep the board fresh; faster while the team is working.
  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), running ? 4000 : 8000)
    return () => window.clearInterval(id)
  }, [refresh, running])

  // If a run was already going (page reload), pick it back up.
  useEffect(() => {
    api.runs()
      .then(({ runs }) => {
        const live = runs.find((r) => r.status === 'running')
        if (live) {
          setRun(live)
          setSelected(live.ticket_id)
          setWatchId(live.run_id)
        }
      })
      .catch(() => undefined)
  }, [])

  // When no run is going, the desk shows the selected ticket's latest run.
  useEffect(() => {
    if (selected === null || running) return
    void loadSummary(selected).then((s) => setWatchId(s?.run_id ?? null))
  }, [selected, running, loadSummary])

  // Stream the watched run's events; poll until it finishes.
  useEffect(() => {
    setEvents([])
    since.current = 0
    if (!watchId) return
    let stopped = false
    let timer = 0
    const tick = async () => {
      try {
        const ev = await api.events(watchId, since.current)
        if (stopped) return
        if (ev.events.length) setEvents((prev) => [...prev, ...ev.events])
        since.current = ev.next_since
        if (run && run.run_id === watchId && run.status === 'running') {
          const r = await api.run(watchId)
          if (r.status !== 'running') {
            const tail = await api.events(watchId, since.current)
            if (tail.events.length) setEvents((prev) => [...prev, ...tail.events])
            since.current = tail.next_since
            setRun(r)
            await refresh()
            await loadSummary(r.ticket_id)
            say(r.status === 'done' ? `Ticket ${r.ticket_id} is resolved. See what each agent did below.` : `The run hit a problem: ${r.error ?? ''}`,
              r.status === 'done' ? 'good' : 'bad')
            return
          }
          timer = window.setTimeout(tick, 1200)
        }
      } catch {
        if (!stopped) timer = window.setTimeout(tick, 2500)
      }
    }
    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchId, run?.status])

  const live = useMemo(() => {
    const l = deriveLive(events)
    // The boss's final answer is its structured outcome; show the decision in its bubble.
    const decision = summary?.outcome && summary.run_id === watchId ? summary.outcome.decision : null
    if (decision && l.boss.mood === 'done') l.boss.line = decision
    return l
  }, [events, summary, watchId])
  const lines = useMemo(() => feedLines(events), [events])
  runningRef.current = running

  // While a run is live the crew's groove plays, and every dragon on the job sings its line.
  const singing = ROLES.filter((r) => live[r].mood === 'thinking' || live[r].mood === 'working').join(',')
  useEffect(() => {
    setSingers(singing ? (singing.split(',') as Role[]) : [])
  }, [singing])
  useEffect(() => {
    if (running && voices) startGroove()
    else stopGroove()
  }, [running, voices])
  useEffect(() => () => stopGroove(), [])

  // Live runs only: whoever just received work roars (and breathes fire); so does the boss when a
  // ticket lands on the bridge or when it hands work out.
  useEffect(() => {
    if (seen.current.id !== watchId) seen.current = { id: watchId, n: running ? 0 : events.length }
    const fresh = events.slice(seen.current.n)
    seen.current.n = events.length
    if (!running || !fresh.length) return
    const who = new Set<Role>()
    for (const e of fresh) {
      if (e.event === 'ticket_start') who.add('boss')
      if (e.event === 'run_start' && isRole(e.agent)) who.add(e.agent)
      if (e.event === 'delegation' && isRole(e.agent) && !(e.note ?? '').includes('REFUSED')) who.add(e.agent)
    }
    burst([...who])
    if (voicesRef.current) [...who].forEach((role, i) => roar(role, i * 0.22))
  }, [events, watchId, running, burst])
  const lastHandoff = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e.event !== 'delegation' || (e.note ?? '').includes('REFUSED')) continue
      const to = (e.note ?? '').match(/-> (\w+)/)?.[1] ?? ''
      if (isRole(e.agent) && isRole(to)) return { from: e.agent as Role, to: to as Role, text: e.said ?? '' }
    }
    return null
  }, [events])

  const handOff = async (ticketId: number) => {
    try {
      const r = await api.startRun(ticketId)
      setSummary(null)
      setRun(r)
      setSelected(ticketId)
      setWatchId(r.run_id)
      say(`Ticket ${ticketId} is on the bridge. Watch the crew work.`)
      void refresh()
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), 'bad')
    }
  }

  const approve = async (id: number, name: string) => {
    const req = pending.find((r) => r.id === id)
    await api.approve(id, name)
    await refresh()
    say(`Paid ${req ? money(req.amount) : ''}, approved by ${name}.`, 'good')
  }

  const reject = async (id: number, name: string, reason: string) => {
    await api.reject(id, name, reason)
    await refresh()
    say(`Request ${id} rejected. No money moved.`)
  }

  const freshStart = async () => {
    const ok = window.confirm(
      'Reset the shop database to its original values?\n\nTickets reopen, requests and drafts are cleared, cash goes back to $3,400. The audit trail is kept.',
    )
    if (!ok) return
    try {
      await api.reset()
      setRun(null)
      setWatchId(null)
      setSummary(null)
      await refresh()
      say('Fresh start: the shop is back to its original state.', 'good')
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), 'bad')
    }
  }

  const shown = tickets.find((t) => t.id === (running ? run?.ticket_id : selected))
  const ticketLabel = shown ? `No. ${shown.id} · ${shown.subject}${running ? ' · crew at work' : ''}` : null

  const ticker = [
    ...tickets.map((t) => `No. ${t.id} ${t.subject} · ${running && run?.ticket_id === t.id ? 'on the bridge' : t.state}`),
    cash ? `Till ${money(cash.balance)}` : 'Till …',
    pending.length ? `${pending.length} payment${pending.length > 1 ? 's' : ''} await your approval` : 'No payments waiting',
    ...ROLES.filter((r) => running || live[r].touched).map((r) => `${AGENTS[r].nick} · ${live[r].doing ?? live[r].mood}`),
  ]

  return (
    <div className={`app ${running ? 'is-running' : ''}`}>
      <Embers hot={running} />
      <header className="hero">
        <div className="hero-frame" aria-hidden="true" />
        <div className="hero-orb" aria-hidden="true" />
        <div className="hero-top">
          <span className="hero-mark">CC</span>
          <span className="hero-brand">Campus Customs</span>
          <span className="hero-place">Chapel Street · New Haven</span>
        </div>
        <div className="hero-main">
          <div>
            <p className="eyebrow eyebrow-coral">Flight deck · ticket operations · human approval</p>
            <h1>
              Campus Customs <em>flight deck.</em>
            </h1>
            <p className="hero-sub">Five dragons on hoverboards work the shop’s tickets. Every dollar waits for you.</p>
          </div>
          <div className="hero-side">
            <span className="today-label">Shop date</span>
            <span className="today-date">{shopToday ? shopDate(shopToday) : '…'}</span>
            <div className="hero-buttons">
              <button
                className={`btn btn-ghost voice-toggle ${voices ? 'on' : ''}`}
                aria-pressed={voices}
                onClick={() => {
                  unlockAudio()
                  const next = !voices
                  localStorage.setItem('cc-voices', next ? 'on' : 'off')
                  setVoices(next)
                  if (next) window.setTimeout(() => (running ? startGroove() : roar('boss')), 40)
                }}
              >
                {voices ? 'Dragon voices · on' : 'Dragon voices · off'}
              </button>
              <button className="btn btn-ghost" onClick={freshStart} disabled={running}>
                Fresh start
              </button>
            </div>
          </div>
        </div>
      </header>
      <div className={`ticker ${running ? 'live' : ''}`} aria-label="Live status">
        <div className="ticker-track">
          {[...ticker, ...ticker].map((t, i) => (
            <span key={i} aria-hidden={i >= ticker.length}>
              {t}
              <i aria-hidden="true">✶</i>
            </span>
          ))}
        </div>
      </div>

      {offline && (
        <div className="banner" role="alert">
          Can’t reach the backend at {API_BASE}. Start it from <code>backend/</code> with{' '}
          <code>uvicorn main:app --reload --port 8000</code>.
        </div>
      )}

      <main className="layout">
        <div className="col col-left">
          <TicketRail
            tickets={tickets}
            selected={selected}
            runningTicket={running ? run?.ticket_id ?? null : null}
            busy={running}
            onSelect={(id) => !running && setSelected(id)}
            onRun={handOff}
          />
        </div>
        <div className="col col-mid">
          <Desk live={live} running={running} roaring={roaring} ticketLabel={ticketLabel} lastHandoff={lastHandoff} onPoke={poke} />
          {!running && <RunSummary summary={summary} ticketId={selected} />}
        </div>
        <div className="col col-right">
          <CashTill cash={cash} />
          <ApprovalTray requests={pending} balance={cash?.balance ?? null} onApprove={approve} onReject={reject} />
          <LiveFeed lines={lines} running={running} />
        </div>
      </main>

      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status">
          {toast.text}
        </div>
      )}
      <footer className="foot">
        Five agents on gpt-6-luna · backend {API_BASE} · every agent step is kept in output/audit_trail.json
      </footer>
    </div>
  )
}
