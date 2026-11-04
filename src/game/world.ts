import * as THREE from 'three'
import { GeoBuilder, bend, bendU, windowTextures, muralTexture, groundTexture, type GroundKind } from './gfx'
import { mulberry32 } from '../core/rng'
import { SkylineBackdrop } from './skyline'

export const CHUNK = 40
export const DISTRICT_CHUNKS = 16
export const DISTRICT_LEN = CHUNK * DISTRICT_CHUNKS
export const DISTRICTS = [
  { id: 'downtown', name: 'DOWNTOWN', sub: 'Gold spire. Gold dome. Golden hour.', ground: 'asphalt' as GroundKind },
  { id: 'beltline', name: 'THE BELTLINE', sub: 'Murals, brick and string lights.', ground: 'concrete' as GroundKind },
  { id: 'park', name: 'PEACH PARK', sub: 'Ferris wheel. Orchard. Red clay.', ground: 'clay' as GroundKind },
]
export const districtAt = (dist: number) => Math.floor(dist / DISTRICT_LEN) % 3
/** Streaming + draw distance. Everything is built past FOG_FAR so it only ever fades IN from fog, never pops. */
export const FOG_NEAR = 70
export const FOG_FAR = 330
const FAR = 400
const CAPX = 1.9

/* ---------------- atmosphere: golden hour -> night -> dawn ---------------- */
interface Key { t: number; top: string; hor: string; sun: string; sunH: number; hemiS: string; hemiG: string; hemiI: number; dir: string; dirI: number; win: number; stars: number; sk: [number, number, number] }
const KEYS: Key[] = [
  { t: 0.0, top: '#6fa8dc', hor: '#ffc98b', sun: '#ffe0a0', sunH: 0.1, hemiS: '#ffe9c8', hemiG: '#d19a76', hemiI: 1.05, dir: '#ffc07a', dirI: 1.7, win: 0, stars: 0, sk: [0.75, 0.25, 0] },
  { t: 0.24, top: '#e8708a', hor: '#ff9a5a', sun: '#ffb070', sunH: 0.0, hemiS: '#ffc0a0', hemiG: '#9a6080', hemiI: 0.95, dir: '#ff8a5a', dirI: 1.3, win: 0.45, stars: 0.1, sk: [0, 1, 0] },
  { t: 0.5, top: '#243a86', hor: '#d0608a', sun: '#000000', sunH: -0.4, hemiS: '#b4bdff', hemiG: '#8a6a98', hemiI: 1.2, dir: '#b4c0ff', dirI: 1.0, win: 1, stars: 1, sk: [0, 0, 1] },
  { t: 0.78, top: '#34478e', hor: '#f58a7a', sun: '#ffb080', sunH: -0.06, hemiS: '#c8bef0', hemiG: '#a06a78', hemiI: 1.15, dir: '#ffa080', dirI: 1.1, win: 0.6, stars: 0.5, sk: [0, 0.65, 0.35] },
  { t: 1.0, top: '#6fa8dc', hor: '#ffc98b', sun: '#ffe0a0', sunH: 0.1, hemiS: '#ffe9c8', hemiG: '#d19a76', hemiI: 1.05, dir: '#ffc07a', dirI: 1.7, win: 0, stars: 0, sk: [0.75, 0.25, 0] },
]
const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`
const SKY_FS = `varying vec3 vDir; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform float uSunH; uniform float uStars; uniform float uTime;
float h3(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir); float h = clamp(d.y,0.0,1.0);
  vec3 col = mix(uHor, uTop, pow(h,0.5));
  vec3 sd = normalize(vec3(0.0, uSunH, -1.0)); float s = max(dot(d,sd),0.0);
  col += uSun*(pow(s,900.0)*2.0 + pow(s,60.0)*0.5 + pow(s,7.0)*0.28);
  vec3 g = floor(d*130.0); float r = h3(g);
  float st = step(0.9965, r) * smoothstep(0.08,0.4,d.y) * uStars * (0.6+0.4*sin(uTime*3.0+r*90.0));
  col += vec3(1.0,0.95,0.85)*st;
  gl_FragColor = vec4(col,1.0);
}`
export class Atmosphere {
  sky: THREE.Mesh; hemi: THREE.HemisphereLight; dir: THREE.DirectionalLight; ground: THREE.Mesh
  night = 0
  backdrop: SkylineBackdrop
  private u = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uSunH: { value: 0 }, uStars: { value: 0 }, uTime: { value: 0 } }
  private ca = new THREE.Color(); private cb = new THREE.Color()
  constructor(public scene: THREE.Scene) {
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: this.u, side: THREE.BackSide, depthWrite: false, fog: false }))
    this.sky.renderOrder = -10; this.sky.frustumCulled = false
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1)
    this.dir = new THREE.DirectionalLight(0xffffff, 1); this.dir.position.set(-0.5, 0.7, -0.6)
    // infinite-looking floor: huge, far BELOW the bent road (so the road can never sink under it) and exactly the fog colour
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ color: 0x888888, fog: false }))
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -150
    scene.fog = new THREE.Fog(0xffffff, FOG_NEAR, FOG_FAR)
    this.backdrop = new SkylineBackdrop(scene)
    scene.add(this.sky, this.hemi, this.dir, this.dir.target, this.ground)
  }
  private mix(a: string, b: string, f: number, out: THREE.Color) { return out.set(a).lerp(this.cb.set(b), f) }
  update(dist: number, time: number, camPos: THREE.Vector3, winMats: THREE.MeshLambertMaterial[]) {
    const t = ((dist % (DISTRICT_LEN * 3)) / (DISTRICT_LEN * 3)) % 1
    let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++
    const a = KEYS[i], b = KEYS[i + 1], f = (t - a.t) / (b.t - a.t), sf = f * f * (3 - 2 * f)
    const L = (x: number, y: number) => x + (y - x) * sf
    this.mix(a.top, b.top, sf, this.u.uTop.value); this.mix(a.hor, b.hor, sf, this.u.uHor.value); this.mix(a.sun, b.sun, sf, this.u.uSun.value)
    this.u.uSunH.value = L(a.sunH, b.sunH); this.u.uStars.value = L(a.stars, b.stars); this.u.uTime.value = time
    this.mix(a.hemiS, b.hemiS, sf, this.hemi.color); this.mix(a.hemiG, b.hemiG, sf, this.hemi.groundColor); this.hemi.intensity = L(a.hemiI, b.hemiI)
    this.mix(a.dir, b.dir, sf, this.dir.color); this.dir.intensity = L(a.dirI, b.dirI)
    this.night = L(a.win, b.win)
    const fog = this.scene.fog as THREE.Fog; fog.color.copy(this.u.uHor.value)
    ;(this.ground.material as THREE.MeshBasicMaterial).color.copy(fog.color)
    for (const m of winMats) m.emissiveIntensity = this.night * 1.15
    const sk = a.sk.map((v, n) => v + (b.sk[n] - v) * sf) as [number, number, number]
    this.backdrop.update(sk, fog.color, camPos, Math.sin(dist / 520) * 0.1, time)
    this.sky.position.copy(camPos); this.ground.position.x = camPos.x; this.ground.position.z = camPos.z
  }
}

/* ---------------- instanced scenery ---------------- */
interface VariantDef { geo: THREE.BufferGeometry; mat: THREE.Material; cap: number; ext?: number; also?: string }
interface Item { v: string; x: number; y: number; d: number; ry: number; sx: number; sy: number; sz: number; tint: number; drift: number }
interface Chunk { idx: number; district: number; items: Item[]; ground: THREE.Mesh; t0: number }

const G = { gold: 0xf3b83a, cream: 0xf1e4c8, brick: 0xb5533c, green: 0x5f9f48, dkgreen: 0x3f7f3a, trunk: 0x7a4b2e, peach: 0xff8f6b, steel: 0x9fb3c8 }
const TINTS = [0xfff1e0, 0xffd9b8, 0xd8f0ee, 0xffcfc4, 0xe6e0f5, 0xf5e6b8, 0xcfe3f2]

function towerGeo(kind: number, w: number, h: number, d: number) {
  const b = new GeoBuilder(), off = (kind * 0.25) % 1
  b.box(w, h, d, 0, 0, 0, 0xffffff, { win: true, off })
  if (kind === 0) { b.box(w * 0.7, 3, d * 0.7, 0, h, 0, 0xffffff, { win: true }); b.cyl(0.15, 0.25, 12, 0, h + 3, 0, 0xdddddd, 5) }
  if (kind === 1) { b.box(w * 0.75, h * 0.18, d * 0.75, 0, h, 0, 0xffffff, { win: true, off }); b.box(w * 0.45, h * 0.12, d * 0.45, 0, h * 1.18, 0, 0xffe9b0, { win: true }); b.cone(w * 0.25, h * 0.2, 0, h * 1.3, 0, G.gold, 4, Math.PI / 4) }
  if (kind === 2) { b.wedge(w, h * 0.16, d, 0, h, 0, 0xffffff); b.box(w, 1.4, d * 0.2, 0, h + h * 0.16, -d * 0.4, 0xffffff) }
  if (kind === 3) { b.cone(w * 0.72, h * 0.22, 0, h, 0, 0xfff1e0, 4, Math.PI / 4); b.box(w * 0.2, h * 0.08, d * 0.2, 0, h + h * 0.22, 0, G.gold) }
  return b.build()
}
function spireGeo() {
  const b = new GeoBuilder()
  b.box(15, 100, 15, 0, 0, 0, 0xbcc9d6, { win: true })
  b.box(11, 26, 11, 0, 100, 0, 0xbcc9d6, { win: true })
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.box(1.2, 126, 1.2, sx * 7.5, 0, sz * 7.5, G.gold)
  // gold lattice on the crown
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2
    for (let i = 0; i < 4; i++) {
      const a = Math.sin(ry), c = Math.cos(ry), y = 102 + i * 6
      b.box(0.5, 6, 0.5, a * 5.8 + c * 3, y, c * 5.8 - a * 3, G.gold)
      b.box(8.5, 0.5, 0.5, a * 5.8, y, c * 5.8, G.gold, { ry })
    }
  }
  b.box(7, 3, 7, 0, 126, 0, G.gold); b.cone(4.2, 34, 0, 129, 0, G.gold, 4, Math.PI / 4); b.cone(1, 14, 0, 160, 0, G.gold, 4)
  return b.build()
}
function capitolGeo() {
  const b = new GeoBuilder()
  b.box(30, 8, 15, 0, 0, 0, G.cream); b.box(34, 2, 17, 0, 8, 0, 0xe8d6b2)
  b.box(14, 9, 15, 0, 10, 0, G.cream)
  for (let i = 0; i < 6; i++) b.cyl(0.55, 0.65, 8, -6.2 + i * 2.5, 0, 8.6, 0xfff6e2, 8)
  b.box(16, 1.2, 3, 0, 8, 8.4, G.cream); b.wedge(16, 2.4, 3.2, 0, 9.2, 8.4, G.cream)
  b.cyl(5.6, 6.2, 5, 0, 19, 0, G.cream, 12)
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.cyl(0.35, 0.35, 5, Math.cos(a) * 5.5, 19, Math.sin(a) * 5.5, 0xfff6e2, 5) }
  b.ball(6.2, 0, 24, 0, G.gold, 1, 0.95, 1, 2)
  b.cyl(1.1, 1.4, 4, 0, 29, 0, 0xfff1b0, 8); b.cone(1.3, 3.5, 0, 33, 0, G.gold, 8); b.ball(0.8, 0, 37.2, 0, G.gold)
  return b.build()
}
function foxGeo() {
  const b = new GeoBuilder(), glow = new GeoBuilder()
  b.box(18, 14, 15, 0, 0, 0, 0xe5b97a); b.box(18.4, 1.2, 15.4, 0, 14, 0, 0xb5533c)
  for (const s of [-1, 1]) {
    b.cyl(1.5, 1.9, 24, s * 7, 0, 3, 0xe5b97a, 8); b.cyl(1.7, 1.7, 1, s * 7, 24, 3, 0xb5533c, 8)
    b.ball(2.2, s * 7, 27, 3, G.gold, 1, 1.4, 1, 2); b.cone(0.3, 3, s * 7, 29.5, 3, G.gold, 4)
    for (let i = 0; i < 4; i++) b.box(0.5, 20, 0.5, s * 7 + 1.55, 1, 3, 0xb5533c).box(1.7, 1, 0.3, s * 7, 4 + i * 5, 4.8, 0xb5533c)
  }
  b.box(11, 0.7, 4, 0, 6.4, 8.8, 0xb5533c); b.box(0.6, 6.4, 0.6, -5, 0, 10, 0x6b4a3a); b.box(0.6, 6.4, 0.6, 5, 0, 10, 0x6b4a3a)
  b.box(2.2, 16, 0.8, -8.4, 4, 8.6, 0xe63946); b.box(1.4, 15, 0.9, -8.4, 4.4, 8.7, 0xfff1d6)
  for (let i = 0; i < 12; i++) { glow.ball(0.24, -8.4, 5 + i * 1.2, 9.3, i % 2 ? 0xffe066 : 0xff8f6b, 1, 1, 1, 0) }
  for (let i = 0; i < 9; i++) glow.ball(0.25, -5 + i * 1.25, 6.2, 10.9, 0xffe066, 1, 1, 1, 0)
  glow.box(9, 0.9, 0.3, 0, 8.2, 8.9, 0xff5e5b); glow.box(9, 0.5, 0.3, 0, 9.4, 8.9, 0xffd166)
  return [b.build(), glow.build()] as const
}
function warehouseGeo() {
  const b = new GeoBuilder(), glow = new GeoBuilder()
  b.box(15, 17, 40, 0, 0, 0, G.brick, { win: true }); b.box(15.6, 1.2, 40.6, 0, 17, 0, 0x8a3e2e)
  b.box(9, 36, 9, 0, 0, -12, 0xa84a35, { win: true }); b.box(10, 1.5, 10, 0, 36, -12, 0x8a3e2e); b.cone(6, 6, 0, 37.5, -12, 0x4f7a6a, 4, Math.PI / 4)
  b.cyl(2.2, 2.2, 3.5, 4, 18.2, 12, G.trunk, 8); b.cone(2.5, 1.8, 4, 21.7, 12, 0x6b4a3a, 8)
  glow.cyl(2.4, 2.4, 0.4, 0, 28, -7.4, 0xfff1b0, 12, [Math.PI / 2, 0, 0])
  for (let i = 0; i < 5; i++) glow.box(1.6, 3, 0.4, -5 + i * 2.5, 18.6, 18, [0xff5e5b, 0xffd166, 0x2ec4b6, 0xff8f6b, 0xfff1d6][i])
  return [b.build(), glow.build()] as const
}
const loftGeo = () => new GeoBuilder().box(13, 11, 20, 0, 0, 0, 0xc2603f, { win: true }).box(13.6, 0.9, 20.6, 0, 11, 0, 0x8a3e2e).box(4, 3, 5, 3, 11.9, 3, 0x6b6b72).build()
function lampGeo() {
  const b = new GeoBuilder(), g = new GeoBuilder()
  b.cyl(0.1, 0.16, 5.6, 0, 0, 0, 0x4a3f55, 6); b.box(1.5, 0.12, 0.12, 0.7, 5.5, 0, 0x4a3f55)
  g.ball(0.34, 1.45, 5.35, 0, 0xfff0b8, 1, 0.7, 1, 1)
  return [b.build(), g.build()] as const
}
function treeGeo() {
  const b = new GeoBuilder()
  b.cyl(0.18, 0.28, 2.6, 0, 0, 0, G.trunk, 6)
  b.ball(1.7, 0, 3.6, 0, G.green, 1, 0.9, 1); b.ball(1.2, 1.1, 3.1, 0.4, 0x7ab552); b.ball(1.2, -0.9, 3.0, -0.5, 0x4f8f3d)
  return b.build()
}
function peachTreeGeo() {
  const b = new GeoBuilder()
  b.cyl(0.15, 0.26, 1.7, 0, 0, 0, G.trunk, 6)
  b.ball(1.5, 0, 2.5, 0, 0x6fb04a, 1, 0.85, 1); b.ball(1.05, 1, 2.2, 0.4, 0x82c35a); b.ball(1.0, -0.9, 2.1, -0.4, 0x5aa03e)
  const dots: [number, number, number][] = [[0.9, 2.4, 1.1], [-1, 2.8, 0.9], [0.2, 3.2, -1.1], [1.5, 2.1, -0.4], [-0.5, 1.8, 1.3], [-1.4, 2.2, -0.6], [0.6, 3.0, 1.0]]
  dots.forEach(([x, y, z], i) => b.ball(0.26, x, y, z, i % 2 ? 0xff8f6b : 0xffb08c, 1, 1, 1, 1))
  return b.build()
}
function kudzuPoleGeo() {
  const b = new GeoBuilder(); b.cyl(0.16, 0.22, 7.5, 0, 0, 0, 0x6b5a50, 6)
  for (let i = 0; i < 6; i++) b.ball(0.9 - i * 0.07, Math.sin(i * 2) * 0.35, 0.8 + i * 1.05, Math.cos(i * 2) * 0.3, i % 2 ? 0x3f7f3a : 0x558f43, 1, 1.2, 1)
  b.ball(1.1, 0.7, 7.2, 0, 0x4a8a3c, 1.6, 0.7, 1); b.ball(0.5, 1.6, 6.2, 0.2, 0x3f7f3a, 1, 1.5, 1)
  return b.build()
}
function kudzuMoundGeo() {
  const b = new GeoBuilder()
  for (let i = 0; i < 9; i++) { const a = i * 2.4; b.ball(1.6 + (i % 3) * 0.4, Math.cos(a) * 2.2, 1.2 + (i % 4) * 0.5, Math.sin(a) * 2.2, i % 2 ? 0x3f7f3a : 0x5a9a46, 1, 0.9, 1) }
  b.ball(2.6, 0, 2.2, 0, 0x4a8a3c)
  return b.build()
}
const hillGeo = () => new GeoBuilder().ball(1, 0, 0, 0, 0x86bd5c, 1, 1, 1, 2).build()
const clayGeo = () => new GeoBuilder().ball(1, 0, 0, 0, 0xb85a3a, 1.4, 0.6, 1, 1).build()
function strPoleGeo() { return new GeoBuilder().cyl(0.09, 0.13, 5.6, 0, 0, 0, 0x4a3f55, 6).build() }
function strWireGeo() {
  const g = new GeoBuilder()
  for (let i = 0; i < 9; i++) { const u = i / 8, z = u * 13, y = 5.4 - Math.sin(u * Math.PI) * 0.7; g.ball(0.17, 0, y, z, [0xffe066, 0xffb347, 0xfff1d6][i % 3], 1, 1, 1, 0); if (i) g.box(0.03, 0.03, 1.7, 0, y + 0.1, z - 0.8, 0x302030) }
  return g.build()
}
function crossGeo() {
  const g = new GeoBuilder()
  for (let i = 0; i < 15; i++) { const u = i / 14, x = -6.4 + u * 12.8, y = 8.2 - Math.sin(u * Math.PI) * 1.2; g.ball(0.2, x, y, 0, [0xffe066, 0xff8f6b, 0xfff1d6][i % 3], 1, 1, 1, 0); if (i) g.box(0.9, 0.03, 0.03, x - 0.45, y + 0.1, 0, 0x302030) }
  return g.build()
}
const crossPoleGeo = () => new GeoBuilder().cyl(0.12, 0.16, 8.4, 0, 0, 0, 0x4a3f55, 6).build()
const wallGeo = () => new GeoBuilder().box(1, 1, 1, 0, 0, 0, 0xffffff).build()
function muralPlane() { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0); return g }
function railGeo() {
  const b = new GeoBuilder(); b.box(5.6, 0.9, 40, 0, 7.6, 0, 0xd9cdb8); b.box(0.3, 0.8, 40, -2.6, 8.5, 0, 0xb8a98f); b.box(0.3, 0.8, 40, 2.6, 8.5, 0, 0xb8a98f)
  for (const z of [-15, 0, 15]) b.box(1.6, 7.6, 1.6, 0, 0, z, 0xcbbfa8)
  return b.build()
}
function railcarGeo() {
  const b = new GeoBuilder(), g = new GeoBuilder()
  b.box(3, 3, 14, 0, 0, 0, 0x2ec4b6); b.box(3.05, 0.5, 14.05, 0, 1.0, 0, 0xfff1d6); b.box(3.05, 0.4, 14.05, 0, 0.1, 0, 0xff8f6b); b.box(2.4, 0.3, 12, 0, 3, 0, 0xdadada)
  for (let i = 0; i < 5; i++) { g.box(3.1, 0.9, 1.7, 0, 1.6, -5.6 + i * 2.8, 0xfff0c0) }
  return [b.build(), g.build()] as const
}
function fountainGeo() {
  const b = new GeoBuilder(), g = new GeoBuilder()
  b.cyl(5.4, 5.8, 1.3, 0, 0, 0, 0xe9dcc4, 14); b.cyl(4.7, 4.7, 0.2, 0, 1.2, 0, 0x4fc3d0, 14); b.cyl(0.8, 1.2, 2.2, 0, 1.2, 0, 0xe9dcc4, 8)
  g.cone(0.6, 5, 0, 3, 0, 0xcff6ff, 6); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; g.cone(0.25, 2.2, Math.cos(a) * 3.2, 1.4, Math.sin(a) * 3.2, 0xcff6ff, 5) }
  return [b.build(), g.build()] as const
}

export interface FerrisRig { group: THREE.Group; wheel: THREE.Group; cabins: THREE.Object3D[] }
function buildFerris(mats: { prop: THREE.Material; glow: THREE.Material }): FerrisRig {
  const R = 16, H = 19, group = new THREE.Group(), wheel = new THREE.Group()
  const base = new GeoBuilder()
  for (const s of [-1, 1]) { base.box(0.9, 21, 0.9, s * 5, 0, 0, 0xf1e4c8, { rz: -s * 0.22 }); base.box(0.9, 21, 0.9, s * 5, 0, 0, 0xf1e4c8, { rz: -s * 0.22 }) }
   base.cyl(1.2, 1.2, 2.2, 0, H, 0, 0xff8f6b, 10, [Math.PI / 2, 0, 0]); base.box(9, 0.6, 6, 0, 0, 0, 0xcbbfa8)
  const bm = new THREE.Mesh(base.build(), mats.prop); bm.position.y = 0
  const rim = new GeoBuilder(); rim.torus(R, 0.28, 0, H, 0.5, 0xfff1d6, Math.PI * 2, [0, 0, 0], 40); rim.torus(R, 0.28, 0, H, -0.5, 0xfff1d6, Math.PI * 2, [0, 0, 0], 40)
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; rim.box(0.18, R, 0.18, Math.cos(a) * R / 2, H + Math.sin(a) * R / 2 - R / 2, 0.5, 0xe8d6b2, { rz: a - Math.PI / 2 }) }
  const rm = new THREE.Mesh(rim.build(), mats.prop)
  const lights = new GeoBuilder()
  for (let i = 0; i < 36; i++) { const a = (i / 36) * 6.283; lights.ball(0.22, Math.cos(a) * R, H + Math.sin(a) * R, 0.9, [0xffe066, 0xff8f6b, 0x6fe0d0][i % 3], 1, 1, 1, 0) }
  const lm = new THREE.Mesh(lights.build(), mats.glow)
  wheel.add(rm, lm)
  const cabins: THREE.Object3D[] = []
  const cg = new GeoBuilder(); cg.box(1.8, 0.2, 1.6, 0, -2.1, 0, 0x3a2a4d); cg.box(1.8, 1.5, 1.6, 0, -2.0, 0, 0xffffff); cg.cone(1.3, 0.9, 0, -0.5, 0, 0xffffff, 4, Math.PI / 4); cg.cyl(0.03, 0.03, 1.6, 0, -1.6, 0, 0x555555, 4)
  const cgeo = cg.build()
  const cols = [0xff6b6b, 0xffd166, 0x2ec4b6, 0xff9f68, 0xf1e4c8, 0xff8fb3]
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283, m = new THREE.Mesh(cgeo, new THREE.MeshLambertMaterial({ vertexColors: true, color: cols[i % 6] }))
    bend(m.material as THREE.Material)
    m.position.set(Math.cos(a) * R, H + Math.sin(a) * R, 0.2); cabins.push(m); wheel.add(m)
  }
  group.add(bm, wheel)
  group.traverse(o => { (o as THREE.Mesh).frustumCulled = false })
  return { group, wheel, cabins }
}

/** 700 m wide so the lot colour runs out past the fog on both sides; UVs keep the road texture on the central 110 m. */
function wideGround() {
  const g = new THREE.PlaneGeometry(700, CHUNK, 1, 1), uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setX(i, (pos.getX(i) + 55) / 110)
  return g
}

export class World {
  scene: THREE.Scene
  variants = new Map<string, { def: VariantDef; mesh: THREE.InstancedMesh; n: number }>()
  chunks = new Map<number, Chunk>()
  winMats: THREE.MeshLambertMaterial[] = []
  groundMats: Record<GroundKind, THREE.MeshLambertMaterial>
  groundGeo = wideGround()
  ferris: FerrisRig
  ferrisActive = false
  private m4 = new THREE.Matrix4(); private col = new THREE.Color()
  private tmpColor = new Float32Array(3)

  constructor(scene: THREE.Scene, public lowQuality = false) {
    this.scene = scene
    const wt = windowTextures(false), bt = windowTextures(true)
    const glassMat = bend(new THREE.MeshLambertMaterial({ vertexColors: true, map: wt.map, emissive: 0xffffff, emissiveMap: wt.emissive, emissiveIntensity: 0 }))
    const brickMat = bend(new THREE.MeshLambertMaterial({ vertexColors: true, map: bt.map, emissive: 0xffffff, emissiveMap: bt.emissive, emissiveIntensity: 0 }))
    this.winMats = [glassMat, brickMat]
    const prop = bend(new THREE.MeshLambertMaterial({ vertexColors: true }))
    const glow = bend(new THREE.MeshBasicMaterial({ vertexColors: true }))
    this.groundMats = {
      asphalt: bend(new THREE.MeshLambertMaterial({ map: groundTexture('asphalt') })),
      concrete: bend(new THREE.MeshLambertMaterial({ map: groundTexture('concrete') })),
      clay: bend(new THREE.MeshLambertMaterial({ map: groundTexture('clay') })),
    }
    const add = (k: string, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, ext = 14, also?: string) => {
      cap = Math.ceil(cap * CAPX)
      const def: VariantDef = { geo, mat, cap, ext, also }
      const mesh = new THREE.InstancedMesh(geo, mat, cap)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3)
      mesh.frustumCulled = false; mesh.count = 0
      scene.add(mesh); this.variants.set(k, { def, mesh, n: 0 })
    }
    const sizes: [number, number, number][] = [[9, 34, 9], [11, 50, 10], [12, 62, 11], [10, 78, 10]]
    sizes.forEach(([w, h, d], i) => add('tower' + i, towerGeo(i, w, h, d), glassMat, 70, 8))
    add('spire', spireGeo(), glassMat, 2, 14); add('capitol', capitolGeo(), prop, 2, 20)
    const [fb, fg] = foxGeo(); add('fox', fb, prop, 2, 16, 'foxGlow'); add('foxGlow', fg, glow, 2)
    const [wb, wg] = warehouseGeo(); add('warehouse', wb, brickMat, 3, 24, 'warehouseGlow'); add('warehouseGlow', wg, glow, 3)
    add('loft', loftGeo(), brickMat, 12, 14)
    const [lb, lg] = lampGeo(); add('lamp', lb, prop, 40, 3, 'lampGlow'); add('lampGlow', lg, glow, 40)
    add('tree', treeGeo(), prop, 60, 4); add('peachTree', peachTreeGeo(), prop, 140, 4)
    add('kudzuPole', kudzuPoleGeo(), prop, 30, 3); add('kudzuMound', kudzuMoundGeo(), prop, 20, 6)
    add('hill', hillGeo(), prop, 14, 50); add('clay', clayGeo(), prop, 16, 8)
    add('strPole', strPoleGeo(), prop, 80, 2); add('strWire', strWireGeo(), glow, 60, 8)
    add('cross', crossGeo(), glow, 10, 2); add('crossPole', crossPoleGeo(), prop, 20, 2)
    add('wall', wallGeo(), prop, 16, 10)
    for (let i = 0; i < 4; i++) add('mural' + i, muralPlane(), bend(new THREE.MeshLambertMaterial({ map: muralTexture(i) })), 8, 10)
    add('rail', railGeo(), prop, 8, 22)
    const [rb, rg] = railcarGeo(); add('railcar', rb, prop, 10, 8, 'railcarGlow'); add('railcarGlow', rg, glow, 10)
    const [fob, fog] = fountainGeo(); add('fountain', fob, prop, 2, 7, 'fountainGlow'); add('fountainGlow', fog, glow, 2)
    this.ferris = buildFerris({ prop, glow })
    this.ferris.group.visible = false; scene.add(this.ferris.group)
  }

  reset() { for (const c of this.chunks.values()) c.ground.parent?.remove(c.ground); this.chunks.clear() }
  /** Build every chunk out to the far limit before the first frame so nothing streams in on screen. */
  warm(dist: number, time: number) {
    const first = Math.max(0, Math.floor((dist - 50) / CHUNK)), last = Math.floor((dist + FAR + 30) / CHUNK)
    for (let i = first; i <= last; i++) if (!this.chunks.has(i)) this.chunks.set(i, this.gen(i, time))
  }

  private gen(idx: number, time: number): Chunk {
    const district = Math.floor(idx / DISTRICT_CHUNKS) % 3, k = idx % DISTRICT_CHUNKS, z0 = idx * CHUNK
    const r = mulberry32(idx * 7919 + 13), items: Item[] = []
    const put = (v: string, x: number, zz: number, o: Partial<Item> = {}) => items.push({ v, x, y: 0, d: z0 + zz, ry: 0, sx: 1, sy: 1, sz: 1, tint: 0xffffff, drift: 0, ...o })
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
    const skyline = (n: number, lo: number, hi: number, vars: string[]) => { for (const s of [-1, 1]) for (let i = 0; i < n; i++) { const sc = 1.5 + r() * 1.7; put(pick(vars), s * (lo + r() * (hi - lo)), r() * CHUNK, { sx: sc, sy: sc * (0.9 + r() * 0.6), sz: sc, tint: pick(TINTS) }) } }
    const towers = ['tower0', 'tower1', 'tower2', 'tower3']
    if (district === 0) {
      for (const s of [-1, 1]) {
        put('lamp', s * 5.6, 10, { ry: s > 0 ? Math.PI : 0 }); put('lamp', s * 5.6, 30, { ry: s > 0 ? Math.PI : 0 })
        put('tree', s * 7.4, 22 + r() * 6, { sx: 0.9 + r() * 0.3, sy: 0.9 + r() * 0.3 })
        const big = (k === 3 && s > 0) || (k === 8 && s < 0) || (k === 12 && s > 0)
        if (!big) for (let slot = 0; slot < 2; slot++) put(pick(towers), s * (19 + r() * 10), slot * 20 + 4 + r() * 10, { tint: pick(TINTS), ry: r() < 0.5 ? 0 : Math.PI, sy: 0.75 + r() * 0.4 })
      }
      skyline(2, 42, 95, towers)
      if (r() < 0.4) put('spire', (r() < 0.5 ? -1 : 1) * (60 + r() * 30), r() * CHUNK, { sx: 0.85, sy: 0.85, sz: 0.85 })
      if (k === 3) put('spire', 27, 20, { sx: 0.7, sy: 0.7, sz: 0.7 })
      if (k === 8) put('capitol', -27, 20, { ry: Math.PI / 2 })
      if (k === 12) put('fox', 17.5, 20, { ry: -Math.PI / 2 })
      put('rail', -17, 20); if (k % 4 === 1) for (let i = 0; i < 3; i++) put('railcar', -17, 36 - i * 14.8, { y: 8.05, drift: 16 })
    } else if (district === 1) {
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) { put('strPole', s * 5.5, i * 13.3); put('strWire', s * 5.5, i * 13.3) }
        if (r() < 0.55) put('kudzuPole', s * 6.6, 6 + r() * 26)
        put('tree', s * 7.4, 2 + r() * 36, { sx: 1, sy: 1 })
        const mural = k % 3 !== 2
        if (mural) { put('wall', s * 10, 20, { sx: 0.8, sy: 6.2, sz: 20 }); put('mural' + ((k + (s > 0 ? 1 : 0)) % 4), s * 9.55, 20, { ry: s < 0 ? Math.PI / 2 : -Math.PI / 2, sx: 20, sy: 6 }) }
        if (k === 4 && s < 0) put('warehouse', -24, 20, { ry: Math.PI / 2 })
        else if (k === 10 && s > 0) put('warehouse', 24, 20, { ry: -Math.PI / 2 })
        else { put('loft', s * (21 + r() * 4), 10 + r() * 6, { ry: s < 0 ? Math.PI / 2 : -Math.PI / 2 }); put('loft', s * (20 + r() * 4), 32, { ry: s < 0 ? Math.PI / 2 : -Math.PI / 2, tint: 0xffe0d0 }) }
        put(pick(towers), s * (44 + r() * 40), r() * CHUNK, { sx: 1.8, sy: 1.8, sz: 1.8, tint: pick(TINTS) })
      }
      put('cross', 0, 20); put('crossPole', -6.4, 20); put('crossPole', 6.4, 20)
      skyline(1, 80, 120, towers)
    } else {
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) put('peachTree', s * (7.4 + (i % 2) * 0.6), 4 + i * 8, { ry: r() * 6, sx: 1.05, sy: 1.05, sz: 1.05 })
        for (let i = 0; i < 4; i++) { put('peachTree', s * (13 + (k % 2) * 1.5), 2 + i * 10 + (s > 0 ? 3 : 0), { ry: r() * 6 }); if (k % 2) put('peachTree', s * 19, 6 + i * 10, { ry: r() * 6 }) }
        if (r() < 0.6) put('kudzuMound', s * (11 + r() * 3), r() * CHUNK, { sx: 1 + r() * 0.5, sy: 1 + r() * 0.4, sz: 1 + r() * 0.5 })
        if (r() < 0.5) put('kudzuPole', s * 6.3, r() * CHUNK)
        if (r() < 0.5) put('clay', s * 10.5, r() * CHUNK, { sx: 3 + r() * 3, sy: 1.5, sz: 3 + r() * 3, ry: r() * 3 })
        put('lamp', s * 5.6, 20, { ry: s > 0 ? Math.PI : 0 })
        const hs = 28 + r() * 22; put('hill', s * (55 + r() * 40), r() * CHUNK, { sx: hs, sy: 7 + r() * 9, sz: hs, y: -2 })
      }
      skyline(2, 70, 115, towers)
      if (k === 5) put('ferris', 32, 20)
      if (k === 9) put('fountain', -14, 20)
      if (k === 13) put('spire', 62, 20, { sx: 1.1, sy: 1.1, sz: 1.1 })
    }
    const ground = new THREE.Mesh(this.groundGeo, this.groundMats[DISTRICTS[district].ground])
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 0); ground.frustumCulled = false
    this.scene.add(ground)
    return { idx, district, items, ground, t0: time }
  }

  /** dist = player's track distance; time seconds; returns nothing, mutates scene. */
  update(dist: number, time: number) {
    const first = Math.max(0, Math.floor((dist - 50) / CHUNK)), last = Math.floor((dist + FAR + 30) / CHUNK)
    for (const [i, c] of this.chunks) if (i < first) { this.scene.remove(c.ground); this.chunks.delete(i) }
    let made = 0
    for (let i = first; i <= last; i++) if (!this.chunks.has(i) && (made++ < 5 || i < first + 3)) this.chunks.set(i, this.gen(i, time))
    for (const v of this.variants.values()) v.n = 0
    let ferrisItem: Item | null = null
    const farLim = this.lowQuality ? FOG_FAR - 30 : FAR
    ;(this.scene.fog as THREE.Fog).far = this.lowQuality ? FOG_FAR - 70 : FOG_FAR
    bendU.uFade.value.set(farLim - 62, farLim - 6)
    for (const c of this.chunks.values()) {
      c.ground.position.z = dist - (c.idx * CHUNK + CHUNK / 2)
      for (const it of c.items) {
        const rel = dist - it.d + it.drift * (time - c.t0)
        if (it.v === 'ferris') { if (rel > -farLim - 30 && rel < 40) ferrisItem = it; continue }
        const v = this.variants.get(it.v)!, ext = v.def.ext ?? 10
        const z = rel
        if (z - ext > 14 || z + ext < -farLim) continue
        this.write(v, it, z)
        if (v.def.also) { const a = this.variants.get(v.def.also)!; this.write(a, it, z) }
      }
    }
    for (const v of this.variants.values()) {
      v.mesh.count = v.n; v.mesh.instanceMatrix.needsUpdate = true
      if (v.n) v.mesh.instanceColor!.needsUpdate = true
    }
    const f = this.ferris
    f.group.visible = !!ferrisItem
    if (ferrisItem) {
      f.group.position.set(ferrisItem.x, 0, dist - ferrisItem.d); f.group.rotation.y = -0.9
      f.wheel.rotation.z = -time * 0.18
      for (const c of f.cabins) c.rotation.z = time * 0.18
    }
  }
  private write(v: { def: VariantDef; mesh: THREE.InstancedMesh; n: number }, it: Item, z: number) {
    if (v.n >= v.def.cap) return
    const s = Math.sin(it.ry), c = Math.cos(it.ry)
    const zz = z
    const p = v.mesh.instanceMatrix.array as Float32Array, o = v.n * 16
    p[o] = c * it.sx; p[o + 1] = 0; p[o + 2] = -s * it.sx; p[o + 3] = 0
    p[o + 4] = 0; p[o + 5] = it.sy; p[o + 6] = 0; p[o + 7] = 0
    p[o + 8] = s * it.sz; p[o + 9] = 0; p[o + 10] = c * it.sz; p[o + 11] = 0
    p[o + 12] = it.x; p[o + 13] = it.y; p[o + 14] = zz; p[o + 15] = 1
    const ca = v.mesh.instanceColor!.array as Float32Array, i3 = v.n * 3
    this.col.setHex(it.tint); ca[i3] = this.col.r; ca[i3 + 1] = this.col.g; ca[i3 + 2] = this.col.b
    v.n++
  }
}
