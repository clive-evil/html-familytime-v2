'use strict';
// ============================================================================
// ART — procedural static layers: background colossus, hull, room interiors
// One kit of parts (panels, conduits, cabinets, lockers, tanks, ducts) so the
// ship reads as built by one design bureau and patched for 100 years.
// ============================================================================

const ART = { rooms: {}, S: 2, OX: -40, OY: -40, IW: 1880, IH: 600 };
let AR = mulberry32(1337); // art rng — deterministic
const ar = (a = 1, b) => (b === undefined ? AR() * a : a + AR() * (b - a));
const arPick = (a) => a[Math.floor(AR() * a.length)];

function shade(hex, amt) { // amt -1..1
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------------------------------------------------------------------------
// Kit primitives (world coords)
// ---------------------------------------------------------------------------
function kRect(x, y, w, h, col) { const c = ART.ctx; c.fillStyle = col; c.fillRect(x, y, w, h); }
function kBevel(x, y, w, h, col, depth = 1) {
  const c = ART.ctx; c.fillStyle = col; c.fillRect(x, y, w, h);
  c.fillStyle = shade(col, 0.12); c.fillRect(x, y, w, depth); c.fillRect(x, y, depth, h);
  c.fillStyle = shade(col, -0.45); c.fillRect(x, y + h - depth, w, depth); c.fillRect(x + w - depth, y, depth, h);
}
function kBolt(x, y, col) { const c = ART.ctx; c.fillStyle = shade(col, -0.5); c.fillRect(x, y, 1.6, 1.6); c.fillStyle = shade(col, 0.25); c.fillRect(x, y, 0.8, 0.8); }
function kPipeH(x0, x1, y, r, col, flanges = true) {
  const c = ART.ctx;
  c.fillStyle = shade(col, -0.35); c.fillRect(x0, y - r, x1 - x0, r * 2);
  c.fillStyle = col; c.fillRect(x0, y - r * 0.7, x1 - x0, r * 1.0);
  c.fillStyle = shade(col, 0.22); c.fillRect(x0, y - r * 0.55, x1 - x0, Math.max(0.6, r * 0.25));
  if (flanges) for (let x = x0 + ar(10, 40); x < x1 - 6; x += ar(60, 110)) { c.fillStyle = shade(col, -0.2); c.fillRect(x, y - r - 1, 3, r * 2 + 2); c.fillStyle = shade(col, 0.15); c.fillRect(x, y - r - 1, 1, r * 2 + 2); }
}
function kPipeV(x, y0, y1, r, col) {
  const c = ART.ctx;
  c.fillStyle = shade(col, -0.35); c.fillRect(x - r, y0, r * 2, y1 - y0);
  c.fillStyle = col; c.fillRect(x - r * 0.7, y0, r * 1.0, y1 - y0);
  c.fillStyle = shade(col, 0.22); c.fillRect(x - r * 0.55, y0, Math.max(0.6, r * 0.25), y1 - y0);
  for (let y = y0 + ar(10, 30); y < y1 - 6; y += ar(40, 70)) { c.fillStyle = shade(col, -0.2); c.fillRect(x - r - 1, y, r * 2 + 2, 3); }
}
function kCable(x0, y0, x1, y1, sag, col = '#151515', w = 1.2) {
  const c = ART.ctx; c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0);
  c.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + sag, x1, y1); c.stroke();
}
function kGrille(x, y, w, h, col) {
  kBevel(x, y, w, h, shade(col, -0.25));
  const c = ART.ctx; c.fillStyle = shade(col, -0.65);
  for (let yy = y + 2; yy < y + h - 2; yy += 3) c.fillRect(x + 2, yy, w - 4, 1.4);
}
function kHazard(x, y, w, h, alpha = 0.7) {
  const c = ART.ctx; c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = '#1a1712'; c.fillRect(x, y, w, h);
  c.globalAlpha = alpha; c.fillStyle = PAL.yellow;
  for (let i = -h; i < w + h; i += 10) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + 5, y + h); c.lineTo(x + i + 5 + h, y); c.lineTo(x + i + h, y); c.fill(); }
  c.restore();
}
function kText(x, y, txt, col, size = 6, alpha = 0.7, align = 'left') {
  const c = ART.ctx; c.save(); c.globalAlpha = alpha; c.fillStyle = col; c.font = `bold ${size}px "DejaVu Sans Mono", Consolas, monospace`; c.textAlign = align; c.fillText(txt, x, y); c.restore();
}
function kLocker(x, y, w, h, col) {
  kBevel(x, y, w, h, col);
  const c = ART.ctx;
  c.fillStyle = shade(col, -0.5); c.fillRect(x + w / 2 - 0.5, y + 2, 1, h - 4);
  for (let i = 0; i < 4; i++) { c.fillRect(x + 3, y + 5 + i * 3, w / 2 - 6, 1); c.fillRect(x + w / 2 + 3, y + 5 + i * 3, w / 2 - 6, 1); }
  c.fillStyle = shade(col, 0.3); c.fillRect(x + w / 2 - 3, y + h * 0.5, 1, 5); c.fillRect(x + w / 2 + 2, y + h * 0.5, 1, 5);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y + h - 6, w, 6);
}
function kMachine(x, y, w, h, col, opts = {}) {
  kBevel(x, y, w, h, col, 1.5);
  const c = ART.ctx;
  // panel lines
  c.fillStyle = shade(col, -0.35);
  const n = Math.max(1, Math.round(w / 26));
  for (let i = 1; i < n; i++) c.fillRect(x + (w / n) * i, y + 2, 1, h - 4);
  if (opts.grille !== false && h > 24) kGrille(x + 4, y + h - 16, Math.min(w - 8, 24), 10, col);
  if (opts.plate) { kRect(x + w - 16, y + 5, 11, 6, shade(PAL.off, -0.45)); }
  if (opts.stripe) kHazard(x, y + h - 4, w, 4, 0.55);
  for (const [bx, by] of [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]]) kBolt(bx, by, col);
}
function kTank(x, y, w, h, col) {
  const c = ART.ctx;
  const g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, shade(col, -0.55)); g.addColorStop(0.3, shade(col, 0.12)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.6));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(x, y + w * 0.3); c.quadraticCurveTo(x + w / 2, y - w * 0.15, x + w, y + w * 0.3); c.lineTo(x + w, y + h - w * 0.2); c.quadraticCurveTo(x + w / 2, y + h + w * 0.1, x, y + h - w * 0.2); c.fill();
  c.fillStyle = shade(col, -0.4);
  for (const k of [0.25, 0.7]) c.fillRect(x, y + h * k, w, 2);
}
function kConsole(x, y, w, h, col, screens) {
  // desk body
  kBevel(x, y + h * 0.45, w, h * 0.55, col, 1.2);
  const c = ART.ctx;
  c.fillStyle = shade(col, -0.2);
  c.beginPath(); c.moveTo(x + 2, y + h * 0.45); c.lineTo(x + 6, y + h * 0.18); c.lineTo(x + w - 6, y + h * 0.18); c.lineTo(x + w - 2, y + h * 0.45); c.fill();
  // screen recess (dynamic content drawn later)
  const sx = x + 8, sy = y, sw = w - 16, sh = h * 0.3;
  kBevel(sx - 2, sy - 2, sw + 4, sh + 4, shade(col, -0.3));
  kRect(sx, sy, sw, sh, '#07090a');
  screens.push({ x: sx, y: sy, w: sw, h: sh, kind: 'console', seed: ar(1000) });
  // buttons
  for (let i = 0; i < Math.floor(w / 9); i++) { c.fillStyle = arPick(['#222', '#2a2a26', shade(PAL.off, -0.6)]); c.fillRect(x + 5 + i * 9, y + h * 0.3 + 2, 5, 2.5); }
}
function kStreaks(x0, y0, x1, y1, n, alpha = 0.18) {
  const c = ART.ctx; c.save(); c.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const x = ar(x0, x1), y = ar(y0, y0 + (y1 - y0) * 0.6), len = ar(10, 60);
    const g = c.createLinearGradient(0, y, 0, y + len); g.addColorStop(0, '#0b0a08'); g.addColorStop(1, 'rgba(11,10,8,0)');
    c.fillStyle = g; c.fillRect(x, y, ar(0.8, 3), len);
  }
  c.restore();
}
function kRust(x0, y0, x1, y1, n) {
  const c = ART.ctx; c.save();
  for (let i = 0; i < n; i++) { c.globalAlpha = ar(0.08, 0.22); c.fillStyle = arPick([PAL.rust, '#4a3020', '#3b2a1e']); c.beginPath(); c.ellipse(ar(x0, x1), ar(y0, y1), ar(2, 9), ar(1, 4), 0, 0, 6.3); c.fill(); }
  c.restore();
}

// ---------------------------------------------------------------------------
// Room shell (shared by all rooms)
// ---------------------------------------------------------------------------
const ROOM_STYLE = {
  airlock: { wall: '#454b4b', accent: PAL.yellow }, security: { wall: '#3f464e', accent: PAL.steelL },
  medbay: { wall: '#6a6b63', accent: PAL.green }, quarantine: { wall: '#5d625f', accent: PAL.green },
  bridge: { wall: '#3a444c', accent: PAL.steelL }, workshop: { wall: '#4a473d', accent: PAL.yellow },
  quarters: { wall: '#4a4842', accent: PAL.offD }, mess: { wall: '#4d4a42', accent: PAL.offD },
  hydro: { wall: '#414a3f', accent: PAL.green }, reactor: { wall: '#403f37', accent: PAL.yellow },
  o2: { wall: '#424c4b', accent: PAL.steelL }, cryo: { wall: '#46505a', accent: PAL.steelL },
};

function roomShell(r, A) {
  const st = ROOM_STYLE[r.id]; const wall = st.wall;
  const { x0, x1, y0, y1 } = r;
  // back wall panels
  let x = x0;
  while (x < x1) {
    const pw = Math.min(x1 - x, ar(36, 58));
    const tone = shade(wall, ar(-0.12, 0.06));
    kRect(x, y0, pw, ROOM_H, tone);
    // horizontal seams
    const c = ART.ctx;
    c.fillStyle = shade(wall, -0.4); c.fillRect(x, y0 + 46, pw, 1); c.fillRect(x, y0 + 104, pw, 1);
    c.fillStyle = shade(wall, 0.1); c.fillRect(x, y0 + 47, pw, 0.6);
    c.fillStyle = shade(wall, -0.5); c.fillRect(x + pw - 1, y0, 1, ROOM_H);
    c.fillStyle = shade(wall, 0.08); c.fillRect(x, y0, 0.7, ROOM_H);
    for (const yy of [y0 + 20, y0 + 50, y0 + 108]) { kBolt(x + 3, yy, tone); kBolt(x + pw - 5, yy, tone); }
    if (AR() < 0.18) { // patch plate
      const px = x + ar(4, pw - 20), py = y0 + ar(55, 95);
      kBevel(px, py, ar(12, 20), ar(8, 16), shade(tone, ar(-0.15, 0.1)));
    }
    x += pw;
  }
  // lower band (darker, scuffed)
  const c = ART.ctx;
  const g = c.createLinearGradient(0, y1 - 40, 0, y1); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = g; c.fillRect(x0, y1 - 40, r.w, 40);
  kRect(x0, y1 - 22, r.w, 14, shade(wall, -0.35));
  c.fillStyle = shade(wall, -0.15); c.fillRect(x0, y1 - 22, r.w, 1);
  // ceiling band
  kRect(x0, y0, r.w, 14, shade(wall, -0.5));
  c.fillStyle = shade(wall, -0.2); c.fillRect(x0, y0 + 13, r.w, 1);
  for (let bx = x0 + 20; bx < x1; bx += 70) kBevel(bx, y0, 6, 18, shade(wall, -0.4));
  // ceiling conduits
  const pc = arPick(['#5b5f5a', '#4f5a5f', '#61594a']);
  kPipeH(x0, x1, y0 + 20, 2.6, pc);
  if (AR() < 0.7) kPipeH(x0, x1, y0 + 26, 1.6, arPick(['#6d5c3a', '#4b5545', '#584e4a']));
  // cable runs
  for (let i = 0; i < 3; i++) { const cx = ar(x0, x1 - 60); kCable(cx, y0 + 15, cx + ar(40, 90), y0 + 15, ar(6, 14)); }
  // floor grating
  const fy = r.fy;
  kRect(x0, fy, r.w, 8, '#1d1e1c');
  c.fillStyle = '#2e2f2b'; for (let gx = x0; gx < x1; gx += 4) c.fillRect(gx, fy + 1, 1.5, 6);
  c.fillStyle = '#4a4a44'; c.fillRect(x0, fy, r.w, 1.2);
  // light fixture housings
  A.lights = [];
  const nl = Math.max(2, Math.round(r.w / 125));
  for (let i = 0; i < nl; i++) {
    const lx = x0 + (r.w / nl) * (i + 0.5) + ar(-10, 10);
    kBevel(lx - 13, y0 + 14, 26, 5, '#2a2b28');
    kRect(lx - 11, y0 + 18, 22, 2, '#8a8678');
    A.lights.push({ x: lx, y: y0 + 22, r: 105 + ar(-10, 15), kind: 'lamp', ph: ar(10) });
  }
  // emergency strip lights near floor
  A.strips = [];
  for (let sx = x0 + 30; sx < x1 - 20; sx += 70) { kRect(sx, fy - 3, 10, 2, '#2a1a18'); A.strips.push({ x: sx + 5, y: fy - 2 }); }
  // vent grille
  kGrille(r.vent - 10, y0 + 1, 20, 10, '#3b3d3a');
  A.camera = { x: r.x1 - 18, y: y0 + 16 };
  // painted label
  kText(x0 + 8, y0 + 40, r.short, shade(st.accent, -0.15), 7, 0.55);
  kText(x0 + 8, y0 + 48, `${DECK_NAME[r.deck]}-${String(ROOM_DEFS.findIndex((d) => d.id === r.id) + 1).padStart(2, '0')}`, shade(PAL.off, -0.4), 5, 0.45);
}

// ---------------------------------------------------------------------------
// Room contents
// ---------------------------------------------------------------------------
const ROOM_ART = {
  airlock(r, A) {
    const fy = r.fy, y0 = r.y0;
    kHazard(0, fy - 4, 40, 4, 0.6);
    kMachine(26, fy - 70, 34, 50, '#3d4242', { plate: true });
    A.screens.push({ x: 31, y: fy - 64, w: 24, h: 12, kind: 'cycle' });
    // suit alcoves
    for (const ax of [62, 176]) {
      kBevel(ax, y0 + 52, 56, fy - y0 - 52, '#2b2f2f');
      kRect(ax + 3, y0 + 55, 50, fy - y0 - 58, '#1c1f20');
      drawSuitSilhouette(ax + 28, fy - 6);
    }
    kText(66, y0 + 62, 'EVA 1', PAL.off, 5, 0.5); kText(180, y0 + 62, 'EVA 2', PAL.off, 5, 0.5);
    kPipeV(228, y0 + 14, fy, 2.4, '#5a5446');
    kText(30, y0 + 35, 'VACUUM BEYOND', PAL.redB, 5, 0.5);
    A.lights[0].x = 100; if (A.lights[1]) A.lights[1].x = 190;
  },
  security(r, A) {
    const fy = r.fy, y0 = r.y0;
    // weapon rack
    kBevel(258, y0 + 50, 82, 70, '#26292c');
    for (let i = 0; i < 5; i++) { const gx = 266 + i * 15; kRect(gx, y0 + 56, 3, 56, '#141617'); kRect(gx - 2, y0 + 92, 7, 6, '#141617'); }
    kText(262, y0 + 46, 'ARMOURY', PAL.off, 5, 0.5);
    // desk + monitor wall
    kBevel(398, y0 + 28, 126, 66, '#1f2326');
    A.monitorWall = { x: 402, y: y0 + 32, w: 118, h: 58 };
    kConsole(410, fy - 44, 100, 44, '#2f363b', A.screens);
    kLocker(530, fy - 82, 22, 82, '#3b434a'); kLocker(553, fy - 82, 22, 82, '#353d43');
    kMachine(350, fy - 36, 40, 36, '#353b40');
    kStreaks(r.x0, y0, r.x1, fy, 18);
  },
  medbay(r, A) {
    const fy = r.fy, y0 = r.y0;
    for (const bx of [598, 806]) {
      kRect(bx, fy - 22, 80, 6, '#8d8b82'); kRect(bx + 2, fy - 16, 4, 16, '#3a3a36'); kRect(bx + 72, fy - 16, 4, 16, '#3a3a36');
      kRect(bx + 4, fy - 26, 20, 5, '#a8a49a'); // pillow
      kPipeV(bx + 86, fy - 70, fy, 0.8, '#77756d'); kRect(bx + 80, fy - 74, 12, 8, '#6e7066');
      A.screens.push({ x: bx + 20, y: y0 + 54, w: 26, h: 14, kind: 'vitals' });
      kBevel(bx + 18, y0 + 52, 30, 18, '#3c3d39');
    }
    // scanner arch
    const c = ART.ctx; c.strokeStyle = '#55574f'; c.lineWidth = 7; c.beginPath(); c.moveTo(728, fy); c.lineTo(728, fy - 72); c.quadraticCurveTo(760, fy - 92, 792, fy - 72); c.lineTo(792, fy); c.stroke();
    c.strokeStyle = '#2b2c29'; c.lineWidth = 2; c.stroke();
    A.screens.push({ x: 744, y: fy - 100, w: 32, h: 8, kind: 'scan' });
    kLocker(880, fy - 90, 34, 90, '#7a7a72');
    kRect(886, fy - 70, 22, 4, PAL.green); // faded green cross band
    kMachine(600, y0 + 30, 50, 18, '#6c6d66', { grille: false });
    kStreaks(r.x0, y0, r.x1, fy, 22, 0.12);
  },
  quarantine(r, A) {
    const fy = r.fy, y0 = r.y0;
    // isolation cell glass
    kBevel(1086, y0 + 24, 6, fy - y0 - 24, '#3d413f');
    const c = ART.ctx; c.fillStyle = 'rgba(150,170,160,0.06)'; c.fillRect(1092, y0 + 26, 86, fy - y0 - 26);
    c.strokeStyle = 'rgba(200,210,200,0.12)'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(1098 + i * 20, y0 + 30); c.lineTo(1110 + i * 20, y0 + 80); c.stroke(); }
    kRect(1110, fy - 18, 56, 6, '#77786f'); kRect(1112, fy - 12, 4, 12, '#333'); kRect(1160, fy - 12, 4, 12, '#333');
    kText(1100, y0 + 40, 'ISOLATION', PAL.off, 5, 0.5);
    // bench
    kBevel(936, fy - 40, 130, 8, '#5b5d57'); kRect(940, fy - 32, 6, 32, '#2e2f2c'); kRect(1056, fy - 32, 6, 32, '#2e2f2c');
    kMachine(944, fy - 64, 28, 24, '#6a6c66', { grille: false }); // centrifuge
    kRect(985, fy - 72, 6, 32, '#3a3b38'); kRect(980, fy - 50, 16, 8, '#4d4f4a'); // microscope
    kConsole(1004, fy - 92, 56, 50, '#555750', A.screens);
    kTank(940, y0 + 30, 16, 40, '#6a6e62'); kTank(960, y0 + 34, 14, 36, '#5e6359');
    kText(930, y0 + 88, 'SAMPLE HANDLING — GLOVES', PAL.off, 4.5, 0.4);
  },
  bridge(r, A) {
    const fy = r.fy, y0 = r.y0;
    // forward windows
    const c = ART.ctx;
    for (let i = 0; i < 3; i++) {
      const wx = 1660 + i * 44;
      kBevel(wx - 3, y0 + 26, 40, 82, '#22292e');
      c.fillStyle = '#030405'; c.fillRect(wx, y0 + 30, 34, 74);
      A.windows = A.windows || []; A.windows.push({ x: wx, y: y0 + 30, w: 34, h: 74 });
      for (let s = 0; s < 6; s++) { c.fillStyle = `rgba(200,200,190,${ar(0.2, 0.7)})`; c.fillRect(wx + ar(2, 32), y0 + ar(32, 100), 0.8, 0.8); }
    }
    // overhead monitors
    for (let i = 0; i < 4; i++) { const mx = 1240 + i * 96; kBevel(mx, y0 + 28, 60, 26, '#20262a'); A.screens.push({ x: mx + 3, y: y0 + 31, w: 54, h: 20, kind: i === 1 ? 'map' : i === 2 ? 'radar' : 'console', seed: i }); }
    // console row
    for (let i = 0; i < 4; i++) { if (i === 2) continue; kConsole(1210 + i * 110, fy - 46, 80, 46, '#323b42', A.screens); }
    // command chair
    kRect(1560, fy - 34, 22, 6, '#2a2d30'); kRect(1578, fy - 56, 6, 28, '#2a2d30'); kRect(1568, fy - 28, 4, 28, '#1e2022');
    kMachine(1610, fy - 30, 40, 30, '#2f373d');
    kText(1210, y0 + 70, 'NAV / DEBRIS', PAL.off, 5, 0.4);
  },
  workshop(r, A) {
    const fy = r.fy, y0 = r.y0;
    kMachine(16, fy - 62, 92, 62, '#4f4d42', { plate: true, stripe: true }); // lathe
    kRect(30, fy - 76, 50, 14, '#3a3930'); kRect(76, fy - 70, 22, 4, '#6c6a5c');
    // workbench + tool wall
    kBevel(182, fy - 38, 118, 7, '#5b574a'); kRect(186, fy - 31, 5, 31, '#2e2c26'); kRect(290, fy - 31, 5, 31, '#2e2c26');
    kBevel(182, y0 + 44, 118, 56, '#3a382f');
    const c = ART.ctx; c.fillStyle = '#2a2822'; for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) c.fillRect(186 + i * 9.5, y0 + 48 + j * 8.5, 1.2, 1.2);
    for (let i = 0; i < 9; i++) { c.fillStyle = arPick(['#141414', '#5b4a2a', '#2b2b2b']); c.fillRect(190 + i * 12, y0 + 52 + ar(0, 10), ar(2, 4), ar(14, 28)); }
    // parts shelving
    for (let s = 0; s < 3; s++) { kRect(346, fy - 30 - s * 30, 64, 3, '#55524a'); for (let b = 0; b < 4; b++) kBevel(348 + b * 16, fy - 44 - s * 30, 13, 13, arPick(['#4e5a4a', '#5a4e3a', '#454545'])); }
    // crane rail
    kRect(10, y0 + 30, 160, 5, '#2c2b27'); kRect(118, y0 + 35, 2, 30, '#191919'); kRect(112, y0 + 64, 14, 6, PAL.yellowD);
    kText(186, y0 + 112, 'FAB / REPAIR', PAL.yellow, 5, 0.45);
    kStreaks(r.x0, y0, r.x1, fy, 30, 0.22); kRust(r.x0, y0 + 60, r.x1, fy, 30);
  },
  quarters(r, A) {
    const fy = r.fy, y0 = r.y0;
    A.bunks = [];
    for (const bx of [436, 528, 612, 724]) {
      for (let t = 0; t < 2; t++) {
        const by = fy - 18 - t * 50;
        kRect(bx, by, 74, 5, '#5a574f'); kRect(bx + 3, by - 6, 68, 6, '#6e695e'); // mattress
        kRect(bx + 3, by - 8, 14, 4, '#8a8577');
        A.bunks.push({ x: bx + 37, y: by - 6 });
      }
      kRect(bx, fy - 112, 3, 112, '#2d2c29'); kRect(bx + 72, fy - 112, 3, 112, '#2d2c29');
      // curtain
      const c = ART.ctx; c.fillStyle = 'rgba(70,74,66,0.6)'; c.fillRect(bx + 52, fy - 110, 18, 40);
      // personal items: photos
      c.fillStyle = '#9c968a'; c.fillRect(bx + 10 + ar(0, 30), fy - 60, 5, 4); c.fillRect(bx + 14 + ar(0, 30), fy - 110, 4, 5);
    }
    kLocker(694, fy - 76, 26, 76, '#4b4b46');
    kText(440, y0 + 34, 'QUIET HOURS ' + '22-06', PAL.off, 5, 0.35);
  },
  mess(r, A) {
    const fy = r.fy, y0 = r.y0;
    kLocker(830, fy - 70, 24, 70, '#4e4c44'); kLocker(855, fy - 70, 24, 70, '#4a483f');
    for (const tx of [935, 1070]) {
      kBevel(tx, fy - 30, 100, 5, '#615c50'); kRect(tx + 46, fy - 25, 8, 25, '#2a2925');
      kRect(tx - 8, fy - 14, 22, 4, '#3d3b35'); kRect(tx + 86, fy - 14, 22, 4, '#3d3b35');
      const c = ART.ctx; c.fillStyle = '#8b8678'; c.fillRect(tx + 20, fy - 33, 8, 3); c.fillRect(tx + 64, fy - 33, 6, 3);
    }
    // galley
    kMachine(1186, fy - 54, 68, 54, '#5a5852', { plate: true });
    kBevel(1192, y0 + 40, 56, 40, '#45433d');
    A.screens.push({ x: 1198, y: y0 + 46, w: 20, h: 10, kind: 'galley' });
    kText(1196, y0 + 36, 'RATIONS', PAL.off, 5, 0.45);
    // notice board
    kBevel(960, y0 + 40, 80, 46, '#3a362e');
    const c = ART.ctx; for (let i = 0; i < 7; i++) { c.fillStyle = arPick(['#9d978a', '#8a8579', '#a39b84', '#7c7a70']); c.save(); c.translate(966 + ar(0, 64), y0 + 44 + ar(0, 32)); c.rotate(ar(-0.1, 0.1)); c.fillRect(0, 0, ar(8, 14), ar(9, 13)); c.restore(); }
    kText(964, y0 + 37, 'WATCH ROSTER / NOTICES', PAL.off, 4.5, 0.4);
  },
  hydro(r, A) {
    const fy = r.fy, y0 = r.y0;
    A.plants = [];
    for (const [rx, rw] of [[1276, 150], [1600, 190]]) {
      for (let t = 0; t < 3; t++) {
        const ty = fy - 10 - t * 40;
        kRect(rx, ty, rw, 4, '#3d3e37'); kRect(rx, ty - 6, rw, 6, '#2a2620');
        kRect(rx + 4, ty - 32, rw - 8, 2, '#5b5a50');
        A.lights.push({ x: rx + rw / 2, y: ty - 30, r: 60, kind: 'grow', ph: ar(10) });
        for (let px = rx + 6; px < rx + rw - 6; px += ar(6, 10)) A.plants.push({ x: px, y: ty - 6, h: ar(8, 20), s: ar(1) });
      }
      kRect(rx, fy - 118, 3, 118, '#2b2a26'); kRect(rx + rw - 3, fy - 118, 3, 118, '#2b2a26');
    }
    kTank(1480, fy - 80, 26, 80, '#4a5546'); kTank(1510, fy - 70, 20, 70, '#55604f');
    kPipeH(1440, 1600, fy - 88, 2, '#4a5546');
    kText(1280, y0 + 36, 'HYDRO 6 — POTABLE LOOP', PAL.green, 5, 0.5);
    kRust(r.x0, fy - 40, r.x1, fy, 20);
  },
  reactor(r, A) {
    const fy = r.fy, y0 = r.y0;
    const c = ART.ctx;
    // shielding
    kHazard(30, fy - 6, 230, 6, 0.5);
    kBevel(46, y0 + 14, 210, fy - y0 - 20, '#2f302b', 2);
    { const vx = 74, vw = 154, vy = y0 + 20, vh = fy - y0 - 28;
      const g = c.createLinearGradient(vx, 0, vx + vw, 0); g.addColorStop(0, '#2a2b27'); g.addColorStop(0.25, '#6a6a5e'); g.addColorStop(0.5, '#56574d'); g.addColorStop(1, '#22231f');
      c.fillStyle = g; c.fillRect(vx, vy + 8, vw, vh - 16);
      c.beginPath(); c.moveTo(vx, vy + 8); c.lineTo(vx + 14, vy); c.lineTo(vx + vw - 14, vy); c.lineTo(vx + vw, vy + 8); c.fill();
      c.beginPath(); c.moveTo(vx, vy + vh - 8); c.lineTo(vx + 14, vy + vh); c.lineTo(vx + vw - 14, vy + vh); c.lineTo(vx + vw, vy + vh - 8); c.fill();
      for (let i = 0; i < 5; i++) { kRect(vx - 3, vy + 14 + i * 22, vw + 6, 4, '#2c2d28'); for (let b = 0; b < 8; b++) kBolt(vx + 4 + b * 20, vy + 15 + i * 22, '#2c2d28'); }
      kPipeV(vx + 10, vy - 6, vy + vh, 3, '#5f5640'); kPipeV(vx + vw - 10, vy - 6, vy + vh, 3, '#4c5a5a'); }
    // core viewport (dynamic glow)
    kBevel(126, y0 + 52, 50, 40, '#25261f');
    kRect(130, y0 + 56, 42, 32, '#0a0b0a');
    A.core = { x: 151, y: y0 + 72, w: 42, h: 32 };
    kText(92, y0 + 112, 'PRIMARY CONTAINMENT', PAL.yellow, 5, 0.55);
    // control console
    kConsole(262, fy - 50, 56, 50, '#3f3e36', A.screens);
    // coolant pumps
    for (const px of [380, 430]) { kMachine(px, fy - 54, 42, 54, '#4b4c42', { stripe: true }); A.fans = A.fans || []; A.fans.push({ x: px + 21, y: fy - 32, r: 13 }); }
    // heat exchanger
    kMachine(486, y0 + 30, 100, fy - y0 - 30, '#45463f', { plate: true });
    for (let i = 0; i < 7; i++) kPipeV(496 + i * 13, y0 + 36, fy - 10, 2.6, '#5c5a4c');
    kPipeH(232, 486, y0 + 44, 4, '#5f5640'); kPipeH(232, 486, y0 + 60, 3, '#4c5a5a');
    kText(264, y0 + 38, 'COOLANT', PAL.off, 5, 0.4);
    kStreaks(r.x0, y0, r.x1, fy, 40, 0.25); kRust(r.x0, y0 + 40, r.x1, fy, 40);
    A.lights.forEach((l, i) => { if (Math.abs(l.x - 151) < 60) l.x = 290; });
  },
  o2(r, A) {
    const fy = r.fy, y0 = r.y0;
    for (let i = 0; i < 4; i++) { kTank(616 + i * 26, y0 + 30, 20, fy - y0 - 36, '#5d6a6a'); }
    kPipeH(612, 726, y0 + 28, 2.5, '#6b6b62');
    A.fans = [];
    for (const fx of [762, 830]) { kBevel(fx - 30, fy - 92, 60, 62, '#3a4242', 2); const c = ART.ctx; c.fillStyle = '#121515'; c.beginPath(); c.arc(fx, fy - 61, 26, 0, 6.3); c.fill(); A.fans.push({ x: fx, y: fy - 61, r: 24 }); }
    kText(735, fy - 18, 'AIR HANDLERS 1/2', PAL.off, 5, 0.45);
    for (let i = 0; i < 3; i++) kMachine(920 + i * 24, fy - 80 + i * 6, 22, 80 - i * 6, '#4c5555', { grille: true });
    A.screens.push({ x: 864, y: y0 + 46, w: 24, h: 14, kind: 'console', seed: 7 });
    kBevel(860, y0 + 42, 32, 22, '#2f3636');
    kText(612, y0 + 26, 'ELECTROLYSIS STACK', PAL.off, 4.5, 0.45);
    kStreaks(r.x0, y0, r.x1, fy, 25, 0.2);
  },
  cryo(r, A) {
    const fy = r.fy, y0 = r.y0;
    const c = ART.ctx;
    // receding bay (the section goes much deeper than we can see)
    kBevel(1350, y0 + 22, 150, 100, '#1b1f22');
    for (let d = 0; d < 6; d++) {
      const k = 1 - d * 0.15; const w = 140 * k, h = 92 * k; const x = 1425 - w / 2, y = y0 + 26 + (92 - h) / 2;
      c.strokeStyle = `rgba(80,95,105,${0.35 * k})`; c.lineWidth = 1; c.strokeRect(x, y, w, h);
      for (let p = 0; p < 6; p++) { c.fillStyle = `rgba(60,72,80,${0.5 * k})`; c.fillRect(x + 4 + p * (w - 8) / 6, y + h - 10 * k, (w - 8) / 6 - 2, 8 * k); }
    }
    kText(1356, y0 + 132, 'BAY 6-C CONTINUES — 2,400 BERTHS', PAL.off, 4.5, 0.45);
    A.pods = [];
    const podXs = [];
    for (let x = 1018; x < 1342; x += 54) podXs.push(x);
    for (let x = 1508; x < 1780; x += 54) if (Math.abs(x + 22 - 1550) > 36) podXs.push(x);
    for (const px of podXs) for (let t = 0; t < 2; t++) {
      const py = fy - 62 - t * 66;
      kBevel(px, py, 46, 58, '#58646c', 1.5);
      c.fillStyle = '#0d1114'; c.beginPath(); c.ellipse(px + 23, py + 26, 14, 20, 0, 0, 6.3); c.fill();
      c.fillStyle = 'rgba(190,205,210,0.08)'; c.beginPath(); c.ellipse(px + 20, py + 22, 8, 12, 0, 0, 6.3); c.fill();
      // sleeper silhouette
      c.fillStyle = 'rgba(120,130,135,0.18)'; c.beginPath(); c.ellipse(px + 23, py + 18, 4, 5, 0, 0, 6.3); c.fill(); c.fillRect(px + 18, py + 23, 10, 18);
      A.pods.push({ x: px + 40, y: py + 52, n: A.pods.length });
    }
    kPipeH(r.x0, r.x1, fy - 2, 2, '#6b7a84', false);
    kPipeH(r.x0, r.x1, y0 + 32, 3, '#6b7a84');
    kBevel(1350, fy - 40, 150, 40, '#2f363b'); A.screens.push({ x: 1366, y: fy - 34, w: 40, h: 14, kind: 'console', seed: 3 }); A.screens.push({ x: 1440, y: fy - 34, w: 40, h: 14, kind: 'cryo' });
  },
};

function drawSuitSilhouette(x, fy) {
  const c = ART.ctx;
  c.fillStyle = '#6d6a5e';
  c.beginPath(); c.ellipse(x, fy - 74, 9, 9, 0, 0, 6.3); c.fill(); // helmet
  c.fillStyle = '#121314'; c.beginPath(); c.ellipse(x + 2, fy - 74, 5, 4.5, 0, 0, 6.3); c.fill();
  c.fillStyle = '#7a776a'; c.fillRect(x - 12, fy - 64, 24, 30); c.fillRect(x - 15, fy - 62, 5, 24); c.fillRect(x + 10, fy - 62, 5, 24);
  c.fillRect(x - 10, fy - 34, 8, 28); c.fillRect(x + 2, fy - 34, 8, 28);
  c.fillStyle = PAL.yellowD; c.fillRect(x - 12, fy - 52, 24, 3);
  c.fillStyle = '#4a483f'; c.fillRect(x - 9, fy - 62, 18, 10);
}

// bulkheads between rooms & slabs between decks ------------------------------
function drawBulkheads() {
  const c = ART.ctx;
  for (let d = 0; d < 3; d++) {
    const ys = DECK_TOP[d], ye = ys + ROOM_H;
    const xs = [0, ...ROOM_DEFS.filter((r) => r.deck === d).map((r) => r.x1)];
    for (const x of xs) {
      const w = 12;
      kBevel(x - w / 2, ys, w, ROOM_H, '#2a2c2b', 1.5);
      kRect(x - w / 2 - 3, ys, 3, ROOM_H, 'rgba(0,0,0,0.35)'); kRect(x + w / 2, ys, 3, ROOM_H, 'rgba(0,0,0,0.35)');
      // door frame cut
      const door = G.doors.find((dd) => !dd.hatch && dd.x === x && G.roomById[dd.a].deck === d);
      if (door) {
        const dy = ye - 8 - 50;
        kBevel(x - 10, dy - 6, 20, 6, '#3a3c38');
        kRect(x - 6, dy, 12, 50, '#0c0d0d');
        kHazard(x - 10, dy - 6, 20, 3, 0.5);
      }
      for (let y = ys + 10; y < ye; y += 24) kBolt(x - 3, y, '#2a2c2b');
    }
    // slab below
    const sy = ye, sh = SLAB;
    kRect(-6, sy, SHIP_W + 12, sh, '#141515');
    kRect(-6, sy, SHIP_W + 12, 4, '#2b2c2a');
    kRect(-6, sy + sh - 3, SHIP_W + 12, 3, '#232422');
    // ducts (the vent network lives here)
    if (d < 2) {
      kBevel(-6, sy + 8, SHIP_W + 12, 12, '#272a29', 1);
      c.fillStyle = '#1a1c1b'; for (let x = 0; x < SHIP_W; x += 34) c.fillRect(x, sy + 9, 1, 10);
      kPipeH(-6, SHIP_W + 6, sy + 25, 2, '#3d3f3a', false);
    } else {
      kPipeH(-6, SHIP_W + 6, sy + 12, 3, '#3a3c38', false); kPipeH(-6, SHIP_W + 6, sy + 22, 2, '#4a3f30', false);
    }
    for (let x = 30; x < SHIP_W; x += 90) { kBevel(x, sy + 3, 8, sh - 5, '#1e1f1e'); }
  }
  // ladders for hatches
  for (const d of G.doors.filter((x) => x.hatch)) {
    const below = G.roomById[d.b], above = G.roomById[d.a];
    const lx = d.x;
    c.fillStyle = '#4b4d48'; c.fillRect(lx - 9, below.y0, 2, ROOM_H - 8); c.fillRect(lx + 7, below.y0, 2, ROOM_H - 8);
    for (let y = below.y0 + 6; y < below.fy; y += 9) c.fillRect(lx - 9, y, 18, 1.6);
    // hatch rail above
    c.fillStyle = '#3e403b'; c.fillRect(lx - 18, above.fy - 18, 2, 18); c.fillRect(lx + 16, above.fy - 18, 2, 18); c.fillRect(lx - 18, above.fy - 18, 36, 2);
    kHazard(lx - 16, above.fy - 1, 32, 2, 0.5);
  }
}

// ---------------------------------------------------------------------------
// Exterior hull + giant colony ship
// ---------------------------------------------------------------------------
function drawExterior(ctx, ox, oy) {
  ART.ctx = ctx;
  ctx.save(); ctx.translate(-ox, -oy);
  const top = -30, bot = DECK_TOP[2] + ROOM_H + SLAB + 30;
  // spine truss to both sides (the rest of the colony ship)
  for (const [xa, xb] of [[-900, -240], [2060, 2700]]) {
    kRect(xa, 140, xb - xa, 26, '#14171a'); kRect(xa, 330, xb - xa, 26, '#14171a');
    ctx.strokeStyle = '#1c2024'; ctx.lineWidth = 4;
    for (let x = xa; x < xb; x += 60) { ctx.beginPath(); ctx.moveTo(x, 166); ctx.lineTo(x + 60, 330); ctx.moveTo(x + 60, 166); ctx.lineTo(x, 330); ctx.stroke(); }
    kRect(xa, 236, xb - xa, 12, '#1a1d20');
    for (let x = xa + 20; x < xb; x += 140) { ctx.fillStyle = 'rgba(160,150,120,0.25)'; ctx.fillRect(x, 240, 2, 2); }
  }
  // stern: reactor shield / engine shroud
  ctx.fillStyle = '#1b1e20';
  ctx.beginPath(); ctx.moveTo(-30, top + 10); ctx.lineTo(-150, 40); ctx.lineTo(-260, 120); ctx.lineTo(-260, 420); ctx.lineTo(-150, 520); ctx.lineTo(-30, bot); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 8; i++) { kBevel(-250 + i * 6, 130 + i * 36, 210 - i * 6, 22, shade('#202428', ar(-0.1, 0.1)), 1); }
  kHazard(-60, 470, 40, 6, 0.4);
  // radiator fins (top/bottom)
  for (let i = 0; i < 5; i++) { const x = 120 + i * 140; kBevel(x, top - 70, 90, 70, '#1d2125', 1); ctx.fillStyle = '#15181b'; for (let k = 0; k < 9; k++) ctx.fillRect(x + 4 + k * 10, top - 66, 4, 62); }
  // dorsal mast + dish
  kRect(1280, top - 180, 6, 180, '#22272b'); kRect(1240, top - 120, 86, 4, '#22272b');
  ctx.fillStyle = '#20252a'; ctx.beginPath(); ctx.ellipse(1460, top - 60, 48, 18, -0.2, 0, Math.PI); ctx.fill();
  kRect(1456, top - 60, 6, 60, '#1d2125');
  // keel truss & cargo pods
  kRect(-20, bot, SHIP_W + 40, 20, '#181b1e');
  ctx.strokeStyle = '#1d2124'; ctx.lineWidth = 3; for (let x = 0; x < SHIP_W; x += 50) { ctx.beginPath(); ctx.moveTo(x, bot + 20); ctx.lineTo(x + 25, bot + 60); ctx.lineTo(x + 50, bot + 20); ctx.stroke(); }
  kRect(-20, bot + 58, SHIP_W + 40, 8, '#181b1e');
  for (let i = 0; i < 6; i++) { const x = 100 + i * 280; kBevel(x, bot + 66, 200, 60, shade('#1e2226', ar(-0.1, 0.1)), 1); kText(x + 10, bot + 100, `CARGO 6-${i + 1}`, '#5a5a52', 9, 0.35); }
  // main hull envelope
  ctx.fillStyle = '#2a2f33';
  ctx.beginPath(); ctx.moveTo(-34, top); ctx.lineTo(1830, top); ctx.quadraticCurveTo(2050, top + 40, 2070, 260); ctx.quadraticCurveTo(2050, bot - 40, 1830, bot); ctx.lineTo(-34, bot); ctx.closePath(); ctx.fill();
  // hull plating
  for (let x = -34; x < 2060; x += 56) for (const [y, h] of [[top, 30], [bot - 30, 30]]) {
    ctx.fillStyle = shade('#2c3236', ar(-0.18, 0.08)); ctx.fillRect(x, y, 54, h);
    ctx.fillStyle = '#1b1f22'; ctx.fillRect(x + 54, y, 2, h);
  }
  kStreaks(-34, top, 2060, top + 30, 60, 0.3);
  // bow sensor nose
  ctx.fillStyle = '#23282c'; ctx.beginPath(); ctx.moveTo(2060, 200); ctx.lineTo(2190, 240); ctx.lineTo(2190, 280); ctx.lineTo(2060, 320); ctx.fill();
  kRect(2190, 254, 120, 6, '#22272b');
  // hull lettering
  ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = PAL.off; ctx.font = 'bold 18px "DejaVu Sans Mono", monospace';
  ctx.fillText('CSV ARDENT VOW', 300, bot - 8); ctx.fillText('SECTION 06', 1200, bot - 8); ctx.restore();
  kHazard(200, top + 24, 60, 4, 0.5); kHazard(1500, bot - 28, 60, 4, 0.5);
  // inner dark between rooms and hull skin
  ctx.fillStyle = '#0f1112'; ctx.fillRect(-14, -14, SHIP_W + 28, bot - 16);
  // bow interior wedge
  ctx.fillStyle = '#16191b'; ctx.beginPath(); ctx.moveTo(1814, -14); ctx.quadraticCurveTo(2030, 30, 2040, 260); ctx.quadraticCurveTo(2030, bot - 50, 1814, bot - 16); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 9; i++) { kBevel(1830 + (i % 3) * 52, 40 + Math.floor(i / 3) * 150, 40, 110, shade('#1f2326', ar(-0.1, 0.1)), 1); }
  ctx.restore();
}

function drawColossus(ctx, w, h) {
  // the rest of the colony ship, far behind, parallax layer
  ctx.fillStyle = '#050607'; ctx.fillRect(0, 0, w, h);
  const AR2 = mulberry32(99);
  for (let i = 0; i < 220; i++) { ctx.fillStyle = `rgba(200,200,190,${AR2() * 0.35})`; const s = AR2() < 0.1 ? 1.4 : 0.8; ctx.fillRect(AR2() * w, AR2() * h, s, s); }
  // giant drum segments
  const base = h * 0.18;
  for (let i = 0; i < 7; i++) {
    const x = i * 380 - 200, yw = 120 + (i % 2) * 40;
    ctx.fillStyle = i % 2 ? '#0b0d0f' : '#0d1012';
    ctx.fillRect(x, base - yw / 2 + 300, 320, yw * 2.4);
    ctx.fillStyle = '#090b0c'; ctx.fillRect(x + 320, base + 340, 60, 60);
    for (let k = 0; k < 14; k++) { if (AR2() < 0.25) { ctx.fillStyle = `rgba(190,150,90,${0.08 + AR2() * 0.12})`; ctx.fillRect(x + 10 + AR2() * 300, base + 300 + AR2() * yw * 2.2, 2, 1.5); } }
    ctx.fillStyle = '#0a0c0d'; for (let k = 0; k < 12; k++) ctx.fillRect(x + k * 27, base - yw / 2 + 300, 1, yw * 2.4);
  }
  ctx.fillStyle = '#080a0b'; ctx.fillRect(0, base + 370, w, 26);
}

function makeGrain(size = 256) {
  const c = mkCanvas(size, size), x = c.getContext('2d'); const id = x.createImageData(size, size);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  x.putImageData(id, 0, 0); return c;
}
function makeLightSprite(col = '255,255,255', size = 128, soft = 0.0) {
  const c = mkCanvas(size, size), x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${col},1)`); g.addColorStop(0.25 + soft, `rgba(${col},0.55)`); g.addColorStop(0.6, `rgba(${col},0.16)`); g.addColorStop(1, `rgba(${col},0)`);
  x.fillStyle = g; x.fillRect(0, 0, size, size); return c;
}

function buildArt() {
  AR = mulberry32(1337);
  const S = ART.S;
  // interior
  ART.interior = mkCanvas(ART.IW * S, ART.IH * S);
  const ctx = ART.interior.getContext('2d');
  ctx.setTransform(S, 0, 0, S, -ART.OX * S, -ART.OY * S);
  ART.ctx = ctx;
  for (const r of G.rooms) {
    const A = { screens: [], lights: [] };
    ART.rooms[r.id] = A;
    roomShell(r, A);
    ROOM_ART[r.id](r, A);
    // grime pass
    kStreaks(r.x0, r.y0 + 14, r.x1, r.fy, Math.round(r.w / 18), 0.14);
    const g = ctx.createLinearGradient(0, r.y0, 0, r.y0 + 40); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(r.x0, r.y0, r.w, 40);
  }
  drawBulkheads();
  // grain overlay for material feel
  const grain = makeGrain(128);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grain, 'repeat'); ctx.fillRect(0, 0, ART.interior.width, ART.interior.height); ctx.restore();
  // exterior
  ART.EX = { x: -900, y: -330, w: 3600, h: 1230 };
  ART.exterior = mkCanvas(ART.EX.w, ART.EX.h);
  drawExterior(ART.exterior.getContext('2d'), ART.EX.x, ART.EX.y);
  ART.colossus = mkCanvas(2600, 1200);
  drawColossus(ART.colossus.getContext('2d'), 2600, 1200);
  // 1× mip of the interior for zoomed-out views (big perf win on software rasterisers)
  ART.interior1 = mkCanvas(ART.IW, ART.IH);
  { const x = ART.interior1.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(ART.interior, 0, 0, ART.IW, ART.IH); }
  ART.grain = makeGrain(256);
  ART.smoke = mkCanvas(64, 64); { const x = ART.smoke.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(12,11,10,0.9)'); g.addColorStop(0.5, 'rgba(12,11,10,0.45)'); g.addColorStop(1, 'rgba(12,11,10,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
  ART.lightW = makeLightSprite('255,255,255');
  ART.lightC = {};
  for (const [k, v] of Object.entries({ lamp: '217,205,175', red: '190,30,22', amber: '214,138,40', fire: '235,120,40', cold: '120,140,160', grow: '220,170,80', bio: '140,130,70', muzzle: '255,220,160', screen: '150,170,140', core: '230,220,190' })) ART.lightC[k] = makeLightSprite(v, 128);
}
