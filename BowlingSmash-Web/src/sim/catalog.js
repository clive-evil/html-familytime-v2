// Object catalog: every physical thing in the game is described here once.
// The simulation builds Rapier colliders from `parts`; the renderer builds
// meshes from the same description (plus a `look` key for nicer visuals), so
// what you see is what collides.
//
// Units: metres-ish. The world is roughly 2x real bowling scale so things read
// well on a phone screen. Body origin = centre of the object's bounding box.

// Real ten-pin profile (inches: height, radius) - used for pins of all sizes.
export const PIN_PROFILE = [
  [0, 0.0], [0, 1.0], [0.3, 1.25], [1.5, 1.85], [3, 2.25], [4.5, 2.38], [6, 2.25],
  [7.5, 1.88], [8.8, 1.25], [10, 0.9], [11, 0.95], [12.3, 1.2], [13.4, 1.27],
  [14.3, 1.05], [14.8, 0.6], [15, 0.0],
];
export const BOTTLE_PROFILE = [
  [0, 0], [0, 0.9], [0.05, 1], [0.55, 1], [0.68, 0.55], [0.78, 0.32], [0.98, 0.32], [1, 0.0],
];
export const VASE_PROFILE = [
  [0, 0], [0, 0.55], [0.1, 0.8], [0.4, 1.0], [0.7, 0.7], [0.85, 0.42], [0.95, 0.55], [1, 0.58], [1, 0],
];

/** Sample a profile [[y,r]...] into lathe points scaled to height h, maxR. */
export function profilePoints(profile, h, rScale, yNorm) {
  return profile.map(([y, r]) => [r * rScale, (y / yNorm) * h - h / 2]);
}

function latheHull(profile, h, rScale, yNorm, segs = 10) {
  const pts = [];
  for (const [r, y] of profilePoints(profile, h, rScale, yNorm)) {
    if (r === 0) { pts.push(0, y, 0); continue; }
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  return pts;
}

// Material presets: physics + sound family.
export const MATS = {
  pin: { friction: 0.85, restitution: 0.45, sound: 'pin' },
  wood: { friction: 0.6, restitution: 0.25, sound: 'wood' },
  card: { friction: 0.7, restitution: 0.15, sound: 'card' },
  metal: { friction: 0.4, restitution: 0.35, sound: 'metal' },
  can: { friction: 0.45, restitution: 0.3, sound: 'can' },
  glass: { friction: 0.3, restitution: 0.2, sound: 'glass' },
  stone: { friction: 0.75, restitution: 0.1, sound: 'stone' },
  plastic: { friction: 0.5, restitution: 0.4, sound: 'plastic' },
  ceramic: { friction: 0.55, restitution: 0.2, sound: 'ceramic' },
  rubber: { friction: 0.9, restitution: 0.95, sound: 'bumper' },
  floor: { friction: 0.55, restitution: 0.12, sound: 'floor' },
};

// helper to make pin variants
function pinDef(h, mass, look, extra = {}) {
  const rScale = (h / 15) * 1.0;
  return {
    mass, mat: 'pin', target: true, look, h,
    tilt: 50, drop: 0.3,
    parts: [{ shape: 'hull', points: latheHull(PIN_PROFILE, h, rScale, 15) }],
    lathe: { profile: PIN_PROFILE, h, rScale, yNorm: 15 },
    size: [rScale * 2.38 * 2, h, rScale * 2.38 * 2],
    ...extra,
  };
}

/**
 * Type definitions. `s` = optional spec (size overrides etc.).
 * Each returns: { parts, mass, mat, h, size:[w,h,d], target, look, ... }
 */
export const CATALOG = {
  pin: () => pinDef(0.76, 1.0, 'pin'),
  heavyPin: () => pinDef(0.76, 3.5, 'heavyPin'),
  lightPin: () => pinDef(0.76, 0.45, 'lightPin'),
  giantPin: (s) => pinDef(s.h || 3.2, s.mass || 40, 'giantPin', { tilt: 35 }),
  miniPin: () => pinDef(0.4, 0.35, 'miniPin'),
  goldPin: () => pinDef(0.76, 1.0, 'goldPin', { target: false, bonus: true }),

  crate: (s) => box(s.size || [0.6, 0.6, 0.6], s.mass || 3, 'wood', 'crate', { target: true, moveOut: 1.0 }),
  box: (s) => box(s.size || [0.5, 0.4, 0.5], s.mass || 0.9, 'card', 'box', { target: true, moveOut: 0.9 }),
  can: (s) => cyl(s.r || 0.11, s.h || 0.3, s.mass || 0.35, 'can', 'can', { target: true, tilt: 55, drop: 0.25, moveOut: 0.7 }),
  barrel: (s) => cyl(s.r || 0.3, s.h || 0.85, s.mass || 5, 'metal', 'barrel', { target: true, tilt: 45 }),
  bottle: (s) => {
    const h = s.h || 0.5, r = s.r || 0.1;
    return {
      mass: 0.45, mat: 'glass', look: 'bottle', h, target: true, tilt: 50, drop: 0.3,
      breakImpulse: 1.6, shardCount: 6,
      parts: [{ shape: 'hull', points: latheHull(BOTTLE_PROFILE, h, r, 1, 8) }],
      lathe: { profile: BOTTLE_PROFILE, h, rScale: r, yNorm: 1 }, size: [r * 2, h, r * 2],
    };
  },
  vase: (s) => {
    const h = s.h || 0.6, r = s.r || 0.2;
    return {
      mass: 1.2, mat: 'ceramic', look: 'vase', h, target: true, tilt: 45, drop: 0.3,
      breakImpulse: 2.2, shardCount: 8,
      parts: [{ shape: 'hull', points: latheHull(VASE_PROFILE, h, r, 1, 10) }],
      lathe: { profile: VASE_PROFILE, h, rScale: r, yNorm: 1 }, size: [r * 2, h, r * 2],
    };
  },
  cone: () => {
    const h = 0.7;
    return {
      mass: 0.9, mat: 'plastic', look: 'cone', h, target: true, tilt: 50, drop: 0.3,
      parts: [
        { shape: 'box', size: [0.46, 0.06, 0.46], off: [0, -h / 2 + 0.03, 0] },
        { shape: 'cone', r: 0.17, h: h - 0.06, off: [0, 0.03, 0] },
      ],
      size: [0.46, h, 0.46],
    };
  },
  gnome: () => {
    const h = 0.75;
    return {
      mass: 2.2, mat: 'ceramic', look: 'gnome', h, target: true, tilt: 50, drop: 0.3,
      parts: [
        { shape: 'cyl', r: 0.17, h: 0.36, off: [0, -h / 2 + 0.18, 0] },
        { shape: 'ball', r: 0.13, off: [0, -h / 2 + 0.44, 0] },
        { shape: 'cone', r: 0.15, h: 0.26, off: [0, h / 2 - 0.13, 0] },
      ],
      size: [0.34, h, 0.34],
    };
  },
  statue: () => {
    const h = 1.2;
    return {
      mass: 5, mat: 'stone', look: 'statue', h, target: true, tilt: 45, drop: 0.3,
      parts: [
        { shape: 'box', size: [0.44, 0.2, 0.44], off: [0, -h / 2 + 0.1, 0] },
        { shape: 'capsule', r: 0.14, h: 0.5, off: [0, -h / 2 + 0.6, 0] },
        { shape: 'ball', r: 0.16, off: [0, h / 2 - 0.16, 0] },
      ],
      size: [0.44, h, 0.44],
    };
  },
  chair: () => {
    const h = 1.15;
    return {
      mass: 6, mat: 'plastic', look: 'chair', h, target: true, tilt: 50, drop: 0.3, moveOut: 1.3,
      friction: 0.15, // rolling casters
      parts: [
        { shape: 'cyl', r: 0.32, h: 0.08, off: [0, -h / 2 + 0.04, 0] },
        { shape: 'cyl', r: 0.05, h: 0.38, off: [0, -h / 2 + 0.27, 0] },
        { shape: 'box', size: [0.56, 0.1, 0.54], off: [0, -h / 2 + 0.51, 0] },
        { shape: 'box', size: [0.52, 0.56, 0.08], off: [0, h / 2 - 0.28, 0.25] },
      ],
      size: [0.64, h, 0.64],
    };
  },
  dummy: () => {
    const h = 1.7;
    return {
      mass: 7, mat: 'plastic', look: 'dummy', h, target: true, tilt: 45, drop: 0.3,
      parts: [
        { shape: 'cyl', r: 0.24, h: 0.08, off: [0, -h / 2 + 0.04, 0] },
        { shape: 'capsule', r: 0.2, h: 0.8, off: [0, -h / 2 + 0.68, 0] },
        { shape: 'ball', r: 0.17, off: [0, h / 2 - 0.17, 0] },
      ],
      size: [0.48, h, 0.48],
    };
  },
  cabinet: (s) => box(s.size || [0.5, 1.1, 0.55], s.mass || 9, 'metal', 'cabinet', { target: false }),

  // Structural props (non-target unless spec says so).
  domino: (s) => box(s.size || [0.5, 0.9, 0.12], s.mass || 1.4, 'wood', 'domino', { target: false }),
  plank: (s) => box(s.size || [2, 0.12, 0.4], s.mass || 2, 'wood', 'plank', { target: false }),
  post: (s) => box(s.size || [0.18, 1, 0.18], s.mass || 1.2, 'wood', 'post', { target: false }),
  stone: (s) => box(s.size || [0.6, 0.4, 0.6], s.mass || 8, 'stone', 'stone', { target: false }),
  block: (s) => box(s.size || [0.6, 0.3, 0.3], s.mass || 1.5, 'wood', 'block', { target: false }),
  beam: (s) => box(s.size || [0.2, 0.2, 3], s.mass || 4, 'metal', 'beam', { target: false }),
  slab: (s) => box(s.size || [2, 0.15, 2], s.mass || 4, 'wood', 'slab', { target: false }),
  ball: (s) => ({ mass: s.mass || 4, mat: 'stone', look: 'boulder', h: (s.r || 0.4) * 2, parts: [{ shape: 'ball', r: s.r || 0.4 }], size: [(s.r || 0.4) * 2, (s.r || 0.4) * 2, (s.r || 0.4) * 2] }),

  // Static / kinematic scenery
  wall: (s) => box(s.size || [0.3, 1, 4], 0, s.mat || 'wood', s.look || 'wall', { fixed: true }),
  ramp: (s) => box(s.size || [2, 0.2, 4], 0, 'wood', s.look || 'ramp', { fixed: true }),
  platform: (s) => box(s.size || [2, 0.3, 2], 0, s.mat || 'wood', s.look || 'platform', { fixed: true }),
  glass: (s) => box(s.size || [2, 1.4, 0.08], 0, 'glass', 'glass', { fixed: true, panel: true, breakImpulse: 2.5, shardCount: 14 }),
  bumper: (s) => cyl(s.r || 0.4, s.h || 0.6, 0, 'rubber', 'bumper', { fixed: true, bumper: s.kick || 9 }),
  bumperWall: (s) => box(s.size || [0.3, 0.6, 2], 0, 'rubber', 'bumperWall', { fixed: true, bumper: s.kick || 7 }),
  pillar: (s) => cyl(s.r || 0.3, s.h || 2, 0, 'stone', 'pillar', { fixed: true }),
  shelf: (s) => box(s.size || [4, 0.08, 0.8], 0, 'metal', 'shelf', { fixed: true }),
  desk: (s) => box(s.size || [2, 0.75, 1], 0, 'wood', 'desk', { fixed: true }),
  mover: (s) => box(s.size || [1.6, 0.2, 1.6], 0, 'metal', 'mover', { kinematic: true }),
  rotator: (s) => box(s.size || [3, 0.6, 0.25], 0, 'metal', 'rotator', { kinematic: true }),
};

function box(size, mass, mat, look, extra) {
  return { mass, mat, look, h: size[1], size, parts: [{ shape: 'box', size }], tilt: 55, drop: 0.35, ...extra };
}
function cyl(r, h, mass, mat, look, extra) {
  return { mass, mat, look, h, size: [r * 2, h, r * 2], parts: [{ shape: 'cyl', r, h }], tilt: 55, drop: 0.3, ...extra };
}

export const BALL_RADIUS = 0.38;
export const BALL_MASS = 9;
