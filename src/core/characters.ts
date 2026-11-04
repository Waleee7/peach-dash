export interface Perk {
  laneRate: number      // lane-change snap speed
  nearMul: number       // near-miss score multiplier
  powerMul: number      // power-up duration multiplier
  peachMul: number      // peaches per pickup
  startTea: number      // seconds of Sweet Tea at run start
  startWing: number     // seconds of Lemon Pepper Wing at run start
  glideMul: number      // SkyView Glide duration multiplier
  crateNoPeaches: boolean // Peach Crates always roll a power-up
  stumbleMul: number    // multiplier on the stumble window (lower = forgiving)
}
export interface CharDef {
  id: string; name: string; role: string; blurb: string; perkName: string; perkText: string
  cost: number; perk: Perk; stats: { speed: number; grip: number; luck: number }
}
export const BASE_PERK: Perk = { laneRate: 17, nearMul: 1, powerMul: 1, peachMul: 1, startTea: 0, startWing: 0, glideMul: 1, crateNoPeaches: false, stumbleMul: 1 }
const base = BASE_PERK
export const CHARACTERS: CharDef[] = [
  { id: 'juno', name: 'JUNO', role: 'BELTLINE SKATER', cost: 0,
    blurb: 'Rolls the trail every golden hour. Never met a railing she did not respect.',
    perkName: 'GRIND', perkText: 'Near-misses pay double.', stats: { speed: 3, grip: 4, luck: 3 },
    perk: { ...base, nearMul: 2 } },
  { id: 'tay', name: 'TAY', role: 'CAMPUS STEPPER', cost: 400,
    blurb: 'Crimson jacket, gold cane, perfect timing. Homecoming never ended.',
    perkName: 'STEP-OFF', perkText: 'Lanes snap 45% faster. Stumbles are forgotten 40% sooner.', stats: { speed: 4, grip: 5, luck: 2 },
    perk: { ...base, laneRate: 25, stumbleMul: 0.6 } },
  { id: 'rook', name: 'ROOK', role: 'WESTSIDE PRODUCER', cost: 900,
    blurb: 'Headphones on, beat loaded. Makes the whole city bounce on one and three.',
    perkName: 'MIXTAPE', perkText: 'Power-ups last 60% longer.', stats: { speed: 3, grip: 3, luck: 4 },
    perk: { ...base, powerMul: 1.6 } },
  { id: 'pearl', name: 'MISS PEARL', role: 'GRANT PARK GRANDMA', cost: 1500,
    blurb: 'Sun hat, sweet tea, zero patience for traffic. She is faster than she looks.',
    perkName: 'PEACH CARD', perkText: '+30% peaches, starts with Sweet Tea.', stats: { speed: 2, grip: 3, luck: 5 },
    perk: { ...base, peachMul: 1.3, startTea: 8 } },
  { id: 'dez', name: 'DEZ', role: 'STADIUM SPRINTER', cost: 2200,
    blurb: 'Warms up on game days, never stops after. Hates being second out of the tunnel.',
    perkName: 'ROCKET START', perkText: 'Every run opens with a 4s Lemon Pepper Wing.', stats: { speed: 5, grip: 3, luck: 2 },
    perk: { ...base, startWing: 4 } },
  { id: 'nova', name: 'NOVA', role: 'SKYVIEW OPERATOR', cost: 3200,
    blurb: 'Runs the wheel by day, rides it by night. Knows every gondola by name.',
    perkName: 'HIGH ROLLER', perkText: 'Peach Crates always hold a power-up. Glide lasts 40% longer.', stats: { speed: 3, grip: 3, luck: 5 },
    perk: { ...base, crateNoPeaches: true, glideMul: 1.4 } },
]
export const charById = (id: string) => CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0]
