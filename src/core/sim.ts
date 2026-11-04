import { mulberry32 } from './rng'
import type { Perk } from './characters'

export const LANE_W = 2.4
export const laneX = (l: number) => (l - 1) * LANE_W
export const GRAVITY = 34
export const JUMP_V = 12.6
export const SLIDE_T = 0.7
export const PLAYER_H = 1.8
export const SLIDE_H = 0.7
export const HALF_W = 0.32
export const START_SPEED = 17
export const MAX_SPEED = 36
export const speedAt = (d: number) => MAX_SPEED - (MAX_SPEED - START_SPEED) * Math.exp(-d / 3200)
export const multiplier = (combo: number) => 1 + Math.min(4, Math.floor(combo / 10))

export type ObsKind = 'barrier' | 'cones' | 'truck' | 'sign'
export const OBS_DEF: Record<ObsKind, { len: number; bottom: number; top: number }> = {
  barrier: { len: 0.8, bottom: 0, top: 0.95 },
  cones: { len: 1.0, bottom: 0, top: 0.75 },
  truck: { len: 5.0, bottom: 0, top: 3.2 },
  sign: { len: 0.7, bottom: 1.55, top: 3.4 },
}
export interface Obstacle {
  id: number; kind: ObsKind; lane: number; span: number; d: number; len: number
  bottom: number; top: number; variant: number; minGap: number; counted: boolean
}
export type PickKind = 'peach' | 'tea' | 'board' | 'pad'
export interface Pickup { id: number; kind: PickKind; lane: number; d: number; y: number; taken: boolean; pull: number }
export interface Player { lane: number; x: number; y: number; vy: number; slide: number; air: boolean }
export interface Track { obstacles: Obstacle[]; pickups: Pickup[] }
export interface SimEvent { t: string; v?: number }
export interface Stats { peaches: number; near: number; jumps: number; slides: number; maxCombo: number; powerups: number }

const DEFAULT_PERK: Perk = { laneRate: 17, nearMul: 1, powerMul: 1, peachMul: 1, startTea: 0 }

/** Seeded course generator. Always leaves a "safe" lane (or a jump/slide) so every row is passable. */
export class Spawner {
  rng: () => number
  cursor = 110
  safe = 1
  nextPower = 520
  nextPad = 320
  uid = 1
  constructor(seed: number) { this.rng = mulberry32(seed) }

  fill(t: Track, upto: number) { while (this.cursor < upto) this.row(t) }

  private obs(t: Track, kind: ObsKind, lane: number, span = 1, d = this.cursor, variant = 0) {
    const def = OBS_DEF[kind]
    t.obstacles.push({ id: this.uid++, kind, lane, span, d, len: def.len, bottom: def.bottom, top: def.top, variant, minGap: 9, counted: false })
  }
  private peach(t: Track, lane: number, d: number, y = 0.9) {
    t.pickups.push({ id: this.uid++, kind: 'peach', lane, d, y, taken: false, pull: 0 })
  }
  private line(t: Track, lane: number, from: number, n: number, y = 0.9, arc = 0) {
    for (let i = 0; i < n; i++) this.peach(t, lane, from + i * 2.2, y + (arc ? Math.sin((i / (n - 1)) * Math.PI) * arc : 0))
  }

  private row(t: Track) {
    const r = this.rng
    const k = Math.min(1, this.cursor / 5000)
    const sp = speedAt(this.cursor)
    const gap = Math.max(26, sp * 1.15)
    const step = gap >= 34 ? 2 : 1
    const ns = Math.max(0, Math.min(2, this.safe + Math.round((r() * 2 - 1) * step)))
    const lanes = [0, 1, 2]
    const x = r()
    const c = this.cursor
    if (x < 0.2 - 0.1 * k) {
      this.line(t, ns, c - 6, 8)
      this.safe = ns
    } else if (x < 0.45) {                         // jump row
      const v = r() < 0.5 ? 'barrier' : 'cones'
      for (const l of lanes) if (l !== ns || r() < 0.6) this.obs(t, v, l)
      this.line(t, ns, c - 5, 6, 1.2, 1.6)
    } else if (x < 0.6) {                          // slide row
      if (r() < 0.65 || k < 0.15) this.obs(t, 'sign', 0, 3)
      else { this.obs(t, 'sign', ns === 0 ? 1 : 0, 2); this.safe = ns }
      this.line(t, ns, c - 4, 5, 0.8)
    } else if (x < 0.82 || k < 0.2) {              // food trucks
      const others = lanes.filter(l => l !== ns)
      const pick = k > 0.25 && r() < 0.5 ? others : [others[Math.floor(r() * 2)]]
      pick.forEach(l => this.obs(t, 'truck', l, 1, c, Math.floor(r() * 3)))
      this.line(t, ns, c - 4, 7)
      this.safe = ns
    } else {                                       // mixed
      const others = lanes.filter(l => l !== ns)
      this.obs(t, 'truck', others[0], 1, c, Math.floor(r() * 3))
      this.obs(t, r() < 0.5 ? 'barrier' : 'cones', others[1])
      this.line(t, ns, c - 4, 7)
      this.safe = ns
    }
    if (c > this.nextPower) {
      t.pickups.push({ id: this.uid++, kind: r() < 0.5 ? 'tea' : 'board', lane: ns, d: c + gap / 2, y: 1.3, taken: false, pull: 0 })
      this.nextPower = c + 480 + r() * 320
    } else if (c > this.nextPad) {
      t.pickups.push({ id: this.uid++, kind: 'pad', lane: ns, d: c + gap / 2, y: 0.05, taken: false, pull: 0 })
      this.nextPad = c + 650 + r() * 400
    } else if (r() < 0.5) this.line(t, ns, c + gap / 2 - 5, 5)
    this.cursor += gap
  }
}

export class Sim {
  state: 'run' | 'dead' = 'run'
  dist = 0
  speed = START_SPEED
  time = 0
  score = 0
  combo = 0
  comboT = 0
  peaches = 0
  boost = 0
  tea = 0
  board = 0
  invuln = 0
  invincible = false      // attract mode
  reviveUsed = false
  p: Player = { lane: 1, x: 0, y: 0, vy: 0, slide: 0, air: false }
  track: Track = { obstacles: [], pickups: [] }
  spawner: Spawner
  stats: Stats = { peaches: 0, near: 0, jumps: 0, slides: 0, maxCombo: 0, powerups: 0 }
  onEvent: (e: SimEvent) => void = () => {}

  constructor(public seed: number, public perk: Perk = DEFAULT_PERK) {
    this.spawner = new Spawner(seed)
    this.tea = perk.startTea
    this.speed = START_SPEED
    this.spawner.fill(this.track, 260)
  }
  /** Debug/screenshot helper: jump to a distance with a clear runway. */
  teleport(d: number) {
    this.dist = d; this.track = { obstacles: [], pickups: [] }; this.spawner.cursor = d + 110; this.spawner.fill(this.track, d + 260)
  }
  get mult() { return multiplier(this.combo) }
  get height() { return this.p.slide > 0 ? SLIDE_H : PLAYER_H }
  private emit(t: string, v?: number) { this.onEvent({ t, v }) }

  left() { if (this.p.lane > 0) { this.p.lane--; this.emit('lane', -1) } }
  right() { if (this.p.lane < 2) { this.p.lane++; this.emit('lane', 1) } }
  jump() {
    const p = this.p
    if (p.air || p.y > 0.05) return
    p.vy = JUMP_V; p.air = true; p.slide = 0; this.stats.jumps++; this.emit('jump')
  }
  slide() {
    const p = this.p
    if (p.air) { p.vy = Math.min(p.vy, -24); return }
    if (p.slide <= 0) { this.stats.slides++; this.emit('slide') }
    p.slide = SLIDE_T
  }

  step(dt: number) {
    if (this.state !== 'run') return
    const n = Math.max(1, Math.ceil(dt / (1 / 60)))
    for (let i = 0; i < n && this.state === 'run'; i++) this.sub(dt / n)
  }

  private bump(c: number) {
    this.combo += c
    this.comboT = 2.6
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo
    if (this.combo > 0 && this.combo % 10 === 0) this.emit('combo', this.mult)
  }

  private sub(h: number) {
    const p = this.p, tr = this.track
    this.time += h
    let target = speedAt(this.dist)
    if (this.boost > 0) { target *= 1.35; this.boost -= h }
    this.speed += (target - this.speed) * (1 - Math.exp(-h * 4))
    this.dist += this.speed * h
    this.score += this.speed * h * 0.5 * this.mult
    this.spawner.fill(tr, this.dist + 260)
    // player
    p.x += (laneX(p.lane) - p.x) * (1 - Math.exp(-h * this.perk.laneRate))
    if (p.slide > 0) p.slide -= h
    if (p.air || p.y > 0) {
      p.vy -= GRAVITY * h; p.y += p.vy * h
      if (p.y <= 0) { const hard = -p.vy; p.y = 0; p.vy = 0; p.air = false; this.emit('land', hard) }
    }
    for (const k of ['tea', 'board', 'invuln', 'comboT'] as const) if (this[k] > 0) this[k] -= h
    if (this.comboT <= 0 && this.combo) this.combo = 0
    // obstacles
    const P = this.dist
    const bh = this.height
    for (const o of tr.obstacles) {
      if (o.d > P + 2 || o.d + o.len < P - 2) {
        if (!o.counted && o.d + o.len < P - 2) { o.counted = true; if (o.minGap < 0.55 && o.minGap > 0) this.near(o.minGap) }
        continue
      }
      const x0 = laneX(o.lane) - LANE_W / 2 + 0.15, x1 = laneX(o.lane + o.span - 1) + LANE_W / 2 - 0.15
      const latGap = Math.max(x0 - (p.x + HALF_W), p.x - HALF_W - x1)
      const vGap = Math.max(o.bottom - (p.y + bh), p.y - o.top)
      const zOverlap = o.d < P + 0.35 && o.d + o.len > P - 0.35
      if (!zOverlap) continue
      const gap = Math.max(latGap, vGap)
      if (gap > 0) { if (gap < o.minGap) o.minGap = gap; continue }
      if (-latGap < 0.08 || -vGap < 0.08) continue // graze forgiveness
      if (this.invincible || this.invuln > 0) continue
      if (this.board > 0) { this.board = 0; this.invuln = 1.4; this.emit('shield'); continue }
      this.state = 'dead'; this.emit('crash'); return
    }
    // pickups
    const magnet = this.tea > 0
    for (const k of tr.pickups) {
      if (k.taken) continue
      const dd = Math.abs(k.d - P)
      if (k.pull > 0) { k.pull += h / 0.2; if (k.pull >= 1) this.grab(k); continue }
      if (magnet && k.kind === 'peach' && k.d > P - 1 && k.d - P < 16) { k.pull = 0.001; continue }
      if (dd > 1.1) continue
      if (Math.abs(laneX(k.lane) - p.x) > 1.15) continue
      if (k.kind === 'pad') { if (p.y < 1.4) this.grab(k) } else if (k.kind !== 'peach' || (k.y > p.y - 0.4 && k.y < p.y + bh + 0.3)) this.grab(k)
    }
    // prune
    if (tr.obstacles.length > 0 && tr.obstacles[0].d + tr.obstacles[0].len < P - 10) tr.obstacles = tr.obstacles.filter(o => o.d + o.len > P - 10)
    if (tr.pickups.length > 0 && tr.pickups[0].d < P - 10) tr.pickups = tr.pickups.filter(k => k.d > P - 10)
  }

  private grab(k: Pickup) {
    k.taken = true
    if (k.kind === 'peach') {
      this.peaches += this.perk.peachMul; this.stats.peaches = Math.floor(this.peaches)
      this.score += 25 * this.mult; this.bump(1); this.emit('peach', this.combo)
    } else if (k.kind === 'pad') { this.boost = 2.2; this.emit('pad') }
    else {
      this.stats.powerups++
      if (k.kind === 'tea') this.tea = 10 * this.perk.powerMul
      else this.board = 18 * this.perk.powerMul
      this.emit(k.kind)
    }
  }
  private near(gap: number) {
    this.stats.near++
    this.score += 100 * this.perk.nearMul * this.mult
    this.bump(3); this.emit('near', gap)
  }

  /** Second chance: clear what's ahead, grant brief invulnerability. */
  revive() {
    this.reviveUsed = true; this.state = 'run'; this.invuln = 2.5; this.combo = 0
    this.track.obstacles = this.track.obstacles.filter(o => o.d + o.len < this.dist - 3 || o.d > this.dist + 55)
    this.p.y = 0; this.p.vy = 0; this.p.air = false
    this.emit('revive')
  }
  get distance() { return Math.floor(this.dist) }
}
