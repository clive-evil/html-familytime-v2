import { BALANCE } from '../../data/balance.js';
import { rand } from '../rng.js';

// Variation tables (indices are interpreted by the renderer).
export const VARIANTS = { cardigan: 6, bun: 3, glasses: 3, frame: 4, skin: 4, shawl: 3, slipper: 4 };

// A Grandma is a flat plain-data record: cheap to iterate, trivial to serialise,
// and maps 1:1 onto a Luau table.
export function createGrandma(state, x, z, opts = {}) {
  const r = () => rand(state);
  let rare = '';
  if (!opts.noRare) {
    const roll = r();
    const e = BALANCE.eggs;
    if (roll < e.rareGolden) rare = 'golden';
    else if (roll < e.rareGolden + e.rareBig) rare = 'big';
    else if (roll < e.rareGolden + e.rareBig + e.rareTiny) rare = 'tiny';
  }
  let scale = 0.92 + r() * 0.16;
  if (rare === 'big') scale = 1.55;
  if (rare === 'tiny') scale = 0.6;
  const g = {
    id: state.nextId++,
    x, z, rot: r() * Math.PI * 2,
    vx: 0, vz: 0,
    tx: x, tz: z, moving: false,
    scale,
    rare,
    v: {
      c: Math.floor(r() * VARIANTS.cardigan),
      b: Math.floor(r() * VARIANTS.bun),
      g: Math.floor(r() * VARIANTS.glasses),
      f: Math.floor(r() * VARIANTS.frame),
      s: Math.floor(r() * VARIANTS.skin),
      w: Math.floor(r() * VARIANTS.shawl),
      p: Math.floor(r() * VARIANTS.slipper),
    },
    adult: opts.adult ?? false,
    bornDay: state.day,
    hunger: opts.hunger ?? 0.2,
    starving: false, // could not eat when hungry
    hungryToday: false,
    stiff: false, // slept outside last night
    eatRetryAt: 0,
    job: '', // role
    wp: 0, // workplace building id
    slot: -1,
    state: 'idle',
    timer: 0,
    carryType: '', // food|wood|stone|egg|material
    carryN: 0,
    bigItem: false,
    quirk: '',
    table: 0, // table building id while queueing
    bed: 0, // building id tonight
    inside: false, // hidden inside a building (sleeping)
    anim: 'idle',
    phase: rand(state) * 10, // animation phase offset
    spawnT: 0, // seconds since hatch (for the emerge animation)
    thinkAt: 0,
    side: rand(state) < 0.5 ? -1 : 1, // which way she steers round obstacles
  };
  return g;
}
