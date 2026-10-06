# SPACE FORTRESS — Prototype Report

**Repo / branch:** `clive-evil/html-familytime-v2` · `claude/busy-lamport-ee55xk`
**Build to run:** `SpaceFortress-Web/dist/SpaceFortress.html` (single self-contained file, ~266 KB, no external assets/CDNs/fonts — runs from `file://`)
**Launch:** open that file in a modern desktop browser, or `cd SpaceFortress-Web && npx http-server -p 8080 . -o /dist/SpaceFortress.html`. Rebuild from source with `node tools/build.mjs`.

---

## 1. What existed before this pass

The repository (`main`) contained only a `README.md` stub — "Family Time HTML Prototype V2". The
default branch had **no game**. Seven sibling `claude/*` branches held unrelated self-contained
prototypes (an RNG raid, a driving sim, a skiing game, a bowling game, two Chaos World battle
experiments, a colony-ship horror sim). None was a Space Fortress / orbital-warfare game, and none
shared code with this task. Nothing was removed or overwritten; this pass adds a **new, self-contained
`SpaceFortress-Web/` project** on the assigned branch, following the "extend, don't clobber" rule
(there was nothing in `main` to extend, so this is a clean build in its own directory).

## 2. What this pass added

A complete, playable orbital-arsenal strategy prototype — rules engine, 5-system campaign,
four weapon systems plus the Planet Killer, abstract invasions, mining economy, fortress
progression, two tactile manual-weapon consoles, procedural art/audio/FX, a guided tutorial,
save/restart, win/lose, and a full automated test + balance + screenshot toolchain.

## 3. Core loop (as implemented)

Enter system → **scan** worlds (reveals defences, garrison, resources) → read the command panel
and decide what you want → **strip defences** with weapons (shield → guns → barracks) → **invade**
(troops, with a live forecast) / **capture** / **claim** neutral worlds / or **destroy** → gain
resources + spoils → **upgrade** the fortress → unlock bigger weapons → secure the system → **jump**.
Pressure (escalating Sector Command strikes + scheduled fleets + garrison reinforcement) stops you
from solving everything at leisure.

## 4. Weapons implemented

| Weapon | Identity | Notes |
|---|---|---|
| **Railgun** | Precise kinetic, cheap, deadly to armour/ships/shield-gen | 1 shot/cycle (2 with Twin Rail). Ammo: Kinetic, Fragmentation, Bunker Buster. **Full manual console.** |
| **Orbital Laser** | Sustained beam, no ammo, power-hungry, heats up | Unlockable. Great vs soft targets & power grids, weak through shields. Overheats at 100. Thermal Lance sweeps a 2nd target. |
| **Missile Array** | Flexible payloads, interceptable | Conventional / **EMP** (disables 2 cycles) / **Nuclear** (devastates + contaminates). Smart Guidance halves interception & adds a 2nd salvo. |
| **Heavy Bombardment** | Blunt area barrage, heavy collateral | Good vs troops/cities/soft targets. Cannot reach orbit. Blocked while our troops are on the surface. |
| **Planet Killer** | Ultimate weapon | Erases a world permanently. 40 Exotic + 30 Fissile + full reactor, 4-cycle cooldown. **Full 12-stage manual firing sequence.** |

Each weapon shows a **live preview** vs the selected target (rating, % hull, kill chance, shielded/intercept/collateral notes).

## 5. Resources

Four, as specified — **Metals / Fissile / Crystals / Exotic**. Metals = construction & railgun/bombard ammo;
Fissile = nukes, reactors, bunker busters; Crystals = laser & EMP & high-power modules; Exotic = Planet Killer
& endgame tech (rare — mainly from Sable in system 3). No minor currencies.

## 6. Troops / invasion

Abstract single pool (`GROUND FORCES`). Deploy a chosen number to a scanned enemy world; a forecast shows
**victory chance, expected losses, capture time**, all of which improve visibly as you destroy cannons (dropship
losses), command posts (coordination), barracks (garrison) and the shield. Troops fight over 1–3 cycles;
survivors return. Drop Pods upgrade makes them fight harder, lose fewer, capture faster. No unit micro, no designer.

## 7. Mining

Captured mines auto-produce every cycle, forever, even after you leave the system. Damaged mines produce
proportionally less; contaminated worlds (nukes) lose up to 60% yield; destroyed mines produce nothing.
Upgradeable Mine I → II → Deep-Core. Neutral asteroid/moon worlds can be claimed without combat. Captured
cities add recruits.

## 8. Planet Killer — status: **fully functional**

Unlock path (FORTRESS CORE branch: Reactor → Module Capacity → Planet Killer Infrastructure) is visible and
locked from the start, shown on a dedicated dock card with its requirement checklist and Exotic cost. When armed,
opening it launches a **12-stage ceremonial manual sequence** (open chamber → route power → cores online →
unlock containment → align arrays → sync emitters → cryo cooling → charge capacitors → planetary lock → lift
cover → turn firing key → engage), with dimming, strobes, rising drone, alarms and a huge delayed beam/impact.
Firing permanently removes the world, its resources, its population and its garrison, and starts a cooldown.

## 9. Manual weapon control — status: **fully functional (Railgun)**

The Railgun has a polished manual console: a 10-step procedure (select ammo → load shell → lock breech →
set bearing → set elevation → coolant → charge capacitors → firing solution → release safety → fire) driven by
draggable levers, a breech wheel, bearing dial, elevation slider, coolant valve with a temperature gauge,
a capacitor bank with a green "release here" band, a stabiliser needle, and a safety-cover + fire button.
Quality (alignment × charge × cooling × timing) scales damage ×0.85–1.5, guarantees the hit, cuts collateral
up to 80%, and can crit. Over-charging arcs; charging without coolant trips a thermal cutout; the target drifts
as the planet turns, so you must track it. Other weapons use quick Auto-Fire (the tactile layer stays rare and special).

## 10. Campaign

Five hand-authored systems (14 worlds total): **Kessler's Reach** (Frontier — teaches railgun + capture),
**Halcyon Drift** (Fortified Colony — shield + bombard-vs-invade decision), **Aurum Cascade** (Resource System —
Exotic Matter at Sable; preserve mines), **Iron Crown** (Enemy Stronghold — layered shields/bunkers/guns, needs
combined weapons), **The Pale Throne** (capital Aeternum — take it rich or erase 38M people). Threat and fleet
pressure scale per system. Win = final system cleared; lose = hull 0.

## 11. Tutorial — status: complete, 10 steps

Guided, task-driven, with a tracking highlight ring + arrow and a NEXT OBJECTIVE panel: select → scan → identify
the cannon → arm railgun → manual control → destroy it → deploy troops → end cycle → mining income → first upgrade.
Hand-holding stops after. Verified end-to-end by `tools/tutorial.mjs`.

## 12. Tests run and results

- **`npm test` — 25/25 pass** (`node --test`, pure rules engine). Covers: resource/power deduction and never-negative,
  scan/power/resource gating, one-shot-per-cycle + reload, laser lock/heat/overheat, captured-mine income, destroyed
  mines produce nothing, damaged/upgraded mine yield, neutral claim, **invasion forecast improving as each defence
  falls**, shield protecting-but-not-itself, manual quality raising damage / cutting collateral, nuke value-destruction
  + contamination, **Planet Killer permanently zeroing all value**, upgrade prerequisites + unlocks, troop deploy/return,
  hull-0 loss, EMP disable+recovery, precision-preserves-more-value-than-bombardment, sector-strike escalation, fleet
  raids, module knockouts + armour immunity, **tutorial completes**, **full campaign completes under 3 autoplayer
  strategies**, and **save/load round-trip mid-campaign**.
- **`tools/smoke.mjs` / `interact.mjs` / `playthrough.mjs`** (headless Chromium): boot clean (no console/page errors),
  both manual consoles driven through **real pointer input** to a fired shot, and the **entire campaign won through the
  real UI render/FX/impact pipeline** (seed 5: win, 5/5 systems, 42 cycles, 0 errors). Stress-run 8× clean.
- **`npm run balance`** (144 autoplayer campaigns): all strategies reach a decisive result; see §14.
- Ran in a real headless browser at 1600×900 and 1366×768; screenshots in `docs/screenshots/`. **No human has played it.**

## 13. Not completed / known limitations

- Manual control exists only for the Railgun (by design — the brief asked for at least one polished mode) and the
  Planet Killer. Laser/Missile/Bombardment are Auto-Fire only.
- Enemy fleets are abstract dots that shell the fortress or raid mines; there is no ship-to-ship RTS (out of scope).
- No in-game audio/volume slider beyond mute; audio needs a user gesture to start (browser policy) — handled by the title buttons.
- Balance is tuned against an efficient autoplayer; a first-time human will be slower, so Sector pressure may feel sharper. The numbers are a starting point, not final tuning.
- Save format is v1 with a version guard; older/incompatible saves are rejected and restart cleanly.
- `manual` autoplayer strategy loses 1/12 on the harshest seed — reflects that aggressive manual play can over-extend, which is acceptable (it is not the dominant line).

## 14. Balance snapshot (12 seeds × 5 strategies)

```
precision  wins 12/12 | ~25c | min hull 70% | end income 208/cyc | troops lost 58k | civ 17.5M | PK 0
manual     wins 11/12 | ~20c | min hull 79% | end income 222/cyc | troops lost 45k | civ 10.4M | PK 0
nuke       wins 12/12 | ~20c | min hull 69% | end income 132/cyc | troops lost 44k | civ 34.9M | PK 0
pk         wins 12/12 | ~24c | min hull 73% | end income 206/cyc | troops lost 50k | civ 32.8M | PK 9
brute      wins 12/12 | ~24c | min hull 54% | end income 168/cyc | troops lost 58k | civ 22.8M
```

The intended tension holds: **precision/manual finish richest and cleanest; nukes and brute force are
faster or easier but gut the economy (132–168 vs 208+) and cost far more lives; the Planet Killer wins
but leaves nothing behind.** No single line dominates on every axis.

## 15. Assessment — strongest part

**The manual Railgun console and the readable strategy↔weapon relationship.** The console turns a single
attack into a deliberate, masterable machine-operation ritual (the rhythm the brief asked for), and the
command panel + live weapon previews + invasion forecast make cause-and-effect legible: you can *see* that
killing the shield exposes the surface and that killing the barracks drops your expected casualties from
18k to 5k. Together they make "what do I want from this world, and what's the cheapest way to take it?"
the actual moment-to-moment decision.

## 16. Assessment — weakest part

**Only one weapon has a manual mode, and mid/late enemy pressure is tuned to an optimal autoplayer, not a
learning human.** The Laser especially is thematically begging for a tactile heat-management mode. And
because the autoplayer is efficient, a new player who scans and deliberates may find Sector strikes and
fleets arriving faster than feels fair on the harder systems; the curve needs human playtesting to settle.

## 17. Next 5 highest-value improvements

1. **Manual Laser mode** — a heat/beam-sweep minigame (hold the beam on target, manage temperature, cut through structure). The second tactile pillar.
2. **Human-facing difficulty pass** — slightly gentler early Sector escalation + a difficulty toggle; verify the first-session curve with real playtesters.
3. **Fortress damage made visceral** — localized module hits in the HUD (this weapon offline, that bay breached) with a small repair-prioritisation choice, so taking fire *feels* like damage to a specific machine.
4. **Richer enemy agency** — fleets that besiege captured worlds over several cycles, counter-invasions to retake a world, and reinforcement convoys you can interdict.
5. **Economy depth without bloat** — one or two strategic choices per captured world (garrison it against raids vs. strip it for a one-time payout; convert industry to a repair yard), to make the post-capture map matter more.

---

# Addendum — Physicality / Art-Direction Overhaul (2026-10-06)

A second pass reframed the prototype so it reads as the **interior of a colossal orbital war
machine** rather than a sci-fi HTML dashboard. All gameplay logic, campaign, invasion, resource,
progression, Planet Killer and save systems were preserved unchanged (the 25 rules tests and the
full-campaign playthrough still pass); this was a front-end / game-feel / visual-architecture pass.

**1. Repo / branch:** `clive-evil/html-familytime-v2` · `claude/busy-lamport-ee55xk`.
**2. File to run:** `SpaceFortress-Web/dist/SpaceFortress.html`.
**3. What existed before this pass:** a working strategy prototype whose presentation was flat
rectangles, thin-bordered panels, tiny uppercase text, evenly-spaced boxes and abstract CSS dials —
structurally sound but close to an AI-generated dashboard.
**4. What changed:** a reusable industrial material toolkit; a Command Deck home view; a fixed-camera
station-navigation model; the railgun and Planet Killer consoles rebuilt as heavy machinery; the
weapon selector rebuilt as a physical module rail; diegetic metal reskin of the HUD; a multi-beat
world-destruction spectacle; and tactical-table framing with firing/landing vectors.

**5. Command Deck:** new default home (`deck.js`). A giant angled observation window shows the
current planet, the system star and the fortress's own railgun barrel through a structural opening;
foreground consoles carry live analogue HULL/SHIELD gauges, a reactor segment meter, 7-segment
resource readouts and per-weapon readiness lamps; a holographic tactical plot rises from a bolted
drum and is the clickable way into the Tactical Table. Ceiling trusses, pipes, wall columns, cables
and warning placards frame the scene.

**6. Tactical Table:** the existing strategy map, reframed as a projected war-table — corner-bracket
bezel, faint scanlines, a dashed firing-solution vector from the gun to the selected target with a
reticle, troop landing-route vectors, planetary shield hex-grid, and persistent surface damage
(craters, scorch, contamination, destroyed-installation embers). Panels are now metal console
housings (steel gradient, inset highlight, holo accent edge) instead of thin-bordered boxes.

**7. Railgun station:** rebuilt as a physical gunnery bay (`manual.js` rendering) — structural
I-beams, a breech-housing cylinder, the barrel receding behind a rugged gunnery sight, coolant/power
pipes, cable bundles, an overhead gantry and warning placards. Controls are real machinery: a spoked
traverse handwheel, a geared elevation lever, a cryo valve with frost and an analogue temperature
gauge, cylindrical capacitor cells that glow and arc while charging, a safety cover and trigger.
Panel titles use clean engraved label strips. The 10-step firing flow and all input coordinates are
unchanged, and the hand-driven shot still verifies end-to-end.

**8. Planet Killer:** rebuilt as an annihilation **chamber room** (`pk.js` rendering) — armoured
walls, giant mechanical focusing rings around a reinforced targeting aperture with the doomed planet
behind contracting iris blades, reactor-core breaker housings, power conduits that light with
progress, a segmented capacitor bank, cryo valve, dual authorization keys and a caged ENGAGE trigger.
The room intensifies through the 12-stage sequence (lights dim, conduits illuminate, iris contracts,
vibration builds, red alarm wash). The firing payoff (`fx.planetKill`) is a multi-beat spectacle:
charge knot at the muzzle → beam travel delay → blinding impact → a solid body veined with glowing
cracks → shatter into tumbling chunks → expanding shockwave → lingering debris field.

**9. Diegetic UI:** physical readiness lamps replace "READY" text; analogue gauges and segmented
meters replace bare percentages; a riveted station rail, metal top strip and engraved labels replace
flat chrome. `iron.js` provides the shared vocabulary (scratched steel plates with bolts and baked
grime, bolts/rivets, lamps, analogue gauges, segment meters, pipes, cable bundles, CRT screens,
hazard placards, stencil/engraved type, valves and toggles).

**10. Weapon animations / feedback:** charge-reactive lighting and arcing on the railgun; iris,
conduit and vibration escalation on the Planet Killer; mining extraction beams with resource-shuttle
pulses on captured worlds; troop dropship streaks and landing routes; the full firing spectacle.

**11. Audio:** added servo-slide, heavy door, relay and sub-vibration cues for station movement and
machinery, on top of the existing procedural weapon signatures.

**12. Fortress exterior:** the 2.5D fortress silhouette (barrel, reactor, troop bays, missile racks,
laser turret, Planet Killer ring) remains visible in the tactical foreground and grows modules as you
upgrade; it is also framed through the Command Deck window.

**13. Transitions:** moving between stations plays a blast-door / shutter wipe (horizontal doors for
deck↔tactical, side doors otherwise) with a servo cue, instead of an instant page swap. Entering a
weapon station wipes into its console; closing returns you to the station you came from.

**14. Performance:** all canvas 2D; the Command Deck caches its static backdrop; the industrial
toolkit caches grime and glyph textures. No WebGL, no heavy per-frame allocation; render loops are
try/guarded so one bad frame can never freeze the game.

**15. Tests run:** `npm test` 25/25 pass; headless smoke/interaction/playthrough clean (both weapon
consoles driven through real pointer input; full campaign won through the real UI render/FX pipeline);
tutorial completes; checked at 1600×900 and 1366×768. No console/page errors across the suite.

**16. Not completed:** the Laser and Missile/Bombardment still use Auto-Fire only (no bespoke tactile
console — the railgun remains the one hands-on weapon besides the Planet Killer); Engineering is still
a metal-framed modal rather than a full walk-in workshop station; station transitions are a 2D wipe
rather than a true camera dolly.

**17. Weakest remaining visual areas:** (1) the Engineering/upgrade modal is the least physical
screen; (2) the Laser has no tactile mode to match the railgun; (3) deck gauge typography still has a
faint 7-seg "ghost" artifact; (4) the tactical planet, while detailed, doesn't yet show large-scale
city-grid or ocean specular that would sell its scale up close; (5) enemy fleets are still simple
sprite clusters rather than modelled ships.

**18. Next five highest-value improvements:** (1) a tactile **Laser** heat/beam console as the second
hands-on weapon; (2) rebuild **Engineering** as a physical module-install bay with animated gantry
arms bolting new modules onto the fortress; (3) a true **camera-dolly** transition between stations
instead of a wipe; (4) richer **impact decals** that accumulate on a world across multiple strikes;
(5) an onboarding revision that explicitly teaches the station layout (deck → table → railgun → fire
→ back → capture).
