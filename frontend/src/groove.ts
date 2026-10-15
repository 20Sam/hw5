import { audio } from './roar'
import type { Role } from './types'

/* The crew's groove: a deep-house lounge loop (think a high-end sushi bar at 120 BPM) that plays
   while a run is live. Soft four-on-the-floor kick, offbeat hats, a light clap, a syncopated bass,
   warm A-minor ninth chords, and every dragon that is working sings its own melodic line in its own
   voice, with a small playful growl at the end of its phrases. Everything is synthesized. */

const BPM = 120
const STEP = 60 / BPM / 4 // one 16th note in seconds
const LOOKAHEAD = 0.18

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

// Am9 → Dm9 → Fmaj9 → Em7, one chord per bar
const CHORDS = [
  { bass: 45, tones: [57, 60, 64, 67, 71] },
  { bass: 38, tones: [53, 57, 60, 64, 65] },
  { bass: 41, tones: [53, 57, 60, 64, 67] },
  { bass: 40, tones: [55, 59, 62, 64, 67] },
]

interface Singer {
  octave: number // semitones added to the chord tones
  vowel: [number, number] // two formants (Hz): the "oh", "ah", "oo"
  wave: OscillatorType
  level: number
  // phrase: [step in the bar, chord-tone index, length in steps]; one phrase per bar in a 2-bar cycle
  phrase: [number, number, number][][]
}

const SINGERS: Record<Role, Singer> = {
  boss: { octave: -12, vowel: [450, 800], wave: 'sawtooth', level: 0.22,
    phrase: [[[0, 0, 6], [8, 2, 4], [12, 1, 4]], [[0, 3, 4], [6, 2, 2], [8, 1, 8]]] },
  inventory: { octave: 0, vowel: [730, 1090], wave: 'sawtooth', level: 0.16,
    phrase: [[[3, 2, 1], [6, 2, 1], [10, 3, 2]], [[2, 1, 2], [7, 2, 1], [11, 0, 3]]] },
  accounting: { octave: 0, vowel: [600, 1500], wave: 'triangle', level: 0.18,
    phrase: [[[4, 4, 2], [7, 3, 1], [9, 4, 3]], [[4, 3, 2], [8, 4, 2], [12, 2, 4]]] },
  facilities: { octave: -12, vowel: [320, 700], wave: 'sawtooth', level: 0.17,
    phrase: [[[10, 1, 2], [13, 0, 3]], [[9, 2, 2], [12, 1, 4]]] },
  customer_service: { octave: 12, vowel: [380, 2200], wave: 'triangle', level: 0.13,
    phrase: [[[2, 3, 2], [4, 2, 2], [6, 3, 2], [10, 1, 4]], [[2, 4, 2], [5, 3, 1], [8, 2, 2], [14, 1, 2]]] },
}

let timer = 0
let step = 0
let nextTime = 0
let bus: GainNode | null = null
let singers: Role[] = []
let noiseBuf: AudioBuffer | null = null

export function setSingers(roles: Role[]) {
  singers = roles
}

export function grooveOn() {
  return timer !== 0
}

export function startGroove() {
  const a = audio()
  if (!a || timer) return
  const { ctx, master } = a
  bus = ctx.createGain()
  bus.gain.setValueAtTime(0.0001, ctx.currentTime)
  bus.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 1.2)
  bus.connect(master)
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  step = 0
  nextTime = ctx.currentTime + 0.1
  timer = window.setInterval(schedule, 25)
}

export function stopGroove() {
  const a = audio()
  if (!timer) return
  window.clearInterval(timer)
  timer = 0
  if (a && bus) {
    const g = bus
    g.gain.cancelScheduledValues(a.ctx.currentTime)
    g.gain.setValueAtTime(g.gain.value, a.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, a.ctx.currentTime + 1.5)
    window.setTimeout(() => g.disconnect(), 1700)
  }
  bus = null
}

function schedule() {
  const a = audio()
  if (!a || !bus) return
  while (nextTime < a.ctx.currentTime + LOOKAHEAD) {
    play(a.ctx, bus, step, nextTime)
    nextTime += STEP
    step = (step + 1) % 64 // 4 bars
  }
}

function play(ctx: AudioContext, out: GainNode, s: number, t: number) {
  const inBar = s % 16
  const chord = CHORDS[Math.floor(s / 16)]
  if (inBar % 4 === 0) kick(ctx, out, t)
  if (inBar === 4 || inBar === 12) clap(ctx, out, t)
  if (inBar % 4 === 2) hat(ctx, out, t, 0.16, 0.09)
  hat(ctx, out, t, inBar % 2 ? 0.03 : 0.05, 0.03)
  if ([0, 3, 6, 10, 14].includes(inBar)) bass(ctx, out, t, chord.bass + (inBar === 6 ? 12 : inBar === 14 ? 7 : 0))
  if (inBar === 0) pad(ctx, out, t, chord.tones)
  if (inBar === 6 || inBar === 14) stab(ctx, out, t, chord.tones)
  const bar = Math.floor(s / 16) % 2
  for (const role of singers) {
    const v = SINGERS[role]
    for (const [at, tone, len] of v.phrase[bar]) {
      if (at === inBar) sing(ctx, out, t, hz(chord.tones[tone] + v.octave), len * STEP, v)
    }
    if (bar === 1 && inBar === 15) growl(ctx, out, t, v)
  }
}

function env(ctx: AudioContext, t: number, peak: number, attack: number, decay: number) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  return g
}

function noise(ctx: AudioContext, t: number, length: number) {
  const n = ctx.createBufferSource()
  n.buffer = noiseBuf
  n.start(t, Math.random() * 0.5)
  n.stop(t + length)
  return n
}

function kick(ctx: AudioContext, out: GainNode, t: number) {
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(140, t)
  o.frequency.exponentialRampToValueAtTime(46, t + 0.11)
  const g = env(ctx, t, 0.85, 0.004, 0.32)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.4)
}

function clap(ctx: AudioContext, out: GainNode, t: number) {
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 1400
  f.Q.value = 0.9
  const g = env(ctx, t, 0.22, 0.003, 0.16)
  noise(ctx, t, 0.2).connect(f).connect(g).connect(out)
}

function hat(ctx: AudioContext, out: GainNode, t: number, level: number, decay: number) {
  const f = ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 7200
  const g = env(ctx, t, level, 0.002, decay)
  noise(ctx, t, decay + 0.02).connect(f).connect(g).connect(out)
}

function bass(ctx: AudioContext, out: GainNode, t: number, midi: number) {
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.value = hz(midi)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 520
  const g = env(ctx, t, 0.42, 0.01, 0.24)
  o.connect(f).connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.3)
}

function pad(ctx: AudioContext, out: GainNode, t: number, tones: number[]) {
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(700, t)
  f.frequency.linearRampToValueAtTime(1300, t + STEP * 8)
  f.frequency.linearRampToValueAtTime(800, t + STEP * 16)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.35)
  g.gain.setValueAtTime(0.05, t + STEP * 13)
  g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 16)
  f.connect(g).connect(out)
  for (const m of tones.slice(0, 4)) {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = hz(m)
      o.detune.value = det
      o.connect(f)
      o.start(t)
      o.stop(t + STEP * 16 + 0.05)
    }
  }
}

function stab(ctx: AudioContext, out: GainNode, t: number, tones: number[]) {
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 1800
  const g = env(ctx, t, 0.05, 0.005, 0.14)
  f.connect(g).connect(out)
  for (const m of tones.slice(1, 4)) {
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = hz(m + 12)
    o.connect(f)
    o.start(t)
    o.stop(t + 0.18)
  }
}

function sing(ctx: AudioContext, out: GainNode, t: number, freq: number, length: number, v: Singer) {
  const o = ctx.createOscillator()
  o.type = v.wave
  o.frequency.setValueAtTime(freq * 0.985, t)
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.06) // a little scoop into the note
  const vib = ctx.createOscillator()
  vib.frequency.value = 5.4
  const vibDepth = ctx.createGain()
  vibDepth.gain.setValueAtTime(0, t)
  vibDepth.gain.linearRampToValueAtTime(freq * 0.008, t + Math.min(0.25, length))
  vib.connect(vibDepth).connect(o.frequency)
  const mix = ctx.createGain()
  mix.gain.value = 1
  for (const [i, f] of v.vowel.entries()) {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f
    bp.Q.value = 5
    const lvl = ctx.createGain()
    lvl.gain.value = i === 0 ? 1.4 : 0.8
    o.connect(bp).connect(lvl).connect(mix)
  }
  const g = ctx.createGain()
  const end = t + length
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v.level, t + 0.05)
  g.gain.setValueAtTime(v.level, Math.max(t + 0.06, end - 0.08))
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.06)
  mix.connect(g).connect(out)
  o.start(t)
  vib.start(t)
  o.stop(end + 0.1)
  vib.stop(end + 0.1)
}

function growl(ctx: AudioContext, out: GainNode, t: number, v: Singer) {
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  const base = 70 * Math.pow(2, v.octave / 12)
  o.frequency.setValueAtTime(base * 1.4, t)
  o.frequency.exponentialRampToValueAtTime(base, t + 0.22)
  const am = ctx.createOscillator()
  am.frequency.value = 32
  const amDepth = ctx.createGain()
  amDepth.gain.value = 0.5
  const wob = ctx.createGain()
  wob.gain.value = 0.5
  am.connect(amDepth).connect(wob.gain)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 900
  const g = env(ctx, t, v.level * 0.9, 0.02, 0.22)
  o.connect(f).connect(wob).connect(g).connect(out)
  o.start(t)
  am.start(t)
  o.stop(t + 0.3)
  am.stop(t + 0.3)
}
