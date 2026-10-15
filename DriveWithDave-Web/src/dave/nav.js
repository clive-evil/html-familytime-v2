// Lane network Dave can drive, built from the existing World. Dave does not
// know the route — only the roads. Decision points (junctions) are where he
// needs telling, or he guesses.

import { offsetPolyline, resample, cumulative, projectOnPolyline, clamp } from '../sim/math.js';
import { ROAD } from '../world/layout.js';

// Push a lane sideways around parked cars / barriers / cones, then smooth.
function avoid(pts, world, passes = 2) {
  for (let i = 0; i < passes; i++) pts = avoidOnce(pts, world);
  return pts;
}

function avoidOnce(pts, world) {
  const obs = world.statics.filter((o) => o.tag === 'car' || o.tag === 'barrier' || o.tag === 'cone');
  const off = pts.map(() => 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = tz, nz = -tx; // left normal
    let need = 0;
    for (const o of obs) {
      const ox = o.kind === 'circle' ? o.x : o.cx, oz = o.kind === 'circle' ? o.z : o.cz;
      const dx = ox - p[0], dz = oz - p[1];
      const lon = dx * tx + dz * tz;
      const halfLen = o.kind === 'circle' ? o.r : Math.abs(Math.cos(o.rot) * tz + Math.sin(o.rot) * tx) * o.hz + Math.abs(-Math.sin(o.rot) * tz + Math.cos(o.rot) * tx) * o.hx;
      if (Math.abs(lon) > halfLen + 2.4) continue;
      const lat = dx * nx + dz * nz; // + = obstacle to our left
      const halfW = o.kind === 'circle' ? o.r : Math.abs(Math.cos(o.rot) * nx - Math.sin(o.rot) * nz) * o.hx + Math.abs(Math.sin(o.rot) * nx + Math.cos(o.rot) * nz) * o.hz;
      const clear = halfW + 0.81 + 0.6;
      if (Math.abs(lat) < clear) {
        // move away from it (toward the road centre when it's on our left)
        const dir = lat >= 0 ? -1 : 1;
        const shift = dir * (clear - Math.abs(lat));
        if (Math.abs(shift) > Math.abs(need)) need = shift;
      }
    }
    off[i] = need;
  }
  // widen + smooth the offset so swerves start early and are gentle
  const W = 9;
  const wide = off.map((_, i) => { let m = 0; for (let k = -W; k <= W; k++) { const v = off[clamp(i + k, 0, off.length - 1)]; if (Math.abs(v) > Math.abs(m)) m = v; } return m; });
  const sm = wide.map((_, i) => { let s = 0, n = 0; for (let k = -W; k <= W; k++) { s += wide[clamp(i + k, 0, wide.length - 1)]; n++; } return s / n; });
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    return [p[0] + tz * sm[i], p[1] - tx * sm[i]];
  });
}

function edge(id, pts, end, extra = {}) {
  const r = resample(pts, 1).pts;
  return { id, pts: r, cum: cumulative(r), end, ...extra };
}

export function buildNav(world) {
  const nav = {};
  const nd = world.nanDrive;
  const topStopFront = world.topJunction.stopZ;
  const topCentre = topStopFront - 2.15;
  // car park → junction 1
  {
    const pts = [];
    for (let z = -100; z <= world.junction1.stopZ - 2.15; z += 1) pts.push([1.7 * clamp((z + 100) / 30, 0, 1), z]);
    nav.yard = edge('yard', pts, { type: 'junction', id: 'J1', stopFrontZ: world.junction1.stopZ, axis: 'z' });
  }
  // Mill Road eastbound → bend → hill up to the top junction
  {
    const lane = offsetPolyline(world.millHill, 1.9).filter((p) => p[0] > -88 && p[1] < topCentre + 0.01);
    const pts = avoid(resample(lane, 1).pts, world);
    nav.millEast = edge('millEast', pts, { type: 'junction', id: 'TOP', stopFrontZ: topStopFront, axis: 'z' });
  }
  // Mill Road westbound (the wrong way at J1) → dead end
  {
    const pts = [];
    for (let x = -4; x >= -84; x -= 1) pts.push([x, 1.9]);
    nav.millWest = edge('millWest', avoid(pts, world), { type: 'deadend' });
  }
  // Top Road eastbound (the wrong way at the top) → dead end
  {
    const pts = [];
    for (let x = 76; x <= 138; x += 1) pts.push([x, ROAD.topZ - 2.0]);
    nav.topEast = edge('topEast', avoid(pts, world), { type: 'deadend' });
  }
  // Top Road westbound: the parking gap and Nan's drive are on the left
  {
    const pts = [];
    for (let x = 140; x >= -40; x -= 1) pts.push([x, 250.5]);
    nav.topWest = edge('topWest', avoid(pts, world), { type: 'deadend' }, {
      features: [
        { kind: 'space', x0: world.parkSpace.x0 - 6, x1: world.parkSpace.x1 + 9 },
        { kind: 'driveway', x: nd.cx, approach: nd.cx + 6.3 + 9 },
      ],
    });
  }
  // junction arcs (from the stop position)
  const arc = (fn, n = 16) => { const out = []; for (let i = 0; i <= n; i++) out.push(fn((i / n) * Math.PI / 2)); return out; };
  const j1z = world.junction1.stopZ - 2.15;
  nav.turns = {
    J1: {
      LEFT: { arc: arc((a) => [1.7 + 8.2 * (1 - Math.cos(a)), j1z + 4.25 * Math.sin(a)]), to: 'millEast' },
      RIGHT: { arc: arc((a) => [1.7 - 7.9 * (1 - Math.cos(a)), j1z + 8.05 * Math.sin(a)]), to: 'millWest' },
      STRAIGHT: null,
    },
    TOP: {
      LEFT: { arc: arc((a) => [71.9 + 6.2 * (1 - Math.cos(a)), topCentre + (ROAD.topZ - 2.0 - topCentre) * Math.sin(a)]), to: 'topEast' },
      RIGHT: { arc: arc((a) => [71.9 - 7.0 * (1 - Math.cos(a)), topCentre + (250.5 - topCentre) * Math.sin(a)]), to: 'topWest' },
      STRAIGHT: null,
    },
  };
  nav.correct = { J1: 'LEFT', TOP: 'RIGHT' };
  // into Nan's drive from the westbound lane
  nav.drivewayPath = (fromX) => {
    const R = 6.3, z0 = 249.6;
    const pts = [];
    for (let x = fromX; x >= nd.cx + R; x -= 1) pts.push([x, 250.5 + (z0 - 250.5) * Math.min(1, (fromX - x) / 8)]);
    for (let i = 1; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; pts.push([nd.cx + R - R * Math.sin(a), z0 + R - R * Math.cos(a)]); }
    for (let z = z0 + R + 1; z <= 262.2; z += 1) pts.push([nd.cx, z]);
    return edge('driveway', pts, { type: 'driveway' });
  };
  nav.edges = [nav.yard, nav.millEast, nav.millWest, nav.topEast, nav.topWest];
  // join: arc + the rest of the target edge from where the arc lands
  nav.join = (arcPts, edgeId) => {
    const e = nav[edgeId];
    const last = arcPts[arcPts.length - 1];
    const pr = projectOnPolyline(e.pts, e.cum, last[0], last[1]);
    const rest = e.pts.filter((_, i) => e.cum[i] > pr.s + 1.5);
    return edge(edgeId, [...arcPts, ...rest], e.end, { features: e.features, base: edgeId });
  };
  // the edge best matching a position + heading (used after turning round)
  nav.match = (x, z, psi) => {
    const fx = Math.sin(psi), fz = Math.cos(psi);
    let best = null;
    for (const e of nav.edges) {
      const pr = projectOnPolyline(e.pts, e.cum, x, z);
      if (pr.dist > 7) continue;
      const dot = pr.tx * fx + pr.tz * fz;
      if (dot < 0.35) continue;
      const score = pr.dist - dot * 3;
      if (!best || score < best.score) best = { e, pr, score };
    }
    return best;
  };
  nav.fromHere = (e, s) => {
    const rest = e.pts.filter((_, i) => e.cum[i] >= s - 0.5);
    return edge(e.id, rest.length > 2 ? rest : e.pts.slice(-3), e.end, { features: e.features, base: e.id });
  };
  return nav;
}
