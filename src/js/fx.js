'use strict';
// ============================================================================
// FX — small, purposeful particles. Every particle reports simulation state.
// ============================================================================
const FX = {
  parts: [], flashes: [], max: 700,
  add(p) { if (this.parts.length < this.max) this.parts.push(p); },
  sparks(x, y, n = 4, weld = false) {
    for (let i = 0; i < n; i++) this.add({ k: 'spark', x, y, vx: rnd(-60, 60), vy: rnd(-80, 10), life: rnd(0.25, 0.6), t: 0, c: weld ? '#fff4d0' : '#ffd28a' });
    this.flashes.push({ x, y, r: weld ? 50 : 34, a: weld ? 0.6 : 0.45, life: 0.08, t: 0, col: 'muzzle' });
  },
  foam(x, y, dir, fire = false) {
    if (chance(0.5)) this.add({ k: 'foam', x, y, vx: dir * rnd(50, 90), vy: rnd(-12, 8), life: rnd(0.4, 0.8), t: 0, s: rnd(1.5, 3), fire });
  },
  muzzle(x, y, dir, target, hit) {
    this.flashes.push({ x, y, r: 70, a: 0.9, life: 0.07, t: 0, col: 'muzzle' });
    this.add({ k: 'tracer', x, y, tx: target.x, ty: target.y - rnd(20, 40), life: 0.06, t: 0 });
    if (hit) for (let i = 0; i < 3; i++) this.add({ k: 'ichor', x: target.x + rnd(-6, 6), y: target.y - rnd(20, 40), vx: rnd(-40, 40), vy: rnd(-40, 10), life: rnd(0.3, 0.6), t: 0 });
  },
  smoke(r) {
    this.add({ k: 'smoke', x: rnd(r.x0 + 10, r.x1 - 10), y: r.fy - rnd(10, 40), vx: rnd(-6, 6), vy: rnd(-22, -12), life: rnd(2.5, 4.5), t: 0, s: rnd(12, 22), room: r.id });
  },
  atmos(r) { // dust pulled toward a breach / dump valve
    const tx = r.venting ? r.vent : r.breachX, ty = r.venting ? r.y0 + 8 : r.breachY;
    const x = rnd(r.x0 + 6, r.x1 - 6), y = rnd(r.y0 + 20, r.fy - 2);
    this.add({ k: 'atmos', x, y, tx, ty, life: rnd(0.8, 1.6), t: 0, room: r.id, dbr: chance(0.08) });
  },
  update(dt) {
    for (const p of this.parts) {
      p.t += dt;
      if (p.k === 'spark' || p.k === 'ichor') { p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      else if (p.k === 'foam') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy += 30 * dt; }
      else if (p.k === 'smoke') { p.x += p.vx * dt; p.y += p.vy * dt; const r = G.roomById[p.room]; if (p.y < r.y0 + 18) p.y = r.y0 + 18; p.s += dt * 6; }
      else if (p.k === 'atmos') { const dx = p.tx - p.x, dy = p.ty - p.y; const d = Math.hypot(dx, dy) + 1; const sp = 120 + 300 / Math.max(0.3, d / 60); p.x += (dx / d) * sp * dt; p.y += (dy / d) * sp * dt; if (d < 8) p.t = p.life; }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.life);
  },
  draw(ctx) {
    for (const p of this.parts) {
      const a = 1 - p.t / p.life;
      if (p.k === 'spark') { ctx.fillStyle = p.c; ctx.globalAlpha = a; ctx.fillRect(p.x, p.y, 1.4, 1.4); }
      else if (p.k === 'ichor') { ctx.fillStyle = '#2a2016'; ctx.globalAlpha = a; ctx.fillRect(p.x, p.y, 1.6, 1.6); }
      else if (p.k === 'foam') { ctx.fillStyle = p.fire ? '#c8b89a' : '#d9d6cc'; ctx.globalAlpha = a * 0.6; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 + p.t * 2), 0, 6.3); ctx.fill(); }
      else if (p.k === 'smoke') { ctx.globalAlpha = Math.min(1, a * 1.3, p.t * 2) * 0.55; ctx.drawImage(ART.smoke, p.x - p.s * 1.4, p.y - p.s * 1.4, p.s * 2.8, p.s * 2.8); }
      else if (p.k === 'atmos') { ctx.fillStyle = p.dbr ? '#3a3a36' : '#c8c6bc'; ctx.globalAlpha = 0.55 * a + (p.dbr ? 0.35 : 0); ctx.fillRect(p.x, p.y, p.dbr ? 3 : 1.4, p.dbr ? 2 : 1.4); }
      else if (p.k === 'tracer') { ctx.strokeStyle = '#ffe2a8'; ctx.globalAlpha = a * 0.8; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.tx, p.ty); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  },
};
