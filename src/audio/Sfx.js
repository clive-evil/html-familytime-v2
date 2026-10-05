/**
 * Sfx — fully procedural sound effects for Too Many Grandmas.
 *
 * Every sound is synthesised on the fly with the WebAudio API: no audio files,
 * no external libraries. The palette aims for "soft, toy-like, 1950s kitchen":
 * round sine bloops, wooden toks, gentle chimes and little Grandma murmurs.
 *
 * Usage:
 *   const sfx = new Sfx();
 *   window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
 *   sfx.play('pop', { volume: 0.8, pitch: 1.1, pan: -0.3 });
 *
 * Design notes:
 * - No AudioContext is created until `unlock()` (browsers block audio before a
 *   user gesture). Before that, and in environments without WebAudio (Node,
 *   headless tests), every method is a silent no-op that never throws.
 * - Each `play()` builds a short-lived "voice": its own nodes feeding a
 *   volume gain + stereo panner into the master bus. When the voice's last
 *   source ends, every node it created is disconnected so nothing leaks.
 * - Crowds of Grandmas fire lots of events, so each sound name is rate-limited
 *   (MAX_PER_SECOND) and the total number of live voices is capped. A gentle
 *   compressor on the master bus keeps hundreds of overlaps from clipping.
 */

/** Max starts of the same sound name within any rolling 1s window. */
const MAX_PER_SECOND = 12;
/** Hard cap on simultaneously sounding voices (CPU safety valve). */
const MAX_VOICES = 64;
/** Silence floor for exponential ramps (they cannot reach 0). */
const FLOOR = 0.0001;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/** Resolve the AudioContext constructor, or null when WebAudio is absent. */
function getAudioContextCtor() {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

export class Sfx {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this._master = null;
    this._compressor = null;
    this._noiseBuffer = null;
    this._muted = false;
    this._volume = 0.5;
    /** name -> array of recent start times (ctx seconds), oldest first. */
    this._recent = new Map();
    this._liveVoices = 0;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Create (first call) or resume the AudioContext. Call from a user gesture.
   * Safe to call repeatedly; silently does nothing without WebAudio.
   */
  unlock() {
    try {
      if (!this.ctx) {
        const Ctor = getAudioContextCtor();
        if (!Ctor) return;
        this.ctx = new Ctor();
        this._buildGraph();
      }
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      // Audio is a nicety; never let it break the game.
    }
  }

  get muted() {
    return this._muted;
  }

  setMuted(muted) {
    this._muted = !!muted;
    this._applyMasterGain();
  }

  /** Master volume, 0..1 (default 0.5). */
  setVolume(v) {
    const n = Number(v);
    this._volume = clamp(Number.isFinite(n) ? n : 0.5, 0, 1);
    this._applyMasterGain();
  }

  get volume() {
    return this._volume;
  }

  /**
   * Play a named sound.
   * @param {string} name   one of Sfx.NAMES; unknown names are ignored
   * @param {{volume?:number, pitch?:number, pan?:number}} [opts]
   */
  play(name, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || this._muted || ctx.state === 'closed') return;
    const recipe = RECIPES[name];
    if (!recipe) return;
    if (this._liveVoices >= MAX_VOICES) return;

    const now = ctx.currentTime;
    if (!this._allowStart(name, now)) return;

    const volume = clamp(Number.isFinite(opts.volume) ? opts.volume : 1, 0, 1);
    if (volume <= 0) return;
    const pitch = clamp(Number.isFinite(opts.pitch) ? opts.pitch : 1, 0.25, 4);
    const pan = clamp(Number.isFinite(opts.pan) ? opts.pan : 0, -1, 1);

    let voice = null;
    try {
      voice = this._createVoice(now + 0.005, volume, pitch, pan);
      recipe(voice);
    } catch {
      // A failed sound should never take down a frame.
    } finally {
      // Always seal so a half-built voice still gets cleaned up.
      if (voice) voice.seal();
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** Master chain: voices -> master gain -> compressor -> destination. */
  _buildGraph() {
    const ctx = this.ctx;
    this._master = ctx.createGain();

    // Gentle glue compression: catches piles of overlapping pops without
    // audibly pumping on single sounds.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this._compressor = comp;

    this._master.connect(comp);
    comp.connect(ctx.destination);
    this._applyMasterGain(true);

    // One second of shared white noise; voices start at random offsets so
    // repeated noise sounds don't phase-match each other.
    const len = Math.floor(ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
  }

  _applyMasterGain(immediate = false) {
    if (!this.ctx || !this._master) return;
    const target = this._muted ? 0 : this._volume;
    const g = this._master.gain;
    if (immediate) {
      g.value = target;
      return;
    }
    // Short smoothing avoids a click when toggling mute mid-sound.
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  /** Sliding-window rate limit per sound name. */
  _allowStart(name, now) {
    let times = this._recent.get(name);
    if (!times) {
      times = [];
      this._recent.set(name, times);
    }
    while (times.length && now - times[0] >= 1) times.shift();
    if (times.length >= MAX_PER_SECOND) return false;
    times.push(now);
    return true;
  }

  /**
   * Build a voice: a tiny helper object that recipes use to spawn tones and
   * noise bursts. Tracks every node so it can disconnect them all once the
   * last scheduled source has ended.
   */
  _createVoice(t, volume, pitch, pan) {
    const ctx = this.ctx;
    const nodes = [];
    let pending = 0;
    let sealed = false;
    let done = false;

    const out = ctx.createGain();
    out.gain.value = volume;
    nodes.push(out);
    let tail = out;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      out.connect(panner);
      nodes.push(panner);
      tail = panner;
    }
    tail.connect(this._master);
    this._liveVoices++;

    const finish = () => {
      if (done) return;
      done = true;
      for (const n of nodes) {
        try { n.disconnect(); } catch { /* already gone */ }
      }
      nodes.length = 0;
      this._liveVoices--;
    };

    const voice = {
      ctx,
      t,
      pitch,
      out,
      noiseBuffer: this._noiseBuffer,

      /** Register a node for cleanup; returns it for chaining. */
      node(n) {
        nodes.push(n);
        return n;
      },

      /**
       * Start a source at `start` (optionally `offset` seconds into its buffer)
       * and stop it at `stop`. The voice is cleaned up after the last one ends.
       */
      source(src, start, stop, offset = 0) {
        nodes.push(src);
        pending++;
        src.onended = () => {
          src.onended = null;
          pending--;
          if (sealed && pending <= 0) finish();
        };
        if (offset > 0) src.start(start, offset);
        else src.start(start);
        src.stop(stop);
        return src;
      },

      /** Called by play() after the recipe has scheduled everything. */
      seal() {
        sealed = true;
        if (pending <= 0) finish();
      },
    };
    return voice;
  }
}

// -----------------------------------------------------------------------------
// Synthesis building blocks
// -----------------------------------------------------------------------------

/**
 * Attack/decay envelope on a GainNode's gain: silent floor -> linear rise to
 * `peak` -> exponential fall back to the floor. Starting at FLOOR avoids clicks.
 */
function envelope(param, start, peak, attack, dur) {
  const p = Math.max(peak, FLOOR * 2);
  const a = Math.max(0.001, Math.min(attack, dur * 0.5));
  param.setValueAtTime(FLOOR, start);
  param.linearRampToValueAtTime(p, start + a);
  param.exponentialRampToValueAtTime(FLOOR, start + dur);
}

/**
 * Oscillator tone.
 * @param voice  voice from Sfx._createVoice
 * @param o.type   oscillator waveform
 * @param o.f      start frequency (Hz, before pitch multiplier)
 * @param o.f2     optional end frequency for an exponential sweep
 * @param o.sweep  sweep duration (defaults to dur)
 * @param o.at     offset from voice start (s)
 * @param o.dur    total length (s)
 * @param o.peak   peak gain
 * @param o.attack attack time (s)
 * @param o.detune cents
 * @param o.dest   optional destination node (defaults to the voice output)
 * @returns {{osc: OscillatorNode, gain: GainNode}}
 */
function tone(voice, o) {
  const { ctx, pitch } = voice;
  const type = o.type || 'sine';
  const at = o.at || 0;
  const dur = o.dur;
  const start = voice.t + at;
  const f = o.f * pitch;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, start);
  if (o.f2) {
    osc.frequency.exponentialRampToValueAtTime(o.f2 * pitch, start + (o.sweep || dur));
  }
  if (o.detune) osc.detune.value = o.detune;

  const gain = voice.node(ctx.createGain());
  envelope(gain.gain, start, o.peak ?? 0.3, o.attack ?? 0.005, dur);
  osc.connect(gain);
  gain.connect(o.dest || voice.out);

  voice.source(osc, start, start + dur + 0.03);
  return { osc, gain };
}

/**
 * Filtered white-noise burst from the shared buffer.
 * @param o.filter BiquadFilter type ('lowpass' | 'highpass' | 'bandpass' ...)
 * @param o.f      filter frequency (scaled by pitch)
 * @param o.f2     optional filter sweep target
 * @param o.q      filter Q
 * @param o.at, o.dur, o.peak, o.attack, o.dest  as in tone()
 */
function noise(voice, o) {
  const { ctx, pitch } = voice;
  const at = o.at || 0;
  const dur = o.dur;
  const start = voice.t + at;

  const src = ctx.createBufferSource();
  src.buffer = voice.noiseBuffer;
  src.loop = true;

  const filter = voice.node(ctx.createBiquadFilter());
  filter.type = o.filter || 'lowpass';
  filter.frequency.setValueAtTime(clamp(o.f * pitch, 20, 18000), start);
  if (o.f2) {
    filter.frequency.exponentialRampToValueAtTime(clamp(o.f2 * pitch, 20, 18000), start + dur);
  }
  filter.Q.value = o.q ?? 1;

  const gain = voice.node(ctx.createGain());
  envelope(gain.gain, start, o.peak ?? 0.2, o.attack ?? 0.002, dur);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(o.dest || voice.out);

  // Random offset into the 1s buffer so bursts never sound identical.
  voice.source(src, start, start + dur + 0.03, Math.random() * 0.9);
  return { src, filter, gain };
}

/** Low-frequency oscillator connected to an AudioParam (vibrato, AM, wobble). */
function lfo(voice, param, rate, depth, start, stop) {
  const { ctx } = voice;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = rate;
  const amt = voice.node(ctx.createGain());
  amt.gain.value = depth;
  osc.connect(amt);
  amt.connect(param);
  voice.source(osc, start, stop);
  return osc;
}

// -----------------------------------------------------------------------------
// Recipes: one function per sound name. Each receives a voice and schedules
// its parts relative to voice.t. Frequencies are pre-pitch (voice.pitch is
// applied inside tone()/noise()).
// -----------------------------------------------------------------------------

const RECIPES = {
  /** Soft footstep tick: tiny lowpassed noise puff. */
  step(v) {
    noise(v, { filter: 'lowpass', f: rand(700, 1100), q: 0.7, dur: 0.06, peak: 0.06, attack: 0.003 });
  },

  /** Berry pluck: sine with a fast downward pitch drop. */
  berry(v) {
    tone(v, { f: rand(900, 1050), f2: 380, sweep: 0.06, dur: 0.14, peak: 0.28, attack: 0.002 });
    noise(v, { filter: 'bandpass', f: 2500, q: 2, dur: 0.02, peak: 0.05 });
  },

  /** Wooden chop: lowpassed noise burst + low sine knock. */
  wood(v) {
    noise(v, { filter: 'lowpass', f: 1400, f2: 400, q: 1.2, dur: 0.12, peak: 0.3, attack: 0.001 });
    tone(v, { f: rand(160, 190), f2: 110, dur: 0.16, peak: 0.35, attack: 0.002 });
  },

  /** Stony clink: short high triangle + bandpassed noise. */
  stone(v) {
    const f = rand(1500, 1800);
    tone(v, { type: 'triangle', f, f2: f * 0.96, dur: 0.12, peak: 0.16, attack: 0.001 });
    tone(v, { type: 'sine', f: f * 2.4, dur: 0.07, peak: 0.05, attack: 0.001 });
    noise(v, { filter: 'bandpass', f: 3200, q: 4, dur: 0.06, peak: 0.18, attack: 0.001 });
  },

  /** Resources dropped on a pile: soft clunk then a tiny rising blip. */
  deposit(v) {
    noise(v, { filter: 'lowpass', f: 900, q: 0.8, dur: 0.1, peak: 0.22 });
    tone(v, { f: 140, f2: 90, dur: 0.14, peak: 0.3, attack: 0.002 });
    tone(v, { at: 0.08, f: 880, f2: 1320, dur: 0.1, peak: 0.12, attack: 0.004 });
  },

  /** Gentle lift "bloop" upward. */
  pickup(v) {
    tone(v, { f: 300, f2: 620, sweep: 0.12, dur: 0.18, peak: 0.25, attack: 0.008 });
  },

  /** Placement confirm thud. */
  place(v) {
    tone(v, { f: 130, f2: 70, dur: 0.22, peak: 0.45, attack: 0.002 });
    noise(v, { filter: 'lowpass', f: 600, q: 0.7, dur: 0.12, peak: 0.2 });
    tone(v, { at: 0.03, type: 'triangle', f: 520, dur: 0.08, peak: 0.06 });
  },

  /** Hammer tap: noise transient + mid sine. */
  hammer(v) {
    noise(v, { filter: 'highpass', f: 2200, q: 0.8, dur: 0.035, peak: 0.25, attack: 0.001 });
    tone(v, { f: rand(560, 640), f2: 470, dur: 0.12, peak: 0.22, attack: 0.001 });
    tone(v, { f: 210, dur: 0.08, peak: 0.12, attack: 0.001 });
  },

  /** Construction finished: cheerful major arpeggio (C E G, triangle). */
  built(v) {
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      tone(v, { type: 'triangle', at: i * 0.085, f, dur: i === 2 ? 0.4 : 0.18, peak: 0.2, attack: 0.006 });
    });
    tone(v, { at: 0.17, f: 1567.98, dur: 0.35, peak: 0.04, attack: 0.01 });
  },

  /** Gran-ulator lid: metallic clunk from detuned square partials + noise. */
  lid(v) {
    tone(v, { type: 'square', f: 310, f2: 290, dur: 0.12, peak: 0.07, attack: 0.001 });
    tone(v, { type: 'square', f: 437, detune: 13, dur: 0.09, peak: 0.05, attack: 0.001 });
    tone(v, { f: 95, f2: 70, dur: 0.15, peak: 0.3, attack: 0.002 });
    noise(v, { filter: 'bandpass', f: 1800, q: 1.5, dur: 0.07, peak: 0.18, attack: 0.001 });
  },

  /** Dial ratchet: three quick mechanical clicks. */
  dial(v) {
    for (let i = 0; i < 3; i++) {
      const at = i * 0.035;
      noise(v, { at, filter: 'bandpass', f: 3800 - i * 200, q: 6, dur: 0.018, peak: 0.25, attack: 0.0008 });
      tone(v, { at, type: 'triangle', f: 1900, dur: 0.015, peak: 0.05, attack: 0.0008 });
    }
  },

  /**
   * Appliance rattle/hum (~1.2s): bandpassed noise amplitude-modulated at
   * ~18Hz over a low mains-ish hum, with a slow pitch wobble.
   */
  rattle(v) {
    const { ctx, t, pitch } = v;
    const dur = 1.2;

    // Master envelope for the whole rattle.
    const env = v.node(ctx.createGain());
    env.gain.setValueAtTime(FLOOR, t);
    env.gain.linearRampToValueAtTime(1, t + 0.08);
    env.gain.setValueAtTime(1, t + dur - 0.3);
    env.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    env.connect(v.out);

    // AM stage: gain centred at 0.5, LFO swings it 0..1 at ~18Hz.
    const am = v.node(ctx.createGain());
    am.gain.value = 0.5;
    am.connect(env);
    const amLfo = lfo(v, am.gain, rand(16, 20), 0.5, t, t + dur + 0.05);
    // Slight irregularity in the rattle speed.
    lfo(v, amLfo.frequency, 2.3, 2, t, t + dur + 0.05);

    const src = ctx.createBufferSource();
    src.buffer = v.noiseBuffer;
    src.loop = true;
    const bp = v.node(ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.frequency.value = 1400 * pitch;
    bp.Q.value = 1.2;
    const nGain = v.node(ctx.createGain());
    nGain.gain.value = 0.22;
    src.connect(bp);
    bp.connect(nGain);
    nGain.connect(am);
    v.source(src, t, t + dur + 0.05, Math.random() * 0.5);

    // Low hum: soft sawtooth through a lowpass, with a gentle wobble.
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 62 * pitch;
    const humLp = v.node(ctx.createBiquadFilter());
    humLp.type = 'lowpass';
    humLp.frequency.value = 320;
    const humGain = v.node(ctx.createGain());
    humGain.gain.value = 0.16;
    hum.connect(humLp);
    humLp.connect(humGain);
    humGain.connect(env);
    lfo(v, hum.frequency, 5.5, 1.8 * pitch, t, t + dur + 0.05);
    v.source(hum, t, t + dur + 0.05);
  },

  /** Egg wobble: two soft wooden "tok tok"s. */
  wobble(v) {
    [0, 0.13].forEach((at, i) => {
      const f = (i ? 720 : 640) * rand(0.95, 1.05);
      tone(v, { at, type: 'sine', f, f2: f * 0.8, dur: 0.07, peak: 0.2, attack: 0.001 });
      noise(v, { at, filter: 'bandpass', f: 1600, q: 3, dur: 0.03, peak: 0.08, attack: 0.001 });
    });
  },

  /** Eggshell crack: 3-4 tiny highpassed noise crackles. */
  crack(v) {
    const n = 3 + (Math.random() < 0.5 ? 1 : 0);
    let at = 0;
    for (let i = 0; i < n; i++) {
      noise(v, {
        at,
        filter: 'highpass',
        f: rand(2500, 4500),
        q: 0.9,
        dur: rand(0.012, 0.025),
        peak: 0.3 - i * 0.04,
        attack: 0.0006,
      });
      at += rand(0.018, 0.035);
    }
  },

  /**
   * THE HATCH. A round bloop sweeping ~300 -> 900Hz, then a soft two-note
   * sparkle chime (major sixth) that rings out for ~0.6s.
   */
  pop(v) {
    // Body of the bloop with a slight sub for roundness.
    tone(v, { f: 300, f2: 900, sweep: 0.11, dur: 0.2, peak: 0.42, attack: 0.006 });
    tone(v, { f: 150, f2: 450, sweep: 0.11, dur: 0.15, peak: 0.12, attack: 0.006 });
    // Tiny breathy puff at the moment of release.
    noise(v, { filter: 'lowpass', f: 2200, f2: 600, q: 0.6, dur: 0.08, peak: 0.07, attack: 0.003 });
    // Sparkle chime: C6 + A6 (major sixth), plus a faint shimmer partial.
    tone(v, { at: 0.09, f: 1046.5, dur: 0.6, peak: 0.13, attack: 0.004 });
    tone(v, { at: 0.13, f: 1760, dur: 0.55, peak: 0.1, attack: 0.004 });
    tone(v, { at: 0.13, f: 3520, detune: 6, dur: 0.3, peak: 0.025, attack: 0.004 });
  },

  /**
   * Grandma murmur: two short voiced tones (sawtooth -> formant-ish bandpass
   * + lowpass, ~6Hz vibrato). Contour and base pitch are randomised so a
   * crowd sounds varied: "hm-hm?" (rising), "hm-hm." (falling) or "oooh".
   */
  grandma(v) {
    const { ctx } = v;
    const base = rand(260, 400);
    const shape = Math.random();
    const parts =
      shape < 0.45
        ? [{ at: 0, f: base, f2: base * 0.97, dur: 0.12 }, { at: 0.16, f: base * 1.05, f2: base * 1.3, dur: 0.16 }]
        : shape < 0.75
          ? [{ at: 0, f: base * 1.12, dur: 0.11 }, { at: 0.15, f: base, f2: base * 0.9, dur: 0.15 }]
          : [{ at: 0, f: base * 0.95, f2: base * 1.15, dur: 0.12, sweep: 0.12 }, { at: 0.12, f: base * 1.15, f2: base * 0.92, dur: 0.3 }];

    // Shared formant filter chain for this voice.
    const formant = v.node(ctx.createBiquadFilter());
    formant.type = 'bandpass';
    formant.frequency.value = rand(750, 1050);
    formant.Q.value = 2.2;
    const warm = v.node(ctx.createBiquadFilter());
    warm.type = 'lowpass';
    warm.frequency.value = 2200;
    formant.connect(warm);
    warm.connect(v.out);
    // Second, lower formant mixed in for body ("ooh" rather than "eee").
    const body = v.node(ctx.createBiquadFilter());
    body.type = 'bandpass';
    body.frequency.value = rand(380, 480);
    body.Q.value = 3;
    body.connect(v.out);

    for (const p of parts) {
      const { osc, gain } = tone(v, {
        type: 'sawtooth',
        at: p.at,
        f: p.f,
        f2: p.f2,
        sweep: p.sweep,
        dur: p.dur,
        peak: 0.32,
        attack: 0.02,
        dest: formant,
      });
      gain.connect(body);
      const start = v.t + p.at;
      lfo(v, osc.frequency, rand(5.5, 6.5), p.f * v.pitch * 0.02, start, start + p.dur + 0.03);
    }
  },

  /** Happy squeak when patted: short sine chirp upward. */
  pat(v) {
    tone(v, { f: 900, f2: 1700, sweep: 0.07, dur: 0.11, peak: 0.2, attack: 0.004 });
    tone(v, { at: 0.06, f: 1500, f2: 1900, dur: 0.06, peak: 0.08, attack: 0.003 });
  },

  /** Job assigned: affirmative two-note blip (a fourth up). */
  assign(v) {
    tone(v, { type: 'triangle', f: 659.25, dur: 0.08, peak: 0.2, attack: 0.003 });
    tone(v, { type: 'triangle', at: 0.08, f: 880, dur: 0.14, peak: 0.2, attack: 0.003 });
  },

  /** Low, gentle two-tone warning. */
  warn(v) {
    tone(v, { type: 'triangle', f: 220, dur: 0.22, peak: 0.28, attack: 0.02 });
    tone(v, { type: 'triangle', at: 0.24, f: 185, dur: 0.32, peak: 0.28, attack: 0.02 });
  },

  /** Tiny UI click. */
  ui(v) {
    tone(v, { type: 'triangle', f: 1800, f2: 1300, dur: 0.035, peak: 0.12, attack: 0.001 });
  },

  /** Small hand bell: inharmonic partials 1, 2.76, 5.4 with ~1s decay. */
  bell(v) {
    const f = 880;
    tone(v, { f, dur: 1.1, peak: 0.2, attack: 0.002 });
    tone(v, { f: f * 2.76, dur: 0.6, peak: 0.08, attack: 0.002 });
    tone(v, { f: f * 5.4, dur: 0.3, peak: 0.04, attack: 0.002 });
    noise(v, { filter: 'highpass', f: 5000, dur: 0.015, peak: 0.05, attack: 0.0008 });
  },

  /** Nightfall: soft descending chime (G5 E5 C5). */
  night(v) {
    [783.99, 659.25, 523.25].forEach((f, i) => {
      tone(v, { at: i * 0.18, f, dur: 0.75, peak: 0.13, attack: 0.01 });
      tone(v, { at: i * 0.18, f: f * 2, dur: 0.35, peak: 0.03, attack: 0.01 });
    });
  },

  /** Dawn: soft ascending chime (C5 E5 G5 C6). */
  dawn(v) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(v, { at: i * 0.14, f, dur: i === 3 ? 0.8 : 0.5, peak: 0.12, attack: 0.01 });
      tone(v, { at: i * 0.14, f: f * 2, dur: 0.3, peak: 0.03, attack: 0.01 });
    });
  },

  /** Egg laid: soft round "plop". */
  eggLaid(v) {
    tone(v, { f: 520, f2: 180, sweep: 0.09, dur: 0.16, peak: 0.3, attack: 0.003 });
    noise(v, { filter: 'lowpass', f: 700, q: 0.7, dur: 0.06, peak: 0.08, attack: 0.002 });
  },
};

/** All sound names this module can play. */
Sfx.NAMES = Object.freeze(Object.keys(RECIPES));

export default Sfx;
