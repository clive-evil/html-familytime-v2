/* ==========================================================================
   CORE — utils, settings, extra SFX, and the ENGINE adapter that drives the
   Chaos World Battle Lab's real Battle / Fighter / FX / camera / HUD objects.
   World space = Battle Lab world: 1080 wide, ground band roughly y 600..1300.
   ========================================================================== */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };

/* ---------- settings / save ---------- */
const SAVE_KEY = 'cw_mike_minigames_bl_v1';
const DEFAULTS = () => ({
  mute: false, speed: 1,
  m1: { bossHp: 1, burn: 3.8, pullDiff: 1, atkFreq: 1, partner: 'ai_ok', boss: 'spireWarden' },
  m2: { hunterSpeed: 1, startDist: 120, dropRate: 1, hunterHp: 1, itemMode: 'auto' },
});
const Save = {
  data: { settings: DEFAULTS(), best: {} },
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (d) { const def = DEFAULTS(); const s = d.settings || {}; this.data = { settings: Object.assign(def, s, { m1: Object.assign(def.m1, s.m1 || {}), m2: Object.assign(def.m2, s.m2 || {}) }), best: d.best || {} }; }
    } catch (e) { /* storage blocked */ }
  },
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  reset() { this.data = { settings: DEFAULTS(), best: {} }; try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },
};
const S = () => Save.data.settings;

/* ---------- extra SFX (rope, pull, burn, chase) — the engine's own sfx are used for hits/roars/etc ---------- */
const Sfx = {
  ctx: null, out: null, last: {},
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.45; this.out.connect(this.ctx.destination);
      const n = this.ctx.sampleRate; this.nb = this.ctx.createBuffer(1, n, n); const d = this.nb.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  tone(f, dur, type = 'square', vol = 0.2, f2 = null, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, freq = 1000, vol = 0.3, type = 'lowpass', f2 = null, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = this.nb; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(fl); fl.connect(g); g.connect(this.out); s.start(t); s.stop(t + dur + 0.02);
  },
  play(name) {
    if (!this.ctx || S().mute) return;
    const now = this.ctx.currentTime, gap = { pull: 0.03, step: 0.2, heartbeat: 0.25, tick: 0.08, strain: 0.25 }[name] || 0.02;
    if (this.last[name] && now - this.last[name] < gap) return; this.last[name] = now;
    const F = {
      ropeThrow: () => { this.noise(0.35, 2500, 0.18, 'bandpass', 600); this.tone(300, 0.3, 'triangle', 0.08, 700); },
      ropeLock: () => { this.tone(180, 0.08, 'square', 0.25, 90); this.noise(0.12, 3000, 0.25, 'highpass'); this.tone(880, 0.12, 'triangle', 0.12, 1320, 0.05); },
      ropeMiss: () => this.tone(400, 0.25, 'sawtooth', 0.12, 120),
      ropeSnap: () => { this.noise(0.18, 4000, 0.4, 'highpass'); this.tone(220, 0.25, 'square', 0.18, 60); },
      burn: () => { this.noise(1.0, 500, 0.5, 'lowpass', 3000); this.tone(90, 0.8, 'sawtooth', 0.2, 40); },
      pull: () => this.tone(140 + Math.random() * 60, 0.07, 'square', 0.09, 100),
      strain: () => this.tone(70, 0.3, 'sawtooth', 0.12, 55),
      charge: () => { this.tone(120, 1.2, 'sawtooth', 0.1, 480); this.noise(1.2, 400, 0.15, 'bandpass', 2500); },
      crash: () => { this.noise(1.0, 600, 0.9, 'lowpass', 80); this.tone(60, 0.8, 'sine', 0.6, 25); },
      dizzy: () => { for (let i = 0; i < 5; i++) this.tone(900 + i * 150, 0.09, 'triangle', 0.08, 1200 + i * 150, i * 0.07); },
      tick: () => this.tone(1200, 0.04, 'square', 0.06),
      reveal: () => this.tone(700, 0.08, 'square', 0.1, 1400),
      rare: () => [784, 988, 1175].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.14, null, i * 0.07)),
      epic: () => { [523, 784, 1046, 1568, 2093].forEach((f, i) => this.tone(f, 0.22, 'square', 0.1, null, i * 0.07)); this.noise(0.6, 6000, 0.12, 'highpass', null, 0.2); },
      whoosh: () => this.noise(0.35, 400, 0.3, 'bandpass', 3000),
      trap: () => { this.tone(160, 0.1, 'square', 0.3, 60); this.noise(0.12, 5000, 0.3, 'highpass'); },
      knock: () => { this.tone(140, 0.3, 'square', 0.25, 40); this.noise(0.3, 900, 0.3, 'lowpass', 100); },
      slow: () => this.tone(600, 0.5, 'sine', 0.15, 150),
      stun: () => { this.tone(1500, 0.3, 'square', 0.08, 300); this.tone(1800, 0.3, 'triangle', 0.08, 400, 0.05); },
      heartbeat: () => { this.tone(55, 0.12, 'sine', 0.5, 40); this.tone(50, 0.12, 'sine', 0.4, 35, 0.16); },
      step: () => { this.noise(0.15, 200, 0.5, 'lowpass', 50); this.tone(45, 0.15, 'sine', 0.4, 30); },
      hereHe: () => { this.noise(1.2, 200, 0.6, 'lowpass', 900); this.tone(65, 1.2, 'sawtooth', 0.3, 45); this.tone(98, 1.2, 'square', 0.12, 49); },
      full: () => this.tone(200, 0.15, 'square', 0.12, 150),
    };
    try { F[name] && F[name](); } catch (e) { /* ignore */ }
  },
};
// engine sfx (Battle Lab's own) — safe wrapper
const sfx = (name, ...a) => { try { const k = window.__BL && __BL.k; if (k && typeof k[name] === 'function') k[name](...a); } catch (e) { /* ignore */ } };

/* ---------- ENGINE adapter ---------- */
const E = {
  get L() { return window.__BL; },
  get S() { return window.__stage; },
  get B() { return window.__stage && window.__stage.b; },
  ready() { return !!(window.__BL && window.__stage && window.__stage.b && window.__ready); },
  t: 0,
  init() {
    const st = this.S;
    st.stageEl.classList.add('cw-on');
    // our own HUD root lives inside the scaled stage, in world-y coordinates (like .hud-top)
    this.root = el('div', 'cw-root lab-own', st.stageEl);
    this.menuRoot = el('div', 'cw-full lab-own', st.stageEl);
    // engine loop hooks
    st.tickers.add((dt) => { this.t += dt; try { Game.update(dt); } catch (e) { Game.err(e); } });
    const origHud = st.updateHud.bind(st);
    st.updateHud = () => { origHud(); try { Game.postHud(); } catch (e) { Game.err(e); } };
    st.pressSkill = (i) => Game.onSkill(i);
    st.onUltPress = () => Game.onUlt();
    st.ultReady = () => Game.ultReady();
    st.showTip = () => {};
    st.worldTap.push((wx, wy) => Game.onWorldTap(wx, wy));
    const B = this.B;
    B.onDrawGround = (ctx) => Game.drawGround(ctx);
    B.onDrawWorld = (ctx) => Game.drawWorld(ctx);
    B.onDrawOverhead = (ctx) => Game.drawOverhead(ctx);
    // keyboard: capture-phase so the Battle Lab's own 1/2/3/Q handlers never see mode keys
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      Sfx.unlock();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (Game.onKey(k, e)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    window.addEventListener('pointerdown', () => Sfx.unlock(), { capture: true });
  },
  /** Wipe the Battle Lab state and hand the stage to a mode. */
  takeover(opts = {}) {
    const st = this.S, B = this.B, d = window.__dir;
    try { d && d.running && d.stop(); } catch (e) { /* ignore */ }
    B.stopFight(); B.clearField(); B.clearTransients();
    B.mods = []; B.actionMul = 1; B.godMode = false; B.invincibleEnemy = false; B.allowKO = true; B.diss = 0; B.dissActive = false;
    B.heroes = []; B.skills.clear && B.skills.clear();
    B.cam.focusT = 0; B.cam.tx = B.cam.baseX; B.cam.ty = B.cam.baseY; B.cam.tz = B.cam.baseZ;
    st.backdrop = false; st.paused = false; st.inputLock = 0; st.timeScale = S().speed || 1;
    st.ui = Object.assign({ header: false, controls: false, diss: false, items: false, turnq: false }, opts.ui || {});
    try { st.hud.hideBanner(); st.hud.hideModal(); st.hud.clearTransients(); } catch (e) { /* ignore */ }
    B.setBackdrop(opts.backdrop || 'arena');
    if (opts.lava) B.bd = this.lavaBackdrop(opts.backdrop || 'arena', opts.lava);
    this.root.innerHTML = '';
    this.syncMute();
  },
  syncMute() { try { __BL.k.setMuted(!!S().mute); } catch (e) { /* ignore */ } },
  act(dur) { return new this.L.R(dur); },
  pose(name, over) { const P = this.L.M[name]; return over ? this.L.A({ ...P, ...over }) : P; },
  ease(n) { return this.L.D[n]; },
  hero(id, x, y, o = {}) {
    const B = this.B, f = B.makeHero(id, o.level || 3, false);
    f.x = f.hx = x; f.y = f.hy = y; f.facing = o.facing || 1;
    if (o.hp) { f.maxHp = o.hp; f.hp = o.hp; }
    if (o.name) f.name = o.name;
    B.heroes.push(f);
    return f;
  },
  enemy(key, x, y, o = {}) {
    const f = this.B.spawnEnemy(key, x, y, { hp: o.hp, level: o.level });
    f.hx = x; f.hy = y; f.facing = o.facing || -1;
    if (o.scale) f.baseScale = o.scale;
    if (o.name) f.name = o.name;
    return f;
  },
  /** Generic real-time hit on any fighter: flash, knock, floating number, engine sfx. */
  hit(f, dmg, o = {}) {
    const B = this.B;
    f.flash = 1; f.hurtT = o.heavy ? 0.3 : 0.2;
    f.knockV += (f.team === 'enemy' ? 1 : -1) * (o.knock != null ? o.knock : o.heavy ? 520 : 260);
    if (o.number !== false) {
      const crit = !!o.crit;
      B.fx.number(f.x + rand(-14, 20), f.cy - (o.dy || 70), o.text || '-' + Math.round(dmg), {
        size: o.size || (crit ? 86 : o.heavy ? 66 : 54), fill: o.fill || (f.team === 'enemy' ? (crit ? '#ffcf3a' : '#fff6d8') : '#ff6a6a'),
        stroke: f.team === 'enemy' ? undefined : '#2a0610', crit, label: o.label, life: o.life || (crit ? 1.2 : 0.9), vy: o.vy,
      });
    }
    if (o.stop) B.hitStopT = Math.max(B.hitStopT, o.stop);
    if (o.shake) B.cam.shake(o.shake);
  },
  /** Re-tint a Battle Lab backdrop into a lava hell (cached). */
  lavaBackdrop(theme, strength = 1) {
    this._bd = this._bd || {};
    const key = theme + strength; if (this._bd[key]) return this._bd[key];
    const bd = this.B.backdrops[theme];
    const tint = (src, ground) => {
      if (!src || !src.width) return src;
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d');
      x.drawImage(src, 0, 0);
      if (ground) {
        x.globalCompositeOperation = 'multiply'; x.fillStyle = strength > 1 ? '#ff4a24' : '#ff6a3a'; x.fillRect(0, 0, c.width, c.height);
        x.globalCompositeOperation = 'screen'; x.fillStyle = 'rgba(110,18,0,0.32)'; x.fillRect(0, 0, c.width, c.height);
      } else { // foreground overlay is mostly transparent: tint only its own pixels
        x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(120,20,10,0.55)'; x.fillRect(0, 0, c.width, c.height);
      }
      x.globalCompositeOperation = 'source-over';
      if (ground) lavaCracks(x, c.width, c.height);
      return c;
    };
    const out = Object.assign({}, bd, { bgImg: tint(bd.bgImg || bd.bg, true), fgImg: tint(bd.fgImg || bd.fg, false), eyes: (bd.eyes || []).map((e) => ({ ...e })) });
    this._bd[key] = out; return out;
  },
  stageY(wy) { return wy; },
  banner(title, sub = '', kind = 'ready', dur = 1.4) { try { this.S.hud.showBanner(title, sub, kind, dur); } catch (e) { /* ignore */ } },
  toast(html, dur = 1.8) { try { this.S.hud.toast(html, dur); } catch (e) { /* ignore */ } },
  flash(color) { try { this.S.hud.flash(color); } catch (e) { /* ignore */ } },
  portrait(kind, team = 'hero') { try { return this.L.rr(kind, team); } catch (e) { return ''; } },
  icon(id) { try { return this.L.Jn(id); } catch (e) { return ''; } },
};

/* painted lava cracks over the backdrop's floor area (backdrop canvas coordinates) */
function lavaCracks(x, w, h) {
  const top = h * 0.4, bot = h * 0.8;
  const rng = (() => { let s = 7; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
  x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
  const crack = (px, py, len, dir, thick, depth) => {
    const pts = [[px, py]];
    for (let k = 0; k < len; k++) { dir += (rng() - 0.5) * 0.9; px += Math.cos(dir) * (16 + rng() * 18); py += Math.sin(dir) * (6 + rng() * 8); pts.push([px, py]); }
    const path = () => { x.beginPath(); pts.forEach(([a, b], j) => (j ? x.lineTo(a, b) : x.moveTo(a, b))); };
    x.strokeStyle = 'rgba(16,3,6,0.9)'; x.lineWidth = thick + 7; path(); x.stroke();
    x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(255,70,10,0.28)'; x.lineWidth = thick + 16; path(); x.stroke(); x.globalCompositeOperation = 'source-over';
    x.strokeStyle = '#d8400e'; x.lineWidth = thick; path(); x.stroke();
    x.strokeStyle = '#ffb04a'; x.lineWidth = Math.max(1.5, thick * 0.4); path(); x.stroke();
    if (depth > 0) for (let k = 2; k < pts.length - 1; k += 3) if (rng() < 0.6) crack(pts[k][0], pts[k][1], 3 + Math.floor(rng() * 4), dir + (rng() < 0.5 ? 1 : -1) * (0.8 + rng() * 0.6), thick * 0.55, depth - 1);
  };
  for (let i = 0; i < 9; i++) { const py = top + rng() * (bot - top), k = (py - top) / (bot - top); crack(rng() * w, py, 8 + Math.floor(rng() * 8), (rng() - 0.5) * 0.8 + (rng() < 0.5 ? 0 : Math.PI), 5 + k * 7, 2); }
  for (let i = 0; i < 4; i++) {
    const cx = rng() * w, cy = top + 60 + rng() * (bot - top - 100), rx = 50 + rng() * 60, ry = rx * 0.26;
    x.fillStyle = 'rgba(16,3,6,0.92)'; x.beginPath(); x.ellipse(cx, cy, rx + 10, ry + 7, 0, 0, Math.PI * 2); x.fill();
    const g = x.createRadialGradient(cx, cy - ry * 0.3, 2, cx, cy, rx); g.addColorStop(0, '#ffe08a'); g.addColorStop(0.4, '#ff8a1a'); g.addColorStop(1, '#a8200a');
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill();
  }
  x.restore();
}

/* draw a painted rope between two world points (sag, vibration, burn 0..1) */
function drawRope(ctx, x1, y1, x2, y2, o = {}) {
  const sag = o.sag != null ? o.sag : 30, vib = o.vib || 0, burn = o.burn || 0, t = E.t;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + sag;
  const ang = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(ang), ny = Math.cos(ang), v = vib ? Math.sin(t * 55) * vib : 0;
  const cx = mx + nx * v, cy = my + ny * v;
  const path = () => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); };
  ctx.save(); ctx.lineCap = 'round';
  if (burn > 0.05) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,110,30,' + (burn * 0.5) + ')'; ctx.lineWidth = 26 + burn * 30; path(); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
  ctx.strokeStyle = '#140818'; ctx.lineWidth = 17; path(); ctx.stroke();
  ctx.strokeStyle = burn > 0.75 ? '#ff9a4a' : '#c8905a'; ctx.lineWidth = 10; path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,200,0.45)'; ctx.lineWidth = 3; ctx.setLineDash([10, 12]); ctx.lineDashOffset = -t * 30; path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(90,50,20,0.8)'; ctx.lineWidth = 6; ctx.setLineDash([4, 14]); ctx.lineDashOffset = -t * 30 + 7; path(); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}
function drawLasso(ctx, x, y, r, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.strokeStyle = '#140818'; ctx.lineWidth = 16; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#c8905a'; ctx.lineWidth = 9; ctx.stroke();
  ctx.restore();
}
/** outlined Luckiest Guy text in world space */
function wText(ctx, txt, x, y, size, fill, o = {}) {
  ctx.save(); ctx.font = size + 'px "Luckiest Guy", sans-serif'; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(5, size * 0.22); ctx.strokeStyle = o.stroke || '#140818'; ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill; ctx.fillText(txt, x, y); ctx.restore();
}
function press(node, fn) {
  if (!node) return;
  node.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); Sfx.unlock();
    node.classList.remove('hit'); void node.offsetWidth; node.classList.add('hit');
    try { sfx('ui'); } catch (er) { /* ignore */ }
    fn(e);
  });
}
