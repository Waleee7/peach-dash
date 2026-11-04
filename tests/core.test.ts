import { describe, it, expect } from 'vitest'
import { Sim, Spawner, laneX, multiplier, speedAt, LANE_W, type Track } from '../src/core/sim'
import { botAct } from '../src/core/bot'
import { defaultSave, loadSave, writeSave, dailyMission, applyRun, SAVE_KEY } from '../src/core/save'
import { CHARACTERS } from '../src/core/characters'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }

describe('lanes + player', () => {
  it('clamps lane changes and eases x to the lane center', () => {
    const s = new Sim(1); s.left(); s.left(); s.left()
    expect(s.p.lane).toBe(0)
    s.invincible = true
    for (let i = 0; i < 30; i++) s.step(1 / 60)
    expect(s.p.x).toBeCloseTo(laneX(0), 1)
    expect(laneX(2) - laneX(0)).toBeCloseTo(LANE_W * 2)
  })
  it('jumps once, lands, and slide cancels in the air (fast fall)', () => {
    const s = new Sim(1); s.invincible = true
    s.jump(); s.step(0.1); const y = s.p.y; s.jump()
    expect(y).toBeGreaterThan(0.5); expect(s.p.air).toBe(true)
    s.slide(); s.step(0.4); expect(s.p.y).toBe(0)
  })
})

describe('collision', () => {
  const sim = () => { const s = new Sim(7); s.track.obstacles = []; s.track.pickups = []; s.spawner.cursor = 1e9; return s }
  const put = (s: Sim, kind: any, lane: number, ahead: number, span = 1) => {
    const defs: any = { barrier: [0.8, 0, 0.95], truck: [5, 0, 3.2], sign: [0.7, 1.55, 3.4] }
    const [len, bottom, top] = defs[kind]
    s.track.obstacles.push({ id: 99, kind, lane, span, d: s.dist + ahead, len, bottom, top, variant: 0, minGap: 9, counted: false })
  }
  it('crashes into a truck in the same lane, not in another lane', () => {
    const a = sim(); put(a, 'truck', 1, 10); for (let i = 0; i < 120; i++) a.step(1 / 60)
    expect(a.state).toBe('dead')
    const b = sim(); put(b, 'truck', 0, 10); for (let i = 0; i < 120; i++) b.step(1 / 60)
    expect(b.state).toBe('run')
  })
  it('jump clears a barrier, slide clears a sign, standing hits the sign', () => {
    const a = sim(); put(a, 'barrier', 1, 9); let jumped = false
    for (let i = 0; i < 90; i++) { if (!jumped && a.track.obstacles[0].d - a.dist < 5) { a.jump(); jumped = true } a.step(1 / 60) }
    expect(a.state).toBe('run')
    const b = sim(); put(b, 'sign', 0, 9, 3); let sl = false
    for (let i = 0; i < 90; i++) { if (!sl && b.track.obstacles[0].d - b.dist < 6) { b.slide(); sl = true } b.step(1 / 60) }
    expect(b.state).toBe('run')
    const c = sim(); put(c, 'sign', 0, 9, 3); for (let i = 0; i < 90; i++) c.step(1 / 60)
    expect(c.state).toBe('dead')
  })
  it('board shield absorbs one hit; revive clears the way', () => {
    const s = sim(); s.board = 10; put(s, 'truck', 1, 8); for (let i = 0; i < 120; i++) s.step(1 / 60)
    expect(s.state).toBe('run'); expect(s.board).toBe(0)
    const d = sim(); put(d, 'truck', 1, 8); for (let i = 0; i < 120; i++) d.step(1 / 60)
    expect(d.state).toBe('dead'); d.revive()
    expect(d.state).toBe('run'); expect(d.reviveUsed).toBe(true)
  })
  it('near-miss awards bonus and combo (late jump over a barrier)', () => {
    let found = 0
    for (let lead = 1.0; lead < 6; lead += 0.25) {
      const s = sim(); put(s, 'barrier', 1, 9); let j = false
      for (let i = 0; i < 160 && s.state === 'run'; i++) { if (!j && s.track.obstacles[0].d - s.dist < lead) { s.jump(); j = true } s.step(1 / 60) }
      if (s.stats.near > 0) { found++; expect(s.combo).toBe(3); expect(s.score).toBeGreaterThan(100) }
    }
    expect(found).toBeGreaterThan(0)
  })
})

describe('spawn + scoring', () => {
  it('is deterministic per seed', () => {
    const t1: Track = { obstacles: [], pickups: [] }, t2: Track = { obstacles: [], pickups: [] }
    new Spawner(42).fill(t1, 3000); new Spawner(42).fill(t2, 3000)
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2))
    expect(t1.obstacles.length).toBeGreaterThan(20)
  })
  it('never blocks all three lanes with trucks and keeps a clear start', () => {
    for (let seed = 1; seed < 40; seed++) {
      const t: Track = { obstacles: [], pickups: [] }; new Spawner(seed).fill(t, 8000)
      expect(t.obstacles.every(o => o.d >= 100)).toBe(true)
      const byD = new Map<number, number>()
      for (const o of t.obstacles) if (o.kind === 'truck') byD.set(o.d, (byD.get(o.d) ?? 0) + 1)
      for (const n of byD.values()) expect(n).toBeLessThan(3)
    }
  })
  it('autopilot survives 6000m on several seeds (course is always passable)', () => {
    for (const seed of [3, 11, 29, 101, 777]) {
      const s = new Sim(seed)
      for (let i = 0; i < 60 * 330 && s.dist < 6000 && s.state === 'run'; i++) { botAct(s); s.step(1 / 60) }
      expect(s.state, `seed ${seed} died at ${Math.floor(s.dist)}`).toBe('run')
    }
  })
  it('multiplier + speed curve', () => {
    expect([multiplier(0), multiplier(10), multiplier(99)]).toEqual([1, 2, 5])
    expect(speedAt(0)).toBeLessThan(speedAt(5000)); expect(speedAt(1e6)).toBeLessThanOrEqual(36)
  })
  it('peaches grant score/combo, perk multiplies peaches', () => {
    const s = new Sim(5, { ...CHARACTERS[3].perk }); s.track.obstacles = []
    s.track.pickups = [{ id: 1, kind: 'peach', lane: 1, d: 3, y: 0.9, taken: false, pull: 0 }]; s.spawner.cursor = 1e9
    for (let i = 0; i < 30; i++) s.step(1 / 60)
    expect(s.peaches).toBeCloseTo(1.3); expect(s.combo).toBe(1); expect(s.tea).toBeGreaterThan(0)
  })
})

describe('save + daily', () => {
  it('round-trips, survives corruption, always owns the starter', () => {
    const st = mem(); const s = defaultSave(); s.peaches = 1234; s.owned = ['tay']; writeSave(st, s)
    const l = loadSave(st); expect(l.peaches).toBe(1234); expect(l.owned).toContain('juno')
    st.setItem(SAVE_KEY, '{bad json'); expect(loadSave(st)).toEqual(defaultSave())
    st.setItem(SAVE_KEY, JSON.stringify({ v: 1, peaches: -5, selected: 'ghost' })); const c = loadSave(st)
    expect(c.peaches).toBe(300); expect(c.selected).toBe('juno')
  })
  it('daily mission is seeded by date and pays out once', () => {
    expect(dailyMission('2026-11-03')).toEqual(dailyMission('2026-11-03'))
    const s = defaultSave(); const m = dailyMission('2026-11-03')
    const run = { peaches: 999, near: 999, dist: 99999, jumps: 999, score: 5000 }
    const before = s.peaches; const r = applyRun(s, '2026-11-03', run)
    expect(r).toBe(m.reward); expect(s.peaches).toBe(before + 999 + m.reward)
    expect(applyRun(s, '2026-11-03', run)).toBe(0); expect(s.best).toBe(5000)
  })
})
