import { mulberry32 } from './rng'
import { BASE_PERK, type Perk } from './characters'
import { POWER_KINDS, powerDuration, rollCrate, type PowerKind } from './powers'

export const LANE_W = 2.4
export const laneX = (l: number) => (l - 1) * LANE_W
export const GRAVITY = 34
export const JUMP_V = 12.6
export const KICKS_JUMP_V = 17.4
export const KICKS_GRAVITY = 29
export const SLIDE_T = 0.7
export const PLAYER_H = 1.8
export const SLIDE_H = 0.7
export const HALF_W = 0.32
export const START_SPEED = 17
export const MAX_SPEED = 36
export const TRAIN_H = 2.9
export const CAR_LEN = 14.8
export const RAMP_LEN = 11
export const GLIDE_ALT = 6.8
/** A lateral overlap shallower than this is a side clip (stumble), deeper is a head-on hit (crash). */
export const SIDE_CLIP = 0.55
/** Seconds after a stumble in which a second clip crashes you. */
export const STUMBLE_WINDOW = 5.5
export const CHASE_START = 3.2
export const CHASE_ESCAPE = 14
/** Cars only start rolling once this close, so a moving car can never invade the rows around it. */
export const CAR_ACTIVE = 60
export const LETTERS = 'ATLANTA'
/** Collect these in order during a run to trigger the x5 boost. */
export const BADGES = ['atl', 'i285', 'hawk', 'star', 'bulldog'] as const
export const BADGE_NAMES: Record<(typeof BADGES)[number], string> = { atl: 'ATL PLATE', i285: 'THE PERIMETER', hawk: 'RED HAWK', star: 'FIRE STAR', bulldog: 'JUNKYARD DOG' }
export const BADGE_BOOST = 12
export const BADGE_MUL = 5
/** How far past the player the course is generated (must exceed the fog distance so nothing pops in). */
export const SPAWN_AHEAD = 420
export const speedAt = (d: number) => MAX_SPEED - (MAX_SPEED - START_SPEED) * Math.exp(-d / 3200)
export const multiplier = (combo: number) => 1 + Math.min(4, Math.floor(combo / 10))

export type ObsKind = 'barrier' | 'cones' | 'truck' | 'bus' | 'sign' | 'scooter' | 'barricade' | 'lowsign' | 'car' | 'train' | 'ramp'
export const OBS_DEF: Record<ObsKind, { len: number; bottom: number; top: number }> = {
  barrier: { len: 0.8, bottom: 0, top: 0.95 },
  cones: { len: 1.0, bottom: 0, top: 0.75 },
  truck: { len: 5.0, bottom: 0, top: 3.2 },
  bus: { len: 9.0, bottom: 0, top: 3.2 },
  sign: { len: 0.7, bottom: 1.55, top: 3.4 },
  scooter: { len: 1.2, bottom: 0, top: 0.9 },
  barricade: { len: 0.9, bottom: 0, top: 1.35 },
  lowsign: { len: 0.6, bottom: 0.8, top: 1.75 },
  car: { len: 4.2, bottom: 0, top: 1.55 },
  train: { len: CAR_LEN, bottom: 0, top: TRAIN_H },
  ramp: { len: RAMP_LEN, bottom: 0, top: TRAIN_H },
}
/** Kinds the autopilot must dodge by changing lane (it can't jump or slide them). */
export const LANE_BLOCKERS: ObsKind[] = ['truck', 'bus', 'car', 'train', 'ramp']

export interface Obstacle {
  id: number; kind: ObsKind; lane: number; span: number; d: number; len: number
  bottom: number; top: number; variant: number; minGap: number; counted: boolean
  vel?: number         // m/s along the track (cars): negative = oncoming
  smashed?: boolean    // plowed through by a Lemon Pepper Wing
}
export type PickKind = 'peach' | 'pad' | 'crate' | 'letter' | 'badge' | PowerKind
export interface Pickup { id: number; kind: PickKind; lane: number; d: number; y: number; taken: boolean; pull: number }
export interface Player { lane: number; x: number; y: number; vy: number; slide: number; air: boolean }
export interface Track { obstacles: Obstacle[]; pickups: Pickup[] }
export interface SimEvent { t: string; v?: number; k?: string; lane?: number }
export interface Stats {
  peaches: number; near: number; jumps: number; slides: number; maxCombo: number; powerups: number
  crates: number; letters: number; smashed: number; trainDist: number; stumbles: number; geese: number; badges: number; sets: number
}
export interface RunOpts {
  levelMul?: number                                  // score multiplier from the mission level
  upgrades?: Partial<Record<PowerKind, number>>      // shop levels
  letterIdx?: number                                 // next ATLANTA letter needed (0..7)
  chaser?: boolean                                   // run-start goose flock
}

const surfaceH = (o: Obstacle, P: number) => (o.kind === 'ramp' ? o.top * Math.max(0, Math.min(1, (P - o.d) / o.len)) : o.top)

/** Seeded course generator. Always leaves a "safe" lane (or a jump/slide) so every row is passable. */
export class Spawner {
  rng: () => number
  cursor = 110
  safe = 1
  nextPower = 360
  nextPad = 320
  nextCrate = 250
  nextLetter = 200
  nextBadge = 170
  letters = true
  uid = 1
  constructor(seed: number) { this.rng = mulberry32(seed) }

  fill(t: Track, upto: number) { while (this.cursor < upto) this.row(t) }

  obs(t: Track, kind: ObsKind, lane: number, span = 1, d = this.cursor, variant = 0, len?: number, vel?: number) {
    const def = OBS_DEF[kind]
    t.obstacles.push({ id: this.uid++, kind, lane, span, d, len: len ?? def.len, bottom: def.bottom, top: def.top, variant, minGap: 9, counted: false, ...(vel ? { vel } : {}) })
  }
  private peach(t: Track, lane: number, d: number, y = 0.9) {
    t.pickups.push({ id: this.uid++, kind: 'peach', lane, d, y, taken: false, pull: 0 })
  }
  private line(t: Track, lane: number, from: number, n: number, y = 0.9, arc = 0) {
    for (let i = 0; i < n; i++) this.peach(t, lane, from + i * 2.2, y + (arc ? Math.sin((i / (n - 1)) * Math.PI) * arc : 0))
  }
  /** Deterministic peach ribbon for the SkyView Glide, independent of the course rng. */
  glideTrail(t: Track, from: number, length: number, seed: number) {
    const r = mulberry32(seed ^ 0x5bd1e995), made: Pickup[] = []
    let lane = 1, phase = r() * 6
    for (let d = from, i = 0; d < from + length; d += 3, i++) {
      if (i % 9 === 0) lane = Math.max(0, Math.min(2, lane + (r() < 0.5 ? -1 : 1)))
      made.push({ id: this.uid++, kind: 'peach', lane, d, y: GLIDE_ALT + 0.8 + Math.sin(phase + i * 0.5) * 0.4, taken: false, pull: 0 })
    }
    t.pickups.push(...made)
  }

  private special(t: Track, lane: number, d: number) {
    const r = this.rng, c = this.cursor
    const put = (kind: PickKind) => t.pickups.push({ id: this.uid++, kind, lane, d, y: 1.3, taken: false, pull: 0 })
    if (this.letters && c > this.nextLetter) { put('letter'); this.nextLetter = c + 340 + r() * 140; return true }
    if (c > this.nextBadge) { put('badge'); this.nextBadge = c + 230 + r() * 110; return true }
    if (c > this.nextCrate) { put('crate'); this.nextCrate = c + 330 + r() * 240; return true }
    if (c > this.nextPower) {
      const pool: PowerKind[] = c < 560 ? ['tea', 'board', 'cobbler', 'kicks'] : POWER_KINDS
      put(pool[Math.floor(r() * pool.length)]); this.nextPower = c + 300 + r() * 240; return true
    }
    if (c > this.nextPad) { t.pickups.push({ id: this.uid++, kind: 'pad', lane, d, y: 0.05, taken: false, pull: 0 }); this.nextPad = c + 650 + r() * 400; return true }
    return false
  }

  /** Ramp + 2-3 elevated rail cars in each train lane; the safe lane stays open the whole way. */
  private trainRow(t: Track, ns: number, c: number) {
    const r = this.rng, k = Math.min(1, c / 5000)
    const others = [0, 1, 2].filter(l => l !== ns)
    const lanes = k > 0.25 && r() < 0.4 ? others : [others[Math.floor(r() * 2)]]
    const cars = 2 + (r() < 0.5 ? 1 : 0), len = cars * CAR_LEN
    for (const l of lanes) {
      this.obs(t, 'ramp', l, 1, c, 0, RAMP_LEN)
      this.obs(t, 'train', l, 1, c + RAMP_LEN, 0, len)
      for (let i = 0; i < 4; i++) this.peach(t, l, c + 2 + i * 2.4, 0.9 + TRAIN_H * Math.min(1, (2 + i * 2.4) / RAMP_LEN))
      for (let i = 0; i < Math.floor((len - 6) / 2.8); i++) this.peach(t, l, c + RAMP_LEN + 3 + i * 2.8, TRAIN_H + 0.9)
    }
    this.line(t, ns, c - 4, 8)
    if (c > this.nextCrate && lanes.length) { t.pickups.push({ id: this.uid++, kind: 'crate', lane: lanes[0], d: c + RAMP_LEN + len / 2, y: TRAIN_H + 1.2, taken: false, pull: 0 }); this.nextCrate = c + 330 + r() * 240 }
    this.safe = ns
    return RAMP_LEN + len
  }

  private row(t: Track) {
    const r = this.rng
    const k = Math.min(1, this.cursor / 5000)
    const sp = speedAt(this.cursor)
    const gap = Math.max(26, sp * 1.15)
    const step = gap >= 34 ? 2 : 1
    const ns = Math.max(0, Math.min(2, this.safe + Math.round((r() * 2 - 1) * step)))
    const lanes = [0, 1, 2]
    const others = lanes.filter(l => l !== ns)
    const x = r()
    const c = this.cursor
    let extra = 0
    const trucks = () => {
      const pick = k > 0.25 && r() < 0.5 ? others : [others[Math.floor(r() * 2)]]
      pick.forEach(l => { if (k > 0.02 && r() < 0.32) this.obs(t, 'bus', l, 1, c - 2); else this.obs(t, 'truck', l, 1, c, Math.floor(r() * 3)) })
      this.line(t, ns, c - 4, 7)
      this.safe = ns
    }
    if (x < 0.17 - 0.08 * k) {
      this.line(t, ns, c - 6, 8)
      this.safe = ns
    } else if (x < 0.35) {                         // jump row
      const pool: ObsKind[] = k > 0.04 ? ['barrier', 'cones', 'scooter'] : ['barrier', 'cones']
      const v = pool[Math.floor(r() * pool.length)]
      for (const l of lanes) if (l !== ns || r() < 0.6) this.obs(t, v, l, 1, c, Math.floor(r() * 3))
      this.line(t, ns, c - 5, 6, 1.2, 1.6)
    } else if (x < 0.46) {                         // slide row
      const sk: ObsKind = k > 0.08 && r() < 0.45 ? 'lowsign' : 'sign'
      if (r() < 0.65 || k < 0.15) this.obs(t, sk, 0, 3)
      else { this.obs(t, sk, ns === 0 ? 1 : 0, 2); this.safe = ns }
      this.line(t, ns, c - 4, 5, 0.8)
    } else if (x < 0.58 || k < 0.03) {            // food trucks
      trucks()
    } else if (x < 0.68 && k > 0.06) {             // moving cars
      const pick = k > 0.3 && r() < 0.5 ? others : [others[Math.floor(r() * 2)]]
      for (const l of pick) { const oncoming = r() < 0.6; this.obs(t, 'car', l, 1, oncoming ? c + 32 + r() * 4 : c - 6, Math.floor(r() * 3), undefined, oncoming ? -(9 + r() * 5) : 5 + r() * 3) }
      this.line(t, ns, c - 4, 7)
      this.safe = ns
    } else if (x < 0.75 && k > 0.1) {              // barricades (jump them)
      for (const l of others) this.obs(t, 'barricade', l, 1, c, Math.floor(r() * 2))
      if (r() < 0.5) this.obs(t, 'barricade', ns, 1, c, 0)
      this.line(t, ns, c - 5, 6, 1.4, 1.5)
      this.safe = ns
    } else if (x < 0.87 && k > 0.04) {             // elevated train, ramp up and run on top
      extra = this.trainRow(t, ns, c)
    } else {                                       // mixed
      if (k < 0.1) { trucks() } else {
        this.obs(t, 'truck', others[0], 1, c, Math.floor(r() * 3))
        this.obs(t, r() < 0.5 ? 'barrier' : 'scooter', others[1])
        this.line(t, ns, c - 4, 7)
        this.safe = ns
      }
    }
    if (!this.special(t, ns, c + gap / 2) && r() < 0.5 && extra === 0) this.line(t, ns, c + gap / 2 - 5, 5)
    this.cursor += gap + extra + (extra ? 12 : 0)
  }
}

const DEFAULT_OPTS: Required<RunOpts> = { levelMul: 1, upgrades: {}, letterIdx: 0, chaser: false }

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
  /** Remaining seconds per power-up, plus the length they were granted for (HUD bars). */
  pw: Record<PowerKind, number> = { wing: 0, tea: 0, cobbler: 0, kicks: 0, glide: 0, board: 0 }
  powerMax: Record<PowerKind, number> = { wing: 1, tea: 1, cobbler: 1, kicks: 1, glide: 1, board: 1 }
  invuln = 0
  stumbleT = 0            // >0: a second side clip crashes you
  stumbleFx = 0           // visual stumble timer
  chase = { on: false, gap: CHASE_START }
  crashCause = ''
  letterIdx = 0
  badgeIdx = 0            // next badge in the current set
  badgeBoost = 0          // >0: x5 score
  invincible = false      // attract mode
  reviveUsed = false
  trainTime = 0
  p: Player = { lane: 1, x: 0, y: 0, vy: 0, slide: 0, air: false }
  track: Track = { obstacles: [], pickups: [] }
  spawner: Spawner
  stats: Stats = { peaches: 0, near: 0, jumps: 0, slides: 0, maxCombo: 0, powerups: 0, crates: 0, letters: 0, smashed: 0, trainDist: 0, stumbles: 0, geese: 0, badges: 0, sets: 0 }
  onEvent: (e: SimEvent) => void = () => {}
  opts: Required<RunOpts>
  private crateRng: () => number
  private frame = 0

  constructor(public seed: number, public perk: Perk = BASE_PERK, opts: RunOpts = {}) {
    this.opts = { ...DEFAULT_OPTS, ...opts }
    this.spawner = new Spawner(seed)
    this.crateRng = mulberry32(seed ^ 0x9e3779b9)
    this.letterIdx = this.opts.letterIdx
    this.spawner.letters = this.letterIdx < LETTERS.length
    this.speed = START_SPEED
    if (perk.startTea > 0) this.grantTimer('tea', perk.startTea)
    if (perk.startWing > 0) this.grantTimer('wing', perk.startWing)
    if (this.opts.chaser) this.chase = { on: true, gap: CHASE_START + (perk.startWing > 0 ? 4 : 0) }
    this.spawner.fill(this.track, SPAWN_AHEAD)
  }
  /** Old field names kept so the shield and magnet read naturally in tests and HUD. */
  get tea() { return this.pw.tea } set tea(v: number) { this.pw.tea = v }
  get board() { return this.pw.board } set board(v: number) { this.pw.board = v }
  get wing() { return this.pw.wing }
  get cobbler() { return this.pw.cobbler }
  get kicks() { return this.pw.kicks }
  get glide() { return this.pw.glide }

  /** Debug/screenshot helper: jump to a distance with a clear runway. */
  teleport(d: number) {
    this.dist = d; this.track = { obstacles: [], pickups: [] }; this.spawner.cursor = d + 110; this.spawner.fill(this.track, d + SPAWN_AHEAD)
  }
  get mult() { return multiplier(this.combo) }
  /** Everything that scales score: combo streak x mission level x Peach Cobbler. */
  get scoreMul() { return this.mult * this.opts.levelMul * (this.pw.cobbler > 0 ? 2 : 1) * (this.badgeBoost > 0 ? BADGE_MUL : 1) }
  get height() { return this.p.slide > 0 ? SLIDE_H : PLAYER_H }
  get onTrain() { return !this.p.air && this.p.y > TRAIN_H - 0.3 }
  private emit(t: string, v?: number, k?: string, lane?: number) { this.onEvent({ t, v, k, lane }) }

  left() { if (this.p.lane > 0) { this.p.lane--; this.emit('lane', -1) } }
  right() { if (this.p.lane < 2) { this.p.lane++; this.emit('lane', 1) } }
  jump() {
    const p = this.p
    if (p.air || this.pw.glide > 0) return
    p.vy = this.pw.kicks > 0 ? KICKS_JUMP_V : JUMP_V; p.air = true; p.slide = 0; this.stats.jumps++; this.emit('jump', this.pw.kicks > 0 ? 1 : 0)
  }
  slide() {
    const p = this.p
    if (this.pw.glide > 0) return
    if (p.air) { p.vy = Math.min(p.vy, -24); return }
    if (p.slide <= 0) { this.stats.slides++; this.emit('slide') }
    p.slide = SLIDE_T
  }

  /** Start (or extend) a power-up timer. */
  grantTimer(kind: PowerKind, seconds: number) {
    this.pw[kind] = seconds; this.powerMax[kind] = seconds
  }
  /** Pick-up effect of a power-up, with the shop upgrade and runner perk applied. */
  grantPower(kind: PowerKind) {
    const perkMul = this.perk.powerMul * (kind === 'glide' ? this.perk.glideMul : 1)
    this.grantTimer(kind, powerDuration(kind, this.opts.upgrades[kind] ?? 0, perkMul))
    this.stats.powerups++
    if (kind === 'glide') {
      this.p.slide = 0
      this.spawner.glideTrail(this.track, this.dist + 26, this.pw.glide * Math.max(this.speed, 24) * 1.05, this.seed + Math.floor(this.dist))
    }
    if (kind === 'wing' || kind === 'glide') this.scatterGeese()
    this.emit('power', undefined, kind)
  }
  private scatterGeese() { if (this.chase.on) { this.chase.on = false; this.stats.geese++; this.emit('chaseEnd', 1) } }

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

  /** Highest walkable surface (ramp slope or train roof) under the player that they are actually standing on, not clipping through. */
  private floorAt(): number {
    const p = this.p, P = this.dist
    let f = 0
    for (const o of this.track.obstacles) {
      if ((o.kind !== 'ramp' && o.kind !== 'train') || o.smashed) continue
      if (o.d > P || o.d + o.len < P) continue
      if (Math.abs(p.x - laneX(o.lane)) > LANE_W / 2 - 0.1) continue
      const h = surfaceH(o, P)
      if (p.y >= h - 0.5 && h > f) f = h
    }
    return f
  }

  private crash(cause: string) {
    this.state = 'dead'; this.crashCause = cause; this.emit('crash', undefined, cause)
  }

  private sub(h: number) {
    const p = this.p, tr = this.track
    this.time += h; this.frame++
    let target = speedAt(this.dist)
    if (this.boost > 0) { target *= 1.35; this.boost -= h }
    if (this.pw.wing > 0) target *= 1.45
    else if (this.pw.glide > 0) target *= 1.12
    this.speed += (target - this.speed) * (1 - Math.exp(-h * 4))
    this.dist += this.speed * h
    this.score += this.speed * h * 0.5 * this.scoreMul
    this.spawner.fill(tr, this.dist + SPAWN_AHEAD)
    for (const o of tr.obstacles) if (o.vel && o.d - this.dist < CAR_ACTIVE) o.d += o.vel * h
    // timers
    for (const k of POWER_KINDS) if (this.pw[k] > 0) {
      this.pw[k] -= h
      if (this.pw[k] <= 0) {
        this.pw[k] = 0
        if (k === 'wing' || k === 'glide') this.invuln = Math.max(this.invuln, k === 'glide' ? 1.6 : 1.2)
        this.emit('powerEnd', undefined, k)
      }
    }
    for (const k of ['invuln', 'comboT', 'stumbleT', 'stumbleFx'] as const) if (this[k] > 0) this[k] -= h
    if (this.comboT <= 0 && this.combo) this.combo = 0
    if (this.badgeBoost > 0 && (this.badgeBoost -= h) <= 0) { this.badgeBoost = 0; this.emit('badgeEnd') }
    // goose flock gives up once you out-run it
    if (this.chase.on) {
      this.chase.gap += (0.62 + Math.max(0, this.speed - 20) * 0.02 + (this.boost > 0 ? 1.4 : 0)) * h
      if (this.chase.gap >= CHASE_ESCAPE) { this.chase.on = false; this.stats.geese++; this.emit('chaseEnd', 0) }
    }
    // player horizontal
    p.x += (laneX(p.lane) - p.x) * (1 - Math.exp(-h * this.perk.laneRate))
    if (p.slide > 0) p.slide -= h
    // vertical: glide hovers; otherwise gravity against the highest surface underfoot
    if (this.pw.glide > 0) {
      p.air = true; p.vy = 0; p.y += (GLIDE_ALT - p.y) * (1 - Math.exp(-h * 2.4))
    } else {
      const f = this.floorAt()
      if (!p.air) {
        if (p.y < f) p.y = f                                 // ramp lifts you
        else if (p.y > f + 0.001) { p.air = true; p.vy = 0 } // ran off the end of a train
      }
      if (p.air) {
        p.vy -= (this.pw.kicks > 0 ? (p.vy < 0 ? KICKS_GRAVITY * 2.1 : KICKS_GRAVITY) : GRAVITY) * h; p.y += p.vy * h
        if (p.vy <= 0 && p.y <= f) { const hard = -p.vy; p.y = f; p.vy = 0; p.air = false; this.emit('land', hard) }
      }
    }
    if (this.onTrain) { this.trainTime += h; this.stats.trainDist += this.speed * h }
    // obstacles
    const P = this.dist
    const bh = this.height
    for (const o of tr.obstacles) {
      if (o.smashed) continue
      if (o.d > P + 2 || o.d + o.len < P - 2) {
        if (!o.counted && o.d + o.len < P - 2) { o.counted = true; if (o.minGap < 0.55 && o.minGap > 0 && o.kind !== 'ramp') this.near(o.minGap) }
        continue
      }
      const x0 = laneX(o.lane) - LANE_W / 2 + 0.15, x1 = laneX(o.lane + o.span - 1) + LANE_W / 2 - 0.15
      const latGap = Math.max(x0 - (p.x + HALF_W), p.x - HALF_W - x1)
      const zOverlap = o.d < P + 0.35 && o.d + o.len > P - 0.35
      if (!zOverlap) continue
      const solidTop = o.kind === 'ramp' || o.kind === 'train'
      const vGap = solidTop ? (p.y >= surfaceH(o, P) - 0.5 ? 1 : -(surfaceH(o, P) - p.y)) : Math.max(o.bottom - (p.y + bh), p.y - o.top)
      const gap = Math.max(latGap, vGap)
      if (gap > 0) { if (gap < o.minGap && !solidTop) o.minGap = gap; continue }
      if (-latGap < 0.08 || -vGap < 0.08) continue // graze forgiveness
      if (this.invincible || this.invuln > 0 || this.pw.glide > 0) continue
      if (this.pw.wing > 0) {
        if (o.kind === 'train' || o.kind === 'ramp') continue
        o.smashed = true; this.stats.smashed++; this.score += 60 * this.scoreMul; this.emit('smash', o.d, o.kind, o.lane); continue
      }
      if (this.pw.board > 0) { this.pw.board = 0; this.invuln = 1.4; this.emit('shield'); continue }
      // side clip -> stumble, head-on (or a second clip too soon) -> crash
      const cx = (x0 + x1) / 2, awayLane = p.x < cx ? o.lane - 1 : o.lane + o.span
      if (-latGap < SIDE_CLIP && awayLane >= 0 && awayLane <= 2 && this.stumbleT <= 0) {
        this.stumble(awayLane, -latGap)
        if (this.state !== 'run') return
        continue
      }
      this.crash(-latGap < SIDE_CLIP ? 'clip' : 'hit'); return
    }
    // pickups
    const magnet = this.pw.tea > 0, gliding = this.pw.glide > 0
    for (const k of tr.pickups) {
      if (k.taken) continue
      const dd = Math.abs(k.d - P)
      if (k.pull > 0) { k.pull += h / 0.2; if (k.pull >= 1) this.grab(k); continue }
      if (k.kind === 'peach' && ((magnet && k.d > P - 1 && k.d - P < 16) || (gliding && k.y > 4 && k.d > P - 1 && k.d - P < 22))) { k.pull = 0.001; continue }
      if (dd > 1.1) continue
      if (Math.abs(laneX(k.lane) - p.x) > 1.15) continue
      if (k.kind === 'pad') { if (p.y < 1.4) this.grab(k) }
      else if (k.kind === 'peach' ? (k.y > p.y - 0.4 && k.y < p.y + bh + 0.3) : (k.y > p.y - 1.6 && k.y < p.y + bh + 0.9)) this.grab(k)
    }
    // prune
    if ((this.frame & 31) === 0) {
      tr.obstacles = tr.obstacles.filter(o => o.d + o.len > P - 12)
      tr.pickups = tr.pickups.filter(k => k.d > P - 12)
    }
  }

  private stumble(awayLane: number, pen: number) {
    const p = this.p
    this.stumbleT = STUMBLE_WINDOW * this.perk.stumbleMul; this.stumbleFx = 0.9; this.invuln = Math.max(this.invuln, 0.8)
    this.speed *= 0.62; this.stats.stumbles++
    p.lane = awayLane; p.x += (laneX(awayLane) - p.x) * Math.min(0.6, pen + 0.15)
    this.combo = 0
    if (this.chase.on) {
      this.chase.gap -= 2.4
      if (this.chase.gap <= 0) { this.chase.gap = 0; this.crash('geese'); return }
    }
    this.emit('stumble')
  }

  private grab(k: Pickup) {
    k.taken = true
    if (k.kind === 'peach') {
      this.peaches += this.perk.peachMul; this.stats.peaches = Math.floor(this.peaches)
      this.score += 25 * this.scoreMul; this.bump(1); this.emit('peach', this.combo)
    } else if (k.kind === 'pad') { this.boost = 2.2; this.scatterGeeseSoft(); this.emit('pad') }
    else if (k.kind === 'letter') {
      if (this.letterIdx < LETTERS.length) {
        const i = this.letterIdx++; this.stats.letters++; this.score += 150 * this.scoreMul
        if (this.letterIdx >= LETTERS.length) this.spawner.letters = false
        this.emit('letter', i, LETTERS[i])
        if (this.letterIdx >= LETTERS.length) this.emit('atlanta')
      } else { this.peaches += 5; this.stats.peaches = Math.floor(this.peaches) }
    } else if (k.kind === 'badge') {
      const i = this.badgeIdx; this.stats.badges++; this.score += 200 * this.scoreMul
      this.badgeIdx = (i + 1) % BADGES.length
      this.emit('badge', i, BADGES[i])
      if (this.badgeIdx === 0) { this.stats.sets++; this.badgeBoost = BADGE_BOOST; this.emit('badgeSet') }
    } else if (k.kind === 'crate') {
      this.stats.crates++
      const rw = rollCrate(this.crateRng, this.perk.crateNoPeaches)
      if (rw.type === 'peaches') { this.peaches += rw.amount; this.stats.peaches = Math.floor(this.peaches); this.emit('crate', rw.amount, 'peaches') }
      else { this.emit('crate', 0, rw.kind); this.grantPower(rw.kind) }
    } else this.grantPower(k.kind)
  }
  private scatterGeeseSoft() { if (this.chase.on) this.chase.gap += 2 }
  private near(gap: number) {
    this.stats.near++
    this.score += 100 * this.perk.nearMul * this.scoreMul
    this.bump(3); this.emit('near', gap)
  }

  /** Second chance: clear what's ahead, grant brief invulnerability. */
  revive() {
    this.reviveUsed = true; this.state = 'run'; this.invuln = 2.5; this.combo = 0; this.stumbleT = 0; this.chase.on = false
    this.track.obstacles = this.track.obstacles.filter(o => o.d + o.len < this.dist - 3 || o.d > this.dist + 55)
    this.p.y = 0; this.p.vy = 0; this.p.air = false
    this.emit('revive')
  }
  get distance() { return Math.floor(this.dist) }
}
