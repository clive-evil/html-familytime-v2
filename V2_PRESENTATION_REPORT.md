# THE LONG WATCH — V2 Presentation Report

**Build:** `dist/ColonyShipHorror.html` (still one standalone file, no external assets; ~356 KB)
**Scope of this pass:** presentation, onboarding, readability, atmosphere and sound, built on top of the V1 simulation. No V1 system was removed or simplified. The 13 system assertions from V1 still pass, and the scripted full-arc balance runs land in the same place (see §11).

Before/after sheets: `docs/screenshots/compare_*.jpg` · V1 shots: `docs/screenshots/v1/` · V2 shots: `docs/screenshots/v2/`

---

## 1. What changed (summary)

| Area | V1 | V2 |
|---|---|---|
| Onboarding | A help manual and log hints | **FIRST WATCH** guided tutorial (7 steps, real actions, skippable), a checklist, focus framing, and 13 one-time contextual tips with an on/off setting |
| Pacing | Director started at once | Director runs on its own clock that is **frozen during the tutorial**, so no fault or horror can fire while learning. Routine resumes afterwards with the tutorial beats not repeated |
| Scale | Small parallax silhouette | Two parallax layers of the rest of the colony ship (habitation ring with thousands of windows, spine shafts with moving lift lights, ribs, gantries with trams, coolant arteries, dormant sections, distant beacons), adjacent sections above the hull, and a **2,400-berth lower cryo stack** below the keel whose lights go dark one by one as colonists die |
| Cryo | 2 tiers of pods and a small recess | An observation window into the main bay: berth rows receding into fog |
| Rooms | Shared kit, few personal details | A lived-in pass: taped notes and checklists, serials, faded warning labels, jackets, masks, cups, trays, blankets, photos, bins, corrosion, condensation, a floor drain in quarantine. Each room also has its own ambience: reactor heat shimmer, drips in O2/hydro/cryo, cryo floor mist, hydro humidity |
| Ship memory | Blood decals only | Persistent scars: scorch with heat tint and blistered paint, ceiling soot, melted panels, welded breach patches, weld seams after major repairs, temporary wiring panels, frost staining after vacuum, burned-out residue after decontamination, claw gouges, bent vent grilles |
| Darkness | Unpowered rooms nearly pure black | Rooms keep their shape (fans, bunks, suits) under faint ambient light. Standby LEDs, emergency strips, stuttering ballasts and light leaking through open doors from lit neighbours. **Threats stay hidden**: the organism is drawn in unobserved rooms only where a helmet lamp actually points |
| Lighting states | Global red tint at alert 2 | Red is **local**: it appears only in the emergency room and its neighbours. Yellow warnings use a subtle amber beacon. Breaches cast cold starlight. Camera loss shows a brief image collapse |
| Crew art | Stick-figure silhouettes | Articulated sprites (two-segment limbs, hands, faces, hair from the portrait data) with profession gear: hard hat and tool belt; maintenance cap, goggles and belt; medic vest, satchel and armband; armour plate, helmet and slung rifle; open lab coat with badge; command jacket, boards and cap |
| Crew animation | Walk and generic work | Idle breathing and glances, walk, run, limp (hand on wound), repair, weld (kneeling), extinguisher, console, eat (seated), sleep (breathing blanket), treat (kneeling), port arms, aim and fire with recoil, crouch in fear, panic, downed (reaching), dead, ladder climb (back view) |
| Social life | None | During routine, crew pair up to talk (gestures and a speech tick) and sit with friends or kin at meals. Dana and Kit play cards. Socialising lowers stress, and kin gain morale |
| Reactions | Text only | Crew flinch, freeze and turn toward fires, breaches, attacks, vent drops and duct noises in their room or the next one |
| Organism | Visible or not | Evidence first: vent grilles flex, dust sifts down, a hanging cable swings, crew turn to look. A shape crosses a lit doorway. Monitors fill with static near it. Partial silhouettes at the edge of a torch beam. A heavier, compressed body |
| Audio | Fixed beds | Room-local machinery bed that stops dead when the room loses power. In a blackout the alarms also die, leaving a battery chirp and the hull ticking as it cools. The mix is muffled as the viewed room loses pressure. Debris rattles in breaches. Footsteps up close. Breath only when the organism is near the camera. A very low late-watch tension drone. No growling loops |
| Log | One stream | Categories (CRITICAL / CREW / MEDICAL / SECURITY / SYSTEM / DOORS) with glyphs (`! ● + ◉ · ▮`) and filter tabs. Critical lines get a red rule |
| UI | Some `title` tooltips | Fast styled tooltips on every resource, every room/crew bar (with danger thresholds) and every power bus. Settings popover (hints, auto-pause, volume). The most severe alert chip is emphasised. Biographies moved below vitals |
| Flavour | None | Non-threat events on their own timer: distant impacts, flickers, a broken dispenser, odd smells (half of them false), loose duct panels, **false motion alarms**, cryo berth alarms, coolant drips, and ship-band radio that grows more ominous with each phase ("Section 11 not answering…", "seal your ducts", "isolation protocol") |
| Title | Static card | Minimal staged intro: ship, year, population, distance, *SECTION 06 — WATCH CHANGE*, then BEGIN WATCH or begin without tutorial |

---

## 2. Tutorial flow (FIRST WATCH)

The tutorial teaches through the live simulation. Callouts sit beside the thing they describe, and a pulsing frame dims everything else slightly. The camera pans to world targets on its own. A checklist sits bottom-left (click an item to refocus, click the header to collapse). **skip tutorial** is on every callout. While the tutorial runs, the director's clock is frozen: no meteors, fires, infection, organism or flavour events.

| # | Step | What the player does | Teaching |
|---|---|---|---|
| 1 | Look around | A 5-beat tour (ship → crew list → resources → power → log), then any zoom or pan | "You are watch officer for Section 06. Keep the section powered, pressurised and alive." |
| 2 | Inspect a room | Click OXYGEN PROCESSING, then CONTINUE | Pressure, oxygen, integrity, power and camera, crew present. Hover any bar for its meaning |
| 3 | Select crew | Click INES HARPER, then CONTINUE | Profession, job, health, stress, traits, relationships. "Experienced crew are valuable. Death is permanent." |
| 4 | Repair a fault | A harmless *hydroponics pump filter* fault. With Ines selected, right-click Hydroponics → REPAIR | She physically walks two rooms through doors. "Orders are physical: distance and closed doors cost time." |
| 5 | Balance power | A scheduled turbine inspection caps the reactor below demand (battery shown draining). Switch HABITATION off, watch quarters and mess go dark and demand drop, then switch it back on | Buses and their consequences |
| 6 | Seal a leak | A small airlock gasket leak. The neighbouring door is held open (auto-close suppressed for this step). Click the door → CLOSE | Pressure stabilises. "Powered doors close themselves; unpowered doors don't." The gasket is reseated and leaves a patch scar |
| 7 | Restore camera | The empty Cryo Bay feed drops: *NO FEED / LIFE SIGNS 0* | "During real emergencies you may have to send crew into rooms you cannot see." The feed is restored |
| — | WATCH INITIALISED | A banner, then the checklist collapses | "Keep the ship running. Respond to alerts. Pause whenever you need time to think." |

Measured with `tools/tutorialtest.mjs` (real mouse and keyboard): an attentive player finishes in about 2–4 minutes. The automated run takes 70 s of sim time because it acts instantly. After the tutorial the director starts 100 s into routine, which puts the first failure about 1 minute later and the first fright about 7 minutes after the tutorial ends.

**Contextual tips** fire once each, the first time a situation occurs: fire, breach, power deficit, breaker trip, camera loss, refusal, possible infection, crew down, panic, SCRAM, first organism sighting, unexplained motion, quarantine. They are short, dismissible and never stack beyond two, they are suppressed during the tutorial, and **SETTINGS → Tutorial hints** turns them off (saved in localStorage when available).

---

## 3. Art improvements

- **Scale.** At minimum zoom the playable decks are a small lit box inside a structure that fills the screen: a habitation drum, vertical spine shafts with slow lift lights, five irregular structural ribs, gantries with moving trams and walkway lamps, coolant arteries, dormant blocks ("SECTION 07 — DORMANT", "DECK 42 — MAINTENANCE"), suspended machinery, and distant red and white beacons. Depth uses sub-linear zoom scaling, slower pan parallax and baked depth haze (`05_scale_zoomed_out.jpg`).
- **Cryo meaning.** The 2,400 berths are visible twice: through the bay window, and as the lower stack under the keel. Lost colonists become dark berths, and the stack strobes amber while the bay warms.
- **Lived-in detail** is drawn from a small reusable kit (`kNote`, `kChecklist`, `kWarn`, `kSerial`, `kJacket`, `kMask`, `kCup`, `kTray`, `kBin`, `kPhoto`, `kDrip`, `kTape`), placed per room with intent: an armoury key note, "MAX 1 PATIENT", "LATHE — EYES", "FILTER DUE", "OUT OF ORDER" on the galley, photos on bunks, "COLD BURN" in cryo, and inspection serials.
- **Ship memory** accumulates from real events, so by the late watch the section looks like it has survived something (`06_ship_memory_after_crises.jpg`).

## 4. Crew sprite changes

`src/js/sprites.js` replaces the old figure. Each sprite has a contact shadow, two-segment legs with boots, a tapered torso, two-segment arms with hands, a shaded head with eye and nose, hair styles from the same data the portraits use, and profession clothing and headgear. Size is about 40 px at 1× zoom; at close zoom they read as small hand-made characters rather than placeholders (`07_crew_poses_closeup.jpg`, `08_crew_normal_zoom.jpg`). Poses come from simulation state, so animation is information: you can tell who is welding, who is aiming, who is frozen in fear and who is limping. Portraits gained matching gear (helmet and armour, lab coat, command collar, goggles, satchel strap) and key lighting.

## 5. Lighting changes

- Darkness levels were retuned: powered rooms 0.70, unpowered 0.86, no feed 0.90 (V1: 0.93 and 0.985). Shapes stay readable, so the room is recognisable but the corners are not.
- Emergency strips, standby LEDs, dying-ballast stutters, spark flashes and door light-leak from powered neighbours (including hatches) only appear where they make sense.
- **Red is local.** Only the emergency room and its neighbours get red pools and the red beacon; elsewhere the section is unchanged. Yellow warnings (damage, electrical fault, coolant leak) get a slow amber beacon. The top-edge pulse is subtle.
- **Breach:** cold starlight from the hole, plus particles and frost.
- **Camera loss:** the image collapses (flash, then black) before the static.
- **Organism nearby:** lights drop out, monitors fill with static, and the camera fails only while it is still stalking. No red overlay.

## 6. Audio changes

All audio is still procedural WebAudio. I could not listen in this environment, so `tools/audiotest.mjs` taps the mix with an AnalyserNode and measures level and spectral centroid per state:

| State (reactor room in view) | Level | Brightness |
|---|---|---|
| Routine | −22 dBFS | ~205 Hz |
| **Power failure / blackout** | **−44 dBFS** (−21 dB) | — |
| Restored | −22 dBFS | — |
| Breach in view | −22 dBFS | ~490 Hz (wind and rattle through the muffle) |
| Organism in view | −23 dBFS | ~125 Hz (breath, scraping) |

Silence now does the work in power loss. Machinery, ventilation and alarms all stop, leaving only the cooling-metal ticks, a battery chirp every 7 s, distant groans, vent scrapes and radio. The mix still needs a human pass by ear (see §9).

## 7. Horror presentation changes

- **Stage A, evidence:** flexing vents with dust and a swinging cable *with or without sensors*, crew turning toward duct noise, the first-fright sequence, monitor static, odd smells. These are now mixed with **false** clues (loose panels, thermal-pop motion alarms, ordinary fevers, a broken dispenser), so not everything strange is the organism.
- **Stage B, glimpse:** a doorway shadow-pass in a lit neighbouring room when it emerges, partial silhouettes at the edge of a torch beam, and the existing camera-frame glimpse.
- **Stage C, attack:** a clear dark hunched silhouette with long limbs, a lunge, blood, gouges in the wall, crew reactions and screams. The behaviour AI is unchanged.
- **Pacing:** the tutorial freezes the director. With the tutorial, the scripted beats land at about 6 min (first breach), 11 min (camera lost, then *unidentified motion*), up to 15 min (hatch, or sooner via infection) and about 21 min (cascade). This matches the requested 0–5 / 5–10 / 10–15 / 15–20 / 20–28 curve.

## 8. Deliberately NOT built

- Direct-control mode and the full away-team system. The ship-band radio only plants the hook.
- New simulation systems (suits as items, comms, carrying bodies). The pass stayed on presentation, as requested.
- Hand-drawn or AI-generated illustrations. Everything is still procedural geometry from one kit.
- Music. There is only the very quiet late-phase drone; silence is used on purpose.

## 9. Technical compromises

- **Audio was not judged by ear.** It was validated by measurement only. Levels are conservative, but the mix balance (klaxon vs ambience, breath audibility) needs a human pass.
- **Performance:** headless software rasterisation now measures about 40–45 ms per frame at 1920×1080 with 30 crew (V1 about 32 ms). The extra cost is the full-screen background upscale and more detailed sprites. The background is cached at half resolution and only redrawn when the camera moves. On a normal GPU browser this should be comfortably real-time, but it was not measured on real hardware.
- The tutorial suppresses the airlock door's auto-close during step 6, so the player performs the action the system would otherwise do.
- Crew still overlap each other (no local avoidance). Social pairs face each other but don't walk to meet.
- The organism shadow-pass reuses the creature silhouette at low alpha rather than a dedicated sprite.
- Late-watch "ship memory" depends on what actually happened. A quiet run stays clean.

## 10. Recommended V3

1. A human-playtested tutorial pass (time per step, where people hesitate) and an audio pass by ear.
2. **Away teams** into the dormant sections already visible in the background (Section 07, Deck 42), linked to the ship-band hooks.
3. Suits as physical items in the airlock, so vacuum work becomes logistics.
4. Crew local avoidance and carrying the wounded, so medics drag people to the med bay.
5. A ship-wide comms layer: crew radio chatter tied to state, which goes silent when people die.
6. A creature nesting behaviour in Cryo 6-C that feeds on sleepers, tying the threat to the visible berth count.
7. A short torch-lit direct-control vignette reusing the existing cone lighting.

## 11. Verification and honest evaluation

**Automated checks (all pass, no page errors):**
- `tools/systems.mjs`: the 13 V1 system assertions still pass: pressure doors, decompression through jammed doors, bulkheads containing it, life support, security blackout, breaker shedding, trapped crew, death and grief, hidden infection, duct movement, venting, power/lighting, fire spread.
- `tools/tutorialtest.mjs`: the whole tutorial completed with real mouse and keyboard input, with screenshots per step.
- `tools/uitest.mjs`: context menu, door menu, speed keys, decision modal, EVA and end screen.
- `tools/audit.mjs`: full 28-minute arcs. The competent bot finishes with 10–11 of 12 alive; total neglect loses everyone between about T+8 and T+23 (seeds 5/21/42/77). This is essentially unchanged from V1, so the presentation pass did not shift the balance.
- One real crash found and fixed during testing: a crew member finishing a ladder climb after their route had been invalidated.

**Does it feel closer to the goal?** By inspection of the screenshots, mostly yes:
- **Giant colony-ship management sim:** clearly closer. Zoomed out, the section reads as one lit compartment in an enormous dark structure, and the cryo stack makes 2,400 a visible quantity.
- **Barotrauma-like systemic dread:** improved through presentation rather than mechanics. Local red light, power-loss silence, light leaking under doors and crew flinching make failures readable without the log.
- **Alien-like industrial horror:** the strongest new moments are a helmet-lamp cone catching only the legs of something in a dead med bay, and a vent grille hanging open in a room you thought was clean.
- **Original look:** no neon or glass UI, no copied sprites or layouts; the palette is still disciplined.

**Weakest areas, where it is not there yet:**
- **Fire** still reads as stylised vector flames.
- **Crew** are good at 1× and charming up close, but their faces are minimal.
- **Unproven by real players:** the tutorial's clarity and the audio mix need real players and real ears before they can be called done.
