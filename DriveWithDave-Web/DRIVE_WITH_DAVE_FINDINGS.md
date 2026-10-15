# Drive With Dave — prototype findings

**Status: automated/simulated assessment only. No human has played this yet.**
Nothing below claims anything is fun; it describes what the systems demonstrably do, what
that predicts, and what only human playtesting can answer.

## What was measured (scripted passengers, `tests/daveHarness.js`)

Three scripted passenger styles drove the full route with each Dave:

| Passenger | Learner | Nervous | Cocky | Old Hand |
|---|---|---|---|---|
| **Calm** (says the right thing in good time) | arrives, 163 s, 2 kerbs, needs a second go at parking | arrives, 166 s, clean | arrives, 110 s, clean | arrives, 126 s, clean |
| **Shouty** (repeats every command ×3, spams GO when stopped) | arrives, 153 s, 3 kerbs, 1 refusal | arrives, 224 s, **4 stalls, 4 rollbacks**, 1 collision, meltdown | arrives, 110 s, 4 refusals | arrives, 123 s, 4 refusals |
| **Silent** (only says GO) | waits at the first junction asking "Left or right?" | same | **guesses right**, drives to a dead end, "You didn't say!" | waits and asks |

Targeted tests show the intended causal links:

* Shouting GO at Nervous Dave on the 1-in-6 hill → stall and ~7 m rollback; the same instruction
  said once → clean hill start. Dave then says "You were shouting at me." (blame chosen from the
  recorded cause).
* Low skill → 4–20× the lane error of high skill, and genuine stalls/rollbacks on the hill, while
  still mostly staying on the road.
* Cocky refuses GO on red however much you shout; Learner gives in ("Fine!") and may then fluff
  the hill start.
* Commands given too early are forgotten (memory), too late arrive after he has committed
  ("You left that a bit late").

## What works (mechanically)

* **Dave really drives the car.** Every outcome comes out of the Normal Driving drivetrain:
  stalls, rollbacks, grinds, kerbs, contact. A unit test guards that his code never writes car state.
* **Commands are semantic, not remote control.** LEFT means "the next left"; Dave stops at the
  junction, hesitates according to confidence, and takes it. Nobody has to steer him.
* **Personalities are distinct in traces.** Cocky reaches the lights ~35% sooner with a much
  higher top speed; Nervous hesitates out loud and stops early; Old Hand is boring (as intended).
* **Pressure is systemic.** Urgency → stress → panic → worse inputs → incidents → more stress.
  The meltdown cap stops it becoming an unwinnable loop.
* **Information asymmetry exists by default.** The objective line tells *you* where Nan lives;
  Dave only knows roads. With hints off, nobody knows.

## What doesn't (yet) / risks

1. **A good passenger makes it easy.** Calm, well-timed instructions get every Dave home with
   few incidents. The comedy currently depends on the player panicking, being late, or giving
   bad instructions. That may be exactly right (the player is the cause) — or the calm run may
   be dull. This is the biggest open question and needs humans.
2. **The route has few genuine decisions.** Two junctions, two parking moments, lights and a
   give-way. Most of the drive is "watch Dave drive up a hill". Between decisions there may not
   be enough for the player to do.
3. **Dave's dialogue is thin.** About 60 authored situations, 1–5 lines each. It cycles rather than
   repeats, but a 15-minute session will hear repeats.
4. **Parallel parking is solo.** PARK triggers a whole manoeuvre; there's no "coach parking"
   mode with fine instructions yet, which is where shouting LEFT/RIGHT/STOP would be funniest.
5. **No cross traffic.** The junctions have no traffic, so "GO" at a junction is never dangerous;
   attention/obedience matter mostly at the red light and the give-way.
6. **Visual readability of Dave's errors.** In passenger view a 0.3 m weave or a late clutch is
   subtle. Sound (engine note, stall, grind) carries much of it. Untested whether players notice.
7. **Performance unknown on real hardware.** Measured only in a software renderer (~1–2 fps there).
   About 216k triangles and ~49 draw calls per frame, plus mirror passes.

## Does Dave feel like a person?

Automated tests can't answer that. What exists: a visible body whose hands are on the actual
wheel and who reaches for the gear lever, a head that turns to you when he talks and looks over
his shoulder to reverse, reaction delay, acknowledgements, refusals, assumptions, forgetting,
blaming, and a meltdown. The design intent is that after a few minutes you can predict him.
**Needs human playtesting.**

## Are commands too granular?

They are intention-level by design (LEFT = next left, PARK = do the whole park). The risk is the
opposite: too *coarse*, leaving the player little to do between decision points. Watch for players
spamming FASTER/SLOWER just to have something to press.

## Which Dave is best?

Prediction: **Learner** for first play (makes mistakes when pressured, obeys, asks), **Cocky** for
replays (refuses, assumes, blames you, drives fast), Nervous for streamers (meltdowns, panic
lines). Old Hand is the control group; if players enjoy him, the fun is in navigating, not in Dave.

## Is voice worth pursuing?

Implemented, optional, and honest (shows what it heard, says "What?" instead of guessing). It
could not be tested with a microphone here. The mechanic suits voice unusually well: shouting
at Dave *is* the fantasy, and repetition-driven urgency maps naturally onto shouting. Risks:
recognition latency (~0.5–1 s in Chrome) stacks on Dave's reaction time, and Chrome's
recognition is a Google network service. Recommendation: playtest buttons first; try voice with
3–5 people; keep it only if it feels better *and* latency isn't blamed on Dave.

## Could it sustain a Steam game?

Plausibly as a short, replayable comedy game (party/streamer appeal) **if** human tests show
that instructing Dave is funny on its own. It needs more decision-dense routes (cross traffic,
roundabouts, car parks, motorway merges), many more Dave lines, coach-mode manoeuvres, and
scenario variety. A long campaign is not indicated by anything here.

## Would multiplayer help?

Very likely. "One player knows, another has agency" is stronger between two humans, and Dave's
systems could also drive the car when the human driver drops out. See `DRIVE_WITH_DAVE_FUTURE.md`.

## What to test with people (10–15 minutes each)

1. First 30 seconds: do they understand they aren't driving?
2. Do they predict Dave by the end ("he'll stall if I shout")?
3. Learner vs Cocky vs Old Hand: which do they replay?
4. Buttons vs voice: which do they choose, and why?
5. Count laughs. Note *what caused them*: Dave's line, a mechanical failure, or their own mistake.
6. Do spectators engage (backseat-backseat driving)?
7. Where do they get bored (probably the long straights)?
