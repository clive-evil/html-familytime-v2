import { BALANCE } from '../../data/balance.js';

const G = BALANCE.grandma;
const tmp = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };
const STATIONARY = new Set(['work', 'eat', 'build', 'sleep', 'hungryWait', 'emerge']);

// Moves every Grandma toward its target, separates the crowd (spatial hash),
// pushes out of obstacles and slides round them. O(n) per tick.
export function updateMovement(sim, dt) {
  const s = sim.state;
  const gs = s.grandmas;
  const nav = sim.nav;
  const crowd = sim.crowd;
  const p = s.player;

  crowd.clear();
  for (let i = 0; i < gs.length; i++) if (!gs[i].inside) crowd.insert(i, gs[i].x, gs[i].z);

  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    if (g.inside) continue;
    let mx = 0, mz = 0;
    if (g.moving) {
      const dx = g.tx - g.x, dz = g.tz - g.z;
      const d = Math.hypot(dx, dz);
      if (d <= g.arriveR) {
        g.moving = false;
      } else {
        // Stuck detection: if we stop closing distance, accept "close enough"
        // or flip the steering side to get round whatever is in the way.
        if (d < g.bestD - 0.05) { g.bestD = d; g.stuckT = 0; }
        else g.stuckT += dt;
        if (g.stuckT > 1.6) {
          if (d < 2.5) { g.moving = false; }
          else { g.side = -g.side; g.stuckT = 0; g.bestD = d; }
        }
        if (g.moving) {
          let sp = g.adult ? G.walk : G.hatchlingWalk;
          if (g.starving) sp *= 0.8;
          if (g.rare === 'big') sp *= 0.85;
          if (g.rare === 'tiny') sp *= 1.15;
          const step = Math.min(d, sp * dt);
          mx = (dx / d) * step;
          mz = (dz / d) * step;
          // Turn smoothly toward travel direction.
          const want = Math.atan2(dx, dz);
          let da = want - g.rot;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          g.rot += da * Math.min(1, dt * 10);
        }
      }
    }

    // Separation from neighbours.
    const r = G.radius * g.scale;
    let sx = 0, sz = 0;
    const weight = STATIONARY.has(g.state) ? 0.15 : 1;
    crowd.near(g.x, g.z, (j) => {
      if (j === i) return;
      const o = gs[j];
      const dx = g.x - o.x, dz = g.z - o.z;
      const minD = r + G.radius * o.scale;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.5;
        sx += (dx / d) * push;
        sz += (dz / d) * push;
      } else if (d2 <= 1e-8) {
        sx += ((g.id % 3) - 1) * 0.05;
        sz += ((g.id % 5) - 2) * 0.05;
      }
    });
    // The player shoves through crowds (gently).
    {
      const dx = g.x - p.x, dz = g.z - p.z;
      const minD = r + BALANCE.player.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        sx += (dx / d) * (minD - d) * 0.8;
        sz += (dz / d) * (minD - d) * 0.8;
      }
    }
    const maxSep = 3 * dt;
    const sl = Math.hypot(sx, sz);
    if (sl > maxSep) { sx = (sx / sl) * maxSep; sz = (sz / sl) * maxSep; }

    let nx = g.x + mx + sx * weight;
    let nz = g.z + mz + sz * weight;
    nav.collide(nx, nz, r, tmp);
    if (tmp.hit && g.moving) {
      // Slide: add a tangent push so agents walk round obstacles instead of pinning.
      const dot = mx * tmp.nx + mz * tmp.nz;
      if (dot < 0) {
        const len = Math.hypot(mx, mz);
        const tx = -tmp.nz * g.side, tz = tmp.nx * g.side;
        nav.collide(tmp.x + tx * len, tmp.z + tz * len, r, tmp);
      }
    }
    g.vx = (tmp.x - g.x) / Math.max(dt, 1e-4);
    g.vz = (tmp.z - g.z) / Math.max(dt, 1e-4);
    g.x = tmp.x;
    g.z = tmp.z;
  }
}
