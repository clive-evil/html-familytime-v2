# Chaos World — Battle Experiments (Mike Minigames)

Internal gameplay test bed for two experimental modes, **running on the real Chaos World Battle Lab engine and art**.

**Play:** double-click `dist/ChaosWorldMikeMinigames.html`. It's one self-contained file of about 0.9 MB. The Battle Lab's own engine, painted character rigs, FX, sounds, fonts and HUD CSS are all inlined. It needs no server and makes no network calls.

| Mode | Core emotion | Loop |
|---|---|---|
| **1 · Rope the Monster** | "PULL! PULL! OH FOR GOD'S SAKE" | Lasso both legs of a giant Battle Lab boss → both ropers must max out together before the rope burns → he crashes face-first → 4.5s ×4 window for the attackers → he wakes and burns the ropes → repeat |
| **2 · Hell Chase** | "Kill faster or that thing is going to catch me" | Scrub fights enemies coming from the right → kills drop chase items that fly *back* at the Hell Hunter (the Battle Lab's hooded demon) coming from the left → damage, slow, stun or knock it back → distance is the resource |

## How it's built

```
ref/BattleLab-index.html   the Battle Lab's own standalone build (vendored, unmodified)
src/mod/00_core.js         engine adapter: takeover, spawn, acts/poses, hits, lava backdrop, ropes, extra SFX
src/mod/01_items.js        chase items + icons painted with the Battle Lab's own painter
src/mod/02_mode1.js        Rope the Monster (explicit FSM)
src/mod/03_mode2.js        Hell Chase (explicit FSM)
src/mod/08_main.js         menu (live engine scene), LAB, how-to, results
src/mod/09_boot.js         routes engine hooks/input to the active mode, boots the mod
src/mod.css                mod UI in the Battle Lab's visual language (its CSS variables and classes)
build.js                   ref + one export line + mod → dist/ChaosWorldMikeMinigames.html
tests/smoke.js             62-check QA (real mouse, keyboard and touch)
tests/fullrun.js           unforced complete playthrough of each mode
tests/sim.js               balance simulator (steps the real engine with bot players)
v1-procedural-src/         first version (art drawn from scratch), kept for reference only
```

Rebuild after edits with `node build.js` (Node only, no dependencies).

`build.js` adds one line inside the Battle Lab bundle that exposes its internals as `window.__BL`: the fighter class, `Act` timeline, pose library, enemy and hero tables, skill icons, portraits, demon painter, painting helpers and sfx. The mod then drives the live `__stage` / `Battle` objects:
- Fighters are spawned with `spawnEnemy` / `makeHero`.
- Animation is done with the engine's own `Act` timelines and named poses (`throwAntic`, `heavyHit`, `downed`…).
- Effects are drawn with its FX (`slashArc`, `impactStar`, `ring`, `number`) and camera (`shake`, `punch`); its banners and toasts are reused.
- Ropes, cards and the demon are drawn through its `onDrawGround` / `onDrawWorld` / `onDrawOverhead` hooks.

**Hell Chase reuses the Battle Lab's actual control bar:** Scrub's portrait and HP, THROW/THRUST/SLASH hex buttons and CHAOS meter. `stage.pressSkill` and `stage.onUltPress` are overridden for real-time play.

> If the Battle Lab is rebuilt, its minified names change. Replace `ref/BattleLab-index.html` and update the `EXPORTS` list in `build.js`. The build fails loudly if the injection point is missing.

## Controls

| | Desktop | Touch |
|---|---|---|
| Mode 1 | **A** Roper 1 (throw/pull) · **L** Roper 2 · **1** Slam · **2** Meteor · **3 / Space** Chaos Burst · **R** restart · **Esc** menu | Big ROPE→PULL buttons left/right (one thumb each), hex attacker buttons and the Burst bar in the middle |
| Mode 2 | Click enemies to strike (**A/S** strikes the focused or nearest enemy) · **1 2 3** Throw/Thrust/Slash · **Space** Chaos · **Q W E** fire tray items (manual) · **R** · **Esc** | Tap enemies, the Battle Lab hex skill buttons, the CHAOS button, tray slots |

## Default tuning (all adjustable in 🧪 LAB)

**Mode 1:**
- **Boss:** Spire Warden at ×2.2 scale, 18,000 HP (LAB can swap in Buffalo Skel, The Lava Lord or Neon Lich).
- **Rope throw:** green zone 24% of the bar (perfect 7%), marker sweeps 1.55 bars/s, 0.9s re-coil after a miss; a lone rope slips off after 7s.
- **Pull:** +9 per tap, −18/s decay. Both sides must max out within 0.6s of each other.
- **Rope burn:** 3.8s ±12%. It runs 1.2× faster while one side lags, and is ×0.85 when the boss is enraged (below 35% HP).
- **Damage:** the stun lasts 4.5s at ×4 damage plus 3% per combo hit; outside the stun hits do ×0.3 (chip).
- **Boss attacks:** every 3.0–4.4s; every 3rd is a stomp that hits everyone.

**Mode 2:**
- **Hunter:** starts 120m behind, closes at 4.4 m/s × (1 + t/240), ×0.25 while slowed. He becomes visible under 35m and leaves above 42m. 7,000 HP.
- **Drops:** 14% per kill; elites always drop rare or better; CHAOS gives a free rare.
- **Scrub:** 400 HP, +20 per cleared wave. Clearing a wave in under 9s pushes the Hunter back 6m.
