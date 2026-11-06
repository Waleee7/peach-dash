import { hashStr, mulberry32 } from './rng'
import { POWER_KINDS, MAX_UPGRADE, type PowerKind } from './powers'
import { freshLetters, freshLogin, freshMissions, newMissionSet, BOARD_SIZE, type BoardEntry, type LetterState, type LoginState, type MissionState } from './progress'

export interface Settings { sfx: boolean; music: boolean; haptics: boolean; reduced: boolean; quality: 'high' | 'low'; tilt: boolean }
export interface Save {
  v: 1; peaches: number; best: number; bestDist: number; runs: number
  owned: string[]; selected: string; settings: Settings
  daily: { date: string; progress: number; claimed: boolean }
  upgrades: Record<PowerKind, number>
  missions: MissionState; letters: LetterState; login: LoginState; board: BoardEntry[]; badgeSets: number
}
export const SAVE_KEY = 'peachdash.v1'
export const defaultSave = (): Save => ({
  v: 1, peaches: 300, best: 0, bestDist: 0, runs: 0, owned: ['juno'], selected: 'juno',
  settings: { sfx: true, music: true, haptics: true, reduced: false, quality: 'high', tilt: false },
  daily: { date: '', progress: 0, claimed: false },
  upgrades: { wing: 0, tea: 0, cobbler: 0, kicks: 0, glide: 0, board: 0 },
  missions: freshMissions(), letters: freshLetters(), login: freshLogin(), board: [], badgeSets: 0,
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
      v: 1, peaches: num(j.peaches, d.peaches), best: num(j.best, 0), bestDist: num(j.bestDist, 0), runs: num(j.runs, 0), badgeSets: Math.floor(num(j.badgeSets, 0)),
      owned, selected: owned.includes(j.selected) ? j.selected : 'juno',
      settings: { ...d.settings, ...(typeof j.settings === 'object' && j.settings ? j.settings : {}) },
      daily: { ...d.daily, ...(typeof j.daily === 'object' && j.daily ? j.daily : {}) },
      upgrades: Object.fromEntries(POWER_KINDS.map(k => [k, Math.min(MAX_UPGRADE, Math.floor(num(j.upgrades?.[k], 0)))])) as Record<PowerKind, number>,
      missions: cleanMissions(j.missions) ?? d.missions,
      letters: { ...d.letters, ...(typeof j.letters === 'object' && j.letters ? { date: String(j.letters.date ?? ''), idx: Math.min(7, num(j.letters.idx, 0)), claimed: !!j.letters.claimed } : {}) },
      login: { last: typeof j.login?.last === 'string' ? j.login.last : '', streak: num(j.login?.streak, 0) },
      board: Array.isArray(j.board) ? j.board.filter((b: any) => b && typeof b.score === 'number' && b.score > 0).slice(0, BOARD_SIZE).map((b: any) => ({ score: b.score, dist: num(b.dist, 0), char: String(b.char ?? 'juno'), date: String(b.date ?? '') })) : [],
    }
  } catch { return d }
}
function cleanMissions(m: any): MissionState | null {
  if (!m || typeof m !== 'object' || !Array.isArray(m.items) || m.items.length !== 3) return null
  const level = typeof m.level === 'number' && m.level >= 1 ? Math.floor(m.level) : 1, set = typeof m.set === 'number' && m.set >= 0 ? Math.floor(m.set) : 0
  const fresh = newMissionSet(level, set)
  // keep stored progress only where the definition still matches
  return { level, set, items: fresh.map((f, i) => { const o = m.items[i]; return o && o.id === f.id && typeof o.progress === 'number' ? { ...f, progress: Math.min(f.target, Math.max(0, o.progress)) } : f }) }
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
