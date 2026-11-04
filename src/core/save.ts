import { hashStr, mulberry32 } from './rng'

export interface Settings { sfx: boolean; music: boolean; haptics: boolean; reduced: boolean; quality: 'high' | 'low' }
export interface Save {
  v: 1; peaches: number; best: number; bestDist: number; runs: number
  owned: string[]; selected: string; settings: Settings
  daily: { date: string; progress: number; claimed: boolean }
}
export const SAVE_KEY = 'peachdash.v1'
export const defaultSave = (): Save => ({
  v: 1, peaches: 300, best: 0, bestDist: 0, runs: 0, owned: ['juno'], selected: 'juno',
  settings: { sfx: true, music: true, haptics: true, reduced: false, quality: 'high' },
  daily: { date: '', progress: 0, claimed: false },
})
type Store = Pick<Storage, 'getItem' | 'setItem'>
export function loadSave(st: Store): Save {
  const d = defaultSave()
  try {
    const raw = st.getItem(SAVE_KEY)
    if (!raw) return d
    const j = JSON.parse(raw)
    if (!j || typeof j !== 'object' || j.v !== 1) return d
    const owned: string[] = Array.isArray(j.owned) ? j.owned.filter((x: unknown) => typeof x === 'string') : d.owned
    if (!owned.includes('juno')) owned.push('juno')
    const num = (x: unknown, f: number) => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : f)
    return {
      v: 1, peaches: num(j.peaches, d.peaches), best: num(j.best, 0), bestDist: num(j.bestDist, 0), runs: num(j.runs, 0),
      owned, selected: owned.includes(j.selected) ? j.selected : 'juno',
      settings: { ...d.settings, ...(typeof j.settings === 'object' && j.settings ? j.settings : {}) },
      daily: { ...d.daily, ...(typeof j.daily === 'object' && j.daily ? j.daily : {}) },
    }
  } catch { return d }
}
export function writeSave(st: Store, s: Save) { try { st.setItem(SAVE_KEY, JSON.stringify(s)) } catch { /* private mode */ } }

export interface Mission { id: string; text: string; stat: 'peaches' | 'near' | 'dist' | 'jumps'; target: number; reward: number }
const TEMPLATES: { id: Mission['id']; stat: Mission['stat']; targets: number[]; text: (n: number) => string }[] = [
  { id: 'peaches', stat: 'peaches', targets: [40, 60, 90], text: n => `Grab ${n} peaches` },
  { id: 'near', stat: 'near', targets: [4, 6, 8], text: n => `Pull ${n} near-misses` },
  { id: 'dist', stat: 'dist', targets: [1500, 2400, 3200], text: n => `Run ${n} meters` },
  { id: 'jumps', stat: 'jumps', targets: [25, 40, 60], text: n => `Jump ${n} times` },
]
/** Same mission for everyone on a given date. */
export function dailyMission(date: string): Mission {
  const r = mulberry32(hashStr('peach-dash:' + date))
  const t = TEMPLATES[Math.floor(r() * TEMPLATES.length)]
  const target = t.targets[Math.floor(r() * t.targets.length)]
  return { id: t.id, stat: t.stat, target, text: t.text(target), reward: 150 + Math.floor(r() * 3) * 50 }
}
/** Applies a finished run to the save. Returns reward if the mission just completed. */
export function applyRun(s: Save, date: string, run: { peaches: number; near: number; dist: number; jumps: number; score: number }): number {
  const m = dailyMission(date)
  if (s.daily.date !== date) s.daily = { date, progress: 0, claimed: false }
  s.runs++
  s.best = Math.max(s.best, Math.floor(run.score)); s.bestDist = Math.max(s.bestDist, Math.floor(run.dist))
  s.peaches += Math.floor(run.peaches)
  if (!s.daily.claimed) {
    s.daily.progress += run[m.stat]
    if (s.daily.progress >= m.target) { s.daily.claimed = true; s.peaches += m.reward; return m.reward }
  }
  return 0
}
