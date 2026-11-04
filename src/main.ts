import './style.css'
import '@fontsource/bungee'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import * as THREE from 'three'
import { Sim, laneX, LANE_W, type SimEvent } from './core/sim'
import { botAct } from './core/bot'
import { CHARACTERS, charById } from './core/characters'
import { loadSave, writeSave, applyRun, dailyMission, defaultSave, type Save } from './core/save'
import { dateKey } from './core/rng'
import { World, Atmosphere, DISTRICTS, districtAt } from './game/world'
import { Entities } from './game/entities'
import { Runner } from './game/chars'
import { Haptics, Sound, Particles, SpeedLines } from './game/fx'
import { bendU } from './game/gfx'

type Mode = 'title' | 'runners' | 'settings' | 'play' | 'pause' | 'over'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const qs = new URLSearchParams(location.search)
const rseed = () => Math.floor(Math.random() * 2147483647)

class Game {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(62, 1, 0.3, 700)
  atm: Atmosphere; world!: World; ent!: Entities; fx!: Particles; lines!: SpeedLines
  sound = new Sound(); save: Save = defaultSave()
  runners = new Map<string, Runner>(); cur!: Runner
  sim!: Sim; mode: Mode = 'title'; attract = true; botOn = false
  camPos = new THREE.Vector3(-3, 2, 6); camLook = new THREE.Vector3(0, 1.5, -6); camFov = 62
  shake = 0; hitStop = 0; sq = 0; phase = 0; clock = 0; last = performance.now(); lean = 0; dying = 0; fovKick = 0
  idx = 0; committed = { peaches: 0, near: 0, dist: 0, jumps: 0 }; lastDistrict = -1; botT = 0
  today = dateKey()
  private flash = $('flash'); private callEl = $('h-callout'); private distEl = $('h-district')
  private cache = new Map<string, string>()

  constructor() {
    const canvas = $<HTMLCanvasElement>('c')
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.atm = new Atmosphere(this.scene)
    const fresh = !localStorage.getItem('peachdash.v1')
    this.save = loadSave(localStorage)
    if (import.meta.env.DEV && qs.get('fresh') === '1') this.save = defaultSave()
    if (fresh && matchMedia('(prefers-reduced-motion: reduce)').matches) this.save.settings.reduced = true
  }
  async init() {
    try { await Promise.race([document.fonts.load('40px Bungee'), new Promise(r => setTimeout(r, 1200))]) } catch { /* ignore */ }
    this.world = new World(this.scene, this.save.settings.quality === 'low')
    this.ent = new Entities(this.scene)
    this.fx = new Particles(this.scene); this.lines = new SpeedLines(this.scene)
    for (const c of CHARACTERS) this.runners.set(c.id, new Runner(c.id))
    this.applySettings(); addEventListener('resize', () => this.resize())
    this.bindUI(); this.bindInput(); this.buildLogo(); this.buildSettings()
    this.idx = Math.max(0, CHARACTERS.findIndex(c => c.id === this.save.selected))
    this.showRunner(CHARACTERS[this.idx].id)
    this.startAttract(Number(qs.get('at')) || 0)
    const scr = qs.get('screen') || 'title'
    this.go(scr === 'play' ? 'title' : (scr as Mode), true)
    if (qs.get('char')) { this.idx = Number(qs.get('char')); this.showRunner(CHARACTERS[this.idx].id); this.renderRunnerCard() }
    if (scr === 'play') { this.botOn = qs.get('bot') === '1'; this.startRun(Number(qs.get('at')) || 0) }
    this.last = performance.now(); requestAnimationFrame(t => this.frame(t))
    ;(window as unknown as { __peach: Game }).__peach = this
  }

  /* ---------- settings / sizing ---------- */
  applySettings() {
    const s = this.save.settings
    this.sound.sfxOn = s.sfx; this.sound.musicOn = s.music; Haptics.on = s.haptics
    document.body.classList.toggle('reduced', s.reduced)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, s.quality === 'low' ? 1.1 : 2))
    if (this.world) this.world.lowQuality = s.quality === 'low'
    this.resize()
  }
  resize() {
    const w = innerWidth, h = innerHeight
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix()
  }
  get portrait() { return Math.max(0, Math.min(1, (1.25 - this.camera.aspect) / 0.75)) }
  persist() { writeSave(localStorage, this.save) }

  /* ---------- state ---------- */
  startAttract(at = 0) {
    this.sim = new Sim(rseed(), charById(this.save.selected).perk)
    this.sim.invincible = true; if (at) this.sim.teleport(at); this.attract = true
    this.sim.onEvent = e => this.onEvent(e)
    this.world.reset(); this.world.warm(this.sim.dist, this.clock); this.ent.reset(); this.fx.clear(); this.lastDistrict = -1
  }
  startRun(at = 0) {
    const ch = charById(this.save.selected)
    this.sim = new Sim(rseed(), ch.perk); if (at) this.sim.teleport(at); this.attract = false
    this.sim.onEvent = e => this.onEvent(e)
    this.world.reset(); this.world.warm(this.sim.dist, this.clock); this.ent.reset(); this.fx.clear(); this.lastDistrict = -1
    this.committed = { peaches: 0, near: 0, dist: 0, jumps: 0 }
    this.showRunner(ch.id); this.dying = 0; this.hitStop = 0; this.shake = 0
    this.mode = 'play'; this.show('hud'); this.sound.unlock(); this.sound.startMusic()
    $('h-hint').classList.toggle('off', this.save.runs >= 2)
    if (this.save.runs < 2) setTimeout(() => $('h-hint').classList.add('off'), 5500)
    this.callout('GO!', '', true); Haptics.play('go'); this.sound.sfx('go')
  }
  show(id: string | null) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id))
  }
  go(m: Mode, instant = false) {
    const apply = () => {
      this.mode = m; this.show(m === 'play' ? 'hud' : m)
      if (m === 'title') { this.sound.stopMusic(); this.refreshTitle(); this.showRunner(this.save.selected) }
      if (m === 'runners') { this.idx = Math.max(0, CHARACTERS.findIndex(c => c.id === this.save.selected)); this.renderRunnerCard(); this.showRunner(CHARACTERS[this.idx].id) }
    }
    if (instant) return apply()
    this.wipe(apply)
  }
  wipe(mid: () => void) {
    const w = $('wipe'); w.classList.remove('go'); void w.offsetWidth; w.classList.add('go')
    setTimeout(mid, this.save.settings.reduced ? 0 : 300); setTimeout(() => w.classList.remove('go'), 700)
  }
  showRunner(id: string) {
    if (this.cur) this.scene.remove(this.cur.root)
    this.cur = this.runners.get(id)!; this.scene.add(this.cur.root); this.sq = 0.9
  }

  /* ---------- juice ---------- */
  buzz(n: string) { if (this.mode === 'play') Haptics.play(n) }
  snd(n: string, v = 0) { if (this.mode === 'play') this.sound.sfx(n, v) }
  addShake(v: number) { this.shake = Math.min(1.4, this.shake + (this.save.settings.reduced ? v * 0.15 : v)) }
  doFlash(color: string, o = 0.5) {
    this.flash.style.background = color; this.flash.style.setProperty('--fo', String(this.save.settings.reduced ? o * 0.3 : o))
    this.flash.classList.remove('go'); void this.flash.offsetWidth; this.flash.classList.add('go')
  }
  callout(t: string, sub = '', big = false) {
    const e = this.callEl; e.innerHTML = t + (sub ? `<small>${sub}</small>` : ''); e.style.fontSize = big ? 'clamp(54px,16vw,110px)' : ''
    e.classList.remove('go'); void e.offsetWidth; e.classList.add('go')
  }
  burst(x: number, y: number, z: number, n: number, colors: number[], o: Partial<Parameters<Particles['emit']>[0]> = {}) {
    const k = this.save.settings.reduced ? 0.35 : this.save.settings.quality === 'low' ? 0.6 : 1
    this.fx.emit({ x, y, z, n: Math.ceil(n * k), colors, ...o })
  }
  onEvent(e: SimEvent) {
    const s = this.sim, p = s.p
    switch (e.t) {
      case 'jump': this.snd('jump'); this.buzz('jump'); this.sq = -0.6; this.burst(p.x, 0.1, 0, 7, [0xfff1d6, 0xe8c9a0], { speed: 3, up: 1.5, size: 0.2, life: 0.5, grav: 6 }); break
      case 'land': if ((e.v ?? 0) > 6) { this.snd('land'); this.buzz('land'); this.sq = Math.min(1, (e.v ?? 0) / 14); this.addShake(0.12); this.burst(p.x, 0.1, 0, 10, [0xfff1d6, 0xe8c9a0, 0xc99a70], { speed: 4, up: 1, size: 0.22, life: 0.5, grav: 6 }) } break
      case 'slide': this.snd('slide'); this.buzz('slide'); this.burst(p.x, 0.1, 0.5, 8, [0xfff1d6, 0xffd166], { speed: 2, up: 1.5, size: 0.16, life: 0.4, vz: 8 }); break
      case 'lane': this.snd('lane'); this.buzz('lane'); this.burst(p.x - (e.v ?? 0) * 1.2, 0.1, 0.2, 4, [0xfff1d6], { speed: 2, up: 1, size: 0.14, life: 0.3, grav: 4 }); break
      case 'peach': {
        this.snd('peach', e.v ?? 0); this.buzz('peach')
        this.burst(p.x, p.y + 1.2, -0.4, 14, [0xff8f6b, 0xffa05f, 0xffd166, 0xff6b6b, 0xfff1d6], { speed: 5.5, up: 3, size: 0.2, life: 0.6, grav: 12 })
        this.burst(p.x, p.y + 1.2, -0.4, 3, [0x6fb04a, 0x4f9f3d], { speed: 4, up: 3, size: 0.17, life: 0.7, grav: 8 })
        if (this.mode === 'play') {
          const el = $('h-peaches'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop')
          const sc = $('h-score'); sc.classList.add('pop'); setTimeout(() => sc.classList.remove('pop'), 90)
        }
        break
      }
      case 'combo': this.snd('combo'); this.buzz('combo'); this.callout(`COMBO x${e.v}`, 'KEEP IT ROLLING'); this.doFlash('#ffd166', 0.28); this.fovKick = 6; break
      case 'near':
        this.snd('near'); this.buzz('near'); this.addShake(0.3); this.fovKick = 7; this.lines.amount = 1.1
        this.callout('NEAR MISS!', `+${100 * s.perk.nearMul * s.mult} SCORE`)
        this.burst(p.x, p.y + 1, -0.5, 16, [0xffd166, 0xfff1d6, 0xff5e4a], { speed: 7, up: 1, size: 0.16, life: 0.4, grav: 2 }); break
      case 'tea': case 'board': {
        this.snd(e.t); this.buzz(e.t); this.addShake(0.35); this.doFlash(e.t === 'tea' ? '#ffb347' : '#2ec4b6', 0.4); this.fovKick = 8
        this.callout(e.t === 'tea' ? 'SWEET TEA' : 'BELTLINE BOARD', e.t === 'tea' ? 'PEACH MAGNET ON' : 'SHIELD UP - TAKES A HIT')
        this.burst(p.x, p.y + 1, -0.3, 46, e.t === 'tea' ? [0xffb347, 0xffd166, 0xfff1d6, 0xff8f6b] : [0x2ec4b6, 0x7ff0e2, 0xfff1d6, 0xffd166], { speed: 8, up: 4, size: 0.2, life: 0.9, grav: 8 }); break
      }
      case 'pad':
        this.snd('pad'); this.buzz('pad'); this.addShake(0.4); this.fovKick = 14; this.lines.amount = 1.3; this.doFlash('#ffe066', 0.35)
        this.callout('TURBO!', 'HOLD ON TO YOUR HAT'); this.burst(p.x, 0.3, 1, 30, [0xffd04a, 0xfff1d6, 0xff8f6b], { speed: 6, up: 2, size: 0.2, life: 0.6, grav: 6, vz: 14 }); break
      case 'shield':
        this.snd('shield'); this.buzz('shield'); this.addShake(0.8); this.hitStop = 0.09; this.doFlash('#ffffff', 0.7)
        this.callout('BOARD SMASHED!', 'YOU LIVE TO RUN'); this.burst(p.x, p.y + 1, -0.3, 60, [0x2ec4b6, 0x7ff0e2, 0xfff1d6, 0xffc83d], { speed: 10, up: 3, size: 0.24, life: 0.9, grav: 10 }); break
      case 'crash':
        if (this.mode !== 'play') break
        this.sound.sfx('crash'); Haptics.play('crash'); this.hitStop = 0.14; this.addShake(1.3); this.doFlash('#ff3b30', 0.55); this.sound.stopMusic()
        this.burst(p.x, p.y + 1, -0.6, 70, [0xff6b5b, 0xffc83d, 0xfff1d6, 0xff8f6b, 0x2b1a33], { speed: 11, up: 5, size: 0.32, life: 1.1, grav: 18 })
        this.dying = 1; setTimeout(() => this.showOver(), this.save.settings.reduced ? 300 : 1000); break
      case 'revive':
        this.sound.sfx('revive'); Haptics.play('revive'); this.doFlash('#ffd166', 0.6); this.addShake(0.4)
        this.callout('SECOND CHANCE', 'GO GO GO'); this.burst(p.x, 1, 0, 50, [0xffd166, 0xfff1d6, 0xff8f6b], { speed: 9, up: 4, size: 0.22, life: 1, grav: 6 }); break
    }
  }

  /* ---------- run end ---------- */
  commit() {
    const st = this.sim.stats, d = { peaches: st.peaches, near: st.near, dist: Math.floor(this.sim.dist), jumps: st.jumps }
    const delta = { peaches: d.peaches - this.committed.peaches, near: d.near - this.committed.near, dist: d.dist - this.committed.dist, jumps: d.jumps - this.committed.jumps, score: this.sim.score }
    const prevBest = this.save.best, runsBefore = this.save.runs
    const reward = applyRun(this.save, this.today, delta)
    if (this.committed.dist > 0) this.save.runs = runsBefore
    this.committed = d; this.persist()
    return { reward, isBest: Math.floor(this.sim.score) > prevBest }
  }
  reviveCost() { return Math.min(400, 100 + Math.floor(this.sim.dist / 40) * 5) }
  showOver() {
    if (this.mode !== 'play') return
    const r = this.commit(), s = this.sim, m = dailyMission(this.today)
    this.mode = 'over'; this.show('over')
    $('o-score').textContent = Math.floor(s.score).toLocaleString()
    $('o-grid').innerHTML = [['DISTANCE', `${Math.floor(s.dist)} m`], ['PEACHES', `+${Math.floor(s.peaches)}`], ['NEAR MISSES', s.stats.near], ['BEST COMBO', s.stats.maxCombo]].map(([a, b]) => `<div class="cell">${a}<b>${b}</b></div>`).join('')
    const dp = this.save.daily
    $('o-daily').innerHTML = r.reward ? `DAILY COMPLETE: ${m.text} <b>+${r.reward}</b> peaches` : dp.claimed ? 'DAILY MISSION DONE. COME BACK TOMORROW.' : `DAILY: ${m.text} (${Math.min(dp.progress, m.target)}/${m.target})`
    const b = $<HTMLButtonElement>('o-second'), cost = this.reviveCost()
    b.hidden = s.reviveUsed; b.disabled = this.save.peaches < cost
    b.innerHTML = `SECOND CHANCE <i class="pdot"></i> ${cost}${b.disabled ? ' (NEED MORE)' : ''}`
    $('o-ribbon').textContent = r.isBest && s.score > 0 ? 'NEW HIGH SCORE' : ['WIPED OUT', 'FOOD TRUCK 1, YOU 0', 'THAT WAS A WALL', 'ATL TRAFFIC WINS'][Math.floor(Math.random() * 4)]
  }

  /* ---------- UI ---------- */
  refreshTitle() {
    $('t-peaches').textContent = String(this.save.peaches); $('t-best').textContent = this.save.best.toLocaleString()
    const m = dailyMission(this.today), d = this.save.daily.date === this.today ? this.save.daily : { progress: 0, claimed: false }
    $('t-daily').innerHTML = d.claimed ? '<b>DAILY DONE</b>New mission tomorrow.' : `<b>DAILY: ${m.text}</b>${Math.min(d.progress, m.target)}/${m.target} &middot; REWARD +${m.reward}<div class="meter"><i style="width:${Math.min(100, (d.progress / m.target) * 100)}%"></i></div>`
  }
  buildLogo() {
    const f = (id: string, t: string, off: number) => { $(id).innerHTML = [...t].map((c, i) => `<span style="--k:${i + off}">${c}</span>`).join('') }
    f('logo1', 'PEACH', 0); f('logo2', 'DASH', 5)
  }
  buildSettings() {
    const rows: [keyof Save['settings'], string][] = [['sfx', 'SOUND FX'], ['music', 'MUSIC'], ['haptics', 'HAPTICS'], ['reduced', 'REDUCED MOTION'], ['quality', 'QUALITY']]
    const s = this.save.settings
    $('s-list').innerHTML = rows.map(([k, l]) => {
      const on = k === 'quality' ? s.quality === 'high' : !!s[k]
      return `<div class="set" data-set="${k}"><span>${l}</span><div class="tog ${on ? 'on' : ''}">${k === 'quality' ? (on ? 'HIGH' : 'LOW') : on ? 'ON' : 'OFF'}</div></div>`
    }).join('')
  }
  renderRunnerCard() {
    const c = CHARACTERS[this.idx], owned = this.save.owned.includes(c.id), eq = this.save.selected === c.id
    $('r-peaches').textContent = String(this.save.peaches)
    $('r-name').textContent = c.name; $('r-role').textContent = c.role; $('r-blurb').textContent = c.blurb
    $('r-perkname').textContent = c.perkName; $('r-perk').textContent = c.perkText
    $('r-dots').innerHTML = CHARACTERS.map((_, i) => `<i class="${i === this.idx ? 'on' : ''}"></i>`).join('')
    $('r-stats').innerHTML = (['speed', 'grip', 'luck'] as const).map(k => `<div class="stat"><span>${k.toUpperCase()}</span><div class="pips">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= c.stats[k] ? 'f' : ''}"></i>`).join('')}</div></div>`).join('')
    const b = $<HTMLButtonElement>('r-action')
    b.className = 'btn big ' + (eq ? 'own' : owned ? '' : 'buy')
    b.innerHTML = eq ? 'EQUIPPED' : owned ? 'EQUIP' : `UNLOCK <i class="pdot"></i> ${c.cost}`
  }
  runnerAction() {
    const c = CHARACTERS[this.idx]
    if (!this.save.owned.includes(c.id)) {
      if (this.save.peaches < c.cost) {
        const card = document.querySelector('.rcard') as HTMLElement; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); Haptics.play('crash'); return
      }
      this.save.peaches -= c.cost; this.save.owned.push(c.id); this.sound.sfx('buy'); Haptics.play('buy'); this.doFlash('#ffd166', 0.5)
      this.burst(0, 1.2, 0, 60, [0xffd166, 0xff8f6b, 0xfff1d6, 0x2ec4b6], { speed: 8, up: 4, size: 0.22, life: 1, grav: 6 })
    }
    this.save.selected = c.id; this.sim.perk = c.perk; this.persist(); this.renderRunnerCard()
  }
  pick(d: number) {
    this.idx = (this.idx + d + CHARACTERS.length) % CHARACTERS.length
    this.showRunner(CHARACTERS[this.idx].id); this.renderRunnerCard(); Haptics.play('ui')
  }
  act(a: string) {
    this.sound.unlock(); Haptics.play('ui')
    if (a !== 'action' && a !== 'second') this.sound.sfx('ui')
    switch (a) {
      case 'play': this.wipe(() => this.startRun()); break
      case 'again': if (this.mode === 'over') this.wipe(() => this.startRun()); break
      case 'runners': this.go('runners'); break
      case 'settings': this.go('settings'); break
      case 'back': this.go('title'); break
      case 'prev': this.pick(-1); break
      case 'next': this.pick(1); break
      case 'action': this.runnerAction(); break
      case 'pause': this.pause(); break
      case 'resume': this.resume(); break
      case 'quit': this.wipe(() => { this.sound.stopMusic(); this.startAttract(); this.mode = 'title'; this.show('title'); this.refreshTitle(); this.showRunner(this.save.selected) }); break
      case 'second': {
        const cost = this.reviveCost(); if (this.save.peaches < cost || this.sim.reviveUsed) return
        this.save.peaches -= cost; this.persist(); this.sim.revive(); this.dying = 0; this.mode = 'play'; this.show('hud'); this.sound.startMusic(); break
      }
    }
  }
  pause() { if (this.mode !== 'play') return; this.mode = 'pause'; this.show('pause'); this.sound.stopMusic() }
  resume() { if (this.mode !== 'pause') return; this.mode = 'play'; this.show('hud'); this.sound.startMusic(); this.last = performance.now() }
  bindUI() {
    $('ui').addEventListener('click', e => {
      const t = (e.target as HTMLElement).closest('[data-act],[data-set]') as HTMLElement | null
      if (!t) return
      if (t.dataset.act) return this.act(t.dataset.act)
      const k = t.dataset.set as keyof Save['settings'], s = this.save.settings as unknown as Record<string, unknown>
      s[k] = k === 'quality' ? (s.quality === 'high' ? 'low' : 'high') : !s[k]
      this.persist(); this.applySettings(); this.buildSettings(); this.sound.unlock(); this.sound.sfx('ui'); Haptics.play('ui')
    })
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause() })
  }
  bindInput() {
    const act = (d: 'l' | 'r' | 'u' | 'd') => {
      if (this.mode === 'runners') { if (d === 'l') this.pick(-1); if (d === 'r') this.pick(1); return }
      if (this.mode !== 'play' || this.sim.state !== 'run' || this.botOn) return
      if (d === 'l') this.sim.left()
      if (d === 'r') this.sim.right()
      if (d === 'u') this.sim.jump()
      if (d === 'd') this.sim.slide()
    }
    addEventListener('keydown', e => {
      this.sound.unlock()
      const k = e.key.toLowerCase()
      if (['arrowleft', 'a'].includes(k)) act('l')
      else if (['arrowright', 'd'].includes(k)) act('r')
      else if (['arrowup', 'w', ' '].includes(k)) { act('u'); if (this.mode === 'title' && k === ' ') this.act('play') }
      else if (['arrowdown', 's'].includes(k)) act('d')
      else if (k === 'escape' || k === 'p') this.mode === 'pause' ? this.resume() : this.pause()
      else if (k === 'enter') { if (this.mode === 'title') this.act('play'); else if (this.mode === 'over') this.act('again') }
      if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
    })
    let sx = 0, sy = 0, on = false
    const app = $('app')
    app.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('button,.panel,.rcard')) return; sx = e.clientX; sy = e.clientY; on = true; this.sound.unlock() })
    app.addEventListener('pointermove', e => {
      if (!on) return
      const dx = e.clientX - sx, dy = e.clientY - sy
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
      if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'l' : 'r'); else act(dy < 0 ? 'u' : 'd')
      sx = e.clientX; sy = e.clientY
    })
    addEventListener('pointerup', () => { on = false }); addEventListener('pointercancel', () => { on = false })
  }

  /* ---------- HUD ---------- */
  setText(id: string, v: string) { if (this.cache.get(id) !== v) { this.cache.set(id, v); $(id).textContent = v } }
  hud() {
    const s = this.sim
    this.setText('h-score', Math.floor(s.score).toLocaleString()); this.setText('h-dist', String(Math.floor(s.dist)))
    this.setText('h-peaches', String(Math.floor(s.peaches)))
    const cb = $('h-combo'), showC = s.combo >= 3
    cb.classList.toggle('on', showC)
    if (showC) {
      const t = `x${s.mult}  ${s.combo} STREAK`
      if (this.cache.get('mult') !== t) { this.cache.set('mult', t); const m = $('h-mult'); m.textContent = t; m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump') }
      $('h-combobar').style.transform = `scaleX(${Math.max(0, s.comboT / 2.6)})`
    }
    const pw: [string, string, number, number, string][] = [['tea', 'SWEET TEA', s.tea, 10 * s.perk.powerMul, '#ffb347'], ['board', 'BOARD', s.board, 18 * s.perk.powerMul, '#2ec4b6']]
    const box = $('h-powers')
    for (const [k, label, v, max, col] of pw) {
      let el = box.querySelector<HTMLElement>(`[data-p="${k}"]`)
      if (v > 0 && !el) { el = document.createElement('div'); el.className = 'pw'; el.dataset.p = k; el.innerHTML = `<i class="ic" style="background:${col}"></i><span>${label}</span><div class="t"><u></u></div>`; box.appendChild(el) }
      if (el) { if (v <= 0) el.remove(); else (el.querySelector('u') as HTMLElement).style.width = `${Math.min(100, (v / max) * 100)}%` }
    }
    const d = districtAt(s.dist + 25)
    if (d !== this.lastDistrict) {
      this.lastDistrict = d; const D = DISTRICTS[d]
      this.distEl.querySelector('b')!.textContent = D.name; this.distEl.querySelector('em')!.textContent = D.sub
      this.distEl.classList.remove('go'); void this.distEl.offsetWidth; this.distEl.classList.add('go')
    }
  }

  /* ---------- frame ---------- */
  frame(now: number) {
    requestAnimationFrame(t => this.frame(t))
    const real = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = now; this.clock += real
    const s = this.sim, reduced = this.save.settings.reduced
    let ts = 1
    if (this.hitStop > 0) { this.hitStop -= real; ts = 0 }
    const live = this.mode === 'play' || (this.attract && (this.mode === 'title' || this.mode === 'runners' || this.mode === 'settings'))
    if (this.mode === 'pause' || this.mode === 'over') ts = 0
    if (this.mode === 'runners' || this.mode === 'settings') ts *= 0.18
    if (live && ts > 0 && s.state === 'run') {
      this.botT -= real
      if ((this.attract || this.botOn) && this.botT <= 0) { botAct(s); this.botT = 0.045 }
      s.step(real * ts)
    }
    if (this.attract && s.dist > 6000) this.startAttract()
    const p = s.p, dt = real
    const still = this.mode === 'runners' || this.mode === 'settings'
    const running = !still && s.state === 'run'
    if (ts > 0 && running) this.phase += dt * (8 + s.speed * 0.3)
    const tgt = laneX(p.lane) - p.x
    this.lean += ((tgt / LANE_W) * 1.8 - this.lean) * (1 - Math.exp(-dt * 14))
    this.cur.update(dt, { phase: this.phase, air: p.y > 0.06 && s.state === 'run', slide: p.slide > 0 ? 1 : 0, lean: this.lean, crash: s.state === 'dead' ? 1 : 0, idle: still, t: this.clock })
    const showcase = this.mode === 'runners'
    const r = this.cur.root, sc = this.cur.look.scale
    this.sq += (0 - this.sq) * (1 - Math.exp(-dt * 9))
    r.scale.set(sc * (1 + this.sq * 0.14), sc * (1 - this.sq * 0.2), sc * (1 + this.sq * 0.14))
    r.position.set(showcase ? 0 : p.x, p.y, 0)
    r.rotation.y += ((showcase ? Math.PI * 0.88 : 0) - r.rotation.y) * (1 - Math.exp(-dt * 8))
    r.visible = s.invuln > 0 && s.state === 'run' && !this.attract ? Math.floor(this.clock * 18) % 2 === 0 : true
    if (s.board > 0 && this.mode === 'play' && Math.random() < 0.5) this.fx.emit({ x: p.x + (Math.random() - 0.5) * 0.8, y: p.y + 0.1, z: 0.3, n: 1, colors: [0x2ec4b6, 0x7ff0e2], speed: 0.8, up: 0.5, size: 0.13, life: 0.5, grav: 0 })
    if (running && ts > 0 && !p.air && Math.random() < 0.35) this.fx.emit({ x: p.x + (Math.random() - 0.5) * 0.4, y: 0.08, z: 0.2, n: 1, colors: [0xfff1d6, 0xe8c9a0], speed: 1, up: 0.8, size: 0.14, life: 0.4, grav: 2, vz: 2 })
    // world
    this.atm.update(s.dist, this.clock, this.camera.position, this.world.winMats)
    bendU.uCurve.value = Math.sin(s.dist / 520) * 0.00035 * (reduced ? 0.4 : 1)
    this.world.update(s.dist, this.clock)
    this.ent.update(s, this.clock)
    this.fx.update(dt * (this.hitStop > 0 ? 0.15 : 1), running ? s.speed : 0)
    const want = reduced || !running ? 0 : Math.min(1, Math.max(0, (s.speed - 21) / 15)) * 0.6 + (s.boost > 0 ? 0.7 : 0)
    this.lines.amount += (want - this.lines.amount) * (1 - Math.exp(-dt * 6))
    this.lines.update(dt, s.speed, this.camera.position.x, this.camera.position.y, this.camera.position.z)
    this.sound.intensity = Math.min(1, Math.max(0, (s.speed - 17) / 19))
    if (this.mode === 'play') this.hud()
    this.updateCamera(dt)
    this.renderer.render(this.scene, this.camera)
  }

  updateCamera(dt: number) {
    const s = this.sim, p = s.p, pf = this.portrait, wide = this.camera.aspect > 1.2
    const back = 8.2 + 3.2 * pf, h = 5.1 + 1.7 * pf
    let pos: THREE.Vector3, look: THREE.Vector3, fov = 66 + 12 * pf
    if (this.mode === 'title') {
      pos = new THREE.Vector3(wide ? -3.4 : -2.4, 1.9 + pf * 0.6, 5.4 + pf * 1.5); look = new THREE.Vector3(wide ? -0.6 : 0.3, 1.8 - pf * 1.5, -5); fov = 52 + 14 * pf
    } else if (this.mode === 'runners' || this.mode === 'settings') {
      pos = new THREE.Vector3(wide ? 3.2 : 1.1, 1.5 + pf * 0.3, 4.6 + pf * 3.6); look = new THREE.Vector3(wide ? 0.4 : 0, 1.35 - pf * 1.5, 0); fov = 46 + 12 * pf
    } else {
      pos = new THREE.Vector3(p.x * 0.55, h + Math.max(0, p.y) * 0.3, back); look = new THREE.Vector3(p.x * 0.4, 3.0 + Math.max(0, p.y) * 0.25, -13)
      if (s.state === 'dead') { pos.set(p.x * 0.5 + 1.2, h * 0.7, back * 0.72); look.set(p.x, 1, -2) }
    }
    const k = 1 - Math.exp(-dt * (this.mode === 'play' ? 12 : 4))
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k)
    this.fovKick *= Math.exp(-dt * 4)
    this.camFov += (fov + this.fovKick - this.camFov) * (1 - Math.exp(-dt * 8))
    const red = this.save.settings.reduced
    this.shake *= Math.exp(-dt * 5)
    const sh = this.shake * 0.35
    this.camera.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh * 0.5))
    this.camera.lookAt(this.camLook)
    if (!red) this.camera.rotateZ(-this.lean * 0.025 + (Math.random() - 0.5) * this.shake * 0.02)
    if (Math.abs(this.camera.fov - this.camFov) > 0.01) { this.camera.fov = this.camFov; this.camera.updateProjectionMatrix() }
  }
}

const game = new Game()
game.init().catch(err => {
  console.error(err)
  const pre = document.createElement('pre')
  pre.style.cssText = 'position:fixed;inset:0;color:#fff;background:#2b1a33;padding:20px;z-index:99'
  pre.textContent = 'PEACH DASH failed to start:\n' + String(err)
  document.body.appendChild(pre)
})
