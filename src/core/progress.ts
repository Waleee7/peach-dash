import { hashStr, mulberry32 } from './rng'

/* ---------------- mission sets: three at a time, a finished set raises your score level ---------------- */
export type MStat = 'peaches' | 'near' | 'dist' | 'jumps' | 'slides' | 'powerups' | 'crates' | 'combo' | 'train' | 'letters' | 'score' | 'smashed' | 'geese'
export interface MissionItem { id: string; stat: MStat; mode: 'sum' | 'max'; target: number; progress: number; text: string }
interface Tpl { stat: MStat; mode: 'sum' | 'max'; base: number; text: (n: number) => string }
const POOL: Tpl[] = [
  { stat: 'peaches', mode: 'sum', base: 60, text: n => `Grab ${n} peaches` },
  { stat: 'near', mode: 'sum', base: 6, text: n => `Pull ${n} near-misses` },
  { stat: 'dist', mode: 'max', base: 1500, text: n => `Run ${n} m in one go` },
  { stat: 'jumps', mode: 'sum', base: 30, text: n => `Jump ${n} times` },
  { stat: 'slides', mode: 'sum', base: 20, text: n => `Slide ${n} times` },
  { stat: 'powerups', mode: 'sum', base: 4, text: n => `Grab ${n} power-ups` },
  { stat: 'crates', mode: 'sum', base: 2, text: n => `Open ${n} Peach Crates` },
  { stat: 'combo', mode: 'max', base: 14, text: n => `Reach a ${n} peach streak` },
  { stat: 'train', mode: 'sum', base: 250, text: n => `Run ${n} m on top of trains` },
  { stat: 'letters', mode: 'sum', base: 3, text: n => `Collect ${n} ATLANTA letters` },
  { stat: 'score', mode: 'max', base: 3000, text: n => `Score ${n} in one run` },
  { stat: 'smashed', mode: 'sum', base: 5, text: n => `Smash ${n} obstacles with a Wing` },
  { stat: 'geese', mode: 'sum', base: 2, text: n => `Shake off the geese ${n} times` },
]
const nice = (n: number) => (n < 20 ? Math.round(n) : n < 200 ? Math.round(n / 5) * 5 : Math.round(n / 50) * 50)
/** Deterministic: the same set index and level always give the same three missions. */
export function newMissionSet(level: number, setIdx: number): MissionItem[] {
  const r = mulberry32(hashStr('peach-missions:' + setIdx))
  const idx = POOL.map((_, i) => i)
  const out: MissionItem[] = []
  for (let i = 0; i < 3; i++) {
    const t = POOL[idx.splice(Math.floor(r() * idx.length), 1)[0]]
    const target = nice(t.base * (1 + 0.12 * (Math.max(1, level) - 1)))
    out.push({ id: `${setIdx}-${t.stat}`, stat: t.stat, mode: t.mode, target, progress: 0, text: t.text(target) })
  }
  return out
}
/** +10% score per level, capped at level 20. */
export const levelMul = (level: number) => 1 + 0.1 * (Math.min(20, Math.max(1, level)) - 1)
export type RunStats = Partial<Record<MStat, number>>
export interface MissionState { level: number; set: number; items: MissionItem[] }
export const freshMissions = (): MissionState => ({ level: 1, set: 0, items: newMissionSet(1, 0) })
/** `delta` feeds cumulative missions, `abs` (whole-run values) feeds "in one run" missions. */
export function applyMissions(m: MissionState, delta: RunStats, abs: RunStats): { done: MissionItem[]; levelUp: boolean; reward: number } {
  const done: MissionItem[] = []
  for (const it of m.items) {
    if (it.progress >= it.target) continue
    it.progress = it.mode === 'sum' ? it.progress + (delta[it.stat] ?? 0) : Math.max(it.progress, abs[it.stat] ?? 0)
    if (it.progress >= it.target) { it.progress = it.target; done.push(it) }
  }
  if (m.items.every(i => i.progress >= i.target)) {
    m.level++; m.set++; m.items = newMissionSet(m.level, m.set)
    return { done, levelUp: true, reward: 100 * m.level }
  }
  return { done, levelUp: false, reward: 0 }
}

/* ---------------- ATLANTA letter hunt: one word per day ---------------- */
export const LETTER_WORD = 'ATLANTA'
export const LETTER_REWARD = 300
export interface LetterState { date: string; idx: number; claimed: boolean }
export const freshLetters = (): LetterState => ({ date: '', idx: 0, claimed: false })
/** Resets on a new day; returns the state to run with. */
export function lettersFor(l: LetterState, date: string): LetterState {
  if (l.date !== date) { l.date = date; l.idx = 0; l.claimed = false }
  return l
}
/** Stores the run's progress; pays out once when the word is finished. */
export function commitLetters(l: LetterState, date: string, idx: number): number {
  lettersFor(l, date)
  l.idx = Math.max(l.idx, Math.min(LETTER_WORD.length, idx))
  if (l.idx >= LETTER_WORD.length && !l.claimed) { l.claimed = true; return LETTER_REWARD }
  return 0
}

/* ---------------- daily login ---------------- */
export const LOGIN_REWARDS = [50, 75, 100, 150, 200, 300, 500]
export interface LoginState { last: string; streak: number }
export const freshLogin = (): LoginState => ({ last: '', streak: 0 })
export function yesterday(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(y, m - 1, d - 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}
export function loginStatus(l: LoginState, today: string) {
  if (l.last === today) return { pending: false, day: ((l.streak - 1) % 7) + 1, streak: l.streak, reward: 0 }
  const streak = l.last === yesterday(today) ? l.streak + 1 : 1
  const day = ((streak - 1) % 7) + 1
  return { pending: true, day, streak, reward: LOGIN_REWARDS[day - 1] }
}
/** Marks today claimed and returns the peaches to add (0 if already claimed). */
export function claimLogin(l: LoginState, today: string): number {
  const s = loginStatus(l, today)
  if (!s.pending) return 0
  l.last = today; l.streak = s.streak
  return s.reward
}

/* ---------------- local top-10 ---------------- */
export interface BoardEntry { score: number; dist: number; char: string; date: string }
export const BOARD_SIZE = 10
/** Inserts a run; ties rank below earlier equal scores. Returns the 1-based rank, or 0 if it missed the top 10. */
export function addToBoard(board: BoardEntry[], e: BoardEntry): number {
  if (e.score <= 0) return 0
  let i = board.findIndex(b => b.score < e.score)
  if (i < 0) i = board.length
  if (i >= BOARD_SIZE) return 0
  board.splice(i, 0, e)
  if (board.length > BOARD_SIZE) board.length = BOARD_SIZE
  return i + 1
}
export function removeFromBoard(board: BoardEntry[], e: BoardEntry) { const i = board.indexOf(e); if (i >= 0) board.splice(i, 1) }
