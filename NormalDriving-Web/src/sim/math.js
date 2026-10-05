// Small maths helpers shared by the simulation (no three.js dependency so the
// sim can be unit tested in node).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const approach = (v, target, rate) =>
  v < target ? Math.min(v + rate, target) : Math.max(v - rate, target);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const DEG = Math.PI / 180;
export const RPM_PER_RADS = 60 / (2 * Math.PI);

// 2D helpers in the ground (x,z) plane.
// Heading psi: forward = (sin psi, cos psi). Left = (cos psi, -sin psi).
export const fwd = (psi) => [Math.sin(psi), Math.cos(psi)];
export const leftOf = (psi) => [Math.cos(psi), -Math.sin(psi)];

// Mulberry32 seeded PRNG (used only for world dressing, never for physics)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

// Offset a polyline sideways. +d = to the LEFT of the direction of travel.
export function offsetPolyline(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    // left of (tx,tz) = (tz, -tx)
    out.push([p[0] + tz * d, p[1] - tx * d]);
  }
  return out;
}

// Resample a polyline at a fixed spacing; returns {pts, s[]}
export function resample(pts, step) {
  const out = [pts[0].slice()];
  const ss = [0];
  let acc = 0, total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const segL = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - acc;
    while (t <= segL) {
      const u = t / segL;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
      ss.push(total + t);
      t += step;
    }
    acc = segL - (t - step);
    total += segL;
  }
  const last = pts[pts.length - 1];
  const lp = out[out.length - 1];
  if (Math.hypot(last[0] - lp[0], last[1] - lp[1]) > 1e-3) { out.push(last.slice()); ss.push(total); }
  return { pts: out, s: ss };
}

// Project point onto polyline → {s, dist, lateral (+ = left), idx, tangent}
export function projectOnPolyline(pts, cum, x, z) {
  let best = { d2: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1];
    const bx = pts[i][0], bz = pts[i][1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t, pz = az + dz * t;
    const d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < best.d2) {
      const l = Math.sqrt(l2);
      const tx = dx / l, tz = dz / l;
      const lat = (x - px) * tz + (z - pz) * -tx; // left component
      best = { d2, s: cum[i - 1] + t * l, lateral: lat, idx: i, tx, tz, px, pz };
    }
  }
  best.dist = Math.sqrt(best.d2);
  return best;
}

export function cumulative(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}

export function pointAt(pts, cum, s) {
  s = clamp(s, 0, cum[cum.length - 1]);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i];
  const l = cum[i] - cum[i - 1] || 1e-9;
  const u = (s - cum[i - 1]) / l;
  const tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, tx, tz, heading: Math.atan2(tx, tz) };
}
