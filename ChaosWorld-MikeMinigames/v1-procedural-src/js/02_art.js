/* ==========================================================================
   ART — procedural Chaos World-style characters (thick outlines, chunky,
   exaggerated). Any PNG dropped into /assets with a matching slot name is
   embedded at build time and used instead (see tools/import-battlelab-assets.js).
   ========================================================================== */
const ASSET_DATA = /*__ASSETS__*/{};
const ART = {
  img: {}, cache: {},
  init() {
    for (const k in ASSET_DATA) { const im = new Image(); im.src = ASSET_DATA[k]; this.img[k] = im; }
  },
  has(id) { const im = this.img[id]; return im && im.complete && im.naturalWidth > 0; },
  // Draw override image anchored bottom-centre at (0,0) with height h, if present.
  sprite(ctx, id, h, flip) {
    if (!this.has(id)) return false;
    const im = this.img[id], w = (im.naturalWidth / im.naturalHeight) * h;
    ctx.save(); if (flip) ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
    return true;
  },
  canvas(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); fn(x, w, h); return c; },
};
const OL = '#14090b';
// Draw fn() into an offscreen buffer covering world rect (x,y,w,h), tint it, then composite.
// Used for hit-flashes so the tint only touches the sprite, never the background.
const FLASHBUF = document.createElement('canvas');
function tinted(ctx, amt, color, x, y, w, h, fn) {
  if (!(amt > 0.02)) { fn(ctx); return; }
  const k = (typeof Game !== 'undefined' && Game.k) || 1, c = FLASHBUF;
  const cw = Math.ceil(w * k), ch = Math.ceil(h * k);
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; } 
  const x2 = c.getContext('2d');
  x2.setTransform(1, 0, 0, 1, 0, 0); x2.globalCompositeOperation = 'source-over'; x2.clearRect(0, 0, cw, ch);
  x2.setTransform(k, 0, 0, k, -x * k, -y * k); fn(x2);
  x2.setTransform(1, 0, 0, 1, 0, 0); x2.globalCompositeOperation = 'source-atop'; x2.globalAlpha = Math.min(1, amt);
  x2.fillStyle = color; x2.fillRect(0, 0, cw, ch); x2.globalAlpha = 1; x2.globalCompositeOperation = 'source-over';
  ctx.drawImage(c, 0, 0, cw, ch, x, y, w, h);
}
function limb(ctx, x1, y1, x2, y2, w, col) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OL; ctx.lineWidth = w + 6; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function blob(ctx, fill, lw = 4) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OL; ctx.lineJoin = 'round'; ctx.stroke(); }
function circ(ctx, x, y, r, fill, lw = 4) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); blob(ctx, fill, lw); }
function ell(ctx, x, y, rx, ry, rot, fill, lw = 4) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); blob(ctx, fill, lw); }
function poly(ctx, pts, fill, lw = 4) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); blob(ctx, fill, lw); }
function shadow(ctx, x, y, rx, ry, a = 0.35) { ctx.fillStyle = 'rgba(0,0,0,' + a + ')'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

/* ---------- HEROES ---------- */
const HERO_DEF = {
  scrub: { name: 'SCRUB', skin: '#f2b48a', top: '#7a9a2e', top2: '#5a7420', legs: '#6b4a2e', boots: '#3a2416', accent: '#e8432a', w: 1 },
  archer: { name: 'ARCHER', skin: '#e8a57e', top: '#1fae8c', top2: '#147a63', legs: '#3b3150', boots: '#2a1d14', accent: '#ffd21f', w: 0.95 },
  knight: { name: 'KNIGHT', skin: '#f0b083', top: '#2d6bd8', top2: '#1d47a0', legs: '#4b5468', boots: '#2b2f3a', accent: '#d8dde8', w: 1.18 },
  hexa: { name: 'HEXA', skin: '#cfe3ff', top: '#7a2cff', top2: '#4d16a8', legs: '#2c1c48', boots: '#1a0f2a', accent: '#ff2e88', w: 0.95 },
};
// pose: idle | brace | throw | attack | hurt | ko | run | cheer.  p = 0..1 phase.
function drawHero(ctx, id, x, y, sc, o = {}) {
  const D = HERO_DEF[id], t = o.t || 0, pose = o.pose || 'idle', p = o.p || 0;
  ctx.save(); ctx.translate(x, y);
  shadow(ctx, 0, 0, 26 * sc, 8 * sc);
  ctx.scale(sc * (o.flip ? -1 : 1), sc);
  if (ART.sprite(ctx, id, 92, false)) { ctx.restore(); return; }
  let lean = 0, bob = Math.sin(t * 6) * 1.5, legA = 0, legB = 0, armF = -0.6, armB = 0.5, eye = 'norm', mouth = 'grin';
  if (pose === 'brace') { lean = -0.42 - (o.strain || 0) * 0.15 + Math.sin(t * 40) * 0.02 * (o.strain || 0); legA = 0.55; legB = -0.25; armF = -1.45; armB = -1.3; mouth = 'grit'; bob = 0; }
  else if (pose === 'throw') { const s = Math.sin(t * 18); armF = -2.6 + s * 0.6; armB = 0.8; lean = -0.1; mouth = 'yell'; }
  else if (pose === 'attack') { const k = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65; armF = -2.6 + (1 - k) * 0 + Ease.outCubic(1 - Math.abs(1 - p * 2)) * 2.4; lean = 0.15 * Math.sin(p * Math.PI); legA = 0.4; legB = -0.3; mouth = 'yell'; eye = 'angry'; }
  else if (pose === 'hurt') { lean = -0.3; armF = 0.6; armB = -0.4; eye = 'x'; mouth = 'o'; }
  else if (pose === 'run') { const s = Math.sin(t * 14); legA = s * 0.7; legB = -s * 0.7; armF = -0.4 - s * 0.6; armB = 0.4 + s * 0.6; bob = Math.abs(s) * -3; lean = 0.12; }
  else if (pose === 'cheer') { armF = -2.8; armB = -2.4; bob = -Math.abs(Math.sin(t * 8)) * 8; mouth = 'yell'; }
  else if (pose === 'stagger') { lean = -0.5 + Math.sin(t * 20) * 0.1; armF = -2.2; armB = -2; eye = 'x'; mouth = 'o'; }
  if (pose === 'ko') { ctx.rotate(-1.45); ctx.translate(-10, -6); eye = 'x'; mouth = 'o'; }
  ctx.rotate(lean); ctx.translate(0, bob);
  const wb = D.w, hipY = -30, shY = -58;
  // back arm & leg
  limb(ctx, -4 * wb, shY + 4, -4 * wb + Math.sin(armB) * 22, shY + 4 + Math.cos(armB) * 22, 8, D.top2);
  limb(ctx, -5, hipY, -5 + Math.sin(legB) * 28, hipY + Math.cos(legB) * 28, 10, D.legs);
  ell(ctx, -5 + Math.sin(legB) * 30 + 4, hipY + Math.cos(legB) * 30, 9, 5, 0, D.boots, 3);
  // front leg
  limb(ctx, 5, hipY, 5 + Math.sin(legA) * 28, hipY + Math.cos(legA) * 28, 10, D.legs);
  ell(ctx, 5 + Math.sin(legA) * 30 + 4, hipY + Math.cos(legA) * 30, 9, 5, 0, D.boots, 3);
  // torso
  poly(ctx, [-13 * wb, hipY + 2, 13 * wb, hipY + 2, 16 * wb, shY, -14 * wb, shY - 2], D.top);
  ctx.fillStyle = D.top2; ctx.fillRect(-12 * wb, hipY - 6, 25 * wb, 6); // belt shade
  ctx.fillStyle = D.accent; ctx.fillRect(-2, hipY - 6, 6, 6);
  heroBodyDetail(ctx, id, D, shY, hipY);
  // head
  const hx = 3, hy = -78;
  circ(ctx, hx, hy, 18, D.skin);
  heroHead(ctx, id, D, hx, hy, t);
  heroFace(ctx, hx, hy, eye, mouth, o.flash);
  // front arm + weapon
  const ax = 6 * wb, ay = shY + 4, ex = ax + Math.sin(armF) * 24, ey = ay + Math.cos(armF) * 24;
  heroWeapon(ctx, id, D, ex, ey, armF, pose, t, o);
  limb(ctx, ax, ay, ex, ey, 9, D.top);
  circ(ctx, ex, ey, 6, D.skin, 3);
  ctx.restore();
}
function heroFace(ctx, hx, hy, eye, mouth) {
  ctx.lineWidth = 3; ctx.strokeStyle = OL;
  if (eye === 'x') {
    ctx.beginPath(); ctx.moveTo(hx + 4, hy - 6); ctx.lineTo(hx + 12, hy + 2); ctx.moveTo(hx + 12, hy - 6); ctx.lineTo(hx + 4, hy + 2); ctx.stroke();
  } else {
    ell(ctx, hx + 9, hy - 2, 5.5, 7, 0, '#fff', 2.5);
    ctx.fillStyle = OL; ctx.beginPath(); ctx.arc(hx + 11, hy - 1, 3, 0, 7); ctx.fill();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hx + 2, hy - (eye === 'angry' ? 7 : 11)); ctx.lineTo(hx + 15, hy - (eye === 'angry' ? 12 : 11)); ctx.stroke();
  }
  ctx.lineWidth = 3;
  if (mouth === 'grin') { ctx.beginPath(); ctx.moveTo(hx + 4, hy + 8); ctx.quadraticCurveTo(hx + 11, hy + 13, hx + 16, hy + 6); ctx.stroke(); }
  else if (mouth === 'grit') { ctx.fillStyle = '#fff'; ctx.fillRect(hx + 5, hy + 6, 11, 5); ctx.strokeRect(hx + 5, hy + 6, 11, 5); ctx.beginPath(); ctx.moveTo(hx + 10, hy + 6); ctx.lineTo(hx + 10, hy + 11); ctx.stroke(); }
  else if (mouth === 'yell' || mouth === 'o') { ell(ctx, hx + 11, hy + 9, 5, mouth === 'o' ? 4 : 6, 0, '#7a1020', 2.5); }
}
function heroHead(ctx, id, D, hx, hy, t) {
  if (id === 'scrub') {
    // spiky messy hair + bandana
    ctx.beginPath(); ctx.moveTo(hx - 18, hy - 2);
    const sp = [[-22, -14], [-14, -18], [-16, -30], [-4, -22], [0, -36], [8, -22], [18, -30], [16, -16], [22, -10]];
    for (const [a, b] of sp) ctx.lineTo(hx + a, hy + b);
    ctx.lineTo(hx + 18, hy - 6); ctx.quadraticCurveTo(hx, hy - 14, hx - 18, hy - 2); blob(ctx, '#e8722a');
    poly(ctx, [hx - 18, hy - 8, hx + 19, hy - 10, hx + 19, hy - 3, hx - 18, hy - 1], D.accent, 3);
    poly(ctx, [hx - 18, hy - 6, hx - 30, hy - 12 + Math.sin(t * 9) * 3, hx - 28, hy - 2 + Math.sin(t * 9) * 3], D.accent, 3);
  } else if (id === 'archer') {
    ctx.beginPath(); ctx.moveTo(hx - 21, hy + 10); ctx.quadraticCurveTo(hx - 24, hy - 26, hx + 2, hy - 26); ctx.quadraticCurveTo(hx + 22, hy - 24, hx + 20, hy - 8);
    ctx.lineTo(hx + 8, hy - 12); ctx.quadraticCurveTo(hx - 8, hy - 10, hx - 10, hy + 12); ctx.closePath(); blob(ctx, D.top);
    poly(ctx, [hx - 6, hy - 24, hx + 2, hy - 44, hx + 6, hy - 24], D.accent, 3); // feather
  } else if (id === 'knight') {
    ctx.beginPath(); ctx.moveTo(hx - 20, hy + 8); ctx.lineTo(hx - 21, hy - 12); ctx.quadraticCurveTo(hx, hy - 30, hx + 21, hy - 12); ctx.lineTo(hx + 21, hy - 4); ctx.lineTo(hx + 3, hy - 4); ctx.lineTo(hx + 3, hy + 4); ctx.lineTo(hx - 6, hy + 10); ctx.closePath(); blob(ctx, D.accent);
    ctx.fillStyle = '#8f98ad'; ctx.fillRect(hx - 18, hy - 12, 38, 4);
    ctx.beginPath(); ctx.moveTo(hx - 4, hy - 26); ctx.quadraticCurveTo(hx - 30, hy - 44 + Math.sin(t * 7) * 2, hx - 34, hy - 18); ctx.quadraticCurveTo(hx - 20, hy - 30, hx - 4, hy - 20); blob(ctx, '#e8432a', 3);
  } else if (id === 'hexa') {
    poly(ctx, [hx - 28, hy - 8, hx + 28, hy - 10, hx + 10, hy - 20, hx - 14 + Math.sin(t * 3) * 3, hy - 54, hx - 10, hy - 20], D.top);
    ctx.fillStyle = D.accent; ctx.fillRect(hx - 12, hy - 18, 24, 5);
    ctx.beginPath(); ctx.moveTo(hx - 18, hy - 8); ctx.quadraticCurveTo(hx - 26, hy + 14, hx - 14, hy + 22); ctx.lineTo(hx - 10, hy - 6); blob(ctx, '#e6f0ff', 3);
  }
}
function heroBodyDetail(ctx, id, D, shY, hipY) {
  if (id === 'knight') { poly(ctx, [-16, shY - 4, -2, shY - 8, -4, shY + 8, -18, shY + 6], D.accent, 3); poly(ctx, [6, shY - 6, 20, shY - 4, 18, shY + 8, 6, shY + 6], D.accent, 3); ctx.fillStyle = '#ffd21f'; drawStar(ctx, 1, shY + 14, 6, 0, '#ffd21f'); }
  if (id === 'scrub') { ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, shY + 6); ctx.lineTo(-4, shY + 14); ctx.moveTo(8, shY + 4); ctx.lineTo(4, shY + 16); ctx.stroke(); ctx.fillStyle = '#c99a5a'; ctx.beginPath(); ctx.arc(-6, hipY + 0, 5, 0, 7); ctx.fill(); }
  if (id === 'archer') { limb(ctx, -14, shY - 2, 10, hipY - 2, 3, '#7a4a20'); poly(ctx, [-20, shY - 6, -14, shY - 20, -10, shY - 4], '#c9a35c', 2); }
  if (id === 'hexa') { poly(ctx, [-14, hipY + 2, 15, hipY + 2, 20, hipY + 18, -18, hipY + 18], D.top2, 3); }
}
function heroWeapon(ctx, id, D, ex, ey, armF, pose, t, o) {
  const ang = -armF + Math.PI / 2; // direction of forearm
  ctx.save(); ctx.translate(ex, ey);
  if (id === 'knight') {
    ctx.rotate(-armF + Math.PI);
    poly(ctx, [-4, 0, 4, 0, 5, 46, 0, 56, -5, 46], '#e6ecf5', 3);
    ctx.fillStyle = '#9fb0c8'; ctx.fillRect(-1, 4, 2, 44);
    poly(ctx, [-12, -2, 12, -2, 12, 4, -12, 4], '#ffd21f', 3);
  } else if (id === 'scrub') {
    if (pose === 'brace' || pose === 'throw' || o.rope) {
      // rope coil in hand
      ctx.strokeStyle = OL; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(0, 6, 10, 13, 0.3, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#d9a35a'; ctx.lineWidth = 4; ctx.stroke();
    } else {
      ctx.rotate(-armF + Math.PI);
      poly(ctx, [-4, 0, 4, 0, 9, 36, 0, 44, -9, 36], '#8b5a2b', 3);
      circ(ctx, -4, 30, 2.5, '#d8dde8', 2); circ(ctx, 4, 36, 2.5, '#d8dde8', 2);
    }
  } else if (id === 'archer') {
    if (pose === 'brace' || pose === 'throw' || o.rope) {
      ctx.strokeStyle = OL; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(0, 6, 10, 13, 0.3, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#d9a35a'; ctx.lineWidth = 4; ctx.stroke();
    } else {
      ctx.rotate(-armF + Math.PI / 2);
      ctx.strokeStyle = OL; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, 26, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#a0612a'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(Math.cos(-1.2) * 26, Math.sin(-1.2) * 26); ctx.lineTo(Math.cos(1.2) * 26, Math.sin(1.2) * 26); ctx.stroke();
    }
  } else if (id === 'hexa') {
    ctx.rotate(-armF + Math.PI);
    limb(ctx, 0, -20, 0, 40, 4, '#5a3a1a');
    ctx.fillStyle = 'rgba(255,46,136,0.35)'; ctx.beginPath(); ctx.arc(0, -26, 14 + Math.sin(t * 8) * 3, 0, 7); ctx.fill();
    circ(ctx, 0, -26, 8, '#ff7ad0', 3);
  }
  ctx.restore();
}
function heroPortrait(id, size = 88) {
  const key = 'pt_' + id + size;
  if (ART.cache[key]) return ART.cache[key];
  const c = ART.canvas(size, size, (x, w, h) => {
    if (ART.has('portrait_' + id)) { const im = ART.img['portrait_' + id]; x.drawImage(im, 0, 0, w, h); return; }
    const s = size / 46;
    x.translate(w / 2 - 3 * s, h * 0.62 + 78 * s);
    drawHero(x, id, 0, 0, s, { pose: 'idle', t: 0.2 });
  });
  ART.cache[key] = c.toDataURL();
  return ART.cache[key];
}

/* ---------- BOSS: MAGMAROTH, the Lava Hound ---------- */
// Local origin: ground point between front feet. Facing down-left toward the heroes.
const BOSS_ANKLE = { L: [-96, -26], R: [44, -14] };
function bossAnkle(side, P) {
  const a = BOSS_ANKLE[side];
  return [a[0] + (side === 'L' ? P.legLx : P.legRx), a[1] + (side === 'L' ? P.legLy : P.legRy)];
}
function drawBoss(ctx, P, t) {
  ctx.save();
  shadow(ctx, 30, 6, 210 * (P.shadowS || 1), 34, 0.45);
  if (ART.sprite(ctx, 'boss', 330, false)) { ctx.restore(); return; }
  const heat = P.heat || 0;
  // hind legs
  limb(ctx, 150, -110 + P.lift, 175, -18, 34, '#4a1a16'); ell(ctx, 180, -12, 26, 12, 0, '#2e0f0c');
  limb(ctx, 110, -100 + P.lift, 120, -4, 36, '#5a211b'); ell(ctx, 124, 2, 28, 13, 0, '#3a1410');
  // tail
  ctx.save(); ctx.translate(200, -150 + P.lift);
  ctx.rotate(Math.sin(t * 2.2) * 0.15);
  ctx.strokeStyle = OL; ctx.lineWidth = 26; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(60, -10, 70, -80); ctx.stroke();
  ctx.strokeStyle = '#5a211b'; ctx.lineWidth = 18; ctx.stroke();
  poly(ctx, [56, -76, 86, -120, 84, -70], '#ff6a13', 3);
  ctx.restore();
  // body (rotates/squashes as a unit with head)
  ctx.save();
  ctx.translate(20, -120 + P.lift); ctx.rotate(P.rot || 0); ctx.scale(1, P.squash || 1); ctx.translate(-20, 120);
  // spikes
  for (let i = 0; i < 6; i++) { const sx = -40 + i * 38, sy = -232 + Math.abs(i - 2) * 10; poly(ctx, [sx - 14, sy + 22, sx + 2 + Math.sin(t * 3 + i) * 2, sy - 22, sx + 16, sy + 22], i % 2 ? '#ff6a13' : '#ffb21f', 3.5); }
  ell(ctx, 50, -160, 165, 92, -0.08, '#5e231c', 5);
  // rock plates
  ctx.save(); ctx.beginPath(); ctx.ellipse(50, -160, 163, 90, -0.08, 0, 7); ctx.clip();
  ctx.fillStyle = '#7a3024';
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(-60 + i * 42, -200 + (i % 2) * 30, 30, 20, 0.3, 0, 7); ctx.fill(); }
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-120, -120, 340, 60);
  // magma cracks
  const glow = 0.6 + Math.sin(t * 4) * 0.2 + heat * 0.6;
  ctx.strokeStyle = 'rgba(255,' + Math.round(140 + 80 * heat) + ',30,' + clamp(glow, 0, 1) + ')'; ctx.lineWidth = 5; ctx.lineJoin = 'miter';
  const cracks = [[-80, -190, -50, -170, -60, -140, -30, -120], [20, -230, 40, -200, 20, -180, 50, -150], [110, -210, 130, -180, 100, -160, 140, -130], [160, -180, 180, -150]];
  for (const c of cracks) { ctx.beginPath(); ctx.moveTo(c[0], c[1]); for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]); ctx.stroke(); }
  ctx.restore();
  // chest
  ell(ctx, -10, -130, 80, 60, 0.2, '#6e2a20', 4.5);
  ctx.strokeStyle = 'rgba(255,170,40,' + (0.5 + heat * 0.5) + ')'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-40, -150); ctx.lineTo(-20, -120); ctx.lineTo(-30, -96); ctx.moveTo(10, -160); ctx.lineTo(0, -130); ctx.lineTo(16, -104); ctx.stroke();
  ctx.restore();
  // FRONT LEGS (not rotated with body so ropes stay anchored)
  frontLeg(ctx, -50, -130 + P.lift, -96 + P.legLx, 0 + P.legLy, P.ropedL, t);
  frontLeg(ctx, 60, -120 + P.lift, 44 + P.legRx, 12 + P.legRy, P.ropedR, t);
  // HEAD
  ctx.save();
  ctx.translate(-70 + (P.headX || 0), -150 + P.lift + (P.headY || 0)); ctx.rotate((P.headRot || 0) + Math.sin(t * 1.8) * 0.03);
  // horns
  poly(ctx, [-30, -40, -78, -96, -56, -52, -40, -30], '#f1e4c8', 4);
  poly(ctx, [40, -46, 92, -94, 70, -46, 50, -30], '#f1e4c8', 4);
  // skull
  ctx.beginPath(); ctx.moveTo(-58, -20); ctx.quadraticCurveTo(-52, -70, 4, -72); ctx.quadraticCurveTo(66, -70, 64, -16);
  ctx.lineTo(54, 18); ctx.lineTo(-48, 22); ctx.closePath(); blob(ctx, '#7a2c22', 5);
  // brow ridge
  poly(ctx, [-56, -30, -6, -14, 4, -14, 60, -30, 52, -44, 2, -28, -48, -44], '#4a1a14', 3.5);
  // eyes
  const e = P.eyes || 'angry';
  if (e === 'dizzy') {
    for (const ex of [-26, 30]) { circ(ctx, ex, -16, 12, '#fff8d0', 3); ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.beginPath(); for (let a = 0; a < 12; a += 0.4) { const r = a * 0.9; ctx.lineTo(ex + Math.cos(a + t * 8) * r, -16 + Math.sin(a + t * 8) * r); } ctx.stroke(); }
  } else {
    const ey = e === 'glow' ? '#fff' : '#ffd21f';
    poly(ctx, [-42, -22, -12, -14, -16, -4, -40, -10], ey, 3);
    poly(ctx, [46, -22, 16, -14, 20, -4, 44, -10], ey, 3);
    ctx.fillStyle = OL; ctx.fillRect(-26, -18, 6, 10); ctx.fillRect(26, -18, 6, 10);
  }
  // nostrils w/ smoke glow
  ctx.fillStyle = heat > 0.2 ? '#ffb21f' : OL; ctx.beginPath(); ctx.ellipse(-12, 8, 5, 3, 0, 0, 7); ctx.ellipse(18, 8, 5, 3, 0, 0, 7); ctx.fill();
  // jaw
  const jaw = (P.jaw || 0) * 26;
  ctx.save(); ctx.translate(0, 16 + jaw * 0.3);
  // mouth interior
  ctx.beginPath(); ctx.moveTo(-44, 0); ctx.lineTo(50, 0); ctx.lineTo(44, 10 + jaw); ctx.lineTo(-38, 12 + jaw); ctx.closePath(); blob(ctx, heat > 0.2 ? '#ffcf3a' : '#3a0a0e', 3);
  if (heat > 0.2) { ctx.fillStyle = 'rgba(255,255,255,' + (heat * 0.7) + ')'; ctx.fillRect(-30, 3, 70, 4 + jaw * 0.6); }
  // teeth
  for (let i = 0; i < 6; i++) poly(ctx, [-38 + i * 15, 0, -32 + i * 15, 10, -26 + i * 15, 0], '#fff', 2);
  ctx.beginPath(); ctx.moveTo(-44, 10 + jaw); ctx.lineTo(48, 8 + jaw); ctx.lineTo(40, 30 + jaw); ctx.lineTo(-36, 32 + jaw); ctx.closePath(); blob(ctx, '#6a241c', 4);
  for (let i = 0; i < 5; i++) poly(ctx, [-30 + i * 16, 12 + jaw, -24 + i * 16, 2 + jaw, -18 + i * 16, 12 + jaw], '#fff', 2);
  if (P.tongue) { ctx.beginPath(); ctx.moveTo(-6, 14 + jaw); ctx.quadraticCurveTo(-14, 44 + jaw + P.tongue * 20, 2, 50 + jaw + P.tongue * 16); ctx.quadraticCurveTo(16, 40 + jaw, 12, 14 + jaw); blob(ctx, '#ff5a8a', 3); }
  ctx.restore();
  ctx.restore();
  ctx.restore();
}
function frontLeg(ctx, sx, sy, fx, fy, roped, t) {
  const ang = Math.atan2(fy - sy, fx - sx), nx = -Math.sin(ang), ny = Math.cos(ang);
  ctx.beginPath();
  ctx.moveTo(sx + nx * 34, sy - ny * 34 * -1); ctx.lineTo(fx + nx * 20, fy - 18 + ny * 20);
  ctx.lineTo(fx - nx * 20, fy - 18 - ny * 20); ctx.lineTo(sx - nx * 34, sy - ny * 34);
  ctx.closePath(); blob(ctx, '#66261e', 5);
  ctx.strokeStyle = 'rgba(255,140,30,0.7)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lerp(sx, fx, 0.3) - 6, lerp(sy, fy, 0.3)); ctx.lineTo(lerp(sx, fx, 0.55) + 6, lerp(sy, fy, 0.55)); ctx.stroke();
  // foot + claws
  ell(ctx, fx, fy - 6, 32, 15, 0, '#4a1a14', 4.5);
  for (let i = -1; i <= 1; i++) poly(ctx, [fx - 34 + (i + 1) * 22, fy - 2, fx - 40 + (i + 1) * 22, fy + 10, fx - 26 + (i + 1) * 22, fy + 2], '#f1e4c8', 2.5);
  // ankle band (rope target)
  if (roped) {
    ctx.strokeStyle = OL; ctx.lineWidth = 11; ctx.beginPath(); ctx.ellipse(fx, fy - 26, 24, 9, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#d9a35a'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]);
  }
}
function bossPortrait(size = 80) {
  const key = 'boss_pt' + size; if (ART.cache[key]) return ART.cache[key];
  const c = ART.canvas(size, size, (x, w, h) => {
    if (ART.has('portrait_boss')) { x.drawImage(ART.img.portrait_boss, 0, 0, w, h); return; }
    const s = size / 150; x.translate(w * 0.5 + 70 * s, h * 0.55 + 150 * s); x.scale(s, s);
    drawBoss(x, { lift: 0, legLx: 0, legLy: 0, legRx: 0, legRy: 0, eyes: 'angry', jaw: 0.4, heat: 0.4 }, 0.5);
  });
  ART.cache[key] = c.toDataURL(); return ART.cache[key];
}

/* ---------- HUNTER (Mode 2 pursuer) ---------- */
function drawHunter(ctx, x, y, sc, P, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.rotate(P.rot || 0);
  shadow(ctx, 0, 0, 90, 20, 0.5);
  if (ART.sprite(ctx, 'hunter', 270, false)) { ctx.restore(); return; }
  const run = Math.sin(t * (P.stun ? 0 : 9));
  const bob = Math.abs(run) * -6;
  ctx.translate(0, bob);
  // legs
  limb(ctx, -30, -110, -40 + run * 16, -10, 30, '#3a1420'); ell(ctx, -40 + run * 16, -6, 26, 12, 0, '#1a0a10');
  limb(ctx, 30, -110, 40 - run * 16, -10, 30, '#3a1420'); ell(ctx, 40 - run * 16, -6, 26, 12, 0, '#1a0a10');
  // torso
  poly(ctx, [-70, -220, 70, -220, 50, -110, -50, -110], '#b0202a', 5);
  poly(ctx, [-56, -206, 0, -190, 56, -206, 40, -130, -40, -130], '#2a1218', 4);
  ctx.strokeStyle = '#ff6a13'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-30, -180); ctx.lineTo(-6, -150); ctx.lineTo(-20, -126); ctx.moveTo(26, -186); ctx.lineTo(10, -156); ctx.stroke();
  // chains across chest
  ctx.strokeStyle = '#9aa0ad'; ctx.lineWidth = 6; ctx.setLineDash([8, 5]); ctx.beginPath(); ctx.moveTo(-66, -214); ctx.lineTo(56, -120); ctx.stroke(); ctx.setLineDash([]);
  // arms + fists
  const punch = P.punch || 0;
  const lfx = -100 + run * 10, lfy = -120 - punch * 0;
  limb(ctx, -68, -210, lfx, lfy, 30, '#b0202a'); circ(ctx, lfx, lfy, 26, '#8a1820', 5);
  const rfx = 100 - run * 10 - punch * 70, rfy = -120 - punch * 140;
  limb(ctx, 68, -210, rfx, rfy, 30, '#b0202a'); circ(ctx, rfx, rfy, 28 + punch * 6, '#8a1820', 5);
  ctx.strokeStyle = OL; ctx.lineWidth = 3; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(rfx - 14, rfy + i * 9); ctx.lineTo(rfx + 8, rfy + i * 9); ctx.stroke(); }
  // shoulder spikes
  poly(ctx, [-88, -206, -110, -260, -60, -222], '#e8dcc0', 4); poly(ctx, [88, -206, 110, -260, 60, -222], '#e8dcc0', 4);
  // head
  ctx.save(); ctx.translate(0, -240);
  poly(ctx, [-30, -30, -78, -96, -44, -40], '#e8dcc0', 4); poly(ctx, [30, -30, 78, -96, 44, -40], '#e8dcc0', 4);
  ctx.beginPath(); ctx.moveTo(-40, -20); ctx.quadraticCurveTo(-36, -60, 0, -62); ctx.quadraticCurveTo(36, -60, 40, -20); ctx.lineTo(30, 28); ctx.lineTo(-30, 28); ctx.closePath(); blob(ctx, '#c42830', 5);
  if (P.stun) {
    for (const ex of [-16, 16]) { ctx.strokeStyle = OL; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ex - 7, -24); ctx.lineTo(ex + 7, -10); ctx.moveTo(ex + 7, -24); ctx.lineTo(ex - 7, -10); ctx.stroke(); }
  } else {
    poly(ctx, [-30, -26, -6, -18, -10, -8, -28, -14], '#ffe14a', 3); poly(ctx, [30, -26, 6, -18, 10, -8, 28, -14], '#ffe14a', 3);
    ctx.fillStyle = 'rgba(255,225,74,0.35)'; ctx.beginPath(); ctx.arc(-16, -16, 16, 0, 7); ctx.arc(16, -16, 16, 0, 7); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(-24, 4); ctx.lineTo(24, 4); ctx.lineTo(18, 24); ctx.lineTo(-18, 24); ctx.closePath(); blob(ctx, '#2a050a', 3);
  for (let i = 0; i < 4; i++) { poly(ctx, [-18 + i * 12, 4, -12 + i * 12, 14, -6 + i * 12, 4], '#fff', 2); poly(ctx, [-16 + i * 11, 24, -11 + i * 11, 15, -6 + i * 11, 24], '#fff', 2); }
  ctx.restore();
  ctx.restore();
}
function hunterPortrait(size = 80) {
  const key = 'hunt_pt' + size; if (ART.cache[key]) return ART.cache[key];
  const c = ART.canvas(size, size, (x, w, h) => {
    if (ART.has('portrait_hunter')) { x.drawImage(ART.img.portrait_hunter, 0, 0, w, h); return; }
    const s = size / 130; drawHunter(x, w / 2, h * 0.5 + 250 * s, s, {}, 0);
  });
  ART.cache[key] = c.toDataURL(); return ART.cache[key];
}

/* ---------- ENEMIES ---------- */
const ENEMY_DEF = {
  slime: { name: 'SLIME', hp: 70, spd: 34, dmg: 4, rate: 1.3, range: 60, r: 22 },
  goblin: { name: 'GOBLIN', hp: 80, spd: 62, dmg: 5, rate: 1.0, range: 58, r: 20 },
  skeleton: { name: 'SKELLY', hp: 110, spd: 44, dmg: 6, rate: 1.2, range: 62, r: 22 },
  imp: { name: 'IMP', hp: 90, spd: 50, dmg: 5, rate: 2.0, range: 220, r: 20, ranged: true },
  brute: { name: 'BRUTE', hp: 700, spd: 30, dmg: 12, rate: 1.8, range: 76, r: 40, elite: true },
};
function drawEnemy(ctx, e, t) {
  ctx.save(); ctx.translate(e.x, e.y);
  const s = e.scale || 1; ctx.scale(s * (e.flip ? -1 : 1), s);
  shadow(ctx, 0, 0, e.def.r * 1.1, 7);
  if (ART.sprite(ctx, e.type, e.def.r * 3.4, false)) { ctx.restore(); return; }
  const bob = Math.sin(t * 8 + e.seed) * 2, lunge = e.lunge || 0;
  ctx.translate(0, bob + lunge * 10);
  if (e.type === 'slime') {
    const sq = 1 + Math.sin(t * 6 + e.seed) * 0.08;
    ctx.scale(1 / sq, sq);
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.quadraticCurveTo(-26, -34, 0, -36); ctx.quadraticCurveTo(26, -34, 24, 0); ctx.closePath(); blob(ctx, '#58d33a');
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-10, -26, 6, 4, -0.5, 0, 7); ctx.fill();
    circ(ctx, -7, -16, 5, '#fff', 2.5); circ(ctx, 8, -16, 5, '#fff', 2.5); ctx.fillStyle = OL; ctx.fillRect(-8, -17, 3, 4); ctx.fillRect(7, -17, 3, 4);
  } else if (e.type === 'goblin') {
    limb(ctx, -6, -18, -8, 0, 7, '#4b3a2a'); limb(ctx, 6, -18, 8, 0, 7, '#4b3a2a');
    poly(ctx, [-12, -18, 12, -18, 10, -36, -10, -36], '#8a5a2a', 3.5);
    poly(ctx, [-16, -46, -36, -56, -16, -38], '#6fbf3a', 3); poly(ctx, [16, -46, 36, -56, 16, -38], '#6fbf3a', 3);
    circ(ctx, 0, -46, 15, '#6fbf3a', 3.5);
    poly(ctx, [-9, -50, -2, -46, -9, -44], '#ffe14a', 2); poly(ctx, [9, -50, 2, -46, 9, -44], '#ffe14a', 2);
    ctx.strokeStyle = OL; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-6, -38); ctx.lineTo(6, -38); ctx.stroke();
    limb(ctx, 12, -30, 20, -18, 6, '#6fbf3a'); poly(ctx, [18, -18, 22, -18, 24, -40, 20, -42], '#d8dde8', 2.5);
  } else if (e.type === 'skeleton') {
    limb(ctx, -6, -20, -8, 0, 5, '#efe8d6'); limb(ctx, 6, -20, 8, 0, 5, '#efe8d6');
    poly(ctx, [-11, -20, 11, -20, 12, -40, -12, -40], '#efe8d6', 3);
    ctx.strokeStyle = OL; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-9, -36 + i * 6); ctx.lineTo(9, -36 + i * 6); ctx.stroke(); }
    circ(ctx, 0, -54, 15, '#f5efe0', 3.5); poly(ctx, [-8, -42, 8, -42, 6, -34, -6, -34], '#f5efe0', 3);
    circ(ctx, -6, -55, 4.5, OL, 1); circ(ctx, 6, -55, 4.5, OL, 1);
    ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(-6, -55, 1.6, 0, 7); ctx.arc(6, -55, 1.6, 0, 7); ctx.fill();
    limb(ctx, -12, -36, -22, -22, 4, '#efe8d6'); poly(ctx, [-26, -20, -20, -24, -12, -60, -18, -62], '#b8c0cc', 2.5);
  } else if (e.type === 'imp') {
    const fl = Math.sin(t * 20 + e.seed) * 0.4;
    poly(ctx, [-8, -36, -36, -54 - fl * 20, -26, -30], '#7a1018', 3); poly(ctx, [8, -36, 36, -54 - fl * 20, 26, -30], '#7a1018', 3);
    ell(ctx, 0, -28, 13, 15, 0, '#e8322a', 3.5);
    circ(ctx, 0, -48, 13, '#e8322a', 3.5);
    poly(ctx, [-10, -56, -14, -72, -4, -60], '#f1e4c8', 2.5); poly(ctx, [10, -56, 14, -72, 4, -60], '#f1e4c8', 2.5);
    poly(ctx, [-8, -50, -2, -47, -8, -45], '#ffe14a', 2); poly(ctx, [8, -50, 2, -47, 8, -45], '#ffe14a', 2);
    ctx.fillStyle = 'rgba(255,180,40,0.6)'; ctx.beginPath(); ctx.arc(16, -26, 7 + Math.sin(t * 10) * 2, 0, 7); ctx.fill();
  } else if (e.type === 'brute') {
    limb(ctx, -16, -40, -20, 0, 16, '#4a2a5a'); limb(ctx, 16, -40, 20, 0, 16, '#4a2a5a');
    poly(ctx, [-40, -96, 40, -96, 30, -38, -30, -38], '#8a4ab8', 5);
    poly(ctx, [-30, -88, 30, -88, 22, -46, -22, -46], '#2a1838', 3.5);
    limb(ctx, -40, -88, -54, -40, 18, '#8a4ab8'); circ(ctx, -54, -36, 15, '#6a3a90', 4);
    limb(ctx, 40, -88, 56, -44, 18, '#8a4ab8');
    poly(ctx, [50, -40, 62, -40, 70, -110, 46, -112], '#6b4a2e', 3.5); circ(ctx, 58, -112, 16, '#4b3a2a', 4);
    for (let i = 0; i < 4; i++) poly(ctx, [48 + i * 6, -124, 52 + i * 6, -136, 56 + i * 6, -122], '#d8dde8', 2);
    circ(ctx, 0, -108, 22, '#8a4ab8', 4.5);
    poly(ctx, [-16, -122, -30, -150, -6, -126], '#ffd21f', 3); poly(ctx, [16, -122, 30, -150, 6, -126], '#ffd21f', 3);
    poly(ctx, [-14, -112, -2, -106, -12, -102], '#ff3a2a', 2); poly(ctx, [14, -112, 2, -106, 12, -102], '#ff3a2a', 2);
    poly(ctx, [-12, -96, 12, -96, 8, -90, -8, -90], '#fff', 2.5);
  }
  ctx.restore();
}

/* ---------- CHASE ITEM ICONS ---------- */
function itemIcon(id, size = 72) {
  const key = 'it_' + id + size; if (ART.cache[key]) return ART.cache[key];
  const c = ART.canvas(size, size, (x, w, h) => {
    if (ART.has('item_' + id)) { x.drawImage(ART.img['item_' + id], 0, 0, w, h); return; }
    x.translate(w / 2, h / 2); x.scale(size / 72, size / 72); drawItemArt(x, id);
  });
  ART.cache[key] = c; return c;
}
function drawItemArt(x, id) {
  switch (id) {
    case 'spike': ell(x, 0, 16, 28, 9, 0, '#6b6f7a'); for (let i = -2; i <= 2; i++) poly(x, [i * 11 - 6, 14, i * 11, -18 + Math.abs(i) * 6, i * 11 + 6, 14], '#d8dde8', 3); break;
    case 'oil': ell(x, 4, 10, 30, 14, 0, '#16161c'); x.fillStyle = 'rgba(160,120,255,0.6)'; x.beginPath(); x.ellipse(-6, 6, 12, 4, 0, 0, 7); x.fill(); poly(x, [-6, -26, 8, -26, 10, -2, -8, -2], '#3a3a48', 3); x.fillStyle = '#ffd21f'; x.fillRect(-4, -18, 10, 6); break;
    case 'chain': x.lineWidth = 7; for (let i = 0; i < 4; i++) { x.strokeStyle = OL; x.beginPath(); x.ellipse(-21 + i * 14, -12 + i * 8, 10, 6, 0.5, 0, 7); x.stroke(); x.strokeStyle = '#c8ccd6'; x.lineWidth = 4; x.stroke(); x.lineWidth = 7; } break;
    case 'barrel': poly(x, [-18, -26, 18, -26, 22, 0, 18, 26, -18, 26, -22, 0], '#d8322a'); x.fillStyle = OL; x.fillRect(-22, -12, 44, 5); x.fillRect(-22, 8, 44, 5); outlinedText(x, 'TNT', 0, -1, 16, '#ffd21f'); x.strokeStyle = '#ffd21f'; x.lineWidth = 3; x.beginPath(); x.moveTo(6, -26); x.quadraticCurveTo(14, -36, 22, -32); x.stroke(); break;
    case 'boulder': x.beginPath(); x.moveTo(-28, 10); x.lineTo(-22, -18); x.lineTo(0, -28); x.lineTo(24, -16); x.lineTo(28, 12); x.lineTo(8, 26); x.lineTo(-18, 24); x.closePath(); blob(x, '#8a8478'); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 3; x.beginPath(); x.moveTo(-10, -12); x.lineTo(4, 0); x.lineTo(-2, 14); x.stroke(); break;
    case 'firemine': ell(x, 0, 14, 26, 10, 0, '#3a3a48'); circ(x, 0, 8, 12, '#ff6a13', 3); for (let i = 0; i < 3; i++) poly(x, [-14 + i * 14, 4, -8 + i * 14, -24 - (i % 2) * 8, -2 + i * 14, 4], i % 2 ? '#ffd21f' : '#ff6a13', 2.5); break;
    case 'banana': x.beginPath(); x.moveTo(-26, -10); x.quadraticCurveTo(-10, 30, 26, 0); x.quadraticCurveTo(-4, 14, -18, -16); x.closePath(); blob(x, '#ffe14a'); x.fillStyle = OL; x.fillRect(-26, -14, 6, 6); break;
    case 'portal': for (let i = 4; i > 0; i--) ell(x, 0, 0, i * 7, i * 7 * 1.15, 0, i % 2 ? '#7a2cff' : '#ff2e88', 3); break;
    case 'smoke': circ(x, -12, 6, 14, '#9aa0ad', 3); circ(x, 10, 2, 16, '#b8bec8', 3); circ(x, 0, -12, 13, '#d0d4dc', 3); break;
    case 'ice': poly(x, [0, -30, 18, -6, 10, 26, -10, 26, -18, -6], '#7ad8ff'); x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, -24); x.lineTo(0, 20); x.stroke(); break;
    case 'spring': x.strokeStyle = OL; x.lineWidth = 8; x.beginPath(); for (let i = 0; i < 6; i++) { x.lineTo(i % 2 ? 16 : -16, 20 - i * 8); } x.stroke(); x.strokeStyle = '#ffd21f'; x.lineWidth = 4; x.stroke(); poly(x, [-22, 20, 22, 20, 22, 28, -22, 28], '#6b6f7a', 3); poly(x, [-20, -28, 20, -28, 20, -22, -20, -22], '#e8322a', 3); break;
    case 'megabomb': circ(x, 0, 6, 24, '#1f1f28', 4); x.fillStyle = 'rgba(255,255,255,0.3)'; x.beginPath(); x.arc(-8, -2, 7, 0, 7); x.fill(); poly(x, [-6, -18, 6, -18, 6, -24, -6, -24], '#6b6f7a', 3); drawStar(x, 10, -30, 9, 0, '#ffd21f'); outlinedText(x, 'XL', 0, 8, 14, '#ff2e88'); break;
    case 'double': x.save(); x.translate(-8, 4); x.scale(0.7, 0.7); drawItemArt(x, 'spike'); x.restore(); x.save(); x.translate(10, -6); x.scale(0.7, 0.7); drawItemArt(x, 'barrel'); x.restore(); outlinedText(x, 'x2', 16, 22, 20, '#ffd21f'); break;
    case 'stun': drawStar(x, 0, 0, 28, 0, '#ffd21f'); poly(x, [-6, -14, 8, -14, 0, -2, 10, -2, -8, 18, -2, 4, -10, 4], '#7a2cff', 2.5); break;
  }
}

/* ---------- BACKGROUNDS ---------- */
function arenaBackground() {
  if (ART.cache.arena) return ART.cache.arena;
  const c = ART.canvas(W, H, (x) => {
    if (ART.has('bg_mode1')) { const im = ART.img.bg_mode1, s = Math.max(W / im.naturalWidth, H / im.naturalHeight); x.drawImage(im, (W - im.naturalWidth * s) / 2, (H - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s); return; }
    // sky
    x.fillStyle = '#2a0a12'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#4a0f16'; x.beginPath(); x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W, 210); x.lineTo(0, 260); x.fill();
    // jagged mountains
    x.fillStyle = '#1a060a'; x.beginPath(); x.moveTo(0, 270);
    const m = [[0, 200], [40, 150], [70, 190], [120, 120], [160, 180], [210, 130], [250, 170], [300, 110], [350, 160], [400, 120], [450, 170], [450, 260]];
    for (const [a, b] of m) x.lineTo(a, b + 30); x.fill();
    x.strokeStyle = '#ff6a13'; x.lineWidth = 3; x.beginPath(); x.moveTo(120, 150); x.lineTo(130, 175); x.lineTo(118, 200); x.moveTo(300, 140); x.lineTo(310, 165); x.stroke();
    // ground (iso diamonds)
    x.fillStyle = '#3a1a14'; x.beginPath(); x.moveTo(0, 250); x.lineTo(W, 200); x.lineTo(W, H); x.lineTo(0, H); x.fill();
    x.save(); x.beginPath(); x.moveTo(0, 250); x.lineTo(W, 200); x.lineTo(W, H); x.lineTo(0, H); x.clip();
    for (let i = -10; i < 20; i++) for (let j = -2; j < 20; j++) {
      const cx = i * 64 + (j % 2) * 32, cy = 200 + j * 34;
      x.fillStyle = (i + j) % 3 === 0 ? '#452018' : (i * j) % 2 ? '#3d1c15' : '#4a241b';
      x.beginPath(); x.moveTo(cx, cy - 17); x.lineTo(cx + 32, cy); x.lineTo(cx, cy + 17); x.lineTo(cx - 32, cy); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; x.stroke();
    }
    // lava river diagonal
    x.strokeStyle = '#1a0606'; x.lineWidth = 34; x.beginPath(); x.moveTo(460, 520); x.quadraticCurveTo(380, 600, 420, 700); x.lineTo(470, 800); x.stroke();
    x.strokeStyle = '#ff6a13'; x.lineWidth = 24; x.stroke(); x.strokeStyle = '#ffd21f'; x.lineWidth = 7; x.stroke();
    x.strokeStyle = '#ff6a13'; x.lineWidth = 4;
    for (let i = 0; i < 14; i++) { const a = Math.random() * W, b = 260 + Math.random() * 520; x.beginPath(); x.moveTo(a, b); x.lineTo(a + rand(-20, 20), b + rand(5, 15)); x.lineTo(a + rand(-30, 30), b + rand(15, 30)); x.stroke(); }
    // rocks & bones
    for (let i = 0; i < 9; i++) { const a = rand(0, W), b = rand(270, 760); x.save(); x.translate(a, b); poly(x, [-14, 6, -10, -8, 4, -12, 14, -2, 10, 8], '#2a120e', 3); x.restore(); }
    x.restore();
    x.strokeStyle = OL; x.lineWidth = 4; x.beginPath(); x.moveTo(0, 250); x.lineTo(W, 200); x.stroke();
    const vg = x.createRadialGradient(W / 2, H * 0.45, 200, W / 2, H * 0.5, 560); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
  });
  ART.cache.arena = c; return c;
}
function chaseTile() {
  if (ART.cache.chase) return ART.cache.chase;
  const c = ART.canvas(W, H, (x) => {
    if (ART.has('bg_mode2')) { const im = ART.img.bg_mode2; x.drawImage(im, 0, 0, W, H); return; }
    x.fillStyle = '#1f0a0e'; x.fillRect(0, 0, W, H);
    // lava margins
    for (const side of [0, 1]) {
      x.save(); if (side) { x.translate(W, 0); x.scale(-1, 1); }
      x.fillStyle = '#ff5a10'; x.fillRect(0, 0, 50, H);
      x.fillStyle = '#ffb21f'; for (let i = 0; i < 17; i++) { x.beginPath(); x.ellipse(rand(4, 40), 20 + i * 46, rand(6, 14), rand(3, 7), 0, 0, 7); x.fill(); }
      x.fillStyle = '#2b1412'; x.beginPath(); x.moveTo(50, 0); for (let y = 0; y <= H; y += 40) x.lineTo(46 + Math.sin(y / H * Math.PI * 12) * 10 + (y % 80 ? 8 : 0), y); x.lineTo(80, H); x.lineTo(80, 0); x.fill();
      x.strokeStyle = OL; x.lineWidth = 4; x.beginPath(); for (let y = 0; y <= H; y += 40) x.lineTo(46 + Math.sin(y / H * Math.PI * 12) * 10 + (y % 80 ? 8 : 0), y); x.stroke();
      x.restore();
    }
    // cobbled road
    x.fillStyle = '#3a1d18'; x.fillRect(70, 0, W - 140, H);
    for (let row = 0; row < 20; row++) for (let col = 0; col < 7; col++) {
      const sx = 74 + col * 44 + (row % 2) * 22 - 11, sy = row * 40;
      x.fillStyle = (row + col) % 3 ? '#4a2a22' : '#55302a';
      x.beginPath(); x.roundRect ? x.roundRect(sx, sy + 2, 40, 36, 8) : x.rect(sx, sy + 2, 40, 36); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 2; x.stroke();
    }
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(70, 0, 20, H); x.fillRect(W - 90, 0, 20, H);
    // bones / skulls on road edges
    for (let i = 0; i < 6; i++) { const bx = i % 2 ? rand(84, 110) : rand(340, 366), by = rand(20, H - 20); circ(x, bx, by, 6, '#e8dcc0', 2.5); x.fillStyle = OL; x.fillRect(bx - 3, by - 1, 2, 2); x.fillRect(bx + 1, by - 1, 2, 2); }
  });
  ART.cache.chase = c; return c;
}
