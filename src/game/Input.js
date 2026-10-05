// Keyboard + mouse input collected into an action snapshot. The rest of the
// game reads *actions* (interact, secondary, build...) rather than keys, so
// touch / gamepad / Roblox bindings can feed the same snapshot later.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.lmb = false;
    this.lmbPressed = false;
    this.rmbPressed = false;
    this.dragging = false;
    this.locked = false;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.code;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['Space', 'Tab', 'KeyB', 'F3'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.lmb = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.lmb = true; this.lmbPressed = true; }
      if (e.button === 2) { this.rmbPressed = true; this.dragging = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.dragging = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    if (this.canvas.requestPointerLock && !this.locked) {
      try {
        const r = this.canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch (_) { /* not available (headless) */ }
    }
  }

  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }

  // Movement axis in camera space: x = strafe, y = forward.
  moveAxis() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, y };
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.lmbPressed = false;
    this.rmbPressed = false;
  }
}
