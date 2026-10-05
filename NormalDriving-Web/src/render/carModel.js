// A fictional, slightly boxy small hatchback. Local frame: +z forward,
// +x LEFT (so the right-hand-drive driver sits at negative x), y up, origin on
// the ground under the centre of mass. Front axle z=+1.0, rear z=-1.4.
import * as THREE from 'three';
import { Batch, hexa } from './geo.js';

export const BODY_TINT = 0xffffff; // body parts are white so instanceColor tints them
const GLASS = 0x1c2228, TRIM = 0x2a2b2c, TYRE = 0x161616, CHROME = 0xa9adb0;

function cabin(bodyColor, glass = GLASS) {
  // greenhouse: bottom at the waist, sloped screen, near-vertical hatch
  const yb = 0.9, yt = 1.4;
  const b = [[0.77, yb, -1.72], [-0.77, yb, -1.72], [-0.77, yb, 0.62], [0.77, yb, 0.62]];
  const t = [[0.66, yt, -1.6], [-0.66, yt, -1.6], [-0.66, yt, 0.04], [0.66, yt, 0.04]];
  // hexa expects bottom ccw from above as (-x,-z),(+x,-z),(+x,+z),(-x,+z)
  const B = [b[1], b[0], b[3], b[2]];
  const T = [t[1], t[0], t[3], t[2]];
  const g = hexa(B, T);
  const roof = hexa(
    [[-0.67, yt - 0.01, -1.62], [0.67, yt - 0.01, -1.62], [0.67, yt - 0.01, 0.06], [-0.67, yt - 0.01, 0.06]],
    [[-0.64, yt + 0.05, -1.58], [0.64, yt + 0.05, -1.58], [0.64, yt + 0.05, 0.0], [-0.64, yt + 0.05, 0.0]],
  );
  return { g, roof, glass, bodyColor };
}

// exterior batch (no wheels): lower body, bonnet, cabin, bumpers, lights
export function carBodyBatch(bodyColor = BODY_TINT, opts = {}) {
  const b = new Batch();
  // lower body
  b.box(1.62, 0.5, 3.66, bodyColor, [0, 0.62, -0.05]);
  // bonnet (slightly sloped)
  b.add(hexa(
    [[-0.79, 0.86, 0.6], [0.79, 0.86, 0.6], [0.79, 0.86, 1.72], [-0.79, 0.86, 1.72]],
    [[-0.76, 0.93, 0.62], [0.76, 0.93, 0.62], [0.74, 0.88, 1.74], [-0.74, 0.88, 1.74]]), bodyColor);
  const cb = cabin(bodyColor);
  if (!opts.noCabin) b.add(cb.g, opts.glass ?? GLASS);
  b.add(cb.roof, bodyColor);
  // pillars (exterior)
  if (!opts.noCabin) {
    for (const sx of [-1, 1]) {
      b.box(0.06, 0.5, 0.08, bodyColor, [sx * 0.72, 1.15, -0.85]);
    }
  }
  // bumpers + sills
  b.box(1.66, 0.2, 0.16, TRIM, [0, 0.42, 1.84]);
  b.box(1.66, 0.2, 0.16, TRIM, [0, 0.42, -1.92]);
  b.box(1.64, 0.08, 2.0, TRIM, [0, 0.35, -0.2]);
  // lights
  for (const sx of [-1, 1]) {
    b.box(0.34, 0.13, 0.04, 0xf2efe0, [sx * 0.55, 0.72, 1.86]);
    b.box(0.07, 0.07, 0.04, 0xe3912d, [sx * 0.78, 0.72, 1.86]);
    b.box(0.22, 0.18, 0.04, 0xa8231c, [sx * 0.62, 0.74, -1.9]);
    // side mirrors
    b.box(0.16, 0.1, 0.06, bodyColor, [sx * 0.88, 1.02, 0.52]);
  }
  // grille, number plates
  b.box(0.6, 0.12, 0.03, 0x232425, [0, 0.73, 1.87]);
  b.box(0.5, 0.11, 0.02, 0xe8e4d0, [0, 0.45, 1.93]);
  b.box(0.5, 0.11, 0.02, 0xe0c64a, [0, 0.55, -2.0]);
  b.box(0.2, 0.03, 0.02, CHROME, [0, 0.86, -1.9]);
  return b;
}

export function wheelGeometry() {
  const b = new Batch();
  b.add(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 18), TYRE, [0, 0, 0], [0, 0, Math.PI / 2]);
  b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.19, 12), 0x8d9093, [0, 0, 0], [0, 0, Math.PI / 2]);
  b.box(0.2, 0.05, 0.05, 0x5c5f61, [0, 0, 0]); // makes rotation visible
  return b.build();
}

export const WHEEL_POS = [[0.7, 0.28, 1.0], [-0.7, 0.28, 1.0], [0.7, 0.28, -1.4], [-0.7, 0.28, -1.4]];

// Static parked car geometry (body + wheels merged) for instancing
export function parkedCarGeometry() {
  const b = carBodyBatch(BODY_TINT);
  const w = wheelGeometry();
  for (const p of WHEEL_POS) {
    const m = new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]);
    const g = w.clone(); g.applyMatrix4(m); b.parts.push(g);
  }
  // under-body shadow plate
  b.box(1.5, 0.02, 3.4, 0x111111, [0, 0.04, -0.15]);
  return b.build();
}

export function makeCarMesh(color, material) {
  const group = new THREE.Group();
  const body = carBodyBatch(color).build(material);
  body.castShadow = true;
  group.add(body);
  const wg = wheelGeometry();
  const wheels = WHEEL_POS.map((p) => {
    const pivot = new THREE.Group();
    pivot.position.set(p[0], p[1], p[2]);
    const m = new THREE.Mesh(wg, material);
    m.castShadow = true;
    pivot.add(m);
    group.add(pivot);
    return { pivot, mesh: m };
  });
  return { group, body, wheels };
}
