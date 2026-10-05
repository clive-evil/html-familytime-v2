# NORMAL SKIING

Getting Over It, but downhill. One enormous mountain, skied from the summit to
the valley with a deceptively simple, deeply analogue body-posture control.

Experimental prototype. The priority is the skiing control mechanic, not menus.

## Run

```
npm install
npm run dev          # http://localhost:5173/
npm run build        # standalone static build in dist/  (npm run preview to serve it)
npm test             # headless physics / jump / balance / world / autopilot tests
npm run sweep        # jump tuning table:  node scripts/feel-sweep.mjs small|big|ledge|ravine [speed]
node scripts/skill-ceiling.mjs   # simulated novice vs skilled players
npm run browser-test # headless Chromium end-to-end checks + screenshots in test-output/
```

URL options: `?mode=lab` or `?mode=mountain` skip the menu, `?debug=1` opens the
tuning panel (also toggled with the backtick key), `?mouse=abs` uses absolute
mouse position instead of pointer lock.

## Controls

| Input | Action |
| --- | --- |
| Mouse back (toward you) | crouch / compress the legs / load up for a pop / bend knees to absorb |
| Mouse forward | extend / stand tall / the **pop** (a fast flick) |
| Mouse left/right | shift weight: edge pressure, lateral balance, roll in the air |
| A / D | carve left / right (edge angle; skids at low speed or when overdone) |
| W | tuck (less drag, less steering). At walking speed it poles/skates you along |
| S | snowplough / brake |
| R | restart from the last checkpoint |
| Space | get up after a crash (otherwise automatic once you stop tumbling) |
| 1-0 (lab) | jump to a lab station |
| M / P / Esc | mute / pause / release the mouse (Esc again: menu) |

Click the canvas to capture the mouse. The small ring at the bottom of the
screen is the only posture HUD: the white dot is where you've put your body, the
coloured arc/needle is your balance (green stable, yellow wobbling, orange
off-balance, red doomed).

Jump rhythm: **COMPRESS** (mouse back on the approach) -> **EXTEND** (flick
forward so the push finishes as the snow drops away) -> **FLY** (forward = nose
down, back = tips up, sideways = roll) -> **PREPARE** (ease the mouse back a
little before touchdown: bent knees) -> **ABSORB**.

## How the physics works (src/sim/skier.js)

* **Spring leg.** The skier is a point mass (hips) on a leg actuator of length
  `L` in `[legMin, legMax]`. Mouse Y sets the target length. Grounded, the leg
  pushes on the snow with a holding force `weight + k(Lt-L) - c*Ldot`, capped
  by leg strength. Friction, edge grip and carving all scale with that leg
  load, so unweighting and pressing the skis is physical.
* **Pop.** A flick (target length rising fast) opens a ~0.16 s push window.
  Its force scales with flick speed and with how deep you were crouched. It
  only acts while the skis touch the snow, and a Hill-style force/velocity
  limit removes it if the snow is falling away faster than legs can extend.
  Result: popping on the ramp lip adds your pop to the lip's launch; flicking
  too early hops you off the ramp before the lip (or is soaked up); flicking
  late does nothing because you're already airborne. Pushing into a rising
  kicker transition is slightly stronger. Nothing is a binary timing check:
  the outcome is a continuous function of when and how hard you moved.
* **Air.** Pitch responds to posture with inertia (`airPitchK`, damping, and a
  weathervane toward the flight path), roll to mouse X, a little yaw to A/D.
  The lip's own curvature rotates you at takeoff, and leaning back at takeoff
  throws the tips up.
* **Landing.** Touchdown compares ski pitch/roll/yaw with the slope. The legs
  absorb the normal impact: bent, "ready" legs are softer, more damped and
  stronger (readiness from posture); locked straight legs are stiff and spring
  you back up (bounce) with a backward balance kick; running out of leg travel
  is a bottom-out impulse. Mismatches kick the balance system, large ones
  crash immediately.
* **Balance.** Fore/aft and lateral are unstable pendulums with passive
  stiffness (so small wobbles self-correct). Posture *changes* throw your hips
  (plus a smaller held component), so you save a bad landing by moving the
  mouse against the lean. States: stable < 0.3 < wobbling < 0.55 < off-balance
  < 0.85 < doomed (control authority collapses) < 1 = crash.
* **Crash.** Verlet ragdoll (src/sim/ragdoll.js) that keeps your momentum and
  tumble direction, collides with terrain and trees, and can lose skis on big
  impacts.
* Fixed 240 Hz deterministic step; the sim runs headless in node.

## Tunable values

All in `src/config.js` (`TUNE`). Slidered in the debug panel: `legK`,
`legCCompress`, `legCExtend`, `pushMaxG`, `absorbMaxG`, `mouseSensY`,
`sidecutRadius`, `maxEdge`, `pivotRate`, `gripTau`, `dragStand`, `dragTuck`,
`balStiff`, `balTopple`, `balCtrlFore`, `balCtrlLat`, `airPitchK`, `airRollK`,
`weathervane`, `landPitchKick`, `crashBottomOut`, `crashPitch`. Everything else
in `TUNE` (push window, flick rate, readiness boost, landing kicks, crash
thresholds, camera distances/FOV, poling, ...) is editable in the file. The panel
can copy the current slider values as JSON.

## World

* **Ski Feel Lab** (`src/world/lab.js`, 1.45 km): open slope, turns around tree
  islands, rollers, small lip, big lip, ledge drop onto a steep, ice, tree-gap
  wall, ravine gap, camber kicker (launches you rolled, rough landing).
* **The Mountain** (`src/world/mountain.js`, 8.15 km long, ~3.3 km vertical),
  one continuous run with invisible regions and checkpoints:
  Summit (wind lip, rollers, cornice above a side bowl, lift line) ->
  Treeline (tree lanes, moguls, fallen logs, falling tree, frozen stream, rock lip) ->
  Cliff Road (switchback benches on a 30 deg face, cut banks, snowbanks to jump, missing guard rails, cliff bands, hairpins, snowplough, rockfall) ->
  Abandoned Village (street, chalets whose drifted uphill walls let you ski onto
  the roofs and launch off the eaves, cross streets, parked cars, fences, lift towers, cable car, lodge) ->
  Broken Bridge (48 m gorge; the deck collapses as you approach leaving a narrow
  strip; jump the hole, thread the strip, or take the natural snow ramp where the gorge narrows) ->
  Ice Field (frozen lake, low grip, fragile cracked ice that breaks under slow
  heavy skiing, snow islands, frozen waterfall lip) ->
  Avalanche Bowl (crossing the trigger releases a slab; it follows the terrain
  at ~25 m/s; outrun it, hide in the lee of the big rock, or get up on the
  spine; a cliff band is the direct line) ->
  Final Descent (fastest slope, rollers, huge natural ramp over a 52 m canyon
  onto a 44 deg landing, or the slow powder gully over the snow bridge; valley lodge finish).
* Failure tiers: minor (stand up where you stopped), medium (fall to a lower
  road/bowl and carry on from there), major (gorge, ice, avalanche, out of
  bounds: back to the region checkpoint), catastrophic (the canyon: back to the
  top of the final descent).

## Architecture

```
src/sim/      skier.js (all skiing physics), ragdoll.js, harness.js, bot.js, math.js
src/world/    world.js (height field + features + props), lab.js, mountain.js, events.js
src/game/     session.js (rules: crash/respawn/checkpoints, headless), game.js (wires views), input.js
src/render/   terrain.js, props.js, skierView.js, camera.js, fx.js, eventViews.js
src/audio/    audio.js (all generated: filtered noise + oscillators)
src/ui/       hud.js, debug.js
tests/        node:test suites;  scripts/ sweeps, skill ceiling, browser tests
```

Multiplayer later: `Session` owns one `Skier`/`Ragdoll` against a shared,
deterministic `World`; events already take the skier as a parameter and the
skier has `serialize()`. A networked mode would run N skiers per world.
