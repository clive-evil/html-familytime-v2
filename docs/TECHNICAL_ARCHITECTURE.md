# Technical Architecture

## Layers
```
src/data/      pure tunables (balance, building defs, dialogue)
src/core/      SIMULATION: plain-data GameState + systems. No DOM, no three.js. Runs in Node.
  GameState.js        createGameState(seed): world layout, starting entities
  Simulation.js       owns state, runs systems in order, command API, event queue, debug hooks
  rng.js              seeded mulberry32 (state stored on GameState)
  entities/           record factories: Grandma, Egg, Building (+ local→world helpers)
  world/              Navigation (obstacle grid, crowd hash), Placement (grid rules)
  systems/            Day, Resource, Population, Egg, Needs, Job, Building, GrandmaAI,
                      Movement, Player, Objective
  bot/AutoPlayer.js   scripted player for headless balance + autoplay
src/render/    three.js presentation (reads sim.state each frame)
src/ui/        DOM HUD, menus, speech bubbles, dev/perf panels
src/audio/     procedural WebAudio SFX
src/game/      glue: Game loop, Input → commands, camera, build mode, SaveStore (localStorage)
```

### Dependency rule
`core` and `data` import nothing from the other folders. Presentation depends on `core`, never the reverse. Communication works like this:
- **In:** commands (`setInput`, `interact(press, hold, dt)`, `secondary`, `place`, `sleep`, `debug`).
- **Out:** `sim.state` (read-only by convention) and `sim.drainEvents()`. Events are things like `gather`, `hatched`, `dawn` and `assigned`, and they drive sound, particles, speech and toasts.

`getInteraction()` is computed by the sim and is used both for the on-screen prompt and for execution, so the label always matches what happens.

## Tick order (`Simulation.step(dt)`, dt ≤ 0.1, the game feeds ≤ 0.05 substeps)
1. player movement + auto-deposit
2. day clock → night → dawn (eggs, aging, summary)
3. node regrowth, production-rate smoothing
4. hunger
5. incubators (manual ritual timers, auto slots)
6. foreman
7. Grandma AI (state machines)
8. movement + crowd separation + obstacle sliding
9. tutorial objectives

## Grandma AI
Each Grandma is a flat record (`createGrandma`) with a `state` string:
`emerge, idle, toEat, eat, hungryWait, toWork, work, toDeposit, toFetch, toSite, build, toEggs, toIncubator, quirk, toBed, sleep`.
- **Per tick:** timers and arrival checks only. This is O(1) per Grandma.
- **Decisions** (`decide()`) run only on state transitions. A staggered ~0.8 s "think" checks for interrupts such as hunger.
- **Queues:** tables keep an id array. The queue slot index maps to a seat or a line position.
- **Navigation:** there is no path graph. Grandmas seek straight to targets, get pushed out of solid rectangles and circles (a static 4-unit obstacle grid), and slide along a tangent with a per-Grandma preferred side. Stuck detection either accepts "close enough" or flips the side. The yard is open enough for this, and it costs almost nothing.
- **Crowd separation:** a uniform spatial hash (1-unit cells) is rebuilt every tick in O(n). Stationary workers are only weakly pushed. The player shoves through crowds.

## Rendering the crowd (`GrandmaCrowd.js`)
- **One rig, ~15 parts:** body, cardigan, shawl, hair cap, face (merged, vertex-coloured), arms ×2, slippers ×2, shadow, plus variants for bun ×3 and glasses ×3. There are also job hats ×5, carried items ×5 and billboard status icons ×6.
- **Each part is a single `InstancedMesh`** shared by all Grandmas, so 300 Grandmas cost ~35 draw calls.
- **Fixed-index parts** use instance index = Grandma index. Colours are written only when the population changes. **Compacted parts** (buns, glasses, hats, items, icons) are refilled each frame.
- **Poses are computed on the CPU** from `g.anim` (walk waddle, work, eat, queue, sad, tea, nap/sleep, fuss, confused, foreman ring, and the emerge sequence). The base matrix is multiplied by each part's local matrix. This costs about 0.65 ms per frame for 300 Grandmas.
- **LOD:** beyond 42 units from the camera, face, glasses, arms and slippers are skipped.
- There are no shadow maps. Grandmas use cheap blob shadows.

### World
Buildings and nodes are built from primitives (`BuildingModels.js`). `bake()` merges their static parts into one vertex-coloured mesh per model. Animated parts stay separate: the Gran-ulator lid, dial and egg, farm crops, the bell, and lamps. Eggs (in storage, on the ground, carried, or in auto incubators) are one InstancedMesh. Particles are one pooled InstancedMesh (struct-of-arrays, swap-remove).

## Performance approach and evidence
| Technique | Where |
|---|---|
| shared geometry and materials, instancing | crowd, eggs, particles, border trees, flowers, fence |
| lightweight state machines, staggered thinking | `GrandmaAI` |
| O(n) spatial hash, static obstacle grid | `Navigation.js` |
| distance LOD | `GrandmaCrowd` |
| static mesh baking | `BuildingModels.bake` (`?nobake` to compare) |
| pooled effects, no per-frame allocation in hot loops | `Effects`, module-level temp vectors and matrices |
| DOM HUD throttled to 10 Hz, change-detected writes | `HUD` |

Measured numbers are in [PROTOTYPE_REPORT.md](PROTOTYPE_REPORT.md). Simulation and crowd CPU time per frame is about 1.8 ms at 300 Grandmas. Heap is flat at 15–24 MB.

### Scaling further (not built)
- Move pose maths into a vertex shader driven by a per-instance attribute (state, phase), so the CPU writes only position and rotation.
- Use impostors or billboards beyond about 60 units.
- Update far-away AI at a lower rate (the stagger hook already exists).
- Run the simulation in a Web Worker. It is already DOM-free and serialisable.

## Saving
`SaveStore` writes `JSON.stringify(sim.state)` to `localStorage['tmg.save.v1']`. This happens at every dawn, from the pause menu, and on unload. A version mismatch refuses to load and the game starts fresh. "New game" clears the key.

## Testing
| Layer | Command | What it covers |
|---|---|---|
| Unit (Node) | `npm test` | 46 tests: systems, save/load, determinism, a 300-Grandma tick budget and heap growth |
| Balance (Node) | `npm run sim -- --check` | AutoPlayer over seeds × policies (balanced, greedy, never, lazy) with assertions |
| Browser smoke | `npm run test:smoke` | 31 checks in the real build (headless Chromium, real keyboard input) plus screenshots |
| Browser stress | `npm run test:stress` | FPS, frame breakdown, heap, NaN/escape checks at 50/100/200/300 |
| Visual QA | `node tests/browser/screenshots.mjs` | regenerates `docs/screenshots/` from bot-played saves |

The browser tests use the Chromium at `/opt/pw-browsers/...` if it is present (override with `CHROMIUM_PATH`). Otherwise they use Playwright's default.
