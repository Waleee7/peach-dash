import { describe, it, expect } from 'vitest'
import { Sim, laneX, STUMBLE_WINDOW, TRAIN_H, RAMP_LEN, CHASE_START, GLIDE_ALT, type Obstacle, type ObsKind, OBS_DEF } from '../src/core/sim'
import { BASE_PERK, CHARACTERS } from '../src/core/characters'
import { POWERS, POWER_KINDS, buyUpgrade, upgradeCost, upgradeMul, powerDuration, rollCrate, MAX_UPGRADE } from '../src/core/powers'
import { newMissionSet, applyMissions, freshMissions, levelMul, commitLetters, lettersFor, freshLetters, loginStatus, claimLogin, yesterday, addToBoard, removeFromBoard, type BoardEntry } from '../src/core/progress'
import { defaultSave, loadSave, writeSave } from '../src/core/save'
import { mulberry32 } from '../src/core/rng'

const sim = (perk = BASE_PERK, opts = {}) => { const s = new Sim(7, perk, opts); s.track.obstacles = []; s.track.pickups = []; s.spawner.cursor = 1e9; return s }
let uid = 500
const put = (s: Sim, kind: ObsKind, lane: number, ahead: number, len?: number) => {
  const d = OBS_DEF[kind]
  const o: Obstacle = { id: uid++, kind, lane, span: 1, d: s.dist + ahead, len: len ?? d.len, bottom: d.bottom, top: d.top, variant: 0, minGap: 9, counted: false }
  s.track.obstacles.push(o); return o
}
const run = (s: Sim, sec: number) => { for (let i = 0; i < sec * 60 && s.state === 'run'; i++) s.step(1 / 60) }
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }

describe('power-up timers + upgrades', () => {
  it('every power-up lasts its base time, and shop levels extend it by 20% each', () => {
    for (const k of POWER_KINDS) {
      expect(powerDuration(k, 0)).toBe(POWERS[k].base)
      expect(powerDuration(k, 5)).toBeCloseTo(POWERS[k].base * 2)
    }
    expect(upgradeMul(2)).toBeCloseTo(1.4)
  })
  it('a picked-up power-up counts down and ends with an event', () => {
    const s = sim(BASE_PERK, { upgrades: { cobbler: 2 } }); const ended: string[] = []
    s.onEvent = e => { if (e.t === 'powerEnd') ended.push(e.k!) }
    s.grantPower('cobbler')
    expect(s.pw.cobbler).toBeCloseTo(12 * 1.4)
    run(s, 10); expect(s.pw.cobbler).toBeGreaterThan(6); expect(ended).toEqual([])
    run(s, 8); expect(s.pw.cobbler).toBe(0); expect(ended).toEqual(['cobbler'])
  })
  it('runner perk stacks with upgrades; Rook lasts 60% longer, Nova glides 40% longer', () => {
    const rook = CHARACTERS.find(c => c.id === 'rook')!, nova = CHARACTERS.find(c => c.id === 'nova')!
    const a = sim(rook.perk); a.grantPower('tea'); expect(a.pw.tea).toBeCloseTo(16)
    const b = sim(nova.perk); b.grantPower('glide'); expect(b.pw.glide).toBeCloseTo(6 * 1.4)
  })
  it('buying upgrades spends peaches, costs rise, and it caps at level 5', () => {
    const lv = defaultSave().upgrades; let peaches = 5000
    for (let i = 0; i < MAX_UPGRADE; i++) { const c = buyUpgrade(lv, peaches, 'wing'); expect(c).toBe(upgradeCost(i)); peaches -= c as number }
    expect(lv.wing).toBe(MAX_UPGRADE); expect(buyUpgrade(lv, peaches, 'wing')).toBe(false)
    expect(buyUpgrade(defaultSave().upgrades, 10, 'tea')).toBe(false)
  })
  it('Cobbler doubles score, Wing smashes through trucks and ends with brief invulnerability', () => {
    const a = sim(), b = sim(); b.grantPower('cobbler')
    run(a, 2); run(b, 2); expect(b.score).toBeGreaterThan(a.score * 1.8)
    const w = sim(); w.grantPower('wing'); const t = put(w, 'truck', 1, 14); run(w, 1.5)
    expect(w.state).toBe('run'); expect(t.smashed).toBe(true); expect(w.stats.smashed).toBe(1)
    run(w, 4.7); expect(w.pw.wing).toBe(0); expect(w.invuln).toBeGreaterThan(0)
  })
  it('Glide hovers above everything and lays a peach trail it can collect', () => {
    const s = sim(); put(s, 'truck', 1, 20); s.grantPower('glide')
    expect(s.track.pickups.filter(k => k.y > 6).length).toBeGreaterThan(20)
    run(s, 2); expect(s.state).toBe('run'); expect(s.p.y).toBeGreaterThan(GLIDE_ALT - 1)
    expect(s.stats.peaches).toBeGreaterThan(5)
  })
  it('Super Kicks jump much higher; the Peach Crate table is weighted and respects the Nova perk', () => {
    const a = sim(), b = sim(); b.grantPower('kicks'); a.jump(); b.jump()
    let ya = 0, yb = 0; for (let i = 0; i < 90; i++) { a.step(1 / 60); b.step(1 / 60); ya = Math.max(ya, a.p.y); yb = Math.max(yb, b.p.y) }
    expect(yb).toBeGreaterThan(ya * 1.8)
    const r = mulberry32(3); const kinds = new Set<string>()
    for (let i = 0; i < 400; i++) { const x = rollCrate(r); kinds.add(x.type === 'peaches' ? 'peaches' : x.kind) }
    expect(kinds.size).toBe(7)
    for (let i = 0; i < 100; i++) expect(rollCrate(r, true).type).toBe('power')
  })
})

describe('stumble then crash', () => {
  const clipLane = (s: Sim) => { s.right(); s.step(1 / 60); s.step(1 / 60) }
  it('a first side clip stumbles (slower, lane kept clear), it does not crash', () => {
    const s = sim(); put(s, 'truck', 2, -2, 40); const v0 = s.speed
    s.right(); run(s, 0.6)
    expect(s.state).toBe('run'); expect(s.stats.stumbles).toBe(1); expect(s.stumbleT).toBeGreaterThan(0)
    expect(s.p.lane).toBe(1); expect(s.speed).toBeLessThan(v0)
  })
  it('a second clip inside the window crashes; after the window it only stumbles again', () => {
    const s = sim(); put(s, 'truck', 2, -2, 60); s.right(); run(s, 0.6); expect(s.stats.stumbles).toBe(1)
    run(s, 1.0); s.right(); run(s, 0.6)
    expect(s.state).toBe('dead'); expect(s.crashCause).toBe('clip')
    const l = sim(); put(l, 'truck', 2, -2, 300); l.right(); run(l, 0.6); run(l, STUMBLE_WINDOW + 1); l.right(); run(l, 0.6)
    expect(l.state).toBe('run'); expect(l.stats.stumbles).toBe(2)
  })
  it('head-on hits crash immediately, and the board shield absorbs a clip', () => {
    const a = sim(); put(a, 'truck', 1, 8); run(a, 1.5); expect(a.state).toBe('dead'); expect(a.crashCause).toBe('hit')
    const b = sim(); b.grantPower('board'); put(b, 'truck', 2, -2, 40); b.right(); run(b, 0.6)
    expect(b.state).toBe('run'); expect(b.pw.board).toBe(0); expect(b.stats.stumbles).toBe(0)
  })
  it('Tay forgets a stumble sooner', () => {
    const tay = CHARACTERS.find(c => c.id === 'tay')!; const s = sim(tay.perk); put(s, 'truck', 2, -2, 40); s.right(); run(s, 0.6)
    expect(s.stumbleT).toBeLessThan(STUMBLE_WINDOW * 0.6 + 0.01)
  })
  void clipLane
})

describe('goose chaser', () => {
  it('starts close, is escaped by running, and a stumble while it is on you gets you caught', () => {
    const s = sim(BASE_PERK, { chaser: true }); expect(s.chase.on).toBe(true); expect(s.chase.gap).toBeCloseTo(CHASE_START)
    run(s, 25); expect(s.chase.on).toBe(false)
    const c = sim(BASE_PERK, { chaser: true }); c.chase.gap = 1.5; put(c, 'truck', 2, -2, 40); c.right(); run(c, 0.6)
    expect(c.state).toBe('dead'); expect(c.crashCause).toBe('geese')
  })
  it('a Wing scatters the flock', () => {
    const s = sim(BASE_PERK, { chaser: true }); s.grantPower('wing'); expect(s.chase.on).toBe(false); expect(s.stats.geese).toBe(1)
  })
})

describe('running on trains', () => {
  it('a ramp carries you up onto the roof; you stay up there and drop off the end', () => {
    const s = sim(); put(s, 'ramp', 1, 6, RAMP_LEN); put(s, 'train', 1, 6 + RAMP_LEN, 30)
    run(s, 1.0); expect(s.state).toBe('run'); expect(s.p.y).toBeCloseTo(TRAIN_H, 1); expect(s.onTrain).toBe(true)
    run(s, 0.4); expect(s.stats.trainDist).toBeGreaterThan(0)
    run(s, 3); expect(s.p.y).toBe(0); expect(s.state).toBe('run')
  })
  it('hitting the front of a train from the ground crashes, and a normal jump cannot reach the roof', () => {
    const a = sim(); put(a, 'train', 1, 8, 30); run(a, 1.2); expect(a.state).toBe('dead')
    const b = sim(); put(b, 'train', 1, 9, 30); b.jump(); run(b, 1.2); expect(b.state).toBe('dead')
  })
  it('Super Kicks can hop straight onto a roof', () => {
    const s = sim(); s.grantPower('kicks'); put(s, 'train', 1, 14, 60); s.jump(); run(s, 1.4)
    expect(s.state).toBe('run'); expect(s.p.y).toBeCloseTo(TRAIN_H, 1)
  })
  it('moving cars roll toward you only once close, and cost a crash in your lane', () => {
    const s = sim(); const o = put(s, 'car', 1, 200); o.vel = -12; const d0 = o.d
    run(s, 0.5); expect(o.d).toBe(d0)
    const t = sim(); const c = put(t, 'car', 1, 40); c.vel = -12; run(t, 3); expect(t.state).toBe('dead')
  })
})

describe('missions + level', () => {
  it('sets are deterministic, three distinct missions, targets grow with level', () => {
    const a = newMissionSet(1, 4), b = newMissionSet(1, 4)
    expect(a).toEqual(b); expect(new Set(a.map(m => m.stat)).size).toBe(3)
    expect(newMissionSet(10, 4)[0].target).toBeGreaterThan(a[0].target)
  })
  it('progress accumulates across runs, "max" missions keep the best run, finishing a set levels up', () => {
    const m = freshMissions(), items = m.items
    const r1 = applyMissions(m, Object.fromEntries(items.map(i => [i.stat, Math.ceil(i.target / 2)])), Object.fromEntries(items.map(i => [i.stat, Math.ceil(i.target / 2)])))
    expect(r1.levelUp).toBe(false)
    const r2 = applyMissions(m, Object.fromEntries(items.map(i => [i.stat, i.target])), Object.fromEntries(items.map(i => [i.stat, i.target])))
    expect(r2.levelUp).toBe(true); expect(r2.reward).toBe(200); expect(m.level).toBe(2)
    expect(m.items.every(i => i.progress === 0)).toBe(true); expect(m.items).not.toEqual(items)
    expect(levelMul(1)).toBe(1); expect(levelMul(3)).toBeCloseTo(1.2); expect(levelMul(99)).toBeCloseTo(2.9)
  })
  it('level multiplier feeds the score', () => {
    const a = sim(), b = sim(BASE_PERK, { levelMul: 2 }); run(a, 2); run(b, 2); expect(b.score).toBeCloseTo(a.score * 2, 0)
  })
})

describe('ATLANTA letter hunt', () => {
  it('collects letters in order, announces the word, then stops spawning', () => {
    const s = sim(); s.spawner.letters = true; const got: string[] = []; let done = 0
    s.onEvent = e => { if (e.t === 'letter') got.push(e.k!); if (e.t === 'atlanta') done++ }
    for (let i = 0; i < 7; i++) s.track.pickups.push({ id: 900 + i, kind: 'letter', lane: 1, d: s.dist + 6 + i * 10, y: 1.3, taken: false, pull: 0 })
    run(s, 4); expect(got.join('')).toBe('ATLANTA'); expect(done).toBe(1); expect(s.stats.letters).toBe(7); expect(s.spawner.letters).toBe(false)
  })
  it('real courses place letters, and a finished day places none', () => {
    const a = new Sim(11); a.teleport(0); a.spawner.fill(a.track, 3000); expect(a.track.pickups.filter(k => k.kind === 'letter').length).toBeGreaterThan(3)
    const b = new Sim(11, BASE_PERK, { letterIdx: 7 }); b.spawner.fill(b.track, 3000); expect(b.track.pickups.some(k => k.kind === 'letter')).toBe(false)
  })
  it('progress persists within a day, pays the reward once, and resets tomorrow', () => {
    const l = freshLetters()
    expect(commitLetters(l, '2026-11-04', 3)).toBe(0); expect(commitLetters(l, '2026-11-04', 2)).toBe(0); expect(l.idx).toBe(3)
    expect(commitLetters(l, '2026-11-04', 7)).toBe(300); expect(commitLetters(l, '2026-11-04', 7)).toBe(0)
    expect(lettersFor(l, '2026-11-05')).toMatchObject({ idx: 0, claimed: false })
  })
})

describe('daily login', () => {
  it('first login pays day 1, same-day does not repeat, consecutive days climb, a gap resets', () => {
    const l = { last: '', streak: 0 }
    expect(loginStatus(l, '2026-11-04')).toMatchObject({ pending: true, day: 1, reward: 50 })
    expect(claimLogin(l, '2026-11-04')).toBe(50); expect(claimLogin(l, '2026-11-04')).toBe(0)
    expect(claimLogin(l, '2026-11-05')).toBe(75); expect(claimLogin(l, '2026-11-06')).toBe(100)
    expect(claimLogin(l, '2026-11-09')).toBe(50)
  })
  it('handles month and year boundaries and wraps after day 7', () => {
    expect(yesterday('2026-03-01')).toBe('2026-02-28'); expect(yesterday('2027-01-01')).toBe('2026-12-31')
    const l = { last: '2026-11-03', streak: 7 }; expect(loginStatus(l, '2026-11-04')).toMatchObject({ day: 1, streak: 8 })
  })
})

describe('local leaderboard', () => {
  const e = (score: number): BoardEntry => ({ score, dist: score / 10, char: 'juno', date: '2026-11-04' })
  it('keeps the top 10 sorted, returns ranks, ignores zero, ties go below', () => {
    const b: BoardEntry[] = []
    expect(addToBoard(b, e(0))).toBe(0)
    for (let i = 1; i <= 10; i++) addToBoard(b, e(i * 100))
    expect(b.length).toBe(10); expect(b[0].score).toBe(1000)
    expect(addToBoard(b, e(50))).toBe(0); expect(b.length).toBe(10)
    expect(addToBoard(b, e(550))).toBe(6); expect(b.length).toBe(10); expect(b[9].score).toBe(200)
    const t = e(1000); expect(addToBoard(b, t)).toBe(2)
    removeFromBoard(b, t); expect(b.includes(t)).toBe(false)
  })
  it('survives a save round-trip and rejects garbage', () => {
    const st = mem(), s = defaultSave(); s.board.push(e(900)); s.upgrades.glide = 3; s.missions.level = 4; writeSave(st, s)
    const l = loadSave(st); expect(l.board[0].score).toBe(900); expect(l.upgrades.glide).toBe(3); expect(l.missions.level).toBe(4)
    st.setItem('peachdash.v1', JSON.stringify({ v: 1, board: [{ score: 'x' }, null, { score: 5 }], upgrades: { wing: 99 }, missions: { items: [1] }, login: 4 }))
    const g = loadSave(st); expect(g.board.length).toBe(1); expect(g.upgrades.wing).toBe(5); expect(g.missions.items.length).toBe(3)
    void laneX
  })
})
