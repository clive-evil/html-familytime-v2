'use strict';
/* ==========================================================================
   CORE — constants, utils, save/settings, input, audio, FX, game loop
   ========================================================================== */
const W = 450, H = 800;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const Ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  outBack: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
};
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); const r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; };

/* ---------- Save / Settings ---------- */
const SAVE_KEY = 'cw_mike_minigames_v1';
const DEFAULT_SETTINGS = () => ({
  mute: false,
  speed: 1,
  m1: { bossHp: 1, burn: 3.8, pullDiff: 1, atkFreq: 1, partner: 'ai_ok' },
  m2: { hunterSpeed: 1, startDist: 120, dropRate: 1, hunterHp: 1, itemMode: 'auto' },
});
const Save = {
  data: { settings: DEFAULT_SETTINGS(), best: {} },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const def = DEFAULT_SETTINGS();
        this.data = {
          settings: Object.assign(def, d.settings || {}, {
            m1: Object.assign(def.m1, (d.settings || {}).m1 || {}),
            m2: Object.assign(def.m2, (d.settings || {}).m2 || {}),
          }),
          best: d.best || {},
        };
      }
    } catch (e) { /* storage blocked — run with defaults */ }
  },
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  reset() { this.data = { settings: DEFAULT_SETTINGS(), best: {} }; try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },
};
const S = () => Save.data.settings;

/* ---------- Audio (pure WebAudio, generated) ---------- */
const Audio = {
  ctx: null, master: null, last: {},
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  ok(name, gap) {
    if (!this.ctx || S().mute) return false;
    const now = this.ctx.currentTime;
    if (gap && this.last[name] && now - this.last[name] < gap) return false;
    this.last[name] = now;
    return true;
  },
  tone(f, dur, type = 'square', vol = 0.2, f2 = null, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, freq = 1000, vol = 0.3, type = 'lowpass', f2 = null, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  },
  play(name) {
    if (!this.ok(name, SFX_GAP[name] || 0.03)) return;
    const f = SFX[name]; if (f) try { f(this); } catch (e) { /* ignore */ }
  },
};
const SFX_GAP = { hit: 0.04, pullL: 0.03, pullR: 0.03, strain: 0.25, coin: 0.05, heartbeat: 0.2, tick: 0.08, step: 0.2 };
const SFX = {
  click: (a) => a.tone(660, 0.06, 'square', 0.12, 880),
  ropeThrow: (a) => { a.noise(0.35, 2500, 0.18, 'bandpass', 600); a.tone(300, 0.3, 'triangle', 0.08, 700); },
  ropeLock: (a) => { a.tone(180, 0.08, 'square', 0.25, 90); a.noise(0.12, 3000, 0.25, 'highpass'); a.tone(880, 0.12, 'triangle', 0.12, 1320, 0.05); },
  ropeMiss: (a) => { a.tone(400, 0.25, 'sawtooth', 0.12, 120); },
  ropeSnap: (a) => { a.noise(0.18, 4000, 0.4, 'highpass'); a.tone(220, 0.25, 'square', 0.18, 60); },
  burn: (a) => { a.noise(1.0, 500, 0.5, 'lowpass', 3000); a.tone(90, 0.8, 'sawtooth', 0.2, 40); },
  pullL: (a) => { a.tone(150 + Math.random() * 30, 0.07, 'square', 0.1, 110); },
  pullR: (a) => { a.tone(190 + Math.random() * 30, 0.07, 'square', 0.1, 140); },
  strain: (a) => { a.tone(70, 0.3, 'sawtooth', 0.12, 55); },
  roar: (a) => { a.noise(0.9, 300, 0.45, 'lowpass', 1200); a.tone(110, 0.9, 'sawtooth', 0.22, 55); a.tone(73, 0.9, 'square', 0.12, 40); },
  charge: (a) => { a.tone(120, 1.2, 'sawtooth', 0.1, 480); a.noise(1.2, 400, 0.15, 'bandpass', 2500); },
  crash: (a) => { a.noise(1.0, 600, 0.9, 'lowpass', 80); a.tone(60, 0.8, 'sine', 0.6, 25); a.tone(120, 0.3, 'square', 0.25, 40); },
  dizzy: (a) => { for (let i = 0; i < 5; i++) a.tone(900 + i * 150, 0.09, 'triangle', 0.08, 1200 + i * 150, i * 0.07); },
  hit: (a) => { a.noise(0.08, 2500, 0.25, 'bandpass'); a.tone(220 + Math.random() * 80, 0.06, 'square', 0.1, 120); },
  bigHit: (a) => { a.noise(0.25, 1800, 0.5, 'lowpass', 200); a.tone(110, 0.25, 'square', 0.3, 50); },
  slash: (a) => { a.noise(0.14, 6000, 0.25, 'highpass', 1500); },
  meteor: (a) => { a.noise(0.5, 3000, 0.35, 'lowpass', 150); a.tone(300, 0.5, 'sawtooth', 0.15, 50); },
  burst: (a) => { a.tone(220, 0.6, 'sawtooth', 0.25, 880); a.noise(0.7, 800, 0.5, 'lowpass', 100, 0.2); a.tone(55, 0.7, 'sine', 0.5, 30, 0.2); },
  hurt: (a) => { a.tone(300, 0.15, 'square', 0.14, 140); },
  stomp: (a) => { a.noise(0.4, 400, 0.6, 'lowpass', 60); a.tone(70, 0.35, 'sine', 0.5, 30); },
  fire: (a) => { a.noise(0.8, 800, 0.4, 'bandpass', 2400); },
  warn: (a) => { a.tone(520, 0.12, 'square', 0.12); a.tone(520, 0.12, 'square', 0.12, null, 0.18); },
  success: (a) => { [523, 659, 784, 1046].forEach((f, i) => a.tone(f, 0.18, 'square', 0.12, null, i * 0.08)); },
  fail: (a) => { [392, 330, 262, 196].forEach((f, i) => a.tone(f, 0.22, 'sawtooth', 0.1, null, i * 0.12)); },
  win: (a) => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => a.tone(f, 0.2, 'square', 0.12, null, i * 0.1)); },
  revive: (a) => { a.tone(440, 0.3, 'triangle', 0.12, 880); },
  tick: (a) => a.tone(1200, 0.04, 'square', 0.06),
  reveal: (a) => { a.tone(700, 0.08, 'square', 0.1, 1400); },
  rare: (a) => { [784, 988, 1175].forEach((f, i) => a.tone(f, 0.16, 'triangle', 0.14, null, i * 0.07)); },
  epic: (a) => { [523, 784, 1046, 1568, 2093].forEach((f, i) => a.tone(f, 0.22, 'square', 0.12, null, i * 0.07)); a.noise(0.6, 6000, 0.12, 'highpass', null, 0.2); },
  whoosh: (a) => { a.noise(0.35, 400, 0.3, 'bandpass', 3000); },
  trap: (a) => { a.tone(160, 0.1, 'square', 0.3, 60); a.noise(0.12, 5000, 0.3, 'highpass'); },
  boom: (a) => { a.noise(0.9, 1200, 0.8, 'lowpass', 60); a.tone(80, 0.6, 'sine', 0.6, 30); },
  knock: (a) => { a.tone(140, 0.3, 'square', 0.25, 40); a.noise(0.3, 900, 0.3, 'lowpass', 100); },
  stun: (a) => { a.tone(1500, 0.3, 'square', 0.08, 300); a.tone(1800, 0.3, 'triangle', 0.08, 400, 0.05); },
  slow: (a) => { a.tone(600, 0.5, 'sine', 0.15, 150); },
  heartbeat: (a) => { a.tone(55, 0.12, 'sine', 0.5, 40); a.tone(50, 0.12, 'sine', 0.4, 35, 0.16); },
  step: (a) => { a.noise(0.15, 200, 0.5, 'lowpass', 50); a.tone(45, 0.15, 'sine', 0.4, 30); },
  hereHe: (a) => { a.noise(1.2, 200, 0.6, 'lowpass', 900); a.tone(65, 1.2, 'sawtooth', 0.3, 45); a.tone(98, 1.2, 'square', 0.12, 49); },
  coin: (a) => a.tone(1320, 0.07, 'square', 0.06, 1760),
  arrow: (a) => a.noise(0.1, 4000, 0.15, 'highpass', 8000),
  bomb: (a) => { a.noise(0.6, 900, 0.7, 'lowpass', 60); a.tone(90, 0.5, 'sine', 0.5, 35); },
  splat: (a) => { a.noise(0.15, 900, 0.3, 'lowpass', 200); },
  full: (a) => a.tone(200, 0.15, 'square', 0.12, 150),
  ult: (a) => { a.tone(110, 1.0, 'sawtooth', 0.3, 880); a.noise(1.0, 300, 0.5, 'lowpass', 3000); },
};

/* ---------- FX: particles, floaters, shake, flashes ---------- */
const FX = {
  parts: [], floats: [], rings: [], shakeAmp: 0, shakeT: 0, flash: 0, flashColor: '#fff',
  hitStop: 0, slowT: 0, slowScale: 1,
  reset() { this.parts.length = 0; this.floats.length = 0; this.rings.length = 0; this.shakeAmp = 0; this.flash = 0; this.hitStop = 0; this.slowT = 0; this.slowScale = 1; },
  shake(a) { this.shakeAmp = Math.max(this.shakeAmp, a); },
  doFlash(a, c = '#fff') { this.flash = Math.max(this.flash, a); this.flashColor = c; },
  stop(t) { this.hitStop = Math.max(this.hitStop, t); },
  slowmo(t, s) { this.slowT = t; this.slowScale = s; },
  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = o.angle != null ? o.angle + rand(-(o.spread || 3.2), o.spread || 3.2) / 2 : rand(0, Math.PI * 2);
      const sp = rand(o.spMin || 60, o.spMax || 260);
      this.parts.push({
        x: x + rand(-(o.jx || 0), o.jx || 0), y: y + rand(-(o.jy || 0), o.jy || 0),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0),
        life: rand(o.lifeMin || 0.3, o.lifeMax || 0.7), max: 0, size: rand(o.sMin || 3, o.sMax || 7),
        color: Array.isArray(o.color) ? pick(o.color) : o.color || '#ffd21f', grav: o.grav != null ? o.grav : 400,
        type: o.type || 'spark', drag: o.drag || 0.9, rot: rand(0, 6), vr: rand(-8, 8),
      });
      const p = this.parts[this.parts.length - 1]; p.max = p.life;
    }
  },
  dust(x, y, n, spread = 120) { this.burst(x, y, n, { color: ['#7b5a48', '#9b7660', '#5d4336', '#c09a7a'], type: 'smoke', spMin: 30, spMax: spread, grav: -30, sMin: 10, sMax: 24, lifeMin: 0.5, lifeMax: 1.1, angle: -Math.PI / 2, spread: 3.6, jx: 30 }); },
  fire(x, y, n, o = {}) { this.burst(x, y, n, Object.assign({ color: ['#ff6a13', '#ffd21f', '#ff2e1f', '#fff1a8'], type: 'fire', grav: -260, spMin: 30, spMax: 120, sMin: 6, sMax: 14, lifeMin: 0.3, lifeMax: 0.7 }, o)); },
  text(x, y, txt, o = {}) {
    this.floats.push({ x, y, txt, color: o.color || '#fff', size: o.size || 26, life: o.life || 0.9, max: o.life || 0.9, vy: o.vy != null ? o.vy : -70, vx: o.vx || rand(-15, 15), stroke: o.stroke || '#000', pop: 0, rot: o.rot || rand(-0.12, 0.12) });
  },
  ring(x, y, o = {}) { this.rings.push({ x, y, r: o.r0 || 10, r1: o.r1 || 120, life: o.life || 0.4, max: o.life || 0.4, color: o.color || '#fff', w: o.w || 8 }); },
  update(dt) {
    if (this.shakeAmp > 0) { this.shakeAmp = Math.max(0, this.shakeAmp - dt * (18 + this.shakeAmp * 3)); }
    this.shakeT += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, dt * 10); p.vy *= Math.pow(p.drag, dt * 10); p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.life -= dt; f.pop += dt;
      if (f.life <= 0) { this.floats.splice(i, 1); continue; }
      f.y += f.vy * dt; f.x += f.vx * dt; f.vy *= Math.pow(0.4, dt);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.life -= dt; if (r.life <= 0) this.rings.splice(i, 1); }
    if (this.parts.length > 700) this.parts.splice(0, this.parts.length - 700);
  },
  shakeOffset() {
    if (this.shakeAmp <= 0.1) return [0, 0];
    const t = this.shakeT * 60;
    return [Math.sin(t * 1.7) * this.shakeAmp, Math.cos(t * 2.3) * this.shakeAmp * 0.8];
  },
  drawParts(ctx) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      ctx.globalAlpha = p.type === 'smoke' ? k * 0.7 : Math.min(1, k * 1.6);
      ctx.fillStyle = p.color;
      if (p.type === 'star') { drawStar(ctx, p.x, p.y, p.size * (0.6 + k * 0.4), p.rot, p.color); }
      else if (p.type === 'smoke') { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - k * 0.6), 0, 7); ctx.fill(); }
      else if (p.type === 'fire') { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, 7); ctx.fill(); }
      else if (p.type === 'chunk') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); }
      else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.fillRect(-p.size, -p.size / 4, p.size * 2.2, p.size / 2); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = r.w * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r, r.r1, Ease.outCubic(k)), 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  drawFloats(ctx) {
    for (const f of this.floats) {
      const k = f.life / f.max;
      const pop = f.pop < 0.12 ? 0.5 + (f.pop / 0.12) * 0.8 : f.pop < 0.22 ? 1.3 - ((f.pop - 0.12) / 0.1) * 0.3 : 1;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(pop, pop);
      ctx.globalAlpha = Math.min(1, k * 3);
      outlinedText(ctx, f.txt, 0, 0, f.size, f.color, f.stroke);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};

const FONT = '"Impact","Haettenschweiler","Arial Narrow Bold","Arial Black",sans-serif';
function outlinedText(ctx, txt, x, y, size, fill, stroke = '#000', align = 'center') {
  ctx.font = size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = stroke;
  ctx.strokeText(txt, x, y + size * 0.06); ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill; ctx.fillText(txt, x, y);
}
function drawStar(ctx, x, y, r, rot, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = Math.max(1.5, r * 0.18); ctx.strokeStyle = '#000'; ctx.stroke(); ctx.restore();
}

/* ---------- DOM callouts (big comic banners) ---------- */
const Callout = {
  root: null,
  show(html, cls = '', dur = 1.2) {
    if (!this.root) this.root = $('#callouts');
    const el = document.createElement('div');
    el.className = 'callout ' + cls; el.innerHTML = html;
    el.style.animationDuration = dur + 's';
    this.root.appendChild(el);
    setTimeout(() => el.remove(), dur * 1000 + 50);
    return el;
  },
  clear() { if (this.root) this.root.innerHTML = ''; },
};

/* ---------- Input ---------- */
const Input = {
  keyHandlers: [],
  init() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      Audio.unlock();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ([' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
      if (Game.screen && Game.screen.onKey) Game.screen.onKey(k, e);
    });
    window.addEventListener('pointerdown', () => Audio.unlock(), { capture: true });
  },
};
// Bind a fast press handler (pointerdown, not click) to a DOM button.
function press(el, fn) {
  if (!el) return;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    Audio.unlock();
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
    fn(e);
  });
}

/* ---------- Game shell / loop ---------- */
const Game = {
  screen: null, cv: null, ctx: null, scale: 1, k: 1, time: 0, paused: false, errors: [],
  init() {
    this.cv = $('#cv'); this.ctx = this.cv.getContext('2d');
    this.resize(); window.addEventListener('resize', () => this.resize());
    this.cv.addEventListener('pointerdown', (e) => {
      if (!this.screen || !this.screen.onTap || this.paused) return;
      const r = this.cv.getBoundingClientRect();
      this.screen.onTap((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
    });
    let last = performance.now();
    const loop = (now) => {
      let dt = Math.min(0.05, (now - last) / 1000); last = now;
      try { this.frame(dt); } catch (err) { this.errors.push(String(err && err.stack || err)); console.error(err); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    this.scale = Math.min(vw / W, vh / H);
    const fr = $('#frame');
    fr.style.transform = 'translate(-50%,-50%) scale(' + this.scale + ')';
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.k = Math.max(1, this.scale * dpr);
    this.cv.width = Math.round(W * this.k); this.cv.height = Math.round(H * this.k);
  },
  setScreen(s) {
    if (this.screen && this.screen.exit) this.screen.exit();
    FX.reset(); Callout.clear();
    this.screen = s; this.paused = false;
    if (s && s.enter) s.enter();
  },
  frame(dt) {
    this.time += dt;
    let gdt = dt * (S().speed || 1);
    if (this.paused) gdt = 0;
    if (FX.hitStop > 0) { FX.hitStop -= dt; gdt = 0; }
    if (FX.slowT > 0) { FX.slowT -= dt; gdt *= FX.slowScale; }
    if (gdt > 0) FX.update(gdt);
    const s = this.screen;
    if (s && s.update && gdt > 0) s.update(gdt);
    const ctx = this.ctx;
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (s && s.render) {
      const [sx, sy] = FX.shakeOffset();
      ctx.save(); ctx.translate(sx, sy); s.render(ctx, gdt); ctx.restore();
    }
    if (FX.flash > 0) { ctx.globalAlpha = Math.min(0.85, FX.flash); ctx.fillStyle = FX.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (s && s.uiTick) s.uiTick(dt);
  },
};
