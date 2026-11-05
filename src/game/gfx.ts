import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/* ---------- world-bend: the road curves down/aside toward the horizon ---------- */
/** uFade: scenery between x and y metres dissolves (screen-door) so geometry streamed in past the fog never visibly pops. */
export const bendU = { uBend: { value: 0.00032 }, uCurve: { value: 0 }, uFade: { value: new THREE.Vector2(338, 394) } }
const bendChunk = THREE.ShaderChunk.project_vertex.replace(
  'gl_Position',
  'float bz = max(-mvPosition.z - 12.0, 0.0); mvPosition.y -= bz*bz*uBend; mvPosition.x += bz*bz*uCurve;\n gl_Position')
export function bend<T extends THREE.Material>(m: T, fade = true): T {
  m.onBeforeCompile = sh => {
    sh.uniforms.uBend = bendU.uBend; sh.uniforms.uCurve = bendU.uCurve; sh.uniforms.uFade = bendU.uFade
    if (fade) sh.fragmentShader = sh.fragmentShader.replace('void main() {', `uniform vec2 uFade;
void main() {
#ifdef USE_FOG
  float fk = clamp((vFogDepth - uFade.x) / (uFade.y - uFade.x), 0.0, 1.0);
  if (fk > 0.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < fk) discard;
#endif`)
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', bendChunk)
      .replace('void main() {', 'uniform float uBend; uniform float uCurve;\nvoid main() {')
  }
  return m
}

/* ---------- merged vertex-coloured geometry builder ---------- */
const CELL_W = 3, CELL_H = 3.4
export class GeoBuilder {
  parts: THREE.BufferGeometry[] = []
  private push(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, keepUV = false, flat = true) {
    let n = g.index ? g.toNonIndexed() : g
    if (flat) n.computeVertexNormals()
    n.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)))
    const c = new THREE.Color(color), cnt = n.attributes.position.count, col = new Float32Array(cnt * 3)
    for (let i = 0; i < cnt; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
    n.setAttribute('color', new THREE.BufferAttribute(col, 3))
    if (!keepUV) { const uv = new Float32Array(cnt * 2).fill(0.03); n.setAttribute('uv', new THREE.BufferAttribute(uv, 2)) }
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k)
    this.parts.push(n)
    return this
  }
  /** win=true tiles the window texture on the four side faces */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, o: { win?: boolean; ry?: number; rx?: number; rz?: number; off?: number } = {}) {
    const g = new THREE.BoxGeometry(w, h, d)
    if (o.win) {
      const uv = g.attributes.uv as THREE.BufferAttribute, off = o.off ?? 0
      for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i, u = uv.getX(idx), v = uv.getY(idx)
        if (f === 2 || f === 3) { uv.setXY(idx, 0.03, 0.03); continue }
        const fw = f < 2 ? d : w
        uv.setXY(idx, (u * fw) / CELL_W / 4 + off, (v * h) / CELL_H / 4 + off * 0.5)
      }
    }
    return this.push(g, color, x, y + h / 2, z, o.rx, o.ry, o.rz, !!o.win)
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, seg = 8, rot: [number, number, number] = [0, 0, 0]) {
    return this.push(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z, ...rot)
  }
  cone(r: number, h: number, x: number, y: number, z: number, color: number, seg = 6, ry = 0) {
    return this.push(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z, 0, ry, 0)
  }
  ball(r: number, x: number, y: number, z: number, color: number, sx = 1, sy = 1, sz = 1, detail = 1) {
    const g = new THREE.IcosahedronGeometry(r, detail); g.scale(sx, sy, sz)
    return this.push(g, color, x, y, z)
  }
  torus(r: number, tube: number, x: number, y: number, z: number, color: number, arc = Math.PI * 2, rot: [number, number, number] = [0, 0, 0], seg = 20) {
    return this.push(new THREE.TorusGeometry(r, tube, 5, seg, arc), color, x, y, z, ...rot)
  }
  wedge(w: number, h: number, d: number, x: number, y: number, z: number, color: number) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(d, 0); s.lineTo(0, h)
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(-d / 2, 0, -w / 2); g.rotateY(Math.PI / 2)
    return this.push(g, color, x, y, z)
  }
  plane(w: number, h: number, x: number, y: number, z: number, color: number, ry = 0) {
    return this.push(new THREE.PlaneGeometry(w, h), color, x, y, z, 0, ry, 0, true)
  }
  build() {
    const g = mergeGeometries(this.parts, false)!
    this.parts.forEach(p => p.dispose())
    return g
  }
}

/* ---------- canvas textures ---------- */
const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const tex = (c: HTMLCanvasElement, repeat = false, srgb = true) => {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}
let seed = 7
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

export function windowTextures(brick: boolean) {
  const c = mk(256, 256), e = mk(256, 256), x = c.getContext('2d')!, y = e.getContext('2d')!
  x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); y.fillStyle = '#000'; y.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const px = i * 64, py = j * 64
    if (brick) {
      x.fillStyle = 'rgba(120,90,80,.28)'
      for (let r = 0; r < 8; r++) { x.fillRect(px, py + r * 8, 64, 1); for (let b = 0; b < 4; b++) x.fillRect(px + ((r % 2) * 8) + b * 16, py + r * 8, 1, 8) }
      x.fillStyle = '#f2e2c4'; x.fillRect(px + 12, py + 6, 40, 50)
      x.fillStyle = '#3d3040'; x.fillRect(px + 16, py + 12, 32, 44)
      x.beginPath(); x.arc(px + 32, py + 14, 16, Math.PI, 0); x.fill()
    } else {
      x.fillStyle = '#d8d2cc'; x.fillRect(px, py + 54, 64, 10)
      const g = x.createLinearGradient(0, py + 8, 0, py + 50); g.addColorStop(0, '#9fc2e8'); g.addColorStop(1, '#4d6a94')
      x.fillStyle = g; x.fillRect(px + 7, py + 8, 50, 42)
    }
    if (rnd() < 0.58) {
      y.fillStyle = rnd() < 0.2 ? '#fff4d6' : rnd() < 0.5 ? '#ffc766' : '#ffdf9c'
      if (brick) { y.fillRect(px + 16, py + 12, 32, 44); y.beginPath(); y.arc(px + 32, py + 14, 16, Math.PI, 0); y.fill() } else y.fillRect(px + 7, py + 8, 50, 42)
    }
  }
  return { map: tex(c, true), emissive: tex(e, true) }
}

export function muralTexture(kind: number) {
  const c = mk(768, 320), x = c.getContext('2d')!
  const bg = ['#ffb347', '#2ec4b6', '#ff6b6b', '#ffe066'][kind % 4]
  x.fillStyle = bg; x.fillRect(0, 0, 768, 320)
  const pal = ['#fff1d6', '#ff5e5b', '#ffd166', '#06a77d', '#3a2a4d', '#ff9f68']
  if (kind % 4 === 0) {            // sunburst peach
    for (let i = 0; i < 24; i++) { x.fillStyle = i % 2 ? '#ffd166' : '#ff9f68'; x.beginPath(); x.moveTo(384, 330); x.arc(384, 330, 520, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2); x.fill() }
    x.fillStyle = '#ff6b6b'; x.beginPath(); x.arc(384, 170, 105, 0, 7); x.fill()
    x.fillStyle = '#ff9f9f'; x.beginPath(); x.arc(350, 140, 40, 0, 7); x.fill()
    x.fillStyle = '#06a77d'; x.beginPath(); x.ellipse(430, 62, 46, 20, -0.5, 0, 7); x.fill()
    x.strokeStyle = '#3a2a4d'; x.lineWidth = 8; x.beginPath(); x.arc(384, 170, 105, 0, 7); x.stroke()
  } else if (kind % 4 === 1) {     // geometric skyline waves
    for (let i = 0; i < 9; i++) { x.fillStyle = pal[i % 6]; x.beginPath(); x.moveTo(0, 320); for (let u = 0; u <= 768; u += 16) x.lineTo(u, 160 + Math.sin(u / 70 + i) * 50 + i * 14); x.lineTo(768, 320); x.fill() }
    x.fillStyle = '#fff1d6'; x.font = 'bold 120px Bungee, Impact, sans-serif'; x.textAlign = 'center'; x.fillText('404', 384, 130)
  } else if (kind % 4 === 2) {     // flowers
    for (let i = 0; i < 14; i++) {
      const fx = rnd() * 768, fy = 60 + rnd() * 220, r = 22 + rnd() * 36, col = pal[Math.floor(rnd() * 5)]
      x.fillStyle = col; for (let p = 0; p < 6; p++) { x.beginPath(); x.arc(fx + Math.cos(p) * r * 0.8, fy + Math.sin(p) * r * 0.8, r * 0.55, 0, 7); x.fill() }
      x.fillStyle = '#3a2a4d'; x.beginPath(); x.arc(fx, fy, r * 0.35, 0, 7); x.fill()
    }
  } else {                         // block letters
    x.fillStyle = '#3a2a4d'; x.font = 'bold 190px Bungee, Impact, sans-serif'; x.textAlign = 'center'; x.fillText('PEACH', 392, 230)
    x.fillStyle = '#ff5e5b'; x.fillText('PEACH', 384, 222)
    for (let i = 0; i < 40; i++) { x.fillStyle = pal[Math.floor(rnd() * 6)]; x.fillRect(rnd() * 768, rnd() * 320, 6, 6) }
  }
  return tex(c)
}

export type GroundKind = 'asphalt' | 'concrete' | 'clay'
export function groundTexture(kind: GroundKind) {
  const W = 2048, H = 512, c = mk(W, H), x = c.getContext('2d')!, U = W / 110
  const X = (u: number) => (u + 55) * U
  const pal = {
    asphalt: { road: '#6b5a64', curb: '#e8d9c0', walk: '#cdbfae', lot: '#9c8f86', line: '#fff1d0' },
    concrete: { road: '#d6c2ab', curb: '#f2e6d2', walk: '#b8c97a', lot: '#6e9f4e', line: '#ff8f6b' },
    clay: { road: '#c1623f', curb: '#a64e30', walk: '#8fbf55', lot: '#6fa043', line: '#ffe3b3' },
  }[kind]
  x.fillStyle = pal.lot; x.fillRect(0, 0, W, H)
  x.fillStyle = pal.walk; x.fillRect(X(-9), 0, X(9) - X(-9), H)
  x.fillStyle = pal.curb; x.fillRect(X(-4.6), 0, X(4.6) - X(-4.6), H)
  x.fillStyle = pal.road; x.fillRect(X(-4.2), 0, X(4.2) - X(-4.2), H)
  // speckle
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.08)'
    const px = rnd() * W; x.fillRect(px, rnd() * H, 2 + rnd() * 3, 2 + rnd() * 3)
  }
  x.fillStyle = pal.lot; x.fillRect(0, 0, 10, H); x.fillRect(W - 10, 0, 10, H)   // flat edge columns: texture clamps outward, no streaks
  if (kind === 'clay') for (const tx of [-1.5, 1.5]) { x.fillStyle = 'rgba(90,30,10,.18)'; x.fillRect(X(tx) - 7, 0, 14, H) }
  if (kind === 'concrete') { x.fillStyle = 'rgba(80,60,40,.25)'; for (let j = 0; j < 8; j++) x.fillRect(X(-4.2), (j / 8) * H, X(4.2) - X(-4.2), 2) }
  if (kind !== 'clay') for (let j = 0; j < 4; j++) { x.fillStyle = 'rgba(80,60,50,.22)'; x.fillRect(X(-9), (j / 4) * H, X(-4.6) - X(-9), 2); x.fillRect(X(4.6), (j / 4) * H, X(9) - X(4.6), 2) }
  if (kind === 'asphalt') {       // crosswalk stripes + lane dashes
    x.fillStyle = pal.line
    for (const lx of [-1.2, 1.2]) for (let j = 0; j < 4; j++) x.fillRect(X(lx) - 3, j * 128 + 8, 6, 64)
    x.fillRect(X(-4.0), 0, 4, H); x.fillRect(X(4.0) - 4, 0, 4, H)
  } else {
    x.fillStyle = pal.line; x.globalAlpha = 0.85
    for (const lx of [-1.2, 1.2]) for (let j = 0; j < 8; j++) x.fillRect(X(lx) - 2, j * 64 + 6, 4, 30)
    x.globalAlpha = 1
  }
  return tex(c)
}

export function haloTexture() {
  const c = mk(64, 64), x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.35, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64)
  return tex(c)
}

export function glowTexture() {
  const c = mk(64, 64), x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64)
  return tex(c)
}

/** HUD / shop icon as a data URL: coloured disc + a simple glyph per power-up. */
const iconCache = new Map<string, string>()
export function iconURL(kind: string, color: string): string {
  const key = kind + color, hit = iconCache.get(key); if (hit) return hit
  const c = mk(96, 96), x = c.getContext('2d')!
  x.fillStyle = '#2b1a33'; x.beginPath(); x.arc(48, 48, 46, 0, 7); x.fill()
  x.fillStyle = color; x.beginPath(); x.arc(48, 48, 40, 0, 7); x.fill()
  x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.arc(34, 32, 14, 0, 7); x.fill()
  x.fillStyle = '#fff1d6'; x.strokeStyle = '#2b1a33'; x.lineWidth = 4; x.lineJoin = 'round'
  const poly = (pts: number[][]) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); x.stroke() }
  if (kind === 'wing') { x.beginPath(); x.moveTo(50, 52); x.lineTo(70, 72); x.lineWidth = 8; x.strokeStyle = '#fff1d6'; x.stroke(); x.lineWidth = 4; x.strokeStyle = '#2b1a33'; x.beginPath(); x.arc(72, 68, 5, 0, 7); x.arc(66, 76, 5, 0, 7); x.fillStyle = '#fff1d6'; x.fill(); x.stroke(); x.fillStyle = '#d9822b'; x.beginPath(); x.ellipse(38, 40, 20, 16, -0.7, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#ffe84a'; x.beginPath(); x.arc(48, 30, 7, 0, 7); x.fill() }
  else if (kind === 'tea') { poly([[32, 30], [64, 30], [58, 72], [38, 72]]); x.fillStyle = '#c4601a'; x.fillRect(36, 44, 24, 24); x.strokeStyle = '#ff5e5b'; x.lineWidth = 5; x.beginPath(); x.moveTo(52, 28); x.lineTo(60, 12); x.stroke() }
  else if (kind === 'cobbler') { x.beginPath(); x.ellipse(48, 56, 26, 11, 0, 0, 7); x.fill(); x.stroke(); x.font = 'bold 30px Bungee, Impact, sans-serif'; x.textAlign = 'center'; x.lineWidth = 5; x.strokeText('2x', 48, 46); x.fillStyle = '#ffd166'; x.fillText('2x', 48, 46) }
  else if (kind === 'kicks') { poly([[26, 56], [26, 40], [40, 36], [52, 50], [72, 54], [72, 66], [26, 66]]); x.fillStyle = '#ff4d6d'; x.fillRect(30, 44, 14, 10) }
  else if (kind === 'glide') { x.beginPath(); x.arc(48, 46, 20, 0, 7); x.stroke(); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; x.beginPath(); x.moveTo(48, 46); x.lineTo(48 + Math.cos(a) * 20, 46 + Math.sin(a) * 20); x.stroke() } x.fillStyle = '#ff8f2a'; poly([[40, 68], [56, 68], [48, 82]]) }
  else if (kind === 'board') { x.beginPath(); x.roundRect(20, 44, 56, 14, 7); x.fill(); x.stroke(); x.fillStyle = '#ff6b6b'; x.fillRect(32, 48, 32, 6) }
  else if (kind === 'crate') { x.fillRect(24, 28, 48, 42); x.strokeRect(24, 28, 48, 42); x.fillStyle = '#2b1a33'; x.font = 'bold 34px Bungee, Impact, sans-serif'; x.textAlign = 'center'; x.fillText('?', 48, 62) }
  else { x.fillStyle = '#2b1a33'; x.font = 'bold 40px Bungee, Impact, sans-serif'; x.textAlign = 'center'; x.fillText(kind.slice(0, 1).toUpperCase(), 48, 62) }
  const url = c.toDataURL(); iconCache.set(key, url); return url
}
