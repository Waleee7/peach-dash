import { LANE_W, laneX, type Sim } from './sim'

/** Tiny autopilot: drives the title-screen attract mode and soak-tests the spawner. */
export function botAct(sim: Sim) {
  const p = sim.p, P = sim.dist, sp = sim.speed
  const ahead = sim.track.obstacles.filter(o => o.d + o.len > P - 1 && o.d - P < sp * 1.7)
  const inLane = (l: number, o: { lane: number; span: number }) => l >= o.lane && l < o.lane + o.span
  const blocked = (l: number) => ahead.some(o => o.kind === 'truck' && inLane(l, o) && o.d - P < sp * 1.7)
  if (blocked(p.lane)) {
    const order = [0, 1, 2].filter(l => !blocked(l)).sort((a, b) => Math.abs(a - p.lane) - Math.abs(b - p.lane))
    if (order.length) { if (order[0] < p.lane) sim.left(); else if (order[0] > p.lane) sim.right() }
    return
  }
  for (const o of ahead) {
    if (!inLane(p.lane, o)) continue
    const dd = o.d - P
    if (o.kind === 'sign' && dd < sp * 0.32 && dd > 0) sim.slide()
    if ((o.kind === 'barrier' || o.kind === 'cones') && dd < sp * 0.26 && dd > 0) sim.jump()
  }
  // drift toward the lane with the most peaches in the next stretch
  const score = [0, 0, 0]
  for (const k of sim.track.pickups) if (!k.taken && k.kind === 'peach' && k.d > P && k.d - P < 40) score[k.lane]++
  let best = p.lane
  for (const l of [0, 1, 2]) if (score[l] > score[best] + 1 && !blocked(l) && Math.abs(l - p.lane) === 1) best = l
  const near = ahead.some(o => o.d - P < sp * 0.5 && o.d - P > -1)
  if (!near && best !== p.lane && Math.abs(p.x - laneX(p.lane)) < LANE_W * 0.2) best < p.lane ? sim.left() : sim.right()
}
