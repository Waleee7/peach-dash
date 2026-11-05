import * as THREE from 'three'

/* ---------------- haptics ---------------- */
const PATTERNS: Record<string, number | number[]> = {
  peach: 7, combo: [10, 24, 10, 24, 26], jump: 16, slide: 12, lane: 5, land: [20], near: [10, 28, 24],
  tea: [14, 30, 14, 30, 34], board: [14, 30, 14, 30, 34], pad: [30, 20, 44], crash: [110, 40, 70, 40, 240],
  wing: [14, 20, 14, 20, 14, 20, 40, 30, 70], cobbler: [24, 30, 12, 30, 40], kicks: [10, 16, 30, 24, 50], glide: [60, 40, 20, 20, 20, 20, 20],
  crate: [18, 24, 18, 24, 18, 60], letter: [12, 20, 24], atlanta: [30, 30, 30, 30, 30, 30, 120], stumble: [60, 30, 36, 24, 80], smash: [40, 14, 40], honk: [18, 40, 18], end: [8, 24, 8], level: [20, 30, 20, 30, 20, 30, 90],
  shield: [50, 30, 50], ui: 6, buy: [12, 30, 22], revive: [20, 40, 20, 40, 60], go: [30, 40, 30, 40, 90],
}
export const Haptics = {
  on: true,
  play(name: string) {
    if (!this.on || typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
    if (ua && !ua.hasBeenActive) return
    try { navigator.vibrate(PATTERNS[name] ?? 8) } catch { /* unsupported */ }
  },
}

/* ---------------- synthesized audio ---------------- */
export class Sound {
  ctx?: AudioContext
  sfxOn = true; musicOn = true
  private master!: GainNode; private sfxG!: GainNode; private musG!: GainNode; private noiseBuf!: AudioBuffer
  private timer = 0; private step = 0; private nextT = 0; playing = false; intensity = 0
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination)
      this.sfxG = this.ctx.createGain(); this.sfxG.connect(this.master)
      this.musG = this.ctx.createGain(); this.musG.gain.value = 0.32; this.musG.connect(this.master)
      const n = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, n, n)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state !== 'running') void this.ctx.resume()
  }
  private tone(f: number, dur: number, type: OscillatorType, vol: number, to?: number, delay = 0, dest?: AudioNode) {
    const c = this.ctx; if (!c) return
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(dest ?? this.sfxG); o.start(t); o.stop(t + dur + 0.03)
  }
  private noise(dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType = 'lowpass', delay = 0, dest?: AudioNode) {
    const c = this.ctx; if (!c) return
    const t = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur)
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(fl); fl.connect(g); g.connect(dest ?? this.sfxG); s.start(t, Math.random()); s.stop(t + dur + 0.05)
  }
  sfx(name: string, v = 0) {
    if (!this.sfxOn || !this.ctx) return
    const P = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]            // major pentatonic climb for peach combos
    switch (name) {
      case 'peach': { const f = 740 * Math.pow(2, P[Math.min(P.length - 1, v % 11)] / 12); this.tone(f, 0.12, 'triangle', 0.3); this.tone(f * 2, 0.16, 'sine', 0.12, undefined, 0.04); break }
      case 'jump': this.tone(280, 0.18, 'square', 0.12, 720); break
      case 'slide': this.noise(0.32, 0.5, 2400, 300, 'bandpass'); break
      case 'lane': this.tone(520, 0.05, 'triangle', 0.14, 380); break
      case 'land': this.tone(130, 0.12, 'sine', 0.35, 55); this.noise(0.08, 0.2, 900, 200); break
      case 'near': this.noise(0.28, 0.6, 600, 5000, 'bandpass'); this.tone(900, 0.18, 'sawtooth', 0.09, 2000, 0.02); break
      case 'wing': this.tone(180, 0.5, 'sawtooth', 0.16, 1500); this.noise(0.5, 0.35, 600, 6000, 'bandpass'); [880, 1100, 1320].forEach((f, i) => this.tone(f, 0.1, 'square', 0.1, undefined, 0.3 + i * 0.05)); break
      case 'cobbler': [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.2, undefined, i * 0.07)); this.tone(1568, 0.5, 'sine', 0.1, undefined, 0.3); break
      case 'kicks': this.tone(120, 0.12, 'square', 0.18, 90); this.tone(300, 0.3, 'triangle', 0.16, 1200, 0.1); this.tone(1200, 0.08, 'square', 0.08, undefined, 0.38); break
      case 'glide': this.noise(0.7, 0.35, 300, 3500, 'bandpass'); [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.14, f * 1.5, i * 0.08)); break
      case 'crate': this.noise(0.12, 0.5, 900, 200); [330, 440, 554, 740, 988].forEach((f, i) => this.tone(f, 0.12, 'square', 0.1, undefined, 0.1 + i * 0.05)); break
      case 'letter': this.tone(988, 0.1, 'square', 0.12); this.tone(1480, 0.2, 'triangle', 0.16, undefined, 0.07); break
      case 'atlanta': [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, undefined, i * 0.08)); break
      case 'stumble': this.noise(0.25, 0.7, 700, 100); this.tone(190, 0.3, 'sawtooth', 0.22, 70); break
      case 'smash': this.noise(0.3, 0.8, 5000, 300); this.tone(220, 0.2, 'square', 0.2, 60); break
      case 'honk': this.tone(420, 0.16, 'sawtooth', 0.14, 330); this.tone(520, 0.2, 'sawtooth', 0.12, 400, 0.14); break
      case 'end': this.tone(660, 0.1, 'triangle', 0.1, 330); break
      case 'level': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.18, undefined, i * 0.07)); break
      case 'tea': case 'board': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'square', 0.1, undefined, i * 0.05)); break
      case 'pad': this.tone(200, 0.4, 'sawtooth', 0.14, 1400); this.noise(0.4, 0.3, 400, 4000, 'bandpass'); break
      case 'combo': [659, 880, 1175].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.2, undefined, i * 0.06)); break
      case 'crash': this.noise(0.7, 1.0, 3000, 80); this.tone(110, 0.6, 'sawtooth', 0.4, 28); this.tone(60, 0.5, 'sine', 0.5, 25); break
      case 'shield': this.tone(1200, 0.25, 'triangle', 0.25, 300); this.noise(0.2, 0.5, 5000, 800, 'highpass'); break
      case 'revive': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.2, undefined, i * 0.07)); break
      case 'ui': this.tone(560, 0.05, 'square', 0.1, 840); break
      case 'buy': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.12, 'square', 0.12, undefined, i * 0.06)); break
      case 'go': [392, 392, 784].forEach((f, i) => this.tone(f, 0.14, 'square', 0.14, undefined, i * 0.1)); break
    }
  }
  /* procedural beat: kick/snare/hat + bass + pentatonic pluck, 4-chord loop */
  startMusic() {
    if (!this.ctx || this.playing) return
    this.playing = true; this.step = 0; this.nextT = this.ctx.currentTime + 0.05
    this.timer = window.setInterval(() => this.schedule(), 30)
  }
  stopMusic() { this.playing = false; clearInterval(this.timer) }
  private schedule() {
    const c = this.ctx; if (!c || !this.playing) return
    const spb = 60 / (104 + this.intensity * 22) / 4
    while (this.nextT < c.currentTime + 0.14) { this.beat(this.step, this.nextT - c.currentTime); this.step = (this.step + 1) % 64; this.nextT += spb }
  }
  private beat(s: number, dl: number) {
    if (!this.musicOn) return
    const m = this.musG, st = s % 16, bar = Math.floor(s / 16)
    const roots = [110, 87.31, 130.81, 98], root = roots[bar]
    if ([0, 3, 8, 10].includes(st)) { this.tone(150, 0.16, 'sine', 0.9, 45, dl, m) }
    if (st === 4 || st === 12) { this.noise(0.14, 0.5, 3200, 1200, 'bandpass', dl, m); this.tone(210, 0.08, 'triangle', 0.3, 120, dl, m) }
    if (st % 2 === 1 || this.intensity > 0.5) this.noise(0.04, st % 4 === 3 ? 0.22 : 0.12, 9000, 7000, 'highpass', dl, m)
    if (st % 4 === 0 || st === 6 || st === 14) this.tone(root, 0.22, 'sawtooth', 0.22, root * 0.98, dl, m)
    const scale = [1, 1.2, 1.5, 1.8, 2, 2.4, 3]                  // minor pentatonic-ish
    if (st % 2 === 0 || (this.intensity > 0.4 && st % 2 === 1)) {
      const n = scale[(s * 5 + bar * 3) % scale.length]
      this.tone(root * 4 * n, 0.14, 'triangle', 0.16, undefined, dl, m)
    }
    if (st === 0) { this.tone(root * 2, 1.4, 'sine', 0.18, undefined, dl, m); this.tone(root * 3, 1.4, 'sine', 0.1, undefined, dl, m) }
  }
}

/* ---------------- particles ---------------- */
export class Particles {
  mesh: THREE.InstancedMesh
  private n = 0; cap: number
  private px: Float32Array; py: Float32Array; pz: Float32Array; vx: Float32Array; vy: Float32Array; vz: Float32Array
  private life: Float32Array; max: Float32Array; size: Float32Array; grav: Float32Array; spin: Float32Array; rot: Float32Array; fix: Uint8Array
  private d = new THREE.Object3D(); private c = new THREE.Color()
  constructor(scene: THREE.Scene, cap = 520) {
    this.cap = cap
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ fog: false }), cap)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
    this.mesh.frustumCulled = false; this.mesh.count = 0; scene.add(this.mesh)
    const f = () => new Float32Array(cap)
    this.px = f(); this.py = f(); this.pz = f(); this.vx = f(); this.vy = f(); this.vz = f()
    this.life = f(); this.max = f(); this.size = f(); this.grav = f(); this.spin = f(); this.rot = f(); this.fix = new Uint8Array(cap)
    this.col = new Float32Array(cap * 3)
  }
  private col: Float32Array
  emit(o: { x: number; y: number; z: number; n: number; colors: number[]; speed?: number; up?: number; size?: number; life?: number; grav?: number; fixed?: boolean; vz?: number; spread?: number }) {
    for (let i = 0; i < o.n; i++) {
      const k = this.n < this.cap ? this.n++ : Math.floor(Math.random() * this.cap)
      const a = Math.random() * 6.283, e = (Math.random() - 0.3) * (o.spread ?? 1.4), sp = (o.speed ?? 5) * (0.4 + Math.random() * 0.8)
      this.px[k] = o.x; this.py[k] = o.y; this.pz[k] = o.z
      this.vx[k] = Math.cos(a) * sp; this.vy[k] = Math.sin(e) * sp + (o.up ?? 2); this.vz[k] = Math.sin(a) * sp + (o.vz ?? 0)
      this.max[k] = this.life[k] = (o.life ?? 0.7) * (0.6 + Math.random() * 0.7)
      this.size[k] = (o.size ?? 0.22) * (0.5 + Math.random()); this.grav[k] = o.grav ?? 14; this.spin[k] = (Math.random() - 0.5) * 12; this.rot[k] = Math.random() * 6
      this.fix[k] = o.fixed ? 1 : 0
      this.c.setHex(o.colors[Math.floor(Math.random() * o.colors.length)])
      this.col[k * 3] = this.c.r; this.col[k * 3 + 1] = this.c.g; this.col[k * 3 + 2] = this.c.b
    }
  }
  update(dt: number, scroll: number) {
    const ca = this.mesh.instanceColor!.array as Float32Array
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt
      if (this.life[i] <= 0) {            // swap-remove
        const l = --this.n
        if (i !== l) {
          for (const a of [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.max, this.size, this.grav, this.spin, this.rot] as Float32Array[]) a[i] = a[l]
          this.fix[i] = this.fix[l]; for (let q = 0; q < 3; q++) this.col[i * 3 + q] = this.col[l * 3 + q]
        }
        i--; continue
      }
      this.vy[i] -= this.grav[i] * dt
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt + (this.fix[i] ? 0 : scroll * dt)
      if (this.py[i] < 0.05) { this.py[i] = 0.05; this.vy[i] *= -0.35; this.vx[i] *= 0.7 }
      this.rot[i] += this.spin[i] * dt
    }
    for (let i = 0; i < this.n; i++) {
      const f = this.life[i] / this.max[i], s = this.size[i] * Math.min(1, f * 3)
      this.d.position.set(this.px[i], this.py[i], this.pz[i]); this.d.rotation.set(this.rot[i], this.rot[i] * 0.7, 0); this.d.scale.setScalar(s); this.d.updateMatrix()
      this.mesh.setMatrixAt(i, this.d.matrix)
      ca[i * 3] = this.col[i * 3]; ca[i * 3 + 1] = this.col[i * 3 + 1]; ca[i * 3 + 2] = this.col[i * 3 + 2]
    }
    this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor!.needsUpdate = true
  }
  clear() { this.n = 0 }
}

/* ---------------- speed lines ---------------- */
export class SpeedLines {
  mesh: THREE.InstancedMesh; amount = 0
  private N = 44; private x = new Float32Array(44); private y = new Float32Array(44); private z = new Float32Array(44); private l = new Float32Array(44)
  private d = new THREE.Object3D(); private mat: THREE.MeshBasicMaterial
  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0, fog: false, depthWrite: false })
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.mat, this.N)
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; scene.add(this.mesh)
    for (let i = 0; i < this.N; i++) this.respawn(i, true)
  }
  private respawn(i: number, init = false) {
    const a = Math.random() * 6.283, r = 3.2 + Math.random() * 7
    this.x[i] = Math.cos(a) * r; this.y[i] = 3.2 + Math.sin(a) * r * 0.6; this.z[i] = init ? -Math.random() * 60 : -60 - Math.random() * 20; this.l[i] = 4 + Math.random() * 10
  }
  update(dt: number, speed: number, camX: number, camY: number, camZ: number) {
    this.mat.opacity = Math.min(0.55, this.amount * 0.55); this.mesh.visible = this.amount > 0.02
    if (!this.mesh.visible) return
    for (let i = 0; i < this.N; i++) {
      this.z[i] += speed * 2.4 * dt
      if (this.z[i] > 6) this.respawn(i)
      this.d.position.set(camX + this.x[i], camY - 2.5 + this.y[i] * 0.5, camZ + this.z[i] - 12)
      this.d.scale.set(0.035, 0.035, this.l[i] * (0.6 + this.amount)); this.d.updateMatrix(); this.mesh.setMatrixAt(i, this.d.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
