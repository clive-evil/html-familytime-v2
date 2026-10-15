// Car (oriented box) vs static/dynamic obstacles. 2D, ground plane.

function obbAxes(rot) {
  // box local z (length) axis = (sin, cos); local x axis = (cos, -sin)
  const s = Math.sin(rot), c = Math.cos(rot);
  return [[c, -s], [s, c]];
}

function corners(cx, cz, hx, hz, rot) {
  const [ax, az] = obbAxes(rot);
  const out = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    out.push([cx + ax[0] * hx * sx + az[0] * hz * sz, cz + ax[1] * hx * sx + az[1] * hz * sz]);
  }
  return out;
}

function pointInObb(px, pz, b) {
  const [ax, az] = obbAxes(b.rot);
  const dx = px - b.cx, dz = pz - b.cz;
  return Math.abs(dx * ax[0] + dz * ax[1]) <= b.hx && Math.abs(dx * az[0] + dz * az[1]) <= b.hz;
}

// SAT. Returns null or { nx, nz (pushes A out of B), depth, px, pz (contact point) }
export function obbObb(A, B) {
  const axes = [...obbAxes(A.rot), ...obbAxes(B.rot)];
  let best = null;
  const dx = A.cx - B.cx, dz = A.cz - B.cz;
  const [aax, aaz] = obbAxes(A.rot), [bax, baz] = obbAxes(B.rot);
  for (const ax of axes) {
    const rA = A.hx * Math.abs(aax[0] * ax[0] + aax[1] * ax[1]) + A.hz * Math.abs(aaz[0] * ax[0] + aaz[1] * ax[1]);
    const rB = B.hx * Math.abs(bax[0] * ax[0] + bax[1] * ax[1]) + B.hz * Math.abs(baz[0] * ax[0] + baz[1] * ax[1]);
    const d = dx * ax[0] + dz * ax[1];
    const o = rA + rB - Math.abs(d);
    if (o <= 0) return null;
    if (!best || o < best.depth) best = { depth: o, nx: d < 0 ? -ax[0] : ax[0], nz: d < 0 ? -ax[1] : ax[1] };
  }
  // contact point: average of corners inside the other box
  let sx = 0, sz = 0, n = 0;
  for (const c of corners(A.cx, A.cz, A.hx, A.hz, A.rot)) if (pointInObb(c[0], c[1], B)) { sx += c[0]; sz += c[1]; n++; }
  for (const c of corners(B.cx, B.cz, B.hx, B.hz, B.rot)) if (pointInObb(c[0], c[1], A)) { sx += c[0]; sz += c[1]; n++; }
  if (n) { best.px = sx / n; best.pz = sz / n; } else { best.px = (A.cx + B.cx) / 2; best.pz = (A.cz + B.cz) / 2; }
  return best;
}

export function obbCircle(A, C) {
  const [ax, az] = obbAxes(A.rot);
  const dx = C.x - A.cx, dz = C.z - A.cz;
  let lx = dx * ax[0] + dz * ax[1], lz = dx * az[0] + dz * az[1];
  const qx = Math.max(-A.hx, Math.min(A.hx, lx)), qz = Math.max(-A.hz, Math.min(A.hz, lz));
  const cx = A.cx + ax[0] * qx + az[0] * qz, cz = A.cz + ax[1] * qx + az[1] * qz;
  let nx = cx - C.x, nz = cz - C.z;
  let d = Math.hypot(nx, nz);
  if (d > C.r) return null;
  if (d < 1e-6) {
    // centre inside box: push out along shortest local axis
    const px = A.hx - Math.abs(lx), pz = A.hz - Math.abs(lz);
    if (px < pz) { nx = -ax[0] * Math.sign(lx || 1); nz = -ax[1] * Math.sign(lx || 1); d = -px; }
    else { nx = -az[0] * Math.sign(lz || 1); nz = -az[1] * Math.sign(lz || 1); d = -pz; }
    return { nx, nz, depth: C.r - d, px: C.x, pz: C.z };
  }
  return { nx: nx / d, nz: nz / d, depth: C.r - d, px: cx, pz: cz };
}

export function collide(A, o) {
  if (o.kind === 'circle') {
    if (Math.abs(o.x - A.cx) > 3 || Math.abs(o.z - A.cz) > 3) return null;
    return obbCircle(A, o);
  }
  const rr = Math.hypot(o.hx, o.hz) + 2.1;
  if (Math.abs(o.cx - A.cx) > rr || Math.abs(o.cz - A.cz) > rr) return null;
  return obbObb(A, o);
}

export { corners };
