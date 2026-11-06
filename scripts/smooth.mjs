// Frame pacing under a 4x CPU throttle on a phone-sized view. Usage: node scripts/smooth.mjs [baseUrl]   (needs `vite preview` on :4173)
import { chromium } from '/Users/walee2/.claude/scripts/node_modules/playwright/index.mjs'
const base = process.argv[2] || 'http://localhost:4173/'
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })).newPage()
const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
const t0 = Date.now(); await p.goto(base + '?login=0&screen=play&bot=1&at=0'); await p.waitForFunction(() => window.__peach?.sim); console.log('boot ms', Date.now() - t0)
const r = await p.evaluate(() => new Promise(res => {
  const ft = [], long = []; let last = performance.now(); const t0 = last
  new PerformanceObserver(l => { for (const e of l.getEntries()) long.push(Math.round(e.duration)) }).observe({ entryTypes: ['longtask'] })
  const g = __peach; g.sim.invincible = true; g.sim.chase.on = false
  const f = n => { ft.push(n - last); last = n; if (n - t0 < 20000) requestAnimationFrame(f); else { ft.sort((a, b) => a - b); const q = x => +ft[Math.floor(ft.length * x)].toFixed(1); res({ frames: ft.length, fps: +(ft.length / 20).toFixed(1), p50: q(.5), p95: q(.95), p99: q(.99), worst: +ft.at(-1).toFixed(1), over34ms: ft.filter(x => x > 34).length, over50ms: ft.filter(x => x > 50).length, longtasks: long.length, longest: Math.max(0, ...long), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, geos: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures, dist: Math.floor(g.sim.dist), pr: g.renderer.getPixelRatio() }) } }
  requestAnimationFrame(f)
}))
console.log(JSON.stringify(r)); await b.close()
