// Fully synthesised sound (WebAudio). No sample files: every sound is original.
// Impacts are layered by strength; a compressor/limiter keeps big chain
// reactions loud but unclipped, and a voice budget prevents mush.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = false;
    this.voices = 0;
    this.frameBudget = 0;
    this.lastPlay = new Map();
    this.downCombo = 0;
    this.lastDownT = 0;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 8; this.comp.ratio.value = 10;
    this.comp.attack.value = 0.003; this.comp.release.value = 0.18;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.comp).connect(ctx.destination);
    // noise buffer
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._initRoll();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.8 : 0;
  }

  get t() { return this.ctx.currentTime; }
  newFrame() { this.frameBudget = 7; }

  _ok(key, minGap = 0.03) {
    if (!this.ctx || !this.enabled) return false;
    if (this.voices > 28) return false;
    const now = this.ctx.currentTime;
    const last = this.lastPlay.get(key) || 0;
    if (now - last < minGap) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  _env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  _track(node, dur) {
    this.voices++;
    setTimeout(() => { this.voices--; try { node.disconnect(); } catch { /* */ } }, (dur + 0.1) * 1000);
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.002, at = 0, bend = 0, dest } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), t + dur);
    this._env(g, t, attack, vol, dur);
    o.connect(g).connect(dest || this.master);
    o.start(t); o.stop(t + attack + dur + 0.02);
    this._track(g, at + dur);
  }

  noiseBurst(dur, { vol = 0.3, type = 'bandpass', freq = 1000, q = 1, at = 0, attack = 0.001, sweep = 0, dest } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain();
    this._env(g, t, attack, vol, dur);
    src.connect(f).connect(g).connect(dest || this.master);
    src.start(t, Math.random() * 1.0); src.stop(t + attack + dur + 0.02);
    this._track(g, at + dur);
  }

  // ------------------------------------------------------------ impacts
  impact(mat, s, isBall) {
    if (!this.ctx || !this.enabled || this.frameBudget <= 0) return;
    if (!this._ok(`imp:${mat}`, 0.025)) return;
    this.frameBudget--;
    const v = Math.min(1, s) ** 0.8;
    const r = () => 0.9 + Math.random() * 0.2;
    switch (mat) {
      case 'pin':
        this.noiseBurst(0.05, { vol: 0.35 * v, freq: 2600 * r(), q: 1.2 });
        this.tone(820 * r(), 0.09, { type: 'triangle', vol: 0.22 * v });
        this.tone(1350 * r(), 0.06, { type: 'sine', vol: 0.14 * v });
        if (v > 0.5) this.tone(240 * r(), 0.12, { type: 'sine', vol: 0.18 * v });
        break;
      case 'wood':
        this.noiseBurst(0.07, { vol: 0.32 * v, freq: 700 * r(), q: 2 });
        this.tone(260 * r(), 0.1, { type: 'triangle', vol: 0.22 * v });
        this.tone(530 * r(), 0.05, { vol: 0.1 * v });
        break;
      case 'card':
        this.noiseBurst(0.09, { vol: 0.35 * v, type: 'lowpass', freq: 420, q: 0.7 });
        this.tone(110 * r(), 0.08, { vol: 0.15 * v });
        break;
      case 'metal':
        for (const f of [430, 1170, 2050, 3120]) this.tone(f * r(), 0.35 + v * 0.4, { type: 'sine', vol: 0.07 * v });
        this.noiseBurst(0.04, { vol: 0.2 * v, freq: 4000, q: 1 });
        break;
      case 'can':
        for (const f of [880, 2210, 3640]) this.tone(f * r(), 0.18 + v * 0.15, { type: 'sine', vol: 0.07 * v });
        this.noiseBurst(0.03, { vol: 0.18 * v, freq: 5000, q: 1 });
        break;
      case 'glass':
      case 'ceramic':
        for (let i = 0; i < 3; i++) this.tone((mat === 'glass' ? 2400 : 1500) * (1 + Math.random()), 0.12 + Math.random() * 0.2, { vol: 0.07 * v, at: Math.random() * 0.03 });
        this.noiseBurst(0.05, { vol: 0.15 * v, type: 'highpass', freq: 3500 });
        break;
      case 'stone':
        this.noiseBurst(0.12, { vol: 0.35 * v, type: 'lowpass', freq: 500, q: 0.8 });
        this.tone(90 * r(), 0.16, { vol: 0.25 * v });
        break;
      case 'plastic':
        this.noiseBurst(0.04, { vol: 0.25 * v, freq: 1800 * r(), q: 2 });
        this.tone(640 * r(), 0.06, { type: 'square', vol: 0.05 * v });
        break;
      case 'bumper':
        this.tone(320, 0.25, { type: 'sine', vol: 0.35, bend: 2.2 });
        this.tone(640, 0.15, { type: 'triangle', vol: 0.12, bend: 1.8 });
        break;
      case 'floor':
      default:
        if (isBall) { this.tone(70 * r(), 0.14, { vol: 0.32 * v }); this.noiseBurst(0.06, { vol: 0.15 * v, type: 'lowpass', freq: 300 }); }
        else this.noiseBurst(0.05, { vol: 0.15 * v, type: 'lowpass', freq: 900 });
    }
    // heavy layer for big hits
    if (s > 0.65 && isBall) this.heavy(s);
  }

  heavy(s = 1) {
    if (!this._ok('heavy', 0.12)) return;
    this.tone(110, 0.35, { vol: 0.45 * s, bend: 0.35 });
    this.noiseBurst(0.25, { vol: 0.3 * s, type: 'lowpass', freq: 700, sweep: 0.3 });
  }

  glassSmash() {
    if (!this._ok('smash', 0.06)) return;
    this.noiseBurst(0.5, { vol: 0.45, type: 'highpass', freq: 2500, attack: 0.002 });
    for (let i = 0; i < 9; i++) this.tone(2000 + Math.random() * 5000, 0.08 + Math.random() * 0.35, { vol: 0.08, at: Math.random() * 0.25 });
    this.tone(180, 0.15, { vol: 0.2, bend: 0.5 });
  }

  shatterSmall() {
    if (!this._ok('shatterS', 0.04)) return;
    this.noiseBurst(0.22, { vol: 0.3, type: 'highpass', freq: 3000 });
    for (let i = 0; i < 5; i++) this.tone(2500 + Math.random() * 4000, 0.06 + Math.random() * 0.2, { vol: 0.07, at: Math.random() * 0.12 });
  }

  bomb() {
    if (!this._ok('bomb', 0.2)) return;
    this.tone(90, 0.8, { vol: 0.8, bend: 0.3 });
    this.noiseBurst(0.9, { vol: 0.7, type: 'lowpass', freq: 1800, sweep: 0.08 });
    this.noiseBurst(0.3, { vol: 0.3, type: 'highpass', freq: 2000 });
  }

  launch(power, heavy) {
    if (!this._ok('launch', 0.1)) return;
    this.noiseBurst(0.35, { vol: 0.25 + power * 0.2, type: 'bandpass', freq: 400, q: 0.8, sweep: 3, attack: 0.05 });
    this.tone(heavy ? 55 : 80, 0.18, { vol: 0.4, bend: 0.7 });
  }

  /** Each target falling plays a rising "pop" - escalates through a chain. */
  targetDown() {
    if (!this._ok('down', 0.035)) return;
    const now = this.ctx.currentTime;
    if (now - this.lastDownT > 1.2) this.downCombo = 0;
    this.lastDownT = now;
    const semis = Math.min(this.downCombo, 18);
    this.downCombo++;
    const f = 660 * Math.pow(2, semis / 12);
    this.tone(f, 0.12, { type: 'triangle', vol: 0.12 });
    this.tone(f * 2, 0.08, { vol: 0.05, at: 0.01 });
  }

  bonus() {
    if (!this._ok('bonus', 0.1)) return;
    [1318, 1760, 2637].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.15, at: i * 0.06 }));
  }

  ui() { if (this._ok('ui', 0.04)) { this.tone(880, 0.05, { type: 'triangle', vol: 0.12 }); this.tone(1320, 0.04, { vol: 0.06, at: 0.02 }); } }
  coin(i = 0) { if (this._ok('coin', 0.025)) { this.tone(1975 + (i % 4) * 60, 0.07, { type: 'square', vol: 0.05 }); this.tone(2637 + (i % 4) * 80, 0.12, { type: 'triangle', vol: 0.08, at: 0.05 }); } }
  chest() {
    if (!this._ok('chest', 0.3)) return;
    this.noiseBurst(0.15, { vol: 0.3, type: 'lowpass', freq: 600 });
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.14, at: 0.1 + i * 0.06 }));
    for (let i = 0; i < 8; i++) this.tone(3000 + Math.random() * 3000, 0.1, { vol: 0.04, at: 0.4 + Math.random() * 0.4 });
  }

  fanfare(kind) {
    if (!this.ctx || !this.enabled) return;
    const chord = (notes, at, dur, vol, type = 'sawtooth') => {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2400; f.connect(this.master);
      this._track(f, at + dur + 0.2);
      notes.forEach((n) => this.tone(n, dur, { type, vol, at, attack: 0.02, dest: f }));
    };
    if (kind === 'strike') {
      chord([523, 659, 784], 0, 0.14, 0.07);
      chord([587, 740, 880], 0.14, 0.14, 0.07);
      chord([659, 830, 988], 0.28, 0.14, 0.07);
      chord([784, 988, 1175, 1568], 0.44, 0.9, 0.08);
      this.tone(98, 0.9, { vol: 0.35, at: 0.44 });
      for (let i = 0; i < 14; i++) this.tone(2500 + Math.random() * 3500, 0.12, { vol: 0.03, at: 0.5 + Math.random() * 0.7 });
    } else if (kind === 'spare') {
      chord([523, 659, 784], 0, 0.14, 0.06);
      chord([698, 880, 1046], 0.16, 0.6, 0.07);
      this.tone(131, 0.6, { vol: 0.25, at: 0.16 });
    } else if (kind === 'win') {
      chord([523, 659], 0, 0.12, 0.06, 'triangle');
      chord([659, 784, 1046], 0.13, 0.5, 0.08, 'triangle');
    } else if (kind === 'fail') {
      this.tone(392, 0.25, { type: 'triangle', vol: 0.15 });
      this.tone(330, 0.25, { type: 'triangle', vol: 0.15, at: 0.25 });
      this.tone(262, 0.6, { type: 'triangle', vol: 0.15, at: 0.5, bend: 0.85 });
    } else if (kind === 'heart') {
      this.tone(220, 0.3, { type: 'sine', vol: 0.2, bend: 0.6 });
    }
  }

  // ------------------------------------------------------------ rolling
  _initRoll() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 0.8;
    const rumble = ctx.createOscillator(); rumble.type = 'sine'; rumble.frequency.value = 45;
    const rg = ctx.createGain(); rg.gain.value = 0;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    rumble.connect(rg).connect(this.master);
    src.start(); rumble.start();
    this.roll = { f, g, rg, rumble };
  }

  /** speed in m/s, 0 when not rolling. */
  setRoll(speed, onGround) {
    if (!this.roll) return;
    const t = this.ctx.currentTime;
    const v = onGround ? Math.min(1, speed / 16) : 0;
    this.roll.g.gain.setTargetAtTime(this.enabled ? v * 0.32 : 0, t, 0.05);
    this.roll.rg.gain.setTargetAtTime(this.enabled ? v * 0.22 : 0, t, 0.05);
    this.roll.f.frequency.setTargetAtTime(180 + v * 700, t, 0.05);
    this.roll.rumble.frequency.setTargetAtTime(38 + v * 30, t, 0.05);
  }
}

export const audio = new Audio();
