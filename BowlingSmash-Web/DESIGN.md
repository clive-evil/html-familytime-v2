# BOWLING SMASH — prototype design notes

> Validation prototype. Question it must answer: is **bowling ball + physics destruction + short puzzle levels** satisfying enough to justify a mobile production version? Not commercially ready.

Proposition: *Royal Smash structure, but your projectile is a heavy bowling ball and the world is made of satisfying things to knock over.* See `REFERENCE_AUDIT.md` for what was (and wasn't) confirmable about the reference, and how each system was adapted.

---

## 1. Core loop (what the player does 90% of the time)

`press/drag → aim (dotted path) → set power (drag length) → [optional spin] → release → watch chaos → targets counter ticks down → STRIKE!/SPARE!/CLEAR! → NEXT`

* **One gesture.** Drag anywhere on the screen. Pull back = bowl forward; direction = drag direction, power = drag length. Pushing forward also works, so players who flick toward the pins aren't punished. The same code handles mouse and touch through pointer events.
* **Why not a timing meter or a swing:** the reference uses a cannon with "one-tap" angle and power. A drag-slingshot gives the same mass-market simplicity with direct manipulation and *no* timing skill. The Golf prototype's physical swing was explicitly ruled out.
* **Spin/HOOK** is a separate SPIN slider under the ball, shown from Level 6 (taught there with a glow and a two-line hint). I considered three options:
  * Using the drag's horizontal component for spin would fight with aim direction.
  * A second-finger gesture doesn't work on desktop.
  * A swipe-curve gesture is hard to make deterministic and hard to teach.

  The slider is explicit, deterministic and previewable, and Q/E work on desktop too. The hook is a **constant-curvature** lateral force (curvature independent of speed), so the dotted preview shows the real curve until the first collision.
* **Aim assist** (first ball only) on L1-3, L5, L11 and L16 pulls near-miss aims toward the sweet spot. This makes the first-session strike almost guaranteed without visible hand-holding.

## 2. Physics choice

**Rapier 3D (`@dimforge/rapier3d-compat` 0.19, WASM)** + **Three.js r186**.

| Option | Verdict |
|---|---|
| **Rapier** | ✅ Fast WASM, sleeping, CCD, convex hulls, joints, contact-force events, and deterministic for the same build on the same platform. It runs unchanged in Node, so the whole game simulation is testable headlessly. |
| cannon-es | Pure JS (slower with 100+ bodies), weaker stacking stability, no CCD. |
| ammo.js | Heavy, awkward API, large WASM, memory management pain. |
| Jolt (WASM) | Excellent, but a larger integration surface; overkill for a validation prototype. |

Simulation design (`src/sim/Sim.js`):

* A fixed 60 Hz step. The renderer interpolates between steps, which gives the same feel at 60, 90 and 120 Hz.
* The simulation has no `three` dependency, so the game, solver, tests and browser all use the **same code**.
* Collision layers: static / ball / dynamic / debris. Debris doesn't collide with debris or the ball, so shards are cheap.
* Pins use convex hulls of a real ten-pin profile at roughly 2× scale. The ball is 0.38 m radius and 9 units of mass (pins 1.0), with CCD on.
* An arcade **"smash"** impulse on a ball's first touch of each object scatters pins into each other. This is still emergent physics, but makes chain reactions read stronger than a real lane.
* Breakables: glass panels are shattered by a look-ahead test, so the ball smashes *through* (keeping 82% speed, 93% when heavy). Bottles and vases shatter on contact-force impulse. Shards are real bodies, removed after about 3.3 s.
* Stability: everything is placed exactly on its supports. Each level is tested to stay still for 20 s with no shot. Bodies below the kill plane are retired. Removals are deferred until the contact-event drain completes, which avoids WASM aliasing panics.
* A shot resolves only when the balls have stopped or are gone, AND the world is quiet, AND no target has fallen for 0.5 s (13 s hard cap). This fixes the reference's top complaint, where the fail screen appeared while the last ball was still knocking things over.
* **Bowling sweep:** knocked-down targets are cleared between balls, so fallen pins don't block your next ball.

### Target "down" rules (per type, `src/sim/catalog.js`)
A target counts as down if it is tilted past a per-type angle (35–55°), has dropped more than about 30% of its height (fallen off a shelf or table), has been knocked well off its spot (boxes, crates, cans and rolling chairs only), has shattered, or has fallen off the world. Each target registers **once** (tested).

## 3. The 20 levels

Sawtooth: easy → thought → spectacle → mechanic → consolidate → **HARD** → easy reset → combine → **SUPER HARD**.

| # | Name | Setting | Tier | Balls | Teaches / tests |
|---|---|---|---|---|---|
| 1 | First Strike | Toy Arena | easy | 3 | Classic ten-pin. Drag, release, STRIKE. |
| 2 | Wide Load | Toy Arena | easy | 3 | 15-pin rack offset right: aim matters a little. |
| 3 | Weak Point | Toy Arena | easy | 3 | A 3-storey post/slab tower of pins: hit the bottom supports. |
| 4 | Two Camps | Toy Arena | normal | 3 | Central domino stem forks into two pin lines: one push gets both. |
| 5 | Launch Ramp | Toy Arena | easy | 4 | Elevated start + ramp into a 28-pin rack. Spectacle. |
| 6 | Hook Shot | Toy Arena | normal | 4 | First SPIN: curve around a block. Forgiving rack. |
| 7 | Domino Run | Toy Arena | normal | 3 | A winding domino chain → growing dominoes → pins behind a wall (a hook shot also works). |
| 8 | Glass House | Toy Arena | normal | 3 | Smash through glass panels. HEAVY BALL intro (free). |
| 9 | Rickety Bridge | Toy Arena | normal | 3 | A plank bridge on one centre post: hit the support. |
| **10** | **Three Camps** | Toy Arena | **HARD** | 3 | Three separated groups, one behind a wall: hook/bank shots, every ball counts. |
| 11 | Aisle Smash | Supermarket | easy | 4 | New setting. Two big can pyramids + box display topped with bottles: full power = everything flies. Reset. |
| 12 | Cubicle Chaos | Office | normal | 3 | Angled desks to ricochet off, rolling chairs, dummies, box stacks. |
| 13 | Support Beam | Construction | normal | 3 | A loaded slab on four central posts: knock the posts → barrels and cones come down onto the ground cones. TRIPLE BALL intro. |
| 14 | Bank Shot | Construction | normal | 3 | The direct route is blocked: bounce off the angled wall. |
| 15 | Checkout Rush | Supermarket | normal | 4 | Box stacks riding three conveyors: timing, still readable. |
| 16 | The Giant | Toy Arena | easy | 4 | A giant pin topples onto 36 mini pins and crate towers. Pure spectacle. |
| 17 | Cascade | City Plaza | normal | 3 | Ball rolls down three tiers of pins. BOMB BALL intro. |
| 18 | Double Block | Office | normal | 3 | Two staggered desks: one controlled hook threads both. |
| 19 | Pinball Wizard | Toy Arena | normal | 3 | Bumpers and bumper walls fire the ball around; gold bonus pin. |
| **20** | **Grand Smash** | Construction | **SUPER HARD** | 3 | Ramp → glass → pins → fork of tall dominoes that sweep two raised tables → second glass → rack + gold pin. A perfect one-ball STRIKE exists (stored and tested); the window is about ±0.5° and needs the right power. |

Each level has at least one stored solution (`src/levels/solutions.js`), found with `tools/greedy.mjs` and verified by `tests/solutions.test.js` (Node) and `tests/browser/smoke.mjs` (real browser, production build).

## 4. Meta systems (all ORIGINAL numbers, `src/systems/config.js`)

| System | Prototype implementation |
|---|---|
| Grades | STRIKE (1 ball), SPARE (2), CLEAR (within budget); best result kept per level |
| Coins | First clear 20 (HARD 50, SUPER HARD 100); STRIKE BONUS +30; SPARE +10; +5 per unused ball; gold pin +15 |
| Lives | 5 hearts, 1 per 20 min, lost when you *give up* on a failed attempt; L1-5 never cost a heart; hearts hidden until L4 |
| Continue | OUT OF BALLS → +5 BALLS via simulated rewarded ad, or 150 coins |
| Boosters | HEAVY (L8), TRIPLE (L13), BOMB (L17); each has a free forced first use; then 90/120/150 coins or a simulated ad |
| Chests | Levels 5/10/15/20: coins + boosters; tap to open (fast); granted once |
| Daily | 7-day track (coins → boosters → big day 7); from session 2 and after 3 clears; missed day resets the streak |
| Journey | Vertical map, current node pulses, HARD/SUPER HARD nodes distinct, chest icons, environment labels, best-result badges |
| Analytics | Local only: session_start/end, level_start/win/fail, shot, retry, continue, booster_used, heart_lost, daily_claim (+ sim_rewarded_ad, booster_purchase, prototype_complete) |

Economy pacing check: a first-time player finishing all 20 levels earns roughly 600–900 coins from clears and bonuses, plus about 850 from chests. That is enough for several continues or about 6–8 boosters, so they *feel* the currency without being walled. The reference's 900-coin continue at 15 coins per level is deliberately not copied.

### Simulated monetisation hooks (no real ads / payments)
* `Platform.requestRewarded(placement)` shows a 1-second **SIMULATED AD** overlay, is logged, and resolves true. Placements: `continue_+5_balls`, `refill_heart`, `booster_<kind>`.
* IAP hook points for production: the fail panel ("Level End Offer" analogue), out-of-hearts, booster shortage and coin shortage.
* CrazyGames SDK calls are wrapped (`gameplayStart/Stop`, `happytime` on STRIKE, `loadingStop`) and are no-ops without the SDK.

## 5. Feel / juice
Hit-stop (45–90 ms) on the ball's first big impact, camera shake scaled to impact strength, impact chips/dust/sparks per material, a ball trail, rolling sound tied to speed, rising "pop" pitch for each target in a chain, glass smash layers, about 0.75 s slow-motion on the final target, STRIKE banner slam, confetti, coins flying to the counter. A haptics stub (`navigator.vibrate`) is ready for a native bridge.

Audio is 100% synthesised WebAudio (no sample files). It covers ball roll, pin/wood/card/metal/can/glass/stone/plastic impacts, heavy crash, launch whoosh, bumper boing, bomb, UI, coin, chest, strike/spare/win/fail fanfares and a heart-lost sound. A compressor/limiter and a per-frame voice budget keep huge chain reactions loud without clipping.

## 6. Files
```
src/sim/       Sim.js (rules + Rapier), catalog.js (object types), bot.js (QA bot), math.js
src/levels/    levels.js (20 levels), helpers.js (racks, domino paths, ramps…), solutions.js
src/render/    Renderer.js (scene, camera, aim guide), models.js, textures.js, decor.js, fx.js, themes.js
src/game/      Game.js (flow, input, win/fail, boosters, meta)
src/ui/        ui.js / ui.css / icons.js (DOM HUD, panels, map)
src/systems/   save.js (versioned), progression.js (pure logic), config.js, analytics.js, platform.js
src/audio/     Audio.js
src/debug/     debug.js (?debug=1 panel)
tools/         solve.mjs, greedy.mjs, solve-all.mjs, forgive.mjs, shot.mjs
tests/         sim / systems / solutions (node --test), browser/smoke.mjs (Playwright)
```

## 7. QA status (this build)

* `npm test`: **59/59** Node tests. They cover rules, all 20 levels (load, target counts, 20 s idle stability), launch, collision, fail, continue, once-only targets, determinism, boosters, hook, glass, no NaN/runaway bodies, forgiveness of L1-5, saves/migration, lives, coins, chests, daily, analytics, and the stored solution for every level plus the L20 one-ball STRIKE.
* `npm run test:browser`: **45/45** on the production build in headless Chromium. It covers the FTUE (fresh boot into L1, hints, a real mouse drag knocking all 10 pins down), every level's solution winning in the browser (same physics steps as Node), and zero page errors. A spot re-run after the final decor/CSS changes passed 11/11.
* Physics cost (Node, same WASM): about 0.07–0.27 ms per 60 Hz step on average and under 3 ms at peak, with up to 56 bodies plus debris.
* Rendering: 58–240 draw calls (including the shadow pass) and 26k–95k triangles per level. The container has **no GPU** (SwiftShader software GL), so in-container FPS (0–3) says nothing about real hardware. **Measure FPS on a real phone and desktop before drawing conclusions.**

## 8. Known issues / limitations
* The FPS budget is unverified on real hardware (see above). The JS bundle is about 2.9 MB (1.0 MB gzipped), mostly the Rapier WASM inlined as base64.
* Determinism is guaranteed for the same engine build on Chromium/V8 (tested). Firefox and Safari should behave the same for gameplay, but stored solutions may not replay bit-for-bit there.
* Stored solutions come from a coarse solver grid. Several hard-ish levels (12, 14, 15, 17) were solved with 3–4 balls, so a human may find them harder than the curve intends. They need human playtests.
* Hearts are deducted when the player gives up on a failed attempt (retry/restart). Closing the tab on the fail panel avoids the loss (acceptable for a prototype).
* The Level 7 chain can be bypassed with a hook shot around the wall. That's emergent and intentional, but it means the domino spectacle isn't guaranteed.
* Desktop landscape framing keeps the whole level in view, so pins look smaller than in portrait.
* No real ads, IAP, accounts or remote config. The CrazyGames SDK is only wrapped, not loaded.
