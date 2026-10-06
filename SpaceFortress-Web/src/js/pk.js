// PLANET KILLER manual firing sequence. A ceremonial multi-stage overlay on the main canvas.
(function () {
  const SF = globalThis.SF;
  const { clamp } = SF;
  const PK = (SF.pkMode = { active: false });
  let cv, c, sc = 1, ox = 0, oy = 0, raf = 0, last = 0, S = null;
  const DW = 1600, DH = 900;

  // Each stage: a labelled control the operator must act on, in order.
  const STAGES = [
    { id: 'chamber', label: 'OPEN ANNIHILATION CHAMBER', act: 'PULL', hint: 'Drag the chamber iris lever fully open.' },
    { id: 'route', label: 'ROUTE REACTOR POWER', act: 'HOLD', hint: 'Hold the power routing switch until the bus reads 100%.' },
    { id: 'cores', label: 'BRING REACTOR CORES ONLINE', act: 'TOGGLE', hint: 'Flip all four core breakers.' },
    { id: 'containment', label: 'UNLOCK CONTAINMENT', act: 'KEY', hint: 'Turn the two containment keys together.' },
    { id: 'align', label: 'ALIGN FOCUSING ARRAYS', act: 'DIAL', hint: 'Rotate the array dial until the three rings lock.' },
    { id: 'sync', label: 'SYNCHRONISE EMITTERS', act: 'BUTTONS', hint: 'Press each emitter as it pulses green.' },
    { id: 'cooling', label: 'ACTIVATE CRYO-COOLING', act: 'VALVE', hint: 'Open the cryogenic valve.' },
    { id: 'capacitors', label: 'CHARGE MAIN CAPACITORS', act: 'HOLD', hint: 'Hold to charge the primary bank to 100%.' },
    { id: 'lock', label: 'ACQUIRE PLANETARY LOCK', act: 'WAIT', hint: 'Hold the target reticle button until lock is confirmed.' },
    { id: 'cover', label: 'LIFT SAFETY COVER', act: 'LIFT', hint: 'Raise the armoured safety cover.' },
    { id: 'key', label: 'TURN FIRING KEY', act: 'KEY', hint: 'Turn the master firing key.' },
    { id: 'fire', label: 'ENGAGE', act: 'PRESS', hint: 'Press and HOLD the firing trigger to annihilate the world.' },
  ];

  PK.init = function (canvas) {
    cv = canvas || document.getElementById('console');
    // shares the manual console canvas element? No — uses its own overlay canvas created here.
  };

  PK.open = function (pid) {
    const chk = SF.canPlanetKill(SF.game, pid);
    if (!chk.ok) { SF.audio.deny(); SF.ui.toast(chk.reason, 'loss'); return; }
    S = {
      pid, t: 0, stage: 0, chamber: 0, route: 0, cores: [false, false, false, false], keys1: [0, 0], align: 0, alignLock: 0,
      emitters: [false, false, false, false, false, false], emitPulse: 0, valve: 0, caps: 0, holdCaps: false, holdRoute: false,
      lock: 0, holdLock: false, cover: 0, firekey: 0, fire: 0, holdFire: false, drag: null, phase: 'arm', fireT: 0, shownBoom: false,
    };
    PK.active = true;
    buildCanvas();
    document.getElementById('app').classList.add('pk-on');
    SF.render.fortState.alarm = true;
    SF.audio.init(); SF.audio.duck(0.9, 60);
    SF.audio.loop('pkdrone', 'drone'); SF.audio.loopSet('pkdrone', 0.05, 0.08);
    SF.audio.alarm(2);
    last = performance.now();
    raf = requestAnimationFrame(loop);
    addEventListener('resize', resize);
    addEventListener('keydown', key);
  };
  function buildCanvas() {
    cv = document.getElementById('console');
    c = cv.getContext('2d');
    cv.classList.remove('hidden');
    resize();
  }
  function close(fired) {
    cancelAnimationFrame(raf);
    cv.classList.add('hidden');
    removeEventListener('resize', resize);
    removeEventListener('keydown', key);
    SF.audio.loopStop('pkdrone', 1.5);
    SF.render.fortState.alarm = false;
    SF.render.fortState.pkCharge = 0;
    document.getElementById('app').classList.remove('pk-on');
    PK.active = false;
    const st = S; S = null;
    SF.stations.current = SF.stations.beforeStation || 'tactical';
    SF.stations.trans = null; SF.stations.applyDOM();
    if (fired) doFire(st.pid);
    else SF.ui.afterAction();
  }
  PK.forceClose = () => S && close(false);
  function resize() {
    const d = Math.min(2, devicePixelRatio || 1);
    cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d;
    sc = Math.min(cv.clientWidth / DW, cv.clientHeight / DH);
    ox = (cv.clientWidth - DW * sc) / 2; oy = (cv.clientHeight - DH * sc) / 2;
  }
  const toD = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / sc, (e.clientY - r.top - oy) / sc]; };

  function doFire(pid) {
    const G = SF.game;
    const p = SF.planet(G, pid);
    const name = p ? p.name : 'WORLD';
    // Capture the planet's on-screen radius before it becomes rubble, for the breakup effect.
    const anchor = () => SF.render.planetPos(G, pid);
    const radiusFn = () => { const ps = SF.render.planetScreen && SF.render.planetScreen[pid]; return ps ? ps.r : 70; };
    SF.firePlanetKiller(G, pid);
    SF.render.fortState.recoil = 1.8;
    const from = () => SF.render.fortPts.pk || [SF.render.W * 0.12, SF.render.H * 0.9];
    // Beat 1: a heartbeat of near-silence, then the discharge builds and leaves the station.
    SF.audio.pkFire();
    SF.fx.flash('#1a0426', 0.5); // lights slam down
    SF.fx.effects.push({ t: 0, dur: 2.0, launched: false, hit: false, draw(cc, e) {
      const [x0, y0] = from(), [x1, y1] = anchor();
      // charge knot at the muzzle for the first 0.45s
      if (e.t < 0.5) {
        const a = e.t / 0.5;
        cc.save(); cc.globalCompositeOperation = 'lighter';
        const g = cc.createRadialGradient(x0, y0, 0, x0, y0, R0ok(50 + a * 90));
        g.addColorStop(0, `rgba(255,220,255,${a})`); g.addColorStop(0.5, `rgba(220,90,255,${a * 0.7})`); g.addColorStop(1, 'rgba(120,20,180,0)');
        cc.fillStyle = g; cc.beginPath(); cc.arc(x0, y0, 50 + a * 90, 0, Math.PI * 2); cc.fill(); cc.restore();
        if (a > 0.9 && !e.launched) { e.launched = true; SF.fx.shake(14, 0.4); }
        return;
      }
      // Beat 2: the beam crosses space (travel delay before it reaches the world)
      const bt = (e.t - 0.5) / 0.6; // 0..1 over 0.6s travel
      const kk = Math.min(1, bt);
      const hx = x0 + (x1 - x0) * kk, hy = y0 + (y1 - y0) * kk;
      const w = 18 + 44 * Math.sin(Math.min(1, e.t) * Math.PI);
      cc.save(); cc.globalCompositeOperation = 'lighter';
      cc.strokeStyle = 'rgba(210,110,255,0.8)'; cc.lineWidth = w; cc.shadowColor = '#e070ff'; cc.shadowBlur = 50;
      cc.beginPath(); cc.moveTo(x0, y0); cc.lineTo(hx, hy); cc.stroke();
      cc.strokeStyle = 'rgba(255,255,255,0.95)'; cc.lineWidth = w * 0.4; cc.shadowBlur = 20; cc.beginPath(); cc.moveTo(x0, y0); cc.lineTo(hx, hy); cc.stroke();
      cc.restore();
      // Beat 3: impact — hand off to the world-destruction spectacle
      if (bt >= 1 && !e.hit) { e.hit = true; SF.audio.pkImpact(); SF.fx.planetKill(anchor, radiusFn); }
    } });
    function R0ok(v) { return isFinite(v) && v > 0 ? v : 1; }
    SF.ui.toast('<b>' + name + ' ANNIHILATED</b>', 'loss', 5000);
    setTimeout(() => SF.ui.afterAction(), 400);
  }

  function cur() { return STAGES[S.stage]; }
  function advance() { S.stage++; SF.audio.confirm(); SF.audio.loopSet('pkdrone', 0.05 + S.stage / STAGES.length, 0.08 + S.stage / STAGES.length * 0.15); SF.render.fortState.pkCharge = S.stage / STAGES.length; if (S.stage % 3 === 0) SF.audio.alarm(1); }

  // ---------------------------------------------------------------- layout
  const C = {
    chamber: { x: 140, y: 250, w: 60, h: 320 },
    route: { x: 300, y: 620, w: 200, h: 70 },
    cores: [[300, 300], [380, 300], [460, 300], [540, 300]],
    keys1: [[640, 640], [760, 640]],
    dial: { x: 800, y: 420, r: 110 },
    emitters: [[1020, 300], [1120, 280], [1220, 300], [1020, 420], [1120, 440], [1220, 420]],
    valve: { x: 1120, y: 620, r: 70 },
    caps: { x: 1340, y: 600, w: 200, h: 80 },
    lock: { x: 800, y: 720, r: 56 },
    cover: { x: 1300, y: 300, w: 220, h: 150 },
    firekey: { x: 1120, y: 760, r: 48 },
    fire: { x: 1340, y: 760, r: 70 },
    abort: { x: 1440, y: 20, w: 140, h: 40 },
  };
  const inR = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const inC = (r, x, y) => Math.hypot(x - r.x, y - r.y) <= r.r;

  function update(dt) {
    S.t += dt;
    if (S.phase === 'fired') { S.fireT += dt; if (S.fireT > 2.2) close(true); return; }
    const id = cur() ? cur().id : null;
    if (id === 'route' && S.holdRoute) { S.route = Math.min(1, S.route + dt * 0.6); SF.audio.loopSet('pkdrone', 0.1 + S.route * 0.3, 0.12); if (S.route >= 1) advance(); }
    if (id === 'align') { S.alignLock = clamp(1 - Math.abs(S.align - 0.5) * 4, 0, 1); if (S.alignLock > 0.95) { advance(); } }
    if (id === 'sync') { S.emitPulse = (S.emitPulse + dt * 1.5) % S.emitters.length; }
    if (id === 'capacitors' && S.holdCaps) { S.caps = Math.min(1, S.caps + dt * 0.4); SF.render.fortState.pkCharge = 0.6 + S.caps * 0.4; if (S.caps >= 1) advance(); }
    else if (id === 'capacitors' && !S.holdCaps) S.caps = Math.max(0, S.caps - dt * 0.15);
    if (id === 'lock' && S.holdLock) { S.lock = Math.min(1, S.lock + dt * 0.5); if (S.lock >= 1) advance(); }
    if (id === 'fire' && S.holdFire) { S.fire = Math.min(1, S.fire + dt * 0.7); if (S.fire >= 1) { S.phase = 'fired'; S.fireT = 0; } }
    SF.fx.update(dt);
  }

  function down(e) {
    if (!S || S.phase === 'fired') return;
    SF.audio.init();
    const [x, y] = toD(e);
    if (inR(C.abort, x, y)) { SF.audio.ui(); close(false); return; }
    const id = cur() ? cur().id : null;
    if (id === 'chamber' && inR(C.chamber, x, y)) { S.drag = 'chamber'; }
    else if (id === 'route' && inR(C.route, x, y)) { S.holdRoute = true; SF.audio.switch(); }
    else if (id === 'cores') { C.cores.forEach((p, k) => { if (Math.hypot(x - p[0], y - p[1]) < 34 && !S.cores[k]) { S.cores[k] = true; SF.audio.breaker(); if (S.cores.every(Boolean)) advance(); } }); }
    else if (id === 'containment') { C.keys1.forEach((p, k) => { if (Math.hypot(x - p[0], y - p[1]) < 44) S['keyHold' + k] = true; }); }
    else if (id === 'align' && inC(C.dial, x, y)) { S.drag = 'dial'; S.dialA0 = Math.atan2(y - C.dial.y, x - C.dial.x); S.dialV0 = S.align; }
    else if (id === 'sync') { C.emitters.forEach((p, k) => { if (Math.hypot(x - p[0], y - p[1]) < 36 && !S.emitters[k]) { if (Math.floor(S.emitPulse) === k) { S.emitters[k] = true; SF.audio.beep(500 + k * 120); if (S.emitters.every(Boolean)) advance(); } else { SF.audio.deny(); } } }); }
    else if (id === 'cooling' && inC(C.valve, x, y)) { S.drag = 'valve'; S.valveA0 = Math.atan2(y - C.valve.y, x - C.valve.x); S.valveV0 = S.valve; }
    else if (id === 'capacitors' && inR(C.caps, x, y)) { S.holdCaps = true; SF.audio.loop('pkcap', 'whine'); }
    else if (id === 'lock' && inC(C.lock, x, y)) { S.holdLock = true; SF.audio.beep(700); }
    else if (id === 'cover' && inR(C.cover, x, y)) { S.drag = 'cover'; S.coverY0 = y; }
    else if (id === 'key' && inC(C.firekey, x, y)) { S.drag = 'firekey'; S.keyA0 = Math.atan2(y - C.firekey.y, x - C.firekey.x); S.keyV0 = S.firekey; }
    else if (id === 'fire' && inC(C.fire, x, y)) { S.holdFire = true; SF.audio.loop('pkcap', 'drone'); }
  }
  function move(e) {
    if (!S || !S.drag) return;
    const [x, y] = toD(e);
    if (S.drag === 'chamber') { S.chamber = clamp((y - C.chamber.y) / C.chamber.h, 0, 1); if (Math.random() < 0.3) SF.audio.ratchet(); if (S.chamber >= 0.98) { S.chamber = 1; S.drag = null; SF.audio.clunk(true); advance(); } }
    else if (S.drag === 'dial') { let a = Math.atan2(y - C.dial.y, x - C.dial.x); let da = a - S.dialA0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; S.dialA0 = a; S.align = clamp(S.align + da / (Math.PI * 2), 0, 1); if (Math.random() < 0.2) SF.audio.ratchet(); }
    else if (S.drag === 'valve') { let a = Math.atan2(y - C.valve.y, x - C.valve.x); let da = a - S.valveA0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; S.valveA0 = a; S.valve = clamp(S.valve + da / (Math.PI * 2.5), 0, 1); if (S.valve >= 1) { S.drag = null; SF.audio.valve(); SF.audio.hiss(1.5); advance(); } }
    else if (S.drag === 'cover') { S.cover = clamp((S.coverY0 - y) / 90, 0, 1); if (S.cover >= 1) { S.drag = null; SF.audio.switch(); SF.audio.alarm(1); advance(); } }
    else if (S.drag === 'firekey') { let a = Math.atan2(y - C.firekey.y, x - C.firekey.x); let da = a - S.keyA0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; S.keyA0 = a; S.firekey = clamp(S.firekey + da / (Math.PI / 2), 0, 1); if (S.firekey >= 1) { S.drag = null; SF.audio.clunk(true); advance(); } }
  }
  function up() {
    if (!S) return;
    S.drag = null;
    if (S.holdRoute) { S.holdRoute = false; if (cur() && cur().id === 'route') S.route = Math.max(0, S.route); }
    if (S.holdCaps) { S.holdCaps = false; SF.audio.loopStop('pkcap', 0.1); }
    if (S.holdLock) { S.holdLock = false; if (S.lock < 1) S.lock = Math.max(0, S.lock - 0.1); }
    if (S.holdFire) { S.holdFire = false; SF.audio.loopStop('pkcap', 0.2); if (S.fire < 1) S.fire = 0; }
    // containment keys need both held
    if (cur() && cur().id === 'containment') { if (S.keyHold0 && S.keyHold1) { advance(); } S.keyHold0 = S.keyHold1 = false; }
  }
  function key(e) {
    if (!S) return;
    if (e.key === 'Escape' && S.phase !== 'fired') close(false);
  }

  // ---------------------------------------------------------------- draw
  function text(s, x, y, size, col, align, font) { c.fillStyle = col || '#e8d8f2'; c.font = (font || '600 ') + (size || 14) + 'px Bahnschrift, "Roboto Condensed", "Arial Narrow", sans-serif'; c.textAlign = align || 'left'; c.fillText(s, x, y); }
  function hl(r, round) { const a = 0.5 + 0.5 * Math.sin(S.t * 6); c.save(); c.strokeStyle = `rgba(255,75,216,${a})`; c.lineWidth = 3; c.shadowColor = '#ff4bd8'; c.shadowBlur = 20; if (round) { c.beginPath(); c.arc(r.x, r.y, r.r + 10, 0, Math.PI * 2); c.stroke(); } else c.strokeRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12); c.restore(); }

  const iron = () => SF.iron;
  // How "awake" the chamber is, 0..1, driven by how far through the sequence we are.
  function intensity() {
    let n = S.stage;
    if (cur() && (cur().id === 'capacitors')) n += S.caps; if (cur() && cur().id === 'route') n += S.route;
    return clamp(n / STAGES.length, 0, 1);
  }

  function draw() {
    const W = cv.clientWidth, H = cv.clientHeight;
    const d = Math.min(2, devicePixelRatio || 1);
    const I = intensity();
    c.setTransform(d, 0, 0, d, 0, 0);
    // Room dims as power routes into the weapon — lights go down, the core glow comes up.
    const amb = 1 - I * 0.65;
    c.fillStyle = `rgb(${(6 + 6 * amb) | 0},${(4 + 3 * amb) | 0},${(8 + 6 * amb) | 0})`; c.fillRect(0, 0, W, H);
    const [sx, sy] = SF.fx.offset();
    const vib = I > 0.4 ? (I - 0.4) * 6 : 0;
    c.setTransform(d * sc, 0, 0, d * sc, d * (ox + sx + (Math.random() - 0.5) * vib), d * (oy + sy + (Math.random() - 0.5) * vib));
    drawRoom(I, amb);
    // header plate
    iron().plate(c, 10, 8, DW - 20, 46, { tint: [40, 20, 36], bevel: 4, bolts: false, seed: 2 });
    iron().stencil(c, 'PLANET KILLER · ANNIHILATION SEQUENCE', 26, 40, 22, '#ff8ae0');
    const G = SF.game; const p = SF.planet(G, S.pid);
    text('TARGET: ' + (p ? p.name : '') + ' · ' + (p && p.pop > 0.01 ? (p.pop >= 1 ? p.pop.toFixed(1) + 'M souls' : Math.round(p.pop * 1000) + 'k souls') : 'uninhabited'), 560, 38, 16, '#e8a0c0');
    iron().plate(c, C.abort.x, C.abort.y, C.abort.w, C.abort.h, { tint: [90, 30, 26], bevel: 3, seed: 9 });
    iron().stencil(c, 'ABORT · ESC', C.abort.x + C.abort.w / 2, C.abort.y + 27, 15, '#ffd0c8', 'center');
    // red alarm wash once authorization keys are in play
    if (S.stage >= 9 && Math.sin(S.t * 7) > 0.3) { c.fillStyle = `rgba(255,20,10,${0.05 + I * 0.08})`; c.fillRect(-40, -40, DW + 80, DH + 80); }

    drawControls();
    drawProgress();
    if (S.phase === 'fired') { c.fillStyle = `rgba(255,255,255,${Math.min(1, S.fireT)})`; c.fillRect(-40, -40, DW + 80, DH + 80); }
    SF.fx.draw(c, DW, DH);
  }

  // The physical chamber: armoured walls, the mechanical focusing rings around the targeting
  // aperture (with the doomed planet behind it), power conduits that light up with intensity.
  function drawRoom(I, amb) {
    const II = iron();
    // armoured wall plates
    for (let x = -20; x < DW; x += 240) for (let y = 60; y < DH; y += 220) II.plate(c, x, y, 235, 215, { tint: [26, 18, 26], bevel: 5, boltR: 4, seed: x + y * 3 });
    // massive structural rings framing the chamber (the housing built for catastrophic energy)
    c.save(); c.translate(800, 340);
    for (let r = 0; r < 3; r++) { const rr = 300 + r * 70; c.strokeStyle = `rgba(${40 + r * 10},${30},${50 + r * 10},1)`; c.lineWidth = 34; c.beginPath(); c.arc(0, 0, rr, 0, Math.PI * 2); c.stroke(); c.strokeStyle = '#0a060a'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, rr + 17, 0, Math.PI * 2); c.stroke(); for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12 + r; II.bolt(c, Math.cos(a) * rr, Math.sin(a) * rr, 5, true); } }
    c.restore();
    // power conduits from reactor cores (left) into the focusing assembly (centre)
    const litCores = S.cores.filter(Boolean).length;
    for (let k = 0; k < 4; k++) {
      const y = 270 + k * 20; const on = S.cores[k];
      II.pipe(c, 300, 300 + (k - 1.5) * 34, 640, 320, 14, '#2a2030', on ? '#ff6ae0' : null, S.t + k);
    }
    II.pipe(c, 520, 700, 760, 560, 20, '#3d1a3a', I > 0.3 ? '#c050ff' : null, S.t);
    II.cables(c, [[1240, 360], [1320, 300], [1440, 260], [1560, 200]], ['#6a1030', '#8a2060', '#40105a', '#303030'], S.t);
    // the targeting aperture: reinforced viewport with the planet behind, iris contracting with I
    drawAperture(I);
    // overhead vent + ceiling beams
    c.strokeStyle = '#1a1420'; c.lineWidth = 10; c.beginPath(); c.moveTo(0, 58); c.lineTo(DW, 58); c.stroke();
    void amb;
  }

  function drawAperture(I) {
    const cx = 800, cy = 300, R = 150;
    const G = SF.game, p = SF.planet(G, S.pid);
    c.save();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#01030a'; c.fillRect(cx - R, cy - R, R * 2, R * 2);
    for (let i = 0; i < 90; i++) { const x = cx - R + ((i * 71) % (2 * R)), y = cy - R + ((i * 97) % (2 * R)); c.fillStyle = `rgba(200,210,255,${0.2 + ((i * 13) % 80) / 100})`; c.fillRect(x, y, 1.5, 1.5); }
    if (p && p.owner !== 'destroyed') {
      const pr = R * 0.78;
      const img = p.type === 'asteroid' ? SF.art.asteroidImage(p, pr * 2.2) : SF.art.planetImage(p, pr * 2, -0.5, -0.4);
      c.drawImage(img, cx - pr, cy - pr, pr * 2, pr * 2);
      // target reticle tightening as planetary lock acquires
      if (S.lock > 0 || S.stage >= 9) {
        const t = Math.max(S.lock, S.stage >= 9 ? 1 : 0);
        c.strokeStyle = `rgba(255,80,220,${0.5 + 0.5 * Math.sin(S.t * 4)})`; c.lineWidth = 2;
        c.beginPath(); c.arc(cx, cy, pr * (1.1 - 0.3 * t), 0, Math.PI * 2); c.stroke();
        for (let k = 0; k < 4; k++) { c.save(); c.translate(cx, cy); c.rotate(k * Math.PI / 2 + S.t * 0.3); c.beginPath(); c.moveTo(0, -pr * 1.1); c.lineTo(0, -pr * 0.8); c.stroke(); c.restore(); }
      }
    }
    // the charged beam building at the aperture as capacitors fill
    if (S.caps > 0.02 || S.stage > 7) {
      const ch = Math.max(S.caps, S.stage > 7 ? 1 : 0);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * ch);
      g.addColorStop(0, `rgba(255,180,255,${ch * 0.7})`); g.addColorStop(0.4, `rgba(200,80,255,${ch * 0.4})`); g.addColorStop(1, 'rgba(120,20,180,0)');
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * ch, 0, Math.PI * 2); c.fill(); c.restore();
    }
    c.restore();
    // reinforced bezel + iris blades contracting with intensity
    const II = iron();
    c.strokeStyle = '#2a1a2e'; c.lineWidth = 26; c.beginPath(); c.arc(cx, cy, R + 13, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#6a4a70'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R + 24, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; II.bolt(c, cx + Math.cos(a) * (R + 13), cy + Math.sin(a) * (R + 13), 6, true); }
    // iris blades
    const close = I * 0.5;
    c.fillStyle = '#17101c';
    for (let k = 0; k < 8; k++) { c.save(); c.translate(cx, cy); c.rotate(k * Math.PI / 4); c.beginPath(); c.moveTo(R, -R * 0.42); c.lineTo(R * (1 - close), 0); c.lineTo(R, R * 0.42); c.closePath(); c.fill(); c.restore(); }
    II.stencil(c, 'TARGETING APERTURE', cx, cy + R + 44, 15, '#c89ad8', 'center');
  }

  function drawProgress() {
    const done = S.stage, total = STAGES.length;
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(30, DH - 54, DW - 60, 40);
    for (let k = 0; k < total; k++) { c.fillStyle = k < done ? '#ff4bd8' : k === done ? '#ffa0e0' : '#3a2438'; c.fillRect(34 + k * ((DW - 68) / total), DH - 50, (DW - 68) / total - 4, 32); }
    const s = cur();
    if (s) { text('STAGE ' + (done + 1) + '/' + total + ' · ' + s.label, DW / 2, DH - 28, 17, '#fff', 'center', '700 '); text(s.hint, DW / 2, DH + 2 - 90 + 60, 0, 'rgba(0,0,0,0)'); }
    if (s) { c.fillStyle = 'rgba(40,10,40,0.85)'; const tw = c.measureText(s.hint).width; c.fillRect(DW / 2 - 400, 92, 800, 34); text('▸ ' + s.hint, DW / 2, 115, 16, '#ffd0f0', 'center'); void tw; }
  }

  function drawControls() {
    const id = cur() ? cur().id : 'fire';
    // chamber iris
    const ch = C.chamber;
    c.fillStyle = '#1a0e1a'; c.fillRect(ch.x - 10, ch.y - 10, ch.w + 20, ch.h + 20);
    c.fillStyle = '#0a060a'; c.fillRect(ch.x + 6, ch.y + 6, ch.w - 12, (ch.h - 12) * (1 - S.chamber));
    if (S.chamber > 0) { const g = c.createLinearGradient(ch.x, ch.y, ch.x, ch.y + ch.h); g.addColorStop(0, '#ff4bd8'); g.addColorStop(1, '#6a1060'); c.fillStyle = g; c.fillRect(ch.x + 6, ch.y + ch.h - 6 - (ch.h - 12) * S.chamber, ch.w - 12, (ch.h - 12) * S.chamber); }
    text('CHAMBER', ch.x + ch.w / 2, ch.y - 20, 13, '#e8a0c0', 'center');
    // chamber lever handle
    const hy = ch.y + S.chamber * ch.h;
    c.fillStyle = '#c0392b'; c.fillRect(ch.x - 24, hy - 12, ch.w + 48, 24);
    if (id === 'chamber') hl(ch);

    // reactor cores — breaker housings that glow when brought online
    C.cores.forEach((p, k) => {
      iron().plate(c, p[0] - 28, p[1] - 36, 56, 76, { tint: [34, 28, 36], bevel: 4, boltR: 3, seed: p[0] });
      const on = S.cores[k];
      if (on) { c.save(); c.shadowColor = '#6dff9c'; c.shadowBlur = 16; }
      const g = c.createLinearGradient(p[0], p[1] - 26, p[0], p[1] + 22); g.addColorStop(0, on ? '#9affc0' : '#3a2030'); g.addColorStop(1, on ? '#2a9a5a' : '#1a1016');
      c.fillStyle = g; c.fillRect(p[0] - 16, p[1] - 26, 32, 48);
      if (on) c.restore();
      c.fillStyle = on ? '#dfffe9' : '#6a5a60'; c.fillRect(p[0] - 10, on ? p[1] - 22 : p[1] + 6, 20, 6);
      iron().stencil(c, 'CORE ' + (k + 1), p[0], p[1] + 58, 12, on ? '#8fdcaa' : '#9a8aa0', 'center');
    });
    if (id === 'cores') C.cores.forEach((p) => hl({ x: p[0] - 28, y: p[1] - 36, w: 56, h: 76 }));

    // route switch
    const rt = C.route;
    c.fillStyle = '#0a0c0e'; c.fillRect(rt.x, rt.y, rt.w, rt.h);
    c.fillStyle = S.holdRoute ? '#5fc8ff' : '#22465a'; c.fillRect(rt.x + 4, rt.y + 4, (rt.w - 8) * S.route, rt.h - 8);
    text('ROUTE POWER ' + Math.round(S.route * 100) + '%', rt.x + rt.w / 2, rt.y + 44, 15, '#d8f0ff', 'center');
    if (id === 'route') hl(rt);

    // containment keys
    C.keys1.forEach((p, k) => { c.save(); c.translate(p[0], p[1]); c.fillStyle = '#0a0c0e'; c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.fill(); c.rotate(((S['keyHold' + k] ? 1 : 0)) * Math.PI / 2 - Math.PI / 4); c.fillStyle = '#c8a050'; c.fillRect(-6, -34, 12, 30); c.fillStyle = '#8a6a30'; c.beginPath(); c.arc(0, 8, 16, 0, Math.PI * 2); c.fill(); c.restore(); text('KEY ' + (k + 1), p[0], p[1] + 58, 12, '#c8b090', 'center'); });
    if (id === 'containment') { C.keys1.forEach((p) => hl({ x: p[0], y: p[1], r: 40 }, true)); text('TURN BOTH TOGETHER', (C.keys1[0][0] + C.keys1[1][0]) / 2, C.keys1[0][1] - 60, 13, '#ffd0f0', 'center'); }

    // focus dial + rings
    const dl = C.dial;
    c.save(); c.translate(dl.x, dl.y);
    for (let ring = 0; ring < 3; ring++) { const off = (S.align - 0.5) * (3 - ring) * 2; c.strokeStyle = S.alignLock > 0.9 ? '#6dff9c' : '#8a5aa0'; c.lineWidth = 3; c.beginPath(); c.arc(off * 20, 0, dl.r - ring * 24, 0, Math.PI * 2); c.stroke(); }
    const kg = c.createRadialGradient(-20, -20, 4, 0, 0, 40); kg.addColorStop(0, '#6a5a74'); kg.addColorStop(1, '#2a1e30'); c.fillStyle = kg; c.rotate(S.align * Math.PI * 3); c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ff4bd8'; c.fillRect(-3, -38, 6, 22);
    c.restore();
    text('FOCUS ARRAY ' + Math.round(S.alignLock * 100) + '%', dl.x, dl.y + dl.r + 26, 14, S.alignLock > 0.9 ? '#6dff9c' : '#c8b0d8', 'center');
    if (id === 'align') hl(dl, true);

    // emitters
    C.emitters.forEach((p, k) => { const pulse = Math.floor(S.emitPulse) === k && id === 'sync'; c.fillStyle = '#0a0c0e'; c.beginPath(); c.arc(p[0], p[1], 32, 0, Math.PI * 2); c.fill(); c.fillStyle = S.emitters[k] ? '#6dff9c' : pulse ? '#6dff9c' : '#4a2a50'; if (pulse) { c.shadowColor = '#6dff9c'; c.shadowBlur = 20; } c.beginPath(); c.arc(p[0], p[1], 22, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; });
    if (id === 'sync') text('PRESS EACH AS IT PULSES', (C.emitters[1][0] + C.emitters[4][0]) / 2, C.emitters[0][1] - 60, 13, '#ffd0f0', 'center');

    // valve
    const vl = C.valve;
    c.save(); c.translate(vl.x, vl.y); c.rotate(S.valve * Math.PI * 2);
    c.strokeStyle = S.valve >= 1 ? '#5fc8ff' : '#8a929a'; c.lineWidth = 10; c.beginPath(); c.arc(0, 0, vl.r - 8, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(k * Math.PI / 2) * (vl.r - 8), Math.sin(k * Math.PI / 2) * (vl.r - 8)); c.stroke(); }
    c.restore();
    text('CRYO VALVE', vl.x, vl.y + vl.r + 24, 13, S.valve >= 1 ? '#7fd0ff' : '#9aa8b4', 'center');
    if (id === 'cooling') hl(vl, true);

    // capacitor bank — segmented cells behind a frame
    const cp = C.caps;
    iron().plate(c, cp.x - 6, cp.y - 24, cp.w + 12, cp.h + 30, { tint: [34, 22, 36], bevel: 4, bolts: false, seed: 77 });
    iron().stencil(c, 'CAPACITOR BANK', cp.x + cp.w / 2, cp.y - 8, 13, '#c89ad8', 'center');
    iron().segMeter(c, cp.x, cp.y, cp.w, cp.h, S.caps, 12, S.caps >= 1 ? '#ff6ae0' : '#c050ff');
    if (S.holdCaps) for (let i = 0; i < 3; i++) { if (Math.random() < 0.4) { c.strokeStyle = 'rgba(255,180,255,0.7)'; c.lineWidth = 1.5; const yy = cp.y + 6 + Math.random() * (cp.h - 12); c.beginPath(); c.moveTo(cp.x + Math.random() * cp.w, yy); c.lineTo(cp.x + Math.random() * cp.w, yy + 10); c.stroke(); } }
    text(Math.round(S.caps * 100) + '%', cp.x + cp.w / 2, cp.y + cp.h / 2 + 6, 16, '#fff', 'center', '800 ');
    if (id === 'capacitors') hl(cp);

    // planetary lock
    const lk = C.lock;
    c.strokeStyle = S.lock >= 1 ? '#6dff9c' : '#ff4bd8'; c.lineWidth = 3;
    c.beginPath(); c.arc(lk.x, lk.y, lk.r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(lk.x, lk.y, lk.r * (1 - S.lock * 0.5), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * S.lock); c.lineWidth = 6; c.stroke();
    text('LOCK ' + Math.round(S.lock * 100) + '%', lk.x, lk.y + lk.r + 24, 13, S.lock >= 1 ? '#6dff9c' : '#e8a0c0', 'center');
    if (id === 'lock') hl(lk, true);

    // safety cover
    const cov = C.cover;
    c.save();
    if (S.cover > 0) { c.translate(cov.x + cov.w / 2, cov.y); c.scale(1, 1 - S.cover * 1.2); c.translate(-(cov.x + cov.w / 2), -cov.y); }
    c.fillStyle = 'rgba(255,180,40,0.5)'; c.fillRect(cov.x, cov.y, cov.w, cov.h);
    for (let k = 0; k < 8; k++) { c.fillStyle = 'rgba(20,20,20,0.6)'; c.fillRect(cov.x + k * (cov.w / 8), cov.y, cov.w / 16, cov.h); }
    c.restore();
    text('SAFETY COVER', cov.x + cov.w / 2, cov.y - 14, 13, '#ffcf7a', 'center');
    if (id === 'cover') hl(cov);

    // firing key
    const fk = C.firekey;
    c.save(); c.translate(fk.x, fk.y); c.fillStyle = '#0a0c0e'; c.beginPath(); c.arc(0, 0, fk.r, 0, Math.PI * 2); c.fill(); c.rotate(S.firekey * Math.PI / 2 - Math.PI / 4); c.fillStyle = '#ff4bd8'; c.fillRect(-5, -fk.r + 6, 10, 26); c.fillStyle = '#c8a050'; c.beginPath(); c.arc(0, 6, 18, 0, Math.PI * 2); c.fill(); c.restore();
    text('FIRING KEY', fk.x, fk.y + fk.r + 24, 13, S.firekey >= 1 ? '#6dff9c' : '#c8b090', 'center');
    if (id === 'key') hl(fk, true);

    // fire trigger
    const fr = C.fire;
    c.fillStyle = '#300'; c.beginPath(); c.arc(fr.x, fr.y, fr.r + 10, 0, Math.PI * 2); c.fill();
    const armed = id === 'fire';
    const bg = c.createRadialGradient(fr.x - 20, fr.y - 20, 5, fr.x, fr.y, fr.r);
    bg.addColorStop(0, armed ? '#ff5aa0' : '#5a1030'); bg.addColorStop(1, armed ? '#c00850' : '#300818');
    c.fillStyle = bg; c.beginPath(); c.arc(fr.x, fr.y, fr.r, 0, Math.PI * 2); c.fill();
    if (S.fire > 0) { c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.arc(fr.x, fr.y, fr.r - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * S.fire); c.stroke(); }
    text('ENGAGE', fr.x, fr.y + 6, 20, '#fff', 'center', '800 ');
    if (armed) hl(fr, true);
  }

  function loop(now) {
    if (!S) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { update(dt); if (!S) return; draw(); } catch (e) { console.error('console frame error:', e && e.message); }
    raf = requestAnimationFrame(loop);
  }

  // Test/dev hooks.
  PK._debugStage = (n) => { if (!S) return; S.stage = clamp(n | 0, 0, STAGES.length - 1); for (let k = 0; k < S.stage; k++) { if (STAGES[k].id === 'cores') S.cores = [true, true, true, true]; if (STAGES[k].id === 'sync') S.emitters = [true, true, true, true, true, true]; } S.chamber = S.stage > 0 ? 1 : 0; S.route = S.stage > 1 ? 1 : 0; S.caps = S.stage > 7 ? 1 : 0; S.lock = S.stage > 8 ? 1 : 0; S.cover = S.stage > 9 ? 1 : 0; S.firekey = S.stage > 10 ? 1 : 0; };
  PK._debugFire = (pid) => { close(false); doFire(pid); };
  PK.state = () => S && { stage: S.stage, phase: S.phase };

  PK.bind = function () {
    const el = document.getElementById('console');
    el.addEventListener('pointerdown', (e) => { if (PK.active) down(e); });
    addEventListener('pointermove', (e) => { if (PK.active) move(e); });
    addEventListener('pointerup', () => { if (PK.active) up(); });
  };
})();
