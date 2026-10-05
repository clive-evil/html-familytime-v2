// Keyboard + mouse + gamepad → device-agnostic "intents" (see sim/driver.js).
// A touch layer could later write into the same structure.

import { emptyIntents } from '../sim/driver.js';

const DZ = 0.12;
const dz = (v) => (Math.abs(v) < DZ ? 0 : Math.sign(v) * (Math.abs(v) - DZ) / (1 - DZ));

export const LAYOUTS = {
  A: {
    name: 'A — WASD',
    throttle: ['KeyW'], brake: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    clutch: ['Space'], handbrake: ['ShiftLeft', 'ShiftRight'], ignition: ['KeyI'],
    gearUp: ['KeyE'], gearDown: ['KeyQ'],
    leverUp: ['ArrowUp'], leverDown: ['ArrowDown'], leverLeft: ['ArrowLeft'], leverRight: ['ArrowRight'],
    horn: ['KeyH'], camera: ['KeyC'], glanceL: ['KeyZ'], glanceR: ['KeyX'],
  },
  B: {
    name: 'B — Arrows',
    throttle: ['ArrowUp'], brake: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    clutch: ['KeyZ'], handbrake: ['KeyX'], ignition: ['Enter'],
    gearUp: ['KeyS'], gearDown: ['KeyA'],
    leverUp: ['KeyI'], leverDown: ['KeyK'], leverLeft: ['KeyJ'], leverRight: ['KeyL'],
    horn: ['KeyH'], camera: ['KeyC'], glanceL: ['KeyQ'], glanceR: ['KeyW'],
  },
};

export class Input {
  constructor(canvas, getSettings) {
    this.canvas = canvas;
    this.getSettings = getSettings;
    this.down = new Set();
    this.pressed = new Set(); // edges this frame
    this.mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false, locked: false };
    this.look = { yaw: 0, pitch: 0 };
    this.gamepadIndex = null;
    this.padPrev = [];
    this.leverToggle = false; // controller: hand on the gearstick
    this.leverIdle = 0;
    this.lastDevice = 'keyboard';
    this.onUiKey = null;
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
        if (e.code !== 'Backquote' && e.code !== 'F1') return;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.lastDevice = 'keyboard';
      if (this.onUiKey && !e.repeat) this.onUiKey(e.code, e);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.left = this.mouse.right = false; });
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      if (!this.mouse.locked && c.requestPointerLock) { try { c.requestPointerLock(); } catch { /* ignore */ } }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.mouse.locked = document.pointerLockElement === c; });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouse.locked && !this.mouse.left && !this.mouse.right) return;
      this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0;
      this.lastDevice = 'keyboard';
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.mouse.wheel += Math.sign(e.deltaY); }, { passive: false });
    window.addEventListener('gamepadconnected', (e) => { this.gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = null; });
  }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!pads) return null;
    if (this.gamepadIndex !== null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
    for (const p of pads) if (p && p.connected !== false) { this.gamepadIndex = p.index; return p; }
    return null;
  }

  any(codes) { return codes.some((c) => this.down.has(c)); }
  edge(codes) { return codes.some((c) => this.pressed.has(c)); }

  // Build this frame's intents. Also returns ui actions (camera, debug, horn).
  poll(dt) {
    const S = this.getSettings();
    const K = LAYOUTS[S.keyboardLayout] || LAYOUTS.A;
    const I = emptyIntents();
    const ui = { camera: false, debug: false, glance: 0, lookDX: 0, lookDY: 0, padLook: null };

    // ------------------------------------------------ keyboard
    I.throttle.digital = this.any(K.throttle);
    I.brake.digital = this.any(K.brake);
    I.clutch.digital = this.any(K.clutch);
    I.clutch.wheel = this.mouse.wheel;
    const l = this.any(K.left), r = this.any(K.right);
    I.steer.keyAxis = (r ? 1 : 0) - (l ? 1 : 0);
    I.steer.keyLeftEdge = this.edge(K.left); I.steer.keyRightEdge = this.edge(K.right);
    I.handbrake.pressed = this.edge(K.handbrake); I.handbrake.held = this.any(K.handbrake);
    I.ignition = this.any(K.ignition);
    I.gearUp = this.edge(K.gearUp); I.gearDown = this.edge(K.gearDown);
    const digits = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, KeyR: -1, KeyN: 0, Digit0: 0 };
    for (const [code, g] of Object.entries(digits)) if (this.pressed.has(code)) I.gearDirect = g;
    I.lever.keys = [
      (this.any(K.leverRight) ? 1 : 0) - (this.any(K.leverLeft) ? 1 : 0),
      (this.any(K.leverUp) ? 1 : 0) - (this.any(K.leverDown) ? 1 : 0),
    ];
    I.horn = this.any(K.horn);
    ui.camera = this.edge(K.camera);
    ui.debug = this.edge(['F1', 'Backquote']);
    ui.glance = (this.any(K.glanceL) ? 1 : 0) - (this.any(K.glanceR) ? 1 : 0);

    // ------------------------------------------------ mouse
    const gestureMode = S.steeringMode === 'gesture';
    if (this.mouse.right && S.gearbox === 'hpattern') {
      I.lever.mouse = [this.mouse.dx, this.mouse.dy];
      I.lever.mouseHeld = true;
    } else if (this.mouse.left && gestureMode) {
      I.steer.mouseGrab = true; I.steer.mouseDx = this.mouse.dx;
    } else {
      ui.lookDX = this.mouse.dx; ui.lookDY = this.mouse.dy;
    }
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;

    // ------------------------------------------------ gamepad (standard mapping)
    const p = this.pad();
    this.padConnected = !!p;
    if (p) {
      const b = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
      const bp = (i) => b(i) > 0.5;
      const be = (i) => bp(i) && !this.padPrev[i];
      const ax = (i) => p.axes[i] || 0;
      const lx = dz(ax(0)), ly = dz(ax(1)), rx = dz(ax(2)), ry = dz(ax(3));
      const rt = b(7), lt = b(6);
      if (rt > 0.02 || lt > 0.02 || Math.abs(lx) > 0 || bp(0)) this.lastDevice = 'gamepad';
      I.throttle.analog = Math.max(I.throttle.analog, rt);
      I.clutch.analog = Math.max(I.clutch.analog, lt);
      if (bp(4)) I.brake.digital = true; // LB: ramped digital brake
      if (be(5)) I.handbrake.pressed = true;
      if (bp(5)) I.handbrake.held = true;
      if (bp(0)) I.ignition = true; // A: hold to crank / press to switch off
      if (bp(1)) I.horn = true;
      I.steer.axis = lx;
      I.steer.stick = [ax(0), ax(1)];
      if (S.gearbox === 'button') {
        if (be(3)) I.gearUp = true;
        if (be(2)) I.gearDown = true;
      }
      // H-pattern: R3 toggles "hand on gearstick", or hold D-pad left
      if (be(11)) this.leverToggle = !this.leverToggle;
      const leverHand = S.gearbox === 'hpattern' && (this.leverToggle || bp(14));
      if (leverHand) {
        I.lever.stick = [ax(2), ax(3)];
        const mag = Math.hypot(ax(2), ax(3));
        this.leverIdle = mag < 0.3 ? this.leverIdle + dt : 0;
        if (this.leverToggle && this.leverIdle > 1.6) this.leverToggle = false;
      } else {
        ui.padLook = [rx, ry];
      }
      this.leverHandPad = leverHand;
      if (be(8) || be(12)) ui.camera = true;
      if (be(9)) ui.debug = true;
      this.padPrev = p.buttons.map((x) => x.pressed || x.value > 0.5);
    }
    this.pressed.clear();
    return { I, ui };
  }
}
