import { useEffect, useRef, useState } from 'react'
import { money } from '../agents'
import type { Cash } from '../types'

/** Counts smoothly from the old value to the new one. The first value shows at once; a timer
 *  guarantees the end value even when animation frames are paused (background tab, reduced motion). */
function useCountTo(value: number | null) {
  const [shown, setShown] = useState(value ?? 0)
  const from = useRef<number | null>(value)
  useEffect(() => {
    if (value === null) return
    const start = from.current
    from.current = value
    if (start === null || start === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1100)
      setShown(start + (value - start) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const finish = window.setTimeout(() => setShown(value), 1300)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(finish)
    }
  }, [value])
  return shown
}

/** The shop till: checking balance, money promised to pending requests, and what's free. */
export function CashTill({ cash }: { cash: Cash | null }) {
  const balance = useCountTo(cash?.balance ?? null)
  const [drop, setDrop] = useState<number | null>(null)
  const last = useRef<number | null>(null)

  useEffect(() => {
    if (!cash) return
    if (last.current !== null && cash.balance < last.current) {
      setDrop(last.current - cash.balance)
      const t = setTimeout(() => setDrop(null), 5000)
      last.current = cash.balance
      return () => clearTimeout(t)
    }
    last.current = cash.balance
  }, [cash])

  return (
    <section className="panel till" aria-labelledby="till-title">
      <h2 id="till-title" className="panel-title">The till</h2>
      <div className="till-screen" aria-live="polite">
        <span className="till-label">Checking</span>
        <span className="till-amount">{cash ? money(balance) : '…'}</span>
        {drop !== null && <span className="till-drop">−{money(drop)} paid</span>}
      </div>
      {cash && (
        <dl className="till-rows">
          <div>
            <dt>Promised to pending requests</dt>
            <dd>{money(cash.pending_requests_total)}</dd>
          </div>
          <div className={cash.available_after_pending < 300 ? 'tight' : ''}>
            <dt>Free once those are paid</dt>
            <dd>{money(cash.available_after_pending)}</dd>
          </div>
        </dl>
      )}
      <p className="till-foot">Cash only goes out in this shop. It never drops below $0.</p>
    </section>
  )
}
