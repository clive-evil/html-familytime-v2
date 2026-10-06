# THE LONG WATCH — Prototype Report

**Build:** `dist/ColonyShipHorror.html` (single file, ~280 KB, no external assets, CDNs or fonts — runs from `file://`)
**Premise:** you are the watch officer of Section 6 of the colony ship *CSV Ardent Vow*. Twelve crew are awake; 2,400 colonists sleep in the cryo bay below them. It starts as a colony-management sim. Over ~28 minutes, failures interact, information disappears, something gets into the ducts, and somebody aboard is no longer who they were.

Screenshots: `docs/screenshots/` · Visual language (written before any code): `docs/VISUAL_LANGUAGE.md`

---

## 1. Controls

| Input | Action |
|---|---|
| **Left-click** crew / roster row | Select crew member (vitals, skills, traits, relationships, orders) |
| **Left-click** room | Select room (atmosphere, damage, power, doors, compartment controls) |
| **Left-click** door / hatch | Door menu: OPEN / CLOSE / LOCK / EMERGENCY SEAL (remote; needs power) |
| **Right-click** room (crew selected) | Location orders: move, repair, extinguish, seal breach, restore power, investigate, decontaminate, operate/restart reactor, man security, draw weapon, rest, treat |
| **Right-click** crew (crew selected) | Treat, escort to quarantine, observe |
| **Right-click** door (crew selected) | Crank open / haul shut / seal **by hand** (works without power, slowly) |
| Mouse wheel · Q / E | Zoom (toward cursor) |
| Left-drag · middle-drag · WASD / arrows | Pan |
| **Space** | Pause / resume (orders can be given while paused) |
| **1 / 2 / 3** | 1× / 2× / 4× |
| **Tab** / Shift-Tab | Cycle crew (and focus camera) |
| **F** | Focus selection · **0 / Home** fit ship |
| **H** | Operations manual · **M** mute · **Esc** close menus / deselect |
| Click an alert chip or a log line | Jump camera to that room |

Auto-pause (toggle in top bar) stops the clock on: hull breach, first breaker trip, organism sighting, unidentified motion, crew transformation, decisions.

### Debug / test URL parameters
`?seed=N` deterministic run · `?autostart=1` skip title · `?t=600` fast-forward N sim-seconds · `?crew=30` stress-test roster size. `window.__game` exposes state.

---

## 2. Systems implemented

### Ship
12 rooms on 3 decks (Airlock/EVA, Security/Armoury, Med Bay, Quarantine Lab, Bridge / Workshop, Quarters, Mess, Hydroponics / Reactor, O2 Processing, Cryo Bay 6-C), 9 bulkhead doors, 6 deck hatches with ladders, 1 outer airlock hatch. Deck slabs physically contain the **duct network** the organism travels through. The section is framed by an exterior hull, a truss spine running off-screen both ways and a parallax silhouette of the rest of the colony ship, so it reads as one module of something enormous.

### Atmosphere (per room)
Pressure (kPa), O2 fraction, temperature. Gas moves between rooms in proportion to door opening (doors partially open while crew walk through). Breaches and the dump valve vent to space. Life support repressurises/scrubs every **unsealed** room by drawing from a shared **O2 reserve** — so an unpatched breach with open vents silently drains the whole ship's reserve (alert: `O2 RESERVE DRAINING → room`). Fire consumes O2 and heats rooms. Crew breathe; blood-O2 drains below ~15% effective O2, then health. Engineers, technicians and security carry 45 s rebreathers.

### Power
Reactor output depends on reactor integrity, coolant, instability and whether an operator is at the console (−14% unmanned). Seven switchable buses (+ essential bus): LIFE, CRYO, MEDICAL, HYDROPONICS, HABITATION, SECURITY, SENSORS. Deficit drains the battery; at 0% breakers trip in a fixed shed order and **stay tripped** until the player re-energises them. Instability → SCRAM → needs a restart at the console (on-duty engineers will restart it slowly on their own initiative). Each bus has concrete consequences:

| Bus off | Consequence |
|---|---|
| LIFE | No O2 production, no repressurisation, rooms cool, ventilation sound stops |
| CRYO | Pods warm; after a thermal delay colonists begin dying |
| MEDICAL | Treatment −40%, scans/blood tests impossible |
| HYDROPONICS | Food production stops, water loop halves |
| HABITATION | Quarters/mess dark, rest and meals less effective, morale target −15 |
| SECURITY | **All cameras die, mag-locks release** (locked doors become plain doors — including quarantine) |
| SENSORS | No life signs, motion tracking, biomonitors or debris warning (meteors hit harder) |

### Doors
OPEN / CLOSED / LOCKED / SEALED, plus JAMMED. Remote commands need power on either side; otherwise crew must crank them by hand. **Powered** doors act as automatic pressure doors and fire doors — when power fails, that safety net fails with it. Emergency Seal clamps a room's doors *and vents*; Vent Atmosphere seals then dumps the room to space (kills fire, organisms — and anyone unsuited).

### Crew (12, named, with relationships)
Each has profession, 6 skills, 1–2 traits, a short biography, procedural portrait and sprite with a profession-specific silhouette (hard hat, helmet + rifle, coat, cap…). Tracked: health, blood O2, rebreather, stress, morale, fatigue, core temperature. Crew walk real paths through doors/ladders (Dijkstra over the room graph), run during alerts, sleep on a 3-watch schedule, eat at the mess, staff duty stations (which raises output), auto-treat the injured (medics), grab extinguishers for *small* fires, and flee immediate hazards. Relationships: siblings (Avery & Marcus Holt), spouses (Ines Harper & Tomas Brandt), friends and a rivalry. A death hits kin hard (stress spike, morale crash, grief that slows work and raises refusals). Stressed / cowardly / grieving / claustrophobic crew **refuse** dangerous orders with a line of dialogue; INSIST forces it at a stress/morale cost. Panic episodes, arguments and fights emerge from stress and traits.

### Information loss
A room is only visible with **power + an intact camera + the SECURITY bus** (and no heavy interference). Otherwise it is rendered as black static. You keep only: life-sign count and motion-tracker blips (if SENSORS are up — and the organism counts as a life sign), duct-movement pings, and whatever crew **helmet lamps** illuminate in a cone. Crew outside visual coverage lose vitals in the roster if sensors are down (`UNKNOWN`). Deaths you cannot see arrive as `BIOMONITOR FLATLINE`, or — with sensors off — just `has stopped responding on comms`.

### Threat
- **Contamination**: the first significant meteor seeds a hidden growth in the struck room. It grows from the vent outward, initially as a barely visible greasy residue; investigation reveals it, decontamination burns it out. At maturity it hatches into the duct network.
- **The organism**: lives in ducts (regenerates there), roams with a restless room-scoring AI (prefers lone or sleeping crew, dark/unobserved rooms, food when hungry; avoids groups, armed crew, fire, vacuum). Early ("stalking") it cuts the camera before entering, peeks, sabotages, feeds — then becomes a hunter. It flickers lights and electronics nearby, drags lone victims into the ducts (they become MISSING; the body turns up elsewhere), retreats when hurt, and is killed by sustained rifle fire, fire, or being sealed in a room and vented.
- **Hidden infection** (The Thing-style): sources are EVA salvage, contamination exposure, non-lethal attacks and contact with an advanced carrier. Stages are never shown in the UI. Clues: ration over-draw, fever readings, missed watches, carriers standing alone in dark rooms, others reporting odd behaviour, odd stains, evasive answers when QUESTIONED, observers' reports, "never arrived for the test". Tools: QUESTION, OBSERVE (assigns a watcher), MEDICAL SCAN (fast, weak), BLOOD TEST (quarantine lab, 2 supplies, better; imperfect early), QUARANTINE (escorted; door locks need the SECURITY bus). A late carrier transforms — preferably alone and unobserved. Quarantine lab research on samples unlocks better tests and, at 100%, non-human life-sign tagging.

### Event director
State-weighted, phase-biased selection of 17 event types — meteor strike (with radar warning and evasive burn if the bridge is crewed), electrical fire, coolant leak, O2 failure, reactor instability, medical emergency (including ordinary fevers that mimic infection), crew panic, door malfunction, camera failure, unknown noise, infection clue, intrusion, hydroponics blight, reclamation leak, argument, power surge, camera glimpse — plus a player **decision** (EVA salvage). A crisis budget throttles new events when several are active (less in early phases). Phases (Routine → Failure → Unknown → Horror → Cascade) only change probabilities; the only anchored beats are the tutorial-scale calm events, the first meteor, the salvage offer, the restrained **first fright** (`CAMERA FEED LOST`… `UNIDENTIFIED MOTION — life signs +1`… silence), and guarantees that an infection and the hatch eventually happen.

### Presentation
- Procedural, deterministic art kit: panels, seams, bolts, patch plates, conduits, cable sag, grilles, lockers, machinery, tanks, consoles; per-room props (reactor vessel and pumps, electrolysis stacks and air-handler fans, cryo pods with sleepers and a receding bay, hydroponic racks, bunks with personal photos, armoury, monitor wall, bridge windows).
- Lighting pass: per-room darkness with practical lamps cut out, amber/red rotating beacons and emergency strips, fire light, cold vacuum light, helmet-lamp cones, muzzle flashes, sparks. Dynamic: screens/monitor wall mirror real room state, fans spin down without power, reactor core glow follows output/instability, cryo pod lamps, plants wilt.
- Damage states: breach hole with torn plating and particles streaming out, fire with smoke, frost in vacuum, residue/growth near vents, blood and drag trails, sealing clamps on doors.
- Procedural WebAudio: engine drone tied to reactor output, ventilation bed that *stops* when life support dies, electrical hum with faults, metal groans and pipe knocks, door servos/slams, klaxon vs chime by alert level, decompression beeps and wind, fire crackle, radio static, duct scraping, distant screams, flatline tones, a low swell (not a jump scare) on first sighting. All positional (pan/attenuation from camera framing).

---

## 3. Major design decisions

1. **Management first, horror through systems.** No direct control, no scripted jump scares. Every frightening moment is a consequence of a sim variable (power, cameras, doors, sensors, pressure).
2. **Information as a resource.** Cameras need three things to work, so any power crisis is also a perception crisis. The organism counts as a life sign — the most effective scare in the build is a room reading `LIFE SIGNS 3` when you know two people are in it.
3. **Safety systems depend on power.** Pressure doors and fire doors close automatically *only while powered*. The calm early game teaches you the ship protects you; the cascade removes that protection.
4. **Red is earned.** Normal light is dim practical white. Amber appears for warnings, red floods only during real emergencies.
5. **Crew are people, not workers.** Names, biographies, kin, refusals with dialogue, grief, panic. A death is logged, mourned and changes behaviour.
6. **Uncertainty without randomness.** Infection is hidden but always leaves several kinds of clue; ordinary fevers and stressed crew produce false positives so the player has to weigh evidence.
7. **One kit, many rooms.** Coherence over quantity; all art is procedural from a single small vocabulary (see `docs/VISUAL_LANGUAGE.md`).
8. **Direct control was not built.** The management layer and atmosphere took priority; a WASD mode would have needed collision, interaction and camera work that would have diluted the core loop. Helmet-lamp cones provide most of the "seeing through their eyes" feeling within the management view.

---

## 4. Process & playtest evidence

Built in the requested passes (layout/style → crew movement → power/O2/atmosphere → crises → information loss → threat/infection → audio → polish), then tested with headless Chromium tooling in `tools/`:

- `tools/systems.mjs` — deterministic assertions for the audit questions (13/13 pass).
- `tools/audit.mjs [competent|passive] <seed>` — runs the full 28-minute arc with a scripted policy and prints resource snapshots plus the story log.
- `tools/uitest.mjs` — drives the real UI with mouse/keyboard (context menu, door menu, speed keys, decision modal, EVA, end screen).
- `tools/scene.mjs`, `tools/shot.mjs`, `tools/perf.mjs` — visual-state screenshots and performance.

Problems found by playtesting and fixed: stress spiralled into repeated panics (rebalanced sources, added panic catharsis/cooldown); event density in Phase 2 was overwhelming (longer intervals, crisis budget); camera-loss log spam (grouped); parts economy collapsed late (costs/fabrication rebalanced); a single unattended breach killed the whole crew in four minutes (added powered pressure doors and station upkeep); fire conflagrations killed firefighters (fire doors, heat cap, firefighting stand-off); the organism camped one room (restlessness scoring); the organism blacked out every camera it touched, so it was never seen (interference capped after the stalking phase); EVA could take the reactor operator (team selection + names on the button); residue/blood invisible in the dark (palette); full-screen post effects cost ~35 ms in software rendering (moved vignette/grain to composited CSS layers, added a 1× mip and viewport-clipped blits).

Multi-seed results (28-minute arc, seeds 5/21/42/77): the scripted **competent** policy finishes with 11 of 12 alive in every run (always losing the hidden carrier to transformation); **passive** (no orders, salvage declined) loses everyone between T+10 and T+25 through coolant/reactor failure, unpatched breaches draining the O2 reserve, and fires.

---

## 5. Final audit

| Question | Answer |
|---|---|
| Can crises cascade? | **Yes.** Logged chains, e.g. meteor → workshop fire → spreads through jammed door → reactor wiring burns → output 52 MW → breakers shed SECURITY/MEDICAL/LIFE → every camera dies → ship-wide hypoxia. |
| Hull breaches spread through open doors? | **Yes** — through any door that is open and not auto-closing (jammed, unpowered, overridden). Test: neighbouring room 101→82 kPa in 12 s. |
| Does shutting a bulkhead stop it? | **Yes.** Closed: breached room 21 kPa, neighbour stays at 101 kPa. |
| Does power loss affect connected systems? | **Yes** — see bus table; also door remote control, auto pressure/fire doors, lights, screens, fans, treatment and tests. |
| Do cameras meaningfully reduce information? | **Yes.** Unobserved rooms are black static; only life-sign counts, motion blips and helmet-lamp cones remain. |
| Can crew become trapped? | **Yes** (sealed/locked doors, jams, no-power doors). Shown as `TRAPPED — NO ROUTE`; crew can still crank unpowered doors. |
| Can crew die? | **Yes**: vacuum, asphyxiation, burns, heat, injuries, organism, transformation, being taken into the ducts. Permanent. |
| Do deaths affect others? | **Yes.** Kin: +~50 stress, −40 morale, 4 min grief (slower work, more refusals). Witnesses and friends also react. |
| Can infection remain hidden? | **Yes.** No UI element reveals it; test confirms the panel never mentions it at stage 2. |
| Are there discoverable clues? | **Yes**: food over-draw, fevers, missed watches, dark-room loitering, reports from paranoid/empathetic/kin crew, stains, observer reports, evasive answers, avoiding tests; scans/blood tests with honest error rates. |
| Can threats move through the ship? | **Yes** — duct network; test run visited 8 rooms. |
| Does lighting reflect power/emergency state? | **Yes** — dim practical, amber beacon, red pools, black with strips, fire light, cold vacuum, flicker on faults/brownout/organism proximity. |
| Can the player recover? | **Yes** — repairs, restarts, re-energising buses, sealing/venting, decontamination, research; the competent policy recovers from multiple simultaneous crises. |
| Can bad decisions spiral? | **Yes** — see passive runs and the cascade above. |
| Readable with several incidents at once? | **Mostly.** Alerts are prioritised and grouped (max 10 chips), room tags stack, log lines jump to rooms. In the worst Phase-5 cascades the log moves fast; auto-pause and pause-to-order are the intended answer. |
| Anything obviously AI-generated looking? | Avoided gradients-on-glass UI, neon, cyan/purple; the UI is flat 1px-rule panels with monospace stencil type. The weakest visual elements remain the stylised flame shapes and generic wall panelling repetition (see known issues). |
| Does the calm opening help? | **Yes.** ~2.5 min of small, legible problems (filter fouling, a cut hand, a jammed door) with inline hints, a functioning safety net, and no threat — so the later blackout of the same corridors reads as loss. |

---

## 6. Known issues / limitations

- Audio could not be listened to in this environment (headless); levels are set conservatively and all sounds are procedural. Expect to tune mix levels by ear.
- Performance was measured in software-rasterised headless Chromium (~30 ms/frame). Normal GPU browsers should be comfortably faster; `?crew=30` stays cheap in simulation (<0.1 ms/step).
- Flames are stylised vector tongues; wall panelling is repetitive at high zoom.
- Crew walk through each other (no local avoidance); multiple crew working the same spot overlap.
- Fire spread, combat and refusals use simple probability models; tuning is from scripted runs, not human playtests.
- The director's competent/passive balance is tuned with a bot that reacts every 2 s with perfect dispatch; human difficulty is likely higher in Phase 5.
- No save/load. One 28-minute arc; the ending summarises survivors, colonist losses, organisms, and a recap of the watch log.
- The title font is the system monospace stack (DejaVu Sans Mono / Consolas / Menlo); appearance varies slightly by OS.

---

## 7. Recommended next systems

1. **Human playtests** with telemetry on pause frequency, refusal rates and time-to-first-fright; tune Phase 5 density.
2. **EVA / suits as items** (limited suits in the airlock; suiting up as a task) — makes vacuum work a logistical decision.
3. **Ship-wide comms channel**: crew radio chatter tied to state (and going silent), as a further information layer.
4. **Second organism behaviour** (nesting in the cryo bay and feeding on sleepers) to link the threat to the colonist count.
5. **Local avoidance + carrying**: crew carrying downed crew to the med bay, organism dragging visibly.
6. **Direct-control moments** (explicitly deferred): a short torch-lit walk in one room using the existing cone lighting.
7. **Longer campaign**: watch rotations thawing new crew with fresh relationships, and the section's history carried between watches.
