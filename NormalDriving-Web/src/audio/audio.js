// All sounds are synthesised with WebAudio — no assets, no network.
// The engine is the most important one: pitch = rpm, brightness = throttle,
// a lumpy sub-harmonic = load/bogging. You should be able to drive by ear.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.8;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = w; }
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = this.brownBuf.getChannelData(0);
    for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = b * 3.5; }

    // ------------------------------------------------ engine
    // combustion pulse wave: strong low harmonics, a bit of rasp
    const N = 24;
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) im[n] = (1 / Math.pow(n, 1.05)) * (n % 2 ? 1 : 0.6) * (n === 2 ? 1.4 : 1);
    const pulse = ctx.createPeriodicWave(re, im);
    const re2 = new Float32Array(8), im2 = new Float32Array(8);
    im2[1] = 1; im2[2] = 0.5; im2[3] = 0.25;
    const rumbleWave = ctx.createPeriodicWave(re2, im2);

    this.engBus = ctx.createGain(); this.engBus.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 1.6;
    this.engFilter.connect(this.engBus); this.engBus.connect(this.master);

    this.osc1 = ctx.createOscillator(); this.osc1.setPeriodicWave(pulse);
    this.osc2 = ctx.createOscillator(); this.osc2.setPeriodicWave(pulse);  // slight detune → beating
    this.osc3 = ctx.createOscillator(); this.osc3.setPeriodicWave(rumbleWave); // half-order rumble
    this.g1 = ctx.createGain(); this.g1.gain.value = 0.5;
    this.g2 = ctx.createGain(); this.g2.gain.value = 0.25;
    this.g3 = ctx.createGain(); this.g3.gain.value = 0.35;
    // load "lump": amplitude modulation at the half-order frequency
    this.lumpOsc = ctx.createOscillator(); this.lumpOsc.type = 'sine';
    this.lumpDepth = ctx.createGain(); this.lumpDepth.gain.value = 0;
    this.lumpGain = ctx.createGain(); this.lumpGain.gain.value = 1;
    this.lumpOsc.connect(this.lumpDepth).connect(this.lumpGain.gain);
    this.osc1.connect(this.g1).connect(this.lumpGain);
    this.osc2.connect(this.g2).connect(this.lumpGain);
    this.osc3.connect(this.g3).connect(this.lumpGain);
    this.lumpGain.connect(this.engFilter);
    // intake/exhaust noise
    this.intake = this.noiseSource(this.noiseBuf);
    this.intakeF = ctx.createBiquadFilter(); this.intakeF.type = 'bandpass'; this.intakeF.Q.value = 1.2;
    this.intakeG = ctx.createGain(); this.intakeG.gain.value = 0;
    this.intake.connect(this.intakeF).connect(this.intakeG).connect(this.engBus);
    for (const o of [this.osc1, this.osc2, this.osc3, this.lumpOsc]) o.start();

    // ------------------------------------------------ starter motor
    this.starterOsc = ctx.createOscillator(); this.starterOsc.type = 'sawtooth'; this.starterOsc.frequency.value = 190;
    this.starterF = ctx.createBiquadFilter(); this.starterF.type = 'bandpass'; this.starterF.frequency.value = 900; this.starterF.Q.value = 0.9;
    this.starterG = ctx.createGain(); this.starterG.gain.value = 0;
    this.starterChug = ctx.createOscillator(); this.starterChug.type = 'square'; this.starterChug.frequency.value = 7;
    this.starterChugD = ctx.createGain(); this.starterChugD.gain.value = 0.0;
    this.starterChug.connect(this.starterChugD).connect(this.starterG.gain);
    this.starterOsc.connect(this.starterF).connect(this.starterG).connect(this.master);
    this.starterOsc.start(); this.starterChug.start();

    // ------------------------------------------------ road, wind, tyres, grind, scrape
    this.road = this.loop(this.brownBuf, 'lowpass', 260, 0.7);
    this.wind = this.loop(this.noiseBuf, 'bandpass', 700, 0.5);
    this.squeal = this.loop(this.noiseBuf, 'bandpass', 1250, 9);
    this.squealTone = ctx.createOscillator(); this.squealTone.type = 'triangle'; this.squealTone.frequency.value = 980;
    this.squealToneG = ctx.createGain(); this.squealToneG.gain.value = 0;
    this.squealTone.connect(this.squealToneG).connect(this.master); this.squealTone.start();
    this.grind = this.loop(this.noiseBuf, 'bandpass', 2300, 3);
    this.grindAM = ctx.createOscillator(); this.grindAM.type = 'square'; this.grindAM.frequency.value = 47;
    this.grindAMd = ctx.createGain(); this.grindAMd.gain.value = 0;
    this.grindAM.connect(this.grindAMd).connect(this.grind.g.gain); this.grindAM.start();
    this.scrape = this.loop(this.noiseBuf, 'bandpass', 1600, 2);
    this.slip = this.loop(this.noiseBuf, 'highpass', 3000, 0.7); // clutch/belt whine-ish hiss when slipping hard

    // ------------------------------------------------ horn (other cars)
    this.hornG = ctx.createGain(); this.hornG.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 2200;
    for (const f of [405, 508]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start(); }
    hf.connect(this.hornG).connect(this.master);
    this.hornPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    // own horn (weedier)
    this.ownHornG = ctx.createGain(); this.ownHornG.gain.value = 0;
    const of = ctx.createBiquadFilter(); of.type = 'bandpass'; of.frequency.value = 900; of.Q.value = 1.5;
    for (const f of [440, 468]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(of); o.start(); }
    of.connect(this.ownHornG).connect(this.master);

    this.enabled = true;
  }

  noiseSource(buf) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 1.5); return s;
  }
  loop(buf, type, freq, q) {
    const s = this.noiseSource(buf);
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = 0;
    s.connect(f).connect(g).connect(this.master);
    return { s, f, g };
  }
  set(param, v, tc = 0.03) { param.setTargetAtTime(v, this.ctx.currentTime, tc); }

  // ------------------------------------------------ one-shots
  burst({ freq = 800, type = 'bandpass', q = 1, dur = 0.08, gain = 0.4, buf, delay = 0 }) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = buf || this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  thump({ freq = 70, dur = 0.25, gain = 0.6, delay = 0, drop = 0.5 }) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * drop, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  play(type, mag = 1) {
    if (!this.enabled) return;
    switch (type) {
      case 'gearIn':
        this.burst({ freq: 2400, q: 2, dur: 0.035, gain: 0.25 });
        this.burst({ freq: 380, type: 'lowpass', dur: 0.09, gain: 0.45, delay: 0.02 });
        this.thump({ freq: 140, dur: 0.08, gain: 0.25, delay: 0.02 });
        break;
      case 'gearOut':
        this.burst({ freq: 1800, q: 2, dur: 0.03, gain: 0.18 });
        this.burst({ freq: 500, type: 'lowpass', dur: 0.05, gain: 0.2, delay: 0.01 });
        break;
      case 'grind':
        this.burst({ freq: 2600, q: 3, dur: 0.32, gain: 0.55 });
        this.burst({ freq: 900, q: 2, dur: 0.25, gain: 0.35, delay: 0.03 });
        this.grindPulse = 0.3;
        break;
      case 'stall':
        // the engine coughs and dies: rpm-follow handles the spin down; add the shudder
        for (let i = 0; i < 3; i++) this.thump({ freq: 52 - i * 6, dur: 0.18, gain: 0.55 - i * 0.12, delay: i * 0.11 });
        this.burst({ freq: 300, type: 'lowpass', dur: 0.25, gain: 0.3, delay: 0.05 });
        break;
      case 'catch':
        this.thump({ freq: 60, dur: 0.2, gain: 0.35 });
        break;
      case 'keyOn': case 'keyOff':
        this.burst({ freq: 3200, q: 4, dur: 0.02, gain: 0.2 });
        this.burst({ freq: 1500, q: 4, dur: 0.02, gain: 0.15, delay: 0.05 });
        break;
      case 'handbrakeOn':
        for (let i = 0; i < 6; i++) this.burst({ freq: 3000 + i * 120, q: 6, dur: 0.018, gain: 0.22, delay: i * 0.035 });
        break;
      case 'handbrakeOff':
        this.burst({ freq: 2600, q: 5, dur: 0.03, gain: 0.25 });
        this.burst({ freq: 400, type: 'lowpass', dur: 0.12, gain: 0.3, delay: 0.08 });
        break;
      case 'collision':
        this.thump({ freq: 75, dur: 0.35, gain: 0.5 + 0.5 * mag });
        this.burst({ freq: 500, type: 'lowpass', dur: 0.3, gain: 0.35 + 0.4 * mag });
        this.burst({ freq: 3500, q: 1, dur: 0.12 + 0.2 * mag, gain: 0.12 * mag, delay: 0.02 });
        break;
      case 'kerb':
        this.thump({ freq: 58, dur: 0.18, gain: 0.35 + 0.4 * mag, drop: 0.7 });
        this.burst({ freq: 250, type: 'lowpass', dur: 0.15, gain: 0.3 * mag });
        break;
      default: break;
    }
  }

  horn(len = 0.4, pan = 0) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const g = this.hornG.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(0.16, t + 0.02);
    g.setValueAtTime(0.16, t + len); g.linearRampToValueAtTime(0, t + len + 0.04);
    void pan;
  }

  // ------------------------------------------------ continuous update
  update(dt, s) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const rpm = Math.max(0, s.rpm);
    const f0 = Math.max(rpm / 60 * 2, 0.5); // 4-cyl 4-stroke firing frequency
    // engine audible only when turning
    const turning = Math.min(1, rpm / 250);
    const running = s.running ? 1 : 0.35;
    const thr = s.throttleEff ?? s.throttle;
    const load = Math.min(1, s.load);
    const lug = s.running ? Math.max(0, Math.min(1, (1400 - rpm) / 700)) * load : 0;
    this.set(this.osc1.frequency, f0, 0.012);
    this.set(this.osc2.frequency, f0 * 1.007, 0.012);
    this.set(this.osc3.frequency, f0 * 0.5, 0.012);
    this.set(this.lumpOsc.frequency, f0 * 0.25, 0.02);
    this.set(this.lumpDepth.gain, 0.15 + 0.7 * lug + (s.running ? 0 : 0.5), 0.05);
    this.set(this.g3.gain, 0.3 + 0.5 * lug, 0.05);
    const cutoff = 180 + rpm * 0.32 + thr * 1500 + load * 300;
    this.set(this.engFilter.frequency, cutoff, 0.03);
    this.set(this.engBus.gain, turning * running * (0.2 + 0.32 * thr + 0.12 * load) * (s.inside ? 1 : 0.7), 0.04);
    this.set(this.intakeF.frequency, 300 + rpm * 0.5, 0.05);
    this.set(this.intakeG.gain, s.running ? thr * 0.18 * Math.min(1, rpm / 2500) : 0, 0.05);
    // starter
    this.set(this.starterG.gain, s.cranking ? 0.13 : 0, 0.02);
    this.set(this.starterChugD.gain, s.cranking ? 0.08 : 0, 0.02);
    this.set(this.starterOsc.frequency, 150 + rpm * 0.25, 0.03);
    this.set(this.starterChug.frequency, Math.max(3, rpm / 60 * 2), 0.03);
    // road + wind
    const v = s.speed;
    this.set(this.road.g.gain, Math.min(0.35, v * 0.03), 0.1);
    this.set(this.road.f.frequency, 140 + v * 18, 0.1);
    this.set(this.wind.g.gain, Math.min(0.2, v * v * 0.0006), 0.1);
    // tyres
    this.set(this.squeal.g.gain, s.squeal * 0.22, 0.03);
    this.set(this.squealToneG.gain, s.squeal * 0.035, 0.03);
    this.set(this.squealTone.frequency, 900 + s.squeal * 200 + Math.sin(ctx.currentTime * 31) * 25, 0.02);
    // gearbox grind (held)
    this.grindPulse = Math.max(0, (this.grindPulse || 0) - dt);
    const grinding = s.grinding > 0 || this.grindPulse > 0 ? 1 : 0;
    this.set(this.grind.g.gain, grinding * 0.28, 0.015);
    this.set(this.grindAMd.gain, grinding * 0.25, 0.015);
    this.set(this.grindAM.frequency, 30 + rpm / 60, 0.05);
    // scrape against things
    this.set(this.scrape.g.gain, Math.min(0.3, s.scrape * 0.12), 0.03);
    // clutch slip hiss when abusing it
    this.set(this.slip.g.gain, s.clutchAbuse * 0.05, 0.1);
    // own horn
    this.set(this.ownHornG.gain, s.horn ? 0.12 : 0, 0.01);
  }
}
