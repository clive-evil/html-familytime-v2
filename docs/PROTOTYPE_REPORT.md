# Prototype Report: Too Many Grandmas

Branch: `claude/sweet-sagan-7y09ey` (GitHub `clive-evil/html-familytime-v2`). The brief asked for a GitLab branch named `prototype/too-many-grandmas`, but this environment is connected to GitHub and pinned to the branch above.

## Status: AUTOMATED VERIFIED vs HUMAN PLAYTEST STILL NEEDED
**No human playtest has taken place.** Everything below was verified by automated tests, by a scripted bot playing the real simulation, and by reviewing screenshots. Fun, feel, pacing and readability for a real player are **unverified**.

## What was built
- **Third-person 3D game** (Three.js + Vite). WASD, mouse look, sprint, zoom, contextual E/Q interactions, hold-to-act.
- **One Grandma rig.** A procedural mascot blob with a bun, big glasses, cardigan, shawl and slippers. Variation comes from cardigan, bun, glasses, frame colour, skin, shawl, slippers and size, plus rare Big, Tiny and Golden Grandmas. The whole crowd is drawn as instanced meshes with CPU pose animation and LOD.
- **Grandma Eggs.** Eggs are laid at dawn. Storage is capped (basket and crates) and overflow rolls away. There is a manual **Gran-ulator** ritual (insert → lid → dial WARM / TOASTY / NANA → rattle, wobble, crack → squeeze-out hatch with a bun pop, glasses drop and wave). The **Double Gran-ulator** and **Deluxe** are automatic, with an Auto-hatch switch, and Builders haul eggs to them.
- **Needs.** Hunger is handled with visible table queues. Starving Grandmas work at half speed and lay fewer eggs. Beds are assigned at night; the unbedded shiver on the lawn and are stiff the next day.
- **Jobs.** Farmer, Lumber, Miner, Builder/Hauler and Foreman. Assigning is one button at the workplace. Work is fully visible: the Grandma walks to the job, does it, carries the produce and deposits it. There are personality quirks (tea, nap, wrong way, fussing, pointless queueing, giant turnips).
- **Building.** 14 player structures with grid snapping, a green/red ghost with a reason, rotation, hold-to-build or builder construction, and unlocks driven by population.
- **Day / night cycle**, a morning summary card, a 14-step self-skipping tutorial followed by contextual hints, a paper-tag HUD with warnings, speech bubbles and procedural audio (24 sounds).
- **Save / load / new game** via localStorage. **Debug panel**, **perf readout**, **URL flags** (`stress`, `autoplay`, `speed`, `seed`, `nobake`, …).
- **Headless simulation, tests and balance tooling**, plus docs.

## Intentionally not built
Monetisation, quests, achievements, cosmetics shop, multiplayer, Roblox, CrazyGames SDK, demolition or moving buildings, a cooking chain, extra resources, mobile touch controls (the input layer is action-based so they can be added) and gamepad.

## Automated test results (final run)
| Suite | Command | Result |
|---|---|---|
| Unit tests (Node) | `npm test` | **46 / 46 pass** (~1.6 s) |
| Balance simulation | `npm run sim -- --check` | **PASSED** (4 seeds balanced, 2 each greedy / never / lazy, 12 days) |
| Browser smoke (prod build, headless Chromium) | `npm run test:smoke` | **31 / 31 pass**, 0 console errors |
| Browser stress | `npm run test:stress` | **PASSED** (50 / 100 / 200 / 300, 0 NaN or escaped agents, 0 errors) |
| Production build | `npm run build` | OK; 653 kB JS (181 kB gzip) |

The smoke test covers:
- start, WebGL, no console errors
- movement with W
- gathering, auto-deposit, Grandma eating
- wood → bed placed through the build menu → built
- sleep → Day 2 → egg
- egg pickup → insert → lid → dial → hatch → population 2 in the HUD
- farm placed, built, Grandma assigned, food delivered
- NO FOOD / HUNGRY and bed warnings
- multiple days
- save → reload identical
- reset
- 100 Grandmas

## Simulation findings
Balanced bot, median Grandmas at the start of each day:

| Day | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Grandmas | 2 | 4 | 6 | 10 | 15 | 21 | 34 | 52 | 81 | 107 | 113–138 |

- **Escalation** roughly follows the target curve (1 → 2 → 4 → 8 → 15 → 30 → 60 → 100+). 100 Grandmas arrive around Day 11, about 29 minutes of play at 150 s days.
- **Hatching matters.** The never-hatch control stays at 1 Grandma; hatching policies reach 110–143.
- **No unavoidable early starvation.** The balanced bot had zero missed meals on every seed.
- **Food pressure is real.** The `lazy` policy (at most 2 farmers) starts missing meals around Day 9 (41 → 144 missed meals per day). The colony keeps going, so failure is soft.
- **One farmer feeds about 5 Grandmas**, measured at roughly 20 food per farmer per day against 4 per Grandma. There is no infinite-food exploit.
- **Bot weaknesses** (these are not game bugs): it builds proactively, so it rarely feels bed pressure, and only a few Grandmas slept outside late on. A human will feel more pressure than the bot shows.
- **Early-game limiter.** Egg storage, not food, limits growth on Days 4–7. Eggs "roll away" unless the player builds crates.

## Performance observations
**Caveat:** this container has no GPU. Chromium renders with SwiftShader (CPU), which caps the frame rate at about 10 FPS regardless of load. **FPS on real hardware has not been measured.** The CPU-side numbers below are the meaningful ones.

| Grandmas | sim ms/frame | crowd anim ms/frame | draw calls | JS heap (start → end of run) | SwiftShader FPS |
|---|---|---|---|---|---|
| 50 | 0.31 | 0.16 | 320 | 14.8 → 15.0 MB | ~10–11 |
| 100 | 0.61 | 0.35 | 365 | 15.9 → 16.0 MB | ~10–11 |
| 200 | 0.84 | 0.41 | 379 | 17.8 → 17.9 MB | ~10 |
| 300 | 1.14 | 0.80 | 389 | 19.9 → 20.0 MB | ~9–10 |

- **Headless Node** (no rendering): 300 Grandmas take about 0.5 ms per sim tick. Heap growth across 1,200 ticks is under 50 MB (unit test).
- **No memory growth trend** was seen in any browser run (≤ 0.3 MB over 16 s at every population).
- **Rendering.** The crowd adds about 35 draw calls in total; the rest is buildings and trees. Baking static meshes cut draw calls from about 830 to about 390 at 300 Grandmas. Under SwiftShader, baking made raster time *worse* (likely lost per-object culling and front-to-back sorting). It's kept on because draw-call count usually dominates on real GPUs. **A/B it on real hardware with `?nobake=1`.**
- **Highest count stress-tested: 300** in the browser and in Node. The CPU budget suggests 1,000+ is feasible before the simulation becomes the bottleneck. Expect vertex count to become the GPU limit before that (about 2k vertices per Grandma). See "Scaling further" in TECHNICAL_ARCHITECTURE.md.

## Visual QA (screenshots in `docs/screenshots/`)
Scenes captured: title (00), starting cottage (01), egg (02), dial (03), hatch (04), early settlement (05), Grandmas working (06), food and bed pressure (07), a 91-Grandma colony on Day 11 (08), the 300 stress test (09) and night (10).

Fixed after review:
- the black bun variant
- the cardigan hiding the face
- steam drawn as giant rocks
- Grandmas hatching on top of the player
- a porthole that didn't show the egg
- the HUNGRY warning lingering after food arrived
- 3 Grandmas speaking at once
- toast spam over the centre of the screen
- a night that was too bright
- "1 Grandmas need beds"

Still observed:
- The player avatar can block the view of the Gran-ulator during the ritual. Rotating the camera helps.
- With high crowd density at the tables, Grandmas overlap a little.
- Text on the dial face is small at gameplay distance. The prompt shows WARM / TOASTY / NANA as well.

## Known issues
1. **No real-GPU performance numbers** (see above).
2. **Day 1 has no clock**, so a player who wanders can take as long as they like. This is intentional, but untested with humans.
3. **Navigation is steering-based.** Long walks round big building clusters can look indirect. Stuck detection prevents permanent pinning, but a Grandma can accept "close enough" at a busy deposit point.
4. **Nodes can run dry.** Berry bushes regrow every 7 s per berry. Early players may need to move between bushes.
5. **Buildings can't be removed or moved.**
6. **The summary card pauses the game at every dawn.** That's good for reading, but may feel interruptive later on.
7. **The foreman ignores job priority** beyond food and builders. Lumber, miner and builder slots are filled by lowest fill ratio.
8. **Placement in front of the player** relies on camera direction, so the player has to turn to aim. There is no mouse-cursor placement.
9. **The JS bundle is 653 kB (181 kB gzip).** Vite warns about chunk size. It's acceptable for a prototype.
10. **Mobile, touch and gamepad are not implemented.**

## Needs a human playtest
- Is the first hatch ritual *satisfying*, and is the audio pleasant (none of the sound has been listened to by a person)?
- Is the Day 1–2 onboarding clear without help?
- Pacing: is 150 s per day right, and are 100 Grandmas at about 30 minutes too slow or too fast?
- Does the hatch-or-wait decision actually arise for a human?
- Is the crowd funny at 50, 100 and 300 on a real GPU, and is the frame rate acceptable?
- Is the HUD readable, and does anything cover important gameplay?
- Are the quirks charming or confusing?
- Does pointer lock, Esc and resume behave well in each browser?

## Recommended next iteration
Decide after the first playtest, not before. Candidates are listed in the final hand-off message.
