// The 20 hand-authored levels. Each one teaches, combines or tests something.
// Difficulty follows a sawtooth: easy -> thought -> spectacle -> new mechanic
// -> consolidation -> HARD -> easy reset -> combine -> SUPER HARD.
//
// Coordinates: ball starts at `start` and bowls toward -Z, +X is to the right.
// Object spec: { t: type, at: [x, baseY, z] | c: [centre], ry | rot, size, mass, target }

import {
  pinTriangle, pinGrid, lineOf, alongPath, pinTriangleDir, rowX, dominoLine, dominoArc, canPyramid, boxWall, table, ramp, rail, backstop,
} from './helpers.js';

const L = [];

// 1 ─ FIRST STRIKE ───────────────────────────────────────────── arena
L.push({
  id: 1, name: 'First Strike', env: 'arena', diff: 'easy', balls: 3,
  teach: 'Drag back, release, enjoy.',
  assist: { angle: 0, range: 7, strength: 0.85 },
  start: [0, 0, 0], floor: { w: 4.4, d: 14, cz: -4.5 },
  objects: [...pinTriangle(0, -7.6, 4), rail(-1.75, 1, -10.5), rail(1.75, 1, -10.5), backstop(-10.7, 4.4)],
});

// 2 ─ WIDE LOAD ──────────────────────────────────────────────── arena
L.push({
  id: 2, name: 'Wide Load', env: 'arena', diff: 'easy', balls: 3,
  teach: 'A bigger rack. Aim at the head pin.',
  assist: { angle: 4, range: 7, strength: 0.8 },
  start: [0, 0, 0], floor: { w: 6, d: 16, cz: -5.5 },
  objects: [...pinTriangle(0.6, -8.6, 5), rail(-2.6, 1, -12.6), rail(2.6, 1, -12.6), backstop(-12.8, 6)],
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
{
  const doms = alongPath([[-1.2, -2.8], [-1.5, -4.0], [-2.4, -5.0], [-3.3, -6.0], [-3.6, -7.2], [-3.2, -8.3], [-2.2, -8.9], [-1.4, -9.0]], 0.46);
  let x = doms[doms.length - 1].at[0], h = 0.9;
  const growth = [];
  for (let i = 0; i < 3; i++) {
    h *= 1.25; x += 0.62 * h;
    growth.push({ t: 'domino', at: [x, 0, -9.0], ry: 90, size: [0.5 * h, h, 0.12 * h / 0.9], mass: 1.4 * (h / 0.9) ** 2 });
  }
  L.push({
    id: 7, name: 'Domino Run', env: 'arena', diff: 'normal', balls: 3, hook: true,
    teach: 'Tip the first domino and watch the chain.',
    start: [-1.2, 0, 0], floor: { w: 10.6, d: 17, cz: -5.5 },
    objects: [
      { t: 'wall', at: [0.2, 0, -6.6], size: [5.6, 0.9, 0.4], look: 'barrier' },
      ...doms, ...growth,
      ...pinTriangleDir(x + h * 0.55 + 0.2, -9.0, 4, 1, 0),
      rail(-5.1, 1, -12.5), rail(5.1, 1, -12.5), backstop(-12.7, 10.6),
    ],
  });
}

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


// 11 ─ AISLE SMASH (easy spectacle reset, new setting) ──────── market
L.push({
  id: 11, name: 'Aisle Smash', env: 'market', diff: 'easy', balls: 4,
  teach: 'Clean-up on aisle 11! Full power!',
  assist: { angle: 1, range: 6, strength: 0.7 },
  start: [0, 0, 0], floor: { w: 7, d: 17, cz: -6 },
  objects: [
    { t: 'wall', at: [-3.3, 0, -5.5], size: [0.4, 1.4, 15], mat: 'metal', look: 'rail' },
    { t: 'wall', at: [3.3, 0, -5.5], size: [0.4, 1.4, 15], mat: 'metal', look: 'rail' },
    ...canPyramid(0, 0, -9.2, 5, { r: 0.15, h: 0.4, colors: ['#e8213f', '#2b7bff', '#ffcc33', '#21b573'], extra: { r: 0.15, h: 0.4, mass: 0.5 } }),
    ...canPyramid(0, 0, -9.62, 4, { r: 0.15, h: 0.4, colors: ['#ff7a1a', '#9b59ff', '#e8213f'], extra: { r: 0.15, h: 0.4, mass: 0.5 } }),
    ...boxWall('box', 0, 0, -10.3, 3, 2, [0.55, 0.45, 0.55]),
    ...rowX('bottle', -0.56, 0.56, 3, 0.906, -10.3),
    backstop(-12.6, 7),
  ],
});

// 12 ─ CUBICLE CHAOS (ricochet off desks) ────────────────────── office
L.push({
  id: 12, name: 'Cubicle Chaos', env: 'office', diff: 'normal', balls: 3, hook: true,
  teach: 'Bounce off the desks to reach the corners.',
  start: [0, 0, 0], floor: { w: 9, d: 18, cz: -6.5 },
  objects: [
    { t: 'desk', at: [-2.4, 0, -6.2], ry: 30, size: [2.4, 0.75, 0.9] },
    { t: 'desk', at: [2.4, 0, -6.2], ry: -30, size: [2.4, 0.75, 0.9] },
    { t: 'chair', at: [-0.9, 0, -8.4], ry: 180 }, { t: 'chair', at: [0.9, 0, -8.4], ry: 180 },
    { t: 'dummy', at: [-1.6, 0, -10.2] }, { t: 'dummy', at: [0, 0, -10.6] }, { t: 'dummy', at: [1.6, 0, -10.2] },
    ...boxWall('box', -3.4, 0, -10.4, 2, 2, [0.5, 0.4, 0.5]),
    ...boxWall('box', 3.4, 0, -10.4, 2, 2, [0.5, 0.4, 0.5]),
    { t: 'cabinet', at: [-3.9, 0, -8.2] }, { t: 'cabinet', at: [3.9, 0, -8.2] },
    { t: 'wall', at: [-4.35, 0, -6.5], size: [0.3, 1, 13], look: 'rail' },
    { t: 'wall', at: [4.35, 0, -6.5], size: [0.3, 1, 13], look: 'rail' },
    backstop(-13.2, 9),
  ],
});

// 13 ─ SUPPORT BEAM (knock the posts, drop the load) ────────── site
{
  const legs = [[-0.42, -9.15], [0.42, -9.15], [-0.42, -10.05], [0.42, -10.05]].map(([x, z]) => ({ t: 'post', at: [x, 0, z], size: [0.2, 1.4, 0.2], mass: 0.8 }));
  const topY = 1.4 + 0.002 + 0.14 + 0.002;
  L.push({
    id: 13, name: 'Support Beam', env: 'site', diff: 'normal', balls: 3, hook: true,
    teach: 'Take out the posts and the load comes down.',
    start: [0, 0, 0], floor: { w: 8, d: 17, cz: -6 },
    objects: [
      ...legs,
      { t: 'slab', at: [0, 1.402, -9.6], size: [3.0, 0.14, 1.3], mass: 2.5 },
      ...rowX('barrel', -0.95, 0.95, 3, topY, -9.6, { mass: 2.5 }),
      { t: 'cone', at: [-1.3, topY, -9.2] }, { t: 'cone', at: [1.3, topY, -9.2] },
      { t: 'cone', at: [-1.05, 0, -9.6] }, { t: 'cone', at: [1.05, 0, -9.6] },
      { t: 'cone', at: [0, 0, -7.6] },
      backstop(-12.6, 8),
    ],
  });
}

// 14 ─ BANK SHOT (ricochet) ───────────────────────────────────── site
L.push({
  id: 14, name: 'Bank Shot', env: 'site', diff: 'normal', balls: 3, hook: true,
  teach: 'No way through? Bounce it off the wall.',
  start: [0, 0, 0], floor: { w: 9, d: 18, cz: -6.5 },
  objects: [
    { t: 'wall', at: [-1.2, 0, -5.6], size: [4.6, 1.1, 0.45], look: 'barrier' },
    { t: 'wall', at: [3.5, 0, -8.4], ry: 40, size: [0.45, 1.1, 4.0], look: 'barrier' },
    { t: 'wall', at: [-4.35, 0, -8], size: [0.3, 1.1, 9], look: 'rail' },
    ...pinTriangle(-1.3, -9.2, 4),
    { t: 'barrel', at: [-2.5, 0, -11.3] }, { t: 'barrel', at: [-0.1, 0, -11.3] },
    backstop(-13.4, 9),
  ],
});

// 15 ─ CHECKOUT RUSH (moving targets) ──────────────────────── market
L.push({
  id: 15, name: 'Checkout Rush', env: 'market', diff: 'normal', balls: 4, hook: true,
  teach: 'Time your throw - the conveyors keep moving.',
  start: [0, 0, 0], floor: { w: 9, d: 18, cz: -6.5 },
  objects: [
    ...[[-6.6, 5.2, 0], [-9.0, 4.4, 2.2], [-11.4, 6.0, 4.1]].flatMap(([z, period, phase]) => {
      const ox = 2.2 * Math.sin(phase);
      return [
        { t: 'mover', at: [0, 0, z], size: [1.8, 0.2, 1.1], move: { axis: [1, 0, 0], amp: 2.2, period, phase } },
        { t: 'box', at: [ox - 0.4, 0.201, z], size: [0.55, 0.45, 0.55], ride: true },
        { t: 'box', at: [ox + 0.4, 0.201, z], size: [0.55, 0.45, 0.55], ride: true },
        { t: 'box', at: [ox, 0.654, z], size: [0.55, 0.45, 0.55], ride: true },
      ];
    }),
    { t: 'wall', at: [-4.35, 0, -7], size: [0.3, 1, 12], look: 'rail' },
    { t: 'wall', at: [4.35, 0, -7], size: [0.3, 1, 12], look: 'rail' },
    backstop(-13.2, 9),
  ],
});

// 16 ─ THE GIANT (pure spectacle) ─────────────────────────────── arena
{
  const objs = [{ t: 'giantPin', at: [0, 0, -7.2], h: 3.2, mass: 14 }];
  objs.push(...pinTriangle(0, -8.5, 8, { t: 'miniPin', spacing: 0.36 }));
  for (const x of [-2.3, 2.3]) {
    objs.push({ t: 'crate', at: [x, 0, -9.4], size: [0.7, 0.7, 0.7], target: false, mass: 1.5 });
    objs.push({ t: 'crate', at: [x, 0.702, -9.4], size: [0.7, 0.7, 0.7], target: false, mass: 1.5 });
    objs.push(...pinGrid(x, -9.25, 2, 2, { t: 'miniPin', spacing: 0.3, y: 1.404 }));
  }
  L.push({
    id: 16, name: 'The Giant', env: 'arena', diff: 'easy', balls: 4,
    teach: 'Topple the giant. Watch everything go.',
    assist: { angle: 0, range: 6, strength: 0.75 },
    start: [0, 0, 0], floor: { w: 8, d: 17, cz: -6 },
    objects: [...objs, rail(-3.6, 1, -12.5), rail(3.6, 1, -12.5), backstop(-12.7, 8)],
  });
}

// 17 ─ CASCADE (tiers) ────────────────────────────────────────── plaza
L.push({
  id: 17, name: 'Cascade', env: 'plaza', diff: 'normal', balls: 3, hook: true,
  teach: 'Roll it down the steps through every group.',
  start: [0, 3, 0.6], floor: { w: 7, d: 19, cz: -8.3 }, power: [0, 0.6],
  objects: [
    { t: 'platform', at: [0, 0, 0.6], size: [5, 3, 1.2], look: 'stage' },
    ramp(0, 0, 3, -2.4, 2, 5),
    { t: 'platform', at: [0, 0, -3.9], size: [5, 2, 3.0], look: 'stage' },
    ramp(0, -5.4, 2, -7.8, 1, 5),
    { t: 'platform', at: [0, 0, -9.3], size: [5, 1, 3.0], look: 'stage' },
    ramp(0, -10.8, 1, -13.2, 0, 5),
    ...pinTriangle(0, -3.4, 3, { y: 2 }),
    ...pinTriangle(0, -8.8, 3, { y: 1 }),
    ...pinTriangle(0, -14.0, 4, { spacing: 0.5 }),
    { t: 'statue', at: [-0.8, 0, -16.1] }, { t: 'statue', at: [0.8, 0, -16.1] },
    backstop(-17.2, 7),
  ],
});

// 18 ─ DOUBLE BLOCK (controlled hook) ──────────────────────────── office
L.push({
  id: 18, name: 'Double Block', env: 'office', diff: 'normal', balls: 3, hook: true,
  teach: 'Two desks in the way. One curving shot.',
  start: [0, 0, 0], floor: { w: 9, d: 19, cz: -7 },
  objects: [
    { t: 'desk', at: [1.5, 0, -4.8], size: [2.4, 0.75, 0.8] },
    { t: 'desk', at: [-1.9, 0, -8.8], size: [2.4, 0.75, 0.8] },
    { t: 'dummy', at: [1.0, 0, -12.4] }, { t: 'dummy', at: [2.0, 0, -12.6] },
    { t: 'chair', at: [0.6, 0, -11.4], ry: 160 }, { t: 'chair', at: [1.6, 0, -11.3], ry: 200 },
    ...boxWall('box', 2.9, 0, -12.2, 1, 3, [0.5, 0.4, 0.5]),
    { t: 'wall', at: [-4.35, 0, -7], size: [0.3, 1, 13], look: 'rail' },
    { t: 'wall', at: [4.35, 0, -7], size: [0.3, 1, 13], look: 'rail' },
    backstop(-14, 9),
  ],
});

// 19 ─ PINBALL WIZARD (bumpers) ───────────────────────────────── arena
L.push({
  id: 19, name: 'Pinball Wizard', env: 'arena', diff: 'normal', balls: 3, hook: true,
  teach: 'Bumpers fire the ball back into play.',
  start: [0, 0, 0], floor: { w: 9, d: 18, cz: -6.5 },
  objects: [
    { t: 'bumper', at: [-1.4, 0, -6.2] }, { t: 'bumper', at: [1.4, 0, -6.2] },
    { t: 'bumper', at: [0, 0, -9.2] },
    { t: 'bumper', at: [-2.8, 0, -10.6] }, { t: 'bumper', at: [2.8, 0, -10.6] },
    { t: 'bumperWall', at: [-4.1, 0, -8], size: [0.3, 0.6, 10] },
    { t: 'bumperWall', at: [4.1, 0, -8], size: [0.3, 0.6, 10] },
    { t: 'bumperWall', at: [-3.2, 0, -12.6], ry: 40, size: [0.3, 0.6, 2.4] },
    { t: 'bumperWall', at: [3.2, 0, -12.6], ry: -40, size: [0.3, 0.6, 2.4] },
    ...pinTriangle(-2.7, -7.4, 2), ...pinTriangle(2.7, -7.4, 2),
    ...pinTriangle(0, -10.4, 3),
    ...pinGrid(-1.4, -12.2, 2, 1), ...pinGrid(1.4, -12.2, 2, 1),
    { t: 'goldPin', at: [0, 0, -12.8] },
    backstop(-13.6, 9),
  ],
});

// 20 ─ GRAND SMASH (SUPER HARD showcase) ─────────────────────── site
{
  const left = table(-3.0, -11.6, 1.6, 1.1, 1.3, { legMass: 0.4, topMass: 1.6, legSize: 0.18, legExtra: { friction: 0.12 } });
  const right = table(3.0, -11.6, 1.6, 1.1, 1.3, { legMass: 0.4, topMass: 1.6, legSize: 0.18, legExtra: { friction: 0.12 } });
  // domino fork of TALL dominoes: each branch's last domino falls onto a raised
  // table top and sweeps its load off (a loaded table leg is too strong to push)
  const branch = (sx) => {
    const tx = 2.2, tz = -11.4, x0 = 0.45, z0 = -8.5;
    const L = Math.hypot(tx - x0, tz - z0), ux = (tx - x0) / L, uz = (tz - z0) / L;
    return dominoLine(sx * x0, z0, sx * (tx - ux * 0.7), tz - uz * 0.7, 5, { extra: { size: [0.6, 1.6, 0.18], mass: 2.6 } });
  };
  L.push({
    id: 20, name: 'Grand Smash', env: 'site', diff: 'superhard', balls: 3, hook: true,
    teach: 'Everything is connected. Find the perfect shot.',
    start: [0, 2.4, 0.6], floor: { w: 10, d: 22, cz: -7.5 }, power: [0.05, 0.6], camera: { pitch: 38 },
    objects: [
      { t: 'platform', at: [0, 0, 0.3], size: [3, 2.4, 2.6], look: 'stage' },
      ramp(0, -1.0, 2.4, -5.6, 0, 3),
      { t: 'glass', at: [0, 0, -6.6], size: [2.4, 1.4, 0.08] },
      ...pinTriangle(0, -7.6, 3),
      ...branch(-1), ...branch(1),
      ...left.specs, ...right.specs,
      ...rowX('barrel', -3.45, -2.55, 2, left.topY, -11.78, { mass: 1.6 }),
      ...rowX('pin', -3.4, -2.6, 3, left.topY, -11.28),
      ...rowX('pin', 2.55, 3.45, 3, right.topY, -11.7),
      ...rowX('pin', 2.6, 3.4, 2, right.topY, -11.28),
      { t: 'glass', at: [0, 0, -10.2], size: [1.8, 1.2, 0.08] },
      ...pinTriangle(0, -10.9, 4),
      { t: 'goldPin', at: [0, 0, -13.2] },
      { t: 'wall', at: [-4.85, 0, -9], size: [0.3, 1, 11], look: 'rail' },
      { t: 'wall', at: [4.85, 0, -9], size: [0.3, 1, 11], look: 'rail' },
      backstop(-14.8, 10),
    ],
  });
}

export const LEVELS = L;
export const getLevel = (id) => L.find((l) => l.id === id);
