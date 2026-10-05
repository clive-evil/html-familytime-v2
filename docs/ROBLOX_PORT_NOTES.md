# Roblox / Luau Port Notes

The prototype was structured so the simulation can be translated to Luau almost line-for-line. These notes describe the mapping. Nothing here is built.

## What is renderer-independent (port directly)
Everything in `src/core/**` and `src/data/**`:
- **No DOM, three.js, `window` or timers.** Time arrives only as `dt`.
- **State is plain tables** with ids instead of references (`GameState.js`).
- **Randomness** comes from a seeded RNG whose whole state is one uint32 (`rng.js`). Port it with `bit32`, or replace it with `Random.new(seed)` if exact cross-platform determinism isn't required.

| JS system | Responsibility | Luau notes |
|---|---|---|
| `DaySystem` | clock, night, dawn processing | `RunService.Heartbeat` accumulates dt on the server |
| `ResourceSystem` | stockpile, deposit, node regrowth, rate smoothing | pure maths |
| `PopulationSystem` | spawn, unlocks, ageing | pure |
| `EggSystem` | laying, storage capacity, manual ritual and auto incubators, hatching | pure; the ritual stages are a string enum |
| `NeedsSystem` | hunger, table queues, nightly bed assignment | queues are arrays of ids → `table.insert`/`table.remove` |
| `JobSystem` | assign and unassign, foreman | pure |
| `BuildingSystem` | placement validation, construction progress, capacities | grid maths is identical; the CFrame rotation is `rot * 90°` |
| `GrandmaAI` | per-Grandma state machine | string states map to a dispatch table of functions |
| `MovementSystem` + `world/Navigation` | steering, crowd hash, obstacle push-out | see "Movement" below |
| `PlayerSystem` | interaction selection and execution | `getInteraction()` becomes the ProximityPrompt and action-text logic |
| `ObjectiveSystem` | tutorial steps, hints, HUD status | pure; `getStatus()` feeds the UI |
| `bot/AutoPlayer` | headless balance testing | useful as a Studio test harness |

## Data structures → Luau
```lua
-- Grandma (createGrandma): flat record, ~40 fields; numbers, strings, booleans
{ id = 12, x = 3.2, z = -1.0, rot = 0.4, state = "toWork", timer = 0,
  job = "farmer", wp = 37, slot = 1, hunger = 0.3, adult = true,
  v = { c = 2, b = 1, g = 0, f = 3, s = 1, w = 0, p = 2 }, rare = "" }
-- Building: { id, type, cx, cz, rot, x, z, w, d, built, progress, workers = {ids}, queue = {ids}, inc = {...} }
-- Egg:      { id, loc = "store"|"ground"|"player"|"grandma"|"incubator", container, slot, x, z }
```
- **Index base.** JS uses 0-based arrays in a few places: `slot`, the incubator `slots` and `t` arrays, and the queue index → seat mapping. Convert these carefully to 1-based. `queueSpot(b, idx)` and `inc.slots` are the main ones.
- **Arrays of ids** (`workers`, `queue`) become plain Luau arrays. `indexOf`/`splice` become `table.find`/`table.remove`.
- **Id lookups.** `Simulation.getGrandma(id)` uses a lazily rebuilt Map. In Luau, keep `grandmasById[id]` updated on spawn instead.

## Browser-specific code that must be replaced
| Browser piece | Roblox replacement |
|---|---|
| `render/*` (three.js, InstancedMesh crowd, CPU pose maths) | One Grandma Model or MeshPart rig. For hundreds, use client-side visuals with simplified parts, client-side animation via `TweenService`/AnimationController, and server-replicated positions only |
| `ui/*` (DOM HUD, speech bubbles) | ScreenGui with BillboardGuis for speech and status icons (pool them; don't create one per Grandma) |
| `audio/Sfx.js` (WebAudio synthesis) | Sound assets (record or author the same palette) |
| `game/Input.js`, `CameraController.js` | ContextActionService (E, Q, B) and the default or custom camera |
| `game/SaveStore.js` (`localStorage`) | DataStoreService (the serialised state is already one JSON blob; `HttpService:JSONEncode`) |
| Build ghost (`WorldView.updateGhost`) | client-side ghost Part with the same `checkPlacement` called locally, then confirmed on the server |
| `Game.handleEvents` (event → FX) | RemoteEvents fired from the server, with handlers on the client |

## Movement on Roblox
Options, cheapest first:
1. **Keep the custom steering on the server** and replicate positions at about 10 Hz to clients, which interpolate. The crowd separation and obstacle grid port directly. Avoid Humanoids for hundreds of NPCs because they are expensive.
2. Use PathfindingService only for long trips with real obstacles. The open-yard steering covers most cases.
3. For very large crowds, simulate positions on the server, render on the client with anchored parts moved via `BulkMoveTo`, and animate procedurally like the JS crowd.

## Multiplayer authority (if it becomes multiplayer)
- **Server-authoritative:** the entire `GameState` and every system tick. These include resources (shared colony stock), eggs and incubators, placement validation, construction, assignment, day/night, saves, and RNG.
- **Client → server (RemoteEvents):** the player's intent only, meaning `interact(targetId)`, `secondary(targetId)`, `place(type, cx, cz, rot)` and `sleep()`. The server re-validates range and resources using the same functions (`getInteraction` logic and `checkPlacement`).
- **Client-only:** the camera, the build ghost preview, cosmetic animation, particles, speech bubbles and audio.
- **Per-player state:** `player.carry` and `player.egg` become per-player records (`players[userId]`). The current `state.player` is a single record and would become a map.
- **Design questions multiplayer raises:** who may sleep or end the day (a vote, or the host), whether a hatch ritual can be shared, and contention over the hold-to-build interaction.
