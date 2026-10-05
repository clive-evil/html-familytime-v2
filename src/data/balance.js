// All gameplay tunables live here so the headless simulation and the
// browser build share exactly the same numbers. Plain data only (Luau-friendly).

export const BALANCE = {
  dayLength: 170, // seconds of daylight (Day 2 onwards; Day 1 clock is frozen)
  nightLength: 7, // seconds of night (Grandmas walk to bed, eggs appear at dawn)
  worldHalf: 42, // playable area is [-worldHalf, worldHalf] on x and z

  start: { food: 0, wood: 0, stone: 0 },

  player: {
    walk: 6.2,
    sprint: 9.6,
    radius: 0.45,
    carryCap: 12,
    gatherCooldown: 0.26,
    buildRate: 1.4, // work units per second while holding interact
    interactRange: 2.4,
    depositRadius: 3.2, // auto-deposit when this close to a stockpile
  },

  grandma: {
    walk: 2.3,
    hatchlingWalk: 1.7,
    radius: 0.42,
    mealSize: 2, // food per meal
    mealsPerDay: 2, // => 4 food per Grandma per day
    hungerSeek: 0.55, // go looking for food at this hunger
    eatTime: 1.4,
    hungryWait: 5, // how long she waits at an empty table before giving up
    eatRetry: 14, // seconds before an unfed Grandma tries again
    starvingWorkMult: 0.5,
    stiffWorkMult: 0.75, // slept outside last night
    quirkChance: 0.05, // per completed task
    emergeTime: 2.6,
  },

  eggs: {
    layBase: 0.85, // expected eggs per adult Grandma per night
    starvingMult: 0.35,
    homelessMult: 0.5,
    basketCap: 4,
    rareBig: 0.015,
    rareTiny: 0.015,
    rareGolden: 0.005,
    haulerCarry: 3,
  },

  incubator: {
    manualDialTime: 1.3, // seconds of holding to turn the dial to NANA
    heatTime: 2.2,
    crackTime: 1.6,
  },

  jobs: {
    farmer: { resource: 'food', workTime: 4.5, yield: 3 },
    lumber: { resource: 'wood', workTime: 5, yield: 3 },
    miner: { resource: 'stone', workTime: 6, yield: 3 },
    builder: { buildRate: 0.8 },
    foreman: { interval: 3 },
  },

  nodes: {
    bush: { resource: 'food', charges: 5, regen: 7, radius: 0.75 },
    tree: { resource: 'wood', charges: 4, regen: 9, radius: 0.55 },
    rock: { resource: 'stone', charges: 4, regen: 11, radius: 0.85 },
  },
};

export const RESOURCES = ['food', 'wood', 'stone'];
