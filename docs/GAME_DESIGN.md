# Game Design: Too Many Grandmas (prototype)

## Fantasy
You inherit a cottage and one squishy Grandma. She lays eggs. The eggs hatch into more Grandmas. Nobody explains this. Within half an hour the quiet garden is a heaving, tea-drinking, turnip-hauling colony.

## Core loop
```
gather (food/wood/stone) ─▶ feed + house ─▶ eggs appear at dawn ─▶ hatch? ─▶ more Grandmas
       ▲                                                                       │
       └──── assign Grandmas to jobs ◀── hatchlings grow up overnight ◀────────┘
```
Every hatched Grandma is both a **cost** (4 food a day and a bed) and an **asset** (a worker from tomorrow, plus more eggs).

## Day cycle
| Phase | What happens |
|---|---|
| **Day 1** | Untimed tutorial. Feed Grandma, gather wood, build a bed, sleep. |
| **Day (150 s)** | Gather, build, assign, incubate. A clock bar shows the remaining daylight. |
| **Night (7 s)** | Grandmas hurry to their beds. The rest sleep on the lawn. |
| **Dawn** | Eggs are laid, hatchlings become adults, and a morning summary card appears. The game autosaves. |

The player can sleep early (hold E at the cottage door) to skip the rest of the day.

## Grandma Eggs (the unique system)
- **Laying.** At dawn each *adult* Grandma contributes 0.85 expected eggs. A Grandma who went hungry that day contributes ×0.35. One who slept outside contributes ×0.5. The fractional remainder is resolved with the seeded RNG. Day 1 always gives 1 egg and Day 2 gives at least 2.
- **Storage.** Eggs go into the Egg Basket (6) and Egg Crates (+8 each). Overflow eggs "roll away" and are lost. The morning card reports this, which pushes the player either to hatch eggs or to build crates.
- **Unhatched eggs** cost nothing: no food, no bed, no work.
- **Hatched Grandmas** eat, need a bed, can't work until they have slept one night (hatchlings), and lay eggs once they are adults.
- **The decision:** *"I need workers, but can I feed and house them?"* Eggs wait for free, but storage is capped.

### Incubation progression (manual → assisted → automated)
1. **Gran-ulator** (starting machine, manual, 1 egg). The ritual: carry the egg over, put it in, close the lid, **hold E to turn the dial** (WARM → TOASTY → NANA), then stand back. The machine rattles and steams, the egg wobbles and cracks, and a Grandma squeezes out. Her bun pops into place, her glasses drop on, she waves and waddles off.
2. **Double Gran-ulator** (6 Grandmas): automatic, 2 eggs, 16 s each.
3. **Gran-ulator Deluxe** (20 Grandmas): automatic, 6 eggs, 12 s each.

Auto machines have an **Auto-hatch ON/OFF** switch (E). While it is ON, **Builders** haul eggs from storage to the machine, up to three at a time balanced on their heads. While it is OFF, eggs wait. The switch is how the player rations growth.

## Needs (deliberately only two)
- **Hunger.** Each Grandma eats two meals a day, 2 food each. Hungry Grandmas walk to the nearest table with the shortest queue, so the queues are visible. If there is no food they stand sadly with a "no plate" icon, then go back to work at **half speed**, laying fewer eggs. They retry as soon as food arrives. Nobody dies.
- **Beds.** Beds are assigned at night, oldest Grandma first. The unbedded sleep shivering on the lawn, work at **75% speed** the next day, and lay half as many eggs.

## Workers
| Role | Workplace | Output |
|---|---|---|
| Farmer | Farm Plot (2), Big Farm (5) | 3 food every ~4.5 s of work, carried to the nearest stockpile |
| Lumber Grandma | Lumber Camp (3) | 3 wood every ~5 s |
| Miner Grandma | Stone Quarry (3) | 3 stone every ~6 s |
| Builder | Builder's Hut (3) | builds construction sites, hauls eggs to auto incubators |
| Foreman | Foreman's Bell (1) | every 3 s, rings the bell and assigns up to 2 idle adults to the neediest workplace (farms first when food is behind) |

**Assignment is one button.** Walk up to a workplace and press E: the nearest idle adult is assigned and walks over. Press Q to send one home. This is controller- and touch-friendly by design.

All work is **visible**. Workers walk to their work spot, play a working animation, carry the produce (turnips, logs, rocks) to the nearest stockpile or the cottage stores, then walk back. Building more stockpiles near workplaces shortens the walk, which is a small logistics lever.

### Personality (charm, not bad pathfinding)
After a task each worker has a 5% chance of a quirk: tea break, nap, setting off confidently in the wrong direction and then stopping ("?"), fussing over another Grandma, or joining a dinner queue for no reason. Occasionally one carries a comically big turnip (+1 yield).

### Variation and rares
There is one rig, varied by 6 cardigans × 3 buns × 3 glasses shapes × 4 frame colours × 4 skin tones × 3 shawls × 4 slippers, plus ±8% size. Rare cosmetic hatches are Big (1.5%), Tiny (1.5%) and Golden (0.5%), and they behave identically.

## Building
B opens the build bar. The ghost snaps to the grid in front of the player. Green means valid and red means invalid (the reason is shown). Cost is paid on placement, and the site is then built by **holding E** or by Builders.

| Building | Cost | Unlocks at |
|---|---|---|
| Bed (1 bed) | 6 wood | start |
| Farm Plot | 8 wood | 2 Grandmas |
| Stockpile, Lumber Camp, Stone Quarry | 6 / 10 / 14 wood | 3 |
| Granny Flat (6 beds), Feeding Table (4 seats), Egg Crate | 18w+8s / 10w+4s / 8w | 4 |
| Builder's Hut, Double Gran-ulator | 15w+6s / 20w+16s | 6 |
| Bunk Barn (16 beds), Foreman's Bell | 40w+28s / 20w+15s | 12 |
| Big Farm | 24w+10s | 16 |
| Gran-ulator Deluxe | 40w+60s | 20 |

## Progression and escalation
Unlocks are tied to the highest population reached, so growth is the progression. The measured curve for the balanced bot (median of 4 seeds):

| Day | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Grandmas | 2 | 4 | 6 | 10 | 15 | 21 | 34 | 52 | 81 | 107 | ~120 |

That is roughly 30 minutes to reach 100 Grandmas. A human will be slower early on (Day 1 takes a few minutes) and may be faster later.

## Failure is soft
No Grandma ever dies. Neglect shows up as visible misery (sad icons, queues, shivering lawn sleepers), lower productivity and fewer eggs. The `lazy` sim policy (never more than 2 farmers) shows hunger arriving around Day 9 while the colony survives.

## Tutorial (14 steps, auto-skips anything already done)
Berries → bring them home → 6 wood → place a bed → build it → sleep → egg → Gran-ulator → lid → dial → stand back → farm plot → build it → assign Grandma. After that the objective card switches to **Meanwhile** hints drawn from the most pressing problem: food, beds, full egg storage, idle Grandmas, waiting eggs, or the next unlock.

## Prototype limits (intentional)
There is no demolition or moving of buildings, no roads, no seasons, no cooking chain, and no multiplayer. Three resources only. The world is a fixed 84 × 84 garden with scattered regrowing nodes. There is no monetisation, quests or meta-progression.
