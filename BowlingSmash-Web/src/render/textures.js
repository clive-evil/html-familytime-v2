// Procedurally generated canvas textures (no external art assets).
import * as THREE from 'three';

const cache = new Map();
function canvas(w, h, draw, key, opts = {}) {
  if (key && cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (key) cache.set(key, t);
  return t;
}

function noise(g, w, h, alpha, n = 1800, dark = true) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = dark ? `rgba(0,0,0,${Math.random() * alpha})` : `rgba(255,255,255,${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export function floorTexture(kind, color) {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    if (kind === 'lane') {
      // maple boards
      const n = 16;
      for (let i = 0; i < n; i++) {
        const l = 0.92 + ((i * 37) % 11) / 100;
        g.fillStyle = `rgba(${150 * l | 0},${95 * l | 0},${40 * l | 0},0.18)`;
        g.fillRect((i * w) / n, 0, w / n, h);
        g.fillStyle = 'rgba(80,40,10,0.25)';
        g.fillRect((i * w) / n, 0, 1.5, h);
      }
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = 'rgba(120,70,20,0.08)';
        g.beginPath();
        const x = Math.random() * w;
        g.moveTo(x, 0); g.bezierCurveTo(x + 8, h * 0.3, x - 8, h * 0.6, x + 4, h); g.stroke();
      }
    } else if (kind === 'tiles') {
      const s = 64;
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
        g.fillStyle = ((x + y) / s) % 2 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)';
        g.fillRect(x, y, s, s);
        g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.strokeRect(x, y, s, s);
      }
      noise(g, w, h, 0.05, 1200);
    } else if (kind === 'carpet') {
      noise(g, w, h, 0.12, 9000);
      noise(g, w, h, 0.08, 6000, false);
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3;
      for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y <= h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    } else if (kind === 'concrete') {
      noise(g, w, h, 0.1, 7000);
      noise(g, w, h, 0.06, 3000, false);
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
      for (let x = 0; x <= w; x += 256) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y <= h; y += 256) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let i = 0; i < 6; i++) {
        g.fillStyle = 'rgba(70,60,50,0.07)';
        g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 20 + Math.random() * 50, 0, 7); g.fill();
      }
    } else if (kind === 'paving') {
      const s = 64;
      for (let y = 0; y < h; y += s / 2) for (let x = -s; x < w; x += s) {
        const off = ((y / (s / 2)) % 2) * (s / 2);
        const l = 0.9 + Math.random() * 0.15;
        g.fillStyle = `rgba(${(200 * l) | 0},${(185 * l) | 0},${(170 * l) | 0},0.35)`;
        g.fillRect(x + off + 1, y + 1, s - 2, s / 2 - 2);
      }
      noise(g, w, h, 0.06, 2000);
    }
  }, `floor:${kind}:${color}`, { repeat: true });
}

export function laneArrows() {
  return canvas(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(90,40,120,0.55)';
    for (let i = 0; i < 5; i++) {
      const x = 28 + i * 50, y = 120 + Math.abs(i - 2) * 22;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 10, y + 26); g.lineTo(x + 10, y + 26); g.fill();
    }
  }, 'lanearrows');
}

export function woodTexture(base = '#c98a4b', key = 'wood') {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = `rgba(90,50,20,${0.08 + Math.random() * 0.12})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3); g.stroke();
    }
  }, key, { repeat: true });
}

export function crateTexture() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#d39a55'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#c88d4a' : '#d9a463';
      g.fillRect(0, (i * h) / 4, w, h / 4 - 3);
      g.fillStyle = 'rgba(80,40,10,0.35)'; g.fillRect(0, ((i + 1) * h) / 4 - 3, w, 3);
    }
    g.strokeStyle = '#8a5523'; g.lineWidth = 22; g.strokeRect(11, 11, w - 22, h - 22);
    g.beginPath(); g.moveTo(20, 20); g.lineTo(w - 20, h - 20); g.stroke();
    g.fillStyle = '#5b5b5b';
    for (const [x, y] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  }, 'crate');
}

export function cardboardTexture() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#d2a56d'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 0.06, 1500);
    g.fillStyle = 'rgba(240,225,190,0.85)'; g.fillRect(w / 2 - 22, 0, 44, h);
    g.fillStyle = 'rgba(120,80,40,0.5)'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
    g.fillText('⬆ ⬆', w / 2, h * 0.75);
  }, 'cardboard');
}

export function labelTexture(color, key) {
  return canvas(256, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, h * 0.38, w, h * 0.24);
    g.fillStyle = color; g.font = 'bold 26px sans-serif'; g.textAlign = 'center';
    g.fillText('YUM', w / 4, h * 0.57); g.fillText('YUM', (3 * w) / 4, h * 0.57);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 6, w, 6); g.fillRect(0, h - 12, w, 6);
  }, `label:${key || color}`);
}

export function hazardTexture(a = '#222', b = '#ffc21a', key = 'hazard') {
  return canvas(256, 64, (g, w, h) => {
    g.fillStyle = b; g.fillRect(0, 0, w, h);
    g.fillStyle = a;
    for (let x = -h; x < w + h; x += 48) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x + 24 - h, h); g.lineTo(x - h, h); g.fill();
    }
  }, key, { repeat: true });
}

export function ballTexture(c1 = '#2b2bff', c2 = '#ff3fa4') {
  return canvas(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.18})`;
      g.lineWidth = 2 + Math.random() * 10;
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 140, w * 0.7, y + (Math.random() - 0.5) * 140, w, y);
      g.stroke();
    }
    // finger holes
    g.fillStyle = '#0a0a18';
    for (const [x, y, r] of [[w * 0.25, h * 0.32, 13], [w * 0.25 + 30, h * 0.32 + 6, 13], [w * 0.25 + 14, h * 0.32 + 44, 15]]) {
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, `ball:${c1}:${c2}`);
}

export function markerTexture() {
  return canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.moveTo(64, 116); g.lineTo(26, 58); g.lineTo(102, 58); g.fill();
    g.fillStyle = '#ff3366';
    g.beginPath(); g.moveTo(64, 108); g.lineTo(24, 50); g.lineTo(104, 50); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(64, 108); g.lineTo(24, 50); g.lineTo(104, 50); g.closePath(); g.stroke();
  }, 'marker');
}

export function softDot() {
  return canvas(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }, 'softdot');
}

export function skyTexture(top, bottom) {
  return canvas(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, `sky:${top}:${bottom}`);
}
