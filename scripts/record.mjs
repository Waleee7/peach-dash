// Records the README hero GIF + character strip + screenshots via Playwright and ffmpeg.
import { chromium } from '/Users/walee2/.claude/scripts/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
const base = process.argv[2] || 'http://localhost:4173/'
mkdirSync('docs', { recursive: true }); rmSync('/tmp/claude-501/vid', { recursive: true, force: true })
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
// hero video: downtown golden hour into beltline dusk
const vctx = await browser.newContext({ viewport: { width: 800, height: 500 }, recordVideo: { dir: '/tmp/claude-501/vid', size: { width: 800, height: 500 } } })
const vp = await vctx.newPage()
await vp.goto(base + '?fresh=1&screen=play&bot=1&at=560'); await vp.waitForTimeout(9000)
await vctx.close()
const vid = readdirSync('/tmp/claude-501/vid')[0]
execFileSync('ffmpeg', ['-y', '-ss', '1.2', '-t', '5', '-i', `/tmp/claude-501/vid/${vid}`, '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=5', 'docs/gameplay.gif'], { stdio: 'ignore' })
// character strip
const ctx = await browser.newContext({ viewport: { width: 420, height: 560 }, deviceScaleFactor: 1 })
for (let i = 0; i < 4; i++) {
  const p = await ctx.newPage(); await p.goto(base + `?fresh=1&screen=runners&char=${i}&at=120`)
  await p.addStyleTag({ content: '#ui,#flash,#wipe{display:none!important}' }); await p.waitForTimeout(2600)
  await p.screenshot({ path: `/tmp/claude-501/char${i}.png` }); await p.close()
}
execFileSync('ffmpeg', ['-y', ...[0, 1, 2, 3].flatMap(i => ['-i', `/tmp/claude-501/char${i}.png`]), '-filter_complex', '[0]crop=300:300:60:80[a];[1]crop=300:300:60:80[b];[2]crop=300:300:60:80[c];[3]crop=300:300:60:80[d];[a][b][c][d]hstack=inputs=4', 'docs/characters.png'], { stdio: 'ignore' })
await browser.close()
for (const [a, b] of [['desktop-title', 'title'], ['desktop-play-beltline', 'beltline'], ['desktop-play-park', 'park'], ['mobile-title', 'mobile-title'], ['mobile-play-downtown', 'mobile-play']]) { try { execFileSync('cp', [`shots/${a}.png`, `docs/${b}.png`]) } catch {} }
console.log('docs ready')
