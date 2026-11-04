// Playwright screenshot pass. Usage: node scripts/shoot.mjs [baseUrl]
import { chromium } from '/Users/walee2/.claude/scripts/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
const base = process.argv[2] || 'http://localhost:4173/'
mkdirSync('shots', { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const jobs = [
  ['dusk', '?screen=play&bot=1&at=330', 3500],
  ['night-park', '?screen=play&bot=1&at=1750', 4000],
  ['title', '?fresh=1&screen=title&at=0', 2500],
  ['play-downtown', '?fresh=1&screen=play&bot=1&at=60', 5500],
  ['play-beltline', '?fresh=1&screen=play&bot=1&at=830', 5000],
  ['play-park', '?fresh=1&screen=play&bot=1&at=1390', 5000],
  ['lm-spire', '?fresh=1&screen=play&bot=1&at=30', 2600],
  ['lm-capitol', '?fresh=1&screen=play&bot=1&at=250', 2600],
  ['lm-fox', '?fresh=1&screen=play&bot=1&at=415', 2600],
  ['runners', '?fresh=1&screen=runners&char=0', 2500],
]
for (const [name, vp] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: name === 'mobile' ? 2 : 1, hasTouch: name === 'mobile' })
  for (const [n, q, wait] of jobs) {
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
    await page.goto(base + q); await page.waitForTimeout(wait)
    await page.screenshot({ path: `shots/${name}-${n}.png` })
    if (errs.length) console.log(name, n, 'ERRORS:', errs.slice(0, 3))
    await page.close()
  }
  await ctx.close()
}
await browser.close()
console.log('done')
