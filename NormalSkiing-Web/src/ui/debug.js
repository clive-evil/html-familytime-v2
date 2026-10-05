// ?debug=1 tuning panel: live physics values, last jump report, a leg/contact
// trace, and sliders for the tunables in TUNE_RANGES.

import { TUNE_RANGES } from '../config.js';

const cls = (v, good, mid) => (v === good ? 'good' : v === mid ? 'mid' : 'bad');

export class DebugPanel {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('debug');
    this.el.style.display = 'block';
    this.el.innerHTML = `
      <div id="dbg-live"></div>
      <h4>LEG TRACE (2 s) <span style="color:#7fd">L</span> <span style="color:#fa6">target</span> <span style="color:#8f8">contact</span> <span style="color:#f66">push</span></h4>
      <canvas id="dbg-plot" width="310" height="90"></canvas>
      <div id="dbg-jump"></div>
      <div id="dbg-history"></div>
      <h4>STATIONS / CHECKPOINTS</h4><div id="dbg-cp"></div>
      <h4>TUNING</h4><div id="dbg-tune"></div>
      <button id="dbg-copy">copy tuning JSON</button>`;
    this.live = this.el.querySelector('#dbg-live');
    this.jump = this.el.querySelector('#dbg-jump');
    this.hist = this.el.querySelector('#dbg-history');
    this.plot = this.el.querySelector('#dbg-plot').getContext('2d');
    this.jumps = [];
    this.buildTune();
    this.buildCheckpoints();
    this.el.querySelector('#dbg-copy').onclick = () => {
      const T = this.game.tune;
      const o = {};
      for (const k of Object.keys(TUNE_RANGES)) o[k] = T[k];
      navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(o, null, 1));
    };
    this.t = 0;
  }

  buildTune() {
    const host = this.el.querySelector('#dbg-tune');
    const T = this.game.tune;
    for (const [k, [mn, mx, st]] of Object.entries(TUNE_RANGES)) {
      const lab = document.createElement('label');
      const val = document.createElement('span');
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = mn;
      inp.max = mx;
      inp.step = st;
      inp.value = T[k];
      const fmt = (v) => (Math.abs(v) < 0.01 ? (+v).toExponential(2) : (+v).toFixed(st < 0.01 ? 4 : st < 1 ? 2 : 0));
      val.textContent = `${k} ${fmt(T[k])}`;
      inp.oninput = () => {
        T[k] = +inp.value;
        val.textContent = `${k} ${fmt(T[k])}`;
      };
      inp.onmousedown = (e) => e.stopPropagation();
      lab.append(val, inp);
      host.append(lab);
    }
  }

  buildCheckpoints() {
    const host = this.el.querySelector('#dbg-cp');
    this.game.world.checkpoints.forEach((cp, i) => {
      const b = document.createElement('button');
      b.textContent = cp.name.length > 16 ? cp.name.slice(0, 16) : cp.name;
      b.onclick = (e) => {
        e.stopPropagation();
        this.game.respawnAt(i, true);
      };
      host.append(b);
    });
  }

  addJump(rep) {
    this.jumps.unshift(rep);
    if (this.jumps.length > 6) this.jumps.pop();
  }

  update(dt) {
    this.t += dt;
    if (this.t < 0.08) return;
    this.t = 0;
    const g = this.game;
    const sk = g.skier;
    const T = g.tune;
    const range = T.legMax - T.legMin;
    const row = (a, b, c = '') => `<div class="row"><span>${a}</span><span class="${c}">${b}</span></div>`;
    const bs = sk.balanceState;
    this.live.innerHTML = '<h4>LIVE</h4>'
      + row('speed', `${(sk.speed * 3.6).toFixed(0)} km/h  (${sk.speed.toFixed(1)} m/s)`)
      + row('slope angle', `${sk.slopeDeg.toFixed(1)} deg`)
      + row('surface', sk.surf ? sk.surf.name : '-')
      + row('contact', sk.grounded ? 'GROUND' : `AIR ${sk.airTime.toFixed(2)} s`)
      + row('posture x / y', `${sk.post.x.toFixed(2)} / ${sk.post.y.toFixed(2)}`)
      + row('crouch (compression)', `${((1 - (sk.L - T.legMin) / range) * 100).toFixed(0)} %`)
      + row('leg length / target', `${sk.L.toFixed(2)} / ${sk.Lt.toFixed(2)} m`)
      + row('extension rate', `${sk.Ldot.toFixed(2)} m/s`)
      + row('leg load', `${sk.load.toFixed(2)} g`)
      + row('jump extension force', `${(sk.popAcc || 0).toFixed(2)} m/s stored`)
      + row('edge / skid', `${(sk.edge * 57.3).toFixed(0)} deg / ${sk.skid.toFixed(1)} m/s`)
      + row('balance F / L', `${sk.balF.toFixed(2)} / ${sk.balL.toFixed(2)}`)
      + row('balance state', bs, bs === 'stable' ? 'good' : bs === 'wobbling' ? 'mid' : 'bad')
      + row('pitch / roll (air)', `${(sk.pitch * 57.3).toFixed(0)} / ${(sk.roll * 57.3).toFixed(0)} deg`)
      + row('region', g.regionName || '-')
      + row('crashes / time', `${g.crashes} / ${g.runTime.toFixed(1)} s`);
    const j = this.jumps[0];
    if (j) {
      const L = j.landing;
      this.jump.innerHTML = '<h4>LAST JUMP</h4>'
        + row('TAKEOFF', `${j.timing.toUpperCase()} ${j.offsetMs !== null ? `(${j.offsetMs > 0 ? '+' : ''}${j.offsetMs} ms)` : ''}`, cls(j.timing, 'perfect', 'early'))
        + row('POP', `${j.pop.toUpperCase()} (${j.popVel} m/s)`, cls(j.pop, 'huge', 'good'))
        + row('takeoff speed', `${j.speed} m/s`)
        + (L ? row('LANDING', L.quality.toUpperCase(), L.quality === 'perfect' ? 'good' : L.quality === 'crash' ? 'bad' : 'mid')
          + row('air time', `${L.airTime} s`)
          + row('landing angle (pitch/roll/yaw err)', `${L.pitchErrDeg} / ${L.rollErrDeg} / ${L.yawErrDeg} deg`)
          + row('landing impact', `${L.impactVel} m/s, ${L.impactG} g, bottom-out ${L.bottomOut}`)
          + row('readiness / max balance', `${L.readiness} / ${L.maxBalance}`)
          + row('speed kept', `${Math.round(L.speedKeep * 100)} %`) : row('LANDING', '...'));
      this.hist.innerHTML = '<h4>RECENT</h4>' + this.jumps.map((r) => `<div>${r.timing} / ${r.pop} ${r.popVel} / ${r.landing ? r.landing.quality : '-'} ${r.landing ? r.landing.airTime + 's' : ''}</div>`).join('');
    }
    this.drawPlot(sk, T);
  }

  drawPlot(sk, T) {
    const c = this.plot;
    const W = 310;
    const H = 90;
    c.clearRect(0, 0, W, H);
    const h = sk.hist;
    const n = Math.min(h.n, 480);
    const y = (L) => H - 6 - ((L - T.legMin) / (T.legMax - T.legMin)) * (H - 12);
    const series = (arr, color) => {
      c.strokeStyle = color;
      c.beginPath();
      for (let k = 0; k < n; k++) {
        const j = (h.i - n + k + 512) % 512;
        const px = (k / 480) * W;
        if (k === 0) c.moveTo(px, y(arr[j]));
        else c.lineTo(px, y(arr[j]));
      }
      c.stroke();
    };
    for (let k = 0; k < n; k++) {
      const j = (h.i - n + k + 512) % 512;
      const px = (k / 480) * W;
      if (h.g[j]) {
        c.fillStyle = 'rgba(120,240,120,0.25)';
        c.fillRect(px, H - 4, W / 480 + 0.5, 4);
      }
      const f = Math.min(1, h.F[j] / (T.mass * T.gravity * 5));
      c.fillStyle = 'rgba(255,100,100,0.5)';
      c.fillRect(px, 0, W / 480 + 0.5, f * 10);
    }
    series(h.Lt, '#fa6');
    series(h.L, '#7fd');
  }
}
