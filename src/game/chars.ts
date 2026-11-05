import * as THREE from 'three'

const mats = new Map<number, THREE.MeshLambertMaterial>()
const M = (c: number) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); mats.set(c, m) } return m }
const mesh = (g: THREE.BufferGeometry, c: number, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(g, M(c)); m.position.set(x, y, z); return m }
const box = (w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z)
const cap = (r: number, len: number, c: number, x = 0, y = 0, z = 0) => mesh(new THREE.CapsuleGeometry(r, len, 2, 6), c, x, y, z)
const ball = (r: number, c: number, x = 0, y = 0, z = 0, d = 1) => mesh(new THREE.IcosahedronGeometry(r, d), c, x, y, z)
const cyl = (rt: number, rb: number, h: number, c: number, x = 0, y = 0, z = 0, seg = 10) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z)
const tor = (r: number, t: number, c: number, x = 0, y = 0, z = 0, arc = Math.PI * 2) => mesh(new THREE.TorusGeometry(r, t, 5, 14, arc), c, x, y, z)

export interface Pose { phase: number; air: boolean; slide: number; lean: number; crash: number; idle: boolean; t: number; stumble?: number; glide?: boolean }
interface Look {
  skin: number; hair: number; top: number; sleeve: number; bottom: number; shoes: number
  scale: number; torsoW: number; legW: number; ride?: boolean; waddle?: number
}
const LOOKS: Record<string, Look> = {
  juno: { skin: 0xc98a5e, hair: 0x2a1a22, top: 0x2ec4b6, sleeve: 0x2ec4b6, bottom: 0xf2b134, shoes: 0xfff1d6, scale: 1, torsoW: 1, legW: 1.25, ride: true },
  tay: { skin: 0x8a5a3c, hair: 0x1d1418, top: 0xc2263f, sleeve: 0xf3b83a, bottom: 0x3a2a4d, shoes: 0xf3b83a, scale: 1.08, torsoW: 1.15, legW: 1 },
  rook: { skin: 0x6f4a33, hair: 0x1d1418, top: 0xff8f6b, sleeve: 0xff8f6b, bottom: 0x6b7a4a, shoes: 0x2ec4b6, scale: 1, torsoW: 1.35, legW: 1.15 },
  dez: { skin: 0x5a3a2a, hair: 0x1d1418, top: 0x3a2a4d, sleeve: 0x3a2a4d, bottom: 0xffd166, shoes: 0xff5e4a, scale: 1.06, torsoW: 1.25, legW: 1.2 },
  nova: { skin: 0xd9a070, hair: 0x6a2a4a, top: 0xffd166, sleeve: 0xffd166, bottom: 0x2ec4b6, shoes: 0xfff1d6, scale: 0.98, torsoW: 0.95, legW: 1 },
  pearl: { skin: 0xa8704a, hair: 0xf4f0f0, top: 0xf1e4c8, sleeve: 0xf1e4c8, bottom: 0xff6b6b, shoes: 0xfff1d6, scale: 0.9, torsoW: 1.05, legW: 0.9, waddle: 0.16 },
}

export class Runner {
  root = new THREE.Group()
  body = new THREE.Group()
  private j: Record<string, THREE.Object3D> = {}
  private cur: Record<string, number> = {}
  private extras: THREE.Object3D[] = []
  look: Look
  hipH = 1.02
  constructor(public id: string) {
    const L = (this.look = LOOKS[id] ?? LOOKS.juno)
    this.root.scale.setScalar(L.scale)
    this.body.position.y = this.hipH
    this.root.add(this.body)
    const torso = box(0.46 * L.torsoW, 0.62, 0.3 * (id === 'rook' ? 1.2 : 1), L.top, 0, 0.34, 0)
    this.body.add(torso)
    this.body.add(box(0.44 * L.torsoW, 0.24, 0.29, L.bottom, 0, 0.0, 0))
    const head = new THREE.Group(); head.position.y = 0.9; this.body.add(head); this.j.head = head
    head.add(ball(0.22, L.skin, 0, 0, 0, 2), mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 6), L.skin, 0, -0.22, 0))
    for (const s of [-1, 1]) head.add(box(0.05, 0.07, 0.03, 0x241624, s * 0.085, 0.02, -0.205))
    head.add(box(0.07, 0.025, 0.02, 0x8a3a3a, 0, -0.09, -0.205))
    const limb = (side: number) => {
      const arm = new THREE.Group(); arm.position.set(side * (0.27 * L.torsoW + 0.08), 0.56, 0)
      arm.add(cap(0.075, 0.2, L.sleeve, 0, -0.17, 0))
      const el = new THREE.Group(); el.position.y = -0.36; el.add(cap(0.065, 0.2, id === 'tay' || id === 'pearl' ? L.sleeve : L.skin, 0, -0.14, 0), ball(0.075, L.skin, 0, -0.3, 0, 0)); arm.add(el)
      this.body.add(arm)
      const leg = new THREE.Group(); leg.position.set(side * 0.13, 0, 0)
      leg.add(cap(0.1 * L.legW, 0.26, L.bottom, 0, -0.22, 0))
      const kn = new THREE.Group(); kn.position.y = -0.46
      kn.add(cap(0.085 * L.legW, 0.28, id === 'pearl' ? L.skin : L.bottom, 0, -0.2, 0), box(0.17, 0.12, 0.36, L.shoes, 0, -0.5, -0.07)); leg.add(kn); this.body.add(leg)
      return { arm, el, leg, kn }
    }
    const l = limb(-1), r = limb(1)
    Object.assign(this.j, { la: l.arm, le: l.el, ra: r.arm, re: r.el, ll: l.leg, lk: l.kn, rl: r.leg, rk: r.kn })
    this.accessories(head, l, r)
  }
  private accessories(head: THREE.Group, l: { arm: THREE.Group; el: THREE.Group }, r: { arm: THREE.Group; el: THREE.Group }) {
    const L = this.look
    if (this.id === 'juno') {
      head.add(ball(0.27, L.hair, 0, 0.14, 0.04, 1), tor(0.23, 0.04, 0x2ec4b6, 0, 0.08, 0, Math.PI * 2).rotateX(Math.PI / 2))
      head.add(ball(0.12, L.hair, 0, 0.2, 0.28, 1))
      const board = new THREE.Group()
      board.add(box(0.34, 0.05, 1.05, 0xff6b6b, 0, 0.17, 0), box(0.3, 0.02, 0.5, 0xfff1d6, 0, 0.2, -0.1))
      for (const [x, z] of [[-0.14, -0.38], [0.14, -0.38], [-0.14, 0.38], [0.14, 0.38]]) board.add(cyl(0.07, 0.07, 0.06, 0xfff1d6, x, 0.08, z, 8).rotateZ(Math.PI / 2))
      this.root.add(board); this.extras.push(board)
      this.body.add(box(0.5, 0.06, 0.32, 0xff8f6b, 0, 0.44, 0))
    } else if (this.id === 'tay') {
      head.add(cyl(0.24, 0.25, 0.16, 0xc2263f, 0, 0.16, 0, 12), box(0.3, 0.04, 0.2, 0xf3b83a, 0, 0.1, -0.24), ball(0.06, 0xf3b83a, 0, 0.27, 0, 0))
      this.body.add(box(0.5 * L.torsoW, 0.07, 0.34, 0xf3b83a, 0, 0.1, 0), box(0.5 * L.torsoW, 0.05, 0.34, 0xfff1d6, 0, 0.5, 0))
      const cane = cyl(0.025, 0.025, 0.95, 0xf3b83a, 0, -0.3, -0.45, 6); cane.rotation.x = Math.PI / 2.4; r.el.add(cane)
      cane.add(ball(0.06, 0xfff1d6, 0, 0.5, 0, 0))
    } else if (this.id === 'rook') {
      head.add(ball(0.23, L.hair, 0, 0.08, 0.03, 1))
      const hp = tor(0.25, 0.035, 0x3a2a4d, 0, 0.02, 0, Math.PI); hp.rotation.z = 0
      head.add(hp, cyl(0.07, 0.07, 0.09, 0xf3b83a, -0.25, -0.02, 0, 8).rotateZ(Math.PI / 2), cyl(0.07, 0.07, 0.09, 0xf3b83a, 0.25, -0.02, 0, 8).rotateZ(Math.PI / 2))
      this.body.add(ball(0.2, L.top, 0, 0.68, 0.14, 1), tor(0.16, 0.025, 0xf3b83a, 0, 0.6, -0.14).rotateX(0.3))
      const pack = box(0.36, 0.42, 0.14, 0x3a2a4d, 0, 0.38, 0.23); this.body.add(pack)
      ;[0xff5e5b, 0xffd166, 0x2ec4b6, 0xfff1d6].forEach((c, i) => pack.add(box(0.09, 0.09, 0.03, c, -0.07 + (i % 2) * 0.14, 0.07 - Math.floor(i / 2) * 0.14, 0.08)))
    } else if (this.id === 'dez') {
      head.add(ball(0.23, L.hair, 0, 0.1, 0.03, 1), tor(0.23, 0.04, 0xff5e4a, 0, 0.1, 0).rotateX(Math.PI / 2))
      this.body.add(box(0.3, 0.3, 0.03, 0xffd166, 0, 0.36, 0.17), box(0.12, 0.18, 0.02, 0x3a2a4d, 0, 0.36, 0.19))
      for (const s of [-1, 1]) this.body.add(box(0.06, 0.14, 0.04, 0xff5e4a, s * 0.16, 0.12, -0.16))
    } else if (this.id === 'nova') {
      head.add(ball(0.24, L.hair, 0, 0.1, 0.04, 1), box(0.4, 0.09, 0.08, 0x6fe0d0, 0, 0.02, -0.2))
      const wheel = tor(0.3, 0.04, 0xfff1d6, 0, 0.38, 0.26); this.body.add(wheel)
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; wheel.add(box(0.07, 0.07, 0.07, [0xff6b6b, 0xffd166, 0x2ec4b6][i % 3], Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0)) }
    } else if (this.id === 'pearl') {
      head.add(ball(0.14, L.hair, -0.2, -0.02, 0.05, 1), ball(0.14, L.hair, 0.2, -0.02, 0.05, 1), ball(0.2, L.hair, 0, 0.08, 0.08, 1))
      head.add(cyl(0.62, 0.62, 0.035, 0xffd166, 0, 0.22, 0, 14), cyl(0.26, 0.3, 0.2, 0xffd166, 0, 0.3, 0, 12), tor(0.28, 0.035, 0xff6b6b, 0, 0.25, 0).rotateX(Math.PI / 2))
      for (const s of [-1, 1]) head.add(tor(0.06, 0.012, 0x3a2a4d, s * 0.09, 0.03, -0.215))
      head.add(box(0.08, 0.012, 0.012, 0x3a2a4d, 0, 0.04, -0.215))
      const skirt = cyl(0.25, 0.5, 0.62, L.bottom, 0, -0.18, 0, 10); this.body.add(skirt)
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; skirt.add(ball(0.05, 0xfff1d6, Math.cos(a) * 0.42, -0.14 + (i % 2) * 0.1, Math.sin(a) * 0.42, 0)) }
      const purse = box(0.2, 0.17, 0.08, 0x2ec4b6, 0.34, -0.2, 0); purse.add(tor(0.07, 0.012, 0x3a2a4d, 0, 0.1, 0, Math.PI)); this.body.add(purse)
    }
  }
  /** Drive the pose. Returns nothing; call every frame. */
  update(dt: number, p: Pose) {
    const s = Math.sin(p.phase), c = Math.cos(p.phase), j = this.j, L = this.look
    const T: Record<string, number> = {}
    const air = p.air, sl = p.slide
    if (p.glide) {
      Object.assign(T, { ll: 0.5, lk: -0.9, rl: 0.2, rk: -0.7, la: 2.7, ra: 2.7, le: 0.2, re: 0.2, bx: 0.9, by: 0, bz: 0, head: -0.4, splay: 0.9 })
    } else if (p.crash > 0) {
      Object.assign(T, { ll: 0.6, lk: -0.5, rl: -0.4, rk: -0.7, la: 2.4, ra: 2.1, le: 0.4, re: 0.3, bx: -1.35, by: -0.4, bz: 0, head: 0.2, splay: 0.6 })
    } else if (sl > 0.01) {
      Object.assign(T, { ll: 0.12, lk: -0.15, rl: 0.0, rk: -0.1, la: 0.2, ra: 0.5, le: 0.5, re: 0.5, bx: 1.25, by: -0.52, bz: 0, head: -0.8, splay: 0.5 })
    } else if (air) {
      Object.assign(T, { ll: 1.0, lk: -1.1, rl: -0.4, rk: -0.9, la: 2.5, ra: 2.2, le: 0.3, re: 0.3, bx: -0.08, by: 0, bz: 0, head: 0, splay: 0.3 })
    } else if (p.idle) {
      const b = Math.sin(p.t * 2.2)
      Object.assign(T, { ll: 0, lk: 0, rl: 0, rk: 0, la: b * 0.06, ra: -b * 0.06, le: 0.15, re: 0.15, bx: 0, by: b * 0.012, bz: 0, head: b * 0.03, splay: 0.08 })
    } else if (L.ride) {
      Object.assign(T, { ll: 0.35, lk: -0.45, rl: -0.3, rk: -0.5, la: -0.5 + s * 0.15, ra: 0.9 - s * 0.15, le: 0.5, re: 0.7, bx: -0.2, by: -0.08 + Math.abs(s) * 0.02, bz: 0, head: 0.05, splay: 0.35 })
    } else {
      const k1 = 0.25 + 0.95 * Math.max(0, Math.sin(p.phase + 1.9)), k2 = 0.25 + 0.95 * Math.max(0, Math.sin(p.phase + 1.9 + Math.PI))
      Object.assign(T, { ll: s * 1.0, rl: -s * 1.0, lk: -k1, rk: -k2, la: -s * 0.95, ra: s * 0.95, le: 1.15, re: 1.15, bx: -0.16, by: Math.abs(c) * 0.07, bz: 0, head: 0.1, splay: 0.12 })
      if (this.id === 'tay') { T.ra = 0.5; T.re = 0.8 }
    }
    if ((p.stumble ?? 0) > 0) { const w = Math.sin(p.t * 30) * p.stumble!; T.bx = 0.5 * p.stumble!; T.la = 2.4 * p.stumble! + (T.la ?? 0) * (1 - p.stumble!); T.ra = -1.4 * p.stumble! + (T.ra ?? 0) * (1 - p.stumble!); T.ry = w * 0.5 }
    T.rz = (p.lean * 0.28) + (L.waddle && !air && !p.idle ? Math.sin(p.phase) * L.waddle : 0)
    if (T.ry === undefined) T.ry = p.idle ? 0 : s * 0.1
    const k = 1 - Math.exp(-dt * (air ? 14 : 24))
    for (const key in T) { const prev = this.cur[key] ?? T[key]; this.cur[key] = prev + (T[key] - prev) * k }
    const C = this.cur
    j.ll.rotation.x = C.ll; j.rl.rotation.x = C.rl; j.lk.rotation.x = C.lk; j.rk.rotation.x = C.rk
    j.la.rotation.x = C.la; j.ra.rotation.x = C.ra; j.le.rotation.x = C.le; j.re.rotation.x = C.re
    j.la.rotation.z = -C.splay; j.ra.rotation.z = C.splay
    j.head.rotation.x = C.head
    this.body.rotation.x = C.bx; this.body.rotation.z = -C.rz; this.body.rotation.y = C.ry
    this.body.position.y = this.hipH + (L.ride ? 0.2 : 0) + C.by
  }
}
