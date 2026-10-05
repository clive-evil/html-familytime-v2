// THE MOUNTAIN: one continuous descent through eight invisible regions.
//
//  A Summit        0 - 720     open snow, wind lip, cornice over a side bowl
//  B Treeline    720 - 1720    lanes through trees, logs, falling tree, frozen stream, rock lip
//  C Cliff Road 1720 - 2760    switchback road benches cut into a 30deg face, cliff bands
//  D Village    2760 - 3520    street, chalets with skiable roofs, cars, fences, cable car
//  E Bridge     3520 - 3960    gorge, collapsing plank bridge, side snow ramp
//  F Ice Field  3960 - 4680    frozen lake, fragile ice, frozen waterfall lip
//  G Avalanche  4680 - 6280    big bowl; triggering slab chases you down
//  H Final      6280 - 8150    fastest slope, huge natural ramp, canyon gap, valley lodge

import {
  World, SURF, kicker, reprofile, bump, channel, xMask, buildingProp, boxProp, logProp,
} from './world.js';
import {
  BridgeCollapse, Avalanche, IceField, Cornice, FallingTree, MovingBox, Rockfall, CableCar,
} from './events.js';
import { mulberry32, smoothstep, lerp, clamp, fbm } from '../sim/math.js';

export const REGIONS = [
  { z: 0, name: 'Summit', tip: 'Everything below you is the route. The orange light is the bottom.' },
  { z: 720, name: 'Treeline', tip: '' },
  { z: 1720, name: 'Cliff Road', tip: '' },
  { z: 2760, name: 'Abandoned Village', tip: '' },
  { z: 3520, name: 'Broken Bridge', tip: '' },
  { z: 3960, name: 'Ice Field', tip: '' },
  { z: 4680, name: 'Avalanche Bowl', tip: '' },
  { z: 6280, name: 'Final Descent', tip: '' },
];

const LENGTH = 8150;

export function makeMountain() {
  const rnd = mulberry32(2024);
  const features = [];
  const surfaces = [];
  const trees = [];
  const decor = [];

  // corridor centre: gentle meanders, straightened at the set pieces
  const center = (z) => {
    let c = 55 * Math.sin(z / 620) + 22 * Math.sin(z / 210 + 1.3);
    // straight sections: bridge, canyon
    const calm = Math.max(1 - smoothstep(0, 140, Math.abs(z - 3740)), 1 - smoothstep(0, 220, Math.abs(z - 7390)));
    return c * (1 - calm) + (55 * Math.sin(z / 620)) * calm;
  };
  const halfWidth = (z) => {
    const pts = [[0, 150], [650, 130], [760, 85], [1700, 85], [1760, 125], [2740, 125], [2800, 95], [3500, 95],
      [3560, 120], [3960, 120], [4020, 150], [4660, 150], [4720, 145], [6250, 145], [6320, 110], [7300, 110], [7500, 120], [8150, 160]];
    for (let i = 1; i < pts.length; i++) {
      if (z <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], smoothstep(pts[i - 1][0], pts[i][0], z));
    }
    return 160;
  };
  const C = center;
  const profile = [
    [0, 9], [50, 13], [260, 17], [600, 20],
    [760, 21], [1300, 24], [1650, 22],
    [1740, 27], [2700, 30],
    [2790, 13], [3480, 13],
    [3560, 15], [3690, 7], [3790, 7], [3880, 15],
    [3990, 17], [4110, 3.5], [4560, 3], [4640, 12],
    [4740, 28], [6050, 30], [6230, 17],
    [6330, 20], [6800, 31], [7300, 30], [7412, 30], [7440, 44], [7560, 44], [7650, 28], [7800, 20], [7960, 6], [8150, 2],
  ];

  // =============================================================== A SUMMIT
  // start platform
  features.push(reprofile(-60, -200, 200, [[70, 0.04, 0.04]], { runout: 40 }));
  // wind lip across the slope
  features.push(kicker(330, C(330) - 45, C(330) + 45, { ramp: 7, height: 0.4, kick: 4, knuckle: 4, landAngle: 10, landLen: 24, recover: 14, runout: 40 }));
  // rollers
  for (let i = 0; i < 6; i++) features.push(bump(C(420 + i * 22) + (rnd() - 0.5) * 50, 420 + i * 22, 22, 8, 1.2));
  // the side bowl (left) below a ridge: medium-failure trap that rejoins later
  const bowlX = (z) => C(z) - 95;
  features.push({
    kind: 'bowl', zMin: 420, zMax: 760, xMin: -400, xMax: 400,
    apply(x, z, h) {
      const bx = bowlX(z);
      const m = smoothstep(bx + 32, bx + 26, x) * smoothstep(bx - 60, bx - 40, x);
      const along = smoothstep(430, 470, z) * (1 - smoothstep(640, 740, z));
      return h - 14 * m * along;
    },
  });
  // ridge edge before the bowl: a raised berm you can ski along
  features.push({
    kind: 'ridge', zMin: 430, zMax: 700, xMin: -400, xMax: 400,
    apply(x, z, h) {
      const bx = bowlX(z) + 34;
      const d = (x - bx) / 7;
      if (d < -1.4 || d > 1.4) return h;
      const along = smoothstep(440, 480, z) * (1 - smoothstep(620, 690, z));
      return h + 2.2 * Math.max(0, 1 - d * d) * along;
    },
  });
  // lift line on the right
  for (let z = 40; z < 700; z += 85) {
    const x = C(z) + 70;
    decor.push({ kind: 'tower', x, z, h: 13 });
    trees.push({ x, z, r: 0.5, h: 13, kind: 'pole' });
  }
  decor.push({ kind: 'sign', x: C(30) - 8, z: 30, text: 'NORMAL SKIING', text2: "it's all downhill from here" });
  decor.push({ kind: 'flag', x: C(20) + 10, z: 20, color: 0xff3b1f, h: 7 });
  decor.push({ kind: 'flag', x: C(20) - 12, z: 24, color: 0x1e4fd8, h: 6 });

  // ============================================================= B TREELINE
  // lanes: two open lines weave through the forest
  const laneA = (z) => C(z) + 28 * Math.sin(z / 95);
  const laneB = (z) => C(z) - 30 + 18 * Math.sin(z / 70 + 2);
  for (let z = 740; z < 1700; z += 2.6) {
    const hw = halfWidth(z);
    for (let k = 0; k < 3; k++) {
      const x = C(z) + (rnd() * 2 - 1) * hw * 0.92;
      const dA = Math.abs(x - laneA(z));
      const dB = Math.abs(x - laneB(z));
      const dens = 0.35 + 0.35 * smoothstep(760, 1100, z);
      if (dA < 9 || dB < 6.5) continue;
      if (rnd() > dens) continue;
      trees.push({ x, z: z + rnd() * 2, r: 0.38, h: 9 + rnd() * 9 });
    }
  }
  // moguls / natural bumps
  for (let i = 0; i < 40; i++) {
    const z = 760 + rnd() * 900;
    features.push(bump(C(z) + (rnd() - 0.5) * 120, z, 4 + rnd() * 4, 3 + rnd() * 3, 0.5 + rnd() * 0.7));
  }
  // fallen logs across the lanes (ollie them or go round)
  const logs = [];
  for (const [z, lane, len] of [[930, laneA, 7], [1080, laneB, 6], [1350, laneA, 8], [1520, laneB, 6]]) {
    const x = lane(z);
    logs.push({ x, z, len });
  }
  // frozen stream gully across the slope
  features.push(channel(1460, -400, 400, () => 9, () => 2.4, { wall: 0.45, maxWidth: 6 }));
  surfaces.push({ zMin: 1450, zMax: 1470, test: (x, z) => (Math.abs(z - 1460) < 2.2 ? SURF.ice : null) });
  // a small lip on the uphill bank of the stream
  features.push(kicker(1452, -400, 400, { ramp: 6, height: 0.35, kick: 3, knuckle: 0.5, landAngle: 0, landLen: 0.5, recover: 0.5, runout: 0.5 }));
  // rock lip: 4 m rock step across most of the slope, ramp-around on the right
  features.push(reprofile(1600, -400, 400, [[14, 0.12, 0.12], [1, 0.1, 0], [30, -0.32, -0.32], [12, -0.32, 0]], {
    steps: [[14.5, 4, 1.2]], runout: 50,
    mask: (x, z, soft) => 1 - smoothstep(C(z) + 25, C(z) + 25 + soft, x),
  }));
  surfaces.push({ zMin: 1612, zMax: 1618, test: (x, z) => (z > 1613 && z < 1616.5 && x < C(z) + 30 ? SURF.rock : null) });

  // ============================================================ C CLIFF ROAD
  // switchback legs across a 30deg face
  const road = [];
  const legZ = [1790, 1860, 1960, 2040, 2150, 2230, 2340, 2420, 2530, 2610, 2700];
  for (let i = 0; i < legZ.length; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    road.push({ x: C(legZ[i]) + side * 95, z: legZ[i] });
  }
  const roadHW = 5;
  const roadFeat = {
    kind: 'road', zMin: 1760, zMax: 2730, xMin: -500, xMax: 500, tab: null,
    apply(x, z, h, world) {
      // nearest segment
      let best = 1e9;
      let bs = 0;
      let bi = -1;
      let sd = 0;
      for (let i = 0; i < road.length - 1; i++) {
        const a = road[i];
        const b = road[i + 1];
        const ax = b.x - a.x;
        const az = b.z - a.z;
        const L2 = ax * ax + az * az;
        let t = ((x - a.x) * ax + (z - a.z) * az) / L2;
        t = clamp(t, 0, 1);
        const px = a.x + ax * t;
        const pz = a.z + az * t;
        const d = Math.hypot(x - px, z - pz);
        if (d < best) {
          best = d;
          bs = t;
          bi = i;
          sd = z - pz; // + = downhill side
        }
      }
      // hairpin turnaround pads
      for (let i = 1; i < road.length - 1; i++) {
        const v = road[i];
        const dv = Math.hypot(x - v.x, z - v.z);
        if (dv < 15) {
          const Ev = world.baseHeight(v.z) + (world.def.corridor.dish || 3) * Math.pow((v.x - C(v.z)) / halfWidth(v.z), 2) + 0.3;
          const pad = Ev - (z - v.z) * 0.14; // tilted so you roll through
          if (dv < 10) return pad;
          h = lerp(pad, h, smoothstep(10, 15, dv));
        }
      }
      if (best > 30) return h;
      const a = road[bi];
      const b = road[bi + 1];
      const pz = a.z + (b.z - a.z) * bs;
      const px = a.x + (b.x - a.x) * bs;
      const E = world.baseHeight(pz) + (world.def.corridor.dish || 3) * Math.pow((px - C(pz)) / halfWidth(pz), 2) + 0.3;
      if (best <= roadHW) return E;
      const u = best - roadHW;
      if (sd < 0) {
        // uphill: cut bank
        const cut = E + (h - E) * smoothstep(0, 3.5, u);
        return h > E ? cut : Math.max(h, E - u * 1.2);
      }
      // downhill: berm (missing in places = no guard rail) then fill slope
      const bermOn = world.def.bermMask(px, bi);
      const berm = bermOn * 1.1 * Math.max(0, 1 - Math.pow((u - 0.9) / 0.9, 2));
      const fill = E - Math.max(0, u - 1.8) * 1.1;
      return Math.max(h, fill + berm);
    },
  };
  surfaces.push({
    zMin: 1760, zMax: 2730, test(x, z, h, world) {
      for (let i = 0; i < road.length - 1; i++) {
        const a = road[i];
        const b = road[i + 1];
        const ax = b.x - a.x;
        const az = b.z - a.z;
        const t = clamp(((x - a.x) * ax + (z - a.z) * az) / (ax * ax + az * az), 0, 1);
        if (Math.hypot(x - (a.x + ax * t), z - (a.z + az * t)) < roadHW + 0.3) return SURF.road;
      }
      return null;
    },
  });
  // cliff bands between the legs (rock steps in places), leaving gaps
  const legZAt = (i, x) => {
    const a = road[i];
    const b = road[i + 1];
    const t = clamp((x - a.x) / (b.x - a.x), 0, 1);
    return a.z + (b.z - a.z) * t;
  };
  for (let i = 0; i < road.length - 2; i++) {
    const gaps = [[-60 + ((i * 37) % 50), -40 + ((i * 37) % 50)], [20 + ((i * 23) % 40), 32 + ((i * 23) % 40)]];
    const drop = 7 + (i % 3) * 3;
    features.push({
      kind: 'cliffband', zMin: Math.min(road[i].z, road[i + 1].z) - 5, zMax: Math.max(road[i + 1].z, road[i + 2].z) + 5, xMin: -500, xMax: 500,
      apply(x, z, h) {
        const zm = (legZAt(i, x) + legZAt(i + 1, x)) / 2;
        const u = z - zm;
        if (Math.abs(u) > 24) return h;
        const rel = x - C(zm);
        let m = xMask(rel, -85, 85, 8);
        for (const [g0, g1] of gaps) m *= 1 - xMask(rel, g0, g1, 3);
        if (m <= 0) return h;
        const win = 1 - smoothstep(12, 24, Math.abs(u));
        return h + drop * (0.5 - smoothstep(-1.2, 1.2, u)) * win * m;
      },
    });
  }
  features.push(roadFeat);
  // rocks and dead trees on the face
  for (let i = 0; i < 60; i++) {
    const z = 1780 + rnd() * 930;
    trees.push({ x: C(z) + (rnd() - 0.5) * 220, z, r: 0.35, h: 6 + rnd() * 6 });
  }

  // ============================================================== D VILLAGE
  // main street down the fall line + two cross streets
  const streetHW = 6;
  features.push({
    kind: 'street', zMin: 2790, zMax: 3480, xMin: -500, xMax: 500,
    apply(x, z, h, world) {
      const d = Math.abs(x - C(z));
      if (d > streetHW + 4) return h;
      const E = world.baseHeight(z) + 0.2 + (world.def.corridor.dish || 3) * Math.pow((x - C(z)) / halfWidth(z), 2);
      const fade = smoothstep(2790, 2830, z) * (1 - smoothstep(3440, 3480, z));
      return lerp(h, lerp(E, h, smoothstep(streetHW, streetHW + 4, d)), fade);
    },
  });
  for (const zc of [3020, 3265]) {
    features.push({
      kind: 'xstreet', zMin: zc - 12, zMax: zc + 12, xMin: -500, xMax: 500,
      apply(x, z, h, world) {
        const d = Math.abs(z - zc);
        if (d > 11) return h;
        const E = world.baseHeight(zc) + 0.2 + (world.def.corridor.dish || 3) * Math.pow((x - C(zc)) / halfWidth(zc), 2);
        return lerp(E, h, smoothstep(5.5, 11, d));
      },
    });
  }
  surfaces.push({
    zMin: 2790, zMax: 3480, test: (x, z) => (Math.abs(x - C(z)) < streetHW || Math.abs(z - 3020) < 5.5 || Math.abs(z - 3265) < 5.5 ? SURF.road : null),
  });

  // ================================================================ E BRIDGE
  const gorgeZ = 3740;
  const bridgeX = C(gorgeZ);
  const gorgeW = (x) => {
    const r = x - bridgeX;
    if (r < -40) return lerp(44, 22, smoothstep(-40, -60, r));
    return lerp(44, 56, smoothstep(10, 60, r));
  };
  features.push(channel(gorgeZ, bridgeX - 200, bridgeX + 200, gorgeW, () => 48, { wall: 0.1, maxWidth: 32 }));
  // far side lower, steep landing
  features.push(reprofile(gorgeZ + 10, bridgeX - 200, bridgeX + 200, [[30, -0.25, -0.25], [20, -0.25, 0]], { runout: 80 }));
  // natural snow ramp on the left where the gorge narrows
  features.push(kicker(gorgeZ - 12, bridgeX - 72, bridgeX - 50, { ramp: 14, height: 1.4, kick: 3, knuckle: 1, landAngle: 0, landLen: 1, recover: 1, runout: 1 }, 4));
  // approach road to the bridge
  features.push({
    kind: 'bridgeroad', zMin: 3540, zMax: gorgeZ, xMin: -500, xMax: 500,
    apply(x, z, h, world) {
      const d = Math.abs(x - bridgeX);
      if (d > 9) return h;
      const fade = smoothstep(3540, 3580, z);
      const E = world.baseHeight(z) + 0.2 + (world.def.corridor.dish || 3) * Math.pow((x - C(z)) / halfWidth(z), 2);
      return lerp(h, lerp(E, h, smoothstep(4, 9, d)), fade);
    },
  });

  // ============================================================== F ICE FIELD
  const lake = { x: C(4320), z: 4320, rx: 125, rz: 230 };
  const inLake = (x, z) => Math.pow((x - lake.x) / lake.rx, 2) + Math.pow((z - lake.z) / lake.rz, 2);
  features.push({
    kind: 'lake', zMin: lake.z - lake.rz * 1.5 - 5, zMax: lake.z + lake.rz * 1.5 + 5, xMin: -600, xMax: 600,
    apply(x, z, h, world) {
      const e = inLake(x, z);
      if (e > 2.2) return h;
      // lake surface: a smooth plane following the valley floor, 1.2 m sunk
      const y = world.baseHeight(z) - 1.2 + (world.def.corridor.dish || 3) * Math.pow((x - C(z)) / halfWidth(z), 2) * 0.3;
      if (e < 1) return y;
      return lerp(y, Math.max(h, y), smoothstep(1, 2.2, e));
    },
  });
  const snowIslands = [[lake.x - 40, 4210, 14], [lake.x + 50, 4330, 18], [lake.x - 20, 4450, 12]];
  surfaces.push({
    zMin: lake.z - lake.rz, zMax: lake.z + lake.rz, test(x, z, h, world) {
      if (inLake(x, z) > 1) return null;
      const ev = world.iceEvent;
      if (ev) {
        const c = ev.cellAt(x, z);
        if (c && c.broken) return SURF.water;
      }
      for (const [ix, iz, r] of snowIslands) if (Math.hypot(x - ix, z - iz) < r) return SURF.snow;
      return SURF.ice;
    },
  });
  // frozen waterfall lip at the outlet
  features.push(kicker(4600, C(4600) - 40, C(4600) + 40, { ramp: 10, height: 0.6, kick: 3, knuckle: 3, landAngle: 22, landLen: 30, recover: 18, runout: 60 }));
  surfaces.push({ zMin: 4550, zMax: 4605, test: (x, z) => (Math.abs(x - C(z)) < 40 ? SURF.ice : null) });

  // ============================================================ G AVALANCHE
  // old debris lumps
  for (let i = 0; i < 30; i++) {
    const z = 4800 + rnd() * 1300;
    features.push(bump(C(z) + (rnd() - 0.5) * 200, z, 10 + rnd() * 8, 9 + rnd() * 8, 0.6 + rnd() * 0.8));
  }
  // rock outcrop (shelter) on the right
  const rockX = (z) => C(z) + 55;
  features.push(bump(rockX(5350), 5350, 16, 14, 14));
  surfaces.push({ zMin: 5336, zMax: 5364, test: (x, z) => (Math.hypot((x - rockX(5350)) / 16, (z - 5350) / 14) < 0.85 ? SURF.rock : null) });
  // high spine on the left
  const spineX = (z) => C(z) - 92;
  features.push({
    kind: 'spine', zMin: 5480, zMax: 5960, xMin: -600, xMax: 600,
    apply(x, z, h) {
      const d = (x - spineX(z)) / 10;
      if (Math.abs(d) > 1.6) return h;
      const along = smoothstep(5490, 5560, z) * (1 - smoothstep(5880, 5950, z));
      return h + 13 * Math.max(0, 1 - d * d * 0.6) * along;
    },
  });
  // cliff band in the middle: the direct line
  features.push(reprofile(5600, -600, 600, [[40, 0.28, 0.28], [1, 0.2, 0], [26, -0.3, -0.3], [16, -0.3, 0]], {
    steps: [[41, 12, 1.5]], runout: 70, mask: (x, z, soft) => xMask(x - C(z), -30, 30, soft),
  }));
  // sparse trees lower in the bowl
  for (let i = 0; i < 120; i++) {
    const z = 5800 + rnd() * 450;
    trees.push({ x: C(z) + (rnd() - 0.5) * 250, z, r: 0.4, h: 8 + rnd() * 8 });
  }

  // ================================================================ H FINAL
  for (let i = 0; i < 10; i++) features.push(bump(C(6700 + i * 55) + (rnd() - 0.5) * 60, 6700 + i * 55, 30, 12, 1.6));
  // the huge natural ramp
  const canyonZ = 7395;
  const rampZ = 7362;
  features.push(kicker(rampZ, C(rampZ) - 45, C(rampZ) + 40, { ramp: 26, height: 2.4, kick: 3, knuckle: 1, landAngle: 0, landLen: 1, recover: 1, runout: 1 }, 8));
  // canyon (with a snow bridge far right = the slow safe line)
  const snowBridge = (z) => C(z) + 78;
  features.push({
    ...channel(canyonZ, -800, 800, () => 52, () => 70, { wall: 0.08, maxWidth: 36 }),
    apply(x, z, h) {
      const m = 1 - smoothstep(snowBridge(z) - 22, snowBridge(z) - 12, x);
      if (m <= 0) return h;
      const u = Math.abs(z - canyonZ);
      if (u >= 26) return h;
      const cut = 70 * smoothstep(26, 26 * 0.92, u);
      return h - cut * m;
    },
  });
  // landing hill beyond the canyon: lower and steep, then the valley
  // far rim: a short drop-off; the steep landing hill is in the base profile
  features.push(reprofile(canyonZ + 26, -800, 800, [[4, 0, 0]], {
    steps: [[0.5, 4, 1.5]], runout: 40, mask: (x, z, soft) => 1 - smoothstep(snowBridge(z) - 28 - soft, snowBridge(z) - 28, x),
  }));
  // safe line: right-hand gully with trees & powder
  surfaces.push({ zMin: 7200, zMax: 7480, test: (x, z) => (x > snowBridge(z) - 18 ? SURF.powder : null) });
  for (let z = 7150; z < 7500; z += 3) {
    const x = snowBridge(z) + (rnd() - 0.5) * 30;
    if (Math.abs(x - snowBridge(z)) < 5) continue;
    if (rnd() < 0.5) trees.push({ x, z, r: 0.4, h: 9 + rnd() * 6 });
  }
  // valley trees and finish
  for (let i = 0; i < 160; i++) {
    const z = 7600 + rnd() * 500;
    const x = C(z) + (rnd() < 0.5 ? -1 : 1) * (40 + rnd() * 100);
    trees.push({ x, z, r: 0.4, h: 10 + rnd() * 8 });
  }

  // ---------------------------------------------------------------- build
  const def = {
    name: 'The Mountain',
    length: LENGTH,
    startElevation: 3400,
    profile,
    corridor: { center, halfWidth, ridge: 34, outerDrop: 170, dish: 4 },
    noiseAmp: 1.3,
    noiseScale: 0.022,
    features,
    surfaces,
    trees,
    decor,
    finishZ: 8020,
    bermMask: (x, leg) => {
      // missing guard rails: berm gaps on some legs
      const r = x - C(legZ[leg]);
      if (leg % 3 === 1 && r > -20 && r < 30) return 0;
      if (leg % 4 === 2 && r > 40) return 0;
      return 1;
    },
    regions: REGIONS,
    checkpoints: [
      { z: 18, name: 'Summit' },
      { z: 735, name: 'Treeline' },
      { z: 1745, name: 'Cliff Road' },
      { z: 2775, name: 'Village' },
      { z: 3575, name: 'Bridge' },
      { z: 4010, name: 'Ice Field' },
      { z: 4690, name: 'Avalanche' },
      { z: 6300, name: 'Final Descent' },
    ],
    failZones: [],
  };
  const world = new World(def);
  world.treeLine = world.baseHeight(900);
  for (const cp of world.checkpoints) {
    if (cp.x === undefined) cp.x = cp.name === 'Bridge' ? bridgeX : C(cp.z);
  }
  // cliff-road checkpoint: start on the first road leg
  world.checkpoints[2].x = road[0].x + 20;
  world.checkpoints[2].z = road[0].z + ((road[1].z - road[0].z) * 20) / Math.abs(road[1].x - road[0].x) + 0;
  world.checkpoints[2].heading = Math.atan2(road[1].x - road[0].x, road[1].z - road[0].z) * 0.6;

  // logs
  for (const lg of logs) {
    const ya = world.terrain(lg.x - lg.len / 2, lg.z);
    const yb = world.terrain(lg.x + lg.len / 2, lg.z + 1);
    world.addProp(logProp({ x: lg.x - lg.len / 2, y: ya + 0.25, z: lg.z }, { x: lg.x + lg.len / 2, y: yb + 0.25, z: lg.z + 1 }, 0.38));
  }

  // falling tree across lane A
  const ftZ = 1245;
  world.addEvent(new FallingTree(world, { x: laneA(ftZ) + 9, z: ftZ, dirX: -1, dirZ: 0.35, length: 17, trigger: 1185, restAngle: 0.13 }));

  // cornice on the ridge edge above the bowl
  const cz0 = 500;
  world.addEvent(new Cornice(world, { x0: bowlX(560) + 27, x1: bowlX(560) + 33, z0: cz0, z1: 640, height: 1.6 }));

  // village: chalets on both sides of the main street, rows between cross streets
  const vrnd = mulberry32(77);
  const roofCols = [0xf4f7fb, 0xf4f7fb, 0xe9eef3];
  const wallCols = [0x8a4b2a, 0x7a5a3a, 0xa0522d, 0x5d6d7e, 0x9c6b3f];
  const buildingRows = [2840, 2880, 2925, 2965, 3070, 3110, 3150, 3195, 3310, 3350];
  for (const zc of buildingRows) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const w = 9 + vrnd() * 4;
        const d = 8 + vrnd() * 2;
        const x = C(zc) + side * (streetHW + 3 + w / 2 + k * (w + 3.2 + vrnd() * 3));
        if (Math.abs(x - C(zc)) > halfWidth(zc) * 0.8) continue;
        const baseY = Math.min(world.terrain(x - w / 2, zc + d / 2), world.terrain(x + w / 2, zc + d / 2)) - 0.3;
        const b = buildingProp(x, zc, w, d, baseY, 3.6 + vrnd() * 1.4, 2.6 + vrnd() * 1.0, {
          color: wallCols[Math.floor(vrnd() * wallCols.length)], roofColor: roofCols[k % 3],
        });
        world.addProp(b);
        // snow drift against the uphill wall on some = a ramp onto the roof
        if ((k + Math.round(zc)) % 2 === 0) {
          const eave = baseY + b.wallH;
          const zUp = zc - d / 2 - 0.6;
          world.addFeature({
            kind: 'drift', zMin: zUp - 14, zMax: zUp + 0.6, xMin: x - w / 2 - 2, xMax: x + w / 2 + 2,
            apply(px, pz, h) {
              const m = xMask(px, x - w / 2 + 0.6, x + w / 2 - 0.6, 1.5);
              if (m <= 0) return h;
              const t = smoothstep(zUp - 13, zUp, pz);
              const target = eave + 0.1;
              return Math.max(h, lerp(h, target, t * t) * m + h * (1 - m));
            },
          });
        }
      }
    }
  }
  // the lodge at the bottom of the village
  const lodgeZ = 3420;
  const lodgeX = C(lodgeZ) + 30;
  {
    const baseY = world.terrain(lodgeX, lodgeZ + 9) - 0.3;
    world.addProp(buildingProp(lodgeX, lodgeZ, 30, 16, baseY, 6, 5, { color: 0x6b3a1f }));
  }
  // parked cars along the streets
  for (let i = 0; i < 14; i++) {
    const z = 2820 + vrnd() * 620;
    if (Math.abs(z - 3020) < 8 || Math.abs(z - 3265) < 8) continue;
    const x = C(z) + (vrnd() < 0.5 ? -1 : 1) * (streetHW - 1.4);
    const y = world.terrain(x, z);
    world.addProp(boxProp(x, z, 1.9, 4.3, y - 0.1, 1.45, { color: [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x7f8c8d][i % 5], visual: 'car', roundTop: true, surf: SURF.metal }));
  }
  // fences along plots on the cross streets
  for (const zc of [3020, 3265]) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const x = C(zc) + side * (16 + k * 9);
        const z = zc - 7.5;
        const y = world.terrain(x, z);
        world.addProp(boxProp(x, z, 7.5, 0.3, y - 0.2, 1.2, { color: 0x6b4a2c, surf: SURF.wood, visual: 'fence' }));
      }
    }
  }
  // lift towers through the village
  for (let z = 2830; z < 3450; z += 90) {
    const x = C(z) - 45;
    decor.push({ kind: 'tower', x, z, h: 14 });
    world.addTree({ x, z, r: 0.5, h: 14, kind: 'pole' });
  }
  // cable car over the village: high cable across the slope
  const ccz = 3150;
  const ccA = { x: C(ccz) - 110, y: world.terrain(C(ccz) - 110, ccz) + 26, z: ccz };
  const ccB = { x: C(ccz) + 110, y: world.terrain(C(ccz) + 110, ccz) + 26, z: ccz + 6 };
  world.addEvent(new CableCar(world, { a: ccA, b: ccB, period: 14 }));
  decor.push({ kind: 'cable', points: [ccA, { x: (ccA.x + ccB.x) / 2, y: (ccA.y + ccB.y) / 2 - 4, z: (ccA.z + ccB.z) / 2 }, ccB] });

  // snowplough on one road leg, rockfall across another
  const pl = 4;
  world.addEvent(new MovingBox(world, {
    path: [{ x: lerp(road[pl].x, road[pl + 1].x, 0.15), z: lerp(road[pl].z, road[pl + 1].z, 0.15) },
      { x: lerp(road[pl].x, road[pl + 1].x, 0.85), z: lerp(road[pl].z, road[pl + 1].z, 0.85) }],
    w: 2.6, d: 5.5, h: 2.6, speed: 6, color: 0xf2a516,
  }));
  world.addEvent(new Rockfall(world, { x0: C(2300) - 60, x1: C(2300) + 60, zStart: 2260, zEnd: 2460, period: 2.6 }));

  // bridge deck
  {
    const z0 = gorgeZ - 26;
    const z1 = gorgeZ + 26;
    const y0 = world.terrain(bridgeX, z0 - 3) - 0.05;
    const y1 = world.terrain(bridgeX, z1 + 3) + 0.4;
    const br = new BridgeCollapse(world, { x: bridgeX, z0, z1, width: 7, y0, y1, arch: 1.4, seg: 4 });
    world.addEvent(br);
    world.bridge = br;
  }
  // ice field cells (fragile band + the tempting diagonal)
  {
    const size = 6;
    const cells = [];
    for (let z = 4140; z < 4500; z += size) {
      for (let x = lake.x - lake.rx; x < lake.x + lake.rx; x += size) {
        const cx = x + size / 2;
        const cz = z + size / 2;
        if (inLake(cx, cz) > 0.85) continue;
        const band = Math.abs(cz - 4300) < 45;
        const diag = Math.abs((cx - lake.x) + (cz - 4320) * 0.45) < 14;
        if (band || diag) cells.push([Math.floor(cx / size) * size + 0.001, Math.floor(cz / size) * size + 0.001]);
      }
    }
    const ice = new IceField(world, { cells, size, waterY: 0 });
    world.addEvent(ice);
    world.iceEvent = ice;
    world.addFeature({
      kind: 'iceholes', zMin: 4130, zMax: 4510, xMin: -600, xMax: 600,
      apply(x, z, h) {
        const c = ice.cellAt(x, z);
        return c && c.broken ? h - 2.6 : h;
      },
    });
  }
  // avalanche
  {
    const av = new Avalanche(world, {
      trigger: 4745, crackZ: 4640, stopZ: 6330, speed: 25,
      safe: [
        { test: (x, y, z) => Math.abs(x - rockX(5350)) < 13 && z > 5352 && z < 5395 },
        { test: (x, y, z, w) => Math.abs(x - spineX(z)) < 5 && z > 5540 && z < 5900 && y > w.baseHeight(z) + 8 },
      ],
    });
    av.respawn = 6;
    world.addEvent(av);
    world.avalanche = av;
    world.addSurface({
      zMin: 4640, zMax: 6340, test: (x, z) => (av.state === 'running' || av.state === 'stopped') && z < av.front - 4 ? SURF.debris : null,
    });
  }
  // finish lodge + beacon
  {
    const fz = 8080;
    const fx = C(fz) + 10;
    const baseY = world.terrain(fx, fz + 10) - 0.4;
    world.addProp(buildingProp(fx, fz, 26, 18, baseY, 6, 5, { color: 0xb5401f }));
    decor.push({ kind: 'finish', x: C(8020), z: 8020, span: 40 });
    decor.push({ kind: 'beacon', x: fx, z: fz });
    decor.push({ kind: 'sign', x: C(7990) + 24, z: 7990, text: 'VALLEY LODGE', text2: 'you made it', bg: '#ffffff' });
  }
  // summit hut
  {
    const hx = C(0) + 22;
    const baseY = world.terrain(hx, 4) - 0.3;
    world.addProp(buildingProp(hx, -2, 10, 8, baseY, 3.2, 2.4, { color: 0x6b3a1f }));
  }

  world.failZones = [
    { name: 'Gorge', title: 'INTO THE GORGE', kind: 'major', respawn: 4,
      test: (x, y, z, w) => z > gorgeZ - 24 && z < gorgeZ + 24 && y < w.baseHeight(gorgeZ) - 18 },
    { name: 'Ice', title: 'THROUGH THE ICE', kind: 'major', respawn: 5,
      test: (x, y, z, w) => z > 4130 && z < 4510 && w.iceEvent.cellAt(x, z)?.broken && y < w.terrain(x, z) + 1.2 },
    { name: 'Canyon', title: 'THE CANYON', kind: 'catastrophic', respawn: 7,
      test: (x, y, z, w) => z > canyonZ - 26 && z < canyonZ + 26 && y < w.baseHeight(canyonZ) - 25 },
  ];
  // preferred line for the autopilot (tests): the "safe-ish" route
  const roadX = (z) => {
    if (z <= road[0].z) return road[0].x;
    for (let i = 0; i < road.length - 1; i++) {
      if (z <= road[i + 1].z) return lerp(road[i].x, road[i + 1].x, (z - road[i].z) / (road[i + 1].z - road[i].z));
    }
    return road[road.length - 1].x;
  };
  world.botRoute = (z) => {
    if (z < 700) return C(z) + 10;
    if (z < 1720) return laneA(z);
    if (z < 1785) return lerp(laneA(z), road[0].x, smoothstep(1720, 1785, z));
    if (z < 2700) return roadX(z);
    if (z < 2790) return lerp(roadX(z), C(z), smoothstep(2700, 2790, z));
    if (z < 3530) return C(z);
    if (z < 3800) return bridgeX + 2.4;
    if (z > 5440 && z < 5900) return C(z) + 75 * smoothstep(5440, 5540, z) * (1 - smoothstep(5780, 5900, z));
    if (z > 6950 && z < 7520) return lerp(C(z), snowBridge(z), smoothstep(6950, 7120, z) * (1 - smoothstep(7460, 7520, z)));
    return C(z);
  };
  world.botSpeed = (z) => {
    if (z > 1720 && z < 2790) return 9;
    if (z > 3600 && z < 3800) return 12;
    if (z > 4100 && z < 4520) return 22;
    if (z > 4700 && z < 6300) return 34;
    if (z > 7100 && z < 7500) return 12;
    return 19;
  };
  world.road = road;
  world.lake = lake;
  world.canyonZ = canyonZ;
  world.rampZ = rampZ;
  world.gorgeZ = gorgeZ;
  world.bridgeX = bridgeX;
  return world;
}
