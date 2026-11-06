// Cuts badges out of the sprite sheet and prepares the skybox wallpapers. Usage: node scripts/build-art.mjs [sourceDir]
import { chromium } from '/Users/walee2/.claude/scripts/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const src = process.argv[2] || join(process.env.HOME, 'Downloads')
const sheet = 'Arcade_game_asset_sprite_sheet_caa3ecca_2K.jpg'
const SPRITES = { train: [100, 60, 670, 480], bus: [725, 90, 1450, 470], hawk: [145, 550, 600, 1015], star: [1510, 540, 2010, 1030], bulldog: [2195, 560, 2650, 1020], atl: [780, 1140, 1345, 1430], i285: [1545, 1075, 1975, 1500], peach: [2200, 1065, 2650, 1505] }
const SKIES = { dusk: { file: 'Atlanta_skyline_game_skybox_25925860_2K.jpg', star: [1625, 905, 34] }, night: { file: 'Atlanta_skyline_game_skybox_b77d2089_2K.jpg', star: [1620, 917, 36] } }
const uri = f => 'data:image/jpeg;base64,' + readFileSync(join(src, f)).toString('base64')
const browser = await chromium.launch(); const page = await browser.newPage()
const save = (name, data) => { const buf = Buffer.from(data.split(',')[1], 'base64'); writeFileSync(`public/art/${name}.webp`, buf); console.log(name, Math.round(buf.length / 1024) + 'KB') }
await page.evaluate(() => {
  window.load = u => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u })
  window.sized = (i, w, q) => { const c = document.createElement('canvas'); c.width = w; c.height = Math.round(i.height * w / i.width); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(i, 0, 0, c.width, c.height); return c.toDataURL('image/webp', q) }
})
for (const [name, box] of Object.entries(SPRITES)) {
  save('badge-' + name, await page.evaluate(async ({ u, box }) => {
    const [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0, c = document.createElement('canvas'); c.width = w; c.height = h
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(await load(u), -x0, -y0)
    const im = x.getImageData(0, 0, w, h), d = im.data, seen = new Uint8Array(w * h), bg = [d[0], d[1], d[2]]
    const dist = i => Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]))
    // flood the sheet background in from the crop edge; the black sticker outline stops it, so nothing inside a sprite is touched
    const q = []; for (let i = 0; i < w; i++) q.push(i, (h - 1) * w + i); for (let j = 0; j < h; j++) q.push(j * w, j * w + w - 1)
    while (q.length) { const p = q.pop(); if (seen[p]) continue; const a = p * 4, m = dist(a); if (m > 30) continue; seen[p] = 1; d[a + 3] = m < 10 ? 0 : Math.round(255 * (m - 10) / 20); const px = p % w; if (px > 0) q.push(p - 1); if (px < w - 1) q.push(p + 1); if (p >= w) q.push(p - w); if (p < w * (h - 1)) q.push(p + w) }
    x.putImageData(im, 0, 0)
    let l = w, r = 0, t = h, b = 0; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 40) { if (i < l) l = i; if (i > r) r = i; if (j < t) t = j; if (j > b) b = j }
    const S = 320, bw = r - l + 1, bh = b - t + 1, k = Math.min(S / bw, S / bh), o = document.createElement('canvas'); o.width = S; o.height = S
    const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(c, l, t, bw, bh, (S - bw * k) / 2, (S - bh * k) / 2, bw * k, bh * k)
    return o.toDataURL('image/webp', 0.9)
  }, { u: uri(sheet), box }))
}
for (const [name, s] of Object.entries(SKIES)) {
  const [hi, lo] = await page.evaluate(async ({ u, star }) => {
    const i = await load(u), c = document.createElement('canvas'); c.width = i.width; c.height = i.height
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0)
    // paint the stadium's car logo off: rebuild each row across the disc from the flat panel either side of it
    const [cx, cy, R] = star, X = cx - R - 4, Y = cy - R - 4, S = 2 * R + 8, im = x.getImageData(X, Y, S, S), d = im.data, m = S / 2
    for (let j = 0; j < S; j++) { const dy = j + 0.5 - m, half = Math.sqrt(Math.max(0, R * R - dy * dy)); if (!half) continue
      const a = Math.max(0, Math.floor(m - half) - 2), b = Math.min(S - 1, Math.ceil(m + half) + 2)
      for (let n = a + 1; n < b; n++) { const f = (n - a) / (b - a), p = (j * S + n) * 4, pa = (j * S + a) * 4, pb = (j * S + b) * 4; for (let k = 0; k < 3; k++) d[p + k] = d[pa + k] * (1 - f) + d[pb + k] * f } }
    x.putImageData(im, X, Y); x.save(); x.filter = 'blur(2.5px)'; x.beginPath(); x.arc(cx, cy, R + 1, 0, 7); x.clip(); x.drawImage(c, 0, 0); x.restore()
    return [sized(c, 2400, 0.84), sized(c, 1400, 0.78)]
  }, { u: uri(s.file), star: s.star })
  save('sky-' + name, hi); save('sky-' + name + '-lo', lo)
}
await browser.close()
