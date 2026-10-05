import { BALANCE } from '../../data/balance.js';
import { BUILDINGS } from '../../data/buildings.js';
import { footprint } from '../entities/Building.js';

// Grid placement rules. Pure function of state -> { ok, reason }.
export function checkPlacement(state, type, cx, cz, rot, { ignoreCost = false } = {}) {
  const def = BUILDINGS[type];
  if (!def) return { ok: false, reason: 'Unknown building' };
  const [w, d] = footprint(type, rot);
  const H = BALANCE.worldHalf;
  if (cx < -H || cz < -H || cx + w > H || cz + d > H) return { ok: false, reason: 'Too far out' };

  // Keep a 1-cell walkway around solid buildings so nobody gets boxed in.
  const gap = def.solid ? 1 : 0;
  for (const b of state.buildings) {
    const bg = Math.max(gap, BUILDINGS[b.type].solid ? 1 : 0);
    const bx0 = b.x - b.w / 2, bz0 = b.z - b.d / 2;
    if (cx < bx0 + b.w + bg && cx + w > bx0 - bg && cz < bz0 + b.d + bg && cz + d > bz0 - bg) {
      return { ok: false, reason: 'Blocked' };
    }
  }
  for (const n of state.nodes) {
    const r = BALANCE.nodes[n.type].radius * n.s + 0.2;
    const px = Math.max(cx, Math.min(n.x, cx + w));
    const pz = Math.max(cz, Math.min(n.z, cz + d));
    if ((px - n.x) ** 2 + (pz - n.z) ** 2 < r * r) return { ok: false, reason: 'Blocked by ' + n.type };
  }
  const p = state.player;
  if (def.solid && p.x > cx - 0.4 && p.x < cx + w + 0.4 && p.z > cz - 0.4 && p.z < cz + d + 0.4) {
    return { ok: false, reason: 'Standing in the way' };
  }
  if (!ignoreCost) {
    const c = def.cost || {};
    for (const k in c) {
      if ((state.resources[k] || 0) < c[k]) return { ok: false, reason: `Need ${c[k]} ${k}` };
    }
  }
  return { ok: true, reason: '' };
}

// Spiral search for the first valid cell near (x,z). Used by bots and debug tools.
export function findPlacement(state, type, x, z, rot = 0, maxR = 30, opts = {}) {
  const [w, d] = footprint(type, rot);
  const bx = Math.round(x - w / 2), bz = Math.round(z - d / 2);
  for (let r = 0; r <= maxR; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (checkPlacement(state, type, bx + dx, bz + dz, rot, opts).ok) return { cx: bx + dx, cz: bz + dz, rot };
      }
    }
  }
  return null;
}
