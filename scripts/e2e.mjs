// Real-browser checks against the production build. Usage: npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs
import { chromium } from '/Users/walee2/.claude/scripts/node_modules/playwright/index.mjs'
const base = process.argv[2] || 'http://localhost:4173/'
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
let failed = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++ }
const watch = p => { const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) }); return errs }
const orient = (p, gamma) => p.evaluate(g => dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 0, gamma: g })), gamma)
const giveBadges = (p, n) => p.evaluate(n => { const s = __peach.sim; s.invincible = true; s.chase.on = false; s.track.obstacles = []; for (let i = 0; i < n; i++) s.track.pickups.push({ id: 9e6 + i, kind: 'badge', lane: s.p.lane, d: s.dist + 3 + i * 3, y: 1.3, taken: false, pull: 0 }) }, n)

{ // desktop: art loads, wallpaper is on screen, no errors over a long autopilot run
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage(), errs = watch(p), art = []
  p.on('response', r => { if (r.url().includes('/art/')) art.push(r.status()) })
  await p.goto(base + '?login=0&screen=play&bot=1&at=200'); await p.waitForTimeout(6000)
  const st = await p.evaluate(() => { const g = __peach, b = g.atm.backdrop; return { ready: b.wall.uniforms.uReady.value, fallback: !!b.mid, dist: g.sim.dist, img: [...document.querySelectorAll('#h-badges img')].every(i => i.complete && i.naturalWidth > 0), pdot: getComputedStyle(document.querySelector('.pdot')).backgroundImage } })
  check('every art file loads', art.length >= 12 && art.every(s => s === 200), `${art.length} files`)
  check('wallpaper faded in without using the fallback', st.ready === 1 && !st.fallback)
  check('badge tray images decode', st.img)
  check('peach icon resolves through the built css', /art\/badge-peach/.test(st.pdot))
  check('autopilot keeps running', st.dist > 250, `${Math.floor(st.dist)} m`)
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '))
  const held = await p.evaluate(() => { const g = __peach; g.botOn = false; g.sim.invincible = true; g.sim.chase.on = false; g.sim.track.obstacles = []; g.sim.p.lane = 1; const key = r => dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', repeat: r })); key(false); key(true); key(true); const l = g.sim.p.lane; g.sim.p.lane = 2; key(false); return [l, g.sim.p.lane] })
  check('a held arrow key is one move', held[0] === 0 && held[1] === 1)
}
{ // phone: tilt steering, vibration patterns, badge set -> boost
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  await c.addInitScript(() => { window.__v = []; Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: x => { window.__v.push(x); return true } }) })
  const p = await c.newPage(), errs = watch(p)
  await p.goto(base + '?login=0&screen=settings'); await p.waitForTimeout(1500)
  const row = p.locator('[data-set="tilt"]')
  check('settings offers tilt on a touch device', await row.count() === 1)
  await row.tap(); await p.waitForTimeout(150)
  check('tilt turns on and persists', await p.evaluate(() => JSON.parse(localStorage.getItem('peachdash.v1')).settings.tilt === true))
  await p.evaluate(() => { __peach.startRun(200); const s = __peach.sim; s.invincible = true; s.chase.on = false; s.track.obstacles = [] }); await p.waitForTimeout(1100)
  await orient(p, 0); await orient(p, 26)
  check('leaning right changes lane once', await p.evaluate(() => __peach.sim.p.lane) === 2)
  await orient(p, 40)
  check('holding the lean does not repeat', await p.evaluate(() => __peach.sim.p.lane) === 2)
  await orient(p, 0); await orient(p, -26)
  check('recentre then lean left changes lane back', await p.evaluate(() => __peach.sim.p.lane) === 1)
  const swipe = (dx, dy) => p.evaluate(([dx, dy]) => { const a = document.getElementById('app'), ev = (t, x, y) => a.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 1 })); ev('pointerdown', 200, 500); ev('pointermove', 200 + dx, 500 + dy); dispatchEvent(new PointerEvent('pointerup')); const s = __peach.sim; return { lane: s.p.lane, air: s.p.air } }, [dx, dy])
  check('a short swipe changes lane instantly', (await swipe(-20, 0)).lane === 0)
  check('a tiny finger wobble is ignored', (await swipe(6, 3)).lane === 0)
  check('a short swipe up jumps instantly', (await swipe(0, -20)).air === true)
  await p.waitForTimeout(900); await swipe(20, 0)
  await p.evaluate(() => { window.__v.length = 0 }); await giveBadges(p, 5); await p.waitForTimeout(1500)
  const st = await p.evaluate(() => ({ sets: __peach.sim.stats.sets, boost: __peach.sim.badgeBoost, v: window.__v, on: document.getElementById('h-boost').classList.contains('on'), filled: document.querySelectorAll('#h-badges img.f').length }))
  check('five badges complete a set and start the boost', st.sets === 1 && st.boost > 0 && st.on, `boost ${st.boost.toFixed(1)}s`)
  const js = st.v.map(x => JSON.stringify(x))
  check('badge and set vibration patterns fire', js.filter(x => x === '[16,24,32]').length === 5 && js.includes('[40,30,40,30,40,30,160]'), `${js.length} buzzes`)
  await p.evaluate(() => { const s = __peach.sim; s.invincible = false; s.track.obstacles = []; s.spawner.obs(s.track, 'bus', s.p.lane, 1, s.dist + 4) }); await p.waitForTimeout(1200)
  check('hitting a bus ends the run', await p.evaluate(() => __peach.sim.state) === 'dead')
  await p.waitForTimeout(1500)
  check('lifetime badge sets saved', await p.evaluate(() => JSON.parse(localStorage.getItem('peachdash.v1')).badgeSets) === 1)
  check('game over panel reports badges', /BADGES 5/.test(await p.locator('#o-extra').innerText()))
  check('no page errors on phone', errs.length === 0, errs.slice(0, 2).join(' | '))
}
{ // iPhone: no Vibration API, so the switch tick path runs instead
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
  await c.addInitScript(() => { delete Navigator.prototype.vibrate })
  const p = await c.newPage(), errs = watch(p)
  await p.goto(base + '?login=0&screen=title'); await p.waitForTimeout(1200); await p.locator('[data-act="play"]').tap(); await p.waitForTimeout(1500)
  check('iPhone path installs a hidden switch control', await p.locator('input[type=checkbox][switch]').count() === 1)
  check('no page errors on iPhone path', errs.length === 0, errs.slice(0, 2).join(' | '))
}
{ // art blocked: the game still works on its code-painted skyline
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await c.route('**/art/sky-*', r => r.abort())
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e)))
  await p.goto(base + '?login=0&screen=play&bot=1&at=200'); await p.waitForTimeout(3500)
  check('blocked wallpaper falls back to the painted skyline', await p.evaluate(() => !!__peach.atm.backdrop.mid && __peach.sim.dist > 200))
  check('no crash when wallpaper is blocked', errs.length === 0, errs.slice(0, 2).join(' | '))
}
await browser.close()
console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0)
