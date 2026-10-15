import type { Role } from './types'

/* Dragon voices, synthesized live with the Web Audio API (no sound files).
   Each roar = two detuned oscillators gliding down in pitch, a soft-clipping growl (amplitude
   wobble), a warm formant and low-pass so it sounds powerful but friendly, plus a breath of
   filtered noise. Every dragon gets its own pitch, length, texture and ending. */

interface Voice {
  start: number // starting pitch (Hz)
  end: number // pitch it glides down to
  lift?: number // a friendly upturn at the very end (Hz)
  duration: number // seconds
  waves: [OscillatorType, OscillatorType]
  detune: number // cents between the two oscillators
  growl: number // amplitude-wobble rate (Hz): higher = more gravel
  growlDepth: number // 0..1
  breath: number // 0..1 amount of noise
  formant: number // resonant band (Hz) that gives the voice its "vowel"
  brightness: number // low-pass cutoff (Hz)
  sub?: boolean // add a sub-octave for weight
}

const VOICES: Record<Role, Voice> = {
  // Captain Nova: the deepest and longest, a regal rumble with a warm sub-bass
  boss: { start: 118, end: 58, duration: 1.7, waves: ['sawtooth', 'sawtooth'], detune: 14, growl: 26, growlDepth: 0.38, breath: 0.22, formant: 380, brightness: 1700, sub: true },
  // Atlas (inventory): gruff and punchy
  inventory: { start: 165, end: 98, duration: 0.95, waves: ['sawtooth', 'square'], detune: 9, growl: 38, growlDepth: 0.5, breath: 0.32, formant: 560, brightness: 2000 },
  // Ledger (accounting): crisp, with a bright little upturn
  accounting: { start: 228, end: 176, lift: 262, duration: 0.85, waves: ['triangle', 'sawtooth'], detune: 7, growl: 22, growlDepth: 0.26, breath: 0.16, formant: 880, brightness: 2600 },
  // Keystone (facilities): a gravelly rumble
  facilities: { start: 138, end: 78, duration: 1.25, waves: ['sawtooth', 'sawtooth'], detune: 18, growl: 54, growlDepth: 0.62, breath: 0.48, formant: 470, brightness: 1550, sub: true },
  // Echo (customer service): the friendliest, round, higher and a bit playful
  customer_service: { start: 280, end: 198, lift: 315, duration: 0.8, waves: ['sine', 'triangle'], detune: 6, growl: 13, growlDepth: 0.22, breath: 0.1, formant: 1100, brightness: 3100 },
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
const lastRoar: Partial<Record<Role, number>> = {}

/** Browsers only allow sound after a click or key press; call this from one. */
export function unlockAudio() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx = new Ctor()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 4
    master = ctx.createGain()
    master.gain.value = 0.42
    master.connect(comp).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

export const audioReady = () => !!ctx && ctx.state === 'running'

/** The shared audio graph (for the crew's groove in groove.ts). */
export const audio = () => (ctx && master && ctx.state === 'running' ? { ctx, master } : null)

function softClip(amount: number) {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x))
  }
  return curve
}

/** One roar in this dragon's voice. At most one per dragon every 1.8 s. */
export function roar(role: Role, delay = 0) {
  if (!ctx || !master || ctx.state !== 'running') return
  const now = ctx.currentTime + delay
  if ((lastRoar[role] ?? -9) > now - 1.8) return
  lastRoar[role] = now
  const v = VOICES[role]
  const t0 = now
  const t1 = t0 + v.duration
  const glideEnd = v.lift ? t0 + v.duration * 0.72 : t1

  // envelope: quick swell, hold, soft release
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(0.9, t0 + 0.07)
  amp.gain.setValueAtTime(0.9, t1 - v.duration * 0.35)
  amp.gain.exponentialRampToValueAtTime(0.0001, t1)

  // growl: wobble the loudness
  const wobble = ctx.createGain()
  wobble.gain.value = 1 - v.growlDepth / 2
  const lfo = ctx.createOscillator()
  lfo.frequency.setValueAtTime(v.growl, t0)
  lfo.frequency.linearRampToValueAtTime(v.growl * 0.7, t1)
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = v.growlDepth / 2
  lfo.connect(lfoDepth).connect(wobble.gain)

  const shaper = ctx.createWaveShaper()
  shaper.curve = softClip(3)
  const formant = ctx.createBiquadFilter()
  formant.type = 'peaking'
  formant.frequency.value = v.formant
  formant.Q.value = 1.6
  formant.gain.value = 9
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.setValueAtTime(v.brightness, t0)
  lowpass.frequency.exponentialRampToValueAtTime(v.brightness * 0.55, t1)

  shaper.connect(formant).connect(lowpass).connect(wobble).connect(amp).connect(master)

  const oscs: OscillatorNode[] = []
  v.waves.forEach((wave, i) => {
    const o = ctx!.createOscillator()
    o.type = wave
    o.detune.value = i === 0 ? -v.detune : v.detune
    o.frequency.setValueAtTime(v.start, t0)
    o.frequency.exponentialRampToValueAtTime(v.end, glideEnd)
    if (v.lift) o.frequency.exponentialRampToValueAtTime(v.lift, t1)
    const g = ctx!.createGain()
    g.gain.value = 0.32
    o.connect(g).connect(shaper)
    oscs.push(o)
  })
  if (v.sub) {
    const s = ctx.createOscillator()
    s.type = 'sine'
    s.frequency.setValueAtTime(v.start / 2, t0)
    s.frequency.exponentialRampToValueAtTime(v.end / 2, t1)
    const g = ctx.createGain()
    g.gain.value = 0.45
    s.connect(g).connect(wobble)
    oscs.push(s)
  }

  // breath: a puff of band-passed noise at the start
  if (v.breath > 0) {
    const len = Math.floor(ctx.sampleRate * v.duration)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = buf
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = v.formant * 2.2
    band.Q.value = 0.8
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.0001, t0)
    ng.gain.exponentialRampToValueAtTime(v.breath, t0 + 0.05)
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + v.duration * 0.6)
    noise.connect(band).connect(ng).connect(amp)
    noise.start(t0)
    noise.stop(t1)
  }

  lfo.start(t0)
  lfo.stop(t1)
  oscs.forEach((o) => {
    o.start(t0)
    o.stop(t1 + 0.05)
  })
}
