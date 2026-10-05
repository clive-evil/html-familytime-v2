import { BUILDINGS } from '../../data/buildings.js';

export function footprint(type, rot) {
  const [w, d] = BUILDINGS[type].size;
  return rot % 2 === 1 ? [d, w] : [w, d];
}

// Rotate a local [x,z] offset by rot quarter-turns, return world coords.
export function localToWorld(b, lx, lz) {
  let x = lx, z = lz;
  switch (b.rot & 3) {
    case 1: x = lz; z = -lx; break;
    case 2: x = -lx; z = -lz; break;
    case 3: x = -lz; z = lx; break;
  }
  return [b.x + x, b.z + z];
}

export function createBuilding(state, type, cx, cz, rot = 0, built = false) {
  const def = BUILDINGS[type];
  const [w, d] = footprint(type, rot);
  // cx,cz = min-corner grid cell; centre is in world units.
  const b = {
    id: state.nextId++,
    type, cx, cz, rot,
    x: cx + w / 2, z: cz + d / 2,
    w, d,
    built,
    progress: built ? 1 : 0, // 0..1 construction
    workers: [], // grandma ids (job slots)
    queue: [], // grandma ids queueing to eat
    autoOn: true, // auto incubators: haulers deliver eggs when on
    reserved: 0, // eggs promised by haulers
    inc: null,
  };
  if (def.incubator) {
    b.inc = def.incubator.manual
      ? { stage: 'empty', egg: 0, dial: 0, t: 0, hatched: 0 }
      : { slots: new Array(def.incubator.slots).fill(0), t: new Array(def.incubator.slots).fill(0), hatched: 0 };
  }
  return b;
}
