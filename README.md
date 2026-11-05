# PEACH DASH

A 3D endless runner through Atlanta that runs in the browser, with no install and no game engine.

**[Play it →](https://peach-dash.vercel.app)**

![Autopilot run through downtown Atlanta into the BeltLine at dusk](docs/gameplay.gif)

```bash
npm install
npm run dev     # the Network URL also works on your phone
npm test        # 40 tests
```

## How to play

Swipe, or use the arrow keys: left and right change lanes, up jumps, down slides. Outrun the geese, collect peaches, and spend them on runners and longer power-ups.

| Power-up | What it does |
|---|---|
| **Lemon Pepper Wing** | Speed burst that smashes through obstacles and scatters the geese |
| **Sweet Tea** | Pulls peaches toward you |
| **Peach Cobbler** | Doubles your score |
| **Super Kicks** | Super jump, high enough to land on a train |
| **SkyView Glide** | Flies above the lanes along a peach trail |
| **BeltLine Board** | Absorbs one crash |
| **Peach Crate** | Mystery reward |

Also in the game: six runners with their own perks, trains you can run on, three-mission sets that raise your multiplier, a daily A-T-L-A-N-T-A letter hunt, a login streak, and a local top 10.

![The six runners](docs/characters.png)

## How it works

- **The game logic has no renderer.** `src/core` is plain TypeScript with no three.js import, so lanes, collision, spawning, scoring, missions and saves all run under `node`. The renderer in `src/game` only draws what the simulation decides.
- **The spawner is tested by playing it.** An autopilot has to survive 6,000 m across several seeds, which catches impossible obstacle patterns that unit tests would miss.
- **Everything is generated at runtime.** Characters, landmarks, the skyline, sound effects and the beat are all built in code, so the production build is about 1 MB with no art or audio files to download.
- **Built for phones.** Instanced scenery, pooled obstacles and a capped pixel ratio keep draw calls low (about 80 in the v1 profile, not re-measured since the v2 additions).
- **No ground pop-in.** The world-bend shader used to sink the road below a flat floor, so the road rose into view like a hill. The floor now sits far below the bent road in the exact fog color, and chunks are built past the fog line and prewarmed before the first frame.

## Limits

- **The skyline is painted in code from landmark descriptions**, not from photos or generated images, so it's a stylized Atlanta. On desktop the street buildings hide much of it.
- **Saves stay in `localStorage`**, so there are no accounts, cloud saves or global leaderboard.
- **Vibration needs the Vibration API.** iOS Safari ignores it.
- **Sound and haptics have only been exercised by code paths** in automated runs. Performance numbers come from a headless run on an Apple M3, not from a range of phones.

All runners and landmarks are original low-poly models. There are no real people, logos or brand names.

## Stack

Vite, TypeScript, three.js, Web Audio, Vitest. Debug URLs such as `?screen=play&bot=1&at=900` start the autopilot 900 m in.

MIT © 2026 Joshua Dare
