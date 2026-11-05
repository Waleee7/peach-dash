/** Atlanta-flavoured power-ups: definitions, upgrade path (bought with peaches) and the Peach Crate table. */
export type PowerKind = 'wing' | 'tea' | 'cobbler' | 'kicks' | 'glide' | 'board'
export const POWER_KINDS: PowerKind[] = ['wing', 'tea', 'cobbler', 'kicks', 'glide', 'board']

export interface PowerDef {
  id: PowerKind; name: string; short: string; desc: string
  base: number            // seconds at upgrade level 0 (board: seconds until it expires unused)
  css: string; hex: number
}
export const POWERS: Record<PowerKind, PowerDef> = {
  wing: { id: 'wing', name: 'LEMON PEPPER WING', short: 'WING', desc: 'Speed burst. Smash it all.', base: 6, css: '#ffd23d', hex: 0xffd23d },
  tea: { id: 'tea', name: 'SWEET TEA', short: 'TEA', desc: 'Peaches fly to you.', base: 10, css: '#ffb347', hex: 0xffb347 },
  cobbler: { id: 'cobbler', name: 'PEACH COBBLER', short: 'COBBLER', desc: 'Double score.', base: 12, css: '#ff8f6b', hex: 0xff8f6b },
  kicks: { id: 'kicks', name: 'SUPER KICKS', short: 'KICKS', desc: 'Super jump. Hop on trains.', base: 14, css: '#ff4d6d', hex: 0xff4d6d },
  glide: { id: 'glide', name: 'SKYVIEW GLIDE', short: 'GLIDE', desc: 'Fly. Peach trail.', base: 6, css: '#6fe0d0', hex: 0x6fe0d0 },
  board: { id: 'board', name: 'BELTLINE BOARD', short: 'BOARD', desc: 'Shield. Eats a crash.', base: 18, css: '#2ec4b6', hex: 0x2ec4b6 },
}

export const MAX_UPGRADE = 5
/** Peaches to go from level i to i+1. */
export const UPGRADE_COST = [120, 240, 420, 650, 950]
export const upgradeCost = (level: number) => (level >= MAX_UPGRADE ? 0 : UPGRADE_COST[Math.max(0, level)])
/** +20% duration per level. */
export const upgradeMul = (level: number) => 1 + 0.2 * Math.max(0, Math.min(MAX_UPGRADE, level))
export const powerDuration = (kind: PowerKind, level: number, perkMul = 1) => POWERS[kind].base * upgradeMul(level) * perkMul

/** Buy the next level. Returns false when maxed or too poor. */
export function buyUpgrade(levels: Record<PowerKind, number>, peaches: number, kind: PowerKind): number | false {
  const lv = levels[kind] ?? 0, cost = upgradeCost(lv)
  if (lv >= MAX_UPGRADE || peaches < cost) return false
  levels[kind] = lv + 1
  return cost
}

export type CrateReward = { type: 'peaches'; amount: number } | { type: 'power'; kind: PowerKind }
/** Peach Crate: weighted random reward. `noPeaches` (a runner perk) always rolls a power-up. */
export function rollCrate(r: () => number, noPeaches = false): CrateReward {
  const table: [number, PowerKind | 'peaches'][] = [[0.3, 'peaches'], [0.12, 'wing'], [0.14, 'tea'], [0.14, 'cobbler'], [0.1, 'kicks'], [0.08, 'glide'], [0.12, 'board']]
  const live = table.filter(([, k]) => !(noPeaches && k === 'peaches'))
  const sum = live.reduce((a, [w]) => a + w, 0)
  let x = r() * sum
  for (const [w, k] of live) { if ((x -= w) <= 0) return k === 'peaches' ? { type: 'peaches', amount: 25 + Math.floor(r() * 5) * 10 } : { type: 'power', kind: k } }
  return { type: 'peaches', amount: 25 }
}
