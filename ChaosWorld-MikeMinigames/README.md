# Chaos World — Battle Experiments (Mike Minigames)

Internal gameplay test bed for two experimental modes. **Not production code.**

**Play:** double-click `dist/ChaosWorldMikeMinigames.html`. It's one self-contained file: inline CSS/JS, generated art and WebAudio sound, no network, no server, no npm.

| Mode | Core emotion | Loop |
|---|---|---|
| **1 · Rope the Monster** | "PULL! PULL! OH FOR GOD'S SAKE" | Rope both legs → sync pull before the rope burns → takedown → 4.5s ×4 damage window → he wakes up → repeat |
| **2 · Hell Chase** | "Kill faster or that thing is going to catch me" | Kill forward enemies → chase items drop → fire them backward → damage/slow/stun/knock back the Hunter → buy distance |

## Folder

```
src/index.html        shell (placeholders get inlined)
src/style.css         comic/action UI
src/js/01_core.js     loop, settings/save, input, WebAudio SFX, FX (particles, shake, hit-stop, slow-mo)
src/js/02_art.js      procedural Chaos World-style art + PNG override slots
src/js/03_mode1.js    Rope the Monster (explicit FSM)
src/js/04_mode2.js    Hell Chase (explicit FSM)
src/js/05_main.js     menu, how-to, LAB panel, boot
build.js              → dist/ChaosWorldMikeMinigames.html (fails the build on any fetch/external URL)
tools/import-battlelab-assets.js   pulls real Battle Lab art into assets/
tests/smoke.js        58-check Playwright QA (real mouse/keyboard/touch)
tests/fullrun.js      unforced complete playthrough of each mode
tests/sim.js          headless balance simulator (bot players at several skill levels)
```

Rebuild after edits: `node build.js` (Node only, no dependencies).

## Using the real Battle Lab art

This build was made in a cloud container that could **not** see `C:\AI-Prototypes\ChaosWorld-BattleLab`, so all art is currently procedural (drawn in canvas in the Chaos World style: thick outlines, chunky shapes, exaggerated characters). To swap in the real assets on your machine:

```
node tools/import-battlelab-assets.js "C:\AI-Prototypes\ChaosWorld-BattleLab" --dry   # preview matches
node tools/import-battlelab-assets.js "C:\AI-Prototypes\ChaosWorld-BattleLab"         # copy into assets/
node build.js
```

The importer only **reads** the Battle Lab folder. It matches files by name; pin a slot to an exact file with `assets/map.json` (`{"boss": "art/bosses/dragon.png"}`). Or drop PNGs straight into `assets/` using the slot names:

`scrub archer knight hexa boss hunter slime goblin skeleton imp brute portrait_scrub portrait_archer portrait_knight portrait_hexa portrait_boss portrait_hunter bg_mode1 bg_mode2 item_<spike|oil|banana|smoke|firemine|chain|boulder|ice|spring|barrel|portal|megabomb|double|stun>`

Character sprites should be single images, anchored at the bottom centre and facing right. Animation still works because all of it is transform-based (squash, rotation, translation, flashes, particles).

## Controls

| | Desktop | Touch |
|---|---|---|
| Mode 1 | **A** = Roper 1 (throw / pull) · **L** = Roper 2 · **1** Slam · **2** Meteor · **3 / Space** Chaos Burst · **R** restart · **Esc** menu | Big left/right ROPE→PULL buttons (one thumb each), 3 attacker buttons in the middle |
| Mode 2 | Click enemies to strike (**A/S** strikes the focused or nearest one) · **1 2 3** skills · **Space** Rampage · **Q W E** fire tray items (manual) · **R** · **Esc** | Tap enemies, skill buttons, tray slots |

## Default tuning

**Mode 1:** boss HP 18,000 · hero HP 120 · timing bar: green zone 24% of the bar (perfect 7%), sweep 1.55 bars/s, 0.9s re-coil after a miss · a single rope gets shaken off after 7s · pull: +9 per tap, −18/s decay, both sides must max out within 0.6s of each other · rope burn 3.8s ±12% (×0.85 when enraged, burns 1.2× faster while one side lags) · stun 4.5s at ×4 damage plus 3% per combo hit · chip damage outside the stun ×0.3 · boss acts every 3.0–4.4s and every 3rd action is an AOE · KO'd heroes revive after 10s or on a takedown.

**Mode 2:** start distance 120m · closing speed 3.5 m/s × (1 + t/240) · slowed ×0.25 · stunned 0 · Hunter visible below 35m, leaves above 42m · Hunter HP 5,500 · drop chance 14% per kill (elites always drop rare or better; Rampage gives a guaranteed rare) · squad HP 400, +20 per cleared wave · clearing a wave in under 9s gives +6m.

Everything above can be changed live from the **LAB** button.
