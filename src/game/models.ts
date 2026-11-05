import * as THREE from 'three'
import { GeoBuilder } from './gfx'
import { CAR_LEN, LANE_W, RAMP_LEN, TRAIN_H } from '../core/sim'
import type { PowerKind } from '../core/powers'

/* ---------- pickups: one distinct low-poly model per power-up ---------- */
function wingGeo() {            // Lemon Pepper Wing: glazed drumstick + lemon wedge + pepper
  const b = new GeoBuilder()
  b.ball(0.3, 0, 0.1, 0, 0xd9822b, 1.1, 0.95, 0.9, 2)
  b.ball(0.22, 0.08, 0.14, 0.12, 0xf2a03a, 1, 0.8, 0.7, 1)
  b.cone(0.17, 0.5, -0.36, -0.13, 0, 0xc9701f, 7, 0)
  b.cyl(0.05, 0.05, 0.34, -0.5, -0.2, 0, 0xfff1d6, 6, [0, 0, Math.PI / 2 - 0.5])
  b.ball(0.09, -0.62, -0.3, 0.06, 0xfff1d6); b.ball(0.09, -0.62, -0.3, -0.06, 0xfff1d6)
  for (let i = 0; i < 9; i++) b.ball(0.035, Math.cos(i * 2.3) * 0.24, 0.18 + Math.sin(i * 1.7) * 0.1, 0.2 + Math.cos(i) * 0.08, i % 3 ? 0x2a1a22 : 0xfff08a, 1, 1, 1, 0)
  b.ball(0.2, 0.28, 0.42, 0.08, 0xffe84a, 1, 0.45, 1, 1); b.torus(0.17, 0.035, 0.28, 0.42, 0.09, 0xfff6a0, Math.PI * 2, [Math.PI / 2, 0, 0], 10)
  for (let i = 0; i < 3; i++) b.cone(0.07, 0.4 - i * 0.07, 0.55 + i * 0.12, 0.1 + i * 0.12, 0, 0xff8f2a, 5)
  return b.build()
}
function teaGeo() {             // Sweet Tea: tall cup, ice, lemon, straw
  const b = new GeoBuilder()
  b.cyl(0.27, 0.2, 0.7, 0, -0.35, 0, 0xe8a03a, 10); b.cyl(0.27, 0.27, 0.05, 0, 0.33, 0, 0xfff1d6, 10); b.cyl(0.29, 0.29, 0.06, 0, 0.36, 0, 0xffffff, 10)
  b.cyl(0.03, 0.03, 0.55, 0.06, 0.38, 0, 0xff5e5b, 5)
  for (const [x, y, z] of [[-0.1, 0.1, 0.12], [0.1, -0.1, 0.1], [0, 0.22, -0.1]]) b.box(0.13, 0.13, 0.13, x, y, z, 0xe8f6ff, { ry: x * 6 })
  b.torus(0.22, 0.04, 0, 0.22, 0.27, 0xffe84a, Math.PI * 2, [Math.PI / 2, 0, 0], 10)
  b.cyl(0.285, 0.21, 0.03, 0, -0.1, 0, 0xfff1d6, 10); b.ball(0.08, 0.3, 0.1, 0.2, 0xff9a62, 1, 1, 1, 1)
  return b.build()
}
function cobblerGeo() {         // Peach Cobbler: skillet, lattice crust, peach slices, floating x2
  const b = new GeoBuilder()
  b.cyl(0.46, 0.4, 0.2, 0, -0.3, 0, 0x3a2a4d, 12); b.box(0.5, 0.06, 0.1, 0.62, -0.18, 0, 0x3a2a4d)
  b.cyl(0.41, 0.41, 0.1, 0, -0.14, 0, 0xe8a24a, 12)
  for (let i = -2; i <= 2; i++) { b.box(0.07, 0.04, 0.8, i * 0.15, -0.04, 0, 0xc97a2c, { ry: 0.0 }); b.box(0.8, 0.04, 0.07, 0, -0.03, i * 0.15, 0xc97a2c) }
  for (const [x, z] of [[-0.2, -0.2], [0.22, -0.16], [0, 0.22], [-0.26, 0.18], [0.28, 0.2]]) b.ball(0.1, x, 0, z, 0xff8f6b, 1, 0.55, 1, 1)
  const seg = (x: number, y: number, w: number, h: number) => b.box(w, h, 0.07, x, y, 0, 0xffd166)
  seg(0, 0.62, 0.3, 0.06); seg(0.12, 0.5, 0.06, 0.14); seg(0, 0.4, 0.3, 0.06); seg(-0.12, 0.28, 0.06, 0.14); seg(0, 0.2, 0.3, 0.06)
  return b.build()
}
function kicksGeo() {           // Super Kicks: sneaker on a red spring with wing tabs
  const b = new GeoBuilder()
  b.box(0.95, 0.12, 0.4, 0, -0.1, 0, 0xfff1d6); b.box(0.5, 0.34, 0.36, -0.18, 0.12, 0, 0xff4d6d); b.box(0.4, 0.24, 0.34, 0.26, 0.06, 0, 0xff4d6d)
  b.ball(0.2, 0.42, 0.02, 0, 0xff4d6d, 1, 0.8, 0.9, 1); b.box(0.2, 0.3, 0.38, -0.34, 0.3, 0, 0xffd166)
  for (let i = 0; i < 3; i++) b.box(0.14, 0.02, 0.34, 0.1 + i * 0.1, 0.19 + i * 0.01, 0, 0xffffff)
  b.box(0.5, 0.03, 0.42, 0.05, -0.02, 0, 0xffffff)
  for (let i = 0; i < 4; i++) b.torus(0.17, 0.035, -0.28, -0.28 - i * 0.1, 0, 0xff8f2a, Math.PI * 2, [Math.PI / 2, 0, 0], 8)
  for (const s of [-1, 1]) b.box(0.4, 0.04, 0.16, -0.5, 0.36, s * 0.26, 0xffffff, { ry: s * 0.5, rz: 0.4 })
  return b.build()
}
function glideGeo() {           // SkyView Glide: ring of gondolas with thrusters
  const b = new GeoBuilder()
  b.torus(0.48, 0.06, 0, 0.1, 0, 0x6fe0d0, Math.PI * 2, [0, 0, 0], 20)
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.cyl(0.015, 0.015, 0.48, Math.cos(a) * 0.24, 0.1 + Math.sin(a) * 0.24 - 0.24, 0, 0xfff1d6, 4, [0, 0, a - Math.PI / 2]); b.box(0.16, 0.14, 0.14, Math.cos(a) * 0.48, 0.1 + Math.sin(a) * 0.48 - 0.06, 0, [0xff6b6b, 0xffd166, 0xfff1d6, 0xff9f68][i % 4]) }
  b.ball(0.1, 0, 0.1, 0, 0xffffff)
  for (const s of [-1, 1]) { b.cyl(0.1, 0.07, 0.2, s * 0.22, -0.55, 0, 0x3a2a4d, 6); b.cone(0.09, 0.35, s * 0.22, -0.9, 0, 0xff8f2a, 6) }
  return b.build()
}
function boardGeo() {           // BeltLine Board: glowing hoverboard
  const b = new GeoBuilder()
  b.box(1.1, 0.09, 0.4, 0, 0, 0, 0x2ec4b6); b.ball(0.2, 0.55, 0.04, 0, 0x2ec4b6, 0.6, 0.45, 1, 1); b.ball(0.2, -0.55, 0.04, 0, 0x2ec4b6, 0.6, 0.45, 1, 1)
  b.box(0.7, 0.02, 0.2, 0, 0.06, 0, 0xff6b6b); b.box(0.9, 0.04, 0.3, 0, -0.07, 0, 0x7ff0e2)
  for (const [x, z] of [[-0.4, 0.2], [0.4, 0.2], [-0.4, -0.2], [0.4, -0.2]]) b.cyl(0.05, 0.05, 0.05, x, -0.13, z, 0xfff1d6, 6)
  return b.build()
}
function crateGeo() {           // Peach Crate: slatted wooden box, gold straps, "?"
  const b = new GeoBuilder()
  b.box(0.74, 0.62, 0.74, 0, -0.31, 0, 0xc98a4b)
  for (let i = 0; i < 3; i++) b.box(0.78, 0.03, 0.78, 0, -0.5 + i * 0.2, 0, 0xa76d36)
  for (const s of [-1, 1]) { b.box(0.08, 0.66, 0.78, s * 0.3, -0.31, 0, 0xffd166); b.box(0.78, 0.66, 0.08, 0, -0.31, s * 0.3, 0xffd166) }
  const q = (x: number, y: number, w: number, h: number) => b.box(w, h, 0.05, x, y, 0.38, 0x3a2a4d)
  q(0, -0.1, 0.22, 0.06); q(0.1, -0.2, 0.06, 0.14); q(0, -0.3, 0.2, 0.06); q(0, -0.4, 0.06, 0.1); b.box(0.07, 0.07, 0.05, 0, -0.52, 0.38, 0x3a2a4d)
  b.ball(0.15, 0.12, 0.08, 0.05, 0xff8f6b, 1, 0.95, 1, 1); b.box(0.2, 0.03, 0.1, 0.05, 0.26, 0.05, 0x2fbf4f, { rz: 0.4 })
  return b.build()
}
const GLYPH: Record<string, string[]> = {
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'], T: ['XXX', '.X.', '.X.', '.X.', '.X.'], L: ['X..', 'X..', 'X..', 'X..', 'XXX'], N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
}
function letterGeo(ch: string) { // gold coin with a block letter
  const b = new GeoBuilder(), g = GLYPH[ch], w = g[0].length, u = 0.15
  b.cyl(0.52, 0.52, 0.12, 0, -0.06, 0, 0xffc83d, 14, [Math.PI / 2, 0, 0]); b.torus(0.5, 0.04, 0, 0, 0.06, 0xfff0a0, Math.PI * 2, [0, 0, 0], 14)
  g.forEach((row, j) => [...row].forEach((c, i) => { if (c === 'X') b.box(u, u, 0.08, (i - (w - 1) / 2) * u, (2 - j) * u, 0.1, 0x3a2a4d) }))
  return b.build()
}
export const PICKUP_SCALE: Record<string, number> = { wing: 1.5, tea: 1.5, cobbler: 1.35, kicks: 1.45, glide: 1.4, board: 1.5, crate: 1.5, letter: 1.5 }
export function pickupGeo(kind: PowerKind | 'crate' | 'letter', ch = 'A') {
  switch (kind) {
    case 'wing': return wingGeo(); case 'tea': return teaGeo(); case 'cobbler': return cobblerGeo(); case 'kicks': return kicksGeo()
    case 'glide': return glideGeo(); case 'board': return boardGeo(); case 'crate': return crateGeo(); default: return letterGeo(ch)
  }
}

/* ---------- new obstacles ---------- */
export function scooterGeo() {
  const b = new GeoBuilder()
  b.box(0.18, 0.06, 0.9, 0, 0.12, 0, 0xff8f6b); b.cyl(0.05, 0.05, 0.9, 0, 0.12, 0.45, 0x6a5a80, 6); b.box(0.7, 0.05, 0.05, 0, 1.0, 0.45, 0x6a5a80)
  for (const z of [-0.42, 0.45]) b.cyl(0.14, 0.14, 0.07, 0, 0, z, 0x2a2030, 10, [0, 0, Math.PI / 2]).cyl(0.07, 0.07, 0.08, 0, 0.0, z, 0xfff1d6, 6, [0, 0, Math.PI / 2])
  b.ball(0.08, 0, 0.55, -0.1, 0xffd166); b.box(0.5, 0.35, 0.3, 0, 0.1, -0.3, 0x2ec4b6)
  const g = b.build(); g.scale(1.35, 1.35, 1.35); return g
}
export function barricadeGeo(span: number) {
  const b = new GeoBuilder(), W = span * LANE_W - 0.4
  for (const s of [-1, 1]) b.box(0.14, 1.35, 0.5, s * (W / 2 - 0.1), 0, 0, 0x8a7f95)
  for (let r = 0; r < 2; r++) { const n = Math.round(W / 0.45); for (let i = 0; i < n; i++) b.box(W / n, 0.34, 0.12, -W / 2 + (i + 0.5) * W / n, 0.2 + r * 0.55, 0, (i + r) % 2 ? 0xfff1d6 : 0xff5e4a) }
  b.ball(0.11, -W / 2 + 0.2, 1.45, 0, 0xffb347); b.ball(0.11, W / 2 - 0.2, 1.45, 0, 0xffb347)
  return b.build()
}
export function lowSignGeo(span: number) {
  const b = new GeoBuilder(), W = span * LANE_W - 0.2, px = span * LANE_W / 2 + 0.05
  b.box(W, 0.95, 0.2, 0, 0.8, 0, 0xffc83d); b.box(W * 0.94, 0.12, 0.22, 0, 1.42, 0, 0x3a2a4d); b.box(W * 0.94, 0.12, 0.22, 0, 0.9, 0, 0x3a2a4d)
  const n = Math.round(W / 0.6); for (let i = 0; i < n; i++) b.box(W / n * 0.5, 0.3, 0.22, -W / 2 + (i + 0.5) * W / n, 1.16, 0, 0x3a2a4d, { rz: 0.5 })
  for (const s of [-1, 1]) { b.cyl(0.1, 0.12, 1.8, s * px, 0, 0, 0x6a5a80, 6); b.ball(0.12, s * px, 1.9, 0, 0xff5e4a) }
  return b.build()
}
export function carGeo(variant: number) {
  const b = new GeoBuilder(), c = [0xff6b8b, 0x4fa3ff, 0xffd23d][variant % 3]
  b.box(1.9, 0.7, 4.2, 0, 0.3, 0, c); b.box(1.7, 0.6, 2.2, 0, 0.95, -0.2, c); b.box(1.6, 0.4, 0.05, 0, 1.05, 0.92, 0x9fd8e8); b.box(1.6, 0.4, 0.05, 0, 1.05, -1.32, 0x9fd8e8)
  b.box(1.95, 0.12, 0.2, 0, 0.35, 2.05, 0x3a2a4d); b.box(1.95, 0.12, 0.2, 0, 0.35, -2.05, 0x3a2a4d)
  for (const s of [-0.7, 0.7]) { b.ball(0.13, s, 0.62, 2.1, 0xfff0b8, 1, 1, 0.5, 0); b.ball(0.12, s, 0.62, -2.1, 0xff3b30, 1, 1, 0.5, 0) }
  for (const sx of [-1, 1]) for (const z of [1.35, -1.35]) b.cyl(0.36, 0.36, 0.26, sx * 0.92, 0.0, z, 0x2a2030, 10, [0, 0, Math.PI / 2])
  const g = b.build(); g.translate(0, 0.36, 0); return g
}
/** Elevated rail cars (teal + cream), `cars` of them end to end, centred on z=0. */
export function trainGeo(cars: number) {
  const b = new GeoBuilder(), len = cars * CAR_LEN
  for (let i = 0; i < cars; i++) {
    const z = -len / 2 + CAR_LEN * (i + 0.5)
    b.box(2.15, TRAIN_H - 0.5, CAR_LEN - 0.4, 0, 0.5, z, 0x2ec4b6); b.box(2.2, 0.2, CAR_LEN - 0.4, 0, TRAIN_H - 0.2, z, 0xdadada)
    b.box(2.2, 0.35, CAR_LEN - 0.4, 0, 0.9, z, 0xfff1d6); b.box(2.2, 0.2, CAR_LEN - 0.4, 0, 0.45, z, 0xff8f6b)
    for (let w = 0; w < 5; w++) for (const s of [-1, 1]) b.box(0.05, 0.75, 1.8, s * 1.1, 1.6, z - 5.4 + w * 2.7, 0x1f3a44)
    b.box(1.6, 0.18, CAR_LEN - 2, 0, TRAIN_H - 0.05, z, 0xbcbcbc)
  }
  b.box(2.1, 1.8, 0.1, 0, 1.0, len / 2 - 0.15, 0x9fd8e8); b.ball(0.16, -0.7, 0.9, len / 2, 0xfff0b8, 1, 1, 0.4, 0); b.ball(0.16, 0.7, 0.9, len / 2, 0xfff0b8, 1, 1, 0.4, 0)
  return b.build()
}
export function rampGeo() {
  const b = new GeoBuilder(), w = LANE_W - 0.3
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(RAMP_LEN, 0); s.lineTo(RAMP_LEN, TRAIN_H); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(-RAMP_LEN / 2, 0, -w / 2); g.rotateY(Math.PI / 2)
  // after rotateY(+90deg) x -> -z, so the tall end now faces -z (the direction of travel)
  const ramp = g.toNonIndexed(); ramp.computeVertexNormals()
  const n = ramp.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(0xd9cdb8)
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
  ramp.setAttribute('color', new THREE.BufferAttribute(col, 3)); ramp.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2).fill(0.03), 2))
  for (const k of Object.keys(ramp.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) ramp.deleteAttribute(k)
  b.parts.push(ramp)
  for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6; b.box(w * 0.9, 0.04, 0.16, 0, t * TRAIN_H + 0.02, RAMP_LEN / 2 - t * RAMP_LEN, i % 2 ? 0xffd166 : 0x3a2a4d, { rx: -Math.atan2(TRAIN_H, RAMP_LEN) }) }
  return b.build()
}

/* ---------- the goose flock ---------- */
export class GooseFlock {
  group = new THREE.Group()
  pf = 0
  private geese: { root: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; ph: number; ox: number; oz: number; oy: number }[] = []
  constructor() {
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true })
    const white = mat(0xb9a794), grey = mat(0x8a7a6e), dark = mat(0x1d1418), orange = mat(0xff9a2a), red = mat(0xff3b30), chin = mat(0xfff1e8)
    const V: [number, number, number][] = [[0, 0, 0], [-1.5, 0.2, 1.1], [1.5, 0.1, 1.3], [-3, 0.5, 2.4], [3, 0.4, 2.3], [-0.7, 0.9, 2.2], [1, -0.1, 2.9]]
    for (let i = 0; i < V.length; i++) {
      const r = new THREE.Group(), body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), white); body.scale.set(0.85, 0.7, 1.35)
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.6, 6), dark); neck.position.set(0, 0.3, -0.55); neck.rotation.x = -1.05
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), dark); head.position.set(0, 0.52, -0.98)
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5), orange); beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.48, -1.22)
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.06), red); brow.position.set(0, 0.62, -1.02); brow.rotation.z = 0.0
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), grey); tail.position.set(0, 0.05, 0.6)
      const mkW = (s: number) => { const w = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.55), grey); m.position.x = s * 0.5; w.add(m); w.position.set(s * 0.2, 0.15, 0); return w }
      const wl = mkW(-1), wr = mkW(1)
      const patch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.1), chin); patch.position.set(0, 0.44, -1.0)
      r.add(body, neck, head, beak, brow, patch, tail, wl, wr); r.position.set(V[i][0] * 0.8, 0.5 + V[i][1], V[i][2] * 0.6); r.scale.setScalar(0.5)
      this.group.add(r); this.geese.push({ root: r, wl, wr, ph: i * 1.3, ox: V[i][0] * 0.8, oy: 0.5 + V[i][1], oz: V[i][2] * 0.6 })
    }
    this.group.visible = false
  }
  /** gap = metres the flock is behind you (small = right on your heels). */
  update(on: boolean, gap: number, px: number, time: number, fade: { v: number }) {
    fade.v += ((on ? 1 : 0) - fade.v) * 0.08
    this.group.visible = fade.v > 0.03
    if (!this.group.visible) return
    this.group.scale.setScalar(1 - 0.3 * this.pf)
    const zBase = 0.4 + gap * 0.34 + (1 - fade.v) * 10
    for (const g of this.geese) {
      const f = Math.sin(time * 14 + g.ph)
      g.wl.rotation.z = f * 0.9 + 0.2; g.wr.rotation.z = -f * 0.9 - 0.2
      g.root.position.set(px * 0.6 + g.ox + Math.sin(time * 2 + g.ph) * 0.15, g.oy + f * 0.1 + 0.2, zBase + g.oz)
      g.root.rotation.y = Math.sin(time + g.ph) * 0.1; g.root.rotation.z = Math.sin(time * 1.7 + g.ph) * 0.08
    }
  }
}
