# Visual Language — "Ardent Vow, Section 6"

Written before any code, from studying the four reference screenshots
(used for *why it works*, never for *what it looks like*).

## What the references are actually doing

| Observation | Why it creates dread | What we take (as a principle) |
|---|---|---|
| The vessel is a lit object floating in near-total black; the environment is only hinted at by faint edges. | The ship is the only safe thing and it is small against the void. | Space around the hull is almost pure black with sparse, dim stars. No nebula glamour. The hull's outer skin is lit only by its own spill. |
| Interiors are a dense *wall of function*: pipes, cabinets, valves, ladders, cables. Very little is decorative. | Machinery implies systems that can fail; density implies claustrophobia. | Every room is built from a small kit of functional parts (bulkhead panels, conduits, ducts, lockers, consoles, tanks, gratings). Each part *means* something (a pipe runs somewhere, a duct connects rooms). |
| Brightness is local. Each room has pools of light and large unlit regions; corners vanish. | The eye cannot verify corners. | A per-room darkness pass with holes cut by practical fixtures. Corners and floors fall to near-black. |
| Red appears only as small warning lamps and status lights in normal operation. | Red becomes meaningful when it floods. | Normal lighting is dim warm-white. Amber = warning. Red floods only in emergencies. |
| Characters are tiny but readable because of strong silhouettes against mid-grey walls, plus a single colour cue (helmet, suit). | Readability survives darkness. | Crew sprites are flat silhouettes with one profession cue (headgear shape + one muted colour band) and a rim highlight. |
| UI is functional, boxy, low-saturation; toggles and readouts look like equipment. | It feels like operating a machine, not a mobile game. | Flat dark panels, 1px rules, monospace stencil-like labels, physical-looking toggles. No glass, no glow, no rounded cards. |
| Floors and decks are thick, layered slabs full of ducts. | The ship has *inside walls*. Things can be in them. | Deck slabs are 34px deep and visibly contain ducting. The vent network is diegetic — the threat uses it. |

## Rules

1. **Palette.** Charcoal `#0d0e0f`, dirty grey `#3a3b39`, steel blue `#4a5761`, aged off-white `#c9c3b2`, faded industrial green `#5f6f55`, safety yellow `#b8962e` (sparingly), warning red `#a8281f` (emergency only). No cyan/purple.
2. **Light is state.** Normal: dim practical (`#d9cfb4`). Warning: amber beacon. Emergency: red pools. No power: black with thin emergency strips. Fire: moving orange. Vacuum: cold dark blue-grey, no warm light. Contamination: a slow olive/flesh tint near vents only, never cartoon slime.
3. **Darkness is information loss.** A room without a camera feed is drawn as static-dark. You only see what a crew member's torch sees.
4. **Wear.** Grime streaks run downwards from fixtures; floors are darker than walls; paint is chipped at edges; patches are rectangular plates with visible bolts.
5. **One kit, many rooms.** Twelve rooms share one parts vocabulary so the ship reads as engineered by one design bureau over 100 years.
6. **Detail density falls off with importance.** Background machinery is low-contrast silhouette; interactive things (doors, consoles, crew, hazards) carry the contrast.
7. **The threat is mostly absence.** Glimpses, damage, residue, silhouettes behind light. When finally seen: a tall, hunched, wet-dark biological shape with too-long limbs. No spikes, no glowing eyes, no tentacle bundles.
