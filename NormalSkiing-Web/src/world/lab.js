// SKI FEEL LAB: ten stations in one short run, for tuning the core mechanic.

import { World, SURF, bump, channel, xMask, kicker, reprofile } from './world.js';
import { mulberry32, smoothstep } from '../sim/math.js';

export const LAB_STATIONS = [
  { z: 10, name: '1. Open slope', tip: 'Let it run. A/D carve, W tuck, S brake.' },
  { z: 150, name: '2. Turns', tip: 'Carve around the tree islands. Mouse X adds edge.' },
  { z: 312, name: '3. Rollers', tip: 'Mouse back to soak up the crests, forward into the backsides.' },
  { z: 395, name: '4. Small lip', tip: 'Crouch on the approach. Flick forward a beat before the lip so the push ends as the snow drops away.' },
  { z: 520, name: '5. Big lip', tip: 'Same rhythm with speed. Bend the knees (mouse back a bit) before landing.' },
  { z: 720, name: '6. Ledge drop', tip: 'Off the shelf onto the steep. Nose down (mouse forward) to match it.' },
  { z: 845, name: '7. Ice', tip: 'Small inputs. Big steering just slides.' },
  { z: 915, name: '8. Tree gap', tip: 'Pick a gap. The narrow one is the straight line.' },
  { z: 1010, name: '9. Ravine', tip: 'Commit. Short = the bottom of the ravine.' },
  { z: 1135, name: '10. Camber kicker', tip: 'Launches you tilted. Fix it with mouse X, save the landing.' },
];

export function makeLab() {
  const rnd = mulberry32(7);
  const features = [];
  const surfaces = [];
  const trees = [];

  const center = (z) => {
    if (z < 150 || z > 300) return 0;
    return 14 * Math.sin(((z - 150) / 150) * Math.PI * 2);
  };

  // 3. rollers
  for (let i = 0; i < 4; i++) features.push(bump(0, 325 + i * 15, 40, 6, 1.0));
  // 4. small lip
  features.push(kicker(430, -24, 24, { ramp: 7, height: 0.35, kick: 4, knuckle: 4, landAngle: 9, landLen: 24, recover: 15, runout: 45 }));
  // 5. big lip: steeper kick, long landing hill; overshoot = flat bottom
  features.push(kicker(560, -26, 26, { ramp: 12, height: 0.45, kick: 3, knuckle: 14, landAngle: 16, landLen: 45, recover: 26, runout: 50 }));
  // 6. ledge: flat shelf, 5 m near-vertical drop, steep landing
  features.push(reprofile(725, -40, 40, [[26, 0.2, 0.2], [2, 0.2, 0], [30, -0.45, -0.45], [14, -0.45, 0]], { steps: [[26.5, 5, 1.6]], runout: 40 }));
  // 7. ice
  surfaces.push({ zMin: 850, zMax: 945, test: (x, z) => (z > 855 && z < 940 ? SURF.ice : null) });
  // 8. tree wall with three gaps
  const gaps = [[-31, -25.5], [-3.2, -0.6], [15, 19.5]];
  for (let x = -46; x <= 46; x += 1.5) {
    if (gaps.some(([a, b]) => x > a - 0.5 && x < b + 0.5)) continue;
    trees.push({ x: x + (rnd() - 0.5) * 0.4, z: 960 + (rnd() - 0.5) * 3, r: 0.35, h: 9 + rnd() * 6 });
  }
  // 9. ravine with take-off lip; far side lower
  features.push(kicker(1050, -46, 46, { ramp: 10, height: 0.6, kick: 3, knuckle: 1, landAngle: 0, landLen: 1, recover: 1, runout: 1 }));
  features.push(channel(1063, -60, 60, () => 21, () => 14, { wall: 0.12, maxWidth: 24 }));
  features.push(reprofile(1073, -60, 60, [[3, 0, -0.35], [40, -0.35, -0.35], [14, -0.35, 0]], { runout: 60 }));
  // 10. camber kicker: lip higher on the -x side, rough landing
  features.push({
    zMin: 1150, zMax: 1200, xMin: -40, xMax: 40, apply(x, z, h) {
      const m = xMask(x, -22, 22, 6);
      const tilt = 1 + Math.max(-0.75, Math.min(0.75, -x * 0.04));
      const u = z - 1170;
      let d = 0;
      if (u > -16 && u <= 0) d = 1.2 * tilt * Math.pow((u + 16) / 16, 3);
      else if (u > 0 && u < 10) d = 1.2 * tilt * (1 - smoothstep(0, 6, u));
      return h + d * m;
    },
  });
  for (let i = 0; i < 6; i++) features.push(bump((rnd() - 0.5) * 30, 1195 + i * 9, 5, 4, 0.45));

  // trees: corridor edges and turn islands
  for (let z = -20; z < 1500; z += 4.5) {
    const c = center(z);
    for (const side of [-1, 1]) {
      const x = c + side * (40 + rnd() * 25);
      trees.push({ x, z: z + rnd() * 3, r: 0.4, h: 10 + rnd() * 8 });
    }
  }
  const islands = [[190, -6, 40], [240, -40, 6], [285, -4, 38]];
  for (const [z, a, b] of islands) {
    for (let x = a; x <= b; x += 2.4) {
      trees.push({ x: x + center(z) + (rnd() - 0.5), z: z + (rnd() - 0.5) * 5, r: 0.4, h: 8 + rnd() * 6 });
    }
  }

  const def = {
    name: 'Ski Feel Lab',
    length: 1450,
    startElevation: 900,
    startX: 0,
    startZ: 10,
    profile: [
      [0, 8], [40, 17], [300, 17], [390, 16], [520, 17], [640, 19], [700, 18], [790, 14],
      [910, 15], [1000, 16], [1130, 15], [1260, 12], [1320, 3], [1450, 1],
    ],
    corridor: { center, halfWidth: () => 48, ridge: 22, outerDrop: 60, dish: 2 },
    noiseAmp: 0.4,
    noiseScale: 0.03,
    features,
    surfaces,
    trees,
    checkpoints: LAB_STATIONS.map((s) => ({ x: 0, z: s.z, heading: 0, name: s.name })),
    regions: LAB_STATIONS.map((s) => ({ z: s.z, name: s.name, tip: s.tip })),
    failZones: [
      { name: 'Ravine', test: (x, y, z, w) => z > 1052 && z < 1074 && y < w.baseHeight(1050) - 10, respawn: 8, kind: 'major' },
    ],
    finishZ: 1330,
  };
  return new World(def);
}
