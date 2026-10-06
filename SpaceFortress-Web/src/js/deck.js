// COMMAND DECK — the default home view. You stand inside the fortress: a huge observation
// window onto the planet and the fortress's own gun, foreground command consoles with live
// gauges, a holographic tactical table you approach to issue orders. Drawn on the #map canvas.
(function () {
  const SF = globalThis.SF;
  const I = () => SF.iron;
  const D = (SF.deck = { t: 0, hotspots: [], hover: null });
  const DW = 1600, DH = 900;
  let backdrop = null, bdKey = '';

  // Map design-space (1600x900) to the live canvas, letterboxed.
  function layout(W, H) {
    const sc = Math.max(W / DW, H / DH); // cover
    return { sc, ox: (W - DW * sc) / 2, oy: (H - DH * sc) / 2 };
  }
  D.toScreen = (L, x, y) => [L.ox + x * L.sc, L.oy + y * L.sc];
  D.hit = function (mx, my, W, H) {
    const L = layout(W, H);
    const x = (mx - L.ox) / L.sc, y = (my - L.oy) / L.sc;
    for (const h of D.hotspots) { if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; }
    return null;
  };

  // ---- static backdrop (ceiling, walls, window frame, console shells) cached ----
  function buildBackdrop(W, H) {
    const L = layout(W, H);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.setTransform(L.sc, 0, 0, L.sc, L.ox, L.oy);
    const iron = I();
    // deep interior gradient
    const bg = c.createLinearGradient(0, 0, 0, DH);
    bg.addColorStop(0, '#0c1116'); bg.addColorStop(0.5, '#0a0e12'); bg.addColorStop(1, '#05080b');
    c.fillStyle = bg; c.fillRect(-200, -200, DW + 400, DH + 400);

    // ---- ceiling: trusses + pipes + hanging lamp housings
    iron.plate(c, -40, -30, DW + 80, 120, { tint: [30, 34, 38], bevel: 8, bolts: false, seed: 5 });
    c.strokeStyle = '#1b2026'; c.lineWidth = 6;
    for (let x = 60; x < DW; x += 150) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 40, 90); c.moveTo(x + 40, 0); c.lineTo(x, 90); c.stroke(); } // truss X-bracing
    iron.pipe(c, -20, 40, DW + 20, 30, 16, '#45515a');
    iron.pipe(c, -20, 66, DW + 20, 72, 12, '#4a4038');
    // hanging lamp cowls
    for (const lx of [230, 560, 1040, 1370]) { c.fillStyle = '#20262c'; c.beginPath(); c.moveTo(lx - 34, 90); c.lineTo(lx + 34, 90); c.lineTo(lx + 20, 118); c.lineTo(lx - 20, 118); c.closePath(); c.fill(); }

    // ---- side wall columns
    iron.plate(c, -40, 90, 150, DH - 60, { tint: [26, 30, 34], bevel: 6, seed: 7 });
    iron.plate(c, DW - 110, 90, 150, DH - 60, { tint: [26, 30, 34], bevel: 6, seed: 8 });
    iron.cables(c, [[40, 120], [60, 300], [30, 520], [55, 760]], null, 0);
    iron.cables(c, [[DW - 40, 120], [DW - 65, 320], [DW - 30, 560], [DW - 50, 800]], null, 0);
    // wall placards (asymmetric)
    iron.placard(c, 8, 150, 92, 64, ['SECTOR', 'CMD-1'], { rot: -0.02, size: 15 });
    iron.plate_label(c, DW - 104, 200, 86, 34, 'DECK A', { tint: [44, 40, 30] });

    // ---- big observation window frame (trapezoid, wider at top → we look slightly up)
    const win = { x0: 150, y0: 96, x1: DW - 150, y1: 96, bx0: 230, by: 470, bx1: DW - 230 };
    // frame backing
    c.fillStyle = '#05080b';
    c.beginPath(); c.moveTo(win.x0 - 24, win.y0 - 10); c.lineTo(win.x1 + 24, win.y0 - 10); c.lineTo(win.bx1 + 24, win.by + 16); c.lineTo(win.bx0 - 24, win.by + 16); c.closePath(); c.fill();
    D._win = win;

    // ---- console desk across the lower foreground
    iron.plate(c, -40, DH - 250, DW + 80, 300, { tint: [38, 42, 46], bevel: 10, bolts: false, seed: 12 });
    // slanted control surface
    c.fillStyle = '#20262c';
    c.beginPath(); c.moveTo(-40, DH - 250); c.lineTo(DW + 40, DH - 250); c.lineTo(DW + 40, DH - 210); c.lineTo(-40, DH - 180); c.closePath(); c.fill();
    iron.hazard(c, -40, DH - 258, DW + 80, 10, 1);
    // floor grating hint
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2;
    for (let x = 0; x < DW; x += 40) { c.beginPath(); c.moveTo(x, DH - 10); c.lineTo(x + 20, DH + 20); c.stroke(); }

    bdKey = W + 'x' + H;
    return cv;
  }

  // ---- the view through the window: space + planet + our gun barrel ----
  function drawView(c, L) {
    const win = D._win;
    const G = SF.game;
    c.save();
    c.beginPath(); c.moveTo(win.x0, win.y0); c.lineTo(win.x1, win.y0); c.lineTo(win.bx1, win.by); c.lineTo(win.bx0, win.by); c.closePath(); c.clip();
    // space
    c.fillStyle = '#02040a'; c.fillRect(win.x0 - 40, win.y0 - 20, win.x1 - win.x0 + 80, win.by - win.y0 + 40);
    const def = SF.sysDef(G);
    // nebula + stars (deterministic)
    const ng = c.createRadialGradient(win.x0 + 300, win.y0 + 120, 0, win.x0 + 300, win.y0 + 120, 500);
    ng.addColorStop(0, 'rgba(60,30,90,0.3)'); ng.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ng; c.fillRect(win.x0, win.y0, win.x1 - win.x0, win.by - win.y0);
    for (let i = 0; i < 160; i++) { const x = win.x0 + ((i * 97) % (win.x1 - win.x0)); const y = win.y0 + ((i * 53) % (win.by - win.y0)); const m = ((i * 29) % 100) / 100; c.fillStyle = `rgba(${200 + m * 55},${210 + m * 45},255,${0.2 + m * 0.7})`; c.fillRect(x, y, m > 0.9 ? 2 : 1, m > 0.9 ? 2 : 1); }
    // the system star, low
    const sx = win.x0 + 180, sy = win.by - 40;
    const sg = c.createRadialGradient(sx, sy, 0, sx, sy, 220); sg.addColorStop(0, def.star); sg.addColorStop(0.15, def.star); sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, 220, 0, Math.PI * 2); c.fill();

    // featured planet: the player's selection, else the first hostile, else first world
    const sys = SF.curSys(G);
    let p = (SF.ui.selected && SF.planet(G, SF.ui.selected)) || SF.enemyWorlds(G)[0] || sys.planets[0];
    if (p) {
      const cx = (win.x0 + win.x1) / 2 + 180, cy = win.y0 + 220, r = 200;
      // atmosphere
      if (!['moon', 'asteroid', 'rocky'].includes(p.type) && p.owner !== 'destroyed') {
        const ac = p.type === 'exotic' ? '190,120,255' : p.type === 'lava' ? '255,120,60' : (['desert', 'arid', 'gas', 'capital'].includes(p.type)) ? '255,200,140' : '120,190,255';
        const ag = c.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.3); ag.addColorStop(0, `rgba(${ac},0.4)`); ag.addColorStop(1, `rgba(${ac},0)`);
        c.fillStyle = ag; c.beginPath(); c.arc(cx, cy, r * 1.3, 0, Math.PI * 2); c.fill();
      }
      if (p.owner === 'destroyed') { drawRubble(c, cx, cy, r); }
      else { const img = p.type === 'asteroid' ? SF.art.asteroidImage(p, r * 2.4) : SF.art.planetImage(p, r * 2, -0.5, -0.4); const dr = p.type === 'asteroid' ? r * 1.2 : r; c.drawImage(img, cx - dr, cy - dr, dr * 2, dr * 2); }
      // shield shimmer
      if (p.owner === 'enemy' && SF.shieldUp(p)) { c.strokeStyle = `rgba(110,190,255,${0.25 + 0.1 * Math.sin(D.t * 2)})`; c.lineWidth = 3; c.fillStyle = 'rgba(80,150,255,0.07)'; c.beginPath(); c.arc(cx, cy, r * 1.12, 0, Math.PI * 2); c.fill(); c.stroke(); }
      D._viewPlanet = { id: p.id, cx, cy, r };
      // name card floating at window base
      c.fillStyle = 'rgba(4,10,16,0.7)'; c.fillRect(cx - 120, cy + r * 0.72, 240, 46);
      c.strokeStyle = p.owner === 'enemy' ? '#ff8a7a' : p.owner === 'player' ? '#6dff9c' : '#e8dca0'; c.lineWidth = 1; c.strokeRect(cx - 120, cy + r * 0.72, 240, 46);
      I().stencil(c, p.name, cx, cy + r * 0.72 + 24, 22, p.owner === 'enemy' ? '#ffb0a0' : '#cfe', 'center');
      I().stencil(c, p.owner === 'enemy' ? (p.scanned ? 'HOSTILE' : 'UNSCANNED') : p.owner.toUpperCase(), cx, cy + r * 0.72 + 40, 12, '#8aa', 'center');
    }
    // our own railgun barrel crossing the view (foreground structure, lower right → up)
    c.save();
    c.translate(win.bx1 - 120, win.by + 30); c.rotate(-0.62);
    const bl = c.createLinearGradient(0, -34, 0, 34); bl.addColorStop(0, '#454e57'); bl.addColorStop(0.5, '#20262c'); bl.addColorStop(1, '#10151a');
    c.fillStyle = bl; c.fillRect(-60, -34, 620, 68);
    for (let x = -30; x < 540; x += 40) { c.fillStyle = '#525c66'; c.fillRect(x, -40, 12, 80); }
    c.fillStyle = '#10151a'; c.fillRect(520, -44, 48, 88);
    c.restore();
    c.restore();

    // window frame + mullions over the view
    const iron = I();
    c.save();
    c.lineWidth = 2; c.strokeStyle = 'rgba(150,180,210,0.12)';
    const midx = (win.x0 + win.x1) / 2;
    c.beginPath(); c.moveTo(midx, win.y0); c.lineTo((win.bx0 + win.bx1) / 2, win.by); c.stroke();
    const q1 = win.x0 + (win.x1 - win.x0) * 0.33, q2 = win.x0 + (win.x1 - win.x0) * 0.66;
    c.beginPath(); c.moveTo(q1, win.y0); c.lineTo(win.bx0 + (win.bx1 - win.bx0) * 0.33, win.by); c.moveTo(q2, win.y0); c.lineTo(win.bx0 + (win.bx1 - win.bx0) * 0.66, win.by); c.stroke();
    // glass glare
    const glare = c.createLinearGradient(win.x0, win.y0, win.x1, win.by); glare.addColorStop(0, 'rgba(180,220,255,0.06)'); glare.addColorStop(0.3, 'rgba(180,220,255,0)'); glare.addColorStop(0.6, 'rgba(180,220,255,0.03)'); glare.addColorStop(1, 'rgba(180,220,255,0)');
    c.fillStyle = glare; c.beginPath(); c.moveTo(win.x0, win.y0); c.lineTo(win.x1, win.y0); c.lineTo(win.bx1, win.by); c.lineTo(win.bx0, win.by); c.closePath(); c.fill();
    c.restore();
    // thick frame
    c.lineJoin = 'round';
    c.strokeStyle = '#2b3138'; c.lineWidth = 22;
    c.beginPath(); c.moveTo(win.x0, win.y0); c.lineTo(win.x1, win.y0); c.lineTo(win.bx1, win.by); c.lineTo(win.bx0, win.by); c.closePath(); c.stroke();
    c.strokeStyle = '#4a545e'; c.lineWidth = 3; c.stroke();
    for (const [bx, by] of [[win.x0, win.y0], [midx, win.y0], [win.x1, win.y0], [win.bx0, win.by], [win.bx1, win.by]]) iron.bolt(c, bx, by, 6, true);
  }
  function drawRubble(c, x, y, r) {
    const g = c.createRadialGradient(x, y, 0, x, y, r * 1.4); g.addColorStop(0, 'rgba(255,120,60,0.25)'); g.addColorStop(1, 'rgba(255,60,20,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 1.4, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 80; i++) { const a = i * 2.3998 + D.t * 0.05, rr = r * (0.25 + ((i * 53) % 100) / 70); c.fillStyle = i % 8 === 0 ? 'rgba(255,140,60,0.9)' : 'rgba(120,105,95,0.85)'; const s = 2 + ((i * 7) % 6); c.fillRect(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6, s, s); }
  }

  // ---- live foreground consoles (gauges, lamps, readouts) ----
  function drawConsoles(c, L) {
    const G = SF.game, iron = I();
    D.hotspots = [];
    const yTop = DH - 230;
    // LEFT bank: HULL / SHIELD / REACTOR — inset so the physical station rail never covers it.
    c.save(); c.translate(115, 0);
    iron.plate(c, 40, yTop, 440, 230, { tint: [46, 50, 55], bevel: 8, seed: 31 });
    iron.stencil(c, 'FORTRESS STATUS', 60, yTop + 34, 20, '#cdd5dc');
    const hull = G.fort.hull / SF.hullMax(G), sh = G.fort.shield / SF.shieldMax(G), pw = G.fort.power / SF.powerMax(G);
    iron.gauge(c, 120, yTop + 130, 58, hull, [[0, 0.25, '#a02a20'], [0.25, 0.5, '#c8a020'], [0.5, 1, '#2a7a4a']], { label: 'HULL' });
    iron.lamp(c, 120, yTop + 206, 8, hull < 0.3, '#ff3b30', '', '#aaa');
    iron.gauge(c, 250, yTop + 130, 58, sh, [[0, 1, '#2a6a9a']], { label: 'SHIELD' });
    iron.stencil(c, 'REACTOR', 330, yTop + 70, 15, '#9aa4ac');
    iron.segMeter(c, 330, yTop + 82, 120, 30, pw, 10, '#ffc23a');
    iron.readout(c, 330, yTop + 124, 120, 34, Math.round(G.fort.power) + '/' + SF.powerMax(G), '#ffd25a');
    iron.stencil(c, 'GROUND FORCES', 330, yTop + 184, 13, '#9aa4ac');
    iron.readout(c, 330, yTop + 192, 120, 30, SF.fmtK(G.troops), '#e8dca0');
    c.restore();

    // RIGHT bank: resource readouts + weapon readiness lamps
    const rx = DW - 480;
    iron.plate(c, rx, yTop, 440, 230, { tint: [46, 50, 55], bevel: 8, seed: 33 });
    iron.stencil(c, 'STOCKS', rx + 20, yTop + 34, 20, '#cdd5dc');
    const inc = SF.incomeOf(G);
    SF.RES.forEach((r, i) => {
      const yy = yTop + 54 + i * 42;
      const info = SF.RES_INFO[r];
      iron.stencil(c, info.short, rx + 24, yy + 22, 15, info.color);
      iron.readout(c, rx + 70, yy, 130, 30, String(Math.floor(G.res[r])), info.color);
      iron.stencil(c, '+' + (Math.round(inc[r] * 10) / 10) + '/cyc', rx + 210, yy + 21, 13, '#8a949c');
    });
    // weapon readiness lamp column
    iron.stencil(c, 'WEAPONS', rx + 300, yTop + 54, 14, '#9aa4ac');
    SF.WEAPON_ORDER.forEach((w, i) => {
      const yy = yTop + 78 + i * 40;
      const st = SF.weaponState(G, w);
      const col = st.locked ? '#555' : st.ok ? '#6dff9c' : '#ff8a2a';
      iron.lamp(c, rx + 320, yy, 9, st.ok, col);
      iron.stencil(c, SF.WEAPONS[w].name.split(' ')[0], rx + 342, yy + 5, 13, st.locked ? '#667' : '#bcc');
    });

    // ---- CENTER: holographic tactical table (the main CTA) ----
    drawHoloTable(c, L);
  }

  function drawHoloTable(c, L) {
    const G = SF.game, iron = I();
    const cx = DW / 2, baseY = DH - 70;
    // drum base
    iron.plate(c, cx - 190, baseY - 40, 380, 150, { tint: [40, 44, 48], bevel: 8, seed: 41 });
    c.fillStyle = '#14181c'; c.beginPath(); c.ellipse(cx, baseY, 180, 44, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2b3138'; c.lineWidth = 8; c.stroke();
    for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; iron.bolt(c, cx + Math.cos(a) * 172, baseY + Math.sin(a) * 40, 5); }
    iron.stencil(c, 'TACTICAL PLOT', cx, baseY + 70, 18, '#9fe8ff', 'center');

    // projection cone + holo of the current system
    const hov = D.hover && D.hover.id === 'table';
    const top = baseY - 150;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const cone = c.createLinearGradient(cx, baseY, cx, top);
    cone.addColorStop(0, 'rgba(95,212,255,0.16)'); cone.addColorStop(1, 'rgba(95,212,255,0)');
    c.fillStyle = cone; c.beginPath(); c.moveTo(cx - 20, baseY - 8); c.lineTo(cx + 20, baseY - 8); c.lineTo(cx + 170, top); c.lineTo(cx - 170, top); c.closePath(); c.fill();
    // mini system: orbit rings + planet dots rotating
    const sys = SF.curSys(G);
    c.translate(cx, top + 40);
    c.strokeStyle = 'rgba(95,212,255,0.3)'; c.lineWidth = 1;
    let maxO = 1; for (const p of sys.planets) if (!p.parent) maxO = Math.max(maxO, p.orbit);
    const scl = 150 / maxO;
    for (const p of sys.planets) { if (p.parent) continue; c.beginPath(); c.ellipse(0, 0, p.orbit * scl, p.orbit * scl * 0.34, 0, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#ffe9a0'; c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.fill();
    for (const p of sys.planets) {
      if (p.parent) continue;
      const a = p.angle + D.t * 0.1 * (300 / p.orbit);
      const x = Math.cos(a) * p.orbit * scl, y = Math.sin(a) * p.orbit * scl * 0.34;
      const col = p.owner === 'enemy' ? '#ff6a4d' : p.owner === 'player' ? '#6dff9c' : p.owner === 'destroyed' ? '#777' : '#e8dca0';
      c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 8;
      c.beginPath(); c.arc(x, y, Math.max(3, p.size * 0.12), 0, Math.PI * 2); c.fill();
      if (SF.ui.selected === p.id) { c.strokeStyle = '#ff8a2a'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, p.size * 0.12 + 5 + Math.sin(D.t * 4) * 2, 0, Math.PI * 2); c.stroke(); }
    }
    c.shadowBlur = 0;
    c.restore();
    // CTA ring
    c.strokeStyle = hov ? '#ffb066' : 'rgba(255,138,42,0.6)'; c.lineWidth = hov ? 3 : 2;
    c.beginPath(); c.ellipse(cx, baseY, 184 + (hov ? 6 : 0), 46 + (hov ? 3 : 0), 0, 0, Math.PI * 2); c.stroke();
    D.hotspots.push({ id: 'table', x: cx - 190, y: top, w: 380, h: baseY - top + 60, action: () => SF.stations.go('tactical') });
    // floating prompt
    if (!SF.game.over) { const a = 0.6 + 0.4 * Math.sin(D.t * 3); c.fillStyle = `rgba(255,170,80,${a})`; c.font = '700 18px Bahnschrift, sans-serif'; c.textAlign = 'center'; c.fillText('▸ APPROACH TACTICAL TABLE', cx, top - 14); }
  }

  D.frame = function (dt, W, H) {
    D.t += dt;
    const c = SF.render.ctx();
    if (!backdrop || bdKey !== W + 'x' + H) backdrop = buildBackdrop(W, H);
    c.setTransform(SF.render.dpr, 0, 0, SF.render.dpr, 0, 0);
    c.drawImage(backdrop, 0, 0, W, H);
    const L = layout(W, H);
    c.setTransform(SF.render.dpr * L.sc, 0, 0, SF.render.dpr * L.sc, SF.render.dpr * L.ox, SF.render.dpr * L.oy);
    const [shx, shy] = SF.fx.offset();
    c.translate(shx, shy);
    drawView(c, L);
    drawConsoles(c, L);
    // subtle flicker from the hanging lamps
    c.setTransform(SF.render.dpr, 0, 0, SF.render.dpr, 0, 0);
    if (SF.render.fortState && SF.render.fortState.alarm) { c.fillStyle = `rgba(255,30,10,${0.06 + 0.05 * Math.sin(D.t * 8)})`; c.fillRect(0, 0, W, H); }
    const vg = c.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
  };

  D.invalidate = function () { backdrop = null; };
})();
