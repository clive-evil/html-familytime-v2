// Generated audio: everything is filtered noise and simple oscillators, so
// there are no asset files. Continuous layers follow the skier state; one-shots
// give physical feedback for pops, landings, impacts and the mountain.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const layer = (type, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
      return { f, g };
    };
    this.hiss = layer('bandpass', 1600, 0.6);
    this.carve = layer('bandpass', 3800, 1.8);
    this.scrape = layer('bandpass', 900, 1.2);
    this.wind = layer('lowpass', 500, 0.5);
    this.rumble = layer('lowpass', 70, 0.9);
    this.powder = layer('lowpass', 700, 0.7);
    // ice chatter: amplitude modulation of the scrape layer
    this.chatterGain = ctx.createGain();
    this.chatterGain.gain.value = 1;
    this.scrape.g.disconnect();
    this.scrape.g.connect(this.chatterGain);
    this.chatterGain.connect(this.master);
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 26;
    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = 0;
    lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.chatterGain.gain);
    lfo.start();
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.7;
  }

  set(layer, value, time = 0.05) {
    if (!this.ctx) return;
    layer.g.gain.setTargetAtTime(value, this.ctx.currentTime, time);
  }

  // per-frame continuous update
  update(st) {
    if (!this.ctx) return;
    const sp = st.speed;
    const g = st.grounded && !st.crashed;
    const s01 = Math.min(1, sp / 35);
    this.set(this.hiss, g ? 0.04 + s01 * 0.22 : 0);
    this.hiss.f.frequency.setTargetAtTime(900 + s01 * 1800, this.ctx.currentTime, 0.1);
    this.set(this.carve, g && !st.ice ? Math.min(0.25, Math.abs(st.edge) * s01 * 0.35 * Math.min(1.5, st.load)) : 0);
    const sk = Math.min(1, st.skid / 8);
    this.set(this.scrape, g ? sk * (st.ice ? 0.5 : 0.35) + (st.rock ? s01 * 0.2 : 0) : 0, 0.03);
    this.lfoDepth.gain.setTargetAtTime(st.ice && g ? 0.8 : 0, this.ctx.currentTime, 0.05);
    this.set(this.wind, Math.min(0.45, 0.02 + s01 * s01 * 0.4 + (st.grounded ? 0 : 0.05)), 0.2);
    this.wind.f.frequency.setTargetAtTime(300 + s01 * 1400, this.ctx.currentTime, 0.2);
    this.set(this.powder, g && st.powder ? 0.15 + s01 * 0.2 : 0, 0.1);
    this.set(this.rumble, Math.min(1.2, st.rumble || 0), 0.3);
  }

  env(node, t0, a, peak, decay) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + decay);
  }

  noiseBurst(type, freq, q, peak, decay, delay = 0, sweepTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    this.env(g, t0, 0.005, peak, decay);
    src.start(t0, Math.random());
    src.stop(t0 + decay + 0.1);
  }

  tone(type, f0, f1, peak, decay, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + decay);
    const g = ctx.createGain();
    o.connect(g);
    g.connect(this.master);
    this.env(g, t0, 0.004, peak, decay);
    o.start(t0);
    o.stop(t0 + decay + 0.05);
  }

  thump(intensity) {
    const k = Math.min(1, intensity);
    this.tone('sine', 110, 38, 0.25 + k * 0.6, 0.18 + k * 0.2);
    this.noiseBurst('lowpass', 500 + k * 600, 0.7, 0.15 + k * 0.5, 0.15 + k * 0.2);
  }

  compress(intensity) {
    this.noiseBurst('bandpass', 700, 0.8, Math.min(0.4, 0.08 + intensity * 0.1), 0.25);
  }

  takeoff(quality, pop) {
    // whoosh rising with pop strength
    const k = Math.min(1, pop / 3);
    this.noiseBurst('bandpass', 500, 1.5, 0.12 + k * 0.25, 0.3, 0, 1800 + k * 1800);
    if (quality === 'perfect') {
      this.tone('triangle', 520, 1040, 0.12, 0.22, 0.02);
      this.noiseBurst('highpass', 5000, 0.7, 0.12, 0.12);
    }
  }

  land(quality, impact) {
    const k = Math.min(1, impact / 9);
    this.thump(0.2 + k * 0.6);
    if (quality === 'perfect') {
      this.noiseBurst('highpass', 3500, 0.7, 0.25, 0.22);
      this.tone('sine', 880, 870, 0.08, 0.5, 0.03);
      this.tone('sine', 1320, 1310, 0.05, 0.6, 0.06);
    } else if (quality === 'sketchy') {
      this.noiseBurst('bandpass', 1200, 2, 0.2, 0.35, 0.05);
    }
  }

  wood(intensity = 1) {
    this.tone('square', 190, 120, 0.12 * intensity, 0.08);
    this.noiseBurst('bandpass', 1400, 3, 0.2 * intensity, 0.1);
  }

  crash(intensity = 1) {
    this.thump(1);
    this.noiseBurst('lowpass', 1200, 0.5, 0.5 * intensity, 0.6, 0.05);
  }

  crack(big = false) {
    for (let i = 0; i < (big ? 4 : 2); i++) this.noiseBurst('highpass', 2500, 0.8, big ? 0.45 : 0.25, 0.06, i * 0.07);
    if (big) this.tone('sine', 70, 30, 0.6, 1.2, 0.05);
  }

  skiOff() {
    this.tone('square', 600, 300, 0.08, 0.06);
  }

  saved() {
    this.tone('triangle', 660, 990, 0.1, 0.25);
    this.tone('triangle', 990, 1320, 0.08, 0.3, 0.1);
  }

  checkpoint() {
    this.tone('sine', 520, 520, 0.08, 0.3);
    this.tone('sine', 780, 780, 0.08, 0.4, 0.12);
  }
}
