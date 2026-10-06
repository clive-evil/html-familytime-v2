// PLANET KILLER: ceremonial 12-step manual firing sequence + planetary destruction.
(function () {
  const SF = globalThis.SF;
  const { clamp } = SF;
  const PK = (SF.pkMode = {});
  const DW = 1600, DH = 900;
  let cv, c, sc = 1, ox = 0, oy = 0, raf = 0, last = 0, S = null;

  const ST = [
    { id: 'doors', title: 'OPEN CHAMBER', hint: 'Pull the lever down to part the blast doors.' },
    { id: 'route', title: 'ROUTE REACTOR POWER', hint: 'Close all three breakers.' },
    { id: 'cores', title: 'REACTOR CORES', hint: 'Hold each core until it spins up.' },
    { id: 'contain', title: 'UNLOCK CONTAINMENT', hint: 'Release both containment clamps.' },
    { id: 'focus', title: 'ALIGN FOCUSING ARRAYS', hint: 'Drag each array onto its orange mark.' },
    { id: 'sync', title: 'SYNCHRONISE EMITTERS', hint: 'Click as each notch passes the top.' },
    { id: 'cool', title: 'ACTIVATE COOLING', hint: 'Spin the valve wheel two full turns.' },
    { id: 'caps', title: 'CHARGE MAIN CAPACITORS', hint: 'Hold until the bank is full.' },
    { id: 'lock', title: 'ACQUIRE PLANETARY LOCK', hint: 'Drag the reticle onto the world and hold it there.' },
    { id: 'cover', title: 'LIFT SAFETY COVER', hint: 'Lift the cover.' },
    { id: 'key', title: 'TURN FIRING KEY', hint: 'Turn the key a quarter turn.' },
    { id: 'lever', title: 'FIRE', hint: 'Pull the firing lever all the way down.' },
  ];
  const box = (k) => ({ x: 20 + (k % 6) * 262, y: 500 + Math.floor(k / 6) * 198, w: 250, h: 188 });

  PK.init = function (canvas) {
    cv = canvas; c = cv.getContext('2d');
    cv.addEventListener('pointerdown', (e) => S && down(e));
    addEventListener('pointermove', (e) => S && move(e));
    addEventListener('pointerup', () => S && up());
  };
  PK.open = function (pid) {
    const G = SF.game;
    const chk = SF.canPlanetKill(G, pid);
    if (!chk.ok) { SF.audio.deny(); SF.ui.toast(chk.reason, 'loss'); return; }
    const p = SF.planet(G, pid);
    S = {
      pid, p, t: 0, step: 0, phase: 'run',
      doors: 0, breakers: [0, 0, 0], cores: [0, 0, 0, 0], clamps: [0, 0], focus: [0.15, 0.85, 0.3], focusT: [0.62, 0.38, 0.71], sync: [0, 0, 0], syncSpeed: [1.3, -1.7, 2.1],
      valve: 0, caps: 0, capsHeld: false, reticle: [380, 180], lockT: 0, cover: 0, key: 0, lever: 0, drag: null, holdCore: -1, msg: null, msgT: 0,
      fireT: 0, frags: null, result: null, value: SF.valueOf(SF.planetYield(p, true)), pop: p.pop, enemy: SF.enemyGround(p),
    };
    SF.ui.mode = 'pk';
    cv.classList.remove('hidden');
    resize(); addEventListener('resize', resize); addEventListener('keydown', key);
    SF.audio.init(); SF.audio.clunk(true); SF.audio.duck(0.9, 60);
    SF.audio.loop('pkd', 'drone'); SF.audio.loopSet('pkd', 0.02, 0.1);
    last = performance.now(); raf = requestAnimationFrame(loop);
  };
  function close() {
    cancelAnimationFrame(raf); cv.classList.add('hidden');
    removeEventListener('resize', resize); removeEventListener('keydown', key);
    SF.audio.loopStop('pkd', 0.5); SF.audio.loopStop('pkc');
    const fired = S.phase !== 'run';
    S = null; SF.ui.mode = null;
    SF.fx.parts = []; SF.fx.effects = [];
    if (fired) { SF.ui.selected = null; SF.ui.selectedInst = null; SF.render.focusOn(SF.game, null); SF.fx.shake(10, 1); }
    SF.ui.afterAction();
  }
  function resize() {
    const d = Math.min(2, devicePixelRatio || 1);
    cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d;
    sc = Math.min(cv.clientWidth / DW, cv.clientHeight / DH);
    ox = (cv.clientWidth - DW * sc) / 2; oy = (cv.clientHeight - DH * sc) / 2;
  }
  const toD = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / sc, (e.clientY - r.top - oy) / sc]; };
  const inB = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  function say(m) { S.msg = m; S.msgT = 2.2; }
  function advance() {
    S.step++;
    SF.audio.confirm();
    SF.audio.loopSet('pkd', S.step / 12, 0.12 + S.step * 0.012);
    if (S.step === 7) SF.audio.alarm(3);
    if (S.step === 9) SF.audio.alarm(2);
  }
  const planetPos = () => [800 + Math.sin(S.t * 0.4) * 40, 235 + Math.cos(S.t * 0.31) * 18];

  // ------------------------------------------------------------ input
  function down(e) {
    const [x, y] = toD(e);
    if (S.phase === 'done') { close(); return; }
    if (S.phase !== 'run') return;
    if (x > 1440 && y < 50) { SF.audio.ui(); close(); return; }
    // reticle drag in viewport (step 9)
    if (S.step === 8 && y < 470) { S.drag = { k: 'reticle' }; S.reticle = [x, y]; return; }
    const k = S.step, b = box(k);
    if (!inB(b, x, y)) { if (y > 490) { SF.audio.deny(); say('Complete step ' + (k + 1) + ': ' + ST[k].title); } return; }
    const lx = x - b.x, ly = y - b.y;
    const id = ST[k].id;
    if (id === 'doors' || id === 'lever') S.drag = { k: id, y0: y, v0: id === 'doors' ? S.doors : S.lever };
    else if (id === 'route') { const i = clamp(Math.floor((lx - 20) / 72), 0, 2); if (!S.breakers[i]) { S.breakers[i] = 1; SF.audio.breaker(); SF.fx.shake(3, 0.15); if (S.breakers.every(Boolean)) advance(); } }
    else if (id === 'cores') { const i = clamp(Math.floor((lx - 10) / 58), 0, 3); if (S.cores[i] < 1) { S.holdCore = i; SF.audio.loop('pkc', 'hum'); } }
    else if (id === 'contain') { const i = lx < b.w / 2 ? 0 : 1; if (!S.clamps[i]) { S.clamps[i] = 0.001; SF.audio.clunk(true); SF.audio.hiss(0.6); } }
    else if (id === 'focus') { const i = clamp(Math.floor((lx - 25) / 70), 0, 2); S.drag = { k: 'focus', i, by: b.y }; setFocus(i, y, b.y); }
    else if (id === 'sync') {
      const i = S.sync.indexOf(0);
      const ang = ((S.t * S.syncSpeed[i]) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const err = Math.min(ang, Math.PI * 2 - ang);
      if (err < 0.32) { S.sync[i] = 1; SF.audio.clunk(); SF.audio.beep(500 + i * 200); if (S.sync.every(Boolean)) advance(); }
      else { SF.audio.deny(); say('Out of phase: wait for the notch to reach the top'); }
    }
    else if (id === 'cool') S.drag = { k: 'valve', a0: Math.atan2(y - (b.y + 105), x - (b.x + b.w / 2)) };
    else if (id === 'caps') { S.capsHeld = true; SF.audio.loop('pkc', 'whine'); }
    else if (id === 'cover') { S.cover = 1; SF.audio.switch(); advance(); }
    else if (id === 'key') S.drag = { k: 'key', a0: Math.atan2(y - (b.y + 100), x - (b.x + b.w / 2)) };
  }
  function setFocus(i, y, by) { S.focus[i] = clamp(1 - (y - by - 50) / 110, 0, 1); }
  function move(e) {
    const [x, y] = toD(e);
    if (!S.drag) return;
    const d = S.drag, b = box(S.step);
    if (d.k === 'doors' || d.k === 'lever') {
      const v = clamp(d.v0 + (y - d.y0) / 120, 0, 1);
      if (Math.floor(v * 6) !== Math.floor((d.k === 'doors' ? S.doors : S.lever) * 6)) SF.audio.ratchet();
      if (d.k === 'doors') { S.doors = v; if (v >= 1) { S.drag = null; SF.audio.clunk(true); SF.audio.lever(); S.doorAnim = 0.0001; advance(); } }
      else { S.lever = v; if (v >= 1) { S.drag = null; fire(); } }
    } else if (d.k === 'focus') {
      setFocus(d.i, y, d.by);
      if (S.focus.every((f, i) => Math.abs(f - S.focusT[i]) < 0.05)) { S.drag = null; advance(); }
    } else if (d.k === 'valve') {
      const a = Math.atan2(y - (b.y + 105), x - (b.x + b.w / 2));
      let da = a - d.a0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; d.a0 = a;
      if (da > 0) { S.valve = Math.min(1, S.valve + da / (Math.PI * 4)); if (Math.random() < 0.2) SF.audio.ratchet(); }
      if (S.valve >= 1) { S.drag = null; SF.audio.valve(); SF.audio.hiss(2); advance(); }
    } else if (d.k === 'key') {
      const a = Math.atan2(y - (b.y + 100), x - (b.x + b.w / 2));
      let da = a - d.a0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; d.a0 = a;
      S.key = clamp(S.key + da / (Math.PI / 2), 0, 1);
      if (S.key >= 1) { S.drag = null; SF.audio.clunk(true); advance(); }
    } else if (d.k === 'reticle') S.reticle = [clamp(x, 0, DW), clamp(y, 0, 470)];
  }
  function up() {
    S.drag && S.drag.k === 'reticle' ? (S.drag = null) : (S.drag = null);
    if (S.holdCore >= 0) { S.holdCore = -1; SF.audio.loopStop('pkc'); }
    if (S.capsHeld) { S.capsHeld = false; SF.audio.loopStop('pkc'); }
  }
  function key(e) { if (e.key === 'Escape') { if (S.phase === 'run' || S.phase === 'done') close(); } else if (S.phase === 'done' && e.key === 'Enter') close(); }

  function fire() {
    const G = SF.game;
    const r = SF.firePlanetKiller(G, S.pid);
    if (!r.ok) { SF.audio.deny(); say(r.reason); S.lever = 0; return; }
    S.phase = 'firing'; S.fireT = 0; S.result = r;
    SF.audio.stopAll(); SF.audio.duck(1, 12);
  }

  // ------------------------------------------------------------ update
  function update(dt) {
    S.t += dt;
    if (S.msgT > 0) S.msgT -= dt;
    if (S.doorAnim) S.doorAnim = Math.min(1, S.doorAnim + dt * 0.5);
    if (S.holdCore >= 0) {
      const i = S.holdCore;
      S.cores[i] = Math.min(1, S.cores[i] + dt * 1.3);
      SF.audio.loopSet('pkc', S.cores[i], 0.12);
      if (S.cores[i] >= 1) { S.holdCore = -1; SF.audio.loopStop('pkc'); SF.audio.breaker(); SF.fx.shake(4, 0.3); if (S.cores.every((v) => v >= 1)) advance(); }
    }
    S.clamps = S.clamps.map((v) => (v > 0 && v < 1 ? Math.min(1, v + dt * 1.6) : v));
    if (S.step === 3 && S.clamps.every((v) => v >= 1)) advance();
    if (S.capsHeld && S.step === 7) {
      S.caps = Math.min(1, S.caps + dt / 5);
      SF.audio.loopSet('pkc', S.caps, 0.16);
      SF.fx.shake(1 + S.caps * 7, 0.1);
      if (S.caps >= 1) { S.capsHeld = false; SF.audio.loopStop('pkc'); SF.audio.breaker(); advance(); }
    }
    if (S.step === 8) {
      const [px, py] = planetPos();
      if (Math.hypot(S.reticle[0] - px, S.reticle[1] - py) < 40 && S.drag) { S.lockT += dt; if (Math.floor(S.lockT * 6) !== Math.floor((S.lockT - dt) * 6)) SF.audio.beep(700 + S.lockT * 300); }
      else S.lockT = Math.max(0, S.lockT - dt * 0.8);
      if (S.lockT >= 2) { S.drag = null; advance(); }
    }
    if (S.phase === 'firing') {
      const t0 = S.fireT; S.fireT += dt; const t = S.fireT;
      if (t0 < 1.4 && t >= 1.4) { SF.audio.pkFire(); SF.fx.flash('#ffe0ff', 1); SF.fx.shake(30, 2.2); }
      if (t0 < 3.0 && t >= 3.0) { SF.audio.pkImpact(); SF.fx.flash('#ffffff', 1); }
      if (t0 < 4.6 && t >= 4.6) breakup();
      if (t >= 8) S.phase = 'done';
    }
    if (S.frags) for (const f of S.frags) { f.x += f.vx * dt; f.y += f.vy * dt; f.a += f.va * dt; f.vx *= 0.995; f.vy *= 0.995; }
    SF.fx.update(dt);
  }
  function breakup() {
    const [px, py] = planetPos();
    S.frags = [];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 160;
      S.frags.push({ x: px + Math.cos(a) * 30 * Math.random(), y: py + Math.sin(a) * 30 * Math.random(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, a: Math.random() * 6, va: (Math.random() - 0.5) * 3, s: 4 + Math.random() * 22, hot: Math.random() });
    }
    SF.fx.shake(24, 1.5);
  }

  // ------------------------------------------------------------ draw
  function draw() {
    const d = Math.min(2, devicePixelRatio || 1);
    c.setTransform(d, 0, 0, d, 0, 0);
    c.fillStyle = '#050304'; c.fillRect(0, 0, cv.clientWidth, cv.clientHeight);
    const [sx, sy] = SF.fx.offset();
    c.setTransform(d * sc, 0, 0, d * sc, d * (ox + sx), d * (oy + sy));
    drawView();
    drawStations();
    // header
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, DW, 50);
    txt('ANNIHILATION CHAMBER', 24, 34, 22, '#e9a6ff', 'left', '800 ');
    txt('TARGET: ' + S.p.name + (S.pop > 0.01 ? ' · POPULATION ' + (S.pop >= 1 ? S.pop.toFixed(1) + ' MILLION' : Math.round(S.pop * 1000) + ' THOUSAND') : ''), 400, 34, 17, '#ff8a7a');
    if (S.phase === 'run') { c.fillStyle = '#2a1414'; c.fillRect(1440, 8, 145, 36); txt('ABORT · ESC', 1512, 32, 14, '#ffb0a8', 'center'); }
    // dimming + alarm strobe (station lights dim as charge climbs)
    const dim = S.phase === 'run' ? 0.08 + S.step * 0.035 + S.caps * 0.25 : 0;
    if (dim > 0) { c.fillStyle = `rgba(0,0,0,${dim})`; c.fillRect(0, 0, DW, DH); }
    if (S.phase === 'run' && S.step >= 7) { c.fillStyle = `rgba(255,20,10,${0.06 + 0.06 * Math.sin(S.t * 7)})`; c.fillRect(0, 0, DW, DH); }
    if (S.msgT > 0) { c.fillStyle = 'rgba(40,8,4,0.92)'; c.fillRect(500, 440, 600, 40); txt(S.msg, 800, 467, 16, '#ffb0a0', 'center'); }
    if (S.phase === 'firing' && S.fireT < 1.4) { c.fillStyle = `rgba(0,0,0,${0.5 + S.fireT * 0.3})`; c.fillRect(0, 0, DW, DH); }
    SF.fx.draw(c, DW, DH);
    if (S.phase === 'done') drawSummary();
  }
  function txt(s, x, y, size, col, align, w) { c.fillStyle = col; c.font = (w || '600 ') + size + 'px Bahnschrift, "Roboto Condensed", "Arial Narrow", sans-serif'; c.textAlign = align || 'left'; c.fillText(s, x, y); }

  function drawView() {
    c.save(); c.beginPath(); c.rect(0, 50, DW, 430); c.clip();
    c.fillStyle = '#010103'; c.fillRect(0, 50, DW, 430);
    for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(220,220,255,${0.2 + ((i * 37) % 10) / 14})`; c.fillRect((i * 173) % DW, 50 + ((i * 97) % 430), 1.5, 1.5); }
    const [px, py] = planetPos();
    const t = S.fireT;
    const firing = S.phase !== 'run';
    if (!S.frags) {
      const swell = firing && t > 3 ? 1 + (t - 3)