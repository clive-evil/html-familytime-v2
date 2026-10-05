// Small math helpers shared by the simulation (no three.js dependency so the
// sim can run headless in Node for QA).

export const DEG = Math.PI / 180;

/** Quaternion from euler XYZ (degrees). Returns {x,y,z,w}. */
export function quatFromEulerDeg(rx = 0, ry = 0, rz = 0) {
  const x = rx * DEG * 0.5, y = ry * DEG * 0.5, z = rz * DEG * 0.5;
  const c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z);
  const s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
  // XYZ order (matches three.js default)
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}

/** Rotate vector v by quaternion q. */
export function rotateVec(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

/** Inverse-rotate vector v by quaternion q. */
export function invRotateVec(q, v) {
  return rotateVec({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, v);
}

/** Local up axis of a quaternion. */
export function upOf(q) {
  return {
    x: 2 * (q.x * q.y - q.w * q.z),
    y: 1 - 2 * (q.x * q.x + q.z * q.z),
    z: 2 * (q.y * q.z + q.w * q.x),
  };
}

export const len3 = (v) => Math.hypot(v.x, v.y, v.z);
export const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Deterministic PRNG (mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
