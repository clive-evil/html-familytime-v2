// The tactical display: star system map, planet close-ups, fortress foreground.
(function () {
  const SF = globalThis.SF;
  const R = (SF.render = {
    cam: { x: 0, y: 0, z: 0.6 }, camT: { x: 0, y: 0, z: 0.6 }, W: 0, H: 0, dpr: 1, t: 0,
    hover: null, view: { x0: 0, y0: 60, x1: 1000, y1: 800 }, fortPts: {}, fortState: {}, planetScreen: {}, fleetScreen: {}, instScreen: {},
  });
  const SQ = 0.42; // orbit ellipse squash
  const RZ = (v, d) => (isFinite(v) && v >= 0 ? v : (d || 0.001));
  let cv, c, bg;

  R.init = function (canvas) { cv = canvas; c = cv.getContext('2d'); R.resize(); };
  R.ctx = () => c;
  R.invalidateBg = () => { bg = null; };
  R.resize = function () {
    R.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    R.W = cv.clientWidth; R.H = cv.clientHeight;
    cv.width = R.W * R.dpr; cv.height = R.H * R.dpr;
    bg = null; if (SF.deck) SF.deck.invalidate();
    R.layout();
  };
  // Usable map region between HUD elements.
  R.layout = function () {
    const q = (id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') && e.offsetParent !== null ? e.getBoundingClientRect() : null; };
    const top = q('topbar'), panel = q('panel'), dock = q('dock'), obj = q('objective');
    R.view = { x0: obj ? obj.right * 0.6 : 0, y0: top ? top.bottom : 0, x1: panel ? panel.left : R.W, y1: dock ? dock.top : R.H };
  };

  function makeBackground() {
    const b = document.createElement('canvas');
    b.width = R.W * R.dpr; b.height = R.H * R.dpr;
    const x = b.getContext('2d'); x.scale(R.dpr, R.dpr);
    x.fillStyle = '#020408'; x.fillRect(0, 0, R.W, R.H);
    // nebula wisps
    const neb = [['rgba(60,30,90,0.22)', 0.2, 0.3, 0.6], ['rgba(20,60,90,0.2)', 0.8, 0.7, 0.55], ['rgba(110,40,20,0.12)', 0.65, 0.15, 0.4]];
    for (const [col, px, py, r] of neb) {
      const g = x.createRadialGradient(px * R.W, py * R.H, 0, px * R.W, py * R.H, RZ(r * Math.max(R.W, R.H), 10));
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, R.W, R.H);
    }
    for (let i = 0; i < 900; i++) {
      const sx = Math.random() * R.W, sy = Math.random() * R.H, m = Math.random();
      x.fillStyle = `rgba(${200 + m * 55},${210 + m * 45},255,${0.15 + m * m * 0.8})`;
      const s = m > 0.97 ? 2 : 1;
      x.fillRect(sx, sy, s, s);
    }
    // faint holo grid
    x.strokeStyle = 'rgba(95,212,255,0.035)'; x.lineWidth = 1;
    for (let gx = 0; gx < R.W; gx += 48) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, R.H); x.stroke(); }
    for (let gy = 0; gy < R.H; gy += 48) { x.beginPath(); x.moveTo(0, gy); x.lineTo(R.W, gy); x.stroke(); }
    return b;
  }

  // ---------------------------------------------------------------- geometry
  R.planetWorld = function (g, p, t) {
    const drift = (t || 0) * 0.004 * (300 / p.orbit);
    const a = p.angle + (g.cycle - 1) * 0.06 * (300 / p.orbit) + drift;
    let x = Math.cos(a) * p.orbit, y = Math.sin(a) * p.orbit * SQ;
    if (p.parent) { const par = SF.planet(g, p.parent); const pw = R.planetWorld(g, par, t); x = pw[0] + Math.cos(a * 2) * p.orbit; y = pw[1] + Math.sin(a * 2) * p.orbit * SQ; }
    return [x, y];
  };
  R.toScreen = (wx, wy) => [(wx - R.cam.x) * R.cam.z + (R.view.x0 + R.view.x1) / 2, (wy - R.cam.y) * R.cam.z + (R.view.y0 + R.view.y1) / 2];
  R.planetRadius = (p) => { const v = p.size * R.cam.z * 1.15; return isFinite(v) && v > 0 ? v : 1; };
  R.systemZoom = function (g) {
    const sys = SF.curSys(g);
    let maxR = 0;
    for (const p of sys.planets) if (!p.parent) maxR = Math.max(maxR, p.orbit + p.size + 40);
    const w = R.view.x1 - R.view.x0, h = R.view.y1 - R.view.y0;
    return Math.min(w / (2 * maxR), h / (2 * maxR * SQ + 140));
  };
  R.focusOn = function (g, pid) {
    if (!pid) { R.camT = { x: 0, y: 0, z: R.systemZoom(g) }; return; }
    const p = SF.planet(g, pid);
    const [x, y] = R.planetWorld(g, p, R.t);
    const h = R.view.y1 - R.view.y0, w = R.view.x1 - R.view.x0;
    const targetR = Math.min(h * 0.3, w * 0.24);
    R.camT = { x, y: y - 6, z: targetR / (p.size * 1.15), pid };
  };
  R.snap = function () { R.cam = Object.assign({}, R.camT); };

  // Screen position of an installation (used by FX anchors and hit-testing).
  R.instPos = function (g, pid, iid) {
    const p = SF.planet(g, pid);
    const i = SF.inst(p, iid);
    const [wx, wy] = R.planetWorld(g, p, R.t);
    const [sx, sy] = R.toScreen(wx, wy);
    const r = R.planetRadius(p);
    if (!i) return [sx, sy];
    return [sx + i.pos[0] * r * 0.92, sy + i.pos[1] * r * 0.92];
  };
  R.planetPos = function (g, pid) { const p = SF.planet(g, pid); const [wx, wy] = R.planetWorld(g, p, R.t); return R.toScreen(wx, wy); };
  R.fleetWorld = function (f) {
    const d = 980 - (2 - Math.min(2, f.eta)) * 230;
    return [Math.cos(f.angle) * d, Math.sin(f.angle) * d * SQ];
  };
  R.fleetPos = function (f) { const [x, y] = R.fleetWorld(f); return R.toScreen(x, y); };

  // ---------------------------------------------------------------- frame
  R.frame = function (dt, g, ui) {
    R.t += dt;
    const k = 1 - Math.pow(0.002, dt);
    R.cam.x += (R.camT.x - R.cam.x) * k; R.cam.y += (R.camT.y - R.cam.y) * k; R.cam.z += (R.camT.z - R.cam.z) * k;
    if (!isFinite(R.cam.x) || !isFinite(R.cam.y) || !isFinite(R.cam.z) || R.cam.z <= 0) R.cam = { x: 0, y: 0, z: R.systemZoom(g) || 0.6 };
    if (!isFinite(R.camT.x) || !isFinite(R.camT.y) || !isFinite(R.camT.z) || R.camT.z <= 0) R.camT = { x: 0, y: 0, z: R.systemZoom(g) || 0.6 };
    if (R.camT.pid && g) { const p = SF.planet(g, R.camT.pid); if (p) { const [x, y] = R.planetWorld(g, p, R.t); R.camT.x = x; R.camT.y = y - 6; } }
    c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    if (!bg) bg = makeBackground();
    c.drawImage(bg, 0, 0, R.W, R.H);
    if (!g) return;
    const [sx, sy] = SF.fx.offset();
    c.save(); c.translate(sx, sy);
    drawSystem(g, ui);
    const focus = ui.selected && R.camT.pid === ui.selected;
    R.fortPts = SF.art.drawFortress(c, R.W * 0.12, R.H * 0.93, Math.min(R.W, R.H) / 1250, -0.42, g, R.t, R.fortState);
    SF.fx.draw(c, R.W, R.H);
    c.restore();
    // vignette + scanlines
    const vg = c.createRadialGradient(R.W / 2, R.H / 2, Math.min(R.W, R.H) * 0.4, R.W / 2, R.H / 2, Math.max(R.W, R.H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg; c.fillRect(0, 0, R.W, R.H);
    if (R.fortState.alarm) { c.fillStyle = `rgba(255,30,10,${0.08 + 0.06 * Math.sin(R.t * 8)})`; c.fillRect(0, 0, R.W, R.H); }
    void focus;
  };

  function drawSystem(g, ui) {
    const sys = SF.curSys(g), def = SF.sysDef(g);
    // star
    const [stx, sty] = R.toScreen(0, 0);
    const sr = 38 * R.cam.z + 14;
    const sg = c.createRadialGradient(stx, sty, 0, stx, sty, RZ(sr * 6, 10));
    sg.addColorStop(0, def.star); sg.addColorStop(0.12, def.star); sg.addColorStop(0.2, hexA(def.star, 0.35)); sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg; c.beginPath(); c.arc(stx, sty, sr * 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(stx, sty, sr * 0.8, 0, Math.PI * 2); c.fill();
    // orbits
    c.lineWidth = 1;
    for (const p of sys.planets) {
      if (p.parent) continue;
      c.strokeStyle = p.owner === 'player' ? 'rgba(109,255,156,0.22)' : p.owner === 'enemy' ? 'rgba(255,110,80,0.18)' : 'rgba(95,212,255,0.16)';
      c.setLineDash([6, 8]);
      c.beginPath(); c.ellipse(stx, sty, Math.max(0.01, p.orbit * R.cam.z), Math.max(0.01, p.orbit * SQ * R.cam.z), 0, 0, Math.PI * 2); c.stroke();
    }
    c.setLineDash([]);
    // decorative dust belt
    c.fillStyle = 'rgba(180,170,150,0.25)';
    for (let i = 0; i < 220; i++) { const a = i * 2.39996, rr = (820 + ((i * 37) % 90)) * R.cam.z; c.fillRect(stx + Math.cos(a + R.t * 0.01) * rr, sty + Math.sin(a + R.t * 0.01) * rr * SQ, 1.5, 1.5); }

    // planets, back to front
    const order = sys.planets.map((p) => ({ p, w: R.planetWorld(g, p, R.t) })).sort((a, b) => a.w[1] - b.w[1]);
    R.planetScreen = {}; R.instScreen = {};
    for (const { p, w } of order) drawPlanet(g, ui, p, w);
    // fleets
    R.fleetScreen = {};
    for (const f of sys.fleets) drawFleet(g, ui, f);
  }

  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  function drawPlanet(g, ui, p, w) {
    const [x, y] = R.toScreen(w[0], w[1]);
    const r = R.planetRadius(p);
    R.planetScreen[p.id] = { x, y, r };
    const sel = ui.selected === p.id;
    const focused = sel && R.cam.z > R.camT.z * 0.7 && R.camT.pid === p.id;
    const hov = R.hover && R.hover.kind === 'planet' && R.hover.id === p.id;
    // light from star
    const [stx, sty] = R.toScreen(0, 0);
    let lx = stx - x, ly = sty - y; const ln = Math.hypot(lx, ly) || 1; lx /= ln; ly /= ln;

    if (p.owner === 'destroyed') { drawDebris(p, x, y, r); label(g, p, x, y, r, sel, hov); return; }

    // atmosphere glow
    if (!['moon', 'asteroid', 'rocky'].includes(p.type)) {
      const ag = c.createRadialGradient(x, y, RZ(r * 0.9), x, y, RZ(r * 1.25, 1));
      const ac = p.type === 'exotic' ? '190,120,255' : p.type === 'lava' ? '255,120,60' : p.type === 'gas' || p.type === 'desert' || p.type === 'arid' ? '255,200,140' : '120,190,255';
      ag.addColorStop(0, `rgba(${ac},0.35)`); ag.addColorStop(1, `rgba(${ac},0)`);
      c.fillStyle = ag; c.beginPath(); c.arc(x, y, r * 1.25, 0, Math.PI * 2); c.fill();
    }
    const img = p.type === 'asteroid' ? SF.art.asteroidImage(p, r * 2.4) : SF.art.planetImage(p, r * 2, lx, ly);
    const dr = p.type === 'asteroid' ? r * 1.2 : r;
    c.drawImage(img, x - dr, y - dr, dr * 2, dr * 2);

    // planetary shield bubble
    if (p.owner === 'enemy' && p.insts.some((i) => i.type === 'shield' && i.hp > 0)) {
      const up = SF.shieldUp(p);
      const eff = SF.powerEff(p);
      const a = up ? (0.18 + 0.08 * Math.sin(R.t * 2)) * eff : 0.05 * Math.max(0, Math.sin(R.t * 30));
      c.save();
      c.strokeStyle = `rgba(110,190,255,${a * 2.5})`; c.lineWidth = 2;
      c.fillStyle = `rgba(80,150,255,${a * 0.5})`;
      c.beginPath(); c.arc(x, y, r * 1.12, 0, Math.PI * 2); c.fill(); c.stroke();
      if (focused && up) {
        c.globalAlpha = a * 1.2; c.strokeStyle = 'rgba(140,210,255,0.6)'; c.lineWidth = 1;
        const hs = r * 0.16;
        for (let hy = -r; hy < r; hy += hs * 0.87) for (let hx = -r; hx < r; hx += hs * 1.5) {
          const ox = hx + ((Math.round(hy / (hs * 0.87)) & 1) ? hs * 0.75 : 0);
          if (ox * ox + hy * hy > r * r * 1.2) continue;
          c.beginPath(); for (let k = 0; k < 6; k++) { const aa = k * Math.PI / 3; c.lineTo(x + ox + Math.cos(aa) * hs * 0.5, y + hy + Math.sin(aa) * hs * 0.5); } c.closePath(); c.stroke();
        }
      }
      c.restore();
    }
    // contamination haze
    if (p.contamination > 0.05) { c.fillStyle = `rgba(140,220,60,${p.contamination * 0.12})`; c.beginPath(); c.arc(x, y, r * 1.04, 0, Math.PI * 2); c.fill(); }
    // ownership ring
    if (p.owner === 'player') { c.strokeStyle = 'rgba(109,255,156,0.55)'; c.lineWidth = 2; c.setLineDash([10, 6]); c.beginPath(); c.arc(x, y, r * 1.18 + 4, R.t * 0.2, R.t * 0.2 + Math.PI * 2); c.stroke(); c.setLineDash([]); }
    // invasion in progress: dropship streaks + ground flashes
    if (SF.troopsOnSurface(g, p.id)) {
      for (let k = 0; k < 4; k++) {
        const ph = (R.t * 0.6 + k * 0.25) % 1;
        const ax = x + r * (0.9 - k * 0.15), ay = y - r * 1.6;
        const tx = x + (k - 1.5) * r * 0.25, ty = y + r * 0.1;
        c.strokeStyle = `rgba(109,255,156,${0.6 * (1 - ph)})`; c.lineWidth = 2;
        c.beginPath(); c.moveTo(ax + (tx - ax) * ph * 0.8, ay + (ty - ay) * ph * 0.8); c.lineTo(ax + (tx - ax) * ph, ay + (ty - ay) * ph); c.stroke();
      }
      if (Math.random() < 0.15) { const a = Math.random() * 6.28, rr = Math.random() * r * 0.7; c.fillStyle = 'rgba(255,220,150,0.9)'; c.beginPath(); c.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 2 + Math.random() * 3, 0, Math.PI * 2); c.fill(); }
    }
    // installations
    if (p.scanned || p.owner !== 'enemy') {
      const showFull = focused && r > 60;
      for (const i of p.insts) {
        const A = SF.INST[i.type];
        const ix = x + i.pos[0] * r * 0.92, iy = y + i.pos[1] * r * 0.92;
        R.instScreen[i.id] = { x: ix, y: iy, pid: p.id };
        const col = SF.art.instColor(p, i);
        if (!showFull) { if (r > 18) { c.fillStyle = col; c.globalAlpha = 0.85; c.fillRect(ix - 2, iy - 2, 4, 4); c.globalAlpha = 1; } continue; }
        const ir = Math.max(11, Math.min(22, r * 0.075));
        const isSel = ui.selectedInst === i.id;
        const isHov = R.hover && R.hover.kind === 'inst' && R.hover.iid === i.id;
        if (A.orbital) { c.strokeStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.moveTo(x, y); c.lineTo(ix, iy); c.stroke(); }
        c.fillStyle = 'rgba(4,10,16,0.75)';
        c.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.lineTo(ix + Math.cos(a) * ir * 1.35, iy + Math.sin(a) * ir * 1.35); } c.closePath(); c.fill();
        c.strokeStyle = col; c.lineWidth = isSel || isHov ? 2.5 : 1.2; c.stroke();
        const vhp = ui.vhp ? ui.vhp(i) : i.hp;
        if (vhp > 0) {
          SF.art.drawGlyph(c, A.icon, ix, iy, ir * 0.62, col);
          c.strokeStyle = vhp / i.maxHp > 0.5 ? '#7dffb0' : vhp / i.maxHp > 0.25 ? '#ffd27a' : '#ff6a4d';
          c.lineWidth = 3; c.beginPath(); c.arc(ix, iy, ir * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (vhp / i.maxHp)); c.stroke();
          if (i.disabled) { c.strokeStyle = 'rgba(120,210,255,0.8)'; c.lineWidth = 1.5; for (let k = 0; k < 3; k++) { const a = R.t * 7 + k * 2; c.beginPath(); c.moveTo(ix + Math.cos(a) * ir, iy + Math.sin(a) * ir); c.lineTo(ix + Math.cos(a + 0.5) * ir * 1.5, iy + Math.sin(a + 0.5) * ir * 1.5); c.stroke(); } }
        } else {
          c.fillStyle = '#ff7a3a'; c.globalAlpha = 0.5 + 0.3 * Math.sin(R.t * 5 + ix);
          c.beginPath(); c.arc(ix, iy, ir * 0.35, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
          if (Math.random() < 0.08) SF.fx.part({ x: ix, y: iy, vx: (Math.random() - 0.5) * 6, vy: -12, life: 2, max: 2, size: ir * 0.5, color: 'smoke', type: 'smoke', drag: 0.99 });
        }
        if (isSel) {
          c.save(); c.translate(ix, iy); c.rotate(R.t * 1.5);
          c.strokeStyle = '#ff8a2a'; c.lineWidth = 2.5;
          const b = ir * 2.1;
          for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(b, b * 0.45); c.lineTo(b, b); c.lineTo(b * 0.45, b); c.stroke(); }
          c.restore();
        }
      }
    }
    // selection ring in system view
    if ((sel && !focused) || hov) {
      c.strokeStyle = sel ? '#ff8a2a' : 'rgba(95,212,255,0.7)'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, r * 1.3 + 8 + Math.sin(R.t * 4) * 2, 0, Math.PI * 2); c.stroke();
    }
    if (ui.tutorialPlanet === p.id && !sel) {
      c.strokeStyle = '#ff8a2a'; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, r * 1.4 + 14 + Math.sin(R.t * 5) * 5, 0, Math.PI * 2); c.stroke();
    }
    label(g, p, x, y, r, sel, hov, focused);
  }

  function label(g, p, x, y, r, sel, hov, focused) {
    if (focused) return;
    const col = p.owner === 'player' ? '#6dff9c' : p.owner === 'enemy' ? '#ff8a7a' : p.owner === 'destroyed' ? '#777' : '#e8dca0';
    c.textAlign = 'center';
    c.font = `600 ${sel ? 15 : 13}px Bahnschrift, "Roboto Condensed", "Arial Narrow", sans-serif`;
    c.fillStyle = col;
    const ly = y + r * (p.type === 'asteroid' ? 1.3 : 1.15) + 18;
    c.fillText(p.name, x, ly);
    c.font = '11px Consolas, monospace';
    c.fillStyle = 'rgba(200,220,235,0.7)';
    let sub = p.owner === 'destroyed' ? 'ANNIHILATED' : p.owner === 'neutral' ? 'UNCLAIMED · FREE TO CLAIM' : p.owner === 'player' ? 'HELD · +' + Math.round(SF.valueOf(SF.planetYield(p))) + ' VALUE/CYCLE' : p.scanned ? 'HOSTILE · DEF ' + SF.pct(SF.defenceRating(p)) + (SF.shieldUp(p) ? ' · SHIELDED' : '') : 'UNKNOWN SIGNATURE: SCAN';
    if (SF.troopsOnSurface(g, p.id)) sub = 'GROUND ASSAULT IN PROGRESS';
    c.fillText(sub, x, ly + 14);
  }

  function drawDebris(p, x, y, r) {
    c.save();
    const glow = c.createRadialGradient(x, y, 0, x, y, RZ(r * 1.6, 1));
    glow.addColorStop(0, 'rgba(255,120,60,0.25)'); glow.addColorStop(1, 'rgba(255,60,20,0)');
    c.fillStyle = glow; c.beginPath(); c.arc(x, y, r * 1.6, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 70; i++) {
      const a = i * 2.39996 + R.t * 0.03 * (1 + (i % 3)), rr = r * (0.3 + ((i * 53) % 100) / 70);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.55;
      const s = 1 + ((i * 7) % 5);
      c.fillStyle = i % 9 === 0 ? 'rgba(255,140,60,0.9)' : 'rgba(120,105,95,0.9)';
      c.fillRect(px, py, s, s);
    }
    c.restore();
  }

  function drawFleet(g, ui, f) {
    const [x, y] = R.fleetPos(f);
    R.fleetScreen[f.id] = { x, y, r: 26 };
    const sel = ui.selectedFleet === f.id;
    const hov = R.hover && R.hover.kind === 'fleet' && R.hover.id === f.id;
    c.save(); c.translate(x, y);
    const dir = Math.atan2(-y + R.H * 0.8, -x + R.W * 0.15);
    for (let k = 0; k < 5; k++) {
      const ox = [0, -16, -16, -32, -32][k], oy = [0, -12, 12, -24, 24][k];
      c.save(); c.rotate(dir); c.translate(ox, oy);
      c.fillStyle = '#a03a30'; c.strokeStyle = '#ff8a7a'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(12, 0); c.lineTo(-8, -5); c.lineTo(-5, 0); c.lineTo(-8, 5); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,160,90,0.8)'; c.fillRect(-11, -1.5, 4 + Math.random() * 3, 3);
      c.restore();
    }
    if (sel || hov) { c.strokeStyle = sel ? '#ff8a2a' : 'rgba(95,212,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(-30, 34, 60, 5);
    c.fillStyle = '#ff6a4d'; c.fillRect(-30, 34, 60 * (f.hp / f.maxHp), 5);
    c.textAlign = 'center'; c.font = '600 12px Bahnschrift, "Arial Narrow", sans-serif'; c.fillStyle = '#ff9a8a';
    c.fillText(f.name.toUpperCase(), 0, 54);
    c.font = '11px Consolas, monospace'; c.fillStyle = f.eta > 0 ? '#ffd27a' : '#ff6a4d';
    c.fillText(f.eta > 0 ? 'ETA ' + f.eta + ' CYCLE' + (f.eta > 1 ? 'S' : '') : 'ENGAGING', 0, 67);
    c.restore();
  }

  // ---------------------------------------------------------------- picking
  R.pick = function (g, mx, my) {
    if (!g) return null;
    let best = null, bd = 1e9;
    for (const id in R.instScreen) {
      const s = R.instScreen[id];
      const p = SF.planet(g, s.pid);
      if (!(R.camT.pid === s.pid && R.planetScreen[s.pid].r > 60)) continue;
      const d = Math.hypot(mx - s.x, my - s.y);
      if (d < 24 && d < bd) { bd = d; best = { kind: 'inst', pid: s.pid, iid: id }; }
      void p;
    }
    if (best) return best;
    for (const id in R.fleetScreen) { const s = R.fleetScreen[id]; if (Math.hypot(mx - s.x, my - s.y) < 44) return { kind: 'fleet', id }; }
    const ids = Object.keys(R.planetScreen).sort((a, b) => R.planetScreen[a].r - R.planetScreen[b].r);
    for (const id of ids) { const s = R.planetScreen[id]; if (Math.hypot(mx - s.x, my - s.y) < Math.max(s.r * 1.15, 22)) return { kind: 'planet', id }; }
    return null;
  };
})();
