import { LANE_W, laneX, type Obstacle, type Sim } from './sim'

/** Autopilot: drives the title-screen attract mode, `?bot=1`, and soak-tests the spawner. */
export function botAct(sim: Sim) {
  const p = sim.p, P = sim.dist, sp = sim.speed
  const closing = (o: Obstacle) => sp - Math.min(0, o.vel ?? 0)          // oncoming cars close faster
  const ahead = sim.track.obstacles.filter(o => !o.smashed && o.d + o.len > P - 1 && o.d - P < closing(o) * 1.7)
  const inLane = (l: number, o: { lane: number; span: number }) => l >= o.lane && l < o.lane + o.span
  const onTop = p.y > 1.2
  // Super Kicks hang for ~40 m: slam down early unless something low is about to pass underneath
  if (p.air && sim.pw.kicks > 0 && p.vy < 0 && !ahead.some(o => inLane(p.lane, o) && o.d - P < sp * 1.0 && o.d - P > -1)) sim.slide()
  // train rows are built ramp -> train with consecutive ids; the bot climbs half of them
  const wanted = (o: Obstacle) => ((o.kind === 'ramp' ? o.id : o.id - 1) & 1) === 0
  /** Is `o` something lane `l` must keep clear of? Strict also avoids the ramps the bot would climb on purpose. */
  const hard = (o: Obstacle, l: number, strict: boolean) => {
    if (o.kind === 'truck' || o.kind === 'car') return true
    if (o.kind !== 'train' && o.kind !== 'ramp') return false
    if (o.d - P > 0.2) return strict || !wanted(o)         // still ahead
    return !(l === p.lane && p.y > 0.4)                      // alongside: only fine if we are standing on it
  }
  const blocked = (l: number, strict = false) => ahead.some(o => inLane(l, o) && hard(o, l, strict) && o.d - P < closing(o) * 1.7)
  /** A solid thing is level with (or about to be level with) the player in lane m: don't swerve into its flank. */
  const occupied = (m: number) => sim.track.obstacles.some(o => !o.smashed && inLane(m, o) && ['truck', 'car', 'train', 'ramp'].includes(o.kind) && o.d - P < 3.5 && o.d + o.len > P - 3.5)
  const step = (to: number) => {
    const next = p.lane + Math.sign(to - p.lane)
    if (next === p.lane || occupied(next)) return false
    next < p.lane ? sim.left() : sim.right(); return true
  }
  if (blocked(p.lane)) {
    const order = [0, 1, 2].filter(l => !blocked(l, true)).sort((a, b) => Math.abs(a - p.lane) - Math.abs(b - p.lane))
    if (order.length) step(order[0])        // if a train is alongside, hold until it has passed
    return
  }
  for (const o of ahead) {
    if (!inLane(p.lane, o)) continue
    const dd = o.d - P
    if ((o.kind === 'sign' || o.kind === 'lowsign') && dd < sp * 0.32 && dd > 0) sim.slide()
    if ((o.kind === 'barrier' || o.kind === 'cones' || o.kind === 'scooter' || o.kind === 'barricade') && dd < sp * 0.26 && dd > 0) sim.jump()
  }
  const centred = Math.abs(p.x - laneX(p.lane)) < LANE_W * 0.2
  const steady = !ahead.some(o => o.kind !== 'ramp' && o.kind !== 'train' && o.d - P < sp * 0.6 && o.d - P > -1)
  // take half of the ramps (deterministic per ramp) once one is a lane away
  const ramp = ahead.find(o => o.kind === 'ramp' && wanted(o) && o.d - P > sp * 0.45 && o.d - P < sp * 1.4 && Math.abs(o.lane - p.lane) === 1)
  if (ramp && steady && !onTop && centred) { step(ramp.lane); return }
  // commit: no peach-drifting while lined up on a ramp or riding a train
  if (onTop || ahead.some(o => (o.kind === 'ramp' || o.kind === 'train') && inLane(p.lane, o) && wanted(o))) return
  // drift toward the lane with the most peaches in the next stretch
  const score = [0, 0, 0]
  for (const k of sim.track.pickups) if (!k.taken && k.kind === 'peach' && k.y < 3.5 && k.d > P && k.d - P < 40) score[k.lane]++
  let best = p.lane
  for (const l of [0, 1, 2]) if (score[l] > score[best] + 1 && !blocked(l, true) && Math.abs(l - p.lane) === 1) best = l
  const near = ahead.some(o => o.d - P < sp * 0.5 && o.d - P > -1)
  if (!near && best !== p.lane && centred) step(best)
}
