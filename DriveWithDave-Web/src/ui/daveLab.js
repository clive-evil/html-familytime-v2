// The Dave half of the F1 lab: live trait / tuning sliders, presets, mode toggles.
import { TRAITS, PROFILES } from '../dave/profiles.js';

const TUNING = [
  ['COMMAND URGENCY ×', 'urgencyMultiplier', 0, 2.5, 0.05],
  ['STRESS BUILD-UP ×', 'stressBuild', 0, 3, 0.05],
  ['STRESS RECOVERY ×', 'stressRecovery', 0, 4, 0.05],
  ['VOICE CONFIDENCE MIN', 'voiceThreshold', 0, 0.95, 0.05],
  ['DRIVING AGGRESSION ×', 'aggression', 0.5, 1.6, 0.05],
  ['SAFETY OVERRIDE', 'safetyOverride', 0, 1.5, 0.05],
];

export class DaveLab {
  constructor(labEl, api) {
    this.api = api; // { get(): daveCfg, set(cfg, key), dave(): Dave }
    const wrap = document.createElement('div');
    wrap.id = 'daveLab';
    labEl.insertBefore(wrap, labEl.children[2] || null);
    this.el = wrap;
    this.inputs = {};
    this.build();
  }
  build() {
    const el = this.el;
    const h = (t) => { const e = document.createElement('h3'); e.textContent = t; el.appendChild(e); };
    h('DAVE');
    const sel = (label, key, opts) => {
      const row = document.createElement('div'); row.className = 'row';
      const l = document.createElement('label'); l.textContent = label;
      const s = document.createElement('select');
      for (const [v, t] of opts) { const o = document.createElement('option'); o.value = String(v); o.textContent = t; s.appendChild(o); }
      s.onchange = () => { const v = s.value === 'true' ? true : s.value === 'false' ? false : s.value; this.api.set({ ...this.api.get(), [key]: v }, key); s.blur(); };
      row.append(l, s); el.appendChild(row); this.inputs[key] = { s };
    };
    sel('CONTROL MODE', 'controlMode', [['dave', 'DAVE (the game)'], ['direct', 'DIRECT (debug: you drive)']]);
    sel('PASSENGER KNOWS BEST', 'hints', [[true, 'On: you see where to go'], [false, 'Off: nobody knows']]);
    sel('DAVE VOICE', 'voiceOut', [['mumble', 'Mumble + subtitles'], ['tts', 'Browser speech + subtitles'], ['off', 'Subtitles only']]);
    const pb = document.createElement('div'); pb.className = 'btns';
    for (const [k, label] of [['learner', 'LEARNER'], ['nervous', 'NERVOUS'], ['cocky', 'COCKY'], ['oldhand', 'COMPETENT']]) {
      const b = document.createElement('button'); b.textContent = label; b.onclick = () => this.api.preset(k); pb.appendChild(b);
      this.inputs['p_' + k] = { b };
    }
    el.appendChild(pb);
    const slider = (label, key, min, max, step, group) => {
      const row = document.createElement('div'); row.className = 'row';
      const l = document.createElement('label'); l.textContent = label;
      const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step;
      const v = document.createElement('span'); v.className = 'val';
      r.oninput = () => {
        v.textContent = (+r.value).toFixed(step < 1 ? 2 : 0);
        const cfg = this.api.get();
        this.api.set({ ...cfg, [group]: { ...cfg[group], [key]: +r.value } }, group);
      };
      r.onchange = () => r.blur();
      row.append(l, r, v); el.appendChild(row); this.inputs[group + '.' + key] = { r, v, step };
    };
    for (const [k, label] of TRAITS) slider(label.toUpperCase(), k, 0, 100, 1, 'traits');
    h('DAVE TUNING');
    for (const [label, k, min, max, step] of TUNING) slider(label, k, min, max, step, 'tuning');
    h('DAVE LIVE');
    this.diag = document.createElement('div'); this.diag.className = 'diag';
    el.appendChild(this.diag);
  }
  refresh() {
    const c = this.api.get();
    for (const k of ['controlMode', 'hints', 'voiceOut']) this.inputs[k].s.value = String(c[k]);
    for (const [k] of TRAITS) { const i = this.inputs['traits.' + k]; i.r.value = c.traits[k]; i.v.textContent = c.traits[k]; }
    for (const [, k, , , step] of TUNING) { const i = this.inputs['tuning.' + k]; i.r.value = c.tuning[k]; i.v.textContent = (+c.tuning[k]).toFixed(step < 1 ? 2 : 0); }
    for (const k of Object.keys(PROFILES)) this.inputs['p_' + k].b.classList.toggle('on', c.profile === k);
  }
  update(dave) {
    if (!dave) return;
    const s = dave.snapshot();
    const rows = [
      ['Mode', s.mode + (s.hold ? ` (hold: ${s.hold})` : '')], ['Intent', s.intent || '—'],
      ['Stress', s.stress.toFixed(2)], ['Urgency', s.urgency.toFixed(2)], ['Panic effect', s.panic.toFixed(2)],
      ['Target speed', `${(s.vt ?? 0).toFixed(1)} m/s`], ['Free road', s.free > 90 ? 'clear' : `${s.free.toFixed(1)} m`],
      ['Reaction now', `${dave.reactionDelay(0).toFixed(2)} s`], ['Notices at', `${dave.noticeDist.toFixed(0)} m`],
      ['Memory', `${dave.memoryTime.toFixed(0)} s`], ['Cruise', `${dave.cruise.toFixed(1)} m/s`],
      ['Commands', dave.tel.commands], ['Refused', dave.tel.refused],
    ];
    this.diag.innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
  }
}
