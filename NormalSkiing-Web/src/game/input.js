// Mouse + keyboard. The mouse (pointer-locked) moves a posture point inside
// [-1,1]^2: y = crouch(-)/extend(+), x = weight left(-)/right(+).
// Deltas are integrated, so the posture is "where you put your body", Foddy
// style. Without pointer lock (e.g. automated tests) absolute position is used.

import { clamp } from '../sim/math.js';

export class Input {
  constructor(canvas, tune) {
    this.canvas = canvas;
    this.T = tune;
    this.keys = new Set();
    this.px = 0;
    this.py = 0;
    this.locked = false;
    this.pressed = [];
    this.override = null; // tests can drive input directly
    this.lastMove = 0;
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.push(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked && !this.absolute) {
        // screen up = forward/extend
        this.px = clamp(this.px + e.movementX * this.T.mouseSensX, -1, 1);
        this.py = clamp(this.py - e.movementY * this.T.mouseSensY, -1, 1);
      } else if (this.absolute) {
        const r = canvas.getBoundingClientRect();
        this.px = clamp(((e.clientX - r.left) / r.width - 0.5) * 2.4, -1, 1);
        this.py = clamp(-((e.clientY - r.top) / r.height - 0.5) * 2.4, -1, 1);
      }
      this.lastMove = performance.now();
    });
    canvas.addEventListener('click', () => this.lock());
  }

  lock() {
    if (this.absolute) return;
    if (!this.locked && this.canvas.requestPointerLock) {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        /* headless */
      }
    }
  }

  consume() {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }

  frame(dt) {
    // gentle lateral recentre so weight shifts are temporary
    if (this.T.recenterX > 0) this.px *= Math.exp(-this.T.recenterX * dt);
    if (this.T.recenterY > 0) this.py *= Math.exp(-this.T.recenterY * dt);
  }

  state() {
    if (this.override) return this.override;
    const k = this.keys;
    return {
      steer: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      tuck: k.has('KeyW') || k.has('ArrowUp') ? 1 : 0,
      brake: k.has('KeyS') || k.has('ArrowDown') ? 1 : 0,
      px: this.px,
      py: this.py,
    };
  }

  resetPosture() {
    this.px = 0;
    this.py = 0;
  }
}
