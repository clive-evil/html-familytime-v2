// Paints the whole town's ground (tarmac, kerbs, paving, grass, road markings)
// into one large canvas, classified with the same signed-distance function the
// physics uses, so what you see is where the kerb actually is.

import { KERB_H } from '../world/layout.js';
import { offsetPolyline, resample, rng } from '../sim/math.js';

export const GROUND = { x0: -100, x1: 160, z0: -130, z1: 290, W: 2048, H: 4096 };

export function paintGround(world) {
  const G = GROUND;
  const cv = document.createElement('canvas');
  cv.width = G.W; cv.height = G.H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(G.W, G.H);
  const d = img.data;
  const sx = (G.x1 - G.x0) / G.W, sz = (G.z1 - G.z0) / G.H;
  const R = rng(99);
  const col = (s, x, z) => {
    if (s < 0) return [74, 75, 78];          // tarmac
    if (s < 0.2) return [158, 157, 150];     // kerb stones
    if (s < 2.4) return [139, 136, 128];     // paving
    return [93, 112, 70];                    // grass / gardens
  };
  const B = 8;
  for (let by = 0; by < G.H; by += B) {
    for (let bx = 0; bx < G.W; bx += B) {
      const x0 = G.x0 + bx * sx, z0 = G.z0 + by * sz;
      const x1 = x0 + B * sx, z1 = z0 + B * sz;
      const c = [world.sd(x0, z0), world.sd(x1, z0), world.sd(x0, z1), world.sd(x1, z1)];
      const cls = (s) => (s < 0 ? 0 : s < 0.2 ? 1 : s < 2.4 ? 2 : 3);
      const k0 = cls(c[0]);
      const uniform = c.every((s) => cls(s) === k0) && c.every((s) => Math.abs(s) > 0.6 && Math.abs(s - 2.4) > 0.6);
      for (let y = by; y < by + B; y++) {
        for (let x = bx; x < bx + B; x++) {
          const wx = G.x0 + (x + 0.5) * sx, wz = G.z0 + (y + 0.5) * sz;
          const s = uniform ? c[0] : world.sd(wx, wz);
          let [r, g, b] = col(s, wx, wz);
          const n = (R() - 0.5) * (s < 0 ? 16 : s < 2.4 ? 10 : 22);
          // paving slab joints
          if (s > 0.2 && s < 2.4 && (Math.abs(((wx % 0.9) + 0.9) % 0.9) < 0.04 || Math.abs(((wz % 0.9) + 0.9) % 0.9) < 0.04)) { r -= 14; g -= 14; b -= 14; }
          const i = (y * G.W + x) * 4;
          d[i] = r + n; d[i + 1] = g + n; d[i + 2] = b + n; d[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // ---------------------------------------------------------------- markings
  const px = (x) => (x - G.x0) / sx, pz = (z) => (z - G.z0) / sz;
  ctx.lineCap = 'butt';
  const line = (pts, w, color, dash = null) => {
    ctx.strokeStyle = color; ctx.lineWidth = w / sx; ctx.setLineDash(dash ? dash.map((v) => v / sz) : []);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), pz(p[1])) : ctx.moveTo(px(p[0]), pz(p[1]))));
    ctx.stroke();
  };
  const WHITE = 'rgba(232,232,226,0.92)', YEL = 'rgba(214,180,60,0.9)';
  // centre lines
  const cl = resample(world.millHill, 0.5).pts.filter((p) => !(Math.abs(p[0]) < 9 && Math.abs(p[1]) < 9) && p[1] < 243);
  line(cl, 0.12, WHITE, [3, 6]);
  line([[-44, 250], [61, 250]], 0.12, WHITE, [3, 6]);
  line([[79, 250], [144, 250]], 0.12, WHITE, [3, 6]);
  line([[0, -50], [0, -8]], 0.12, WHITE, [3, 6]);
  // hazard-ish longer dashes on the hill approach to the give way
  // give way (double dashed) and stop lines
  const across = (z, x0, x1, kind) => {
    if (kind === 'giveway') {
      line([[x0, z], [x1, z]], 0.2, WHITE, [0.6, 0.3]);
      line([[x0, z - 0.45], [x1, z - 0.45]], 0.2, WHITE, [0.6, 0.3]);
    } else line([[x0, z], [x1, z]], 0.3, WHITE);
  };
  across(world.junction1.stopZ, 0, world.junction1.laneX1, 'giveway');
  across(world.topJunction.stopZ, world.topJunction.laneX0, world.topJunction.laneX1, 'giveway');
  across(world.giveWay.stopZ, world.giveWay.laneX0, world.giveWay.laneX1, 'giveway');
  across(world.lights.stopZ, world.lights.laneX0, world.lights.laneX1, 'stop');
  across(world.yardLine.z, world.yardLine.x0, world.yardLine.x1, 'stop');
  // give way triangle before the hill give way
  const tri = (cx, cz, flip) => {
    ctx.fillStyle = WHITE; ctx.beginPath();
    ctx.moveTo(px(cx - 0.6), pz(cz)); ctx.lineTo(px(cx + 0.6), pz(cz)); ctx.lineTo(px(cx), pz(cz + (flip ? 2.6 : -2.6))); ctx.closePath(); ctx.fill();
  };
  tri(world.giveWay.laneX0 + 1.9, world.giveWay.stopZ - 7, false);
  tri(world.topJunction.laneX0 + 1.9, world.topJunction.stopZ - 7, false);
  tri(1.7, world.junction1.stopZ - 7, false);
  // road text (reads correctly to a driver heading +z)
  const roadText = (text, x, z, h = 2.6) => {
    ctx.save();
    ctx.translate(px(x), pz(z));
    ctx.scale(-1, -1);
    ctx.fillStyle = WHITE;
    ctx.font = `bold ${Math.round(0.9 / sx)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.scale(1, h / 0.9 * sx / sz);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  roadText('SLOW', world.lights.laneX0 + 1.9, 36);
  roadText('STOP', world.lights.laneX0 + 1.9, world.lights.stopZ - 6.5);
  // car park bays
  for (const side of [-1, 1]) {
    for (let z = -110; z <= -54; z += 3) line([[side * 21.5, z], [side * 28, z]], 0.1, WHITE);
  }
  // yellow lines near junctions
  const yel = (pts, off) => {
    const o = offsetPolyline(pts, off);
    line(o, 0.1, YEL); line(offsetPolyline(pts, off - 0.18 * Math.sign(off)), 0.1, YEL);
  };
  const near = (pts, f) => resample(pts, 0.5).pts.filter(f);
  const mill = world.millHill;
  yel(near(mill, (p) => p[0] > -18 && p[0] < -6 && p[1] < 1), 3.8 - 0.25);
  yel(near(mill, (p) => p[0] > 6 && p[0] < 18 && p[1] < 1), 3.8 - 0.25);
  yel(near(mill, (p) => p[0] > -16 && p[0] < 16 && p[1] < 1), -(3.8 - 0.25));
  yel(near(mill, (p) => p[1] > 228 && p[1] < 244), 3.8 - 0.25);
  yel(near(mill, (p) => p[1] > 228 && p[1] < 244), -(3.8 - 0.25));
  // driveway: block paving tint
  const nd = world.nanDrive;
  ctx.fillStyle = 'rgba(120,96,80,0.55)';
  ctx.fillRect(px(nd.cx - nd.hx), pz(world.parkSpace.kerbZ + 0.25), (nd.hx * 2) / sx, (nd.cz + nd.hz - world.parkSpace.kerbZ - 0.25) / sz);
  void KERB_H;
  return cv;
}

// ------------------------------------------------------------------ dashboard
export class Cluster {
  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.width = 512; this.cv.height = 200;
    this.ctx = this.cv.getContext('2d');
  }
  dial(cx, cy, r, v, max, majors, label, red) {
    const c = this.ctx;
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    c.fillStyle = '#0d0f10'; c.beginPath(); c.arc(cx, cy, r + 6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3a3c3d'; c.lineWidth = 2; c.stroke();
    for (let i = 0; i <= majors; i++) {
      const t = i / majors, a = a0 + (a1 - a0) * t;
      const isRed = red && t * max >= red;
      c.strokeStyle = isRed ? '#c0392b' : '#d8d6cc'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke();
      c.fillStyle = isRed ? '#c0392b' : '#d8d6cc'; c.font = '15px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(Math.round((t * max) / (label === 'RPM' ? 1000 : 1))), cx + Math.cos(a) * (r - 27), cy + Math.sin(a) * (r - 27));
    }
    c.fillStyle = '#8f8d86'; c.font = '11px Arial'; c.fillText(label === 'RPM' ? 'x1000 r/min' : 'MPH', cx, cy + r * 0.45);
    const t = Math.max(0, Math.min(1.02, v / max));
    const a = a0 + (a1 - a0) * t;
    c.strokeStyle = '#e8743b'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10); c.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); c.stroke();
    c.fillStyle = '#222'; c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
  }
  draw(s) {
    const c = this.ctx;
    c.fillStyle = '#151718'; c.fillRect(0, 0, 512, 200);
    this.dial(130, 102, 86, Math.max(0, s.rpm), 7000, 7, 'RPM', 6000);
    this.dial(382, 102, 86, s.mph, 100, 10, 'MPH');
    // warning lights
    const lamp = (x, y, on, color, text) => {
      c.fillStyle = on ? color : '#26282a';
      c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill();
      c.fillStyle = on ? '#111' : '#3a3c3e'; c.font = 'bold 10px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, x, y + 0.5);
    };
    const ign = s.ignitionOn && !s.running;
    lamp(232, 22, ign, '#e0312b', '+-');
    lamp(256, 22, ign, '#e0312b', 'OIL');
    lamp(280, 22, s.handbrake > 0.5 && (s.ignitionOn || s.running), '#e0312b', '!');
    lamp(232, 182, s.clutchHot, '#e8a33b', 'CL');
    lamp(280, 182, s.ignitionOn || s.running, '#3bbf5c', 'ON');
    // fuel & temp bars
    c.fillStyle = '#8f8d86'; c.font = '10px Arial'; c.textAlign = 'center';
    c.fillText('E   F', 256, 120);
    c.fillStyle = '#d8d6cc'; c.fillRect(238, 128, 36 * 0.4, 4);
  }
}
