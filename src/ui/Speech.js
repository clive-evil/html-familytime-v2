import * as THREE from 'three';
import { LINES } from '../data/lines.js';

export function pickLine(key) {
  const arr = LINES[key] || LINES.idle;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Speech bubbles and floating numbers, positioned by projecting world points.
// Small pooled DOM: at most a handful are visible at once.
const MAX_BUBBLES = 4;
const _v = new THREE.Vector3();

export class Speech {
  constructor(layer) {
    this.layer = layer;
    this.bubbles = [];
    this.floaties = [];
  }

  say(grandmaId, text, time, dur = 2.8) {
    // One bubble per Grandma; replace oldest if full.
    const existing = this.bubbles.find((b) => b.id === grandmaId);
    if (existing) { existing.el.textContent = text; existing.until = time + dur; return; }
    if (this.bubbles.length >= MAX_BUBBLES) { const old = this.bubbles.shift(); old.el.remove(); }
    const el = document.createElement('div');
    el.className = 'speech';
    el.textContent = text;
    this.layer.appendChild(el);
    this.bubbles.push({ id: grandmaId, el, until: time + dur });
  }

  floaty(text, x, y, z, time, color = '#fff') {
    if (this.floaties.length > 14) { const o = this.floaties.shift(); o.el.remove(); }
    const el = document.createElement('div');
    el.className = 'floaty';
    el.textContent = text;
    el.style.color = color;
    this.layer.appendChild(el);
    this.floaties.push({ el, x, y, z, t0: time });
  }

  update(sim, camera, time, w, h) {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const g = sim.getGrandma(b.id);
      if (!g || time > b.until || g.inside) { b.el.remove(); this.bubbles.splice(i, 1); continue; }
      _v.set(g.x, 1.55 * g.scale * (g.adult ? 1 : 0.7) + 0.35, g.z).project(camera);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      b.el.style.display = vis ? '' : 'none';
      if (vis) b.el.style.transform = `translate(-50%, -100%) translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px)`;
      b.el.style.left = '0'; b.el.style.top = '0';
    }
    for (let i = this.floaties.length - 1; i >= 0; i--) {
      const f = this.floaties[i];
      const k = time - f.t0;
      if (k > 1.0) { f.el.remove(); this.floaties.splice(i, 1); continue; }
      _v.set(f.x, f.y + k * 1.2, f.z).project(camera);
      f.el.style.left = '0'; f.el.style.top = '0';
      f.el.style.opacity = String(1 - k);
      f.el.style.transform = `translate(-50%, -100%) translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px)`;
    }
  }

  clear() {
    for (const b of this.bubbles) b.el.remove();
    for (const f of this.floaties) f.el.remove();
    this.bubbles = []; this.floaties = [];
  }
}
