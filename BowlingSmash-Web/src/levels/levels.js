// The 20 hand-authored levels. Each one teaches, combines or tests something.
// Difficulty follows a sawtooth: easy -> thought -> spectacle -> new mechanic
// -> consolidation -> HARD -> easy reset -> combine -> SUPER HARD.
//
// Coordinates: ball starts at `start` and bowls toward -Z, +X is to the right.
// Object spec: { t: type, at: [x, baseY, z] | c: [centre], ry | rot, size, mass, target }

import {
  pinTriangle, pinGrid, lineOf, rowX, dominoLine, dominoArc, canPyramid, boxWall, table, ramp, rail, backstop,
} from './helpers.js';

const L = [];

// 1 ─ FIRST STRIKE ───────────────────────────────────────────── arena
L.push({
  id: 1, name: 'First Strike', env: 'arena', diff: 'easy', balls: 3,
  teach: 'Drag back, release, enjoy.',
  assist: { angle: 0, range: 7, strength: 0.85 },
  start: [0, 0, 0], floor: { w: 4.4, d: 16, cz: -5 },
  objects: [...pinTriangle(0, -9, 4), rail(-1.75, 1, -12), rail(1.75, 1, -12), backstop(-12.2, 4.4)],
});

// 2 ─ WIDE LOAD ──────────────────────────────────────────────── arena
L.push({
  id: 2, name: 'Wide Load', env: 'arena', diff: 'easy', balls: 3,
  teach: 'A bigger rack. Aim at the head pin.',
  assist: { angle: 3.2, range: 7, strength: 0.8 },
  start: [0, 0, 0], floor: { w: 6, d: 18, cz: -6 },
  objects: [...pinTriangle(0.6, -10, 5), rail(-2.6, 1, -14), rail(2.6, 1, -14), backstop(-14.2, 6)],
});

// 3 ─ WEAK POINT ─────────────────────────────────────────────── arena
{
  const objs = [];
  // three-storey tower: posts -> slab -> pins, stacked
  let y = 0;
  const storeys = [[0.32, 1.0, 1.5], [0.3, 0.9, 1.3], [0.28, 0.8, 1.1]];
  storeys.forEach(([px, ph, sw], i) => {
    objs.push({ t: 'post', at: [-px, y, -10], size: [0.16, ph, 0.16], mass: 0.6 });
    objs.push({ t: 'post', at: [px, y, -10], size: [0.16, ph, 0.16], mass: 0.6 });
    y += ph + 0.002;
    objs.push({ t: 'slab', at: [0, y, -10], size: [sw, 0.1, 0.7], mass: 1.2 });
    y += 0.102;
    const pinX = i === 2 ? [-0.38, 0, 0.38] : [-0.6, 0.6];
    for (const x of pinX) objs.push({ t: 'pin', at: [x, y, -10] });
  });
  objs.push(...rowX('pin', -0.9, 0.9, 4, 0, -10.9));
  L.push({
    id: 3, name: 'Weak Point', env: 'arena', diff: 'easy', balls: 3,
    teach: 'Knock out the supports and the whole tower comes down.',
    assist: { angle: 0, range: 5, strength: 0.7 },
    start: [0, 0, 0], floor: { w: 6, d: 17, cz: -5.5 },
    objects: [...objs, rail(-2.6, 1, -13), rail(2.6, 1, -13), backstop(-13.2, 6)],
  });
}

// 4 ─ TWO CAMPS ──────────────────────────────────────────────── arena
L.push({
  id: 4, name: 'Two Camps', env: 'arena', diff: 'normal', balls: 3,
  teach: 'One push can reach both groups.',
  start: [0, 0, 0], floor: { w: 9.4, d: 17, cz: -5.5 },
  objects: [
    ...dominoLine(0, -5.2, 0, -6.4, 3),
    ...dominoLine(-0.24, -6.85, -2.0, -8.43, 5),
    ...dominoLine(0.24, -6.85, 2.0, -8.43, 5),
    ...lineOf('pin', -2.4, -8.79, -3.95, -10.18, 6), ...lineOf('pin', 2.4, -8.79, 3.95, -10.18, 6),
    rail(-4.6, 1, -13), rail(4.6, 1, -13), backstop(-13.2, 9.4),
  ],
});

// 5 ─ LAUNCH RAMP (spectacle) ────────────────────────────────── arena
L.push({
  id: 5, name: 'Launch Ramp', env: 'arena', diff: 'easy', balls: 4,
  teach: 'Gravity is your friend.',
  assist: { angle: -1, range: 8, strength: 0.8 },
  start: [0, 2.2, 1.0], floor: { w: 8, d: 22, cz: -8 }, power: [0.1, 0.55],
  objects: [
    { t: 'platform', at: [0, 0, 0.6], size: [3.6, 2.2, 3.2], look: 'stage' },
    ramp(0, -1.0, 2.2, -7.0, 0, 3.6),
    ...pinTriangle(0, -10.6, 7),
    backstop(-17.5, 8),
  ],
});

// 6 ─ HOOK SHOT (introduce spin) ─────────────────────────────── arena
L.push({
  id: 6, name: 'Hook Shot', env: 'arena', diff: 'normal', balls: 4, hook: true,
  teach: 'Add SPIN to curve around the block.',
  start: [0, 0, 0], floor: { w: 7.4, d: 19, cz: -6.5 },
  objects: [
    { t: 'wall', at: [0, 0, -5.5], size: [1.7, 1.2, 0.4], look: 'barrier' },
    ...pinTriangle(0, -11.5, 4),
    rail(-3.6, 1, -15), rail(3.6, 1, -15), backstop(-15.2, 7.4),
  ],
});

// 7 ─ DOMINO RUN ──────────────────────────────────────────────── arena
L.push({
  id: 7, name: 'Domino Run', env: 'arena', diff: 'normal', balls: 3, hook: true,
  teach: 'Start the chain and watch.',
  start: [0, 0, 0], floor: { w: 8, d: 18, cz: -6 },
  objects: [
    { t: 'wall', at: [0.4, 0, -6.6], size: [3.6, 1.6, 0.4], look: 'barrier' },
    ...dominoLine(-2.6, -3.6, -2.6, -6.6, 7),
    ...dominoArc(-1.7, -7.3, 0.9, 180, 90, 4).slice(1),
    ...dominoLine(-1.4, -8.4, 0.2, -8.6, 4),
    ...pinTriangle(0.85, -8.9, 4).map((p) => ({ ...p, at: [p.at[0], p.at[1], p.at[2]] })),
    rail(-3.6, 1, -13.5), rail(3.6, 1, -13.5), backstop(-13.7, 8),
  ],
});

// 8 ─ GLASS HOUSE ─────────────────────────────────────────────── arena
L.push({
  id: 8, name: 'Glass House', env: 'arena', diff: 'normal', balls: 3, hook: true,
  teach: 'Smash straight through the glass.',
  start: [0, 0, 0], floor: { w: 8, d: 18, cz: -6 },
  objects: [
    { t: 'glass', at: [0, 0, -7.4], size: [2.2, 1.6, 0.08] },
    { t: 'glass', at: [-2.5, 0, -8.2], ry: -20, size: [1.8, 1.6, 0.08] },
    { t: 'glass', at: [2.5, 0, -8.2], ry: 20, size: [1.8, 1.6, 0.08] },
    ...pinTriangle(0, -8.6, 4),
    ...pinTriangle(-2.7, -9.3, 2), ...pinTriangle(2.7, -9.3, 2),
    rail(-3.6, 1, -13), rail(3.6, 1, -13), backstop(-13.2, 8),
  ],
});

// 9 ─ RICKETY BRIDGE ──────────────────────────────────────────── arena
L.push({
  id: 9, name: 'Rickety Bridge', env: 'arena', diff: 'normal', balls: 3, hook: true,
  teach: 'Find the one support holding it all up.',
  start: [0, 0, 0], floor: { w: 9, d: 18, cz: -6 },
  objects: [
    { t: 'pillar', at: [-3.2, 0, -10], r: 0.35, h: 1.6 },
    { t: 'pillar', at: [3.2, 0, -10], r: 0.35, h: 1.6 },
    { t: 'post', at: [0, 0, -10], size: [0.3, 1.6, 0.3], mass: 1.5 },
    { t: 'plank', at: [-1.55, 1.602, -10], size: [3.3, 0.12, 0.9], mass: 2 },
    { t: 'plank', at: [1.55, 1.602, -10], size: [3.3, 0.12, 0.9], mass: 2 },
    ...rowX('pin', -2.6, -0.5, 4, 1.724, -10),
    ...rowX('pin', 0.5, 2.6, 4, 1.724, -10),
    { t: 'barrel', at: [-1.4, 0, -11.6] }, { t: 'barrel', at: [1.4, 0, -11.6] },
    backstop(-13.5, 9),
  ],
});

// 10 ─ THREE CAMPS (HARD) ─────────────────────────────────────── arena
L.push({
  id: 10, name: 'Three Camps', env: 'arena', diff: 'hard', balls: 3, hook: true,
  teach: 'Three groups, three balls. Make every shot count.',
  start: [0, 0, 0], floor: { w: 10, d: 19, cz: -6.5 },
  objects: [
    { t: 'wall', at: [-3, 0, -7.5], size: [2.6, 1.2, 0.4], look: 'barrier' },
    { t: 'wall', at: [4.85, 0, -9], ry: 0, size: [0.3, 1.2, 8], look: 'barrier' },
    { t: 'wall', at: [-4.85, 0, -9], ry: 0, size: [0.3, 1.2, 8], look: 'barrier' },
    ...pinTriangle(-3.1, -10.2, 3),
    ...pinTriangle(3.4, -11, 3),
    { t: 'post', at: [-0.3, 0, -11.5], size: [0.16, 0.8, 0.16], mass: 0.5 },
    { t: 'post', at: [0.3, 0, -11.5], size: [0.16, 0.8, 0.16], mass: 0.5 },
    { t: 'slab', at: [0, 0.802, -11.5], size: [1.2, 0.1, 0.6], mass: 1 },
    ...rowX('pin', -0.35, 0.35, 3, 0.904, -11.5),
    backstop(-14, 10),
  ],
});

export const LEVELS = L;
export const getLevel = (id) => L.find((l) => l.id === id);
