// MANUAL RAILGUN CONTROL: the tactile weapon console. Canvas UI in a 1600x900 design space.
(function () {
  const SF = globalThis.SF;
  const { clamp } = SF;
  const M = (SF.manual = { open: false });
  const DW = 1600, DH = 900;
  let cv, c, sc = 1, ox = 0, oy = 0, raf = 0, last = 0;
  let S = null; // console state

  const STEPS = [
    { id: 'ammo', label: 'SELECT AMMUNITION', why: 'Pick a shell from the rack. Kinetic for armour and ships, Fragmentation for soft targets and troops, Bunker Buster for hardened sites.' },
    { id: 'load', label: 'LOAD SHELL', why: 'Drag the LOADER lever all the way down. The rammer drives the shell into the breech.' },
    { id: 'lock', label: 'LOCK BREECH', why: 'Turn the BREECH WHEEL a quarter turn clockwise to seal the chamber. The gun will not charge with an open breech.' },
    { id: 'bearing', label: 'SET BEARING', why: 'Turn the BEARING dial until the needle meets the orange target mark. This moves the crosshair LEFT and RIGHT. Mouse wheel gives fine adjustment.' },
    { id: 'elev', label: 'SET ELEVATION', why: 'Slide the ELEVATION lever to the orange mark. This moves the crosshair UP and DOWN. The target drifts as the planet turns, so keep tracking it.' },
    { id: 'coolant', label: 'ACTIVATE COOLANT', why: 'Flip the COOLANT switch. Without it the rails overheat while charging and the bank trips.' },
    { id: 'charge', label: 'CHARGE CAPACITORS', why: 'HOLD the CHARGE button. Release inside the GREEN band (90-105%). Past 115% the bank arcs and dumps half its charge.' },
    { id: 'solution', label: 'FIRING SOLUTION', why: 'Keep the crosshair on the target. The fire computer needs a steady lock to finish its solution.' },
    { id: 'safety', label: 'RELEASE SAFETY', why: 'Lift the SAFETY COVER over the firing button.' },
    { id: 'fire', label: 'FIRE', why: 'The barrel sways on its dampers. Press FIRE when the STABILISER needle is centred for best accuracy.' },
  ];

  M.init = function (canvas) {
    cv = canvas; c = cv.getContext('2d');
    cv.addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    cv.addEventListener('wheel', wheel, { passive: false });
  };

  M.open = function (pid, iid, ammo) {
    const G = SF.game;
    const fleet = pid.startsWith('fleet:');
    const p = fleet ? null : SF.planet(G, pid);
    const i = fleet ? null : SF.inst(p, iid);
    const rnd = Math.random;
    const b0 = 120 + rnd() * 200, e0 = 18 + rnd() * 30;
    S = {
      pid, iid, fleet, p, i, ammo, t: 0,
      done: {}, b0, e0, bear: b0 + (rnd() < 0.5 ? -1 : 1) * (16 + rnd() * 10), elev: Math.max(2, e0 - 12 - rnd() * 8),
      load: 0, loadAnim: 0, lock: 0, coolant: false, temp: 24, charge: 0, charging: false, overT: 0, maxTempCharge: 24,
      solution: 0, safety: 0, phase: 'run', firedT: 0, res: null, quality: null, drag: null, msg: null, msgT: 0, coolFlow: 0, lastTick: 0, cutouts: 0, arcs: 0,
    };
    if (!SF.ammoUnlocked(G, 'railgun', ammo)) S.ammo = 'kinetic';
    M.open = M.open; M.isOpen = true;
    cv.classList.remove('hidden');
    resize();
    SF.audio.clunk(true); SF.audio.duck(0.8, 30);
    SF.audio.loop('mhum', 'hum'); SF.audio.loopSet('mhum', 0.1, 0.05);
    last = performance.now();
    raf = requestAnimationFrame(loop);
    addEventListener('resize', resize);
    addEventListener('keydown', key);
  };
  function close(withImpact) {
    cancelAnimationFrame(raf);
    cv.classList.add('hidden');
    removeEventListener('resize', resize);
    removeEventListener('keydown', key);
    SF.audio.loopStop('mrg'); SF.audio.loopStop('mhum'); SF.audio.loopStop('mcool');
    M.isOpen = false;
    const st = S; S = null;
    SF.ui.mode = null;
    // Return the operator to the station they came from (usually the tactical table).
    SF.stations.current = SF.stations.beforeStation || 'tactical';
    SF.stations.trans = null; SF.stations.applyDOM();
    if (withImpact && st.res) {
      SF.render.fortState.recoil = 1;
      SF.fx.rail(() => SF.render.fortPts.railgun, () => st.fleet ? (SF.render.fleetScreen[st.pid.slice(6)] ? [SF.render.fleetScreen[st.pid.slice(6)].x, SF.render.fleetScreen[st.pid.slice(6)].y] : [SF.render.W / 2, SF.render.H / 2]) : SF.render.instPos(SF.game, st.pid, st.iid), () => SF.ui.impact(st.res, { pid: st.pid, iid: st.iid }));
      SF.audio.railgun(0.6);
    } else SF.ui.afterAction();
  }
  M.forceClose = () => S && close(false);
  function resize() {
    const d = Math.min(2, devicePixelRatio || 1);
    cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d;
    sc = Math.min(cv.clientWidth / DW, cv.clientHeight / DH);
    ox = (cv.clientWidth - DW * sc) / 2; oy = (cv.clientHeight - DH * sc) / 2;
    c.setTransform(d * sc, 0, 0, d * sc, d * ox, d * oy);
  }
  const toD = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / sc, (e.clientY - r.top - oy) / sc]; };

  // ------------------------------------------------------------ targets & quality
  const tgtB = () => S.b0 + 1.3 * Math.sin(S.t * 0.33);
  const tgtE = () => S.e0 + 0.9 * Math.sin(S.t * 0.47 + 1);
  const errB = () => S.bear - tgtB();
  const errE = () => S.elev - tgtE();
  const align = () => clamp(1 - Math.hypot(errB() / 2.4, errE() / 2.4), 0, 1);
  const chargeQ = () => { const v = S.charge; if (v >= 90 && v <= 105) return 1; if (v < 90) return clamp((v - 40) / 50, 0, 1); return clamp(1 - (v - 105) / 15, 0, 1); };
  const coolQ = () => (!S.coolant ? 0.3 : S.maxTempCharge > 85 || S.cutouts ? 0.5 : 1);
  const stab = () => Math.sin(S.t * 2.3) * Math.cos(S.t * 0.9);
  const timingQ = () => 1 - Math.abs(stab());
  function stepIndex() { for (let k = 0; k < STEPS.length; k++) if (!S.done[STEPS[k].id]) return k; return STEPS.length; }

  function say(m) { S.msg = m; S.msgT = 2.4; }

  // ------------------------------------------------------------ update
  function update(dt) {
    S.t += dt;
    if (S.msgT > 0) S.msgT -= dt;
    if (S.phase === 'fired') { S.firedT += dt; return; }
    // loader animation
    if (S.load >= 1 && S.loadAnim < 1) { S.loadAnim = Math.min(1, S.loadAnim + dt * 2.2); if (S.loadAnim >= 1) { SF.audio.clunk(true); S.done.load = true; SF.fx.shake(3, 0.2); } }
    // coolant / temperature
    if (S.coolant) { S.coolFlow += dt; S.temp = Math.max(18, S.temp - 14 * dt); } else S.temp = Math.max(22, S.temp - 3 * dt);
    if (S.charging && S.done.lock) {
      S.charge = Math.min(125, S.charge + 30 * dt);
      S.temp += (S.coolant ? 5 : 26) * dt + (S.coolant ? 0 : 0);
      S.maxTempCharge = Math.max(S.maxTempCharge, S.temp);
      SF.audio.loopSet('mrg', S.charge / 100, 0.16);
      if (S.temp > 100) { S.temp = 78; S.charge = Math.max(0, S.charge - 45); S.cutouts++; S.charging = false; SF.audio.loopStop('mrg'); SF.audio.breaker(); say('THERMAL CUTOUT: rails overheated. Use the COOLANT.'); }
      if (S.charge > 115) { S.overT += dt; if (S.overT > 0.5) { S.charge = 55; S.overT = 0; S.arcs++; S.charging = false; SF.audio.loopStop('mrg'); SF.audio.breaker(); SF.fx.shake(6, 0.3); say('CAPACITOR ARC: bank dumped. Release in the GREEN band.'); } }
    } else {
      S.charge = Math.max(0, S.charge - 1.2 * dt);
      S.overT = 0;
    }
    if (!S.charging && S.charge >= 90 && S.charge <= 112) S.done.charge = true;
    if (S.charge < 80 && S.done.charge && !S.charging) S.done.charge = false;
    // alignment steps
    if (S.done.lock) {
      if (Math.abs(errB()) < 1.2) S.done.bearing = true;
      if (Math.abs(errE()) < 1.2) S.done.elev = true;
    }
    // firing solution
    const ready = S.done.load && S.done.lock && S.charge >= 60;
    if (ready && align() > 0.6) {
      const was = S.solution;
      S.solution = Math.min(1, S.solution + dt * 0.75);
      if (Math.floor(S.solution * 8) > Math.floor(was * 8)) SF.audio.beep(600 + S.solution * 600);
      if (S.solution >= 1 && !S.done.solution) { S.done.solution = true; SF.audio.confirm(); }
    } else if (!S.done.solution) S.solution = Math.max(0, S.solution - dt * 0.4);
    else if (align() < 0.35) { S.done.solution = false; S.solution = 0.5; say('SOLUTION LOST: target drifted. Re-align.'); SF.audio.deny(); }
    SF.fx.update(dt);
  }

  function fire() {
    if (S.phase !== 'run') return;
    if (!S.done.load || !S.done.lock) { SF.audio.deny(); say('BREECH NOT READY'); return; }
    if (!S.safety) { SF.audio.deny(); say('SAFETY COVER IS DOWN'); return; }
    const a = align(), cq = chargeQ(), k = coolQ(), s = timingQ();
    let q = 0.35 * a + 0.25 * cq + 0.15 * k + 0.25 * s;
    if (S.charge < 40) q *= 0.5;
    q = clamp(q, 0, 1);
    const G = SF.game;
    const t = { pid: S.pid, iid: S.iid };
    const res = SF.ui.resolveShot('railgun', S.ammo, t, { manual: q, guarantee: G.tutorial.active && !G.tutorial.done });
    if (!res.ok) { SF.audio.deny(); say(res.reason); return; }
    S.res = res; S.quality = { q, a, cq, k, s };
    S.phase = 'fired'; S.firedT = 0;
    S.done.fire = true;
    SF.audio.loopStop('mrg', 0.01);
    SF.audio.railgun(1.5);
    SF.fx.shake(26, 0.9); SF.fx.flash('#dff6ff', 0.8);
    setTimeout(() => { if (S && res.hit) SF.audio.explosion(res.killed.length ? 1.6 : 1); }, 380);
  }

  // ------------------------------------------------------------ input
  const CTRL = {
    shells: { x: 1100, y: 92, w: 270, h: 150 },
    loader: { x: 1505, y: 110, w: 60, h: 250 },
    wheel: { x: 1210, y: 335, r: 62 },
    dial: { x: 560, y: 755, r: 105 },
    elev: { x: 860, y: 620, w: 70, h: 250 },
    cool: { x: 1110, y: 470, w: 80, h: 110 },
    charge: { x: 1395, y: 655, w: 170, h: 70 },
    cover: { x: 1250, y: 735, w: 190, h: 140 },
    fireBtn: { x: 1345, y: 805, r: 52 },
    abort: { x: 1440, y: 14, w: 140, h: 40 },
    back: { x: 640, y: 560, w: 320, h: 60 },
  };
  const inR = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const inC = (r, x, y) => Math.hypot(x - r.x, y - r.y) <= r.r;
  function availableShells() { return Object.keys(SF.WEAPONS.railgun.ammo); }

  function down(e) {
    if (!S) return;
    SF.audio.init();
    const [x, y] = toD(e);
    if (S.phase === 'fired') { if (S.firedT > 1.6) close(true); return; }
    if (inR(CTRL.abort, x, y)) { SF.audio.ui(); close(false); return; }
    // shell rack
    if (inR(CTRL.shells, x, y)) {
      if (S.load > 0) { SF.audio.deny(); say('A shell is already loaded'); return; }
      const ids = availableShells();
      const k = Math.floor((x - CTRL.shells.x) / (CTRL.shells.w / ids.length));
      const id = ids[clamp(k, 0, ids.length - 1)];
      if (!SF.ammoUnlocked(SF.game, 'railgun', id)) { SF.audio.deny(); say('Locked: requires Heavy Penetrator'); return; }
      if (!SF.canAfford(SF.game, SF.WEAPONS.railgun.ammo[id].cost)) { SF.audio.deny(); say('Not enough resources for that shell'); return; }
      S.ammo = id; S.done.ammo = true; SF.audio.clunk(); SF.ui.ammo.railgun = id;
      return;
    }
    if (inR(CTRL.loader, x, y)) { if (!S.done.ammo) { SF.audio.deny(); say('Select a shell first'); return; } if (S.load < 1) S.drag = { k: 'loader', y0: y, v0: S.load }; return; }
    if (inC(CTRL.wheel, x, y)) { if (!S.done.load) { SF.audio.deny(); say('Load a shell first'); return; } if (!S.done.lock) S.drag = { k: 'wheel', a0: Math.atan2(y - CTRL.wheel.y, x - CTRL.wheel.x), v0: S.lock }; return; }
    if (inC(CTRL.dial, x, y)) { S.drag = { k: 'dial', a0: Math.atan2(y - CTRL.dial.y, x - CTRL.dial.x), v0: S.bear }; return; }
    if (inR(CTRL.elev, x, y)) { S.drag = { k: 'elev' }; setElev(y); return; }
    if (inR(CTRL.cool, x, y)) {
      S.coolant = !S.coolant; SF.audio.switch();
      if (S.coolant) { S.done.coolant = true; SF.audio.valve(); } else { S.done.coolant = false; }
      return;
    }
    if (inR(CTRL.charge, x, y)) {
      if (!S.done.lock) { SF.audio.deny(); say('Lock the breech before charging'); return; }
      S.charging = true; SF.audio.loop('mrg', 'whine'); SF.audio.loopSet('mrg', S.charge / 100, 0.16);
      return;
    }
    if (inC(CTRL.fireBtn, x, y) && S.safety) { fire(); return; }
    if (inR(CTRL.cover, x, y)) {
      if (!S.safety) {
        if (!S.done.solution) { SF.audio.deny(); say('No firing solution yet'); return; }
        S.safety = 1; S.done.safety = true; SF.audio.switch(); SF.audio.alarm(1);
      } else { S.safety = 0; S.done.safety = false; SF.audio.switch(); }
    }
  }
  function setElev(y) { S.elev = clamp(60 * (1 - (y - CTRL.elev.y - 10) / (CTRL.elev.h - 20)), 0, 60); }
  function move(e) {
    if (!S || !S.drag) return;
    const [x, y] = toD(e);
    const d = S.drag;
    if (d.k === 'loader') {
      const v = clamp(d.v0 + (y - d.y0) / 190, 0, 1);
      if (Math.floor(v * 6) !== Math.floor(S.load * 6)) SF.audio.ratchet();
      S.load = v;
      if (S.load >= 1) { S.drag = null; SF.audio.lever(); }
    } else if (d.k === 'wheel') {
      let a = Math.atan2(y - CTRL.wheel.y, x - CTRL.wheel.x);
      let da = a - d.a0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      d.a0 = a;
      const v = clamp(S.lock + da / (Math.PI / 2), 0, 1);
      if (Math.floor(v * 5) !== Math.floor(S.lock * 5)) SF.audio.ratchet();
      S.lock = v;
      if (S.lock >= 1) { S.drag = null; S.done.lock = true; SF.audio.clunk(true); SF.fx.shake(3, 0.2); }
    } else if (d.k === 'dial') {
      const a = Math.atan2(y - CTRL.dial.y, x - CTRL.dial.x);
      let da = a - d.a0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      d.a0 = a;
      const prev = S.bear;
      S.bear += (da * 180 / Math.PI) * (30 / 360);
      if (Math.floor(prev * 2) !== Math.floor(S.bear * 2)) SF.audio.ratchet();
    } else if (d.k === 'elev') {
      const prev = S.elev; setElev(y);
      if (Math.floor(prev) !== Math.floor(S.elev)) SF.audio.ratchet();
    }
  }
  function up() {
    if (!S) return;
    if (S.drag && S.drag.k === 'loader' && S.load < 1) S.load = 0;
    S.drag = null;
    if (S.charging) { S.charging = false; SF.audio.loopStop('mrg', 0.15); SF.audio.clunk(); if (S.charge >= 90 && S.charge <= 105) SF.audio.confirm(); }
  }
  function wheel(e) {
    if (!S) return; e.preventDefault();
    const [x, y] = toD(e);
    if (inC(CTRL.dial, x, y) || x < 760) { S.bear += (e.deltaY > 0 ? -0.1 : 0.1); SF.audio.ratchet(); }
    else if (inR(CTRL.elev, x, y) || x < 1000) { S.elev = clamp(S.elev + (e.deltaY > 0 ? -0.1 : 0.1), 0, 60); SF.audio.ratchet(); }
  }
  function key(e) {
    if (!S) return;
    if (e.key === 'Escape') { if (S.phase === 'fired') close(true); else close(false); }
    if (S.phase === 'fired' && (e.key === 'Enter' || e.key === ' ') && S.firedT > 1.6) close(true);
    if (e.key === ' ' && S.phase === 'run' && S.safety) { e.preventDefault(); fire(); }
  }

  // ------------------------------------------------------------ drawing helpers
  const iron = () => SF.iron;
  // Steel housing panel (replaces the old flat plate). Optional engraved title bar.
  function plate(x, y, w, h, title) {
    iron().plate(c, x, y, w, h, { tint: [50, 55, 60], bevel: 7, seed: (x * 3 + y + w) | 0 });
    if (title) {
      // clean engraved label strip (readable), with a short hazard tab on the right
      c.fillStyle = '#10151a'; c.fillRect(x + 7, y + 7, w - 14, 26);
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1; c.strokeRect(x + 7.5, y + 7.5, w - 15, 25);
      c.strokeStyle = 'rgba(255,255,255,0.05)'; c.beginPath(); c.moveTo(x + 8, y + 8); c.lineTo(x + w - 8, y + 8); c.stroke();
      iron().hazard(c, x + w - 40, y + 9, 30, 22, 1);
      iron().stencil(c, title, x + 16, y + 26, 16, '#9fb2bf');
    }
  }
  function text(s, x, y, size, col, align, font) { c.fillStyle = col || '#d8e8f2'; c.font = (font || '600 ') + (size || 14) + 'px Bahnschrift, "Roboto Condensed", "Arial Narrow", sans-serif'; c.textAlign = align || 'left'; c.fillText(s, x, y); }
  function mono(s, x, y, size, col, align) { c.fillStyle = col || '#9fe8ff'; c.font = (size || 14) + 'px Consolas, Menlo, monospace'; c.textAlign = align || 'left'; c.fillText(s, x, y); }
  function lamp(x, y, on, col, label) { iron().lamp(c, x, y, 9, on, col, label, on ? '#d8e8f2' : '#6a7884'); }
  function hl(r, round) {
    const a = 0.55 + 0.45 * Math.sin(S.t * 6);
    c.save(); c.strokeStyle = `rgba(255,138,42,${a})`; c.lineWidth = 4; c.shadowColor = '#ff8a2a'; c.shadowBlur = 20;
    if (round) { c.beginPath(); c.arc(r.x, r.y, r.r + 12, 0, Math.PI * 2); c.stroke(); } else c.strokeRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
    c.restore();
  }

  // ------------------------------------------------------------ machinery backdrop
  function drawBackdrop() {
    const I = iron();
    // wall gradient, lit warmer when the capacitors are charging
    const warm = clamp(S.charge / 125, 0, 1) * (S.charging ? 1 : 0.4);
    const bg = c.createLinearGradient(0, 0, 0, DH);
    bg.addColorStop(0, `rgb(${18 + warm * 22},${20 + warm * 8},${24})`); bg.addColorStop(1, '#070a0d');
    c.fillStyle = bg; c.fillRect(-40, -40, DW + 80, DH + 80);
    // riveted wall plates (back layer)
    for (let x = -20; x < DW; x += 220) for (let y = -20; y < DH; y += 200) I.plate(c, x, y, 215, 195, { tint: [24, 27, 31], bevel: 5, bolts: true, boltR: 4, seed: x + y });
    // huge structural I-beams framing the bay
    for (const bx of [8, DW - 44]) { const g = c.createLinearGradient(bx, 0, bx + 36, 0); g.addColorStop(0, '#2b3238'); g.addColorStop(0.5, '#3e474f'); g.addColorStop(1, '#171c20'); c.fillStyle = g; c.fillRect(bx, -40, 36, DH + 80); for (let y = 10; y < DH; y += 70) I.bolt(c, bx + 18, y, 6, true); }
    // the gun barrel receding behind the scope (upper-left structural opening)
    c.save(); c.translate(430, 150); c.rotate(-0.18);
    const bl = c.createLinearGradient(0, -70, 0, 70); bl.addColorStop(0, '#3c454e'); bl.addColorStop(0.5, '#1a2024'); bl.addColorStop(1, '#0c1014');
    c.fillStyle = bl; c.fillRect(-460, -70, 520, 140);
    for (let x = -430; x < 40; x += 46) { c.fillStyle = '#4a545e'; c.fillRect(x, -76, 14, 152); const gl = S.charging ? Math.max(0, Math.sin(S.t * 18 - x * 0.03)) * S.charge / 100 : 0; if (gl > 0.1) { c.fillStyle = `rgba(120,220,255,${gl * 0.7})`; c.fillRect(x, -76, 14, 152); } }
    c.restore();
    // breech housing cylinder behind the right column
    c.save(); c.translate(1320, 335);
    const hg = c.createRadialGradient(-40, -40, 20, 0, 0, 230); hg.addColorStop(0, '#454e57'); hg.addColorStop(1, '#141a1f');
    c.fillStyle = hg; c.fillRect(-60, -250, 320, 520);
    c.strokeStyle = '#0a0d10'; c.lineWidth = 3; c.strokeRect(-60, -250, 320, 520);
    for (let y = -230; y < 260; y += 56) { I.bolt(c, -42, y, 6, true); I.bolt(c, 242, y, 6, true); }
    c.restore();
    // thick coolant + power pipes threading the bay
    I.pipe(c, 60, 940, 1120, 720, 22, '#3d5a66', S.coolant ? '#5fc8ff' : null, S.coolFlow);
    I.pipe(c, 1120, 540, 1320, 480, 20, '#5a4030', null);
    I.cables(c, [[1480, 620], [1500, 500], [1560, 360], [1600, 200]], ['#6a1030', '#8a6020', '#20304a', '#303030'], S.t);
    I.cables(c, [[40, 500], [120, 620], [60, 780], [200, 880]], null, S.t);
    // overhead gantry
    c.strokeStyle = '#2a3238'; c.lineWidth = 8; c.beginPath(); c.moveTo(0, 30); c.lineTo(DW, 30); c.stroke();
    for (let x = 40; x < DW; x += 120) { c.beginPath(); c.moveTo(x, 30); c.lineTo(x + 30, 2); c.moveTo(x + 30, 30); c.lineTo(x, 2); c.stroke(); }
    // asymmetric warning placards bolted to the wall
    I.placard(c, 24, 540, 130, 70, ['DANGER', 'RAIL ENERGY'], { rot: -0.03, size: 17 });
    I.placard(c, 820, 70, 150, 40, ['NO PERSONNEL'], { rot: 0.02, size: 15 });
    I.plate_label(c, 1090, 900, 150, 34, 'MK-II SPINAL', { tint: [44, 40, 28] });
  }

  // ------------------------------------------------------------ draw
  function draw() {
    const W = cv.clientWidth, H = cv.clientHeight;
    const d = Math.min(2, devicePixelRatio || 1);
    c.setTransform(d, 0, 0, d, 0, 0);
    c.fillStyle = '#05080a'; c.fillRect(0, 0, W, H);
    const [sx, sy] = SF.fx.offset();
    const recoil = S.phase === 'fired' ? Math.max(0, 1 - S.firedT * 2) : 0;
    c.setTransform(d * sc, 0, 0, d * sc, d * (ox + sx), d * (oy + sy + recoil * 22));
    drawBackdrop();
    // title bar
    iron().plate(c, 10, 8, DW - 20, 48, { tint: [40, 44, 48], bevel: 4, bolts: false, seed: 1 });
    iron().hazard(c, 10, 50, DW - 20, 8, 1);
    const tname = S.fleet ? (SF.fleet(SF.game, S.pid.slice(6)) || { name: 'Fleet' }).name : S.i.name + ' · ' + S.p.name;
    iron().stencil(c, 'RAILGUN · MANUAL FIRE CONTROL', 24, 42, 24, '#ffb066');
    text('TARGET: ' + tname.toUpperCase(), 470, 40, 17, '#ff8a7a');
    // abort as a chunky red button plate
    iron().plate(c, CTRL.abort.x, CTRL.abort.y, CTRL.abort.w, CTRL.abort.h, { tint: [90, 30, 26], bevel: 3, seed: 9 });
    iron().stencil(c, 'ABORT · ESC', CTRL.abort.x + CTRL.abort.w / 2, CTRL.abort.y + 27, 15, '#ffd0c8', 'center');

    const cur = stepIndex();
    drawProcedure(cur);
    drawScope();
    drawDial(cur === 3);
    drawElev(cur === 4);
    drawShells(cur === 0);
    drawBreech(cur === 1, cur === 2);
    drawCoolant(cur === 5);
    drawCaps(cur === 6);
    drawFire(cur === 8, cur === 9);
    drawLamps();
    if (S.msgT > 0) { const a = clamp(S.msgT / 0.4, 0, 1); c.globalAlpha = a; iron().plate(c, 440, 66, 640, 40, { tint: [70, 20, 14], bevel: 3, bolts: false, seed: 2 }); text(S.msg, 760, 92, 17, '#ffd0c8', 'center'); c.globalAlpha = 1; }
    SF.fx.draw(c, DW, DH);
    if (S.phase === 'fired') drawResult();
  }

  function drawProcedure(cur) {
    plate(20, 70, 370, 810, 'FIRING PROCEDURE');
    STEPS.forEach((s, k) => {
      const y = 112 + k * 46;
      const done = !!S.done[s.id], active = k === cur;
      if (active) { c.fillStyle = 'rgba(255,138,42,0.16)'; c.fillRect(32, y - 4, 346, 40); c.fillStyle = '#ff8a2a'; c.fillRect(32, y - 4, 4, 40); }
      c.fillStyle = done ? '#6dff9c' : active ? '#ff8a2a' : '#3a444e';
      c.beginPath(); c.arc(56, y + 16, 11, 0, Math.PI * 2); c.fill();
      text(done ? '✔' : String(k + 1), 56, y + 21, 13, done || active ? '#0a0c0e' : '#9aa8b4', 'center', '700 ');
      text(s.label, 78, y + 22, 16, done ? '#8fdcaa' : active ? '#ffd2a8' : '#7f8e9a');
    });
    // explanation
    const s = STEPS[Math.min(cur, STEPS.length - 1)];
    c.fillStyle = 'rgba(95,212,255,0.08)'; c.fillRect(32, 582, 346, 286);
    text('WHAT THIS DOES', 46, 608, 13, '#5fd4ff');
    wrap(s.why, 46, 634, 320, 21, 16, '#d8e8f2');
    const pv = SF.attackPreview(SF.game, 'railgun', S.ammo, S.pid, S.iid, 0.9);
    if (pv) { mono('Shell: ' + SF.WEAPONS.railgun.ammo[S.ammo].name, 46, 806, 13, '#c4ccd4'); mono('Perfect shot: ~' + Math.round(pv.dmg) + ' dmg vs ' + Math.round(pv.hp) + ' hull', 46, 826, 13, pv.dmg >= pv.hp ? '#7dffb0' : '#ffd27a'); mono(pv.shielded ? 'Target is SHIELDED' : 'No shield interference', 46, 846, 13, pv.shielded ? '#9fb8ff' : '#7f98a8'); }
  }
  function wrap(s, x, y, w, lh, size, col) {
    c.font = '500 ' + size + 'px Bahnschrift, "Arial Narrow", sans-serif';
    const words = s.split(' '); let line = '';
    for (const wd of words) { const tst = line ? line + ' ' + wd : wd; if (c.measureText(tst).width > w) { text(line, x, y, size, col, 'left', '500 '); y += lh; line = wd; } else line = tst; }
    if (line) text(line, x, y, size, col, 'left', '500 ');
  }

  function drawScope() {
    const cx = 735, cy = 330, r = 245;
    plate(410, 70, 650, 520);
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#020604'; c.fillRect(cx - r, cy - r, r * 2, r * 2);
    const driftX = -(tgtB() - S.b0) * 0, driftY = 0;
    if (!S.fleet) {
      const img = SF.art.planetImage(S.p, 420, -0.6, -0.5);
      const zoom = 2.6;
      const D = 420 * zoom;
      const tx = (S.i.pos[0] * 0.92 + 1) * D / 2, ty = (S.i.pos[1] * 0.92 + 1) * D / 2;
      const offx = (tgtB() - S.b0) * 6, offy = (tgtE() - S.e0) * -6;
      c.globalAlpha = 0.9;
      c.drawImage(img, cx - tx + offx + driftX, cy - ty + offy + driftY, D, D);
      c.globalAlpha = 1;
      // other installations in view
      for (const o of S.p.insts) {
        const px = cx - tx + offx + (o.pos[0] * 0.92 + 1) * D / 2, py = cy - ty + offy + (o.pos[1] * 0.92 + 1) * D / 2;
        if (Math.hypot(px - cx, py - cy) > r) continue;
        const vhp = SF.ui.vhp(o);
        SF.art.drawGlyph(c, SF.INST[o.type].icon, px, py, o === S.i ? 16 : 10, vhp <= 0 ? '#555' : o === S.i ? '#ff6a4d' : '#c0a080');
      }
      S.scopeTarget = [cx + offx, cy + offy];
    } else {
      // starfield + ship silhouette
      for (let k = 0; k < 80; k++) { c.fillStyle = 'rgba(200,220,255,0.6)'; c.fillRect(cx - r + ((k * 97) % (2 * r)), cy - r + ((k * 61) % (2 * r)), 1.5, 1.5); }
      const offx = (tgtB() - S.b0) * 6, offy = (tgtE() - S.e0) * -6;
      c.save(); c.translate(cx + offx, cy + offy); c.fillStyle = '#7a2a22'; c.strokeStyle = '#ff8a7a';
      c.beginPath(); c.moveTo(70, 0); c.lineTo(-50, -26); c.lineTo(-30, 0); c.lineTo(-50, 26); c.closePath(); c.fill(); c.stroke(); c.restore();
      S.scopeTarget = [cx + offx, cy + offy];
    }
    // green phosphor tint + scanlines
    c.fillStyle = 'rgba(40,255,140,0.08)'; c.fillRect(cx - r, cy - r, r * 2, r * 2);
    c.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = cy - r; y < cy + r; y += 4) c.fillRect(cx - r, y, r * 2, 1.5);
    // target brackets
    const [tx, ty] = S.scopeTarget;
    c.strokeStyle = '#ff8a2a'; c.lineWidth = 2;
    for (let k = 0; k < 4; k++) { c.save(); c.translate(tx, ty); c.rotate(k * Math.PI / 2); c.beginPath(); c.moveTo(22, 12); c.lineTo(22, 22); c.lineTo(12, 22); c.stroke(); c.restore(); }
    // crosshair (driven by bearing/elevation error)
    const hx = cx + clamp(errB() * 16, -r, r) + (tx - cx), hy = cy + clamp(-errE() * 16, -r, r) + (ty - cy);
    const al = align();
    const ccol = al > 0.8 ? '#7dffb0' : al > 0.5 ? '#ffd27a' : '#ff6a4d';
    c.strokeStyle = ccol; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(hx - 60, hy); c.lineTo(hx - 12, hy); c.moveTo(hx + 12, hy); c.lineTo(hx + 60, hy); c.moveTo(hx, hy - 60); c.lineTo(hx, hy - 12); c.moveTo(hx, hy + 12); c.lineTo(hx, hy + 60); c.stroke();
    c.beginPath(); c.arc(hx, hy, 34, 0, Math.PI * 2); c.stroke();
    // solution ring
    if (S.solution > 0) { c.strokeStyle = '#7dffb0'; c.lineWidth = 4; c.beginPath(); c.arc(hx, hy, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * S.solution); c.stroke(); }
    // impact
    if (S.phase === 'fired') {
      const k = S.firedT;
      if (k < 0.3) { c.strokeStyle = `rgba(200,240,255,${1 - k / 0.3})`; c.lineWidth = 8; c.beginPath(); c.moveTo(cx, cy + r); c.lineTo(hx, hy); c.stroke(); }
      if (k > 0.25 && S.res && S.res.hit) {
        const e = Math.min(1, (k - 0.25) / 1.2);
        const g2 = c.createRadialGradient(hx, hy, 0, hx, hy, 40 + 220 * e);
        g2.addColorStop(0, `rgba(255,255,220,${1 - e})`); g2.addColorStop(0.4, `rgba(255,160,60,${(1 - e) * 0.8})`); g2.addColorStop(1, 'rgba(255,60,0,0)');
        c.fillStyle = g2; c.beginPath(); c.arc(hx, hy, 40 + 220 * e, 0, Math.PI * 2); c.fill();
        c.strokeStyle = `rgba(255,230,200,${1 - e})`; c.lineWidth = 3; c.beginPath(); c.arc(hx, hy, 300 * e, 0, Math.PI * 2); c.stroke();
      }
    }
    c.restore();
    // bezel
    c.strokeStyle = '#4a545e'; c.lineWidth = 14; c.beginPath(); c.arc(cx, cy, r + 7, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#7a8692'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r + 14, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 72; k++) { const a = k * Math.PI / 36; c.strokeStyle = k % 6 ? '#3a444e' : '#9aa8b4'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * (r + 16), cy + Math.sin(a) * (r + 16)); c.lineTo(cx + Math.cos(a) * (r + (k % 6 ? 22 : 28)), cy + Math.sin(a) * (r + (k % 6 ? 22 : 28))); c.stroke(); }
    mono('ALIGN ' + Math.round(al * 100) + '%', 430, 108, 15, ccol);
    mono('SOLUTION ' + Math.round(S.solution * 100) + '%', 430, 130, 15, S.done.solution ? '#7dffb0' : '#9fe8ff');
    mono('RANGE 41,200 KM', 900, 108, 15);
    mono('ΔBRG ' + (errB() >= 0 ? '+' : '') + errB().toFixed(1) + '°', 900, 130, 15, Math.abs(errB()) < 1.2 ? '#7dffb0' : '#ffd27a');
    mono('ΔELV ' + (errE() >= 0 ? '+' : '') + errE().toFixed(1) + '°', 900, 152, 15, Math.abs(errE()) < 1.2 ? '#7dffb0' : '#ffd27a');
  }

  function drawDial(active) {
    const d = CTRL.dial;
    plate(410, 600, 410, 280, 'BEARING');
    if (active) hl(d, true);
    // scale ring showing bearing around current value
    c.save(); c.translate(d.x, d.y);
    c.fillStyle = '#0c0f12'; c.beginPath(); c.arc(0, 0, d.r + 20, 0, Math.PI * 2); c.fill();
    for (let k = -20; k <= 20; k++) {
      const deg = Math.round(S.bear) + k;
      const a = -Math.PI / 2 + (deg - S.bear) * (Math.PI / 24);
      if (Math.abs(a + Math.PI / 2) > Math.PI * 0.85) continue;
      c.strokeStyle = deg % 5 ? '#4a545e' : '#c4ccd4'; c.lineWidth = deg % 5 ? 1.5 : 2.5;
      c.beginPath(); c.moveTo(Math.cos(a) * (d.r + 4), Math.sin(a) * (d.r + 4)); c.lineTo(Math.cos(a) * (d.r + (deg % 5 ? 12 : 18)), Math.sin(a) * (d.r + (deg % 5 ? 12 : 18))); c.stroke();
    }
    // target mark
    const ta = -Math.PI / 2 + (tgtB() - S.bear) * (Math.PI / 24);
    if (Math.abs(ta + Math.PI / 2) < Math.PI * 0.9) { c.fillStyle = '#ff8a2a'; c.save(); c.rotate(ta); c.beginPath(); c.moveTo(d.r + 22, 0); c.lineTo(d.r + 36, -8); c.lineTo(d.r + 36, 8); c.closePath(); c.fill(); c.restore(); }
    // traverse handwheel (spoked, rotates with bearing)
    const kr = d.r - 6;
    c.rotate((S.bear * 12) * Math.PI / 180);
    // outer rim
    const rg = c.createRadialGradient(-kr * 0.3, -kr * 0.3, kr * 0.4, 0, 0, kr);
    rg.addColorStop(0, '#5a646e'); rg.addColorStop(1, '#1a2024');
    c.strokeStyle = rg; c.lineWidth = 20; c.beginPath(); c.arc(0, 0, kr - 10, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, kr - 1, 0, Math.PI * 2); c.stroke();
    // grip knobs around the rim
    for (let k = 0; k < 8; k++) { c.save(); c.rotate(k * Math.PI / 4); SF.iron.bolt(c, kr - 10, 0, 7, false); c.restore(); }
    // spokes
    c.strokeStyle = '#3a434c'; c.lineWidth = 12; for (let k = 0; k < 4; k++) { c.save(); c.rotate(k * Math.PI / 2); c.beginPath(); c.moveTo(14, 0); c.lineTo(kr - 14, 0); c.stroke(); c.restore(); }
    // hub
    const hub = c.createRadialGradient(-6, -6, 3, 0, 0, 20); hub.addColorStop(0, '#6a747e'); hub.addColorStop(1, '#20262c');
    c.fillStyle = hub; c.beginPath(); c.arc(0, 0, 20, 0, Math.PI * 2); c.fill(); SF.iron.bolt(c, 0, 0, 6, true);
    // orange index spoke
    c.fillStyle = '#ff8a2a'; c.fillRect(-4, -kr + 6, 8, 30);
    c.restore();
    // needle at top
    c.fillStyle = '#e8f4ff'; c.beginPath(); c.moveTo(d.x, d.y - d.r - 2); c.lineTo(d.x - 7, d.y - d.r - 22); c.lineTo(d.x + 7, d.y - d.r - 22); c.closePath(); c.fill();
    mono(((S.bear % 360) + 360).toFixed(1).padStart(5, '0') + '°', d.x + 140, d.y - 10, 20, '#e8f4ff', 'left');
    mono('TGT ' + ((tgtB() % 360) + 360).toFixed(1) + '°', d.x + 140, d.y + 16, 15, '#ff8a2a', 'left');
    text('DRAG TO TURN', d.x + 140, d.y + 50, 12, '#7f8e9a');
  }

  function drawElev(active) {
    const e = CTRL.elev;
    plate(830, 600, 230, 280, 'ELEVATION');
    if (active) hl(e);
    c.fillStyle = '#0a0c0e'; c.fillRect(e.x + 28, e.y + 10, 14, e.h - 20);
    for (let k = 0; k <= 60; k += 5) { const y = e.y + 10 + (1 - k / 60) * (e.h - 20); c.fillStyle = k % 15 ? '#4a545e' : '#c4ccd4'; c.fillRect(e.x + 46, y - 1, k % 15 ? 8 : 14, 2); if (k % 15 === 0) mono(String(k), e.x + 64, y + 5, 12, '#9aa8b4'); }
    const ty = e.y + 10 + (1 - tgtE() / 60) * (e.h - 20);
    c.fillStyle = '#ff8a2a'; c.beginPath(); c.moveTo(e.x + 26, ty); c.lineTo(e.x + 12, ty - 7); c.lineTo(e.x + 12, ty + 7); c.closePath(); c.fill();
    const hy = e.y + 10 + (1 - S.elev / 60) * (e.h - 20);
    const hg = c.createLinearGradient(e.x, hy - 16, e.x, hy + 16);
    hg.addColorStop(0, '#9aa4ae'); hg.addColorStop(1, '#3a424a');
    c.fillStyle = hg; c.fillRect(e.x + 6, hy - 14, 58, 28);
    c.fillStyle = '#ff8a2a'; c.fillRect(e.x + 6, hy - 2, 58, 4);
    mono(S.elev.toFixed(1) + '°', e.x + 100, e.y + 40, 20, '#e8f4ff');
    mono('TGT ' + tgtE().toFixed(1) + '°', e.x + 100, e.y + 64, 14, '#ff8a2a');
  }

  function drawShells(active) {
    const r = CTRL.shells;
    plate(1075, 70, 505, 185, 'SHELL RACK');
    if (active) hl(r);
    const ids = availableShells();
    const w = r.w / ids.length;
    ids.forEach((id, k) => {
      const A = SF.WEAPONS.railgun.ammo[id];
      const un = SF.ammoUnlocked(SF.game, 'railgun', id);
      const x = r.x + k * w + w / 2, y = r.y + 30;
      const sel = S.ammo === id;
      if (S.load > 0 && sel) { c.fillStyle = '#0a0c0e'; c.fillRect(x - 14, y, 28, 90); }
      else {
        c.globalAlpha = un ? 1 : 0.3;
        const col = id === 'kinetic' ? '#b8c0c8' : id === 'frag' ? '#c8a050' : '#7a9a5a';
        const gr = c.createLinearGradient(x - 14, 0, x + 14, 0); gr.addColorStop(0, '#3a3f44'); gr.addColorStop(0.5, col); gr.addColorStop(1, '#2a2e32');
        c.fillStyle = gr; c.fillRect(x - 14, y + 18, 28, 72);
        c.beginPath(); c.moveTo(x - 14, y + 18); c.lineTo(x, y - 4); c.lineTo(x + 14, y + 18); c.fill();
        c.fillStyle = '#8a6a30'; c.fillRect(x - 15, y + 80, 30, 8);
        c.globalAlpha = 1;
      }
      if (sel && S.done.ammo) { c.strokeStyle = '#6dff9c'; c.lineWidth = 2; c.strokeRect(x - w / 2 + 6, y - 10, w - 12, 116); }
      text(A.name.split(' ')[0].toUpperCase(), x, y + 122, 12, un ? (sel ? '#ffd2a8' : '#b8c4ce') : '#5a646e', 'center');
    });
    text('Loaded: ' + (S.load > 0 ? SF.WEAPONS.railgun.ammo[S.ammo].name : '-'), 1390, 110, 13, '#9aa8b4');
    text('Cost ' + SF.costText(SF.WEAPONS.railgun.ammo[S.ammo].cost), 1390, 130, 13, '#9aa8b4');
  }

  function drawBreech(activeLoad, activeLock) {
    plate(1075, 262, 505, 195, 'BREECH');
    // chamber window
    c.fillStyle = '#060708'; c.fillRect(1290, 300, 190, 70);
    c.strokeStyle = '#4a545e'; c.strokeRect(1290, 300, 190, 70);
    if (S.load > 0) {
      const sx = 1300 + (S.load >= 1 ? 90 * S.loadAnim : S.load * 20);
      c.fillStyle = '#9aa4ae'; c.fillRect(sx, 322, 70, 26); c.beginPath(); c.moveTo(sx + 70, 322); c.lineTo(sx + 88, 335); c.lineTo(sx + 70, 348); c.fill();
      c.fillStyle = '#8a6a30'; c.fillRect(sx, 320, 8, 30);
    }
    text(S.done.lock ? 'SEALED' : S.done.load ? 'OPEN' : 'EMPTY', 1385, 392, 13, S.done.lock ? '#6dff9c' : '#ffb066', 'center');
    // wheel
    const w = CTRL.wheel;
    if (activeLock) hl(w, true);
    c.save(); c.translate(w.x, w.y); c.rotate(S.lock * Math.PI / 2);
    c.strokeStyle = S.done.lock ? '#6a8a6a' : '#8a929a'; c.lineWidth = 10; c.beginPath(); c.arc(0, 0, w.r - 8, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 8; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(k * Math.PI / 2) * (w.r - 8), Math.sin(k * Math.PI / 2) * (w.r - 8)); c.stroke(); }
    c.fillStyle = '#ff8a2a'; c.beginPath(); c.arc(w.r - 8, 0, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a424a'; c.beginPath(); c.arc(0, 0, 14, 0, Math.PI * 2); c.fill();
    c.restore();
    text('BREECH WHEEL ↻', w.x, w.y + w.r + 20, 12, '#9aa8b4', 'center');
    // loader lever
    const L = CTRL.loader;
    if (activeLoad) hl(L);
    c.fillStyle = '#0a0c0e'; c.fillRect(L.x + 24, L.y, 12, L.h);
    const hy = L.y + 20 + (S.load >= 1 ? 1 : S.load) * (L.h - 40);
    c.strokeStyle = '#5a646e'; c.lineWidth = 8; c.beginPath(); c.moveTo(L.x + 30, L.y + L.h / 2); c.lineTo(L.x + 30, hy); c.stroke();
    c.fillStyle = '#c0392b'; c.beginPath(); c.arc(L.x + 30, hy, 20, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e8584a'; c.beginPath(); c.arc(L.x + 24, hy - 6, 7, 0, Math.PI * 2); c.fill();
    text('LOADER', L.x + 30, L.y + L.h + 4, 12, '#9aa8b4', 'center');
    text('▼ PULL', L.x - 40, L.y + 40, 12, S.load < 1 ? '#ffb066' : '#4a545e', 'center');
  }

  function drawCoolant(active) {
    plate(1075, 465, 300, 260, 'COOLANT');
    const r = CTRL.cool;
    if (active) hl(r);
    // frost creeps over the panel when coolant runs
    if (S.coolant) { c.save(); c.globalAlpha = 0.5 * clamp(S.coolFlow, 0, 1); c.fillStyle = 'rgba(200,235,255,0.5)'; for (let i = 0; i < 40; i++) { const fx = 1075 + ((i * 53) % 300), fy = 465 + ((i * 97) % 260); c.fillRect(fx, fy, 2 + (i % 3), 2 + (i % 2)); } c.globalAlpha = 1; c.restore(); }
    // valve wheel (rotates as it opens)
    const vx = r.x + 40, vy = r.y + 55;
    c.save(); c.translate(vx, vy); c.rotate(S.coolant ? S.coolFlow * 6 : 0);
    c.strokeStyle = S.coolant ? '#4a90c0' : '#6a737b'; c.lineWidth = 9; c.beginPath(); c.arc(0, 0, 32, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 7; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(k * Math.PI / 2) * 30, Math.sin(k * Math.PI / 2) * 30); c.stroke(); }
    SF.iron.bolt(c, 0, 0, 8, true);
    c.restore();
    iron().stencil(c, S.coolant ? 'OPEN' : 'SHUT', vx, vy + 54, 14, S.coolant ? '#7fd0ff' : '#9aa8b4', 'center');
    // pipe + condensation drip
    c.strokeStyle = '#13303c'; c.lineWidth = 14; c.beginPath(); c.moveTo(1195, 650); c.lineTo(1360, 650); c.stroke();
    if (S.coolant) { c.strokeStyle = '#5fc8ff'; c.lineWidth = 5; c.setLineDash([12, 12]); c.lineDashOffset = -S.coolFlow * 70; c.beginPath(); c.moveTo(1195, 650); c.lineTo(1360, 650); c.stroke(); c.setLineDash([]); c.save(); c.shadowColor = '#5fc8ff'; c.shadowBlur = 10; c.strokeStyle = 'rgba(180,235,255,0.3)'; c.lineWidth = 10; c.stroke(); c.restore(); }
    // temperature gauge (iron)
    SF.iron.gauge(c, 1290, 585, 52, clamp(S.temp / 110, 0, 1), [[0, 0.6, '#2a7a4a'], [0.6, 0.85, '#c8a020'], [0.85, 1, '#a02a20']], { label: 'RAIL °C' });
    mono(Math.round(S.temp) + '°', 1290, 660, 15, S.temp > 85 ? '#ff6a4d' : '#9fe8ff', 'center');
  }

  function drawCaps(active) {
    plate(1385, 465, 195, 270, 'CAPACITORS');
    const over = S.charge > 105;
    const litCol = over ? '#ff5a3a' : S.charge >= 90 ? '#7dffb0' : '#5fc8ff';
    for (let k = 0; k < 4; k++) {
      const x = 1405 + k * 42, y = 500, h = 140, w = 30;
      // cylindrical cell housing
      c.fillStyle = '#0a0c0e'; c.fillRect(x - 2, y - 2, w + 4, h + 4);
      const cg = c.createLinearGradient(x, 0, x + w, 0); cg.addColorStop(0, '#10131a'); cg.addColorStop(0.5, '#1a2028'); cg.addColorStop(1, '#0a0c10');
      c.fillStyle = cg; c.fillRect(x, y, w, h);
      const f = clamp((S.charge - k * 25) / 25, 0, 1.25);
      if (f > 0.01) { c.fillStyle = litCol; if (S.charging) { c.shadowColor = litCol; c.shadowBlur = 16; } c.fillRect(x + 3, y + h - Math.min(1, f) * (h - 6) - 3, w - 6, Math.min(1, f) * (h - 6)); c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(x + 3, y + h - Math.min(1, f) * (h - 6) - 3, w - 6, 3); }
      // terminal cap
      c.fillStyle = '#5a646e'; c.fillRect(x + 4, y - 8, w - 8, 8);
      // arcs between cells while charging hard
      if (S.charging && S.charge > 70 && k < 3 && Math.random() < 0.3) { c.strokeStyle = 'rgba(180,235,255,0.8)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + w, y + 10 + Math.random() * 20); c.lineTo(x + 42, y + 10 + Math.random() * 20); c.stroke(); }
    }
    // band indicator
    const bx = 1405, bw = 168, by = 650;
    c.fillStyle = '#0a0c0e'; c.fillRect(bx, by - 6, bw, 10);
    c.fillStyle = '#2a7a4a'; c.fillRect(bx + bw * (90 / 125), by - 6, bw * (15 / 125), 10);
    c.fillStyle = '#7a2a20'; c.fillRect(bx + bw * (115 / 125), by - 6, bw * (10 / 125), 10);
    c.fillStyle = '#fff'; c.fillRect(bx + bw * Math.min(1, S.charge / 125) - 2, by - 10, 4, 18);
    mono(Math.round(S.charge) + '%', 1482, 672, 18, S.charge >= 90 && S.charge <= 105 ? '#7dffb0' : S.charge > 105 ? '#ff6a4d' : '#9fe8ff', 'center');
    const r = CTRL.charge;
    if (active) hl(r);
    const pr = S.charging;
    c.fillStyle = pr ? '#1a6a9a' : '#22465a'; c.fillRect(r.x, r.y + (pr ? 3 : 0), r.w, r.h - 3);
    c.strokeStyle = '#5fc8ff'; c.lineWidth = 2; c.strokeRect(r.x, r.y + (pr ? 3 : 0), r.w, r.h - 3);
    text('HOLD · CHARGE', r.x + r.w / 2, r.y + 42 + (pr ? 3 : 0), 17, '#d8f0ff', 'center', '700 ');
  }

  function drawFire(activeSafety, activeFire) {
    plate(1075, 735, 505, 145, 'FIRE');
    // stabiliser
    const sx = 1095, sy = 770, sw = 140;
    text('STABILISER', sx, sy + 2, 12, '#9aa8b4');
    c.fillStyle = '#0a0c0e'; c.fillRect(sx, sy + 12, sw, 40);
    c.fillStyle = '#2a7a4a'; c.fillRect(sx + sw / 2 - 10, sy + 12, 20, 40);
    const nx = sx + sw / 2 + stab() * (sw / 2 - 6);
    c.fillStyle = '#fff'; c.fillRect(nx - 2, sy + 10, 4, 44);
    mono('TIMING ' + Math.round(timingQ() * 100) + '%', sx, sy + 76, 13, timingQ() > 0.85 ? '#7dffb0' : '#9aa8b4');
    // button + cover
    const b = CTRL.fireBtn;
    if (activeFire) hl(b, true);
    c.fillStyle = '#300'; c.beginPath(); c.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2); c.fill();
    const bg = c.createRadialGradient(b.x - 15, b.y - 15, 4, b.x, b.y, b.r);
    bg.addColorStop(0, S.safety ? '#ff6a5a' : '#802018'); bg.addColorStop(1, S.safety ? '#a01008' : '#400a06');
    c.fillStyle = bg; c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
    text('FIRE', b.x, b.y + 8, 22, '#fff', 'center', '800 ');
    const cv2 = CTRL.cover;
    if (activeSafety) hl(cv2);
    c.save();
    if (S.safety) { c.translate(cv2.x + cv2.w / 2, cv2.y + 8); c.scale(1, -0.25); c.translate(-(cv2.x + cv2.w / 2), -(cv2.y + 8)); }
    c.fillStyle = 'rgba(255,200,40,0.55)'; c.fillRect(cv2.x + 20, cv2.y + 8, cv2.w - 40, cv2.h - 16);
    for (let k = 0; k < 6; k++) { c.fillStyle = 'rgba(20,20,20,0.6)'; c.fillRect(cv2.x + 20 + k * 26, cv2.y + 8, 12, cv2.h - 16); }
    c.restore();
    text(S.safety ? 'SAFETY OFF' : 'SAFETY COVER', 1500, 860, 13, S.safety ? '#ff6a4d' : '#9aa8b4', 'center');
    text('SPACE = FIRE', 1500, 800, 12, '#6a7884', 'center');
  }

  function drawLamps() {
    const L = [['LOADED', S.done.load, '#6dff9c'], ['LOCKED', S.done.lock, '#6dff9c'], ['ALIGNED', align() > 0.8, '#6dff9c'], ['COOLANT', S.coolant, '#5fc8ff'], ['CHARGED', S.charge >= 90 && S.charge <= 105, '#6dff9c'], ['SOLUTION', S.done.solution, '#6dff9c'], ['ARMED', !!S.safety, '#ff3b30']];
    L.forEach(([n, on, col], k) => lamp(470 + k * 82, 545, !!on, col, n));
  }

  function drawResult() {
    const k = S.firedT;
    if (k < 0.9) return;
    const Q = S.quality, res = S.res;
    const a = Math.min(1, (k - 0.9) * 3);
    c.globalAlpha = a;
    c.fillStyle = 'rgba(4,8,12,0.92)'; c.fillRect(470, 180, 660, 470);
    c.strokeStyle = '#ff8a2a'; c.lineWidth = 2; c.strokeRect(470, 180, 660, 470);
    const grade = Q.q >= 0.9 ? 'PERFECT SHOT' : Q.q >= 0.75 ? 'EXCELLENT' : Q.q >= 0.55 ? 'GOOD' : Q.q >= 0.35 ? 'ROUGH' : 'POOR';
    text(grade, 800, 238, 40, Q.q >= 0.75 ? '#7dffb0' : Q.q >= 0.55 ? '#ffd27a' : '#ff8a7a', 'center', '800 ');
    const rows = [['Alignment', Q.a], ['Charge', Q.cq], ['Cooling', Q.k], ['Timing', Q.s]];
    rows.forEach(([n, v], i) => {
      const y = 280 + i * 34;
      text(n.toUpperCase(), 520, y + 14, 15, '#9aa8b4');
      c.fillStyle = '#1a2026'; c.fillRect(660, y, 300, 16);
      c.fillStyle = v > 0.8 ? '#7dffb0' : v > 0.5 ? '#ffd27a' : '#ff6a4d'; c.fillRect(660, y, 300 * v, 16);
      mono(Math.round(v * 100) + '%', 980, y + 14, 15, '#d8e8f2');
    });
    let y = 440;
    if (res.hit) {
      text((res.crit ? 'CRITICAL HIT · ' : 'DIRECT HIT · ') + Math.round(res.dmg) + ' DAMAGE', 800, y, 22, '#ffd2a8', 'center');
      y += 34;
      if (res.killed.length) { text('TARGET DESTROYED', 800, y, 26, '#ff8a2a', 'center', '800 '); y += 34; }
      const col = res.collateral.reduce((s, x) => s + x.dmg, 0);
      text('Collateral: ' + (col < 1 ? 'none' : col < 20 ? 'minimal' : Math.round(col) + ' to nearby structures'), 800, y, 16, col < 20 ? '#7dffb0' : '#ffb38a', 'center');
    } else text('MISS: shell went wide', 800, y, 22, '#ff8a7a', 'center');
    text('Manual fire: ×' + (0.85 + 0.65 * Q.q).toFixed(2) + ' damage' + (Q.q >= 0.9 ? ' · critical ×1.25' : '') + ' · collateral −' + Math.round(Q.q * 80) + '%', 800, 580, 14, '#9aa8b4', 'center');
    if (k > 1.6) text('CLICK OR PRESS ENTER TO RETURN TO COMMAND', 800, 625, 15, '#ff8a2a', 'center');
    c.globalAlpha = 1;
  }

  function loop(now) {
    if (!S) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { update(dt); if (!S) return; draw(); } catch (e) { console.error('console frame error:', e && e.message); }
    raf = requestAnimationFrame(loop);
  }

  // Test hook: compute quality of a hypothetical perfect procedure.
  M.debugState = () => S && { step: stepIndex(), align: align(), charge: S.charge, solution: S.solution, phase: S.phase, done: Object.assign({}, S.done) };
  M.debugAutoAlign = () => { if (S) { S.bear = tgtB(); S.elev = tgtE(); } };
  M.debugPress = (name) => { if (!S) return; const r = CTRL[name]; const x = r.r ? r.x : r.x + r.w / 2, y = r.r ? r.y : r.y + r.h / 2; const [px, py] = [x * sc + ox, y * sc + oy]; const rc = cv.getBoundingClientRect(); return [px + rc.left, py + rc.top]; };
})();
