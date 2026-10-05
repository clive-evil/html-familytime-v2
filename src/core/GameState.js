import { BALANCE } from '../data/balance.js';
import { rand, randRange } from './rng.js';
import { createBuilding } from './entities/Building.js';
import { createGrandma } from './entities/Grandma.js';

export const SAVE_VERSION = 1;

// GameState is the single source of truth. It is plain JSON-serialisable data:
// no class instances, no references between objects (ids only), no DOM/three.
export function createGameState(seed = 12345) {
  const state = {
    version: SAVE_VERSION,
    seed,
    rng: seed >>> 0,
    nextId: 1,
    time: 0,
    day: 1,
    phase: 'day', // 'day' | 'night'
    dayTime: 0,
    nightTime: 0,
    clockRunning: false, // Day 1 is untimed (tutorial)
    resources: { ...BALANCE.start },
    maxPop: 1,
    player: {
      x: 0, z: 1.5, rot: Math.PI, vx: 0, vz: 0,
      mx: 0, mz: 0, sprint: false,
      carry: { food: 0, wood: 0, stone: 0 },
      egg: 0, // egg id being carried
      gatherCd: 0,
      action: '', actionT: 0, // last action for animation ('gather','build','dial')
    },
    grandmas: [],
    eggs: [],
    buildings: [],
    nodes: [],
    tutorial: { step: 0, done: false, t: 0 },
    flags: {},
    stats: {
      today: newDayStats(),
      history: [],
      totalHatched: 0,
      totalEggs: 0,
      prod: { food: 0, wood: 0, stone: 0 }, // smoothed per-second production
    },
    lastSummary: null,
  };

  layoutWorld(state);
  return state;
}

export function newDayStats() {
  return { food: 0, wood: 0, stone: 0, eaten: 0, missedMeals: 0, hatched: 0, eggsLaid: 0, eggsLost: 0, sleptOutside: 0 };
}

function layoutWorld(state) {
  const B = (type, cx, cz, rot = 0) => {
    const b = createBuilding(state, type, cx, cz, rot, true);
    state.buildings.push(b);
    return b;
  };
  B('cottage', -3, -9); // centre (0,-6.5), door faces +z
  B('kitchen', -8, -4); // centre (-6.5,-3)
  B('basket', -3, -3); // centre (-2,-2)
  B('granulator', 5, -5); // centre (6,-4)

  // Resource nodes, scattered with rejection sampling.
  const nodes = state.nodes;
  const free = (x, z, r) => {
    if (Math.hypot(x, z + 3) < 11) return false; // keep the yard clear
    for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < r + 1.6) return false;
    return true;
  };
  const scatter = (type, count, cx, cz, rad) => {
    let tries = 0;
    let placed = 0;
    while (placed < count && tries++ < 500) {
      const a = rand(state) * Math.PI * 2;
      const d = Math.sqrt(rand(state)) * rad;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (Math.abs(x) > BALANCE.worldHalf - 2 || Math.abs(z) > BALANCE.worldHalf - 2) continue;
      if (!free(x, z, BALANCE.nodes[type].radius)) continue;
      const def = BALANCE.nodes[type];
      nodes.push({ id: state.nextId++, type, x, z, charges: def.charges, regenT: 0, s: randRange(state, 0.85, 1.2) });
      placed++;
    }
  };
  scatter('bush', 8, -15, 3, 5);
  scatter('bush', 4, -4, 14, 4);
  scatter('tree', 14, 16, -16, 7);
  scatter('tree', 16, 26, -28, 10);
  scatter('tree', 12, -24, -24, 9);
  scatter('rock', 7, 18, 13, 5);
  scatter('rock', 4, -22, 18, 4);

  const g = createGrandma(state, -5, -0.5, { adult: true, hunger: 0.75, noRare: true });
  g.v = { c: 0, b: 0, g: 0, f: 0, s: 0, w: 0, p: 0 };
  g.scale = 1;
  g.bornDay = 0;
  state.grandmas.push(g);
}
