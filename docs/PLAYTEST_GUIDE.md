# Playtest Guide

## Run
```bash
npm install
npm run dev
```
Then open **http://localhost:5173/** in desktop Chrome, Edge or Firefox.

To test the production build instead:
```bash
npm run build && npm run preview
```
Then open **http://localhost:4173/**. The `dist/` folder is fully static and can be uploaded anywhere.

Click **Begin**. Click the game view to capture the mouse, and press Esc to release it (this also pauses).

## Controls
| Key | Action |
|---|---|
| WASD / arrows | move |
| Mouse (or right-drag) | look |
| Shift | sprint |
| Mouse wheel | zoom (up to a wide colony view) |
| **E** / left click | interact; **hold** for gather, build, dial, sleep |
| **Q** | at a workplace: send one worker home. Carrying an egg: put it down |
| **B** | build menu. **1–0** pick, **Tab** cycle, **R** rotate, **E**/click place, **B**/Esc/right-click close. Hold Shift while placing to keep placing |
| Esc | pause (save, sound, new game) |
| F3 | performance readout |

## What to test (in order)
1. **Opening (Day 1, untimed).** Is it clear what to do from the objective card and prompts alone? The flow is berries (west hedge) → walk them to the STORES cart → wood (north-east trees) → B → Bed → hold E to build → hold E at the cottage door.
2. **First egg (Day 2 morning).** Does the deadpan line land? Is the basket egg noticeable?
3. **The first hatch.** Pick up the egg, put it in the Gran-ulator, close the lid, hold E to turn the dial to NANA, then stand back. *Does this feel tactile, funny and satisfying?* Watch the squeeze-out, the bun pop, the glasses drop and the wave.
4. **First jobs.** Build a Farm Plot and press E at it to assign Grandma. Does watching her farm and carry turnips feel like a turning point?
5. **Days 3–6.** Eggs pile up. Do you think *"can I afford to hatch these?"* Watch the food bar (`+produced / −eaten per day`) and the beds count.
6. **Automation (6+ Grandmas).** Build a Builder's Hut and a Double Gran-ulator. Try the Auto-hatch ON/OFF switch as a growth throttle. Then build a Foreman's Bell (12+ Grandmas) and assign a Foreman.
7. **Pressure.** Let food run out on purpose. Are the queues, sad icons and warnings readable? Does it feel recoverable? Underbuild beds and watch the lawn sleepers.
8. **Escalation (Days 8–12).** Zoom out. Is the crowd funny and rewarding? Does the game get *more* entertaining as it gets more chaotic, or just noisier?
9. **Save.** Close the tab mid-day and reopen it: Continue resumes from the last dawn or manual save. Try New game from the pause menu.

### Questions to answer afterwards
- Is caring for a rapidly growing population fun? When did it start or stop being fun?
- Was the crowd itself funny or satisfying?
- Did food and bed pressure create real decisions?
- Was assigning jobs satisfying, or just a chore?
- Did manual → automated feel like a reward?
- Was the incubation ritual fun the first time, and still fine the tenth time?
- Did deciding *when* to hatch ever matter?

## URL flags
| Flag | Effect |
|---|---|
| `?debug=1` | dev panel (right) + perf readout |
| `?stress=200` | skip straight to a colony of N Grandmas (try 50/100/200/300) |
| `?autoplay=1` | the balance bot plays the game (pair it with `&speed=4`) |
| `?speed=4` | simulation speed multiplier |
| `?seed=123` | fixed world seed |
| `?nosave=1` | don't touch localStorage |
| `?test=1` | automation mode (no pointer lock, no menus) |
| `?nobake=1` | disable static mesh merging (render A/B) |

Examples: `http://localhost:5173/?debug=1`, `http://localhost:5173/?stress=300&debug=1`, `http://localhost:5173/?autoplay=1&speed=4&debug=1`.

## Debug panel (`?debug=1`)
- +50 food / wood / stone
- +1 / +5 eggs, hatch all
- +1 / +10 / +50 Grandmas
- next day, unlock all, skip tutorial
- pop 50 / 100 / 200 / 300 (builds a staffed colony)
- autopilot, ×4 speed

The **perf readout** (F3) shows FPS, frame / sim / crowd / render ms, draw calls, triangles, Grandma count (and how many are at LOD), workers / idle, eggs waiting / warming, buildings, particles and JS heap.

## Automated checks
```bash
npm test                              # headless sim unit tests
npm run sim -- --check                # balance across seeds and policies
npm run build && npm run test:smoke   # real build in headless Chromium
npm run test:stress                   # 50-300 Grandmas
node tests/browser/screenshots.mjs    # regenerate docs/screenshots
```
