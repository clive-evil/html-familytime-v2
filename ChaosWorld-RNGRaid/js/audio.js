/* Procedural WebAudio SFX — no files, no network. CW.Sfx.play('legendary') etc.
 * Every call is a named hook so real assets can replace them later.
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});
  let ctx = null, master = null, noiseBuf = null;
  const Sfx = { enabled: true, volume: 0.55, lastPlayed: [], _throttle: {} };

  function ac() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = Sfx.volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  Sfx.unlock = () => { const c = ac(); if (c && c.state === 'suspended') c.resume(); };

  function tone(type, f0, f1, t0, dur, vol = 0.3, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(t0, dur, vol = 0.3, filt = 'bandpass', f = 1200, q = 1, f1) {
    const s = ctx.createBufferSource(), g = ctx.createGain(), b = ctx.createBiquadFilter();
    s.buffer = noiseBuf; b.type = filt; b.frequency.setValueAtTime(f, t0); b.Q.value = q;
    if (f1) b.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(b); b.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }
  const arp = (notes, t0, step, type = 'square', dur = 0.12, vol = 0.18) => notes.forEach((n, i) => tone(type, n, n, t0 + i * step, dur, vol));
  const N = (semi) => 261.63 * Math.pow(2, semi / 12); // C4-relative

  const BANK = {
    tick:      (t, o) => tone('square', 1400 + (o.pitch || 0), 900, t, 0.03, o.quiet ? 0.04 : 0.09),
    reveal:    (t) => { tone('triangle', N(0), N(0), t, 0.12, 0.25); tone('triangle', N(7), N(7), t + 0.07, 0.16, 0.2); },
    rare:      (t) => arp([N(0), N(4), N(7), N(12)], t, 0.06, 'square', 0.14, 0.14),
    epic:      (t) => { arp([N(0), N(3), N(7), N(10), N(15)], t, 0.06, 'sawtooth', 0.18, 0.11); noise(t, 0.6, 0.15, 'highpass', 3000, 0.5, 9000); },
    legendary: (t) => {
      noise(t, 0.9, 0.18, 'bandpass', 400, 0.8, 6000);
      arp([N(0), N(4), N(7), N(12), N(16), N(19), N(24)], t + 0.15, 0.07, 'square', 0.22, 0.12);
      [N(12), N(16), N(19)].forEach((f) => tone('sawtooth', f, f, t + 0.7, 0.9, 0.08));
      tone('sine', 60, 40, t, 0.8, 0.5);
    },
    mythic:    (t) => {
      for (let i = 0; i < 10; i++) tone('square', 200 + Math.random() * 1600, 80 + Math.random() * 400, t + i * 0.05, 0.08, 0.1);
      tone('sine', 50, 30, t, 1.2, 0.6);
      [N(0), N(6), N(12), N(18)].forEach((f, i) => tone('sawtooth', f, f * 1.01, t + 0.6 + i * 0.03, 1.2, 0.08));
      noise(t + 0.5, 1.2, 0.2, 'bandpass', 200, 0.5, 8000);
    },
    tease:     (t) => tone('sine', 120, 480, t, 1.2, 0.18),
    stealTry:  (t) => { tone('triangle', 300, 900, t, 0.5, 0.15); noise(t, 0.4, 0.1, 'highpass', 2000); },
    dialTick:  (t) => tone('square', 700, 600, t, 0.025, 0.06),
    stealWin:  (t) => { arp([N(12), N(16), N(19), N(24)], t, 0.05, 'triangle', 0.18, 0.2); noise(t, 0.3, 0.12, 'highpass', 5000); },
    stealFail: (t) => { tone('sawtooth', 220, 110, t, 0.35, 0.18); tone('sawtooth', 207, 98, t + 0.3, 0.6, 0.18); },
    grief:     (t) => { noise(t, 0.35, 0.45, 'lowpass', 2500, 1, 200); tone('sine', 90, 35, t, 0.5, 0.5); tone('square', 600, 120, t + 0.05, 0.25, 0.08); },
    curse:     (t) => tone('sawtooth', 500, 90, t, 0.7, 0.08),
    boost:     (t) => { tone('square', N(-5), N(-5), t, 0.08, 0.15); tone('square', N(7), N(7), t + 0.08, 0.08, 0.15); noise(t + 0.12, 0.25, 0.15, 'highpass', 6000); tone('triangle', N(19), N(19), t + 0.14, 0.25, 0.15); },
    chaosRaid: (t) => { for (let i = 0; i < 3; i++) tone('sawtooth', 220, 110, t + i * 0.35, 0.3, 0.16); tone('sine', 55, 30, t, 1.4, 0.5); },
    countdown: (t, o) => tone('square', o.final ? 880 : 520, o.final ? 880 : 520, t, o.final ? 0.35 : 0.12, 0.16),
    transition:(t) => { noise(t, 1.0, 0.35, 'bandpass', 300, 0.7, 4000); tone('sine', 110, 40, t + 0.5, 1.4, 0.55); tone('triangle', N(-12), N(-12), t + 0.5, 1.4, 0.15); },
    deny:      (t) => tone('square', 160, 140, t, 0.16, 0.12),
    click:     (t) => tone('triangle', 900, 600, t, 0.05, 0.12),
    pop:       (t) => tone('sine', 500, 900, t, 0.08, 0.12),
    hit:       (t) => noise(t, 0.08, 0.2, 'bandpass', 900 + Math.random() * 600, 1.5),
    crit:      (t) => { noise(t, 0.14, 0.35, 'bandpass', 1800, 1); tone('square', 900, 300, t, 0.1, 0.1); },
    heal:      (t) => tone('sine', N(12), N(19), t, 0.25, 0.08),
    skill:     (t) => { noise(t, 0.3, 0.2, 'bandpass', 600, 1, 3000); tone('triangle', N(0), N(12), t, 0.25, 0.12); },
    slam:      (t) => { tone('sine', 80, 30, t, 0.5, 0.6); noise(t, 0.4, 0.3, 'lowpass', 800); },
    death:     (t) => tone('square', 300, 60, t, 0.35, 0.1),
    victory:   (t) => { arp([N(0), N(4), N(7), N(12)], t, 0.12, 'square', 0.2, 0.16); [N(12), N(16), N(19), N(24)].forEach((f) => tone('triangle', f, f, t + 0.55, 1.2, 0.09)); },
    defeat:    (t) => { arp([N(7), N(6), N(5)], t, 0.35, 'sawtooth', 0.4, 0.14); tone('sawtooth', N(4), N(-8), t + 1.05, 1.4, 0.14); },
    coin:      (t) => { tone('square', 1320, 1320, t, 0.06, 0.08); tone('square', 1760, 1760, t + 0.06, 0.12, 0.08); },
  };

  Sfx.play = function (name, opts = {}) {
    Sfx.lastPlayed.push(name);
    if (Sfx.lastPlayed.length > 40) Sfx.lastPlayed.shift();
    if (!Sfx.enabled || !BANK[name]) return;
    const c = ac();
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    const gap = opts.gap ?? (name === 'tick' || name === 'hit' ? 0.03 : 0);
    if (gap && Sfx._throttle[name] && now - Sfx._throttle[name] < gap) return;
    Sfx._throttle[name] = now;
    try { BANK[name](now + (opts.delay || 0), opts); } catch (e) { /* never break the game for audio */ }
  };
  Sfx.setEnabled = (on) => { Sfx.enabled = on; };
  Sfx.names = Object.keys(BANK);
  CW.Sfx = Sfx;
})(typeof window !== 'undefined' ? window : globalThis);
