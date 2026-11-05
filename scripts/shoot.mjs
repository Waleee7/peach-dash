// Playwright screenshot pass. Usage: node scripts/shoot.mjs [baseUrl]   (needs `npm run preview` on :4173)
import { chromium } from '/Users/walee2/.claude/scripts/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
const base = process.argv[2] || 'http://localhost:4173/'
mkdirSync('shots', { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
// [name, query, wait ms, optional page.evaluate script run after load]
const play = '?fresh=1&login=0&screen=play&bot=1&at='
const jobs = [
  ['title', '?fresh=1&login=0&screen=title', 2500],
  ['login', '?fresh=1&screen=title', 2500],
  ['powers', '?fresh=1&login=0&screen=powers', 2500],
  ['scores', '?fresh=1&login=0&screen=scores', 2500, `const g=__peach; g.save.board=[{score:12840,dist:2210,char:'juno',date:'2026-11-04'},{score:9120,dist:1700,char:'tay',date:'2026-11-03'},{score:4410,dist:900,char:'pearl',date:'2026-11-03'}]; g.renderScores()`],
  ['runners', '?fresh=1&login=0&screen=runners&char=5', 2500],
  ['dusk', play + '330', 3500],
  ['night', play + '1000', 4000],
  ['downtown', play + '60', 5500],
  ['beltline', play + '830', 5000],
  ['park', play + '1390', 5000],
  ['geese', play + '20', 1500],
  ['wing', play + '300', 2500, `__peach.sim.grantPower('wing')`],
  ['glide', play + '300', 3000, `__peach.sim.grantPower('glide')`],
  ['kicks-cobbler', play + '300', 2500, `__peach.sim.grantPower('kicks'); __peach.sim.grantPower('cobbler'); __peach.sim.grantPower('board'); __peach.sim.grantPower('tea')`],
  ['stumble', play + '300', 1200, `const s=__peach.sim; s.chase.on=false; s.track.obstacles.push({id:9e5,kind:'truck',lane:2,span:1,d:s.dist-2,len:30,bottom:0,top:3.2,variant:1,minGap:9,counted:false}); __peach.botOn=false; s.right()`],
  ['train', play + '300', 3200, `const s=__peach.sim; s.chase.on=false; s.track.obstacles=s.track.obstacles.filter(o=>o.d<s.dist||o.d>s.dist+120); s.track.pickups=s.track.pickups.filter(k=>k.d<s.dist||k.d>s.dist+120); s.spawner.obs(s.track,'ramp',1,1,s.dist+16,0,11); s.spawner.obs(s.track,'train',1,1,s.dist+27,0,44.4); for(let i=0;i<14;i++) s.track.pickups.push({id:9e5+i,kind:'peach',lane:1,d:s.dist+32+i*2.8,y:3.8,taken:false,pull:0}); __peach.botOn=false; s.p.lane=1`],
  ['pickups', play + '300', 800, `const s=__peach.sim; s.chase.on=false; s.track.obstacles=[]; ['wing','tea','cobbler','kicks','glide','board','crate','letter'].forEach((k,i)=>s.track.pickups.push({id:9e5+i,kind:k,lane:(i%2)*2,d:s.dist+12+Math.floor(i/2)*6,y:1.3,taken:false,pull:0})); __peach.botOn=false`],
  ['obstacles', play + '300', 700, `const s=__peach.sim; s.chase.on=false; s.track.obstacles=[]; s.track.pickups=[]; const o=(k,l,d,sp=1,len,v)=>s.spawner.obs(s.track,k,l,sp,s.dist+d,0,len,v); o('scooter',0,14); o('barricade',2,14); o('lowsign',0,24,3); o('car',1,36,1,undefined,-1); o('truck',2,36); __peach.botOn=false; s.invincible=true`],
]
for (const [name, vp] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: name === 'mobile' ? 2 : 1, hasTouch: name === 'mobile' })
  for (const [n, q, wait, js] of jobs) {
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
    await page.goto(base + q); await page.waitForTimeout(js ? 1800 : wait)
    if (js) { await page.evaluate(js); await page.waitForTimeout(wait) }
    await page.screenshot({ path: `shots/${name}-${n}.png` })
    if (errs.length) console.log(name, n, 'ERRORS:', errs.slice(0, 3))
    await page.close()
  }
  await ctx.close()
}
await browser.close()
console.log('done')
