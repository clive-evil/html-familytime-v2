// Procedural WebAudio. No samples: every sound is synthesised.
(function () {
  const SF = globalThis.SF;
  const A = (SF.audio = { ctx: null, master: null, muted: false, loops: {} });

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    const ctx = (A.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
    A.master = ctx.createGain();
    A.master.gain.value = A.muted ? 0 : 0.7;
    A.master.connect(comp); comp.connect(ctx.destination);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    A.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.ambient();
  };
  A.setMuted = function (m) {
    A.muted = m;
    if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 0.7, A.ctx.currentTime, 0.05);
  };
  const now = () => A.ctx.currentTime;
  function env(g, t, a, peak, d, end) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(end || 0.0001, 0.0001), t + a + d);
  }
  function osc(type, f, t, dur, peak, dest, opts) {
    opts = opts || {};
    const o = A.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.glide || dur));
    const g = A.ctx.createGain();
    env(g, t, opts.a || 0.005, peak, dur, 0.0001);
    o.connect(g); g.connect(dest || A.master);
    o.start(t); o.stop(t + (opts.a || 0.005) + dur + 0.05);
    return { o, g };
  }
  function noise(t, dur, peak, filt, f, q, opts) {
    opts = opts || {};
    const s = A.ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
    const fl = A.ctx.createBiquadFilter(); fl.type = filt || 'lowpass'; fl.frequency.setValueAtTime(f || 1000, t); fl.Q.value = q || 0.7;
    if (opts.to) fl.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = A.ctx.createGain();
    env(g, t, opts.a || 0.004, peak, dur, 0.0001);
    s.connect(fl); fl.connect(g); g.connect(A.master);
    s.start(t, Math.random()); s.stop(t + (opts.a || 0.004) + dur + 0.05);
    return { s, fl, g };
  }
  const ok = () => A.ctx && !A.muted;

  // ---------------------------------------------------------- UI + mechanical
  A.ui = function () { if (!ok()) return; const t = now(); osc('square', 1400, t, 0.04, 0.05, null, { to: 900 }); };
  A.hover = function () { if (!ok()) return; osc('sine', 2200, now(), 0.02, 0.015); };
  A.deny = function () { if (!ok()) return; const t = now(); osc('square', 180, t, 0.12, 0.08); osc('square', 140, t + 0.1, 0.16, 0.08); };
  A.click = function () { if (!ok()) return; const t = now(); noise(t, 0.03, 0.25, 'highpass', 3000); osc('square', 600, t, 0.02, 0.06); };
  A.switch = function () { if (!ok()) return; const t = now(); noise(t, 0.04, 0.4, 'bandpass', 2500, 2); osc('triangle', 220, t, 0.06, 0.2, null, { to: 90 }); };
  A.clunk = function (heavy) {
    if (!ok()) return; const t = now(); const k = heavy ? 1.6 : 1;
    noise(t, 0.12 * k, 0.6, 'lowpass', 900, 1.2, { to: 200 });
    osc('sine', 110 / k, t, 0.25 * k, 0.5, null, { to: 45 });
    noise(t + 0.03, 0.05, 0.25, 'bandpass', 3200, 6);
  };
  A.lever = function () { if (!ok()) return; const t = now(); noise(t, 0.25, 0.12, 'bandpass', 700, 3, { to: 1400 }); };
  A.ratchet = function () { if (!ok()) return; const t = now(); noise(t, 0.015, 0.25, 'highpass', 2600); };
  A.breaker = function () { if (!ok()) return; const t = now(); noise(t, 0.06, 0.8, 'lowpass', 1800); osc('square', 60, t, 0.3, 0.25, null, { to: 40 }); osc('sawtooth', 120, t + 0.02, 0.5, 0.05); };
  A.valve = function () { if (!ok()) return; const t = now(); noise(t, 0.9, 0.18, 'highpass', 4000, 0.5, { a: 0.05, to: 1500 }); };
  A.hiss = function (d) { if (!ok()) return; noise(now(), d || 1.2, 0.16, 'highpass', 3000, 0.5, { a: 0.08, to: 6000 }); };
  A.beep = function (f) { if (!ok()) return; osc('sine', f || 880, now(), 0.09, 0.08); };
  A.confirm = function () { if (!ok()) return; const t = now(); osc('sine', 660, t, 0.08, 0.08); osc('sine', 990, t + 0.08, 0.12, 0.08); };
  A.alarm = function (n) {
    if (!ok()) return; const t = now();
    for (let i = 0; i < (n || 3); i++) { osc('sawtooth', 520, t + i * 0.5, 0.22, 0.06); osc('sawtooth', 390, t + i * 0.5 + 0.25, 0.22, 0.06); }
  };

  // ---------------------------------------------------------- continuous tones (charge loops)
  A.loop = function (id, kind) {
    if (!ok() || A.loops[id]) return A.loops[id];
    const ctx = A.ctx; const t = now();
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(A.master);
    const nodes = [];
    const mk = (type, f, gain) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = gain; o.connect(og); og.connect(g); o.start(t); nodes.push(o); return o; };
    let main;
    if (kind === 'whine') { main = mk('sawtooth', 120, 0.25); mk('sine', 240, 0.4); }
    else if (kind === 'hum') { main = mk('sawtooth', 55, 0.5); mk('square', 110, 0.12); mk('sine', 165, 0.2); }
    else if (kind === 'drone') { main = mk('sawtooth', 32, 0.6); mk('sawtooth', 32.7, 0.6); mk('sine', 48, 0.6); mk('triangle', 64.3, 0.25); }
    else { main = mk('sine', 80, 0.5); }
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 600;
    g.disconnect(); g.connect(filt); filt.connect(A.master);
    const L = { g, nodes, main, filt, kind };
    A.loops[id] = L;
    return L;
  };
  // level 0..1 drives pitch/volume/brightness
  A.loopSet = function (id, level, vol) {
    const L = A.loops[id]; if (!L || !A.ctx) return;
    const t = now();
    const base = L.kind === 'whine' ? 120 : L.kind === 'hum' ? 55 : L.kind === 'drone' ? 30 : 80;
    const span = L.kind === 'whine' ? 9 : L.kind === 'hum' ? 1.6 : L.kind === 'drone' ? 2.2 : 2;
    L.nodes.forEach((o, i) => o.frequency.setTargetAtTime(base * (1 + level * span) * (i === 0 ? 1 : (L.kind === 'whine' ? 2 : L.kind === 'drone' ? [1, 1.02, 1.5, 2.01][i] : [1, 2, 3][i])), t, 0.08));
    L.filt.frequency.setTargetAtTime(300 + level * 5000, t, 0.1);
    L.g.gain.setTargetAtTime((vol == null ? 0.18 : vol) * (0.3 + level), t, 0.08);
  };
  A.loopStop = function (id, fade) {
    const L = A.loops[id]; if (!L) return;
    delete A.loops[id];
    if (!A.ctx) return;
    const t = now();
    L.g.gain.setTargetAtTime(0.0001, t, fade || 0.08);
    L.nodes.forEach((o) => o.stop(t + (fade || 0.08) * 6 + 0.1));
  };
  A.stopAll = function () { Object.keys(A.loops).forEach((k) => A.loopStop(k)); };

  // ---------------------------------------------------------- weapons
  A.railgun = function (power) {
    if (!ok()) return; const t = now(); const p = power || 1;
    noise(t, 0.05, 1.0 * p, 'highpass', 1800);              // metallic CRACK
    osc('square', 1800, t, 0.08, 0.25, null, { to: 300 });
    noise(t, 0.4, 0.7 * p, 'bandpass', 1200, 1.5, { to: 200 });
    osc('sine', 70, t, 1.6, 0.9 * p, null, { to: 28 });      // recoil rumble
    noise(t + 0.02, 1.8, 0.35, 'lowpass', 300, 0.7, { to: 60 });
  };
  A.laser = function (dur) {
    if (!ok()) return; const t = now(); dur = dur || 1.4;
    const o = A.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(140, t + dur);
    const o2 = A.ctx.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(181, t);
    const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(2600, t + 0.2);
    const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.12); g.gain.setValueAtTime(0.35, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(A.master); o.start(t); o2.start(t); o.stop(t + dur + 0.5); o2.stop(t + dur + 0.5);
    noise(t, dur, 0.25, 'bandpass', 900, 0.8, { a: 0.1 });
    A.hissAt(t + dur + 0.1);
  };
  A.hissAt = function (t) { if (!ok()) return; noise(t, 1.1, 0.14, 'highpass', 3500, 0.5, { a: 0.05 }); };
  A.missile = function (n) {
    if (!ok()) return; const t = now(); n = n || 3;
    noise(t, 0.08, 0.4, 'bandpass', 2000, 3); osc('square', 90, t, 0.1, 0.2);  // rack clamps
    for (let i = 0; i < n; i++) {
      const tt = t + 0.25 + i * 0.18;
      noise(tt, 1.2, 0.45, 'lowpass', 2400, 0.8, { a: 0.02, to: 300 });
      osc('sawtooth', 160, tt, 0.6, 0.06, null, { to: 60 });
    }
  };
  A.bombard = function () {
    if (!ok()) return; const t = now();
    for (let i = 0; i < 6; i++) { const tt = t + i * 0.11; noise(tt, 0.08, 0.5, 'bandpass', 1500, 2); osc('sine', 90, tt, 0.4, 0.4, null, { to: 40 }); }
  };
  A.explosion = function (size) {
    if (!ok()) return; const t = now(); const s = size || 1;
    noise(t, 0.6 * s + 0.4, 0.9, 'lowpass', 1600, 0.6, { to: 80 });
    osc('sine', 60, t, 1.2 * s, 0.9, null, { to: 22 });
    noise(t, 0.08, 0.5, 'highpass', 2000);
  };
  A.distant = function () { if (!ok()) return; const t = now(); noise(t, 0.9, 0.35, 'lowpass', 300, 0.6, { to: 60 }); osc('sine', 45, t, 0.9, 0.3, null, { to: 25 }); };
  A.impactFortress = function () { if (!ok()) return; const t = now(); noise(t, 0.5, 0.8, 'lowpass', 900, 1, { to: 100 }); osc('square', 70, t, 0.4, 0.3, null, { to: 30 }); noise(t + 0.05, 0.3, 0.2, 'bandpass', 3000, 4); };
  A.shieldHit = function () { if (!ok()) return; const t = now(); osc('sine', 420, t, 0.5, 0.15, null, { to: 160 }); noise(t, 0.3, 0.15, 'bandpass', 1800, 6); };
  A.capture = function () { if (!ok()) return; const t = now(); [392, 494, 587, 784].forEach((f, i) => osc('triangle', f, t + i * 0.12, 0.5, 0.09)); };
  A.servoSlide = function () { if (!ok()) return; const t = now(); noise(t, 0.5, 0.18, 'bandpass', 500, 2, { a: 0.03, to: 1600 }); osc('sawtooth', 70, t, 0.5, 0.08, null, { to: 140 }); osc('square', 180, t, 0.45, 0.03, null, { to: 90 }); };
  A.servo = function (d) { if (!ok()) return; const t = now(); d = d || 0.25; const g = A.ctx.createGain(); env(g, t, 0.02, 0.06, d, 0.0001); const o = A.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(260, t); o.frequency.linearRampToValueAtTime(240, t + d); const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3; o.connect(f); f.connect(g); g.connect(A.master); o.start(t); o.stop(t + d + 0.05); noise(t, d, 0.05, 'bandpass', 1400, 4); };
  A.door = function () { if (!ok()) return; const t = now(); noise(t, 1.2, 0.3, 'lowpass', 400, 0.8, { a: 0.05, to: 90 }); osc('sawtooth', 50, t, 1.3, 0.3, null, { to: 28 }); for (let i = 0; i < 3; i++) osc('square', 120, t + 0.3 + i * 0.35, 0.08, 0.08, null, { to: 60 }); setTimeout(() => A.clunk && A.clunk(true), 1200); };
  A.relay = function () { if (!ok()) return; const t = now(); noise(t, 0.03, 0.4, 'highpass', 2500); osc('square', 90, t, 0.04, 0.12); };
  A.vibrate = function (lvl) { if (!ok() || A.loops.pkvib) return; const g = A.ctx.createGain(); g.gain.value = 0.0001; g.connect(A.master); const o = A.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 22; o.connect(g); o.start(); A.loops.pkvib = { g, nodes: [o], kind: 'sub' }; };
  A.warp = function () { if (!ok()) return; const t = now(); osc('sawtooth', 40, t, 2.4, 0.3, null, { to: 900, glide: 2.2 }); noise(t, 2.6, 0.4, 'bandpass', 200, 1, { a: 1.2, to: 5000 }); };

  // ---------------------------------------------------------- planet killer
  A.pkFire = function () {
    if (!ok()) return; const t = now();
    noise(t, 0.2, 1.0, 'highpass', 800);
    osc('sawtooth', 35, t, 5.5, 0.9, null, { to: 18 });
    osc('sine', 28, t, 7, 1.0, null, { to: 16 });
    noise(t, 6, 0.8, 'lowpass', 2500, 0.7, { a: 0.03, to: 60 });
    osc('square', 880, t, 1.2, 0.12, null, { to: 110 });
  };
  A.pkImpact = function () {
    if (!ok()) return; const t = now();
    noise(t, 8, 0.9, 'lowpass', 900, 0.5, { a: 0.2, to: 30 });
    osc('sine', 40, t, 8, 1.0, null, { to: 14 });
    osc('sawtooth', 55, t, 5, 0.25, null, { to: 20 });
  };

  // ---------------------------------------------------------- ambience
  A.ambient = function () {
    if (!A.ctx || A.amb) return;
    const ctx = A.ctx;
    const g = ctx.createGain(); g.gain.value = 0.05; g.connect(A.master);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; f.connect(g);
    [41, 41.4, 61.7].forEach((fr) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); });
    const s = ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 400; nf.Q.value = 0.4;
    const ng = ctx.createGain(); ng.gain.value = 0.25; s.connect(nf); nf.connect(ng); ng.connect(g); s.start();
    A.amb = g;
  };
  A.duck = function (amount, dur) {
    if (!A.amb || !A.ctx) return; const t = now();
    A.amb.gain.setTargetAtTime(0.05 * (1 - amount), t, 0.1);
    A.amb.gain.setTargetAtTime(0.05, t + (dur || 1), 0.8);
  };
})();
