/** Tilt steering: lean past TILT_ON to change lane, then come back inside TILT_OFF before the next one can fire. */
export const TILT_ON = 15
export const TILT_OFF = 7
export interface TiltState { zero: number; armed: boolean }
export const freshTilt = (): TiltState => ({ zero: NaN, armed: true })
/** Left/right lean in degrees for how the screen is currently rotated. */
export function tiltAngle(gamma: number, beta: number, screenAngle: number) {
  const a = ((screenAngle % 360) + 360) % 360
  return a === 90 ? beta : a === 270 ? -beta : a === 180 ? -gamma : gamma
}
/** Feed one reading; the first reading of a run becomes neutral. Returns -1 left, 1 right, 0 nothing. */
export function tiltStep(st: TiltState, angle: number): -1 | 0 | 1 {
  if (Number.isNaN(st.zero)) { st.zero = angle; return 0 }
  const a = angle - st.zero, m = Math.abs(a)
  if (!st.armed) { if (m < TILT_OFF) st.armed = true; return 0 }
  if (m >= TILT_ON) { st.armed = false; return a < 0 ? -1 : 1 }
  st.zero += a * 0.004                  // slowly follow how the player settles their grip
  return 0
}
