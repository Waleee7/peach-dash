import * as THREE from 'three'
import { mulberry32 } from '../core/rng'

/**
 * Procedurally painted Atlanta skyline backdrop (the Gemini image route was 429 / quota 0, see README).
 * Landmark silhouettes follow the references: Bank of America Plaza's gold pyramid spire, Westin Peachtree
 * cylinder, Truist Plaza's stepped crown + mast, One Atlantic Center's steep hipped roof, 191 Peachtree's twin
 * crowns, Georgia-Pacific's stair-step, the petal-roofed stadium and the SkyView wheel.
 * Three phases (day / golden hour / night) share identical geometry so they crossfade cleanly.
 */
export type SkyPhase = 'day' | 'gold' | 'night'
export const PHASES: SkyPhase[] = ['day', 'gold', 'night']

const W = 4096, H = 768, GL = 704        // mid layer canvas + ground line
const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

interface Pal {
  top: string; bot: string; rimL: string; rimR: string; win: string[]; winP: number; line: string
  gold: string; goldHi: string; goldLo: string; pink: string; pinkLo: string; copper: string; stone: string; stoneLo: string
  glass: string; glassLo: string; glow: number
}
const PAL: Record<SkyPhase, Pal> = {
  day: { top: '#b7cfe6', bot: '#7d9cc2', rimL: '#eaf3fb', rimR: '#5b7aa3', win: ['#dcebf7', '#9bb9d8', '#eef6fc'], winP: 0.2, line: 'rgba(60,90,130,.22)',
    gold: '#e7b440', goldHi: '#fff1a8', goldLo: '#a9761a', pink: '#d9a79a', pinkLo: '#a87a74', copper: '#6fae9a', stone: '#a9b4c2', stoneLo: '#7a8799', glass: '#9ec1e6', glassLo: '#5f86b4', glow: 0 },
  gold: { top: '#a8607e', bot: '#4b3158', rimL: '#ffd8a0', rimR: '#ffb27a', win: ['#ffcf8a', '#ff9f68', '#ffe6b0'], winP: 0.3, line: 'rgba(40,20,50,.3)',
    gold: '#ffc84a', goldHi: '#fff0a0', goldLo: '#c9791a', pink: '#d98a86', pinkLo: '#7c4a66', copper: '#4f8a82', stone: '#9a6a82', stoneLo: '#4a3058', glass: '#c0708c', glassLo: '#3c2a5a', glow: 0.25 },
  night: { top: '#222b63', bot: '#0b0f30', rimL: '#5668b0', rimR: '#3a4888', win: ['#ffd98a', '#ffc15e', '#fff1c0', '#9fe8ff'], winP: 0.46, line: 'rgba(0,0,10,.35)',
    gold: '#ffc23d', goldHi: '#fff2b0', goldLo: '#d28f1c', pink: '#463a66', pinkLo: '#241d44', copper: '#2f6a62', stone: '#2c3470', stoneLo: '#141a44', glass: '#2a3470', glassLo: '#0c1034', glow: 1 },
}

function vg(x: CanvasRenderingContext2D, y0: number, y1: number, a: string, b: string) {
  const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g
}
function glowAt(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, a: number) {
  if (a <= 0) return
  x.save(); x.globalCompositeOperation = 'lighter'
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)')
  x.globalAlpha = a; x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); x.restore()
}
function windows(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, p: Pal, r: () => number, cw = 7, ch = 10) {
  x.save(); x.beginPath(); x.rect(px, py, w, h); x.clip()
  x.strokeStyle = p.line; x.lineWidth = 1
  for (let yy = py + ch; yy < py + h; yy += ch) { x.beginPath(); x.moveTo(px, yy + 0.5); x.lineTo(px + w, yy + 0.5); x.stroke() }
  for (let yy = py + 4; yy < py + h - 4; yy += ch) for (let xx = px + 3; xx < px + w - 4; xx += cw) {
    if (r() < p.winP) { x.fillStyle = p.win[Math.floor(r() * p.win.length)]; x.fillRect(xx, yy, cw - 3, ch - 4) }
  }
  x.restore()
}
/** Plain slab tower with rim lights + windows. Returns top y. */
function slab(x: CanvasRenderingContext2D, cx: number, w: number, h: number, p: Pal, r: () => number, tint?: [string, string]) {
  const px = cx - w / 2, py = GL - h
  x.fillStyle = vg(x, py, GL, tint?.[0] ?? p.top, tint?.[1] ?? p.bot); x.fillRect(px, py, w, h)
  windows(x, px, py, w, h, p, r)
  x.fillStyle = p.rimL; x.fillRect(px, py, 2, h); x.fillStyle = p.rimR; x.fillRect(px + w - 3, py, 3, h)
  return py
}

function goldSpire(x: CanvasRenderingContext2D, cx: number, baseY: number, w: number, h: number, p: Pal) {
  x.beginPath(); x.moveTo(cx - w / 2, baseY); x.lineTo(cx + w / 2, baseY); x.lineTo(cx + 1.5, baseY - h); x.lineTo(cx - 1.5, baseY - h); x.closePath()
  const g = x.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); g.addColorStop(0, p.goldLo); g.addColorStop(0.55, p.gold); g.addColorStop(1, p.goldHi)
  x.fillStyle = g; x.fill()
  x.save(); x.clip(); x.strokeStyle = p.goldLo; x.lineWidth = 1.4; x.globalAlpha = 0.7
  for (let i = 1; i < 9; i++) { const y = baseY - (h * i) / 9; x.beginPath(); x.moveTo(cx - w, y); x.lineTo(cx + w, y); x.stroke() }
  for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(cx + i * (w / 7), baseY); x.lineTo(cx, baseY - h); x.stroke() }
  x.restore()
  x.strokeStyle = p.goldHi; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + w / 2 - 1, baseY); x.lineTo(cx + 1.5, baseY - h); x.stroke()
  x.strokeStyle = p.goldLo; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, baseY - h); x.lineTo(cx, baseY - h - 34); x.stroke()
  glowAt(x, cx, baseY - h * 0.45, h * 0.9, p.gold, p.glow * 0.5)
  if (p.glow > 0.5) { x.fillStyle = '#ff4a3a'; x.fillRect(cx - 2, baseY - h - 38, 4, 4); glowAt(x, cx, baseY - h - 36, 14, '#ff3a30', 0.8) }
}

/** Bank of America Plaza: slender shaft, Art Deco setbacks, gold-leaf pyramid. */
function boaPlaza(x: CanvasRenderingContext2D, cx: number, p: Pal, r: () => number) {
  const top = slab(x, cx, 60, 372, p, r)
  let y = top
  for (const [w, h] of [[48, 22], [36, 22]] as const) { x.fillStyle = vg(x, y - h, y, p.top, p.bot); x.fillRect(cx - w / 2, y - h, w, h); windows(x, cx - w / 2, y - h, w, h, p, r); x.fillStyle = p.rimL; x.fillRect(cx - w / 2, y - h, 2, h); x.fillStyle = p.rimR; x.fillRect(cx + w / 2 - 3, y - h, 3, h); y -= h }
  goldSpire(x, cx, y, 40, 54, p)
}
/** Westin Peachtree Plaza: mirror cylinder with the ring disc on top. */
function westin(x: CanvasRenderingContext2D, cx: number, p: Pal, r: () => number) {
  const w = 84, h = 300, px = cx - w / 2, py = GL - h
  const g = x.createLinearGradient(px, 0, px + w, 0); g.addColorStop(0, p.glassLo); g.addColorStop(0.3, p.glass); g.addColorStop(0.62, p.top); g.addColorStop(1, p.glassLo)
  x.fillStyle = g; x.fillRect(px, py, w, h)
  x.fillStyle = vg(x, py, GL, 'rgba(255,255,255,.14)', 'rgba(0,0,0,.18)'); x.fillRect(px, py, w, h)
  x.save(); x.beginPath(); x.rect(px, py, w, h); x.clip(); x.strokeStyle = p.line; x.lineWidth = 1
  for (let i = 1; i < 14; i++) { const xx = px + (w * i) / 14; x.beginPath(); x.moveTo(xx, py); x.lineTo(xx, GL); x.stroke() }
  for (let yy = py + 8; yy < GL - 4; yy += 9) for (let i = 1; i < 13; i++) if (r() < p.winP * 0.8) { x.fillStyle = p.win[Math.floor(r() * p.win.length)]; x.fillRect(px + (w * i) / 14 + 1, yy, 3, 5) }
  x.restore()
  x.fillStyle = p.rimL; x.fillRect(px, py, 2, h)
  x.fillStyle = p.stoneLo; x.fillRect(cx - 52, py - 16, 104, 16); x.fillStyle = p.rimL; x.fillRect(cx - 52, py - 16, 104, 2)
  x.fillStyle = p.glass; x.fillRect(cx - 36, py - 34, 72, 18)
  for (let i = 0; i < 9; i++) { x.fillStyle = p.win[(i + 1) % p.win.length]; x.fillRect(cx - 48 + i * 11, py - 11, 6, 6) }
  x.fillStyle = p.stoneLo; x.fillRect(cx - 18, py - 46, 36, 12); x.fillRect(cx - 1.5, py - 76, 3, 30)
  glowAt(x, cx, py - 8, 80, '#ffd98a', p.glow * 0.4)
}
/** Truist Plaza: dark piered shaft, stepped crown, tall mast. */
function truist(x: CanvasRenderingContext2D, cx: number, p: Pal, r: () => number) {
  const h = 350, w = 68, top = slab(x, cx, w, h, p, r, [p.stoneLo, p.stoneLo])
  x.fillStyle = 'rgba(0,0,0,.28)'; for (let i = 0; i < 8; i++) x.fillRect(cx - w / 2 + 4 + i * 8.4, top, 3, h)
  let y = top
  for (const [ww, hh] of [[56, 18], [42, 18], [28, 18], [16, 14]] as const) { x.fillStyle = vg(x, y - hh, y, p.stoneLo, p.stone); x.fillRect(cx - ww / 2, y - hh, ww, hh); x.fillStyle = p.rimL; x.fillRect(cx - ww / 2, y - hh, 2, hh); y -= hh }
  x.fillStyle = p.stone; x.fillRect(cx - 1.5, y - 62, 3, 62); x.fillRect(cx - 5, y - 40, 10, 2); x.fillRect(cx - 5, y - 24, 10, 2)
  if (p.glow > 0.5) { x.fillStyle = '#ff4a3a'; x.fillRect(cx - 2, y - 66, 4, 4); glowAt(x, cx, y - 64, 12, '#ff3a30', 0.8) }
}
/** 191 Peachtree: pale shaft with two Gothic pyramid crowns. */
function peachtree191(x: CanvasRenderingContext2D, cx: number, p: Pal, r: () => number) {
  const h = 322, w = 62, top = slab(x, cx, w, h, p, r, [p.pink, p.pinkLo])
  x.fillStyle = vg(x, top - 22, top, p.pink, p.pinkLo); x.fillRect(cx - w / 2 - 3, top - 8, w + 6, 8)
  for (const s of [-1, 1]) {
    const mx = cx + s * 15
    x.fillStyle = vg(x, top - 22, top, p.pink, p.pinkLo); x.fillRect(mx - 12, top - 22, 24, 22)
    x.beginPath(); x.moveTo(mx - 12, top - 22); x.lineTo(mx, top - 22 - 62); x.lineTo(mx + 12, top - 22); x.closePath()
    const g = x.createLinearGradient(mx - 12, 0, mx + 12, 0); g.addColorStop(0, p.pinkLo); g.addColorStop(1, p.pink); x.fillStyle = g; x.fill()
    x.strokeStyle = p.rimL; x.lineWidth = 1.5; x.stroke()
    x.strokeStyle = p.line; x.lineWidth = 1
    for (let i = 1; i < 6; i++) { const yy = top - 22 - i * 10; x.beginPath(); x.moveTo(mx - 10, yy); x.lineTo(mx + 10, yy); x.stroke() }
    x.fillStyle = p.stoneLo; x.fillRect(mx - 1, top - 22 - 62 - 14, 2, 14)
    glowAt(x, mx, top - 40, 34, '#ffcf8a', p.glow * 0.25)
  }
}
/** One Atlantic Center: granite shaft capped by a steep hipped roof. */
function oneAtlantic(x: CanvasRenderingContext2D, cx: number, p: Pal, r: () => number) {
  const h = 326, w = 64, top = slab(x, cx, w, h, p, r, [p.pink, p.pinkLo])
  x.fillStyle = p.pinkLo; x.fillRect(cx - w / 2 - 2, top - 6, w + 4, 6)
  x.beginPath(); x.moveTo(cx - w / 2, top - 6); x.lineTo(cx - 6, top - 6 - 58); x.lineTo(cx + 6, top - 6 - 58); x.lineTo(cx + w / 2, top - 6); x.closePath()
  const g = x.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); g.addColorStop(0, p.copper); g.addColorStop(1, p.stone); x.fillStyle = g; x.fill()
  x.strokeStyle = p.rimL; x.lineWidth = 1.5; x.stroke()
  x.fillStyle = p.stoneLo; x.fillRect(cx - 5, top - 6 - 58 - 6, 10, 6); x.fillRect(cx - 1, top - 6 - 58 - 36, 2, 30)
}
/** Georgia-Pacific Center: rose granite, stair-stepping down to one side. */
function georgiaPacific(x: CanvasRenderingContext2D, cx: number, p: Pal, r: () => number) {
  const steps = [[70, 296], [58, 240], [46, 190], [34, 140]] as const
  let left = cx - 36
  for (const [w, h] of steps) { x.fillStyle = vg(x, GL - h, GL, p.pink, p.pinkLo); x.fillRect(left, GL - h, w, h); windows(x, left, GL - h, w, h, p, r); x.fillStyle = p.rimL; x.fillRect(left, GL - h, 2, h); x.fillStyle = p.rimR; x.fillRect(left + w - 2, GL - h, 2, h); left += w - 6 }
  x.fillStyle = p.stoneLo; x.fillRect(cx - 36 + 12, GL - 296 - 18, 20, 18); x.fillRect(cx - 36 + 21, GL - 296 - 40, 2, 22)
}
/** Petal-roofed stadium with a halo board. */
function stadium(x: CanvasRenderingContext2D, cx: number, p: Pal) {
  const w = 460, h = 70
  x.fillStyle = vg(x, GL - h, GL, p.stone, p.stoneLo); x.beginPath(); x.moveTo(cx - w / 2, GL); x.lineTo(cx - w / 2 + 28, GL - h); x.lineTo(cx + w / 2 - 28, GL - h); x.lineTo(cx + w / 2, GL); x.closePath(); x.fill()
  x.fillStyle = p.line; for (let i = 0; i < 40; i++) x.fillRect(cx - w / 2 + 30 + i * 10.5, GL - h + 4, 2, h - 6)
  // 8 petals in a shallow dome with an open aperture
  const cy = GL - h, n = 8
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI
    const x0 = cx - Math.cos(a0) * (w / 2 - 28), x1 = cx - Math.cos(a1) * (w / 2 - 28)
    x.beginPath(); x.moveTo(x0, cy); x.lineTo(x1, cy); x.lineTo(cx + (x0 + x1 - 2 * cx) * 0.18, cy - 46 - Math.sin((a0 + a1) / 2) * 14); x.closePath()
    x.fillStyle = i % 2 ? p.stone : p.glass; x.fill(); x.strokeStyle = p.rimL; x.lineWidth = 1; x.stroke()
  }
  x.fillStyle = p.glow > 0.5 ? '#fff1d0' : p.glassLo; x.beginPath(); x.ellipse(cx, cy - 52, 44, 8, 0, 0, Math.PI * 2); x.fill()
  x.strokeStyle = p.glow > 0.5 ? '#9fe8ff' : p.rimL; x.lineWidth = 3; x.beginPath(); x.ellipse(cx, cy - 12, w / 2 - 50, 11, 0, 0, Math.PI * 2); x.stroke()
  glowAt(x, cx, cy - 20, 220, '#9fe8ff', p.glow * 0.3)
}
/** SkyView wheel: rim, spokes, gondolas, A-frame legs. */
function skyview(x: CanvasRenderingContext2D, cx: number, p: Pal) {
  const R = 50, cy = GL - R - 22
  x.strokeStyle = p.stone; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 24, GL); x.lineTo(cx, cy); x.lineTo(cx + 24, GL); x.stroke()
  x.strokeStyle = p.rimL; x.lineWidth = 3.5; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke()
  x.lineWidth = 1; x.strokeStyle = p.stone
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke() }
  const cols = ['#ff6b6b', '#ffd166', '#2ec4b6', '#ff9f68']
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, gx = cx + Math.cos(a) * R, gy = cy + Math.sin(a) * R
    x.fillStyle = p.glow > 0.4 ? cols[i % 4] : p.gold; x.fillRect(gx - 3, gy - 2, 6, 7)
    if (p.glow > 0.5) glowAt(x, gx, gy, 9, cols[i % 4], 0.7)
  }
  x.fillStyle = p.stoneLo; x.beginPath(); x.arc(cx, cy, 4, 0, 7); x.fill()
}

/** Generic mid-rise filler with optional crown variety. */
function filler(x: CanvasRenderingContext2D, cx: number, w: number, h: number, p: Pal, r: () => number) {
  const top = slab(x, cx, w, h, p, r, r() < 0.5 ? undefined : [p.stone, p.stoneLo])
  const k = r()
  if (k < 0.22) { x.fillStyle = p.stoneLo; x.fillRect(cx - w * 0.3, top - 8, w * 0.6, 8) }
  else if (k < 0.4) { x.beginPath(); x.moveTo(cx - w / 2, top); x.lineTo(cx + w / 2, top); x.lineTo(cx + w / 2, top - w * 0.4); x.closePath(); x.fillStyle = p.stone; x.fill() }
  else if (k < 0.52) { x.fillStyle = p.stoneLo; x.fillRect(cx - 1, top - 24, 2, 24) }
}

export function paintMid(phase: SkyPhase): HTMLCanvasElement {
  const c = mk(W, H), x = c.getContext('2d')!, p = PAL[phase], r = mulberry32(2026)
  const U = (u: number) => u * W
  // landmark-free flanks first (so landmarks overlap them)
  for (let u = 0.04; u < 0.96; u += 0.011 + r() * 0.012) {
    const edge = Math.abs(u - 0.5)
    if (edge < 0.22 && r() < 0.35) continue
    filler(x, U(u), 26 + r() * 44, (60 + r() * 150) * (edge > 0.3 ? 0.75 : 1), p, r)
  }
  stadium(x, U(0.275), p)
  skyview(x, U(0.715), p)
  georgiaPacific(x, U(0.345), p, r)
  oneAtlantic(x, U(0.405), p, r)
  westin(x, U(0.457), p, r)
  boaPlaza(x, U(0.52), p, r)
  truist(x, U(0.585), p, r)
  peachtree191(x, U(0.643), p, r)
  // smaller mid-rises in the gaps for density
  for (const u of [0.375, 0.43, 0.488, 0.553, 0.614, 0.676]) filler(x, U(u), 30 + r() * 20, 70 + r() * 70, p, r)
  // fade the landmarks' feet into the ground line
  x.fillStyle = PAL[phase].bot; x.globalAlpha = 0.0; x.fillRect(0, GL, W, H - GL); x.globalAlpha = 1
  return c
}

/** White-on-alpha silhouette strip; the shader tints it per phase. kind: far = hazy towers, near = low-rise + trees. */
export function paintStrip(kind: 'far' | 'near'): HTMLCanvasElement {
  const Wc = 2048, Hc = 384, c = mk(Wc, Hc), x = c.getContext('2d')!, r = mulberry32(kind === 'far' ? 7 : 19), gl = Hc - 8
  x.fillStyle = '#fff'
  if (kind === 'far') {
    for (let u = 0; u < Wc; u += 14 + r() * 26) {
      const w = 18 + r() * 40, h = 40 + r() * 190 * (Math.abs(u / Wc - 0.5) < 0.2 ? 1.1 : 0.7)
      x.globalAlpha = 0.55 + r() * 0.4; x.fillRect(u, gl - h, w, h)
      if (r() < 0.3) x.fillRect(u + w * 0.35, gl - h - 18, w * 0.3, 18)
    }
  } else {
    for (let u = 0; u < Wc; u += 10 + r() * 24) { const w = 20 + r() * 40, h = 20 + r() * 52; x.globalAlpha = 1; x.fillRect(u, gl - h, w, h + 8) }
    for (let u = 0; u < Wc; u += 18 + r() * 30) {
      const rr = 16 + r() * 26; x.globalAlpha = 1
      x.beginPath(); x.arc(u, gl - 14 - r() * 12, rr, 0, 7); x.arc(u + rr * 0.8, gl - 22 - r() * 14, rr * 0.8, 0, 7); x.fill()
    }
  }
  x.globalAlpha = 1; x.fillRect(0, gl, Wc, Hc - gl)
  return c
}
export function paintClouds(): HTMLCanvasElement {
  const Wc = 2048, Hc = 256, c = mk(Wc, Hc), x = c.getContext('2d')!, r = mulberry32(55)
  for (let i = 0; i < 26; i++) {
    const cx = r() * Wc, cy = 40 + r() * 170, rw = 90 + r() * 200, rh = 8 + r() * 16
    for (let k = 0; k < 5; k++) {
      const ox = (r() - 0.5) * rw * 0.9, oy = (r() - 0.5) * rh * 1.4
      for (const wx of [0, -Wc, Wc]) {            // wrap horizontally
        x.save(); x.translate(cx + ox + wx, cy + oy); x.scale(rw * (0.4 + r() * 0.5), rh * (0.6 + r() * 0.6))
        const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)')
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore()
      }
    }
  }
  return c
}

/* ---------------- 3D backdrop: concentric arcs with crossfade + parallax ---------------- */
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
const MID_FS = `varying vec2 vUv; uniform sampler2D tA, tB, tC; uniform vec3 uW; uniform vec3 uHaze; uniform float uHazeK;
void main(){
  vec4 a = texture2D(tA, vUv), b = texture2D(tB, vUv), c = texture2D(tC, vUv);
  float al = a.a*uW.x + b.a*uW.y + c.a*uW.z;
  vec3 col = (a.rgb*uW.x + b.rgb*uW.y + c.rgb*uW.z) / max(al, 0.0001);
  float v = vUv.y, bottom = 1.0 - smoothstep(0.0, 0.115, v);
  float hz = clamp(uHazeK * (1.0 - smoothstep(0.1, 0.5, v)) + bottom, 0.0, 1.0);
  col = mix(col, uHaze, hz);
  float edge = smoothstep(0.0, 0.07, vUv.x) * (1.0 - smoothstep(0.93, 1.0, vUv.x));
  float A = max(al, bottom) * edge;
  gl_FragColor = vec4(col * A, A);
  #include <colorspace_fragment>
}`
const STRIP_FS = `varying vec2 vUv; uniform sampler2D tM; uniform vec3 uTint; uniform vec3 uHaze; uniform float uHazeK; uniform float uOpacity;
void main(){
  float a = texture2D(tM, vUv).a;
  float v = vUv.y, bottom = 1.0 - smoothstep(0.0, 0.1, v);
  vec3 col = mix(uTint, uHaze, uHazeK * (1.0 - smoothstep(0.1, 0.6, v)) + bottom * 0.5);
  float edge = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
  float A = max(a * uOpacity, bottom) * edge;
  gl_FragColor = vec4(col * A, A);
  #include <colorspace_fragment>
}`
const CLOUD_FS = `varying vec2 vUv; uniform sampler2D tM; uniform vec3 uTint; uniform float uOpacity;
void main(){
  float a = texture2D(tM, vUv).a * uOpacity * smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
  float edge = smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));
  float A = a * edge; gl_FragColor = vec4(uTint * A, A);
  #include <colorspace_fragment>
}`

const tex = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true
  t.wrapS = THREE.ClampToEdgeWrapping; t.anisotropy = 8; return t
}

export class SkylineBackdrop {
  group = new THREE.Group()
  private layers: { mesh: THREE.Mesh; sway: number; drift: number; follow: number }[] = []
  private mid: THREE.ShaderMaterial; private far: THREE.ShaderMaterial; private near: THREE.ShaderMaterial; private clouds: THREE.ShaderMaterial
  private c = new THREE.Color(); private c2 = new THREE.Color()

  constructor(scene: THREE.Scene) {
    /** Arc of a cylinder centred on -Z (the run direction); `groundV` is where the painted ground line sits in the texture. */
    const arc = (R: number, deg: number, aspect: number, eyeY: number, groundV: number, mat: THREE.ShaderMaterial, order: number, sway: number, drift: number) => {
      const th = (deg * Math.PI) / 180, hh = (R * th) / aspect
      const g = new THREE.CylinderGeometry(R, R, hh, 72, 1, true, Math.PI - th / 2, th)
      const m = new THREE.Mesh(g, mat); m.scale.x = -1                // mirror so the painting reads left-to-right from inside
      m.position.y = eyeY - groundV * hh + hh / 2; m.renderOrder = order; m.frustumCulled = false
      this.group.add(m); this.layers.push({ mesh: m, sway, drift, follow: 1 })
    }
    const base = { vertexShader: VS, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, premultipliedAlpha: true } as const
    const dayT = tex(paintMid('day')), goldT = tex(paintMid('gold')), nightT = tex(paintMid('night'))
    this.mid = new THREE.ShaderMaterial({ ...base, fragmentShader: MID_FS, uniforms: { tA: { value: dayT }, tB: { value: goldT }, tC: { value: nightT }, uW: { value: new THREE.Vector3(1, 0, 0) }, uHaze: { value: new THREE.Color() }, uHazeK: { value: 0.7 } } })
    this.far = new THREE.ShaderMaterial({ ...base, fragmentShader: STRIP_FS, uniforms: { tM: { value: tex(paintStrip('far')) }, uTint: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uHazeK: { value: 0.75 }, uOpacity: { value: 0.8 } } })
    this.near = new THREE.ShaderMaterial({ ...base, fragmentShader: STRIP_FS, uniforms: { tM: { value: tex(paintStrip('near')) }, uTint: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uHazeK: { value: 0.35 }, uOpacity: { value: 1 } } })
    this.clouds = new THREE.ShaderMaterial({ ...base, fragmentShader: CLOUD_FS, uniforms: { tM: { value: tex(paintClouds()) }, uTint: { value: new THREE.Color() }, uOpacity: { value: 0.9 } } })
    arc(560, 330, 15, 120, 0.5, this.clouds, -9.5, 0.4, 0.012)
    arc(515, 170, 8.5, 6, 0.02, this.far, -9.4, 0.7, 0)
    arc(470, 130, W / H, 5, (H - GL) / H, this.mid, -9.3, 1.0, 0)
    arc(425, 150, 11.7, 2, 0.02, this.near, -9.2, 1.9, 0)
    scene.add(this.group)
  }
  /**
   * w: crossfade weights [day, gold, night]; hor: sky horizon colour (haze target); camPos follows;
   * sway: radians the road is currently turning (parallax between layers).
   */
  update(w: [number, number, number], hor: THREE.Color, camPos: THREE.Vector3, sway: number, time: number) {
    const mu = this.mid.uniforms
    ;(mu.uW.value as THREE.Vector3).set(w[0], w[1], w[2]); (mu.uHaze.value as THREE.Color).copy(hor)
    const farCol = (u: THREE.ShaderMaterial, day: string, gold: string, night: string, k = 1) => {
      this.c.set(day).multiplyScalar(w[0]); this.c2.set(gold).multiplyScalar(w[1]); this.c.add(this.c2); this.c2.set(night).multiplyScalar(w[2]); this.c.add(this.c2)
      ;(u.uniforms.uTint.value as THREE.Color).copy(this.c).multiplyScalar(k); if (u.uniforms.uHaze) (u.uniforms.uHaze.value as THREE.Color).copy(hor)
    }
    farCol(this.far, '#9fb6d2', '#a87290', '#2a3270')
    farCol(this.near, '#3f5f55', '#3a2c48', '#070a1c')
    farCol(this.clouds, '#ffffff', '#ffb59a', '#5a4a92')
    this.clouds.uniforms.uOpacity.value = 0.95 * (w[0] * 0.55 + w[1] * 0.9 + w[2] * 0.35)
    for (const l of this.layers) {
      l.mesh.rotation.y = sway * l.sway + time * l.drift
      l.mesh.position.x = camPos.x * l.follow; l.mesh.position.z = camPos.z
    }
    this.group.position.set(0, 0, 0)
  }
}
