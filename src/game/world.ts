import * as THREE from 'three'
import { GeoBuilder, bend, bendU, groundTexture, type GroundKind } from './gfx'
import { BUILDING_ATLAS } from './buildingAtlas'
import { mulberry32 } from '../core/rng'
import { SkylineBackdrop } from './skyline'

export const CHUNK = 40
export const DISTRICT_CHUNKS = 16
export const DISTRICT_LEN = CHUNK * DISTRICT_CHUNKS
export const DISTRICTS = [
  { id: 'downtown', name: 'DOWNTOWN', sub: 'Gold spire. Gold dome. Neon hour.', ground: 'asphalt' as GroundKind },
  { id: 'beltline', name: 'THE BELTLINE', sub: 'Murals, brick and string lights.', ground: 'concrete' as GroundKind },
  { id: 'park', name: 'PEACH PARK', sub: 'Ferris wheel. Orchard. Red clay.', ground: 'clay' as GroundKind },
]
export const districtAt = (dist: number) => Math.floor(dist / DISTRICT_LEN) % 3
/** Streaming + draw distance. Everything is built past FOG_FAR so it only ever fades IN from fog, never pops. */
export const FOG_NEAR = 70
export const FOG_FAR = 300
const FAR = 400
const CAPX = 1.9

/* ---------------- atmosphere: neon dusk -> night -> dusk, keyed to the wallpapers ---------------- */
interface Key { t: number; top: string; hor: string; sun: string; sunH: number; hemiS: string; hemiG: string; hemiI: number; dir: string; dirI: number; win: number; stars: number; sk: [number, number, number] }
const DUSK = { top: '#1c0d63', hor: '#3b1b73', sun: '#000000', sunH: -0.4, hemiS: '#ffc4ec', hemiG: '#7d5aa8', hemiI: 1.05, dir: '#ffb490', dirI: 1.25, win: 0.65, stars: 0.15, sk: [0, 1, 0] as [number, number, number] }
const NIGHT = { top: '#0a0736', hor: '#120f40', sun: '#000000', sunH: -0.4, hemiS: '#a8b6ff', hemiG: '#5f4f9c', hemiI: 0.85, dir: '#b8c4ff', dirI: 0.7, win: 1, stars: 1, sk: [0, 0, 1] as [number, number, number] }
const KEYS: Key[] = [{ t: 0, ...DUSK }, { t: 0.3, ...DUSK }, { t: 0.46, ...NIGHT }, { t: 0.76, ...NIGHT }, { t: 0.92, ...DUSK }, { t: 1, ...DUSK }]
const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`
const SKY_FS = `varying vec3 vDir; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform float uSunH; uniform float uStars; uniform float uTime;
float h3(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir); float h = clamp(d.y,0.0,1.0);
  vec3 col = mix(uHor, uTop, pow(h,0.5));
  vec3 sd = normalize(vec3(0.0, uSunH, -1.0)); float s = max(dot(d,sd),0.0);
  float hz = 0.3 + 0.7*smoothstep(0.0, 0.22, d.y);   // keep the wide glow off the horizon so the fogged road meets it without an edge
  col += uSun*(pow(s,900.0)*2.0*hz + (pow(s,60.0)*0.5 + pow(s,7.0)*0.28)*hz*hz);
  vec3 g = floor(d*130.0); float r = h3(g);
  float st = step(0.9965, r) * smoothstep(0.08,0.4,d.y) * uStars * (0.6+0.4*sin(uTime*3.0+r*90.0));
  col += vec3(1.0,0.95,0.85)*st;
  gl_FragColor = vec4(col,1.0);
}`
export class Atmosphere {
  sky: THREE.Mesh; hemi: THREE.HemisphereLight; dir: THREE.DirectionalLight; ground: THREE.Mesh
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
  update(dist: number, time: number, camPos: THREE.Vector3, dt = 0.016) {
    const t = ((dist % (DISTRICT_LEN * 3)) / (DISTRICT_LEN * 3)) % 1
    let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++
    const a = KEYS[i], b = KEYS[i + 1], f = (t - a.t) / (b.t - a.t), sf = f * f * (3 - 2 * f)
    const L = (x: number, y: number) => x + (y - x) * sf
    this.mix(a.top, b.top, sf, this.u.uTop.value); this.mix(a.hor, b.hor, sf, this.u.uHor.value); this.mix(a.sun, b.sun, sf, this.u.uSun.value)
    this.u.uSunH.value = L(a.sunH, b.sunH); this.u.uStars.value = L(a.stars, b.stars); this.u.uTime.value = time
    this.mix(a.hemiS, b.hemiS, sf, this.hemi.color); this.mix(a.hemiG, b.hemiG, sf, this.hemi.groundColor); this.hemi.intensity = L(a.hemiI, b.hemiI)
    this.mix(a.dir, b.dir, sf, this.dir.color); this.dir.intensity = L(a.dirI, b.dirI)
    this.u.uHor.value.lerp(this.u.uSun.value, 0.1)
    const fog = this.scene.fog as THREE.Fog; fog.color.copy(this.u.uHor.value)
    ;(this.ground.material as THREE.MeshBasicMaterial).color.copy(fog.color)
    const sk = a.sk.map((v, n) => v + (b.sk[n] - v) * sf) as [number, number, number]
    this.backdrop.update(sk, fog.color, this.u.uTop.value, camPos, Math.sin(dist / 520) * 0.1, time, dt)
    this.sky.position.copy(camPos); this.ground.position.x = camPos.x; this.ground.position.z = camPos.z
  }
}

/* ---------------- instanced scenery ---------------- */
interface VariantDef { geo: THREE.BufferGeometry; mat: THREE.Material; cap: number; ext?: number; also?: string }
interface Item { v: string; x: number; y: number; d: number; ry: number; sx: number; sy: number; sz: number; tint: number; drift: number }
interface Chunk { idx: number; district: number; items: Item[]; ground: THREE.Mesh; t0: number }

const G = { gold: 0xf3b83a, cream: 0xf1e4c8, brick: 0xb5533c, green: 0x5f9f48, dkgreen: 0x3f7f3a, trunk: 0x7a4b2e, peach: 0xff8f6b, steel: 0x9fb3c8 }
const TINTS = [0xffffff, 0xf2eaff, 0xe6dcff, 0xffeaf6, 0xdfe6ff]

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
function lampGeo() {
  const b = new GeoBuilder(), g = new GeoBuilder()
  b.cyl(0.1, 0.16, 5.6, 0, 0, 0, 0x4a3f55, 6); b.box(1.5, 0.12, 0.12, 0.7, 5.5, 0, 0x4a3f55)
  g.ball(0.2, 1.45, 5.35, 0, 0xffa45c, 1, 0.7, 1, 1)
  return [b.build(), g.build()] as const
}
const hillGeo = () => new GeoBuilder().ball(1, 0, 0, 0, 0x2b5d6e, 1, 1, 1, 2).build()
function strPoleGeo() { return new GeoBuilder().cyl(0.09, 0.13, 5.6, 0, 0, 0, 0x4a3f55, 6).build() }
function strWireGeo() {
  const g = new GeoBuilder()
  for (let i = 0; i < 9; i++) { const u = i / 8, z = u * 13, y = 5.4 - Math.sin(u * Math.PI) * 0.7; g.ball(0.075, 0, y, z, [0xff5ec4, 0xffb347, 0x27e6ff][i % 3], 1, 1, 1, 0); if (i) g.box(0.03, 0.03, 1.7, 0, y + 0.1, z - 0.8, 0x302030) }
  return g.build()
}
function crossGeo() {
  const g = new GeoBuilder()
  for (let i = 0; i < 15; i++) { const u = i / 14, x = -6.4 + u * 12.8, y = 8.2 - Math.sin(u * Math.PI) * 1.2; g.ball(0.08, x, y, 0, [0xffe066, 0xff8f6b, 0xfff1d6][i % 3], 1, 1, 1, 0); if (i) g.box(0.9, 0.03, 0.03, x - 0.45, y + 0.1, 0, 0x302030) }
  return g.build()
}
const crossPoleGeo = () => new GeoBuilder().cyl(0.12, 0.16, 8.4, 0, 0, 0, 0x4a3f55, 6).build()
const wallGeo = () => new GeoBuilder().box(1, 1, 1, 0, 0, 0, 0xffffff).build()
function muralPlane() { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0); return g }
function railGeo() {
  const b = new GeoBuilder(); b.box(5.6, 0.9, 40, 0, 7.6, 0, 0x5d5688); b.box(0.3, 0.8, 40, -2.6, 8.5, 0, 0xff5ec4); b.box(0.3, 0.8, 40, 2.6, 8.5, 0, 0x27e6ff)
  for (const z of [-15, 0, 15]) b.box(1.6, 7.6, 1.6, 0, 0, z, 0x4b4576)
  return b.build()
}
function railcarGeo() {
  const b = new GeoBuilder(), g = new GeoBuilder()
  b.box(3, 3, 14, 0, 0, 0, 0xaebbd0); b.box(3.05, 0.2, 14.05, 0, 1.06, 0, 0x2f8fe6); b.box(3.05, 0.18, 14.05, 0, 0.88, 0, 0xffc22e); b.box(3.05, 0.18, 14.05, 0, 0.7, 0, 0xff7a1f); b.box(3.05, 0.3, 14.05, 0, 0.1, 0, 0x3a3f4a); b.box(2.4, 0.3, 12, 0, 3, 0, 0xe4e8ee)
  for (let i = 0; i < 5; i++) { g.box(3.1, 0.9, 1.7, 0, 1.6, -5.6 + i * 2.8, 0xfff0c0) }
  return [b.build(), g.build()] as const
}
function fountainGeo() {
  const b = new GeoBuilder(), g = new GeoBuilder()
  b.cyl(5.4, 5.8, 1.3, 0, 0, 0, 0xe9dcc4, 14); b.cyl(4.7, 4.7, 0.2, 0, 1.2, 0, 0x4fc3d0, 14); b.cyl(0.8, 1.2, 2.2, 0, 1.2, 0, 0xe9dcc4, 8)
  g.cone(0.6, 5, 0, 3, 0, 0xcff6ff, 6); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; g.cone(0.25, 2.2, Math.cos(a) * 3.2, 1.4, Math.sin(a) * 3.2, 0xcff6ff, 5) }
  return [b.build(), g.build()] as const
}

/** Inked capsule cabin, drawn to match the illustrated scenery. */
function gondolaTexture(color: string) {
  const c = document.createElement('canvas'); c.width = 250; c.height = 300
  const x = c.getContext('2d')!, ink = '#120a2c'
  x.lineJoin = 'round'; x.strokeStyle = ink; x.lineWidth = 12
  x.beginPath(); x.moveTo(125, 4); x.lineTo(125, 74); x.stroke()
  const g = x.createLinearGradient(0, 70, 0, 290); g.addColorStop(0, color); g.addColorStop(1, '#1e1250')
  x.fillStyle = g; x.beginPath(); x.roundRect(28, 68, 194, 218, 70); x.fill(); x.lineWidth = 11; x.stroke()
  x.fillStyle = '#17103f'; x.beginPath(); x.roundRect(52, 118, 146, 78, 24); x.fill(); x.lineWidth = 8; x.stroke()
  x.strokeStyle = color; x.lineWidth = 6; x.beginPath(); x.roundRect(62, 128, 126, 58, 16); x.stroke()
  x.strokeStyle = '#fff1d6'; x.lineWidth = 7; x.beginPath(); x.moveTo(52, 228); x.lineTo(198, 228); x.stroke()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
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
  const cardGeo = new THREE.PlaneGeometry(2.5, 3, 1, 1); cardGeo.translate(0, -1.5, 0)
  const cardMats = ['#ff4fbd', '#27d8ff', '#ffb02e', '#9a5cff'].map(c => bend(new THREE.MeshBasicMaterial({ map: gondolaTexture(c), alphaTest: 0.5, side: THREE.DoubleSide })))
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283, m = new THREE.Mesh(cardGeo, cardMats[i % 4])
    m.position.set(Math.cos(a) * R, H + Math.sin(a) * R, 0.2); cabins.push(m); wheel.add(m)
  }
  group.add(bm, wheel)
  group.traverse(o => { (o as THREE.Mesh).frustumCulled = false })
  return { group, wheel, cabins }
}

/** How far the building cards turn from facing the camera toward facing the road. */
const TOE = 0.72
const TREE_H = 7.5, PLAIN_TREES = [0, 2, 4, 5], PEACH_TREES = [1, 3]
const BUILDING_ASPECT: Record<string, number> = {}
const BUILDING_KEYS = { towers: [] as string[], midrise: [] as string[], lofts: [] as string[] }
for (const [sheet, a] of Object.entries(BUILDING_ATLAS)) if (sheet !== 'trees') a.items.forEach((it, i) => {
  const key = `b_${sheet}${i}`; BUILDING_ASPECT[key] = it.w / it.h
  ;(sheet === 'towers' ? BUILDING_KEYS.towers : sheet === 'lofts' ? BUILDING_KEYS.lofts : BUILDING_KEYS.midrise).push(key)
})
/** Unit quad standing on its base, UV-mapped to one building in an atlas sheet. Split along its height so the world-bend stays smooth. */
function buildingCard(sheet: string, i: number, w = 1, h = 1) {
  const a = BUILDING_ATLAS[sheet], it = a.items[i], g = new THREE.PlaneGeometry(w, h, 1, 6); g.translate(0, h / 2, 0)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let n = 0; n < uv.count; n++) uv.setXY(n, (it.x + uv.getX(n) * it.w) / a.w, 1 - (it.y + it.h) / a.h + uv.getY(n) * it.h / a.h)
  return g
}
/** Unit quad standing on its base, for the sprite signs. */
const signQuad = () => { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0); return g }
function signPoleGeo() {
  const b = new GeoBuilder(); b.cyl(0.14, 0.18, 6, 0, 0, 0, 0x4a4a5c, 6); return b.build()
}
function billboardGeo() {
  const b = new GeoBuilder(), g = new GeoBuilder()
  for (const s of [-1, 1]) b.box(0.4, 7, 0.4, s * 3.8, 0, -0.3, 0x2a2438)
  g.box(12.2, 6.2, 0.3, 0, 6.6, -0.3, 0x2c1d78)
  g.box(12.5, 0.18, 0.34, 0, 12.8, -0.26, 0xff5ec4); g.box(12.5, 0.18, 0.34, 0, 6.5, -0.26, 0x27e6ff)
  return [b.build(), g.build()] as const
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
  groundMats: Record<GroundKind, THREE.MeshLambertMaterial>
  groundGeo = wideGround()
  ferris: FerrisRig
  ferrisActive = false
  portrait = 0
  private m4 = new THREE.Matrix4(); private col = new THREE.Color()
  private tmpColor = new Float32Array(3)

  constructor(scene: THREE.Scene, public lowQuality = false) {
    this.scene = scene
    const prop = bend(new THREE.MeshLambertMaterial({ vertexColors: true }))
    const glow = bend(new THREE.MeshBasicMaterial({ vertexColors: true }))
    this.groundMats = {
      asphalt: bend(new THREE.MeshLambertMaterial({ map: groundTexture('asphalt') })),
      concrete: bend(new THREE.MeshLambertMaterial({ map: groundTexture('concrete') })),
      clay: bend(new THREE.MeshLambertMaterial({ map: groundTexture('clay') })),
    }
    for (const m of Object.values(this.groundMats)) m.color.set(0xbfaee0)   // cool the street down so it sits under the neon sky
    const add = (k: string, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, ext = 14, also?: string) => {
      cap = Math.ceil(cap * CAPX)
      const def: VariantDef = { geo, mat, cap, ext, also }
      const mesh = new THREE.InstancedMesh(geo, mat, cap)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3)
      mesh.frustumCulled = false; mesh.count = 0
      scene.add(mesh); this.variants.set(k, { def, mesh, n: 0 })
    }
    const tl = new THREE.TextureLoader(), art = (f: string) => { const t = tl.load(`${import.meta.env.BASE_URL}art/${f}.webp`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t }
    for (const [sheet, a] of Object.entries(BUILDING_ATLAS)) {
      const mat = bend(new THREE.MeshBasicMaterial({ map: art('bld-' + sheet), alphaTest: 0.5, side: THREE.DoubleSide }))
      a.items.forEach((it, i) => sheet === 'trees' ? add('t_' + i, buildingCard(sheet, i, TREE_H * it.w / it.h, TREE_H), mat, 50, 5) : add(`b_${sheet}${i}`, buildingCard(sheet, i), mat, sheet === 'towers' ? 26 : 16, 16))
    }
    add('capitol', capitolGeo(), prop, 2, 20)
    const [fb, fg] = foxGeo(); add('fox', fb, prop, 2, 16, 'foxGlow'); add('foxGlow', fg, glow, 2)
    const [lb, lg] = lampGeo(); add('lamp', lb, prop, 40, 3, 'lampGlow'); add('lampGlow', lg, glow, 40)
    add('hill', hillGeo(), prop, 14, 50);
    add('strPole', strPoleGeo(), prop, 80, 2); add('strWire', strWireGeo(), glow, 60, 8)
    add('cross', crossGeo(), glow, 10, 2); add('crossPole', crossPoleGeo(), prop, 20, 2)
    add('wall', wallGeo(), prop, 16, 10)
    for (let i = 0; i < 4; i++) { const map = art('mural-' + 'ab'[i % 2]); if (i > 1) { map.wrapS = THREE.RepeatWrapping; map.repeat.x = -1 } add('mural' + i, muralPlane(), bend(new THREE.MeshBasicMaterial({ map })), 8, 10) }
    add('rail', railGeo(), prop, 8, 22)
    const [rb, rg] = railcarGeo(); add('railcar', rb, prop, 10, 8, 'railcarGlow'); add('railcarGlow', rg, glow, 10)
    const [fob, fog] = fountainGeo(); add('fountain', fob, prop, 2, 7, 'fountainGlow'); add('fountainGlow', fog, glow, 2)
    add('artsign', signQuad(), bend(new THREE.MeshBasicMaterial({ map: art('sign-peachtree'), side: THREE.DoubleSide })), 6, 8)
    for (const n of ['i285', 'atl', 'hawk', 'star', 'bulldog', 'peach', 'train', 'bus']) {
      const map = art('badge-' + n)
      add('art' + n, signQuad(), bend(new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide })), 6, 8)
    }
    add('signPole', signPoleGeo(), prop, 8, 2)
    const [bbb, bbg] = billboardGeo(); add('billboard', bbb, prop, 6, 8, 'billboardGlow'); add('billboardGlow', bbg, glow, 6)
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
    const put = (v: string, x: number, zz: number, o: Partial<Item> = {}) => {
      const isTree = v === 'tree' || v === 'peachTree'     // illustrated cards, so they always face the camera
      items.push({ v: v === 'tree' ? 't_' + PLAIN_TREES[Math.floor(r() * PLAIN_TREES.length)] : v === 'peachTree' ? 't_' + PEACH_TREES[Math.floor(r() * PEACH_TREES.length)] : v, x, y: 0, d: z0 + zz, ry: 0, sx: 1, sy: 1, sz: 1, tint: 0xffffff, drift: 0, ...o, ...(isTree ? { ry: 0, sz: 1 } : {}) })
    }
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
    const skylineRow = (n: number, lo: number, hi: number) => { for (const a of [-1, 1]) for (let i = 0; i < n; i++) card(pick(farTowers), a * (lo + r() * (hi - lo)), r() * CHUNK, 75 + r() * 55, 0.2) }
    /** One illustrated building card turned toward the road, h metres tall with its width taken from the art. */
    const card = (v: string, x: number, zz: number, h: number, toe = TOE) => put(v, x, zz, { sx: h * BUILDING_ASPECT[v], sy: h, sz: 1, ry: x > 0 ? -toe : toe, tint: pick(TINTS) })
    const towers = [1, 4, 5].map(i => BUILDING_KEYS.towers[i]), farTowers = [1, 2, 4, 5].map(i => BUILDING_KEYS.towers[i]), landmark = BUILDING_KEYS.towers[2], mids = BUILDING_KEYS.midrise.filter(k => !/midrise[013]$/.test(k)), lofts = BUILDING_KEYS.lofts
    /** A big lit roadside billboard carrying one sprite, stretched to fit the art's own shape. */
    const bill = (s: number, zz: number, art: string, w = 5.6, h = 5.6) => {
      const ry = s * -0.3, x = s * 19
      put('billboard', x, zz, { ry }); put('art' + art, x, zz, { ry, y: 6.9 + (5.6 - h) / 2, sx: w, sy: h, sz: 1 })
    }
    if (district === 0) {
      for (const s of [-1, 1]) {
        put('lamp', s * 5.6, 10, { ry: s > 0 ? Math.PI : 0 }); put('lamp', s * 5.6, 30, { ry: s > 0 ? Math.PI : 0 })
        put('tree', s * 7.4, 22 + r() * 6, { sx: 0.9 + r() * 0.3, sy: 0.9 + r() * 0.3 })
        const big = (k === 3 && s > 0) || (k === 8 && s < 0) || (k === 12 && s > 0)
        if (!big) for (let slot = 0; slot < 2; slot++) { const x = s * (24 + r() * 9), z = slot * 20 + 4 + r() * 10; if (r() < 0.55) card(pick(mids), x, z, 26 + r() * 12); else card(pick(towers), x, z, 48 + r() * 30) }
      }
      skylineRow(2, 44, 95)
      if (r() < 0.4) card(landmark, (r() < 0.5 ? -1 : 1) * (60 + r() * 30), r() * CHUNK, 120, 0.25)
      if (k === 3) card(landmark, 60, 20, 110, 0.25)
      if (k % 4 === 0) { const s = k % 8 === 0 ? -1 : 1; put('signPole', s * 8.2, 28); put('artsign', s * 8.2, 28, { y: 5.4, sx: 5.4, sy: 1.75 }) }
      if (k === 8) put('capitol', -27, 20, { ry: Math.PI / 2 })
      if (k === 12) put('fox', 17.5, 20, { ry: -Math.PI / 2 })
      if (k % 4 === 2) { const s = k % 8 === 2 ? 1 : -1; put('signPole', s * 8.2, 12); put('arti285', s * 8.2, 12, { y: 5.2, sx: 3.2, sy: 3.2 }) }
      if (k % 6 === 4) bill(1, 26, 'atl', 10, 5.2)
      if (k % 6 === 1 && idx > DISTRICT_CHUNKS) bill(1, 8, 'train')   // not beside the title screen's opening shot
      put('rail', -17, 20); if (k % 4 === 1) for (let i = 0; i < 3; i++) put('railcar', -17, 36 - i * 14.8, { y: 8.05, drift: 16 })
    } else if (district === 1) {
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) { put('strPole', s * 5.5, i * 13.3); put('strWire', s * 5.5, i * 13.3) }
        put('tree', s * 7.4, 2 + r() * 36, { sx: 1, sy: 1 })
        const mural = k % 3 !== 2
        if (mural) { put('wall', s * 10, 20, { sx: 0.8, sy: 4.6, sz: 20 }); put('mural' + ((k + (s > 0 ? 1 : 0)) % 4), s * 9.55, 20, { ry: s < 0 ? Math.PI / 2 : -Math.PI / 2, sx: 20, sy: 4.4 }) }
        card(pick(lofts), s * (21 + r() * 4), 10 + r() * 6, 11 + r() * 3); card(pick(lofts), s * (21 + r() * 4), 32, 11 + r() * 3)
        card(pick(towers), s * (46 + r() * 40), r() * CHUNK, 70 + r() * 40, 0.25)
      }
      if (k % 4 === 1) bill(k % 8 === 1 ? 1 : -1, 26, k % 8 === 1 ? 'hawk' : 'star')
      if (k % 4 === 3) bill(k % 8 === 3 ? -1 : 1, 26, k % 8 === 3 ? 'bulldog' : 'bus', k % 8 === 3 ? 5.6 : 11, k % 8 === 3 ? 5.6 : 11)
      put('cross', 0, 20); put('crossPole', -6.4, 20); put('crossPole', 6.4, 20)
      skylineRow(1, 80, 120)
    } else {
      for (const s of [-1, 1]) {
        // plain trees line the road and the fruit stays further back, so lane peaches never get lost against tree peaches
        for (let i = 0; i < 5; i++) put('tree', s * (7.4 + (i % 2) * 0.6), 4 + i * 8, { sx: 1.05, sy: 1.05 })
        for (let i = 0; i < 4; i++) { put('peachTree', s * (14 + (k % 2) * 1.5), 2 + i * 10 + (s > 0 ? 3 : 0), { tint: 0xb4aacc }); if (k % 2) put('peachTree', s * 20, 6 + i * 10, { tint: 0xa098c0 }) }
        put('lamp', s * 5.6, 20, { ry: s > 0 ? Math.PI : 0 })
        const hs = 28 + r() * 22; put('hill', s * (55 + r() * 40), r() * CHUNK, { sx: hs, sy: 7 + r() * 9, sz: hs, y: -2 })
      }
      if (k % 5 === 2) bill(k % 10 === 2 ? 1 : -1, 16, 'peach')
      skylineRow(2, 70, 115)
      if (k === 5) put('ferris', 32, 20)
      if (k === 9) put('fountain', -14, 20)
      if (k === 13) card(landmark, 62, 20, 130, 0.25)
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
        if ((it.v === 'cross' || it.v === 'strWire') && rel > -12) continue   // lights overhead would pass through the HUD
        const v = this.variants.get(it.v)!, ext = v.def.ext ?? 10
        const z = rel, tower = it.v.startsWith('b_')
        if (z - ext > 14 || z + ext < -(tower ? farLim - 90 : farLim)) continue
        this.write(v, it, z, tower)
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
  private write(v: { def: VariantDef; mesh: THREE.InstancedMesh; n: number }, it: Item, z: number, tower = false) {
    if (v.n >= v.def.cap) return
    const s = Math.sin(it.ry), c = Math.cos(it.ry)
    const zz = z
    const p = v.mesh.instanceMatrix.array as Float32Array, o = v.n * 16
    p[o] = c * it.sx; p[o + 1] = 0; p[o + 2] = -s * it.sx; p[o + 3] = 0
    // keep the canyon low and wide so the wallpaper skyline stays in view, more so in portrait
    const hk = tower ? 1 - 0.25 * this.portrait : 1, xk = tower && Math.abs(it.x) < 60 ? 1 + 0.3 * this.portrait : 1
    p[o + 4] = 0; p[o + 5] = it.sy * hk; p[o + 6] = 0; p[o + 7] = 0
    p[o + 8] = s * it.sz; p[o + 9] = 0; p[o + 10] = c * it.sz; p[o + 11] = 0
    p[o + 12] = it.x * xk; p[o + 13] = it.y; p[o + 14] = zz; p[o + 15] = 1
    const ca = v.mesh.instanceColor!.array as Float32Array, i3 = v.n * 3
    this.col.setHex(it.tint); ca[i3] = this.col.r; ca[i3 + 1] = this.col.g; ca[i3 + 2] = this.col.b
    v.n++
  }
}
