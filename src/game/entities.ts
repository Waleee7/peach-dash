import * as THREE from 'three'
import { GeoBuilder, bend, glowTexture, haloTexture } from './gfx'
import { BADGES, LANE_W, LETTERS, SPAWN_AHEAD, laneX, type Obstacle, type Sim } from '../core/sim'
import { POWERS, type PowerKind } from '../core/powers'
import { pickupGeo, PICKUP_SCALE, scooterGeo, barricadeGeo, lowSignGeo, carGeo, trainGeo, rampGeo, busGeo } from './models'

const TRUCK_COLORS = [0xff7a66, 0x3fe0d0, 0xffd23d]
function barrierGeo() {
  const b = new GeoBuilder()
  for (const s of [-1, 1]) b.box(0.12, 0.95, 0.5, s * 0.85, 0, 0, 0xfff1d6)
  for (let i = 0; i < 5; i++) { const c = i % 2 ? 0xfff1d6 : 0xff5e4a; b.box(0.34, 0.24, 0.1, -0.68 + i * 0.34, 0.6, 0, c); b.box(0.34, 0.24, 0.1, -0.68 + i * 0.34, 0.25, 0, i % 2 ? 0xff5e4a : 0xfff1d6) }
  b.ball(0.1, -0.85, 1.0, 0, 0xffb347, 1, 1, 1, 0); b.ball(0.1, 0.85, 1.0, 0, 0xffb347, 1, 1, 1, 0)
  return b.build()
}
function conesGeo() {
  const b = new GeoBuilder()
  for (const [x, z] of [[-0.55, 0.15], [0.55, 0.1], [0, -0.2]]) {
    b.box(0.6, 0.05, 0.6, x, 0, z, 0x6a5a80); b.cyl(0.06, 0.26, 0.72, x, 0.05, z, 0xff7a2f, 8); b.cyl(0.14, 0.18, 0.12, x, 0.3, z, 0xfff1d6, 8)
  }
  return b.build()
}
function truckGeo(variant: number) {
  const b = new GeoBuilder(), c = TRUCK_COLORS[variant % 3]
  b.box(2.0, 0.5, 4.9, 0, 0.35, 0, 0x6a5a80)
  b.box(2.0, 2.3, 3.3, 0, 0.9, -0.75, c); b.box(2.0, 1.55, 1.35, 0, 0.9, 1.85, c)
  b.box(1.75, 0.7, 0.05, 0, 1.8, 2.54, 0x9fd8e8); b.box(2.08, 0.22, 0.2, 0, 0.5, 2.5, 0xfff1d6)
  b.ball(0.12, -0.7, 1.0, 2.55, 0xfff0b8, 1, 1, 0.5, 0); b.ball(0.12, 0.7, 1.0, 2.55, 0xfff0b8, 1, 1, 0.5, 0)
  b.box(1.5, 0.3, 1.7, 0, 3.2, -0.75, 0xdadada); b.cyl(0.2, 0.2, 0.4, 0.4, 3.45, -1.2, 0xbdbdbd, 6)
  for (const s of [-1, 1]) {
    b.box(0.06, 0.85, 1.9, s * 1.02, 1.75, -0.75, 0x2a2030)
    b.box(0.6, 0.08, 2.3, s * 1.3, 2.75, -0.75, s > 0 ? 0xfff1d6 : 0xfff1d6)
    for (let i = 0; i < 6; i++) b.box(0.6, 0.085, 0.19, s * 1.3, 2.77, -1.75 + i * 0.4, i % 2 ? c : 0xfff1d6)
    for (let i = 0; i < 5; i++) b.ball(0.06, s * 1.55, 2.66, -1.5 + i * 0.5, 0xffe066, 1, 1, 1, 0)
    b.ball(0.7, s * 1.03, 1.55, 0.35, 0xff9a62, 0.07, 1, 1, 1); b.box(0.04, 0.3, 0.2, s * 1.05, 2.25, 0.35, 0x4f9f3d)
    for (const z of [1.85, -1.55]) b.cyl(0.46, 0.46, 0.32, s * 0.95, 0.46 - 0.46 + 0.0, z, 0x2a2030, 10, [0, 0, Math.PI / 2]).cyl(0.22, 0.22, 0.34, s * 0.96, 0.0, z, 0xdadada, 8, [0, 0, Math.PI / 2])
  }
  const g = b.build(); g.translate(0, 0.46, 0); return g
}
function signGeo(span: number) {
  const b = new GeoBuilder(), W = span * LANE_W - 0.2, px = span * LANE_W / 2 + 0.05
  b.box(W, 1.85, 0.28, 0, 1.55, 0, 0x3fe0d0); b.box(W + 0.2, 0.12, 0.34, 0, 3.4, 0, 0x6a5a80)
  b.box(W * 0.92, 0.5, 0.3, 0, 2.55, 0, 0xff8f6b)
  const n = Math.round(W / 0.5); for (let i = 0; i < n; i++) b.box(W / n, 0.22, 0.32, -W / 2 + (i + 0.5) * W / n, 1.55, 0, i % 2 ? 0xffc83d : 0x6a5a80)
  for (let i = 0; i < span * 3; i++) b.box(0.4, 0.26, 0.31, -W / 2 + 0.7 + i * (W - 1.2) / Math.max(1, span * 3 - 1), 2.55, 0, 0xfff1d6)
  for (const s of [-1, 1]) { b.cyl(0.11, 0.13, 3.4, s * px, 0, 0, 0x6a5a80, 6); b.ball(0.13, s * px, 3.5, 0, 0xffb347, 1, 1, 1, 0) }
  return b.build()
}
function peachGeo() {
  const b = new GeoBuilder()
  b.ball(0.32, 0, 0, 0, 0xffa94f, 1, 0.97, 1, 2)                                   // gold body
  b.ball(0.24, 0.1, 0.02, -0.12, 0xff5f4a, 1, 1, 0.7, 1)                           // pink blush
  b.box(0.035, 0.5, 0.05, 0, -0.26, -0.3, 0xd9546e, { rz: 0.0, rx: 0.12 })        // cleft seam
  b.box(0.03, 0.1, 0.03, 0, 0.3, 0, 0x6b4a3a)                                      // stem
  b.box(0.3, 0.035, 0.14, 0.17, 0.4, 0, 0x2fbf4f, { rz: 0.45 })                    // leaf
  b.box(0.22, 0.035, 0.11, -0.12, 0.38, 0.05, 0x58d36a, { rz: -0.5, ry: 0.6 })     // second leaf
  return b.build()
}
function rimMat(m: THREE.MeshLambertMaterial) {
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r)
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
      'float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);\n gl_FragColor.rgb += vec3(1.0, 0.86, 0.62) * rim * 0.5;\n #include <dithering_fragment>')
  }
  m.customProgramCacheKey = () => 'rim'
  return m
}
function padGeo() {
  const b = new GeoBuilder()
  b.box(2.0, 0.05, 3.6, 0, 0, 0, 0x6a5a80)
  for (let i = 0; i < 3; i++) { for (const s of [-1, 1]) b.box(1.2, 0.07, 0.28, s * 0.46, 0.0, -1.1 + i * 1.05 + 0.0, 0xffd04a, { ry: -s * 0.75 }) }
  return b.build()
}

export class Entities {
  private pools = new Map<string, THREE.Mesh[]>()
  private live = new Map<number, { mesh: THREE.Mesh; key: string }>()
  private geos = new Map<string, THREE.BufferGeometry>()
  private propMat: THREE.MeshLambertMaterial
  private pickMat: THREE.MeshLambertMaterial
  peaches: THREE.InstancedMesh
  private pads: THREE.Mesh[] = []
  private picks = new Map<string, { meshes: THREE.Mesh[]; used: number }>()
  private halos: THREE.Sprite[] = []
  private badgeGeo = new THREE.PlaneGeometry(1, 1)
  private badgeMats = new Map<string, THREE.MeshBasicMaterial>()
  shadow: THREE.Mesh
  private d = new THREE.Object3D()
  constructor(public scene: THREE.Scene) {
    this.propMat = rimMat(bend(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x4a3038 })))
    this.pickMat = rimMat(bend(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x8a6040 })))
    const pm = bend(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xb85a1c }))
    this.peaches = new THREE.InstancedMesh(peachGeo(), pm, 640); this.peaches.frustumCulled = false; this.peaches.count = 0; scene.add(this.peaches)
    const padMat = bend(new THREE.MeshBasicMaterial({ vertexColors: true }))
    const pg = padGeo()
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(pg, padMat); m.visible = false; scene.add(m); this.pads.push(m) }
    for (let i = 0; i < 8; i++) { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); h.visible = false; h.renderOrder = 4; scene.add(h); this.halos.push(h) }
    const tl = new THREE.TextureLoader()
    for (const n of BADGES) {
      const map = tl.load(`${import.meta.env.BASE_URL}art/badge-${n}.webp`); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4
      this.badgeMats.set(n, bend(new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.06, side: THREE.DoubleSide, depthWrite: false })))
    }
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false }))
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.04; this.shadow.renderOrder = 1; scene.add(this.shadow)
  }
  private geo(o: Obstacle) {
    const key = o.kind === 'truck' || o.kind === 'car' ? o.kind + (o.variant % 3) : o.kind === 'sign' || o.kind === 'lowsign' || o.kind === 'barricade' ? o.kind + o.span : o.kind === 'train' ? 'train' + Math.round(o.len / 14.8) : o.kind
    let g = this.geos.get(key)
    if (!g) {
      g = o.kind === 'barrier' ? barrierGeo() : o.kind === 'cones' ? conesGeo() : o.kind === 'truck' ? truckGeo(o.variant) : o.kind === 'bus' ? busGeo() : o.kind === 'sign' ? signGeo(o.span)
        : o.kind === 'scooter' ? scooterGeo() : o.kind === 'barricade' ? barricadeGeo(o.span) : o.kind === 'lowsign' ? lowSignGeo(o.span)
        : o.kind === 'car' ? carGeo(o.variant) : o.kind === 'train' ? trainGeo(Math.round(o.len / 14.8)) : rampGeo()
      this.geos.set(key, g)
    }
    return { key, g }
  }
  private acquire(o: Obstacle) {
    const { key, g } = this.geo(o)
    const pool = this.pools.get(key) ?? []; this.pools.set(key, pool)
    const m = pool.pop() ?? new THREE.Mesh(g, this.propMat)
    m.visible = true; this.scene.add(m); return { mesh: m, key }
  }
  reset() { for (const [id, l] of this.live) { this.scene.remove(l.mesh); this.pools.get(l.key)!.push(l.mesh); this.live.delete(id) } }

  update(sim: Sim, time: number, hideShadow = false) {
    const P = sim.dist, seen = new Set<number>()
    for (const o of sim.track.obstacles) {
      const rel = P - o.d
      if (o.smashed || rel < -SPAWN_AHEAD - o.len || rel - o.len > 14) continue
      seen.add(o.id)
      let l = this.live.get(o.id); if (!l) { l = this.acquire(o); this.live.set(o.id, l) }
      const cx = laneX(o.lane) + (o.span - 1) * LANE_W / 2
      l.mesh.position.set(cx, 0, rel - o.len / 2)
      l.mesh.rotation.y = o.kind === 'car' && (o.vel ?? 0) > 0 ? Math.PI : 0
    }
    for (const [id, l] of this.live) if (!seen.has(id)) { this.scene.remove(l.mesh); this.pools.get(l.key)!.push(l.mesh); this.live.delete(id) }
    // pickups
    let n = 0, padN = 0, haloN = 0
    for (const s of this.pads) s.visible = false
    for (const h of this.halos) h.visible = false
    for (const v of this.picks.values()) { v.used = 0; for (const m of v.meshes) m.visible = false }
    const ch = LETTERS[Math.min(sim.letterIdx, LETTERS.length - 1)]
    for (const k of sim.track.pickups) {
      if (k.taken) continue
      const rel = P - k.d
      if (rel < -SPAWN_AHEAD || rel > 4) continue
      let x = laneX(k.lane), y = k.y, z = rel
      if (k.kind === 'peach') {
        if (k.pull > 0) { const t = Math.min(1, k.pull), e = t * t; x += (sim.p.x - x) * e; y += (sim.p.y + 1 - y) * e; z *= 1 - e }
        if (n >= 640) continue
        this.d.position.set(x, y + Math.sin(time * 3 + k.d) * 0.06, z); this.d.rotation.set(0, time * 3 + k.d, 0); this.d.scale.setScalar(1.75 * (k.pull > 0 ? 1 - 0.4 * k.pull : 1)); this.d.updateMatrix()
        this.peaches.setMatrixAt(n++, this.d.matrix)
      } else if (k.kind === 'pad') {
        const m = this.pads[padN++]; if (!m) continue
        m.visible = true; m.position.set(x, 0.03, z); m.scale.y = 1 + Math.sin(time * 10) * 0.3
      } else if (k.kind === 'badge') {
        const name = BADGES[sim.badgeIdx], key = 'badge' + name
        let pool = this.picks.get(key); if (!pool) { pool = { meshes: [], used: 0 }; this.picks.set(key, pool) }
        let m = pool.meshes[pool.used]
        if (!m) { m = new THREE.Mesh(this.badgeGeo, this.badgeMats.get(name)!); m.frustumCulled = false; m.renderOrder = 5; this.scene.add(m); pool.meshes.push(m) }
        pool.used++; m.visible = true
        m.position.set(x, y + 0.3 + Math.sin(time * 3 + k.d) * 0.16, z); m.scale.setScalar(2.1 * (1 + Math.sin(time * 5 + k.d) * 0.05)); m.rotation.set(0, Math.sin(time * 2.4 + k.d) * 0.55, 0)
        const hl = this.halos[haloN++]
        if (hl) { hl.visible = true; hl.position.set(x, y + 0.3, z); hl.scale.setScalar(3.4 + Math.sin(time * 4 + k.d) * 0.3); (hl.material as THREE.SpriteMaterial).color.setHex(0xffd166) }
      } else {
        const key = k.kind === 'letter' ? 'letter' + ch : k.kind
        let pool = this.picks.get(key); if (!pool) { pool = { meshes: [], used: 0 }; this.picks.set(key, pool) }
        let m = pool.meshes[pool.used]
        if (!m) { m = new THREE.Mesh(pickupGeo(k.kind as PowerKind | 'crate' | 'letter', ch), this.pickMat); m.frustumCulled = false; this.scene.add(m); pool.meshes.push(m) }
        pool.used++; m.visible = true
        const sc = PICKUP_SCALE[k.kind] * (1 + Math.sin(time * 5 + k.d) * 0.05)
        m.position.set(x, y + Math.sin(time * 3 + k.d) * 0.18, z); m.scale.setScalar(sc)
        m.rotation.set(k.kind === 'crate' ? Math.sin(time * 2) * 0.12 : 0, time * 2.2 + k.d, k.kind === 'wing' ? 0.5 : 0)
        const hl = this.halos[haloN++]
        if (hl) { hl.visible = true; hl.position.set(x, y, z); hl.scale.setScalar(2.8 + Math.sin(time * 4 + k.d) * 0.3); (hl.material as THREE.SpriteMaterial).color.setHex(k.kind === 'crate' ? 0xffd166 : k.kind === 'letter' ? 0xffe066 : POWERS[k.kind as PowerKind].hex); (hl.material as THREE.SpriteMaterial).opacity = 0.55 }
      }
    }
    this.peaches.count = n; this.peaches.instanceMatrix.needsUpdate = true
    this.shadow.visible = !hideShadow
    this.shadow.position.x = sim.p.x; const h = Math.max(0, sim.p.y)
    this.shadow.scale.setScalar(Math.max(0.35, 1 - h * 0.18)); (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 0.9 - h * 0.2)
  }
}
