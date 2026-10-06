'use strict';
// ============================================================================
// RENDER — world, dynamic machinery, crew, organism, lighting, overlays
// ============================================================================
const R = {
  cv: null, ctx: null, W: 0, H: 0, dpr: 1, mask: null, mctx: null,
  cam: { x: 900, y: 270, z: 0.7, tx: 900, ty: 270, tz: 0.7 },
};
const SKIN = ['#d9b89a', '#c39a78', '#a47454', '#7e5638', '#5a3a26'];
const HAIR = ['#1b1612', '#4a3020', '#8a6a40', '#6b6b66'];

function initRender() {
  R.cv = document.getElementById('view'); R.ctx = R.cv.getContext('2d');
  R.mask = document.createElement('canvas'); R.mctx = R.mask.getContext('2d');
  resizeRender();
  window.addEventListener('resize', resizeRender);
  R.contamBlobs = {};
  for (const r of G.rooms) {
    const rng = mulberry32(r.x0 * 7 + r.deck * 13 + 5); const blobs = [];
    for (let i = 0; i < 40; i++) {
      const k = i / 40;
      const along = (rng() - 0.5) * (20 + k * 160);
      const down = rng() * (6 + k * 110) * (rng() < 0.6 ? 0.3 : 1);
      blobs.push({ x: r.vent + along, y: r.y0 + 10 + down, s: 1.5 + rng() * 4 * (1 - k * 0.5), gl: rng() });
    }
    R.contamBlobs[r.id] = blobs;
  }
}
function resizeRender() {
  R.dpr = Math.min(2, window.devicePixelRatio || 1);
  R.W = window.innerWidth; R.H = window.innerHeight;
  R.cv.width = R.W * R.dpr; R.cv.height = R.H * R.dpr;
  R.cv.style.width = R.W + 'px'; R.cv.style.height = R.H + 'px';
  R.mask.width = Math.ceil(R.W / 2); R.mask.height = Math.ceil(R.H / 2);
}
function w2s(x, y) { const c = R.cam; return [(x - c.x) * c.z + R.W / 2 + (R.shx || 0), (y - c.y) * c.z + R.H / 2 + (R.shy || 0)]; }
function s2w(sx, sy) { const c = R.cam; return [(sx - R.W / 2) / c.z + c.x, (sy - R.H / 2) / c.z + c.y]; }
function nightFactor() { const h = fmtClock(G.t).hour; return h >= 22 || h < 6 ? 1 : 0; }

// ---------------------------------------------------------------------------
function render(dtReal) {
  const ctx = R.ctx, cam = R.cam;
  cam.x = lerp(cam.x, cam.tx, Math.min(1, dtReal * 10)); cam.y = lerp(cam.y, cam.ty, Math.min(1, dtReal * 10)); cam.z = lerp(cam.z, cam.tz, Math.min(1, dtReal * 12));
  const sh = G.shake || 0;
  R.shx = sh > 0.05 ? rnd(-sh, sh) : 0; R.shy = sh > 0.05 ? rnd(-sh, sh) : 0;
  G.shake = Math.max(0, sh - dtReal * 8);
  const z = cam.z, D = R.dpr;
  ctx.setTransform(D, 0, 0, D, 0, 0);
  ctx.fillStyle = '#040505'; ctx.fillRect(0, 0, R.W, R.H);
  // parallax colossus
  const pz = z * 0.55, px = R.W / 2 - (cam.x * 0.35) * pz - 1300 * pz * 0.5, py = R.H / 2 - (cam.y * 0.35) * pz - 520 * pz;
  ctx.globalAlpha = 1; ctx.drawImage(ART.colossus, px, py, 2600 * pz, 1200 * pz);
  // world
  const wx = R.W / 2 - cam.x * z + R.shx, wy = R.H / 2 - cam.y * z + R.shy;
  ctx.setTransform(z * D, 0, 0, z * D, wx * D, wy * D);
  ctx.imageSmoothingEnabled = true;
  const [vx0, vy0] = s2w(0, 0), [vx1, vy1] = s2w(R.W, R.H);
  blitWorld(ctx, ART.exterior, ART.EX.x, ART.EX.y, ART.EX.w, ART.EX.h, 1, vx0, vy0, vx1, vy1);
  drawExteriorDynamic(ctx);
  const hi = z * D > 1.05;
  blitWorld(ctx, hi ? ART.interior : ART.interior1, ART.OX, ART.OY, ART.IW, ART.IH, hi ? ART.S : 1, vx0, vy0, vx1, vy1);
  const visible = G.rooms.filter((r) => r.x1 > vx0 && r.x0 < vx1 && r.y1 > vy0 && r.y0 < vy1);
  for (const r of visible) drawRoomDynamic(ctx, r);
  for (const d of G.doors) drawDoor(ctx, d);
  for (const r of visible) drawHazards(ctx, r);
  drawEntities(ctx);
  FX.draw(ctx);
  // lighting
  drawLighting(visible);
  ctx.setTransform(D, 0, 0, D, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(R.mask, 0, 0, R.W, R.H);
  ctx.setTransform(z * D, 0, 0, z * D, wx * D, wy * D);
  ctx.globalCompositeOperation = 'lighter';
  drawGlows(ctx, visible);
  ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(D, 0, 0, D, 0, 0);
  drawOverlays(ctx, visible);
  drawPost(ctx);
}

// draw only the visible part of a big pre-rendered world layer
function blitWorld(ctx, img, wx, wy, ww, wh, scale, vx0, vy0, vx1, vy1) {
  const x0 = Math.max(wx, Math.floor(vx0) - 2), y0 = Math.max(wy, Math.floor(vy0) - 2);
  const x1 = Math.min(wx + ww, Math.ceil(vx1) + 2), y1 = Math.min(wy + wh, Math.ceil(vy1) + 2);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.drawImage(img, (x0 - wx) * scale, (y0 - wy) * scale, (x1 - x0) * scale, (y1 - y0) * scale, x0, y0, x1 - x0, y1 - y0);
}

// ---------------------------------------------------------------------------
function drawExteriorDynamic(ctx) {
  // navigation lights
  const blink = (G.t * 0.7) % 2 < 0.12;
  if (blink) { ctx.fillStyle = 'rgba(240,235,220,0.9)'; ctx.fillRect(1283, -212, 3, 3); ctx.fillRect(2300, 255, 3, 3); }
  if ((G.t * 0.7 + 1) % 2 < 0.1) { ctx.fillStyle = 'rgba(200,40,30,0.9)'; ctx.fillRect(-258, 270, 3, 3); }
  // EVA crew outside
  if (G.eva) for (const id of G.eva.ids) {
    const c = G.crew[id]; if (!c.eva || !c.alive) continue;
    const k = c.evaX; const x = -20 - k * 520 + Math.sin(c.evaPhase * 0.8) * 6, y = -60 - k * 40 + Math.sin(c.evaPhase * 0.6 + id) * 8 - id % 2 * 20;
    ctx.strokeStyle = 'rgba(160,150,120,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-4, 100); ctx.quadraticCurveTo(x + 40, y + 80, x, y); ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(c.evaPhase * 0.4) * 0.4);
    ctx.fillStyle = '#7a776a'; ctx.fillRect(-5, -10, 10, 14); ctx.beginPath(); ctx.arc(0, -13, 5, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#121314'; ctx.beginPath(); ctx.arc(1.5, -13, 3, 0, 6.3); ctx.fill();
    ctx.fillRect(-4, 4, 3, 8); ctx.fillRect(1, 4, 3, 8);
    ctx.restore();
    R.evaLights = R.evaLights || []; R.evaLights.push({ x, y: y - 13 });
  }
  // salvage fragment
  if (G.eva) { ctx.fillStyle = '#1c1d1b'; ctx.save(); ctx.translate(-560, -110); ctx.rotate(G.t * 0.02); ctx.fillRect(-60, -18, 120, 36); ctx.fillStyle = '#2b2620'; ctx.fillRect(-40, -12, 30, 24); ctx.restore(); }
  // incoming debris streak
  if (G.meteor && G.meteor.t < G.meteor.dur) {
    const m = G.meteor, k = m.t / m.dur;
    const x = lerp(m.sx, m.tx, k), y = lerp(m.sy, m.ty, k);
    ctx.strokeStyle = 'rgba(230,200,160,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (m.tx - m.sx) * 0.08, y - (m.ty - m.sy) * 0.08); ctx.stroke();
  }
}

function screenLines(ctx, s, col, t, seed, rows = 4) {
  ctx.fillStyle = col;
  for (let i = 0; i < rows; i++) {
    const w = (0.3 + ((Math.sin(seed * 13.1 + i * 7.7 + Math.floor(t * 0.8 + i)) + 1) / 2) * 0.6) * (s.w - 4);
    ctx.fillRect(s.x + 2, s.y + 2 + i * (s.h - 3) / rows, w, Math.max(0.8, (s.h - 4) / rows * 0.45));
  }
}
function drawRoomDynamic(ctx, r) {
  const A = ART.rooms[r.id]; const t = G.t, pw = r.powered;
  const flick = r.flick > 0 || r.interference > 0.2 || (G.brownout && chance(0.1));
  // screens
  for (const s of A.screens) {
    if (!pw || (flick && chance(0.3))) { ctx.fillStyle = '#060707'; ctx.fillRect(s.x, s.y, s.w, s.h); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(s.x + 1, s.y + 1, s.w * 0.4, 1); continue; }
    const warn = r.integ < 50 || r.fire > 0 || r.breach > 0;
    ctx.fillStyle = '#0c120d'; ctx.fillRect(s.x, s.y, s.w, s.h);
    const col = warn && Math.floor(t * 2) % 2 ? '#b0702a' : '#6f8a62';
    if (s.kind === 'cycle') { const k = G.roomById.airlock.p / 101; ctx.fillStyle = '#6f8a62'; ctx.fillRect(s.x + 2, s.y + 2, (s.w - 4) * k, s.h - 4); }
    else if (s.kind === 'vitals') { ctx.strokeStyle = col; ctx.lineWidth = 0.7; ctx.beginPath(); for (let i = 0; i < s.w; i++) { const ph = (i + t * 30) % 20; const yy = s.y + s.h / 2 - (ph > 8 && ph < 10 ? 4 : 0) + (ph > 10 && ph < 11 ? 3 : 0); i ? ctx.lineTo(s.x + i, yy) : ctx.moveTo(s.x, yy); } ctx.stroke(); }
    else if (s.kind === 'radar') { ctx.strokeStyle = '#4a5e44'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2, s.h / 2 - 1, 0, 6.3); ctx.stroke(); const a = t * 2; ctx.beginPath(); ctx.moveTo(s.x + s.w / 2, s.y + s.h / 2); ctx.lineTo(s.x + s.w / 2 + Math.cos(a) * (s.h / 2 - 1), s.y + s.h / 2 + Math.sin(a) * (s.h / 2 - 1)); ctx.strokeStyle = col; ctx.stroke(); if (G.meteor && G.sensors) { ctx.fillStyle = '#c09040'; ctx.fillRect(s.x + 4, s.y + 4, 2, 2); } }
    else if (s.kind === 'map') { ctx.fillStyle = '#2b3a2b'; for (const rr of G.rooms) { ctx.fillStyle = rr.fire > 0 || rr.breach > 0 ? (Math.floor(t * 3) % 2 ? '#a0402a' : '#3a1a14') : !rr.observed ? '#151a15' : '#40583c'; ctx.fillRect(s.x + 2 + (rr.x0 / SHIP_W) * (s.w - 4), s.y + 2 + rr.deck * (s.h - 4) / 3, (rr.w / SHIP_W) * (s.w - 4) - 0.5, (s.h - 4) / 3 - 0.8); } }
    else if (s.kind === 'cryo') { ctx.fillStyle = G.cryoHeat > 30 ? '#a8701e' : '#4f7a4a'; ctx.fillRect(s.x + 2, s.y + s.h - 4, (s.w - 4) * (1 - G.cryoHeat / 100), 2); ctx.fillText ? 0 : 0; screenLines(ctx, { x: s.x, y: s.y, w: s.w, h: s.h - 5 }, col, t, 9, 3); }
    else screenLines(ctx, s, col, t, s.seed || s.x, s.h > 14 ? 5 : 3);
  }
  // security monitor wall
  if (A.monitorWall) {
    const m = A.monitorWall; const tw = m.w / 4, th = m.h / 3;
    G.rooms.forEach((rr, i) => {
      const x = m.x + (i % 4) * tw, y = m.y + Math.floor(i / 4) * th;
      if (!pw) { ctx.fillStyle = '#050606'; ctx.fillRect(x + 1, y + 1, tw - 2, th - 2); return; }
      if (!rr.observed) { ctx.fillStyle = '#0a0b0b'; ctx.fillRect(x + 1, y + 1, tw - 2, th - 2); ctx.fillStyle = 'rgba(160,160,150,0.25)'; for (let k = 0; k < 6; k++) ctx.fillRect(x + 1 + rnd(tw - 3), y + 1 + rnd(th - 3), 1, 1); return; }
      ctx.fillStyle = rr.fire > 0 ? '#3a2416' : rr.p < 60 ? '#1c2228' : !rr.powered ? '#0e0f0f' : '#2a302a'; ctx.fillRect(x + 1, y + 1, tw - 2, th - 2);
      ctx.fillStyle = 'rgba(180,190,170,0.18)'; ctx.fillRect(x + 2, y + th - 4, tw - 4, 1);
    });
  }
  // fans
  if (A.fans) for (const f of A.fans) {
    const on = r.id === 'o2' ? pw && G.groups.LIFE.powered : G.reactor.output > 5;
    f.a = (f.a || 0) + (on ? 0.25 : f.spin || 0) ; f.spin = on ? 0.25 : Math.max(0, (f.spin || 0.25) * 0.97);
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
    ctx.fillStyle = '#3c4242';
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.ellipse(f.r * 0.5, 0, f.r * 0.48, f.r * 0.16, 0.3, 0, 6.3); ctx.fill(); }
    ctx.fillStyle = '#1b1e1e'; ctx.beginPath(); ctx.arc(0, 0, f.r * 0.18, 0, 6.3); ctx.fill();
    ctx.restore();
  }
  // reactor core
  if (A.core) {
    const out = G.reactor.output / 132; const inst = G.reactor.instability;
    const c = A.core; const fl = 0.75 + Math.sin(t * 9) * 0.05 + (inst > 0.3 ? rnd(-inst, inst) * 0.4 : 0);
    ctx.fillStyle = out > 0.05 ? `rgba(${200 + inst * 40},${190 - inst * 80},${150 - inst * 100},${clamp(out * fl, 0, 1)})` : '#0a0b0a';
    ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 4; i++) ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2 + i * 8 + 3, c.w, 1.5);
  }
  // cryo pod status lamps
  if (A.pods) {
    const lostFrac = G.colonistsLost / 2400; const nDead = Math.ceil(lostFrac * A.pods.length * 6);
    for (const p of A.pods) {
      const dead = p.n < nDead;
      ctx.fillStyle = dead ? '#3a0c09' : !pw ? (Math.floor(t * 2 + p.n) % 2 ? '#7a4a14' : '#2a1a0a') : G.cryoHeat > 30 ? '#a8701e' : '#4f7a4a';
      ctx.fillRect(p.x, p.y, 3, 2);
    }
  }
  // plants
  if (A.plants) {
    const wilt = clamp(1 - r.integ / 100 + (pw ? 0 : 0.4) + (r.p < 50 ? 0.5 : 0), 0, 1);
    ctx.strokeStyle = wilt > 0.5 ? '#4a4228' : '#4b5a33'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const p of A.plants) { const sw = Math.sin(t * 0.8 + p.s * 10) * 1.2 * (r.p > 50 ? 1 : 0.2); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + sw, p.y - p.h * 0.5, p.x + sw * 2 + (wilt * 4), p.y - p.h * (1 - wilt * 0.4)); }
    ctx.stroke();
  }
  // camera dome + LED
  const cam = A.camera;
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cam.x, cam.y, 3, 0, Math.PI); ctx.fill();
  ctx.fillStyle = r.observed ? (Math.floor(t * 1.5) % 2 ? '#7b1f17' : '#2a0a08') : '#0d0d0d'; ctx.fillRect(cam.x - 0.7, cam.y + 1, 1.4, 1.4);
  if (r.cameraJammed) { ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cam.x - 3, cam.y); ctx.lineTo(cam.x + 2, cam.y + 6); ctx.stroke(); }
  // contamination (subtle, grows around vent)
  if (r.contam > 0.04) {
    const blobs = R.contamBlobs[r.id]; const n = Math.floor(clamp(r.contam, 0, 1) * blobs.length);
    for (let i = 0; i < n; i++) {
      const b = blobs[i]; const a = clamp((r.contam - i / blobs.length) * 3, 0, 1);
      ctx.fillStyle = `rgba(78,66,44,${0.75 * a})`; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.s * (0.8 + r.contam * 0.6), b.s * 0.7, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = `rgba(40,32,22,${0.6 * a})`; ctx.beginPath(); ctx.ellipse(b.x + 0.6, b.y + 0.5, b.s * 0.5, b.s * 0.35, 0, 0, 6.3); ctx.fill();
      if (b.gl > 0.5) { ctx.fillStyle = `rgba(190,180,135,${0.45 * a})`; ctx.fillRect(b.x - b.s * 0.4, b.y - b.s * 0.4, 1.2, 0.8); }
    }
    if (r.contam > 0.45) { // fibrous strands down the wall
      ctx.strokeStyle = `rgba(72,60,40,${clamp(r.contam - 0.45, 0, 0.5) * 1.6})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const x = r.vent - 30 + i * 12; ctx.moveTo(x, r.y0 + 10); ctx.bezierCurveTo(x + 8, r.y0 + 40, x - 8, r.y0 + 70, x + Math.sin(i) * 6, r.y0 + 30 + r.contam * 80); } ctx.stroke();
    }
    if (r.contam > 0.25) { const dy = (t * 6 + r.x0) % 40; ctx.fillStyle = 'rgba(40,34,22,0.5)'; ctx.fillRect(r.vent + 3, r.y0 + 12 + dy, 1.2, 2.4); }
  }
  // blood
  for (const b of r.blood) {
    ctx.fillStyle = b.odd ? 'rgba(70,58,38,0.85)' : 'rgba(112,26,18,0.9)';
    if (b.drag) { // smeared up the wall into the vent
      ctx.fillStyle = 'rgba(84,22,15,0.55)';
      for (let yy = b.y; yy < r.fy; yy += 3) { const w = 3 + Math.sin(yy * 0.31 + b.x) * 1.6 + (r.fy - yy) / 40; ctx.fillRect(b.x - w / 2 + Math.sin(yy * 0.13) * 2, yy, w, 3); }
      ctx.fillStyle = 'rgba(70,18,12,0.8)'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 7, 4, 0, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.ellipse(b.x + 4, r.fy + 0.5, 14, 2, 0, 0, 6.3); ctx.fill(); }
    else if (b.wall) { ctx.beginPath(); ctx.ellipse(b.x, b.y, 4 * b.s, 6 * b.s, 0, 0, 6.3); ctx.fill(); ctx.fillRect(b.x - 1, b.y, 1.5, 14 * b.s); ctx.fillRect(b.x + 2, b.y, 1, 9 * b.s); }
    else { ctx.beginPath(); ctx.ellipse(b.x, r.fy + 0.5, 12 * b.s, 2 * b.s, 0, 0, 6.3); ctx.fill(); }
  }
  // dead organism
  for (const m of G.creatures) if (!m.alive && m.deadRoom === r.id) drawCreatureBody(ctx, m.deadX, r.fy, 0, true);
}

function drawHazards(ctx, r) {
  const t = G.t;
  // breach hole
  if (r.breach > 0) {
    const x = r.breachX, y = r.breachY, s = 7 + r.breach * 16;
    // torn plating petals bent inward
    ctx.fillStyle = '#6a6c66';
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.7, y + Math.sin(a) * s * 0.6); ctx.lineTo(x + Math.cos(a + 0.25) * s * 1.35, y + Math.sin(a + 0.25) * s * 1.15); ctx.lineTo(x + Math.cos(a + 0.5) * s * 0.75, y + Math.sin(a + 0.5) * s * 0.65); ctx.fill(); }
    ctx.fillStyle = '#000';
    ctx.beginPath(); for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28; const rr = s * (0.6 + ((i * 37) % 10) / 20); i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(210,210,200,0.85)'; ctx.fillRect(x - 2, y + 1, 1, 1); ctx.fillRect(x + 3, y - 2, 0.8, 0.8); ctx.fillRect(x - 4, y - 3, 0.7, 0.7);
    if (r.p > 5) { ctx.strokeStyle = `rgba(200,205,210,${0.25 * r.p / 101})`; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const a = G.t * 3 + i; const rr = s * (1.6 + ((G.t * 2 + i * 0.37) % 1) * 2.5); ctx.beginPath(); ctx.arc(x, y, rr, a, a + 0.5); ctx.stroke(); } }
    ctx.strokeStyle = '#121212'; ctx.lineWidth = 1;
    ctx.beginPath(); for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; ctx.moveTo(x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.7); ctx.lineTo(x + Math.cos(a) * s * 2.2, y + Math.sin(a) * s * 1.8 + 4); } ctx.stroke();
    if (r.p < 50) { ctx.fillStyle = 'rgba(200,210,215,0.12)'; ctx.beginPath(); ctx.arc(x, y, s * 2.5, 0, 6.3); ctx.fill(); }
    if (r.p > 3 && chance(0.6 * r.breach + 0.2)) FX.atmos(r);
  }
  if (r.venting && r.p > 3 && chance(0.8)) FX.atmos(r);
  // electrical fault sparks
  if (r.elecFault && chance(0.05)) { FX.sparks(rnd(r.x0 + 20, r.x1 - 20), r.y0 + 18, 5); if (r.observed) AUDIO.spark(r); }
  // fire
  if (r.fire > 0) {
    for (const fx of r.fireXs) {
      const h = 18 + r.fire * 78;
      ctx.fillStyle = `rgba(255,140,50,${0.25 + r.fire * 0.3})`; ctx.beginPath(); ctx.ellipse(fx, r.fy, 26 + r.fire * 30, 3, 0, 0, 6.3); ctx.fill();
      for (let i = 0; i < 7; i++) {
        const ox = fx + Math.sin(t * 7 + i * 2.1) * 8 + (i - 3) * (5 + r.fire * 5);
        const hh = h * (0.5 + 0.5 * Math.abs(Math.sin(t * 5.3 + i * 1.7)));
        const g = ctx.createLinearGradient(0, r.fy, 0, r.fy - hh);
        g.addColorStop(0, 'rgba(255,190,90,0.95)'); g.addColorStop(0.4, 'rgba(220,100,30,0.8)'); g.addColorStop(1, 'rgba(90,30,10,0)');
        const w = 6 + r.fire * 5;
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox - w, r.fy); ctx.quadraticCurveTo(ox - w * 0.6, r.fy - hh * 0.6, ox + Math.sin(t * 9 + i) * 4, r.fy - hh); ctx.quadraticCurveTo(ox + w * 0.7, r.fy - hh * 0.5, ox + w, r.fy); ctx.fill();
      }
      // hot cores (additive)
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) { const ox = fx + Math.sin(t * 11 + i * 1.3) * 6 + (i - 1.5) * 7; const hh = h * 0.45 * (0.6 + 0.4 * Math.abs(Math.sin(t * 8 + i))); ctx.fillStyle = 'rgba(255,200,120,0.35)'; ctx.beginPath(); ctx.moveTo(ox - 3, r.fy); ctx.quadraticCurveTo(ox, r.fy - hh, ox + 3, r.fy); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      if (chance(0.35 * r.fire)) FX.smoke(r);
      if (chance(0.08)) FX.add({ k: 'spark', x: fx + rnd(-10, 10), y: r.fy - rnd(10, 40), vx: rnd(-20, 20), vy: rnd(-60, -30), life: rnd(0.4, 0.9), t: 0, c: '#ffb060' });
    }
    // smoke ceiling layer
    ctx.fillStyle = `rgba(10,9,8,${r.fire * 0.55})`; ctx.fillRect(r.x0, r.y0, r.w, 30 + r.fire * 50);
  }
  // frost in vacuum
  if (r.temp < -10) { ctx.fillStyle = `rgba(170,185,195,${clamp(-r.temp / 400, 0, 0.12)})`; ctx.fillRect(r.x0, r.y0, r.w, ROOM_H); }
}

function drawDoor(ctx, d) {
  const t = G.t; const m = effectiveMode(d);
  const lampCol = d.jammed ? (Math.floor(t * 3) % 2 ? '#c88a2a' : '#3a2a10') : m === 'sealed' ? (Math.floor(t * 2) % 2 ? '#c0281e' : '#4a100c') : m === 'locked' ? '#b8822a' : m === 'open' ? '#5b7f50' : '#9a968a';
  if (d.outer) {
    const r = G.roomById.airlock; const y = r.fy - 64;
    ctx.fillStyle = '#0a0b0b'; ctx.fillRect(-8, y, 14, 64);
    const h = 64 * (1 - d.anim);
    ctx.fillStyle = '#5b5e58'; ctx.fillRect(-8, y, 14, h / 2); ctx.fillRect(-8, y + 64 - h / 2, 14, h / 2);
    kHazLine(ctx, -8, y + h / 2 - 3, 14);
    ctx.fillStyle = lampCol; ctx.fillRect(-3, y - 6, 4, 3);
    return;
  }
  if (!d.hatch) {
    const r = G.roomById[d.a]; const y = r.fy - 50, x = d.x - 6;
    const h = 50 * (1 - d.anim) / 2;
    ctx.fillStyle = '#525752'; ctx.fillRect(x, y, 12, h); ctx.fillRect(x, y + 50 - h, 12, h);
    ctx.fillStyle = '#3a3e3a'; ctx.fillRect(x + 2, y + 3, 8, Math.max(0, h - 6)); ctx.fillRect(x + 2, y + 50 - h + 3, 8, Math.max(0, h - 6));
    if (h > 3) { ctx.fillStyle = PAL.yellowD; ctx.fillRect(x, y + h - 2, 12, 2); ctx.fillRect(x, y + 50 - h, 12, 2); }
    if (m === 'sealed' && d.anim < 0.1) { ctx.fillStyle = '#6b5a24'; ctx.fillRect(x - 3, y + 14, 18, 3); ctx.fillRect(x - 3, y + 32, 18, 3); }
    ctx.fillStyle = lampCol; ctx.fillRect(d.x - 2, y - 10, 4, 2.5);
    if (d.force > 0) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 3, y + 16 + rnd(-1, 1), 6, 4); }
  } else {
    const y = d.y, x = d.x;
    const w = 15 * (1 - d.anim);
    ctx.fillStyle = '#0a0b0b'; ctx.fillRect(x - 15, y - 6, 30, 12);
    ctx.fillStyle = '#4e534e'; ctx.fillRect(x - 15, y - 5, w, 10); ctx.fillRect(x + 15 - w, y - 5, w, 10);
    if (m === 'sealed') { ctx.fillStyle = '#6b5a24'; ctx.fillRect(x - 3, y - 7, 6, 14); }
    ctx.fillStyle = lampCol; ctx.fillRect(x + 18, y - 2, 3, 3);
  }
}
function kHazLine(ctx, x, y, w) { ctx.fillStyle = PAL.yellowD; ctx.fillRect(x, y, w, 3); }

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
function drawEntities(ctx) {
  const list = [];
  for (const c of G.crew) if (!c.eva && !(c.missing)) list.push(c);
  list.sort((a, b) => (a.alive ? 1 : 0) - (b.alive ? 1 : 0));
  for (const c of list) {
    if (c.transformed) continue;
    drawCrew(ctx, c);
  }
  for (const m of G.creatures) if (m.alive && m.state === 'room') drawCreature(ctx, m);
  if (G.glimpse && G.t - G.glimpse.t < 0.5) { const r = G.roomById[G.glimpse.room]; ctx.globalAlpha = 0.85; drawCreatureBody(ctx, G.glimpse.x, r.fy, 0, false, 1); ctx.globalAlpha = 1; }
  // missing crew bodies discovered
  for (const c of G.crew) if (c.missing && c.bodyFound) { const r = G.roomById[c.bodyRoom]; drawBody(ctx, r.cx + (c.id % 3) * 30 - 30, r.fy, c); }
}
function drawBody(ctx, x, y, c) {
  ctx.fillStyle = 'rgba(58,14,10,0.9)'; ctx.beginPath(); ctx.ellipse(x, y, 16, 2.5, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = PROF[c.prof].col; ctx.fillRect(x - 12, y - 5, 18, 5); ctx.fillStyle = SKIN[c.look.skin]; ctx.beginPath(); ctx.arc(x + 9, y - 3, 3, 0, 6.3); ctx.fill();
}

function drawCrew(ctx, c) {
  const pc = PROF[c.prof]; const skin = SKIN[c.look.skin];
  let x = c.x, y = c.y;
  const sel = UI.sel && UI.sel.type === 'crew' && UI.sel.id === c.id;
  const r = G.roomById[c.room];
  if (!c.alive || c.down) {
    // lying figure
    const tw = c.down ? Math.sin(G.t * 6 + c.id) * 0.5 : 0;
    ctx.save(); ctx.translate(x, y); ctx.scale(1.3, 1.3);
    ctx.fillStyle = shade(pc.col, -0.3); ctx.fillRect(-13, -6 + tw, 20, 6);
    ctx.fillStyle = '#25272a'; ctx.fillRect(-20, -4, 8, 4);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(10, -3.5, 3.4, 0, 6.3); ctx.fill();
    ctx.restore();
    if (!c.alive) { ctx.fillStyle = 'rgba(58,14,10,0.8)'; ctx.beginPath(); ctx.ellipse(x, y + 0.5, 15, 2.2, 0, 0, 6.3); ctx.fill(); }
    if (sel) selBracket(ctx, x, y - 8, 12);
    return;
  }
  // sleeping in bunk
  if (c.sleeping && c.atWork && c.room === 'quarters') {
    const b = ART.rooms.quarters.bunks[c.id % ART.rooms.quarters.bunks.length];
    ctx.fillStyle = '#5d5a52'; ctx.fillRect(b.x - 20, b.y - 4, 30, 5);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(b.x - 25, b.y - 3, 3.2, 0, 6.3); ctx.fill();
    if (sel) selBracket(ctx, b.x - 10, b.y - 8, 12);
    return;
  }
  const f = c.face; const moving = c.moving; const ph = c.phase;
  const climbing = !!c.climb;
  const sw = moving && !climbing ? Math.sin(ph) * 0.55 : 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(1.3, 1.3);
  if (c.hitFlash > 0) { ctx.translate(rnd(-1, 1), 0); }
  const dark = (col) => shade(col, -0.15);
  // legs
  const legCol = c.prof === 'Security' ? '#2a3036' : c.prof === 'Officer' ? '#23282f' : c.prof === 'Medic' || c.prof === 'Scientist' ? '#3a3b3a' : c.prof === 'Engineer' ? '#45443a' : shade(pc.col, -0.35);
  ctx.fillStyle = legCol;
  if (climbing) { const k = Math.sin(c.climb.t * 8); ctx.fillRect(-4, -11 + k * 2, 3, 11); ctx.fillRect(1, -11 - k * 2, 3, 11); }
  else {
    ctx.save(); ctx.translate(-1.5, -11); ctx.rotate(sw); ctx.fillRect(-1.6, 0, 3.2, 11); ctx.restore();
    ctx.save(); ctx.translate(1.5, -11); ctx.rotate(-sw); ctx.fillRect(-1.6, 0, 3.2, 11); ctx.restore();
    ctx.fillStyle = '#151515'; ctx.fillRect(-4 + Math.sin(sw) * 5, -1.5, 4, 1.5); ctx.fillRect(Math.sin(-sw) * 5, -1.5, 4, 1.5);
  }
  // torso
  const torso = c.prof === 'Medic' ? '#a9a598' : c.prof === 'Scientist' ? '#b3ae9f' : c.prof === 'Engineer' ? '#6b6a52' : pc.col;
  ctx.fillStyle = torso; ctx.fillRect(-4.5, -22, 9, 11.5);
  if (c.prof === 'Scientist') { ctx.fillRect(-5, -12, 10, 6); } // coat skirt
  if (c.prof === 'Medic') { ctx.fillStyle = PAL.green; ctx.fillRect(-4.5, -18, 9, 2); }
  if (c.prof === 'Engineer' || c.prof === 'Technician') { ctx.fillStyle = PAL.yellowD; ctx.fillRect(-4.5, -13, 9, 1.6); }
  if (c.prof === 'Security') { ctx.fillStyle = '#1e2429'; ctx.fillRect(-5.5, -22, 11, 6); }
  if (c.prof === 'Officer') { ctx.fillStyle = '#6b6650'; ctx.fillRect(f > 0 ? 1 : -3, -20, 2, 1.5); }
  // back rim
  ctx.fillStyle = 'rgba(220,214,196,0.25)'; ctx.fillRect(f > 0 ? -4.5 : 3.8, -22, 0.7, 11);
  // arms
  ctx.fillStyle = dark(torso);
  const working = c.atWork && c.task && ['repair', 'power', 'seal', 'extinguish', 'treat', 'decon', 'door', 'restart', 'reactor', 'scan', 'bloodtest'].includes(c.task.type);
  const fighting = c.task && c.task.type === 'fight' && c.armed;
  if (climbing) { const k = Math.sin(c.climb.t * 8); ctx.fillRect(-6, -30 - k * 2, 2.4, 10); ctx.fillRect(3.6, -30 + k * 2, 2.4, 10); }
  else if (fighting || (c.armed && c.task && c.task.type === 'security' && G.alertLevel === 2)) {
    ctx.fillRect(f > 0 ? 0 : -9, -20, 9, 2.6);
    ctx.fillStyle = '#121314'; ctx.fillRect(f > 0 ? 2 : -16, -21, 14, 2.4); ctx.fillRect(f > 0 ? 4 : -8, -19, 3, 3);
  } else if (working) {
    const k = Math.sin((c.workAnim || 0) * 9) * 1.5;
    ctx.save(); ctx.translate(f * 2, -21); ctx.rotate(f * (-1.1 + k * 0.1)); ctx.fillRect(-1.2, 0, 2.4, 10); ctx.restore();
    ctx.save(); ctx.translate(-f * 2, -21); ctx.rotate(f * (-0.7 - k * 0.1)); ctx.fillRect(-1.2, 0, 2.4, 9); ctx.restore();
    if (c.task.type === 'extinguish') { ctx.fillStyle = PAL.red; ctx.fillRect(f * 6 - 2, -18, 4, 7); }
  } else {
    ctx.save(); ctx.translate(-2.5 * f, -21); ctx.rotate(-sw * 0.8); ctx.fillRect(-1.2, 0, 2.4, 10); ctx.restore();
    ctx.save(); ctx.translate(2.5 * f, -21); ctx.rotate(sw * 0.8); ctx.fillRect(-1.2, 0, 2.4, 10); ctx.restore();
    if (c.armed) { ctx.fillStyle = '#121314'; ctx.save(); ctx.translate(0, -18); ctx.rotate(f * 0.9); ctx.fillRect(-1, -8, 2.2, 14); ctx.restore(); }
  }
  // head & headgear
  const hy = -26.5;
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(f * 0.6, hy, 3.6, 0, 6.3); ctx.fill();
  switch (c.prof) {
    case 'Engineer': ctx.fillStyle = PAL.yellow; ctx.beginPath(); ctx.arc(0, hy - 0.8, 4.3, Math.PI, 0); ctx.fill(); ctx.fillRect(-5, hy - 1, 10, 1.4); ctx.fillStyle = '#e8e2c8'; ctx.fillRect(f * 3, hy - 3.5, 1.5, 1.5); break;
    case 'Technician': ctx.fillStyle = '#3c4636'; ctx.beginPath(); ctx.arc(0, hy - 1, 4, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#151515'; ctx.fillRect(f > 0 ? 0 : -4, hy - 1, 4, 1.6); break;
    case 'Security': ctx.fillStyle = '#3a454e'; ctx.beginPath(); ctx.arc(0, hy - 0.2, 5, Math.PI * 0.9, Math.PI * 2.1); ctx.fill(); ctx.fillStyle = '#0d0f10'; ctx.fillRect(f > 0 ? 0.5 : -4.5, hy - 1.5, 4, 2.6); break;
    case 'Medic': ctx.fillStyle = '#c3bfb2'; ctx.beginPath(); ctx.arc(0, hy - 1.4, 3.9, Math.PI, 0); ctx.fill(); break;
    case 'Officer': ctx.fillStyle = '#20262d'; ctx.fillRect(-4.5, hy - 5, 9, 2.6); ctx.fillRect(f > 0 ? 0 : -6, hy - 2.8, 6, 1.2); break;
    case 'Scientist': ctx.fillStyle = HAIR[c.look.hairC]; ctx.beginPath(); ctx.arc(-f * 0.5, hy - 1, 3.9, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); if (c.look.hair > 2) ctx.fillRect(-f * 3.5 - 1, hy - 1, 2.5, 6); break;
  }
  // helmet lamp in dark
  if (!r.powered || !r.observed) { ctx.fillStyle = '#f2ead0'; ctx.fillRect(f * 3.5 - 0.7, hy - 1.5, 1.4, 1.4); }
  ctx.restore();
  if (c.hitFlash > 0) { ctx.fillStyle = 'rgba(160,30,20,0.35)'; ctx.fillRect(x - 8, y - 40, 16, 40); }
  if (sel) selBracket(ctx, x, y - 20, 23);
}
function selBracket(ctx, x, y, s) {
  ctx.strokeStyle = 'rgba(232,226,206,0.9)'; ctx.lineWidth = 1 / R.cam.z * 1.2;
  const k = s * 0.35;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cx = x + sx * s * 0.7, cy = y + sy * s; ctx.moveTo(cx, cy - sy * -k * 0 ); ctx.lineTo(cx - sx * k, cy); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - sy * k); }
  ctx.stroke();
}

function drawCreature(ctx, m) {
  const r = G.roomById[m.room];
  let y = r.fy;
  if (m.emergeT > 0) y = lerp(r.fy, r.y0 + 20, m.emergeT / 0.9);
  const lunge = m.lunge > 0 ? (m.lunge -= 1 / 60, m.face * 10) : 0;
  drawCreatureBody(ctx, m.x + lunge, y, m.phase, false, m.face, m.moving, m.mode);
}
function drawCreatureBody(ctx, x, y, ph, dead, face = 1, moving = false, mode = '') {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.25, 1.25);
  if (dead) { ctx.fillStyle = '#0c0b0a'; ctx.beginPath(); ctx.ellipse(0, -4, 30, 5, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = 'rgba(42,32,22,0.8)'; ctx.beginPath(); ctx.ellipse(6, 0, 26, 2.5, 0, 0, 6.3); ctx.fill(); ctx.restore(); return; }
  ctx.scale(face, 1);
  const bob = moving ? Math.abs(Math.sin(ph * 5)) * 2 : Math.sin(ph * 1.3) * 0.6;
  const st = moving ? Math.sin(ph * 5) : 0;
  const body = '#0b0a09', wet = 'rgba(120,108,92,0.55)', joint = '#3a2c25';
  ctx.strokeStyle = body; ctx.lineCap = 'round';
  // legs: digitigrade
  ctx.lineWidth = 3.2;
  for (const s of [1, -1]) { const k = st * s; ctx.beginPath(); ctx.moveTo(-2, -26 - bob); ctx.lineTo(-6 + k * 6, -13); ctx.lineTo(2 + k * 8, -6); ctx.lineTo(-1 + k * 9, 0); ctx.stroke(); }
  // torso: long, hunched forward
  ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-3, -26 - bob); ctx.quadraticCurveTo(0, -46 - bob, 13, -44 - bob); ctx.stroke();
  ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(10, -44 - bob); ctx.quadraticCurveTo(16, -46 - bob, 20, -41 - bob); ctx.stroke();
  // head: low, elongated, eyeless
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(22, -40 - bob, 6.5, 3.4, 0.45, 0, 6.3); ctx.fill();
  // arms: too long, reaching
  ctx.lineWidth = 2.2;
  const reach = mode === 'attack' || mode === 'hunt' ? 1 : 0;
  for (const s of [1, -1]) { const k = Math.sin(ph * (moving ? 5 : 1.1) + s) * (moving ? 4 : 1.2); ctx.beginPath(); ctx.moveTo(10, -42 - bob); ctx.lineTo(16 + k + reach * 8, -24 - reach * 10); ctx.lineTo(18 + k * 1.5 + reach * 16, -4 - reach * 22); ctx.stroke(); }
  // wet highlights
  ctx.strokeStyle = wet; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(-1, -33 - bob); ctx.quadraticCurveTo(3, -44 - bob, 12, -46.5 - bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(19, -42.5 - bob); ctx.lineTo(26, -40 - bob); ctx.stroke();
  ctx.fillStyle = joint; ctx.beginPath(); ctx.arc(-6 + st * 6, -13, 1.2, 0, 6.3); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Lighting: darkness mask with light holes (destination-out)
// ---------------------------------------------------------------------------
function lampIntensity(r, l) {
  if (!r.powered) return 0;
  let k = 1;
  if (r.flick > 0) k *= chance(0.5) ? 0.15 : 1;
  if (r.elecFault) k *= chance(0.15) ? 0.1 : 0.85;
  if (r.interference > 0.15) k *= chance(r.interference * 0.4) ? 0.05 : 1 - r.interference * 0.3;
  if (G.brownout) k *= 0.7 + Math.sin(G.t * 23 + l.ph) * 0.15;
  if (r.integ < 40) k *= chance(0.04) ? 0.2 : 0.85;
  if (G.alertLevel === 2) k *= 0.62;
  if (nightFactor() && (r.group === 'HAB' || r.id === 'mess')) k *= 0.45;
  return k;
}
function drawLighting(visible) {
  const m = R.mctx, cam = R.cam, z = cam.z, s = 0.5;
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.globalCompositeOperation = 'source-over';
  m.clearRect(0, 0, R.mask.width, R.mask.height);
  m.setTransform(z * s, 0, 0, z * s, (R.W / 2 - cam.x * z + R.shx) * s, (R.H / 2 - cam.y * z + R.shy) * s);
  // exterior ambient
  m.fillStyle = 'rgba(0,0,0,0.25)'; m.fillRect(-1000, -400, 3800, 1400);
  for (const r of visible) {
    let a;
    if (!r.observed) a = 0.985;
    else if (!r.powered) a = 0.93;
    else a = 0.7 + (G.alertLevel === 2 ? 0.08 : 0) + nightFactor() * (r.group === 'HAB' ? 0.12 : 0.04);
    if (r.p < 30) a = Math.min(0.99, a + 0.04);
    a = Math.min(0.99, a + r.fire * 0.12);
    m.fillStyle = `rgba(0,0,0,${a})`; m.fillRect(r.x0 - 6, r.y0, r.w + 12, ROOM_H);
  }
  m.globalCompositeOperation = 'destination-out';
  const L = ART.lightW;
  const cut = (x, y, rad, alpha) => { if (alpha <= 0.01) return; m.globalAlpha = Math.min(1, alpha); m.drawImage(L, x - rad, y - rad, rad * 2, rad * 2); };
  for (const r of visible) {
    const A = ART.rooms[r.id];
    if (r.observed) {
      for (const l of A.lights) {
        if (l.kind === 'grow') { if (r.powered && G.groups.HYD.powered) cut(l.x, l.y + 6, l.r, 0.5); continue; }
        const k = lampIntensity(r, l); cut(l.x, l.y + 14, l.r, 0.9 * k); if (k > 0.2) cut(l.x, r.fy - 20, l.r * 0.8, 0.35 * k);
      }
      if (r.powered) for (const sc of A.screens) cut(sc.x + sc.w / 2, sc.y + sc.h / 2 + 6, 22, 0.28);
      if (!r.powered || G.alertLevel === 2) for (const st of A.strips) cut(st.x, st.y, 22, 0.35);
      if (A.core) { const o = G.reactor.output / 132; cut(A.core.x, A.core.y + 10, 130, 0.75 * o); }
      for (const fx of r.fireXs) cut(fx, r.fy - 20, 70 + r.fire * 110, 0.85 * (0.85 + Math.sin(G.t * 13 + fx) * 0.15));
      if (G.alertLevel >= 1 && roomAlarm(r)) { const a = G.t * 4; cut(r.cx + Math.cos(a) * 60, r.y0 + 30, 70, 0.35); }
      if (A.windows) for (const w of A.windows) cut(w.x + w.w / 2, w.y + w.h / 2, 50, 0.12);
    }
    // crew torches (always — the only eyes in dead rooms)
    for (const c of G.crew) {
      if (!c.alive || c.room !== r.id || c.eva || c.missing) continue;
      if (r.observed && r.powered) continue;
      const hx = c.x, hy = c.y - 34;
      if (c.down) { cut(c.x, c.y - 4, 26, 0.6); continue; }
      cut(hx, hy, 20, 0.85);
      // cone
      m.globalAlpha = r.observed ? 0.5 : 0.92;
      m.save(); m.translate(hx, hy); m.scale(c.face, 1);
      const g = m.createRadialGradient(0, 0, 4, 0, 0, 150); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g; m.beginPath(); m.moveTo(0, 0); m.lineTo(150, -32); m.lineTo(150, 50); m.closePath(); m.fill();
      m.restore();
    }
  }
  for (const f of FX.flashes) cut(f.x, f.y, f.r, f.a * (1 - f.t / f.life));
  m.globalAlpha = 1; m.globalCompositeOperation = 'source-over';
}
function roomAlarm(r) { return r.fire > 0 || r.breach > 0 || r.p < 70 || r.venting || (G.t - r.lastCreatureSeen < 20) || r.elecFault || (r.id === 'reactor' && (G.reactor.instability > 0.4 || G.reactor.needsRestart)); }

function glow(ctx, key, x, y, rad, a) { if (a <= 0.01) return; ctx.globalAlpha = Math.min(1, a); ctx.drawImage(ART.lightC[key], x - rad, y - rad, rad * 2, rad * 2); }
function drawGlows(ctx, visible) {
  const t = G.t;
  for (const r of visible) {
    if (!r.observed) continue;
    const A = ART.rooms[r.id];
    for (const l of A.lights) {
      if (l.kind === 'grow') { if (r.powered && G.groups.HYD.powered) glow(ctx, 'grow', l.x, l.y + 4, l.r * 0.8, 0.12); continue; }
      const k = lampIntensity(r, l); glow(ctx, 'lamp', l.x, l.y + 12, l.r * 0.7, 0.1 * k);
    }
    const local = roomAlarm(r);
    if (G.alertLevel === 2 || !r.powered) {
      const pulse = 0.5 + 0.5 * Math.sin(t * (local ? 4 : 2));
      for (const st of A.strips) glow(ctx, 'red', st.x, st.y - 6, local ? 70 : 40, (local ? 0.3 : 0.1) * (0.5 + pulse * 0.5) * (r.powered ? 1 : 0.8));
      if (local && r.powered) glow(ctx, 'red', r.cx, r.y0 + 30, r.w * 0.6, 0.12 + pulse * 0.12);
    }
    if (local && G.alertLevel >= 1) { const a = t * 4; glow(ctx, G.alertLevel === 2 ? 'red' : 'amber', r.cx + Math.cos(a) * 60, r.y0 + 26, 80, 0.35); }
    if (A.core) { const o = G.reactor.output / 132; glow(ctx, G.reactor.instability > 0.3 ? 'amber' : 'core', A.core.x, A.core.y, 90, 0.25 * o); }
    for (const fx of r.fireXs) glow(ctx, 'fire', fx + Math.sin(t * 11) * 4, r.fy - 25, 90 + r.fire * 140, 0.55 * r.fire + 0.15 + Math.sin(t * 17 + fx) * 0.06);
    if (r.p < 35) glow(ctx, 'cold', r.cx, r.cy, r.w * 0.7, 0.12);
    if (r.contam > 0.3) glow(ctx, 'bio', r.vent, r.y0 + 30, 60 + r.contam * 60, 0.1 * r.contam);
    if (r.powered) for (const sc of A.screens) glow(ctx, 'screen', sc.x + sc.w / 2, sc.y + sc.h / 2, 18, 0.08);
    if (r.elecFault && chance(0.08)) glow(ctx, 'muzzle', rnd(r.x0, r.x1), r.y0 + 20, 40, 0.3);
  }
  for (const f of FX.flashes) glow(ctx, f.col, f.x, f.y, f.r, f.a * (1 - f.t / f.life));
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Overlays (screen space): unobserved rooms, sensor blips, tags, selection
// ---------------------------------------------------------------------------
function drawOverlays(ctx, visible) {
  const z = R.cam.z; const t = G.t;
  ctx.font = '600 10px "DejaVu Sans Mono", Consolas, monospace';
  for (const r of visible) {
    const [sx, sy] = w2s(r.x0, r.y0); const sw = r.w * z, shh = ROOM_H * z;
    if (!r.observed) {
      // static
      ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, shh); ctx.clip();
      ctx.globalAlpha = 0.07; ctx.drawImage(ART.grain, rnd(-200, 0), rnd(-200, 0), 512, 512); ctx.drawImage(ART.grain, rnd(-200, 0) + 512, rnd(-200, 0), 512, 512);
      ctx.globalAlpha = 0.05; ctx.fillStyle = '#cfc9b6'; for (let y = sy + ((t * 40) % 4); y < sy + shh; y += 4) ctx.fillRect(sx, y, sw, 1);
      ctx.restore(); ctx.globalAlpha = 1;
      const lines = [`${r.short} — ${r.powered ? 'NO FEED' : 'NO POWER'}`];
      if (G.sensors) {
        lines.push(`LIFE SIGNS ${r.lifeSigns + (r.ghost > t ? 1 : 0)}`);
        if (G.research.m100) { const nh = G.creatures.filter((mm) => mm.alive && mm.room === r.id && mm.state === 'room').length; if (nh) lines.push(`NON-HUMAN: ${nh}`); }
        if (r.motion > 0.3 || r.ghost > t) lines.push('MOVEMENT');
        if (r.ductMotion > 0.2) lines.push('DUCT MOVEMENT');
      } else lines.push('SENSORS OFFLINE');
      if (z > 0.35) {
        let mw = 0; for (const ln of lines) mw = Math.max(mw, ctx.measureText(ln).width);
        ctx.fillStyle = 'rgba(8,9,9,0.72)'; ctx.fillRect(sx + 6, sy + 6, mw + 10, lines.length * 12 + 6);
        lines.forEach((ln, i) => { ctx.fillStyle = i === 0 ? '#8e897c' : ln.includes('MOVEMENT') ? (Math.floor(t * 3) % 2 ? '#d0392c' : '#7a2018') : ln.includes('NON-HUMAN') ? '#d0392c' : '#c9c3b2'; ctx.fillText(ln, sx + 10, sy + 17 + i * 12); });
      }
      // motion tracker blips
      if (G.sensors) {
        const blip = (wx, wy, k) => { const [bx, by] = w2s(wx, wy); const p = (t * 1.6 + k) % 1; ctx.strokeStyle = `rgba(208,57,44,${0.9 - p})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(bx, by, 3 + p * 12, 0, 6.3); ctx.stroke(); ctx.fillStyle = 'rgba(208,57,44,0.9)'; ctx.fillRect(bx - 1.5, by - 1.5, 3, 3); };
        for (const c of G.crew) if (c.alive && c.room === r.id && c.moving && !c.eva) blip(c.x + Math.sin(t * 0.7 + c.id) * 25, c.y - 15, c.id * 0.3);
        for (const mm of G.creatures) if (mm.alive && mm.room === r.id && mm.state === 'room' && mm.moving) blip(mm.x + Math.sin(t * 0.9) * 25, mm.y - 20, 0.5);
        if (r.ghost > t) blip(r.vent + Math.sin(t) * 40, r.fy - 20, 0.2);
      }
    }
    // duct motion blips (visible even on observed rooms: the threat is in the ceiling)
    if (G.sensors && r.ductMotion > 0.2) {
      const [bx, by] = w2s(r.vent + Math.sin(t * 1.3 + r.x0) * 40, r.y0 - SLAB / 2);
      const p = (t * 1.6) % 1; ctx.strokeStyle = `rgba(208,57,44,${(0.9 - p) * r.ductMotion})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 2 + p * 10, 0, 6.3); ctx.stroke();
    }
    // status tags
    const tags = roomTags(r);
    if (tags.length && z > 0.3) {
      let ty = sy + 6; const tx = sx + sw - 6;
      for (const tg of tags) {
        const w = ctx.measureText(tg.t).width + 10;
        ctx.fillStyle = 'rgba(10,10,10,0.78)'; ctx.fillRect(tx - w, ty, w, 13);
        ctx.fillStyle = tg.c; ctx.fillRect(tx - w, ty, 2, 13);
        ctx.fillStyle = tg.blink && Math.floor(t * 3) % 2 ? '#e8e2ce' : tg.c; ctx.fillText(tg.t, tx - w + 6, ty + 10);
        ty += 15;
      }
    }
    // selection
    if (UI.sel && UI.sel.type === 'room' && UI.sel.id === r.id) {
      ctx.strokeStyle = 'rgba(232,226,206,0.8)'; ctx.lineWidth = 1.2; const k = 12;
      ctx.beginPath();
      for (const [cx, cy, dx, dy] of [[sx, sy, 1, 1], [sx + sw, sy, -1, 1], [sx, sy + shh, 1, -1], [sx + sw, sy + shh, -1, -1]]) { ctx.moveTo(cx + dx * k, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * k); }
      ctx.stroke();
    }
    if (UI.hoverRoom === r.id && !(UI.sel && UI.sel.id === r.id && UI.sel.type === 'room')) { ctx.strokeStyle = 'rgba(232,226,206,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, shh - 1); }
  }
  // crew labels: selected + ordered tasks
  for (const c of G.crew) {
    if (!c.alive || c.eva || c.missing) continue;
    const r = G.roomById[c.room];
    const vis = r.observed || true; // crew are always tracked by biomonitor when sensors are up
    const sel = UI.sel && UI.sel.type === 'crew' && UI.sel.id === c.id;
    const [sx, sy] = w2s(c.x, c.y - 46);
    if (!r.observed && !G.sensors && !sel) continue;
    if (sel || (z > 0.85 && UI.hoverCrew === c.id)) {
      ctx.fillStyle = 'rgba(10,10,10,0.75)'; const nm = c.name.toUpperCase(); const w = ctx.measureText(nm).width + 8;
      ctx.fillRect(sx - w / 2, sy - 22, w, 13); ctx.fillStyle = '#e8e2ce'; ctx.fillText(nm, sx - w / 2 + 4, sy - 12);
    }
    // task marker
    const ot = c.task && (c.task.ordered || ['fight', 'flee', 'panic'].includes(c.task.type) || c.down);
    if (c.down || ot || c.refused) {
      const col = c.down ? '#d0392c' : c.task && ['flee', 'panic'].includes(c.task.type) ? '#d08a2a' : c.task && c.task.type === 'fight' ? '#d0392c' : '#c9c3b2';
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(sx, sy - 2); ctx.lineTo(sx + 3, sy - 6); ctx.lineTo(sx, sy - 10); ctx.lineTo(sx - 3, sy - 6); ctx.closePath(); ctx.fill();
      const pr = c.task && c.task.prog > 0 && c.task.prog <= 1 && ['seal', 'power', 'door', 'scan', 'bloodtest'].includes(c.task.type) ? c.task.prog : null;
      if (pr !== null && z > 0.5) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - 10, sy, 20, 3); ctx.fillStyle = '#c9c3b2'; ctx.fillRect(sx - 10, sy, 20 * pr, 3); }
    }
    if (c.refused && G.t - c.refused.t < 6 && z > 0.5) { ctx.fillStyle = '#d08a2a'; ctx.fillText('REFUSED', sx - 22, sy - 14); }
  }
  // hovered door hint
  if (UI.hoverDoor) {
    const d = G.doorById[UI.hoverDoor]; const [sx, sy] = w2s(d.x, d.hatch ? d.y : d.y - 30);
    const txt = `${doorLabel(d)} — ${effectiveMode(d).toUpperCase()}${d.jammed ? ' (JAMMED)' : ''}${doorPowered(d) ? '' : ' (UNPOWERED)'}`;
    const w = ctx.measureText(txt).width + 10;
    ctx.fillStyle = 'rgba(10,10,10,0.85)'; ctx.fillRect(sx - w / 2, sy - 26, w, 14); ctx.fillStyle = '#e8e2ce'; ctx.fillText(txt, sx - w / 2 + 5, sy - 16);
  }
}
function roomTags(r) {
  const tags = [];
  if (r.venting) tags.push({ t: 'VENTING', c: '#d0392c', blink: true });
  if (r.fire > 0.02) tags.push({ t: `FIRE ${Math.round(r.fire * 100)}%`, c: '#d08a2a', blink: true });
  if (r.breach > 0) tags.push({ t: `HULL BREACH`, c: '#d0392c', blink: true });
  if (r.p < 90) tags.push({ t: `${Math.round(r.p)} kPa`, c: r.p < 50 ? '#d0392c' : '#d08a2a', blink: r.p < 50 });
  else if (effO2(r) < 17) tags.push({ t: `O2 ${effO2(r).toFixed(1)}%`, c: effO2(r) < 14 ? '#d0392c' : '#d08a2a' });
  if (r.elecFault) tags.push({ t: 'ELEC FAULT', c: '#d08a2a' });
  else if (!r.powered) tags.push({ t: 'NO POWER', c: '#8e897c' });
  if (r.integ < 60) tags.push({ t: `DMG ${Math.round(100 - r.integ)}%`, c: r.integ < 30 ? '#d0392c' : '#d08a2a' });
  if (r.sealed && !r.venting) tags.push({ t: 'SEALED', c: '#d0392c' });
  if (r.contamKnown) tags.push({ t: 'UNKNOWN RESIDUE', c: '#9a9460' });
  if (r.observed && G.t - r.lastCreatureSeen < 5) tags.push({ t: 'ORGANISM', c: '#d0392c', blink: true });
  return tags.slice(0, 5);
}

function drawPost(ctx) {
  const W = R.W, H = R.H, t = G.t;
  // vignette + film grain live in composited CSS layers (#fxVig, #fxGrain) — cheap on every GPU
  // red alert edge pulse
  if (G.alertLevel === 2) {
    const a = 0.06 + 0.05 * Math.sin(t * 3.5);
    const e = ctx.createLinearGradient(0, 0, 0, 60); e.addColorStop(0, `rgba(140,20,14,${a})`); e.addColorStop(1, 'rgba(140,20,14,0)');
    ctx.fillStyle = e; ctx.fillRect(0, 0, W, 60);
  }
  if (G.blackout) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H); }
}
