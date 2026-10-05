import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Small helpers for the hand-made look: wobble vertices, tint, merge.

export function hashNoise(x, y, z, seed = 1) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.13) * 43758.5453;
  return s - Math.floor(s);
}

// Push vertices along their normal a little so primitives look hand-shaped.
// Vertices at the same position move together (no cracks).
export function wobble(geo, amount = 0.04, seed = 1) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = hashNoise(Math.round(v.x * 50), Math.round(v.y * 50), Math.round(v.z * 50), seed) - 0.5;
    const len = v.length() || 1;
    v.multiplyScalar(1 + (n * amount) / len);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Paint a uniform vertex colour (for merged multi-colour props).
export function tint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  geo.applyMatrix4(m);
  return geo;
}

// Merge (non-indexed) geometries that each carry a 'color' attribute.
export function merge(geos) {
  const prepared = geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng.attributes.uv) ng.deleteAttribute('uv');
    if (!ng.attributes.color) tint(ng, 0xffffff);
    return ng;
  });
  return mergeGeometries(prepared, false);
}

// Egg: a lathe with a narrower top.
export function eggGeometry(r = 0.22, h = 0.32, seg = 14) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const a = -Math.PI / 2 + t * Math.PI;
    const k = t > 0.5 ? 0.82 : 1; // narrower top half
    pts.push(new THREE.Vector2(Math.cos(a) * r * k + 0.0001, (Math.sin(a) + 1) * h));
  }
  const geo = new THREE.LatheGeometry(pts, seg);
  // Speckles: vertex colours.
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0xf5ecd8), spot = new THREE.Color(0xd7a6c8), spot2 = new THREE.Color(0xa9c7d8);
  for (let i = 0; i < pos.count; i++) {
    const n = hashNoise(Math.round(pos.getX(i) * 40), Math.round(pos.getY(i) * 40), Math.round(pos.getZ(i) * 40), 3);
    const c = n > 0.88 ? spot : n < 0.06 ? spot2 : base;
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

// Canvas-text texture for signs and dial labels.
export function textTexture(lines, { w = 256, h = 64, bg = '#f3ead2', fg = '#3b2a20', font = 'bold 34px Georgia, serif', border = '#3b2a20' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((l, i) => g.fillText(l, w / 2, (h / (arr.length + 1)) * (i + 1)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const MATS = {};
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!MATS[key]) MATS[key] = new THREE.MeshLambertMaterial({ color, ...opts });
  return MATS[key];
}
export const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
