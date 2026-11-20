# Meridian Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) [![rank](https://make.fun/badge/gta6-01/tatsuyakenta77-arch/solara-bay-5/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) [![reward](https://make.fun/badge/gta6-01/tatsuyakenta77-arch/solara-bay-5/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). Explore the
sun-soaked city of **Port Meridian** on foot and by car, steal rides, outrun
the police, and run six story jobs for fixer **Mara Quinn** as driver
**Jace Marlowe**.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network at runtime — every script, model and sound is a
file under `game/` (three.js is vendored as `game/vendor/three.module.min.js`).

## The game

- **Open city** — a grid of blocks with lit-window towers, a marina, a pier
  with moored boats, traffic and pedestrians living their own routines.
- **Drive anything** — walk up to any of the parked cars (or your starter
  car) and take it. Arcade handling, trailing camera, engine sound that
  follows your speed.
- **Wanted system** — 1 to 5 stars. Steal, hit pedestrians or shoot and the
  Port Meridian PD responds: patrol cars spawn, chase, ram and try to bust
  you. Lay low and the heat cools off.
- **Six story missions** — from a first getaway to a harbour shootout and a
  final bridge run, each with a marker, an objective and a cash payout.
- **Combat** — pistol and fists against Mara's rival crew, with health,
  ammo, cover and muzzle-flash particles.
- **HUD + minimap** — cash, health, ammo, speed, wanted stars, objective
  tracker and a circular live minimap.
- **Save** — progress, cash and position are stored locally; Continue picks
  up where you left off.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse drag | Orbit camera (wheel zooms) |
| E | Enter / exit car |
| Space | Handbrake / jump |
| Left click | Shoot (pistol) |
| F | Melee |
| Shift | Sprint |
| R | Reload |
| Esc / P | Pause |
| M | Mute |

## Files

- `game/` — the whole game: `index.html`, `style.css`, `src/` (config,
  world, vehicles, pedestrians, missions, combat, audio, HUD, main) and
  vendored three.js.
- `screenshots/` — real renders of the game in a browser.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to the
  output dir and writes `dossier.json`.
- `serve.ts` — tiny static server for local play.

## Entry

Built for make.fun competition **gta6-01** ("Make GTA 6"). Everything in
this repository is original: Port Meridian, its people and its story are
invented for this game.
