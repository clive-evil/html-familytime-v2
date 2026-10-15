// The driver's controls: pedals, steering wheel, handbrake lever and gear
// lever. Turns device-agnostic input "intents" into physical control positions
// for the car. Deterministic — the same inputs always give the same result.

import { clamp, approach, wrapAngle, smoothstep } from './math.js';
import { CLUTCH_DIFFICULTY } from './params.js';

export const GEAR_ORDER = [-1, 0, 1, 2, 3, 4, 5];
// H gate: columns x = -1,0,1 ; up (y=+1) / down (y=-1)
export const H_MAP = { '-1': { up: 1, down: 2 }, 0: { up: 3, down: 4 }, 1: { up: 5, down: -1 } };
export const gearName = (g) => (g === -1 ? 'R' : g === 0 ? 'N' : String(g));

export function emptyIntents() {
  return {
    throttle: { analog: 0, digital: false },
    brake: { analog: 0, digital: false },
    clutch: { analog: 0, digital: false, wheel: 0 },
    steer: { axis: 0, keyAxis: 0, keyLeftEdge: false, keyRightEdge: false, stick: null, mouseGrab: false, mouseDx: 0 },
    handbrake: { pressed: false, held: false },
    ignition: false,
    gearUp: false, gearDown: false, gearDirect: null,
    lever: { stick: null, keys: [0, 0], mouse: null },
    horn: false,
  };
}

export class Driver {
  constructor(settings) {
    this.settings = settings;
    this.reset();
  }
  setSettings(s) { this.settings = s; }

  reset() {
    this.throttle = 0; this.brake = 0; this.clutch = 0; this.clutchWheelPos = 0;
    this.steerDeg = 0; this.keySteer = 0;
    this.gesturePrev = null; this.mouseGrabTravel = 0; this.mouseGrabbing = false;
    this.pull = null; this.regrip = 0;
    this.handOnWheel = false;
    this.handbrake = 1; this.handbrakeTarget = 1; // parked with the handbrake on
    this.lever = { x: 0, y: 0, engaged: false, blocked: false };
    this.grindHeld = 0;
    this.shiftTimer = 0; this.autoLocked = false; this.autoRestartT = 0;
    this.ignitionOut = false;
  }

  maxDeg() { return this.settings.steeringTurns * 180; }

  update(dt, I, car) {
    const S = this.settings;
    const A = S.assists;
    // ------------------------------------------------------------ pedals
    const ramp = S.pedalRamp;
    const pedal = (cur, src, up, down) => {
      let digi = src.digital ? approach(cur, 1, up * dt) : approach(cur, 0, down * dt);
      // analogue devices set the pedal directly
      return Math.max(digi, clamp(src.analog || 0, 0, 1));
    };
    this._thrDigi = I.throttle.digital ? approach(this._thrDigi || 0, 1, ramp * dt) : approach(this._thrDigi || 0, 0, ramp * 1.8 * dt);
    this.throttle = Math.max(this._thrDigi, clamp(I.throttle.analog, 0, 1));
    this._brkDigi = I.brake.digital ? approach(this._brkDigi || 0, 1, ramp * 1.2 * dt) : approach(this._brkDigi || 0, 0, ramp * 2.5 * dt);
    this.brake = Math.max(this._brkDigi, clamp(I.brake.analog, 0, 1));
    void pedal;

    // clutch
    if (S.keyboardClutch === 'wheel') this.clutchWheelPos = clamp(this.clutchWheelPos + I.clutch.wheel * 0.04, 0, 1);
    else this.clutchWheelPos = 0;
    const rest = this.clutchWheelPos;
    this._cluDigi = this._cluDigi ?? 0;
    if (I.clutch.digital) this._cluDigi = approach(this._cluDigi, 1, S.clutchPressSpeed * dt);
    else this._cluDigi = approach(this._cluDigi, rest, S.clutchReturnSpeed * dt);
    if (S.keyboardClutch === 'wheel' && !I.clutch.digital && I.clutch.wheel) this._cluDigi = rest;
    this.clutch = Math.max(this._cluDigi, clamp(I.clutch.analog, 0, 1));

    // ------------------------------------------------------------ steering
    this.updateSteering(dt, I.steer, car);

    // ------------------------------------------------------------ handbrake
    if (S.handbrakeMode === 'hold') {
      const t = I.handbrake.held ? 1 : 0;
      if (t !== this.handbrakeTarget) car.emit(t ? 'handbrakeOn' : 'handbrakeOff');
      this.handbrakeTarget = t;
    } else if (I.handbrake.pressed) {
      this.handbrakeTarget = this.handbrakeTarget > 0.5 ? 0 : 1;
      car.emit(this.handbrakeTarget ? 'handbrakeOn' : 'handbrakeOff');
    }
    this.handbrake = approach(this.handbrake, this.handbrakeTarget, dt * 7);

    // ------------------------------------------------------------ assists: clutch
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    let clutchOut = this.clutch;
    if (A.autoClutch) clutchOut = this.autoClutch(car);

    // ------------------------------------------------------------ gears
    if (S.gearbox === 'hpattern') this.updateHPattern(dt, I.lever, car, clutchOut);
    else this.updateButtons(I, car, clutchOut);
    if (A.autoGear) this.autoGear(car);
    if (A.autoClutch) clutchOut = this.autoClutch(car);

    // ------------------------------------------------------------ ignition / auto restart
    let ign = I.ignition;
    if (A.autoRestart && !car.running && car.ignitionOn && car.sinceStall < 5) {
      this.autoRestartT += dt;
      if (this.autoRestartT > 0.6) { ign = true; clutchOut = 1; }
    } else this.autoRestartT = 0;

    this.clutchOut = clutchOut;
    return {
      throttle: this.throttle,
      brake: this.brake,
      clutch: clutchOut,
      handbrake: this.handbrake,
      steerDeg: this.steerDeg,
      ignition: ign,
    };
  }

  // ---------------------------------------------------------------- steering
  updateSteering(dt, st, car) {
    const S = this.settings;
    const max = this.maxDeg();
    let hands = false;
    const speed = Math.abs(car.fwdSpeed);
    if (S.steeringMode === 'analogue') {
      // the stick (or ramped keys) sets a target wheel angle; the wheel winds
      // towards it at a fast but finite rate.
      this.keySteer = st.keyAxis ? approach(this.keySteer, st.keyAxis, dt * 2.2) : approach(this.keySteer, 0, dt * 3.5);
      const axis = Math.abs(st.axis) > Math.abs(this.keySteer) ? st.axis : this.keySteer;
      const target = axis * max;
      const rate = S.steeringSpeed * 2.5;
      this.steerDeg = approach(this.steerDeg, target, rate * dt);
      hands = true; // the stick position *is* the wheel position
    } else if (S.steeringMode === 'physical') {
      const axis = Math.abs(st.axis) > 0.02 ? st.axis : st.keyAxis;
      if (Math.abs(axis) > 0.02) {
        this.steerDeg += axis * S.steeringSpeed * dt;
        hands = true;
      }
    } else {
      // hand-over-hand / gesture
      // stick: rotate the stick around its rim to turn the wheel
      if (st.stick && Math.hypot(st.stick[0], st.stick[1]) > 0.55) {
        const ang = Math.atan2(st.stick[0], -st.stick[1]); // clockwise from up
        if (this.gesturePrev !== null) {
          let d = wrapAngle(ang - this.gesturePrev) * (180 / Math.PI);
          const lim = 900 * dt;
          d = clamp(d, -lim, lim);
          this.steerDeg += d;
        }
        this.gesturePrev = ang;
        hands = true;
      } else this.gesturePrev = null;
      // mouse: drag while holding the left button; one grab = limited travel
      if (st.mouseGrab) {
        if (!this.mouseGrabbing) { this.mouseGrabbing = true; this.mouseGrabTravel = 0; }
        let d = st.mouseDx * 0.45 * S.mouseSensitivity;
        const left = 150 - Math.abs(this.mouseGrabTravel);
        if (Math.sign(d) === Math.sign(this.mouseGrabTravel) || this.mouseGrabTravel === 0) d = clamp(d, -left, left);
        this.mouseGrabTravel += d;
        this.steerDeg += d;
        hands = true;
      } else this.mouseGrabbing = false;
      // keys: each press = one hand-over-hand pull (holding repeats)
      this.regrip = Math.max(0, this.regrip - dt);
      if (this.pull) {
        const step = Math.min(this.pull.left, (110 / 0.22) * dt);
        this.steerDeg += step * this.pull.dir;
        this.pull.left -= step;
        hands = true;
        if (this.pull.left <= 0) { this.pull = null; this.regrip = 0.12; }
      } else {
        const edge = st.keyLeftEdge ? -1 : st.keyRightEdge ? 1 : 0;
        const held = st.keyAxis;
        if (edge || (held && this.regrip <= 0)) this.pull = { dir: edge || Math.sign(held), left: 110 };
        if (held) hands = true;
      }
    }
    // self-centring (caster) + optional return assist, only with hands off
    if (!hands) {
      let rate = 0;
      if (S.selfCentring === 'weak') rate = Math.min(14 * speed, 110);
      else if (S.selfCentring === 'normal') rate = Math.min(50 * speed, 420);
      if (S.assists.steeringReturn) rate = Math.max(rate, 360);
      this.steerDeg = approach(this.steerDeg, 0, rate * dt);
    }
    this.steerDeg = clamp(this.steerDeg, -max, max);
    this.handOnWheel = hands;
  }

  // ---------------------------------------------------------------- gears: buttons
  selectGear(car, target, clutch) {
    if (target === car.gear) return;
    if (target === 0) { car.setGear(0); return; }
    if (car.canEngage(target, clutch)) car.setGear(target);
    else {
      car.setGear(0);
      car.emit('grind', 1, { gear: target });
      this.grindHeld = 0.35;
    }
  }

  updateButtons(I, car, clutch) {
    this.grindHeld = Math.max(0, this.grindHeld - 1 / 60);
    let target = null;
    const idx = GEAR_ORDER.indexOf(car.gear);
    if (I.gearUp) target = GEAR_ORDER[Math.min(idx + 1, GEAR_ORDER.length - 1)];
    if (I.gearDown) target = GEAR_ORDER[Math.max(idx - 1, 0)];
    if (I.gearDirect !== null && I.gearDirect !== undefined) target = I.gearDirect;
    if (target !== null) this.selectGear(car, target, clutch);
    // keep the visual lever in sync
    const pos = { '-1': [1, -1], 0: [0, 0], 1: [-1, 1], 2: [-1, -1], 3: [0, 1], 4: [0, -1], 5: [1, 1] }[car.gear];
    this.lever.x = approach(this.lever.x, pos[0], 0.25);
    this.lever.y = approach(this.lever.y, pos[1], 0.25);
    this.lever.engaged = car.gear !== 0;
  }

  // ---------------------------------------------------------------- gears: H pattern
  updateHPattern(dt, L, car, clutch) {
    const lv = this.lever;
    let dx = 0, dy = 0, hand = false;
    if (L.stick && Math.hypot(L.stick[0], L.stick[1]) > 0.3) {
      const tx = clamp(L.stick[0] * 1.35, -1, 1), ty = clamp(-L.stick[1] * 1.35, -1, 1);
      const sp = 9 * dt;
      dx = clamp(tx - lv.x, -sp, sp); dy = clamp(ty - lv.y, -sp, sp);
      // pushing into a gate end: keep pushing so blocked engagement grinds
      if (Math.abs(ty) >= 0.99) dy = Math.sign(ty) * sp;
      hand = true;
    }
    if (L.keys[0] || L.keys[1]) { dx += L.keys[0] * 3.6 * dt; dy += L.keys[1] * 3.6 * dt; hand = true; }
    if (L.mouse && (L.mouse[0] || L.mouse[1])) { dx += L.mouse[0] * 0.0055 * this.settings.mouseSensitivity; dy += -L.mouse[1] * 0.0055 * this.settings.mouseSensitivity; hand = true; }
    if (L.mouseHeld) hand = true;

    const pushingY = dy;
    const N = 4;
    for (let i = 0; i < N; i++) {
      const sx = dx / N, sy = dy / N;
      if (Math.abs(lv.y) < 0.15) {
        lv.x = clamp(lv.x + sx, -1, 1);
        if (sy !== 0) {
          const col = Math.round(lv.x);
          if (Math.abs(lv.x - col) < 0.24) { lv.x = col; lv.y += sy; }
          else lv.y = clamp(lv.y + sy, -0.12, 0.12);
        }
      } else {
        lv.x = Math.round(lv.x);
        lv.y = clamp(lv.y + sy, -1, 1);
      }
      if (lv.engaged) {
        if (Math.abs(lv.y) < 0.6) { lv.engaged = false; car.setGear(0); }
      } else if (Math.abs(lv.y) > 0.85) {
        const g = H_MAP[Math.round(lv.x)][lv.y > 0 ? 'up' : 'down'];
        if (car.canEngage(g, clutch)) { lv.engaged = true; lv.blocked = false; car.setGear(g); }
        else {
          lv.y = Math.sign(lv.y) * 0.84;
          if (!lv.blocked) { car.emit('grind', 1, { gear: g }); lv.blocked = true; }
        }
      }
    }
    // grinding continues while you keep shoving it at a gate that won't go
    const intoGate = lv.blocked && Math.abs(lv.y) > 0.7 && Math.sign(pushingY) === Math.sign(lv.y) && Math.abs(pushingY) > 0;
    this.grindHeld = intoGate ? 0.12 : Math.max(0, this.grindHeld - dt);
    if (lv.blocked && Math.abs(lv.y) < 0.6) lv.blocked = false;
    if (!hand && !lv.engaged) {
      // spring back to the 3/4 neutral plane
      lv.y = approach(lv.y, 0, 6 * dt);
      if (Math.abs(lv.y) < 0.15) lv.x = approach(lv.x, 0, 4 * dt);
      lv.blocked = false;
    }
    this.leverHand = hand;
  }

  // ---------------------------------------------------------------- assists
  autoClutch(car) {
    const S = this.settings;
    const diff = CLUTCH_DIFFICULTY[S.clutchDifficulty] || CLUTCH_DIFFICULTY.normal;
    void diff;
    const bite = S.bitePoint, w = S.biteWidth;
    if (this.shiftTimer > 0 || car.gear === 0) return 1;
    const rpm = car.rpm;
    if (!car.running) return 1;
    if (this.autoLocked && rpm < 1000) this.autoLocked = false;
    if (!this.autoLocked && rpm > 1150 && Math.abs(car.clutchSlip) < 12) this.autoLocked = true;
    if (this.autoLocked) return 0;
    if (this.brake > 0.1 && Math.abs(car.fwdSpeed) < 2) return 1;
    const f = smoothstep(1000, 1600 + 900 * this.throttle, rpm);
    return clamp(bite + w / 2 - f * w * 1.1, 0, 1);
  }

  autoGear(car) {
    if (!car.running) return;
    const rpm = car.rpm;
    const g = car.gear;
    let t = null;
    if (g === 0 && this.throttle > 0.1) t = 1;
    else if (g > 0 && g < 5 && rpm > 3100) t = g + 1;
    else if (g > 1 && rpm < 1350) t = g - 1;
    if (t !== null) {
      car.setGear(t);
      this.shiftTimer = 0.3;
      this.autoLocked = false;
      const pos = { 1: [-1, 1], 2: [-1, -1], 3: [0, 1], 4: [0, -1], 5: [1, 1] }[t];
      this.lever.x = pos[0]; this.lever.y = pos[1]; this.lever.engaged = true;
    }
  }
}
