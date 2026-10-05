# NORMAL DRIVING

A mechanic-testing prototype: driving an ordinary, slightly tired manual hatchback
up an ordinary British hill to park outside your nan's house — where operating the
clutch, the steering wheel and the gear lever is the whole game.

> The car behaves consistently. The player is bad at operating it.

There is no randomness anywhere in the simulation (no random stalls, missed gears,
steering noise, input lag or "assists" you didn't switch on). Every stall, rollback and
grind is a deterministic result of the inputs.

---

## Install / run

Requires Node 18+ (tested on Node 22).

```bash
# Windows: put this folder at C:\AI-Prototypes\NormalDriving-Web, then in that folder:
npm install
npm run dev        # → http://localhost:5173
npm run build      # → dist/index.html  (single self-contained file)
npm run preview    # serve the built version → http://localhost:4173
npm test           # physics + route unit tests (node, no browser)
npm run smoke      # headless-browser smoke test of dist/ (needs Chromium, see below)
```

**Standalone build:** `npm run build` produces `dist/index.html` with all code, CSS and
three.js inlined (~0.6 MB). Double-click it — it runs from `file://` with no server and
makes no network requests. Sounds are synthesised at runtime; there are no asset files.

Click the title screen (or press Enter / controller A) to sit in the car. Clicking the
view captures the mouse for looking around; Esc releases it.

---

## Controls

### Keyboard (layout A, default — layout B selectable in the lab)

| Key | Action |
|---|---|
| **W** | Accelerator (ramps up while held, falls when released — tap to feather) |
| **S** | Brake (ramped) |
| **A / D** | Steering wheel (behaviour depends on steering mode) |
| **Space** | Clutch — hold to press the pedal down, release and it rises at *clutch return speed*. Tap it to hover at the bite. |
| **Shift** | Handbrake (toggle — a ratchet, like the real lever; "hold" mode in the lab) |
| **I** | Ignition — **hold** to crank; press while running to switch off |
| **1–5, R, N (or 0)** | Select gear directly (button gearbox) |
| **Q / E** | Gear down / up (button gearbox) |
| **Arrow keys** | Move the gear lever through the H gate (H-pattern gearbox) |
| **Mouse** | Look (head). Drifts back to the road after a few idle seconds |
| **Left-drag** | Grab and turn the wheel (hand-over-hand mode) — each grab has limited travel, let go and re-grab |
| **Right-drag** | Hold the gear lever and move it (H-pattern) |
| **Mouse wheel** | Clutch pedal position (when *Keyboard clutch = Mouse wheel*) |
| **Z / X** | Glance left / right (hold) |
| **H** | Horn · **C** camera · **F1** or **`** lab panel |

Layout B: arrows drive (↑ throttle, ↓ brake, ←/→ steer), Z clutch, X handbrake,
Enter ignition, A/S gear −/+, IJKL gear lever, Q/W glance.

### Controller (standard mapping, e.g. Xbox / PlayStation in Chrome/Edge)

| Input | Action |
|---|---|
| **RT** | Accelerator (analogue) |
| **LT** | Clutch (analogue — the best way to feel the bite) |
| **LB** | Brake (digital, ramped) |
| **RB** | Handbrake (toggle) |
| **Left stick** | Steering. In hand-over-hand mode: push to the rim and **rotate the stick in circles** to wind the wheel |
| **Right stick** | Look (absolute: where you point it is where your head points) |
| **A** | Ignition — hold to crank / press to switch off |
| **Y / X** | Gear up / down (button gearbox) |
| **R3** (click) or **hold D-pad ←** | Hand on the gear lever (H-pattern): right stick then moves the lever. R3 hands back automatically after ~1.6 s idle |
| **B** | Horn · **Back / D-pad ↑** camera · **Start** lab panel |

---

## How to drive it (the drill)

1. Clutch fully down → neutral → hold ignition until it catches.
2. Clutch down → first gear.
3. A bit of throttle (≈1,500–2,000 rpm on the flat, more on the hill).
4. Bring the clutch up **slowly** — you'll hear the revs dip and the engine note get lumpy as it bites.
5. Handbrake off once it's biting (on the hill: it's holding you; let go and it rolls back).
6. Keep slipping the clutch until the car is actually moving, then all the way up.

If you stall: the car does not reset. In gear with the clutch up, a stalled engine holds the car on a hill — press
the clutch to restart and it starts rolling backwards. That's the point.

---

## The route (~2.5–3 minutes driven cleanly)

Car park → **STOP AT THE LINE** → **STOP AT THE JUNCTION** → **TURN LEFT** → Mill Road
(one parked car on your side) → bend → **the hill (16% by default)** → **WAIT AT THE LIGHTS**
(roadworks, red until you've stopped at the line: first hill start) → S-bend →
**GIVE WAY TO ONCOMING TRAFFIC** (parked cars in your lane; a car comes down: second hill start) →
**STOP AT THE JUNCTION** (tight top T) → **TURN RIGHT** → **PARALLEL PARK** (6.8 m gap, a man waiting) →
**PARK OUTSIDE NAN'S HOUSE** (yellow door, narrow drive) → handbrake on, engine off → **YOU ARRIVED.**

Stats at the end: time, stalls, rollbacks, gear grinds, kerb hits, collisions, clutch overheats,
parking attempts. Nothing resets you after a mistake; there are no checkpoints. If you get
genuinely wedged, the lab has reset buttons.

---

## DEBUG / LAB panel (F1, `, or controller Start)

* **Presets** (one click):
  * **A — Clutch only:** manual clutch, standard analogue steering (still finite wheel speed), button gears, normal self-centring.
  * **B — Clutch + physical steering** *(default)*: manual clutch, slow multi-turn wheel (3 turns lock-to-lock, 400°/s at full input, no snap-back), button gears.
  * **C — Full awkward:** manual clutch, hand-over-hand/gesture steering (3.2 turns), H-pattern gearbox, slightly narrower bite.
  * **D — Accessible:** auto clutch, auto restart, steering return assist, faster steering (700°/s, 2.6 turns), easy clutch.
* **Actions:** RESET CAR (stop where you are / last clear spot), RESET TO BOTTOM OF HILL (engine running, handbrake on), RESET ROUTE, TELEPORT TO PARKING TEST.
* **Setup:** camera (first / third-person chase), steering mode, self-centring (none/weak/normal), clutch difficulty (easy/normal/brutal), gearbox (button/H-pattern), traffic pressure (off/light), look requirement, handbrake toggle/hold, keyboard layout A/B, keyboard clutch (ramp / mouse-wheel position), pedestrian, HUD readout, gate diagram.
* **Tuning sliders:** steering speed, steering lock (turns), clutch bite point, clutch bite width, clutch return speed, clutch press speed, stall sensitivity, engine torque, hill steepness (rebuilds the town on release), handbrake strength, keyboard pedal ramp, mouse sensitivity.
* **Assists:** auto restart, auto clutch, auto gear, steering return (all off by default except in preset D).
* **Live diagnostics:** speed, gear, rpm, clutch pedal %, clutch engagement %, clutch torque, throttle %, brake %, handbrake, steering-wheel angle, road-wheel angle, slope %, engine state, clutch temp, wheelspin, axle loads, look yaw, input device, fps.

Settings persist in `localStorage`.

**Traffic pressure LIGHT:** a car follows you up the hill (keeps its distance, never pushes),
and another queues behind you while you parallel park. If you sit still for no reason it
beeps — once, then a longer one later, three at most. Roll back towards it and you'll get
one short toot. Waiting at a red light or for oncoming traffic is legitimate and never beeped.

**Look requirement:** at the two junctions, if you didn't turn your head right (and left)
while stopped, you get "YOU DIDN'T LOOK." No penalty.

---

## Mechanics in brief

* **Engine:** idle 850 rpm, torque curve 44 Nm @ 600 → 86 Nm @ 3,600, rev limiter 6,200. A weak idle
  governor (≈30 Nm max on Normal) means zero-throttle clutch starts only work if you're very
  patient on the flat, and never on the hill. Throttle is progressive (small openings matter more at low rpm).
  Stall below ~400 rpm (stall sensitivity / clutch difficulty move this). Starter cranks at ~250 rpm and
  needs ~0.45 s to catch; bump starts need ~700 rpm.
* **Clutch:** continuous 0–100% pedal. Capacity follows a smooth curve centred on the bite point
  (default 55% pedal, ±10%). Easy/Normal/Brutal = bite width 34/20/11%, idle torque 44/30/18 Nm, stall
  rpm 320/400/520. Slip generates heat (≈1.8 kJ/°C); "CLUTCH HOT" at 220 °C, fade (up to −45% capacity) above 280 °C.
* **Gearbox:** R, 1–5 (3.45/1.95/1.36/1.03/0.82, final 4.1). A gear goes in if the clutch is ≥ ~95%
  disengaged, or if engine and gearbox speeds already match (rev-matched clutchless shifts work).
  Otherwise: grind, and you stay in neutral. Reverse has no synchro: moving forwards → grind.
  H gate: levers move freely across the neutral plane and only enter a column when lined up with it;
  a lazy diagonal from neutral goes into 3rd/4th (that's where the lever rests), every time.
* **Steering:** wheel angle → road-wheel angle (33° at full lock). Self-centring is caster-like
  (proportional to speed, only when your hands are off).
* **Chassis:** front-wheel drive, 930 kg, 58/42 weight split with dynamic load transfer (so hard
  launches uphill spin the front wheels). Brakes 70/30, handbrake on the rears. Kerbs are 12 cm and
  physically resist being climbed.

---

## Project layout

```
src/
  main.js              boot, loop, HUD
  sim/                 no three.js — testable in node
    params.js          constants, presets, torque curve
    car.js             engine/clutch/gearbox/tyres/body solver, collisions, events
    driver.js          pedals, steering wheel modes, handbrake, button + H-pattern gearbox, assists
    collision.js       OBB/circle contact
    math.js
  world/
    layout.js          road SDF + kerbs, hill profile, colliders, parked cars, houses, AI lanes
    route.js           objectives, dry commentary, stats
    traffic.js         follower / queue / oncoming AI, lights, pedestrian
  input/input.js       keyboard, mouse, gamepad → device-agnostic intents (touch can slot in here)
  render/              three.js town, car + interior, mirrors, instrument cluster
  audio/audio.js       WebAudio synthesis (engine, starter, stall, grind, tyres, horn…)
  ui/                  lab panel, styles
tests/
  sim.test.js          27 physics/controls tests
  route.test.js        a bot drives the full route with a manual clutch (with and without traffic)
  smoke.mjs            headless Chromium: real keyboard events + simulated controller
```

`window.ND` exposes the live objects in the browser console for poking at.

`npm run smoke` uses `playwright-core` and a local Chromium; set `CHROME_PATH` to your Chrome/Edge
executable if it isn't found.
