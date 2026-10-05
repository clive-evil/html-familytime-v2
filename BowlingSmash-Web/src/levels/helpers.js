// Level-building helpers. All return arrays of object specs.
// Coordinates: ball starts near z=0 and bowls toward -Z. +X is right.

export const PIN_SPACING = 0.55;

/** Classic triangle: head pin at (x, y, z), rows extending away from the ball. */
export function pinTriangle(x, z, rows = 4, opts = {}) {
  const s = opts.spacing || PIN_SPACING;
  const y = opts.y || 0;
  const t = opts.t || 'pin';
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i <= r; i++) {
      out.push({ t, at: [x + (i - r / 2) * s, y, z - r * s * 0.866], ...(opts.extra || {}) });
    }
  }
  return out;
}

/** Rectangular block of pins. */
export function pinGrid(x, z, cols, rows, opts = {}) {
  const s = opts.spacing || PIN_SPACING;
  const y = opts.y || 0;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ t: opts.t || 'pin', at: [x + (c - (cols - 1) / 2) * s, y, z - r * s], ...(opts.extra || {}) });
    }
  }
  return out;
}

/** Row of objects along X. */
export function rowX(t, x0, x1, n, y, z, extra = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1);
    out.push({ t, at: [x, y, z], ...extra });
  }
  return out;
}

/** Line of dominoes from (x0,z0) to (x1,z1). Dominoes face along the line. */
export function dominoLine(x0, z0, x1, z1, n, opts = {}) {
  const out = [];
  const ang = Math.atan2(x1 - x0, z1 - z0) * (180 / Math.PI);
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : i / (n - 1);
    out.push({ t: 'domino', at: [x0 + (x1 - x0) * k, opts.y || 0, z0 + (z1 - z0) * k], ry: ang, ...(opts.extra || {}) });
  }
  return out;
}

/** Pyramid of cans (2D, facing the ball). base n cans wide. */
export function canPyramid(x, y, z, n, opts = {}) {
  const r = opts.r || 0.11, h = opts.h || 0.3;
  const gap = r * 2 + 0.01;
  const out = [];
  for (let row = 0; row < n; row++) {
    const k = n - row;
    for (let i = 0; i < k; i++) {
      out.push({ t: 'can', at: [x + (i - (k - 1) / 2) * gap, y + row * (h + 0.002), z], color: opts.colors ? opts.colors[(i + row) % opts.colors.length] : undefined, ...(opts.extra || {}) });
    }
  }
  return out;
}

/** Wall/stack of boxes: cols x rows, brick offset optional. */
export function boxWall(t, x, y, z, cols, rows, size, opts = {}) {
  const [w, h] = size;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const shift = opts.brick && r % 2 ? w / 2 : 0;
    const cnt = opts.brick && r % 2 ? cols - 1 : cols;
    for (let c = 0; c < cnt; c++) {
      out.push({ t, at: [x + (c - (cols - 1) / 2) * (w + 0.005) + shift, y + r * (h + 0.003), z], size, ...(opts.extra || {}) });
    }
  }
  return out;
}

/** A simple table: top slab supported by four posts. Returns specs; top surface y. */
export function table(x, z, w, d, legH, opts = {}) {
  const top = opts.topT || 'slab';
  const th = opts.th || 0.14;
  const lt = opts.legT || 'post';
  const ls = opts.legSize || 0.18;
  const out = [];
  const ox = w / 2 - ls / 2 - 0.02, oz = d / 2 - ls / 2 - 0.02;
  const y0 = opts.y || 0;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    out.push({ t: lt, at: [x + sx * ox, y0, z + sz * oz], size: [ls, legH, ls], mass: opts.legMass, ...(opts.legExtra || {}) });
  }
  out.push({ t: top, at: [x, y0 + legH + 0.002, z], size: [w, th, d], mass: opts.topMass, ...(opts.topExtra || {}) });
  return { specs: out, topY: y0 + legH + th + 0.004 };
}

/** Static ramp whose TOP surface runs from (z0,y0) to (z1,y1) (z1 further from the ball). */
export function ramp(x, z0, y0, z1, y1, w = 2.4, opts = {}) {
  const th = opts.th || 0.3;
  const dz = z1 - z0, dy = y1 - y0;
  const L = Math.hypot(dz, dy);
  const th0 = Math.atan2(dy, -dz); // rotation about X
  const nY = Math.cos(th0), nZ = Math.sin(th0);
  const c = [x, (y0 + y1) / 2 - (th / 2) * nY, (z0 + z1) / 2 - (th / 2) * nZ];
  return { t: 'ramp', c, rot: [(th0 * 180) / Math.PI, 0, 0], size: [w, th, L + 0.02], look: opts.look || 'ramp' };
}

/** Domino arc around centre (cx,cz), radius r, from angle a0 to a1 (deg, 0 = +X, 90 = -Z). */
export function dominoArc(cx, cz, r, a0, a1, n, opts = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / (n - 1)) * Math.PI) / 180;
    const x = cx + Math.cos(a) * r, z = cz - Math.sin(a) * r;
    // tangent direction
    const dir = Math.sign(a1 - a0);
    const tx = -Math.sin(a) * dir, tz = -Math.cos(a) * dir;
    const ry = (Math.atan2(tx, tz) * 180) / Math.PI;
    out.push({ t: 'domino', at: [x, opts.y || 0, z], ry, ...(opts.extra || {}) });
  }
  return out;
}

export const rail = (x, z0, z1, h = 0.35) => ({ t: 'wall', at: [x, 0, (z0 + z1) / 2], size: [0.2, h, Math.abs(z1 - z0)], look: 'rail' });
export const backstop = (z, w, h = 1.2) => ({ t: 'wall', at: [0, 0, z], size: [w, h, 0.3], look: 'backstop' });

/** Line of objects (default pins) from (x0,z0) to (x1,z1). */
export function lineOf(t, x0, z0, x1, z1, n, opts = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : i / (n - 1);
    out.push({ t, at: [x0 + (x1 - x0) * k, opts.y || 0, z0 + (z1 - z0) * k], ...(opts.extra || {}) });
  }
  return out;
}

/**
 * Objects (default dominoes) evenly spaced along a smooth Catmull-Rom path
 * through `pts` [[x,z],...], each turned to face along the path.
 */
export function alongPath(pts, spacing = 0.5, opts = {}) {
  const t = opts.t || 'domino';
  // dense sample
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 40; k++) {
      const u = k / 40, u2 = u * u, u3 = u2 * u;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(pts[pts.length - 1]);
  const out = [];
  let acc = spacing; // place first at start
  for (let i = 1; i < dense.length; i++) {
    const [ax, az] = dense[i - 1], [bx, bz] = dense[i];
    const seg = Math.hypot(bx - ax, bz - az);
    acc += seg;
    if (acc >= spacing) {
      acc = 0;
      const ry = (Math.atan2(bx - ax, bz - az) * 180) / Math.PI;
      out.push({ t, at: [ax, opts.y || 0, az], ...(t === 'domino' ? { ry } : {}), ...(opts.extra || {}) });
    }
  }
  return out;
}

/** Pin triangle whose head pin is at (x,z) and whose rows extend along direction (dx,dz). */
export function pinTriangleDir(x, z, rows, dx, dz, opts = {}) {
  const l = Math.hypot(dx, dz); dx /= l; dz /= l;
  const sx = -dz, sz = dx; // side vector
  return pinTriangle(0, 0, rows, opts).map((p) => {
    const a = p.at[0], b = -p.at[2];
    return { ...p, at: [x + sx * a + dx * b, p.at[1], z + sz * a + dz * b] };
  });
}
