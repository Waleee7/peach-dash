import { chromium } from '/Users/walee2/.claude/scripts/node_modules/playwright/index.mjs'
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
for (const [n, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const p = await (await b.newContext({ viewport: vp, deviceScaleFactor: n === 'mobile' ? 3 : 1 })).newPage()
  await p.goto('http://localhost:4173/?fresh=1&screen=play&bot=1&at=1000'); await p.waitForTimeout(2500)
  const r = await p.evaluate(() => new Promise(res => { let c = 0; const t0 = performance.now(); const f = () => { c++; if (performance.now() - t0 > 3000) res({ fps: c / 3, calls: window.__peach.renderer.info.render.calls, tris: window.__peach.renderer.info.render.triangles }); else requestAnimationFrame(f) }; f() }))
  console.log(n, r)
}
await b.close()
