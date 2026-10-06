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
  drawBackground(ctx, z);
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

// parallax layers of the rest of the ship (far → mid), with slow moving lights
function bgXform(L, z) { const k = L.s * Math.pow(z / 0.7, L.zp); /* distant layers scale less with zoom */ return { k, ox: R.W / 2 - L.cx * k - (R.cam.x - 900) * z * L.f, oy: R.H / 2 - L.cy * k - (R.cam.y - 270) * z * L.f }; }
function drawBackground(ctx, z) {
  const t = G.t + performance.now() / 1000 * 0.2;
  // the layers only change when the camera moves: cache them at half resolution
  const key = `${Math.round(R.cam.x)}|${Math.round(R.cam.y)}|${R.cam.z.toFixed(3)}|${R.W}|${R.H}`;
  if (!R.bgCache || R.bgCache.width !== Math.ceil(R.W / 2) || R.bgCache.height !== Math.ceil(R.H / 2)) { R.bgCache = document.createElement('canvas'); R.bgCache.width = Math.ceil(R.W / 2); R.bgCache.height = Math.ceil(R.H / 2); R.bgKey = ''; }
  if (key !== R.bgKey) {
    R.bgKey = key; const b = R.bgCache.getContext('2d');
    b.setTransform(0.5, 0, 0, 0.5, 0, 0); b.fillStyle = '#040505'; b.fillRect(0, 0, R.W, R.H);
    for (const L of BG.layers) { const X = bgXform(L, z); b.drawImage(L.c, X.ox, X.oy, L.c.width * L.half * X.k, L.c.height * L.half * X.k); }
  }
  ctx.drawImage(R.bgCache, 0, 0, R.W, R.H);
  BG.layers.forEach((L, i) => {
    const X = bgXform(L, z);
    for (const m of BG.movers) if (m.layer === i) {
      const p = (m.ph + t * m.sp) % 1; const x = X.ox + lerp(m.x0, m.x1, p) * X.k, y = X.oy + lerp(m.y0, m.y1, p) * X.k;
      ctx.fillStyle = `rgba(${m.col},${m.tram ? 0.5 : 0.35})`; ctx.fillRect(x, y, Math.max(1, m.s * X.k * (m.tram ? 4 : 1)), Math.max(1, m.s * X.k));
    }
    for (const bc of BG.beacons) if (bc.layer === i) {
      const on = bc.steady || ((t + bc.ph) % bc.per < 0.18 ? 0.85 : 0); if (!on) continue;
      const x = X.ox + bc.x * X.k, y = X.oy + bc.y * X.k; ctx.fillStyle = `rgba(${bc.col},${on})`; ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
      if (!bc.steady) { ctx.fillStyle = `rgba(${bc.col},0.08)`; ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.3); ctx.fill(); }
    }
  });
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
  // cryo lower stack: each lost colonist is one dark berth
  if (ART.cryoStack) {
    const S = ART.cryoStack; const lost = Math.min(S.cols * S.rows, Math.round(G.colonistsLost));
    const warm = G.cryoHeat > 25; const blink = Math.floor(G.t * 2) % 2;
    if (warm) { ctx.fillStyle = blink ? 'rgba(168,112,30,0.35)' : 'rgba(168,112,30,0.15)'; ctx.fillRect(S.x0, S.y0, S.cols * S.pw, S.rows * S.ph); }
    ctx.fillStyle = '#070808';
    for (let i = 0; i < lost; i++) { const k = (i * 7919) % (S.cols * S.rows); ctx.fillRect(S.x0 + (k % S.cols) * S.pw, S.y0 + Math.floor(k / S.cols) * S.ph, S.pw - 3, S.ph - 2); }
  }
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
    if (r.interference > 0.18 && chance(r.interference)) { ctx.fillStyle = '#0c0d0d'; ctx.fillRect(s.x, s.y, s.w, s.h); ctx.fillStyle = 'rgba(190,190,180,0.5)'; for (let k = 0; k < s.w * s.h / 12; k++) ctx.fillRect(s.x + rnd(s.w - 1), s.y + rnd(s.h - 1), 1, 0.7); continue; }
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
  // ship memory
  drawScars(ctx, r);
  // room ambience
  if (r.id === 'reactor' && G.reactor.output > 20) { ctx.strokeStyle = `rgba(220,210,190,${0.04 + G.reactor.instability * 0.08})`; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const x = 90 + i * 24; ctx.beginPath(); for (let y = r.y0 + 20; y < r.y0 + 60; y += 3) ctx.lineTo(x + Math.sin(y * 0.3 + t * 6 + i) * 1.5, y); ctx.stroke(); } }
  if ((r.id === 'cryo' || r.id === 'hydro') && R.cam.z > 0.6) { ctx.fillStyle = r.id === 'cryo' ? 'rgba(170,190,200,0.05)' : 'rgba(170,180,150,0.04)'; for (let i = 0; i < 5; i++) { const mx = r.x0 + ((t * 8 + i * 170) % (r.w + 80)) - 40; ctx.beginPath(); ctx.ellipse(mx, r.id === 'cryo' ? r.fy - 6 : r.y0 + 28, 70, 9, 0, 0, 6.3); ctx.fill(); } }
  if ((r.id === 'o2' || r.id === 'hydro' || r.id === 'cryo') && chance(0.03) && r.p > 40) FX.add({ k: 'drip', x: r.x0 + 20 + rnd(r.w - 40), y: r.y0 + 32, vy: 0, life: 3, t: 0, floor: r.fy });
  // vent: flexing grille, dust and a swinging cable when something heavy moves in the duct
  const ventAct = G.creatures.some((m) => m.alive && m.state === 'vent' && (m.ventRoom === r.id && !m.vto || (m.vto === r.id && m.vprog > 0.55) || (m.vfrom === r.id && m.vto && m.vprog < 0.35)));
  if (ventAct) { r.cableSwing = Math.max(r.cableSwing || 0, 0.8); if (chance(0.25)) FX.add({ k: 'dust', x: r.vent + rnd(-8, 8), y: r.y0 + 11, vx: rnd(-4, 4), vy: rnd(5, 15), life: rnd(1.2, 2.2), t: 0 }); }
  r.cableSwing = Math.max(0, (r.cableSwing || 0) - 0.006);
  { const jx = ventAct ? Math.sin(t * 31) * 0.8 : 0, jy = ventAct ? Math.abs(Math.sin(t * 23)) * 1.2 : 0;
    if (r.ventBent) { ctx.fillStyle = '#060707'; ctx.fillRect(r.vent - 10, r.y0 + 1, 20, 10); ctx.save(); ctx.translate(r.vent + 9, r.y0 + 2); ctx.rotate(1.1 + Math.sin(t * 2) * 0.03 * (1 + r.cableSwing * 4)); ctx.fillStyle = '#3b3d3a'; ctx.fillRect(0, 0, 18, 9); ctx.fillStyle = '#1d1e1c'; for (let k = 2; k < 16; k += 3) ctx.fillRect(k, 1, 1, 7); ctx.restore(); }
    else if (ventAct) { ctx.fillStyle = '#060707'; ctx.fillRect(r.vent - 10, r.y0 + 1, 20, 10); ctx.fillStyle = '#3b3d3a'; ctx.fillRect(r.vent - 10 + jx, r.y0 + 1 + jy, 20, 10); ctx.fillStyle = '#1d1e1c'; for (let k = 2; k < 18; k += 3) ctx.fillRect(r.vent - 10 + jx + k, r.y0 + 2 + jy, 1, 8); } }
  { const sw = Math.sin(t * 5.5) * (r.cableSwing || 0) * 9; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(r.vent - 34, r.y0 + 15); ctx.quadraticCurveTo(r.vent - 20 + sw, r.y0 + 32, r.vent - 4, r.y0 + 15); ctx.stroke(); }
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
  if (G.shadowPass && G.t - G.shadowPass.t < 0.45) { const sp = G.shadowPass, r = G.roomById[sp.room], k = (G.t - sp.t) / 0.45; ctx.globalAlpha = 0.55 * Math.sin(k * Math.PI); drawCreatureBody(ctx, sp.x + sp.dir * (k * 46 - 10), r.fy, G.t * 3, false, sp.dir, true, 'hunt'); ctx.globalAlpha = 1; }
  if (G.glimpse && G.t - G.glimpse.t < 0.5) { const r = G.roomById[G.glimpse.room]; ctx.globalAlpha = 0.85; drawCreatureBody(ctx, G.glimpse.x, r.fy, 0, false, 1); ctx.globalAlpha = 1; }
  // missing crew bodies discovered
  for (const c of G.crew) if (c.missing && c.bodyFound) { const r = G.roomById[c.bodyRoom]; drawBody(ctx, r.cx + (c.id % 3) * 30 - 30, r.fy, c); }
}
function drawBody(ctx, x, y, c) {
  ctx.fillStyle = 'rgba(58,14,10,0.9)'; ctx.beginPath(); ctx.ellipse(x, y, 16, 2.5, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = PROF[c.prof].col; ctx.fillRect(x - 12, y - 5, 18, 5); ctx.fillStyle = SKIN[c.look.skin]; ctx.beginPath(); ctx.arc(x + 9, y - 3, 3, 0, 6.3); ctx.fill();
}

function drawScars(ctx, r) {
  if (!r.scars.length) return;
  ctx.save(); ctx.beginPath(); ctx.rect(r.x0, r.y0, r.w, ROOM_H); ctx.clip();
  for (const sc of r.scars) {
    const rng = mulberry32(sc.seed | 0);
    switch (sc.k) {
      case 'scorch': { // blackened wall above where it burned, charred floor
        ctx.fillStyle = 'rgba(6,5,4,0.85)'; ctx.beginPath(); ctx.ellipse(sc.x, r.fy + 0.5, 30 + sc.s * 16, 3, 0, 0, 6.3); ctx.fill();
        { const hr = 70 + sc.s * 50, gt = ctx.createRadialGradient(sc.x, r.fy - hr * 0.5, hr * 0.3, sc.x, r.fy - hr * 0.5, hr); gt.addColorStop(0, 'rgba(110,60,25,0.0)'); gt.addColorStop(0.55, 'rgba(110,60,25,0.32)'); gt.addColorStop(1, 'rgba(110,60,25,0)'); ctx.fillStyle = gt; ctx.fillRect(sc.x - hr, r.fy - hr * 1.5, hr * 2, hr * 1.5); }
        ctx.fillStyle = 'rgba(170,160,140,0.35)'; for (let i = 0; i < 10; i++) ctx.fillRect(sc.x - 30 + rng() * 60, r.fy - 20 - rng() * 70, 1.4, 1); // blistered paint
        const h = 80 + sc.s * 60, g = ctx.createRadialGradient(sc.x, r.fy, 4, sc.x, r.fy - h * 0.4, h);
        g.addColorStop(0, 'rgba(5,4,3,0.95)'); g.addColorStop(0.5, 'rgba(10,8,5,0.65)'); g.addColorStop(1, 'rgba(14,10,6,0)');
        ctx.fillStyle = g; ctx.fillRect(sc.x - h, r.fy - h * 1.3, h * 2, h * 1.3);
        ctx.fillStyle = 'rgba(30,22,14,0.5)'; for (let i = 0; i < 6; i++) ctx.fillRect(sc.x - 20 + rng() * 40, r.fy - 30 - rng() * 60, 1, 6 + rng() * 14);
        break; }
      case 'soot': { const g = ctx.createLinearGradient(0, r.y0, 0, r.y0 + 50); g.addColorStop(0, `rgba(10,9,8,${0.5 * sc.s})`); g.addColorStop(1, 'rgba(10,9,8,0)'); ctx.fillStyle = g; ctx.fillRect(r.x0, r.y0, r.w, 50); break; }
      case 'melt': ctx.fillStyle = '#2a2620'; ctx.beginPath(); ctx.moveTo(sc.x, sc.y); ctx.quadraticCurveTo(sc.x + 10, sc.y + 8, sc.x + 18, sc.y + 2); ctx.lineTo(sc.x + 16, sc.y + 20); ctx.quadraticCurveTo(sc.x + 8, sc.y + 26, sc.x + 2, sc.y + 18); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sc.x + 6, sc.y + 18, 1.5, 10); break;
      case 'patch': { const w = 18 + sc.s * 10, h = 14 + sc.s * 8; // welded plate over a breach
        ctx.fillStyle = '#5c625f'; ctx.fillRect(sc.x - w / 2, sc.y - h / 2, w, h); ctx.strokeStyle = '#6e5a3a'; ctx.lineWidth = 1.4; ctx.strokeRect(sc.x - w / 2, sc.y - h / 2, w, h);
        ctx.fillStyle = '#2a2c2a'; for (const [bx, by] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(sc.x + bx * (w / 2 - 3) - 0.8, sc.y + by * (h / 2 - 3) - 0.8, 1.6, 1.6);
        ctx.fillStyle = 'rgba(200,190,160,0.25)'; ctx.fillRect(sc.x - w / 2, sc.y - h / 2, w, 1); break; }
      case 'scratch': ctx.strokeStyle = 'rgba(170,165,150,0.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(sc.x + i * 3, sc.y); ctx.lineTo(sc.x + i * 3 + 9, sc.y + 16); } ctx.stroke(); break;
      case 'panel': ctx.fillStyle = '#4b5546'; ctx.fillRect(sc.x, sc.y, 18, 12); ctx.fillStyle = 'rgba(184,150,46,0.55)'; ctx.fillRect(sc.x - 2, sc.y + 2, 22, 2); ctx.fillRect(sc.x - 2, sc.y + 8, 22, 2); ctx.fillStyle = '#c9c3b2'; ctx.globalAlpha = 0.4; ctx.fillRect(sc.x + 4, sc.y + 4.5, 8, 1); ctx.globalAlpha = 1; break;
      case 'weld': ctx.strokeStyle = 'rgba(150,120,80,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sc.x, sc.y); for (let i = 1; i < 8; i++) ctx.lineTo(sc.x + i * 6, sc.y + (rng() - 0.5) * 3); ctx.stroke(); ctx.fillStyle = 'rgba(90,96,92,0.8)'; ctx.fillRect(sc.x + 4, sc.y - 10, 30, 9); ctx.strokeStyle = 'rgba(150,120,80,0.45)'; ctx.strokeRect(sc.x + 4, sc.y - 10, 30, 9); break;
      case 'frost': ctx.fillStyle = 'rgba(190,200,205,0.12)'; for (let i = 0; i < 18; i++) ctx.fillRect(r.x0 + rng() * r.w, r.y0 + 20 + rng() * 80, 1, 10 + rng() * 30); ctx.fillStyle = 'rgba(190,200,205,0.08)'; ctx.fillRect(r.x0, r.fy - 6, r.w, 6); break;
      case 'burnt': ctx.fillStyle = 'rgba(12,10,8,0.8)'; for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.ellipse(sc.x + (rng() - 0.5) * 50, r.y0 + 10 + rng() * 40, 1.5 + rng() * 3, 1 + rng() * 2, 0, 0, 6.3); ctx.fill(); } ctx.fillStyle = 'rgba(120,115,100,0.3)'; for (let i = 0; i < 10; i++) ctx.fillRect(sc.x + (rng() - 0.5) * 60, r.fy - rng() * 2, 2, 1); break;
    }
  }
  ctx.restore();
}
function selBracket(ctx, x, y, s) {
  ctx.strokeStyle = 'rgba(232,226,206,0.9)'; ctx.lineWidth = 1 / R.cam.z * 1.2;
  const k = s * 0.35;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cx = x + sx * s * 0.7, cy = y + sy * s; ctx.moveTo(cx, cy - sy * -k * 0 ); ctx.lineTo(cx - sx * k, cy); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - sy * k); }
  ctx.stroke();
}

function creatureVisibility(m, r) {
  // unobserved rooms: the organism exists only where a helmet lamp happens to point
  if (r.observed && r.powered) return 1;
  let v = r.observed ? 0.35 : 0;
  for (const c of G.crew) {
    if (!c.alive || c.down || c.room !== r.id) continue;
    const d = Math.abs(c.x - m.x), ahead = Math.sign(m.x - c.x) === c.face;
    if (ahead) v = Math.max(v, clamp((160 - d) / 70, 0, 1)); else v = Math.max(v, clamp((40 - d) / 30, 0, 1));
  }
  for (const f of FX.flashes) if (Math.abs(f.x - m.x) < f.r && Math.abs(f.y - m.y) < 80) v = 1;
  return v;
}
function drawCreature(ctx, m) {
  const r = G.roomById[m.room];
  const vis = creatureVisibility(m, r); if (vis <= 0.02) return;
  ctx.globalAlpha = vis;
  let y = r.fy;
  if (m.emergeT > 0) y = lerp(r.fy, r.y0 + 20, m.emergeT / 0.9);
  const lunge = m.lunge > 0 ? (m.lunge -= 1 / 60, m.face * 10) : 0;
  drawCreatureBody(ctx, m.x + lunge, y, m.phase, false, m.face, m.moving, m.mode);
  ctx.globalAlpha = 1;
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
  ctx.lineWidth = 8.5; ctx.beginPath(); ctx.moveTo(-3, -26 - bob); ctx.quadraticCurveTo(0, -46 - bob, 13, -44 - bob); ctx.stroke();
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-1, -30 - bob); ctx.quadraticCurveTo(4, -50 - bob, 11, -48 - bob); ctx.stroke(); // compressed shoulder mass
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
  if (localAlarm(r)) k *= 0.62;
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
  m.fillStyle = 'rgba(0,0,0,0.12)'; m.fillRect(-1000, -400, 3800, 1400);
  for (const r of visible) {
    let a;
    if (!r.observed) a = 0.9;
    else if (!r.powered) a = 0.86;
    else a = 0.7 + (localAlarm(r) ? 0.08 : 0) + nightFactor() * (r.group === 'HAB' ? 0.12 : 0.04);
    if (r.feedCollapse > 0) a = r.feedCollapse > 0.45 ? 0.3 : 0.99;
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
      if (!r.powered || localAlarm(r)) for (const st of A.strips) cut(st.x, st.y, 22, r.powered ? 0.35 : 0.5);
      if (!r.powered) {
        // dying ballast: a lamp stutters now and then; sparks briefly light the room
        if (r.flick > 0 || chance(0.004)) { const l = A.lights[Math.floor(G.t * 3) % A.lights.length]; if (chance(0.4)) cut(l.x, l.y + 14, l.r * 0.7, 0.45); }
        for (const sc of A.screens) cut(sc.x + sc.w, sc.y + sc.h, 8, 0.25); // standby LEDs
        if (r.breach > 0) cut(r.breachX, r.breachY, 60, 0.3); // cold starlight through the hole
      }
      if (r.breach > 0) cut(r.breachX, r.breachY + 10, 80, 0.4);
      if (A.core) { const o = G.reactor.output / 132; cut(A.core.x, A.core.y + 10, 130, 0.75 * o); }
      for (const fx of r.fireXs) cut(fx, r.fy - 20, 70 + r.fire * 110, 0.85 * (0.85 + Math.sin(G.t * 13 + fx) * 0.15));
      if (G.alertLevel >= 1 && roomAlarm(r)) { const a = G.t * 4; cut(r.cx + Math.cos(a) * 60, r.y0 + 30, 70, 0.35); }
      if (A.windows) for (const w of A.windows) cut(w.x + w.w / 2, w.y + w.h / 2, 50, 0.12);
    }
    // light leaking through open doors from a lit neighbour
    if (!r.powered || !r.observed) for (const e of G.adj[r.id]) {
      const o = G.roomById[e.to], d = e.door; if (!o.powered || d.anim < 0.1) continue;
      if (d.hatch) { cut(d.x, o.deck < r.deck ? r.y0 + 6 : r.fy - 4, 50, 0.4 * d.anim); }
      else cut(d.x + (r.cx > d.x ? 8 : -8), r.fy - 26, 70, 0.45 * d.anim);
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
function localAlarm(r) { // red emergency light only where the emergency is (and right next to it)
  if (roomAlarm(r)) return true;
  if (G.alertLevel < 2) return false;
  return G.adj[r.id].some((e) => { const o = G.roomById[e.to]; return o.fire > 0.05 || o.breach > 0 || o.venting || G.t - o.lastCreatureSeen < 20; });
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
    const red = localAlarm(r);
    const emergency = red && (r.fire > 0.05 || r.breach > 0 || r.venting || r.p < 70 || G.t - r.lastCreatureSeen < 20 || G.reactor.needsRestart && r.id === 'reactor' || !local);
    if (emergency || !r.powered) {
      const pulse = 0.5 + 0.5 * Math.sin(t * (emergency ? 4 : 1.5));
      for (const st of A.strips) glow(ctx, 'red', st.x, st.y - 6, emergency ? 70 : 34, (emergency ? 0.3 : 0.09) * (0.5 + pulse * 0.5));
      if (emergency && r.powered && local) glow(ctx, 'red', r.cx, r.y0 + 30, r.w * 0.6, 0.1 + pulse * 0.1);
    }
    if (red) { const a = t * 4; glow(ctx, emergency ? 'red' : 'amber', r.cx + Math.cos(a) * 60, r.y0 + 26, 80, emergency ? 0.35 : 0.28); }
    else if (r.integ < 50 || r.elecFault || r.leak) { const a = t * 3; glow(ctx, 'amber', r.cx + Math.cos(a) * 50, r.y0 + 26, 60, 0.18); } // yellow warning: subtle
    if (!r.powered) for (const sc of A.screens) glow(ctx, Math.floor(t * 0.8 + sc.x) % 3 ? 'red' : 'amber', sc.x + sc.w, sc.y + sc.h, 7, 0.5); // battery-backed standby LEDs
    if (r.breach > 0) glow(ctx, 'cold', r.breachX, r.breachY, 80 + r.breach * 60, 0.3);
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
