// Building definitions. Pure data, consumed by BuildingSystem (simulation)
// and by the renderer (which looks up visuals by `type`).
//
// size: footprint in grid cells [w, d] (1 cell = 1 world unit) at rot 0
// solid: blocks movement (rect collider = footprint shrunk by `solidInset`)
// spots: local work / eat / bed positions [x, z] relative to building centre at rot 0
// unlockPop: population (incl. hatchlings) needed before it appears in the build menu

export const BUILDINGS = {
  cottage: {
    name: 'Cottage', size: [6, 5], solid: true, startOnly: true,
    beds: 1, deposit: true, depositSpot: [2.6, 3.4],
    bedSpots: [[0, 3.0]], // door
    sleepInside: true,
  },
  kitchen: {
    name: 'Kitchen Table', size: [3, 2], solid: true, startOnly: true,
    eatSlots: 2, eatSpots: [[-0.7, 1.4], [0.7, 1.4]], queueDir: [0, 1],
  },
  basket: {
    name: 'Egg Basket', size: [2, 2], solid: false, startOnly: true, eggCap: 6,
  },
  granulator: {
    name: 'Gran-ulator', size: [2, 2], solid: true, startOnly: true,
    incubator: { slots: 1, manual: true },
  },

  bed: {
    name: 'Bed', desc: 'Sleeps 1 Grandma.', cost: { wood: 6 }, size: [1, 2], solid: false,
    work: 3, beds: 1, bedSpots: [[0, 0]], unlockPop: 1,
  },
  farm: {
    name: 'Farm Plot', desc: 'Farmers grow food. 2 workers.', cost: { wood: 8 }, size: [4, 4], solid: false,
    work: 4, unlockPop: 2,
    job: { role: 'farmer', slots: 2 }, workSpots: [[-1, -0.6], [1, 0.6], [-1, 1.2], [1, -1.2]],
  },
  stockpile: {
    name: 'Stockpile', desc: 'Workers drop resources here.', cost: { wood: 6 }, size: [3, 3], solid: false,
    work: 2, deposit: true, depositSpot: [0, 0], unlockPop: 3,
  },
  lumber: {
    name: 'Lumber Camp', desc: 'Lumber Grandmas chop wood. 3 workers.', cost: { wood: 10 }, size: [4, 3], solid: false,
    work: 5, unlockPop: 3,
    job: { role: 'lumber', slots: 3 }, workSpots: [[-1.2, 0.6], [0, 0.9], [1.2, 0.6]],
  },
  quarry: {
    name: 'Stone Quarry', desc: 'Miner Grandmas dig stone. 3 workers.', cost: { wood: 14 }, size: [4, 4], solid: false,
    work: 6, unlockPop: 3,
    job: { role: 'miner', slots: 3 }, workSpots: [[-1.1, 1.2], [0, 1.5], [1.1, 1.2]],
  },
  house: {
    name: 'Granny Flat', desc: 'Sleeps 6 Grandmas.', cost: { wood: 18, stone: 8 }, size: [4, 4], solid: true,
    work: 8, beds: 6, bedSpots: [[0, 2.5]], sleepInside: true, unlockPop: 4,
  },
  table: {
    name: 'Feeding Table', desc: '4 more seats at mealtimes.', cost: { wood: 10, stone: 4 }, size: [4, 2], solid: true,
    work: 5, unlockPop: 4,
    eatSlots: 4, eatSpots: [[-1.2, 1.4], [0, 1.4], [1.2, 1.4], [0, -1.4]], queueDir: [0, 1],
  },
  builder: {
    name: "Builder's Hut", desc: 'Builders build sites and haul eggs. 3 workers.', cost: { wood: 15, stone: 6 }, size: [3, 3], solid: true,
    work: 6, unlockPop: 6,
    job: { role: 'builder', slots: 3 }, workSpots: [[-0.9, 2.1], [0, 2.1], [0.9, 2.1]],
  },
  crate: {
    name: 'Egg Crate', desc: 'Stores 8 more eggs.', cost: { wood: 8 }, size: [2, 2], solid: false,
    work: 3, eggCap: 8, unlockPop: 4,
  },
  double: {
    name: 'Double Gran-ulator', desc: 'Hatches 2 eggs at a time. No dial required.', cost: { wood: 20, stone: 16 }, size: [3, 2], solid: true,
    work: 8, unlockPop: 6,
    incubator: { slots: 2, auto: true, time: 16 },
  },
  barn: {
    name: 'Bunk Barn', desc: 'Sleeps 16 Grandmas.', cost: { wood: 40, stone: 28 }, size: [6, 5], solid: true,
    work: 16, beds: 16, bedSpots: [[0, 3.0]], sleepInside: true, unlockPop: 12,
  },
  bell: {
    name: "Foreman's Bell", desc: 'A Foreman Grandma assigns idle Grandmas to jobs.', cost: { wood: 20, stone: 15 }, size: [2, 2], solid: true,
    work: 6, unlockPop: 12,
    job: { role: 'foreman', slots: 1 }, workSpots: [[0, 1.5]],
  },
  bigfarm: {
    name: 'Big Farm', desc: 'Grows food with 5 farmers.', cost: { wood: 24, stone: 10 }, size: [6, 6], solid: false,
    work: 10, unlockPop: 16,
    job: { role: 'farmer', slots: 5 },
    workSpots: [[-2, -1.5], [0, -1.5], [2, -1.5], [-1, 1.2], [1, 1.2]],
  },
  deluxe: {
    name: 'Gran-ulator Deluxe', desc: 'Hatches 6 eggs at a time.', cost: { wood: 40, stone: 50 }, size: [4, 3], solid: true,
    work: 16, unlockPop: 20,
    incubator: { slots: 6, auto: true, time: 12 },
  },
};

// Build menu order.
export const BUILD_ORDER = [
  'bed', 'farm', 'stockpile', 'lumber', 'quarry', 'house', 'table',
  'crate', 'builder', 'double', 'barn', 'bell', 'bigfarm', 'deluxe',
];

export const ROLE_NAMES = {
  farmer: 'Farmer',
  lumber: 'Lumber Grandma',
  miner: 'Miner Grandma',
  builder: 'Builder',
  foreman: 'Foreman',
};
