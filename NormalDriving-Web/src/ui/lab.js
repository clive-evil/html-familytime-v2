// DEBUG / LAB panel (F1 or `). Everything here exists to compare control schemes.
import { PRESETS, CLUTCH_DIFFICULTY } from '../sim/params.js';
import { gearName } from '../sim/driver.js';
import { LAYOUTS } from '../input/input.js';

const SELECTS = [
  ['CAMERA', 'camera', [['first', 'First person'], ['third', 'Third person (chase)']]],
  ['STEERING MODE', 'steeringMode', [['analogue', 'Standard analogue'], ['physical', 'Slow physical wheel'], ['gesture', 'Hand-over-hand / gesture']]],
  ['SELF CENTRING', 'selfCentring', [['none', 'None'], ['weak', 'Weak'], ['normal', 'Normal']]],
  ['CLUTCH DIFFICULTY', 'clutchDifficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['brutal', 'Brutal']]],
  ['GEARBOX', 'gearbox', [['button', 'Button shift'], ['hpattern', 'H-pattern']]],
  ['TRAFFIC PRESSURE', 'traffic', [['off', 'Off'], ['light', 'Light']]],
  ['LOOK REQUIREMENT', 'lookRequirement', [[false, 'Off'], [true, 'On (junctions)']]],
  ['HANDBRAKE', 'handbrakeMode', [['toggle', 'Toggle (ratchet)'], ['hold', 'Hold']]],
  ['KEYBOARD LAYOUT', 'keyboardLayout', Object.entries(LAYOUTS).map(([k, v]) => [k, v.name])],
  ['KEYBOARD CLUTCH', 'keyboardClutch', [['ramp', 'Ramp (hold key)'], ['wheel', 'Mouse wheel position']]],
  ['PEDESTRIAN', 'pedestrian', [[true, 'On'], [false, 'Off']]],
  ['HUD READOUT', 'showReadout', [[false, 'Off'], [true, 'On']]],
  ['GATE DIAGRAM', 'showGate', [[true, 'On'], [false, 'Off']]],
];

const SLIDERS = [
  ['STEERING SPEED', 'steeringSpeed', 150, 1000, 10, (v) => `${v}°/s`],
  ['STEERING LOCK', 'steeringTurns', 1.5, 4, 0.1, (v) => `${v.toFixed(1)} t`],
  ['CLUTCH BITE POINT', 'bitePoint', 0.3, 0.75, 0.01, (v) => `${Math.round(v * 100)}%`],
  ['CLUTCH BITE WIDTH', 'biteWidth', 0.06, 0.45, 0.01, (v) => `${Math.round(v * 100)}%`],
  ['CLUTCH RETURN SPEED', 'clutchReturnSpeed', 0.4, 5, 0.1, (v) => v.toFixed(1)],
  ['CLUTCH PRESS SPEED', 'clutchPressSpeed', 0.6, 6, 0.1, (v) => v.toFixed(1)],
  ['STALL SENSITIVITY', 'stallSensitivity', 0, 1, 0.05, (v) => v.toFixed(2)],
  ['ENGINE TORQUE', 'engineTorque', 0.5, 2, 0.05, (v) => `${v.toFixed(2)}x`],
  ['HILL STEEPNESS', 'hillSteepness', 0.3, 1.6, 0.05, (v) => `${(v * 16).toFixed(0)}%`],
  ['HANDBRAKE STRENGTH', 'handbrakeStrength', 0.3, 1.6, 0.05, (v) => `${v.toFixed(2)}x`],
  ['KEY PEDAL RAMP', 'pedalRamp', 0.6, 6, 0.1, (v) => v.toFixed(1)],
  ['MOUSE SENSITIVITY', 'mouseSensitivity', 0.3, 3, 0.1, (v) => v.toFixed(1)],
];

const ASSISTS = [['autoRestart', 'Auto restart'], ['autoClutch', 'Auto clutch'], ['autoGear', 'Auto gear'], ['steeringReturn', 'Steering return assist']];

export class Lab {
  constructor(el, { getSettings, setSettings, actions }) {
    this.el = el;
    this.getSettings = getSettings;
    this.setSettings = setSettings;
    this.actions = actions;
    this.inputs = {};
    this.build();
  }

  toggle(force) {
    const open = force ?? !this.el.classList.contains('open');
    this.el.classList.toggle('open', open);
    if (open && document.pointerLockElement) document.exitPointerLock();
    this.refresh();
  }
  get open() { return this.el.classList.contains('open'); }

  change(key, value) {
    const s = { ...this.getSettings(), [key]: value, preset: 'custom' };
    if (key === 'clutchDifficulty') s.biteWidth = CLUTCH_DIFFICULTY[value].biteWidth;
    this.setSettings(s, key);
    this.refresh();
  }

  build() {
    const el = this.el;
    el.innerHTML = '';
    const h = (t) => { const e = document.createElement('h3'); e.textContent = t; el.appendChild(e); };
    const note = (t) => { const e = document.createElement('div'); e.className = 'note'; e.textContent = t; el.appendChild(e); };
    h('DEBUG / LAB');
    note('F1 or ` toggles this panel. Changes apply immediately and are remembered.');
    h('PRESETS');
    const pb = document.createElement('div'); pb.className = 'btns';
    this.presetBtns = {};
    for (const [k, p] of Object.entries(PRESETS)) {
      const b = document.createElement('button'); b.textContent = p.label;
      b.onclick = () => this.actions.preset(k);
      pb.appendChild(b); this.presetBtns[k] = b;
    }
    el.appendChild(pb);
    h('ACTIONS');
    const ab = document.createElement('div'); ab.className = 'btns';
    for (const [label, fn] of [['RESET CAR', 'resetCar'], ['RESET TO BOTTOM OF HILL', 'resetHill'], ['RESET ROUTE', 'resetRoute'], ['TELEPORT TO PARKING TEST', 'teleportParking']]) {
      const b = document.createElement('button'); b.textContent = label; b.onclick = () => this.actions[fn]();
      ab.appendChild(b);
    }
    el.appendChild(ab);
    h('SETUP');
    for (const [label, key, opts] of SELECTS) {
      const row = document.createElement('div'); row.className = 'row';
      const l = document.createElement('label'); l.textContent = label;
      const sel = document.createElement('select');
      for (const [v, t] of opts) { const o = document.createElement('option'); o.value = String(v); o.textContent = t; sel.appendChild(o); }
      sel.onchange = () => {
        const raw = sel.value;
        this.change(key, raw === 'true' ? true : raw === 'false' ? false : raw);
        sel.blur();
      };
      row.append(l, sel); el.appendChild(row);
      this.inputs[key] = { sel };
    }
    h('TUNING');
    for (const [label, key, min, max, step, fmt] of SLIDERS) {
      const row = document.createElement('div'); row.className = 'row';
      const l = document.createElement('label'); l.textContent = label;
      const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step;
      const v = document.createElement('span'); v.className = 'val';
      r.oninput = () => { v.textContent = fmt(+r.value); if (key !== 'hillSteepness') this.change(key, +r.value); };
      r.onchange = () => { this.change(key, +r.value); r.blur(); };
      row.append(l, r, v); el.appendChild(row);
      this.inputs[key] = { r, v, fmt };
    }
    h('ASSISTS');
    for (const [k, label] of ASSISTS) {
      const row = document.createElement('label'); row.className = 'chk';
      const c = document.createElement('input'); c.type = 'checkbox';
      c.onchange = () => {
        const s = this.getSettings();
        this.setSettings({ ...s, assists: { ...s.assists, [k]: c.checked }, preset: 'custom' }, 'assists');
        c.blur();
      };
      row.append(c, document.createTextNode(label)); el.appendChild(row);
      this.inputs['assist_' + k] = { c };
    }
    h('LIVE');
    this.diag = document.createElement('div'); this.diag.className = 'diag';
    el.appendChild(this.diag);
    h('CONTROLS');
    const ctl = document.createElement('div'); ctl.className = 'note';
    ctl.id = 'labControls';
    el.appendChild(ctl);
    this.ctlNote = ctl;
  }

  refresh() {
    const s = this.getSettings();
    for (const [, key] of SELECTS) this.inputs[key].sel.value = String(s[key]);
    for (const [, key] of SLIDERS) { const i = this.inputs[key]; i.r.value = s[key]; i.v.textContent = i.fmt(s[key]); }
    for (const [k] of ASSISTS) this.inputs['assist_' + k].c.checked = !!s.assists[k];
    for (const [k, b] of Object.entries(this.presetBtns)) b.classList.toggle('on', s.preset === k);
    const L = LAYOUTS[s.keyboardLayout] || LAYOUTS.A;
    const n = (a) => a.map((c) => c.replace('Key', '').replace('Digit', '').replace('Left', '').replace('Right', '')).join('/');
    this.ctlNote.innerHTML = `Keyboard (${L.name}): ${n(L.throttle)} throttle · ${n(L.brake)} brake · ${n(L.left)}/${n(L.right)} steer · ${n(L.clutch)} clutch · ${n(L.handbrake)} handbrake · ${n(L.ignition)} ignition · ${n(L.gearDown)}/${n(L.gearUp)} gear −/+ · 1–5, R, N direct · ${n(L.leverUp)}${n(L.leverLeft)}${n(L.leverDown)}${n(L.leverRight)} H-lever · ${n(L.horn)} horn · ${n(L.camera)} camera · ${n(L.glanceL)}/${n(L.glanceR)} glance<br>Mouse: look · LMB-drag steers (gesture mode) · RMB-drag moves the H lever · wheel = clutch (wheel mode)<br>Pad: RT throttle · LT clutch · LB brake · RB handbrake · LS steer · RS look · A ignition · Y/X gear +/− · R3 or hold D-pad ← = hand on H lever (RS moves it) · B horn · Back camera · Start lab`;
  }

  update(car, driver, extra) {
    if (!this.open) return;
    const rows = [
      ['Speed', `${(Math.abs(car.fwdSpeed) * 2.237).toFixed(1)} mph${car.fwdSpeed < -0.05 ? ' (back)' : ''}`],
      ['Gear', gearName(car.gear)],
      ['RPM', car.rpm.toFixed(0)],
      ['Clutch pedal', `${Math.round(driver.clutchOut * 100)}%`],
      ['Clutch engagement', `${Math.round((car.clutchCapFrac || 0) * 100)}%`],
      ['Clutch torque', `${Math.abs(car.clutchTorque).toFixed(0)} Nm`],
      ['Throttle', `${Math.round(driver.throttle * 100)}%`],
      ['Brake', `${Math.round(driver.brake * 100)}%`],
      ['Handbrake', driver.handbrake > 0.5 ? 'ON' : 'off'],
      ['Steering wheel', `${driver.steerDeg.toFixed(0)}°`],
      ['Road wheels', `${(car.roadAngle || 0).toFixed(1)}°`],
      ['Slope', `${(car.groundSlopeFwd * 100).toFixed(1)}%`],
      ['Engine', car.running ? 'running' : car.cranking ? 'cranking' : car.ignitionOn ? 'stalled / ign on' : 'off'],
      ['Clutch temp', `${car.clutchTemp.toFixed(0)}°C${car.clutchHot ? ' HOT' : ''}`],
      ['Wheelspin', `${car.slipF.toFixed(2)} m/s`],
      ['Load F/R', `${(car.Nf / 9.81).toFixed(0)}/${(car.Nr / 9.81).toFixed(0)} kg`],
      ['Look yaw', `${((extra.lookYaw || 0) * 57.3).toFixed(0)}°`],
      ['Input', extra.device],
      ['FPS', extra.fps.toFixed(0)],
    ];
    this.diag.innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
  }
}
