'use strict';
// ============================================================================
// AUDIO — procedural WebAudio. Restrained: silence is a tool.
// ============================================================================
const AUDIO = {
  ctx: null, on: false, muted: false, master: null,
  init() {
    if (this.ctx) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = this.ctx = new C();
      this.master = ctx.createGain(); this.master.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(ctx.destination);
      // noise buffers
      const len = ctx.sampleRate * 2;
      this.white = ctx.createBuffer(1, len, ctx.sampleRate); const w = this.white.getChannelData(0); for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
      this.brown = ctx.createBuffer(1, len, ctx.sampleRate); const b = this.brown.getChannelData(0); let l = 0; for (let i = 0; i < len; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = l * 3.5; }
      // drone
      this.droneG = ctx.createGain(); this.droneG.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 130;
      this.d1 = ctx.createOscillator(); this.d1.type = 'sawtooth'; this.d1.frequency.value = 41;
      this.d2 = ctx.createOscillator(); this.d2.type = 'sawtooth'; this.d2.frequency.value = 41.7;
      this.d3 = ctx.createOscillator(); this.d3.type = 'sine'; this.d3.frequency.value = 27.5;
      this.d1.connect(lp); this.d2.connect(lp); this.d3.connect(lp); lp.connect(this.droneG); this.droneG.connect(this.master);
      this.d1.start(); this.d2.start(); this.d3.start();
      // ventilation bed
      this.ventG = ctx.createGain(); this.ventG.gain.value = 0;
      const vs = this.loopNoise(this.brown); const vb = ctx.createBiquadFilter(); vb.type = 'bandpass'; vb.frequency.value = 380; vb.Q.value = 0.6;
      vs.connect(vb); vb.connect(this.ventG); this.ventG.connect(this.master);
      // electrical hum
      this.humG = ctx.createGain(); this.humG.gain.value = 0;
      const h1 = ctx.createOscillator(); h1.frequency.value = 100; const h2 = ctx.createOscillator(); h2.frequency.value = 200; h2.type = 'triangle';
      h1.connect(this.humG); h2.connect(this.humG); this.humG.connect(this.master); h1.start(); h2.start();
      // fire crackle bed
      this.fireG = ctx.createGain(); this.fireG.gain.value = 0;
      const fs = this.loopNoise(this.white); const fb = ctx.createBiquadFilter(); fb.type = 'highpass'; fb.frequency.value = 1800;
      this.fireAM = ctx.createGain(); fs.connect(fb); fb.connect(this.fireAM); this.fireAM.connect(this.fireG); this.fireG.connect(this.master);
      // wind (decompression) bed
      this.windG = ctx.createGain(); this.windG.gain.value = 0;
      const ws = this.loopNoise(this.white); this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 900; this.windF.Q.value = 1.5;
      ws.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
      this.on = true; this.nextGroan = 20; this.nextKnock = 8; this.alarmT = 0; this.beepT = 0;
    } catch (e) { console.warn('audio init failed', e); }
  },
  loopNoise(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; },
  now() { return this.ctx.currentTime; },
  ok() { return this.on && !this.muted && this.ctx && this.ctx.state === 'running'; },
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.now(), 0.05); return this.muted; },
  pan(x) { if (!this.ctx || !this.ctx.createStereoPanner) return null; const p = this.ctx.createStereoPanner(); p.pan.value = clamp(((x - R.cam.x) * R.cam.z) / (R.W / 2), -1, 1) * 0.8; return p; },
  dist(x, y) { // attenuation from camera framing
    const [sx, sy] = w2s(x, y); const off = Math.max(0, Math.abs(sx - R.W / 2) - R.W / 2, Math.abs(sy - R.H / 2) - R.H / 2);
    return clamp(1 - off / 900, 0.15, 1) * clamp(0.55 + R.cam.z * 0.45, 0.6, 1.4);
  },
  out(node, x, y) { const p = x !== undefined ? this.pan(x) : null; const g = this.ctx.createGain(); g.gain.value = x !== undefined ? this.dist(x, y ?? 200) : 1; node.connect(g); if (p) { g.connect(p); p.connect(this.master); } else g.connect(this.master); return g; },
  tone(freq, dur, { type = 'sine', vol = 0.1, x, y, f2, attack = 0.005, filter } = {}) {
    if (!this.ok()) return; const c = this.ctx, t = this.now();
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o; if (filter) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); n = f; }
    n.connect(g); this.out(g, x, y); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, { vol = 0.1, type = 'bandpass', freq = 1000, q = 1, f2, x, y, buf = 'white', attack = 0.005 } = {}) {
    if (!this.ok()) return; const c = this.ctx, t = this.now();
    const s = c.createBufferSource(); s.buffer = this[buf]; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); this.out(g, x, y); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  // ---- sound vocabulary --------------------------------------------------
  blip(f = 660, d = 0.08) { this.tone(f, d, { type: 'square', vol: 0.025, filter: 2200 }); },
  ack() { this.tone(880, 0.05, { type: 'square', vol: 0.018, filter: 2500 }); setTimeout(() => this.tone(1320, 0.05, { type: 'square', vol: 0.014, filter: 2500 }), 55); },
  ui() { this.tone(520, 0.03, { type: 'square', vol: 0.012, filter: 1800 }); },
  relay(on) { this.noise(0.04, { vol: 0.12, freq: 2500, q: 2 }); this.tone(on ? 90 : 70, 0.25, { type: 'sawtooth', vol: 0.04, filter: 300, f2: on ? 120 : 40 }); },
  doorSlam(d, heavy) { const x = d.x, y = d.y; this.noise(0.25, { vol: heavy ? 0.35 : 0.2, type: 'lowpass', freq: 500, f2: 120, x, y }); this.tone(heavy ? 55 : 70, 0.35, { vol: heavy ? 0.3 : 0.15, f2: 35, x, y }); if (heavy) setTimeout(() => this.noise(0.12, { vol: 0.12, freq: 3000, q: 4, x, y }), 120); },
  doorClose(d) { this.noise(0.12, { vol: 0.06, type: 'lowpass', freq: 400, x: d.x, y: d.y }); },
  doorServo(d) { this.tone(180, 0.45, { type: 'sawtooth', vol: 0.02, filter: 700, f2: 260, x: d.x, y: d.y }); },
  impact(s = 1) { this.noise(1.6 * s + 0.4, { vol: 0.5 * s, type: 'lowpass', freq: 900, f2: 60, buf: 'brown' }); this.tone(48, 1.2, { vol: 0.45 * s, f2: 22 }); setTimeout(() => this.groan(0.6), 700); },
  groan(v = 0.4) { if (!this.ok()) return; this.tone(rnd(38, 62), rnd(2, 3.5), { type: 'sawtooth', vol: 0.05 * v, filter: 260, f2: rnd(28, 45), attack: 0.6 }); this.noise(rnd(2, 3), { vol: 0.06 * v, freq: rnd(120, 220), q: 8, f2: rnd(60, 90), buf: 'brown', attack: 0.5 }); },
  knock(x) { const n = rint(2, 4); for (let i = 0; i < n; i++) setTimeout(() => this.noise(0.06, { vol: 0.09, freq: rnd(600, 1100), q: 6, x: x ?? rnd(0, SHIP_W), y: 200 }), i * rnd(90, 160)); },
  powerDown() { this.tone(160, 1.4, { type: 'sawtooth', vol: 0.08, filter: 600, f2: 30 }); },
  powerUp() { this.tone(40, 1.5, { type: 'sawtooth', vol: 0.06, filter: 600, f2: 140, attack: 0.4 }); },
  roomPowerDown(r) { this.tone(120, 0.6, { type: 'sawtooth', vol: 0.03, filter: 500, f2: 30, x: r.cx, y: r.cy }); },
  fireStart(r) { this.noise(0.8, { vol: 0.15, type: 'lowpass', freq: 600, f2: 200, x: r.cx, y: r.cy, buf: 'brown' }); },
  staticBurst(v = 0.4) { const n = rint(3, 6); for (let i = 0; i < n; i++) setTimeout(() => this.noise(rnd(0.03, 0.12), { vol: 0.06 * v, freq: rnd(1500, 3500), q: 0.8 }), i * rnd(30, 90)); },
  radio() { this.noise(0.08, { vol: 0.04, freq: 2200, q: 1 }); setTimeout(() => this.noise(0.18, { vol: 0.025, freq: 1600, q: 1.2 }), 90); },
  scream(v, c) { if (!this.ok()) return; const x = c ? c.x : undefined, y = c ? c.y : undefined; const t = this.now(), ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(rnd(420, 560), t); o.frequency.linearRampToValueAtTime(rnd(300, 380), t + 0.9);
    const vib = ctx.createOscillator(); vib.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = 18; vib.connect(vg); vg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    o.connect(f); f.connect(lp); lp.connect(g); this.out(g, x, y); o.start(t); vib.start(t); o.stop(t + 1.05); vib.stop(t + 1.05); },
  death(seen) { this.tone(70, 2.5, { type: 'sine', vol: seen ? 0.12 : 0.06, f2: 40, attack: 0.3 }); if (G.sensors) { for (let i = 0; i < 3; i++) setTimeout(() => this.tone(990, 0.12, { type: 'square', vol: 0.02, filter: 2000 }), i * 220); setTimeout(() => this.tone(990, 1.6, { type: 'square', vol: 0.015, filter: 2000 }), 700); } },
  tool(c) { if (chance(0.6)) this.noise(0.05, { vol: 0.03, freq: rnd(2000, 4000), q: 5, x: c.x, y: c.y }); },
  weld() { this.noise(0.1, { vol: 0.03, freq: 5000, q: 0.7, type: 'highpass' }); },
  spark(r) { this.noise(0.04, { vol: 0.05, freq: 4000, q: 1, type: 'highpass', x: r.cx, y: r.cy }); },
  sparkBurst(r) { for (let i = 0; i < 4; i++) setTimeout(() => this.spark(r), i * 60); },
  ductScrape(r) { this.noise(rnd(0.6, 1.4), { vol: 0.08, freq: rnd(300, 600), q: 3, f2: rnd(200, 400), x: r.vent, y: r.y0 - 15, attack: 0.15 }); },
  ventDrop(r, up) { this.noise(0.3, { vol: 0.14, type: 'lowpass', freq: 700, f2: 150, x: r.vent, y: r.y0 }); this.noise(0.08, { vol: 0.08, freq: 2400, q: 3, x: r.vent, y: r.y0 }); },
  ventRoar(r) { this.noise(6, { vol: 0.25, freq: 600, q: 0.7, f2: 200, x: r.cx, y: r.cy, attack: 0.05 }); },
  creatureCry(r, v) { if (!this.ok()) return; const x = r.cx, y = r.cy; this.tone(rnd(90, 130), 1.4, { type: 'sawtooth', vol: 0.09 * v, filter: 700, f2: rnd(50, 70), x, y, attack: 0.1 }); this.noise(1.2, { vol: 0.07 * v, freq: 300, q: 6, f2: 140, x, y, attack: 0.1 }); },
  attack(r) { this.noise(0.15, { vol: 0.22, type: 'lowpass', freq: 1200, f2: 200, x: r.cx, y: r.cy }); this.tone(80, 0.2, { vol: 0.15, f2: 40, x: r.cx, y: r.cy }); },
  shot(c) { this.noise(0.09, { vol: 0.2, type: 'lowpass', freq: 3000, f2: 300, x: c.x, y: c.y }); this.tone(140, 0.1, { vol: 0.12, f2: 50, x: c.x, y: c.y }); },
  sting() { // first sighting: a low swell, not a jump scare
    this.tone(55, 4, { type: 'sawtooth', vol: 0.06, filter: 220, attack: 1.2 }); this.tone(58.5, 4, { type: 'sawtooth', vol: 0.05, filter: 220, attack: 1.4 });
  },
  airlockCycle() { this.noise(4, { vol: 0.12, freq: 500, q: 0.8, f2: 150, attack: 0.3, x: 100, y: 100 }); },
  klaxon() { this.tone(330, 0.55, { type: 'square', vol: 0.025, filter: 900, f2: 250 }); },
  chime() { this.tone(660, 0.6, { vol: 0.03 }); setTimeout(() => this.tone(495, 0.9, { vol: 0.03 }), 220); },
  beep() { this.tone(1400, 0.06, { type: 'square', vol: 0.012, filter: 3000 }); },

  // ---- ambient driver ------------------------------------------------------
  update(dt) {
    if (!this.on || !this.ctx) return;
    const t = this.now();
    const out = G.reactor.output / 132;
    this.droneG.gain.setTargetAtTime(this.muted ? 0 : 0.03 + out * 0.07, t, 0.4);
    const inst = G.reactor.instability;
    this.d1.frequency.setTargetAtTime(30 + out * 11 + (inst > 0.3 ? Math.sin(G.t * 3) * inst * 3 : 0), t, 0.3);
    this.d2.frequency.setTargetAtTime(30.6 + out * 11.1, t, 0.3);
    const life = G.groups.LIFE.powered && G.roomById.o2.powered;
    this.ventG.gain.setTargetAtTime(life ? 0.05 : 0, t, life ? 1.5 : 0.8);
    const faults = G.rooms.filter((r) => r.elecFault).length;
    this.humG.gain.setTargetAtTime(0.0012 + (G.brownout ? 0.006 : 0) + faults * 0.0015, t, 0.3);
    // fire near view
    let fire = 0; for (const r of G.rooms) if (r.fire > 0) fire = Math.max(fire, r.fire * this.dist(r.cx, r.cy));
    this.fireG.gain.setTargetAtTime(fire * 0.05, t, 0.3);
    this.fireAM.gain.setValueAtTime(0.4 + Math.random() * 0.6, t);
    let wind = 0; for (const r of G.rooms) if ((r.breach > 0 || r.venting) && r.p > 2) wind = Math.max(wind, (r.p / 101) * (r.venting ? 1 : r.breach) * this.dist(r.cx, r.cy));
    this.windG.gain.setTargetAtTime(wind * 0.18, t, 0.2);
    this.windF.frequency.setTargetAtTime(500 + wind * 900, t, 0.3);
    // ship noises
    this.nextGroan -= dt; this.nextKnock -= dt;
    if (this.nextGroan <= 0) { this.nextGroan = rnd(30, 80) * (G.res.hull < 70 ? 0.6 : 1) * (G.phase >= 3 ? 0.8 : 1); this.groan(0.5 + (100 - G.res.hull) / 100); }
    if (this.nextKnock <= 0) { this.nextKnock = rnd(12, 30); if (life || chance(0.4)) this.knock(); }
    // alarms
    this.alarmT -= dt;
    if (G.alertLevel === 2 && this.alarmT <= 0) { this.alarmT = 2.6; this.klaxon(); }
    else if (G.alertLevel === 1 && this.alarmT <= 0) { this.alarmT = 9; this.chime(); }
    this.beepT -= dt;
    if (this.beepT <= 0 && G.rooms.some((r) => r.p < 60 && r.p > 2)) { this.beepT = 0.5; this.beep(); }
    // creature presence
    for (const m of G.creatures) {
      if (!m.alive) continue;
      if (m.state === 'room' && chance(dt * 0.25)) { const r = G.roomById[m.room]; this.noise(rnd(0.6, 1.2), { vol: 0.05, freq: rnd(180, 320), q: 5, x: m.x, y: r.cy, buf: 'brown', attack: 0.3 }); }
      if (m.state === 'vent' && m.vto && chance(dt * 0.5)) { const r = G.roomById[m.vto]; this.ductScrape(r); }
    }
  },
};
