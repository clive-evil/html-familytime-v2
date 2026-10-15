# DRIVE WITH DAVE

**You navigate. Dave drives.**

A prototype built on [NORMAL DRIVING](../NormalDriving-Web) (which is untouched). You sit in the
passenger seat. Dave has the keys. You tell him what to do; he decides how (and whether) to do
it, then operates the *same* simulated clutch, throttle, brake, steering wheel, gear lever,
handbrake and ignition a human uses in Normal Driving. Nothing moves the car except the
drivetrain simulation.

The question this prototype exists to answer: **is it fun to instruct an imperfect driver?**

---

## Play

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # → dist/index.html (single self-contained file; double-click it, works offline)
npm test         # 48 node tests (29 inherited physics/route + 19 Dave)
npm run smoke    # 37 headless-browser checks against dist/ (needs Chromium; set CHROME_PATH if not found)
```

Title screen: **CHOOSE DAVE**, pick **BUTTONS** or **VOICE + BUTTONS**, **START DRIVE**.
Esc returns to the menu. **TEST RESULTS** shows every run recorded in this browser.

### Commands

| Command | Button / key | Controller | What it means to Dave |
|---|---|---|---|
| LEFT | A / ← | D-pad ← | *Take the next valid left* (remembered for a while — see Memory) |
| RIGHT | D / → | D-pad → | *Take the next valid right* |
| STRAIGHT | X / ↑ | D-pad ↑ | Carry on / don't turn here |
| GO | W (when stopped) | A | Proceed when he thinks it's OK (or when you insist) |
| FASTER | E, or W while moving | Y | Raise his target speed |
| SLOWER | S (while moving) | X | Lower his target speed |
| STOP | Q / ↓, or S when slow | B | Controlled stop, then wait for GO |
| BRAKE! | Space | RB | Emergency stop (harshness depends on his panic) |
| WAIT | Z | LB | Hold here |
| CAREFUL | C | R3 | Biased to caution for ~20 s (and it calms him a bit) |
| GO FOR IT | F | — | Biased to boldness for ~12 s |
| REVERSE | R | LT | Back up a few metres |
| PARK | P | RT | Park here: parallel parks in the gap, or takes a drive |
| TURN AROUND | T | D-pad ↓ | Find a clear stretch and do a three-point turn |
| PULL OVER | O | — | Pull in to the kerb and stop |

Repeating a command quickly (*LEFT! LEFT! LEFT!*) raises **urgency**. Urgency makes Dave react
faster, but it also raises his **stress**, and stress × his **Panic** trait degrades his driving:
over-correcting steering, rushing the clutch, dropping the handbrake early, selecting gears
before the clutch is down. Shouting makes it worse. If he maxes out, he stops for a minute.

Other controls: **mouse-drag** to look around, **Tab** (hold) to look at Dave, **V** camera
(passenger / third-person chase), **M** toggle the microphone (voice mode), **F1** lab.

### Voice (optional)

Uses the browser's own speech recognition (Web Speech API, Chrome/Edge). No cloud service is
added by this game; note that Chrome's built-in recognition itself runs through Google's servers. If the
browser has no recognition, the menu says **VOICE NOT AVAILABLE IN THIS BROWSER** and buttons
carry on working. The vocabulary is deliberately small (`src/dave/commands.js`): "left", "turn
left", "take a left", "Dave, slow down", "speed up", "straight on", "stop", "brake", "park here",
"turn around", "hang on", "careful"… Each utterance is shown as **DAVE HEARD: LEFT "turn left"**.
If nothing recognisable was heard, or the browser reports low confidence, Dave says **"What?"**
— he never guesses. Mistakes after that are Dave's, not the recogniser's.

---

## The Daves

| | Driving | Reaction | Confidence | Panic | Attention | Obedience | Memory |
|---|---|---|---|---|---|---|---|
| **Learner** (default) | 36 | 52 | 50 | 60 | 52 | 82 | 55 |
| **Nervous** | 55 | 50 | 18 | 86 | 80 | 88 | 62 |
| **Cocky** | 70 | 74 | 92 | 25 | 48 | 32 | 45 |
| **Old Hand** (control) | 90 | 62 | 66 | 15 | 88 | 72 | 80 |

What each trait actually drives (no `if (random < x) crash` anywhere):

* **Driving (skill)** — hand lag on the wheel, slight under-steer and a slow weave, how far he
  looks ahead, how well he holds revs on a pull-away, how fast he lets the clutch through the
  bite, when he dips the clutch while slowing (late → stalls in 2nd), how precisely he judges
  the parallel-park swing.
* **Reaction** — delay between hearing a command (or noticing a hazard) and acting on it.
* **Confidence** — cruising speed, how hard he takes bends, braking point, the gap he'll accept
  at the give-way, hesitation at junctions, whether he rolls through a junction he knows.
* **Panic** — how much stress and shouting hurt him (steering gain ↑ → over-correction, rushed
  clutch, handbrake dropped early, gear selected before the clutch is down → real grinds).
  Timid Daves under-rev when panicked, confident ones over-rev.
* **Attention** — how far ahead he notices lights, junctions and the oncoming car; also his
  judgement when deciding whether an instruction is dangerous.
* **Obedience** — whether he does something he thinks is dangerous because you told him to.
  Cocky: "It's red, genius." Learner, shouted at: "Fine!" (and then maybe stalls on the hill).
* **Memory** — how long "left" stays in his head before "Hang on, which way was it?"

Dave also has basic self-preservation: he follows his lane, slows for bends, stops for red,
stops short of parked cars and walls, backs off if he noses into something, and stops at
junctions to be told which way. He does **not** know where Nan lives.

---

## How Dave's brain works (`src/dave/`)

```
commands.js   canonical commands + phrase parser (voice)
brain.js      Dave: intake → perception → intention → personality → decisions → low-level control
nav.js        lanes Dave can drive, built from the existing World (junction arcs, obstacle-avoiding lanes)
lines.js      authored dialogue, keyed by event and personality, cycled (no RNG)
profiles.js   the four Daves + lab tuning defaults
outcome.js    major-failure rules and Dave's verdict
telemetry.js  local-only run records (localStorage)
voice.js      optional Web Speech wrapper
settings.js   the Driver configuration Dave uses (analogue wheel, pedals, normal gear lever)
```

1. **Intake** — every command is timestamped; repeats within 2.5 s raise urgency; urgency adds
   stress. The command takes effect after Dave's reaction delay.
2. **Perception** — free road ahead along his lane (swept car box vs. the same colliders the
   physics uses), red light, oncoming car, junction line, dead end. Things are only "seen" inside
   his notice distance and after his reaction time.
3. **Intention** — turn intent with memory expiry, speed factor (decays back), careful/go-for-it
   timers, holds (STOP/WAIT/BRAKE/meltdown), manoeuvre modes (reverse, three-point turn,
   parallel park, driveway).
4. **Decisions** — target speed (cruise × factors, limited by bends, stop lines, obstacles),
   path (lane, junction arcs), whether to obey, when to ask, who to blame.
5. **Low-level control** — adapted from Normal Driving's route bot: pure-pursuit steering through
   his hands; launch / drive / coast / re-engage clutch states; gear selection; handbrake
   management; stall recovery drill. Output is the same *intents* structure a keyboard produces,
   fed into the unchanged `Driver` → `CarSim`. A test asserts `brain.js` never writes car state.

## What was reused from Normal Driving

Everything physical: `sim/car.js` (engine, clutch, gearbox, tyres, collisions), `sim/driver.js`
(the control layer Dave operates), the town and route (`world/`), traffic, audio, renderer,
cameras, mirrors, the lab panel, and the original 29 tests (still passing). Changes to copied
files are small: the route has passenger-seat objective text and lets Dave's own commentary
replace the narrator's incident messages; the camera can sit in the passenger seat; the input
layer can skip pointer-lock; Dave's ground mesh is 0.62 m instead of 0.5 m (≈ 280k → 216k
triangles per frame).

**DIRECT mode** (lab → CONTROL MODE) is the original Normal Driving control scheme, kept for
regression and comparison. It is not the game.

## Lab (F1)

Everything from Normal Driving, plus a **DAVE** section: control mode, passenger-knows-best hints,
Dave's voice (mumble / browser speech / subtitles only), presets (LEARNER, NERVOUS, COCKY,
COMPETENT), live sliders for all seven traits, and tuning for command urgency, stress build-up,
stress recovery, voice confidence threshold, driving aggression and safety override. Live
readouts show his mode, intent, stress, urgency, panic effect, target speed, free road ahead,
reaction delay, notice distance and memory.

## Telemetry (local only)

Each finished run stores: profile, input mode, outcome, duration, commands, commands/min,
repeats, shouty commands, average urgency, average/max stress, wrong turns, junctions taken
correctly, stalls, kerbs, collisions, near misses, parking attempts and quality, refusals,
voice/button/key/pad command counts, average command→action delay, restarts.
**TEST RESULTS** on the title screen shows them (with copy-as-JSON and clear).
