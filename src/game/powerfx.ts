import * as THREE from 'three'
import { haloTexture } from './gfx'
import { POWERS } from '../core/powers'
import type { Sim } from '../core/sim'
import type { Particles } from './fx'

type Emit = Particles['emit']
/** Visual state of every active power-up on the runner: shield bubble, jet ring, kick springs, auras and particle trails. */
export class PlayerFx {
  private bubble: THREE.Mesh; private jet = new THREE.Group(); private springs = new THREE.Group(); private aura: THREE.Sprite
  private flames: THREE.Mesh[] = []
  private teaRing: THREE.Mesh; private teaRing2: THREE.Mesh; private cobRing: THREE.Mesh; private springT = 0
  constructor(scene: THREE.Scene, private emit: Emit) {
    this.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 2), new THREE.MeshBasicMaterial({ color: 0x4fe8d8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.bubble.visible = false; this.bubble.renderOrder = 6; scene.add(this.bubble)
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 6, 20), mat(0x6fe0d0)); ring.rotation.y = Math.PI / 2
    this.jet.add(ring)
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; const g = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.2), mat([0xff6b6b, 0xffd166, 0xfff1d6, 0xff9f68][i % 4])); g.position.set(0, Math.sin(a) * 0.62, Math.cos(a) * 0.62); this.jet.add(g) }
    for (const s of [-0.28, 0.28]) {
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.3, 7), mat(0x3a2a4d)); noz.position.set(s, -0.55, 0)
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xff9a2a })); fl.rotation.x = Math.PI; fl.position.set(s, -1.1, 0)
      this.jet.add(noz, fl); this.flames.push(fl)
    }
    this.jet.visible = false; scene.add(this.jet)
    for (const s of [-0.13, 0.13]) {
      for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 4, 8), mat(0xff4d6d)); c.rotation.x = Math.PI / 2; c.position.set(s, 0.1 + i * 0.07, 0); this.springs.add(c) }
    }
    this.springs.visible = false; scene.add(this.springs)
    const glow = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    this.teaRing = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.07, 6, 40), glow(0xffb347, 0.9)); this.teaRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 6, 32), glow(0xffd166, 0.8))
    this.cobRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.1, 32), glow(0xffd166, 0.7)); this.cobRing.rotation.x = -Math.PI / 2
    for (const m of [this.teaRing, this.teaRing2, this.cobRing]) { m.visible = false; m.renderOrder = 6; scene.add(m) }
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
    this.aura.visible = false; this.aura.renderOrder = 6; scene.add(this.aura)
  }
  update(s: Sim, time: number, live: boolean, reduced: boolean) {
    const p = s.p, pw = s.pw, k = reduced ? 0.4 : 1
    const on = live && s.state === 'run'
    this.bubble.visible = on && pw.board > 0
    if (this.bubble.visible) {
      const low = pw.board < 3 ? 0.5 + 0.5 * Math.sin(time * 18) : 1
      this.bubble.position.set(p.x, p.y + 0.95, 0); this.bubble.scale.setScalar(1 + Math.sin(time * 6) * 0.04); this.bubble.rotation.y = time
      ;(this.bubble.material as THREE.MeshBasicMaterial).opacity = 0.2 * low
    }
    this.jet.visible = on && pw.glide > 0
    if (this.jet.visible) {
      this.jet.position.set(p.x, p.y + 1.15, 0.38); this.jet.rotation.x = Math.sin(time * 3) * 0.05
      for (const f of this.flames) f.scale.set(1, 0.8 + Math.random() * 0.6, 1)
      if (Math.random() < 0.9 * k) this.emit({ x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + 0.3, z: 0.5, n: 1, colors: [0xff9a2a, 0xffd166, 0x6fe0d0, 0xfff1d6], speed: 0.8, up: -1.5, size: 0.13, life: 0.4, grav: -1, vz: -18 })
    }
    this.springs.visible = on && pw.kicks > 0
    if (this.springs.visible) { this.springs.position.set(p.x, p.y - 0.02, -0.05); this.springs.scale.set(2.2, p.air ? 2.2 : 1.2 + Math.abs(Math.sin(time * 14)) * 0.9, 2.2) }
    // Tea: amber magnet rings orbiting the runner
    this.teaRing.visible = this.teaRing2.visible = on && pw.tea > 0
    if (this.teaRing.visible) {
      this.teaRing.position.set(p.x, p.y + 1, 0); this.teaRing.rotation.set(time * 1.6, time * 2.4, 0); this.teaRing.scale.setScalar(1 + Math.sin(time * 7) * 0.08)
      this.teaRing2.position.copy(this.teaRing.position); this.teaRing2.rotation.set(-time * 2.2, 1.2 + time, time * 1.3)
    }
    // Cobbler: gold shimmer disc at the feet
    this.cobRing.visible = on && pw.cobbler > 0
    if (this.cobRing.visible) { this.cobRing.position.set(p.x, p.y + 0.06, 0); this.cobRing.scale.setScalar(1 + ((time * 1.4) % 1) * 0.9); (this.cobRing.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - ((time * 1.4) % 1)) }
    // aura colour = loudest active power
    const order: [keyof typeof pw, number, number][] = [['wing', 0xffd23d, 5.2], ['cobbler', 0xff8f6b, 3.4], ['kicks', 0xff4d6d, 2.8], ['tea', 0xffb347, 3.2], ['glide', 0x6fe0d0, 3.6]]
    const top = on ? order.find(([n]) => pw[n] > 0) : undefined
    this.aura.visible = !!top
    if (top) {
      this.aura.position.set(p.x, p.y + 1, 0.1); this.aura.scale.setScalar(top[2] * (1 + Math.sin(time * 9) * 0.06))
      ;(this.aura.material as THREE.SpriteMaterial).color.setHex(top[1]); (this.aura.material as THREE.SpriteMaterial).opacity = (pw.wing > 0 ? 0.7 : 0.45) * (reduced ? 0.6 : 1)
    }
    if (!on) return
    if (pw.wing > 0 && Math.random() < 0.9 * k) this.emit({ x: p.x + (Math.random() - 0.5) * 0.7, y: p.y + 0.5 + Math.random(), z: 0.6, n: 2, colors: [0xff9a2a, 0xffd23d, 0xfff08a, 0xff5e4a], speed: 1.2, up: 0.4, size: 0.22, life: 0.45, grav: 0, vz: -4 })
    if (pw.cobbler > 0 && Math.random() < 0.95 * k) this.emit({ x: p.x + (Math.random() - 0.5) * 1.3, y: p.y + 0.2 + Math.random() * 1.2, z: (Math.random() - 0.5) * 0.7, n: 2, colors: [0xffd166, 0xffe9a0, 0xfff1d6, 0xffc83d], speed: 0.4, up: 2.2, size: 0.2, life: 0.9, grav: -1, vz: -6 })
    if (pw.kicks > 0 && (this.springT -= 1 / 60) <= 0) { this.springT = p.air ? 0.1 : 0.16; this.emit({ x: p.x, y: p.y + 0.08, z: 0, n: p.air ? 5 : 8, colors: [0xff4d6d, 0xff8f2a, 0xffd166, 0xfff1d6], speed: 3.2, up: 0.6, size: 0.17, life: 0.45, grav: 3, vz: -3, spread: 0.3 }) }
    if (pw.tea > 0 && Math.random() < 0.7 * k) { const a = time * 6 + Math.random() * 6.3; this.emit({ x: p.x + Math.cos(a) * 1.5, y: p.y + 1 + Math.sin(a) * 0.9, z: Math.sin(a) * 0.5, n: 1, colors: [0xffb347, 0xffd166], speed: 0.2, up: 0, size: 0.14, life: 0.4, grav: 0 }) }
    if (s.stumbleT > 0 && Math.random() < 0.4 * k) this.emit({ x: p.x, y: p.y + 1.9, z: 0, n: 1, colors: [0xff5e4a, 0xffd166], speed: 0.5, up: 1.5, size: 0.14, life: 0.5, grav: 0 })
  }
}
export const powerColor = (k: keyof typeof POWERS) => POWERS[k].hex
