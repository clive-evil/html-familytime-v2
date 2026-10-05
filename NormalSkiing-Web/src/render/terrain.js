// Terrain rendering: one coarse mesh for the whole mountain (the vista) plus
// LOD chunks around the skier, built progressively from world.height().

import * as THREE from 'three';
import { fbm, clamp, smoothstep } from '../sim/math.js';

const CHUNK = 64;
const LODS = [
  { res: 1, radius: 1.6 },
  { res: 2, radius: 3.0 },
  { res: 4, radius: 5.2 },
];

export class TerrainView {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: snowTexture() });
    this.farMat = new THREE.MeshLambertMaterial({
      vertexColors: true, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4,
    });
    this.chunks = new Map();
    this.buildFar();
  }

  dispose() {
    for (const c of this.chunks.values()) {
      this.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    this.chunks.clear();
    if (this.far) {
      this.scene.remove(this.far);
      this.far.geometry.dispose();
    }
  }

  color(x, z, h, ny, out, far = false) {
    const w = this.world;
    const hw = w.halfWidth(z);
    const dx = Math.abs(x - w.corridorCenter(z)) / hw;
    let r = 0.94;
    let g = 0.965;
    let b = 1.0;
    // subtle snow texture
    const nz = fbm(x * 0.08, z * 0.08, 2) * 0.03;
    r += nz;
    g += nz;
    b += nz * 0.5;
    const surf = w.surfaceZone ? w.surfaceZone(x, z, h) : null;
    if (surf) {
      if (surf.name === 'ice') { r = 0.68; g = 0.86; b = 0.95; const c = fbm(x * 0.3, z * 0.3, 2); if (c > 0.35) { r -= 0.2; g -= 0.15; b -= 0.1; } }
      else if (surf.name === 'road') { r = 0.8; g = 0.82; b = 0.86; }
      else if (surf.name === 'powder') { r = 1; g = 1; b = 1; }
      else if (surf.name === 'debris') { r = 0.9; g = 0.92; b = 0.96; }
      else if (surf.name === 'rock') { r = 0.33; g = 0.34; b = 0.37; }
      else if (surf.name === 'water') { r = 0.12; g = 0.2; b = 0.28; }
    }
    // rock on steep faces
    const rock = 1 - smoothstep(0.55, 0.72, ny);
    if (rock > 0) {
      const rn = 0.3 + fbm(x * 0.15, z * 0.15, 2) * 0.06;
      r = r * (1 - rock) + rn * rock;
      g = g * (1 - rock) + (rn + 0.01) * rock;
      b = b * (1 - rock) + (rn + 0.04) * rock;
    }
    // forests on the distant slopes (far mesh only)
    if (far && dx > 1.05) {
      const f = smoothstep(1.05, 1.4, dx) * clamp((fbm(x * 0.01, z * 0.01, 3) + 0.3) * 1.6, 0, 1);
      const elev = h < (w.treeLine ?? 1e9) ? 1 : 0;
      const k = f * elev * 0.75;
      r = r * (1 - k) + 0.16 * k;
      g = g * (1 - k) + 0.26 * k;
      b = b * (1 - k) + 0.22 * k;
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
  }

  buildFar() {
    const w = this.world;
    const res = 14;
    const z0 = -400;
    const z1 = w.length + 900;
    const span = 1700;
    const nz = Math.ceil((z1 - z0) / res) + 1;
    const nx = Math.ceil((span * 2) / res) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const tmp = [0, 0, 0];
    for (let j = 0; j < nz; j++) {
      const z = z0 + j * res;
      const cx = w.corridorCenter(Math.min(Math.max(z, 0), w.length));
      for (let i = 0; i < nx; i++) {
        const x = cx - span + i * res;
        const h = w.height(x, z) - 0.6;
        const k = (j * nx + i) * 3;
        pos[k] = x;
        pos[k + 1] = h;
        pos[k + 2] = z;
        const n = w.normal(x, z, res * 0.5);
        this.color(x, z, h, n.y, tmp, true);
        col[k] = tmp[0];
        col[k + 1] = tmp[1];
        col[k + 2] = tmp[2];
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(gridIndex(nx, nz));
    geo.computeVertexNormals();
    this.far = new THREE.Mesh(geo, this.farMat);
    this.far.receiveShadow = false;
    this.scene.add(this.far);
  }

  buildChunk(cx, cz, lod) {
    const w = this.world;
    const res = LODS[lod].res;
    const n = CHUNK / res + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const tmp = [0, 0, 0];
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    // heights with a 1-cell border for normals
    const m = n + 2;
    const H = new Float32Array(m * m);
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) H[j * m + i] = w.height(x0 + (i - 1) * res, z0 + (j - 1) * res);
    }
    const nrm = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = (j * n + i) * 3;
        const h = H[(j + 1) * m + i + 1];
        const x = x0 + i * res;
        const z = z0 + j * res;
        pos[k] = x;
        pos[k + 1] = h;
        pos[k + 2] = z;
        uv[(j * n + i) * 2] = x / 9;
        uv[(j * n + i) * 2 + 1] = z / 9;
        const hx = H[(j + 1) * m + i + 2] - H[(j + 1) * m + i];
        const hz = H[(j + 2) * m + i + 1] - H[j * m + i + 1];
        let nx = -hx;
        let ny = 2 * res;
        let nz = -hz;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        nrm[k] = nx;
        nrm[k + 1] = ny;
        nrm[k + 2] = nz;
        this.color(x, z, h, ny, tmp);
        col[k] = tmp[0];
        col[k + 1] = tmp[1];
        col[k + 2] = tmp[2];
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(gridIndex(n, n));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.receiveShadow = lod === 0;
    return mesh;
  }

  // Rebuild everything near (e.g. after a dynamic terrain change).
  invalidate(x, z, r) {
    for (const [key, c] of this.chunks) {
      const cx = (c.cx + 0.5) * CHUNK;
      const cz = (c.cz + 0.5) * CHUNK;
      if (Math.abs(cx - x) < r + CHUNK && Math.abs(cz - z) < r + CHUNK) c.dirty = true;
    }
  }

  update(px, pz, fwdX, fwdZ, budget = 2) {
    // centre the window ahead of the skier (we mostly look downhill)
    const ax = px + fwdX * 60;
    const az = pz + fwdZ * 60;
    const ccx = Math.floor(ax / CHUNK);
    const ccz = Math.floor(az / CHUNK);
    const R = Math.ceil(LODS[LODS.length - 1].radius);
    const want = new Map();
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const mx = (cx + 0.5) * CHUNK;
        const mz = (cz + 0.5) * CHUNK;
        const d = Math.hypot(mx - px, mz - pz) / CHUNK;
        let lod = -1;
        for (let l = 0; l < LODS.length; l++) {
          if (d <= LODS[l].radius) {
            lod = l;
            break;
          }
        }
        if (lod < 0) continue;
        const wc = this.world.corridorCenter(Math.max(0, Math.min(mz, this.world.length)));
        if (Math.abs(mx - wc) > this.world.halfWidth(Math.max(0, mz)) * 2.4 + CHUNK) continue;
        want.set(cx + ',' + cz, { cx, cz, lod, d });
      }
    }
    // remove
    for (const [key, c] of this.chunks) {
      if (!want.has(key)) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    }
    // build / rebuild (closest first)
    const todo = [];
    for (const [key, wnt] of want) {
      const c = this.chunks.get(key);
      if (!c || c.lod !== wnt.lod || c.dirty) todo.push([key, wnt]);
    }
    todo.sort((a, b) => a[1].d - b[1].d);
    let built = 0;
    for (const [key, wnt] of todo) {
      if (built >= budget) break;
      const old = this.chunks.get(key);
      const mesh = this.buildChunk(wnt.cx, wnt.cz, wnt.lod);
      this.scene.add(mesh);
      if (old) {
        this.scene.remove(old.mesh);
        old.mesh.geometry.dispose();
      }
      this.chunks.set(key, { cx: wnt.cx, cz: wnt.cz, lod: wnt.lod, mesh });
      built++;
    }
    return todo.length - built;
  }
}

// Subtle wind-blown snow: soft blotches + fine streaks along the fall line.
// Gives the eye something to track at speed and makes rollers readable.
function snowTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * 4;
      const v = (y / S) * 4;
      // tileable value noise via fbm on a torus-ish wrap
      const n1 = fbm(Math.cos(u * 1.5708) * 3 + 7, Math.sin(v * 1.5708) * 3 + x * 0.04, 3);
      const streak = Math.sin((x * 0.9 + Math.sin(y * 0.05) * 6) * 0.35) * 0.5 + 0.5;
      let k = 236 + n1 * 14 + streak * 5 + (Math.random() < 0.004 ? 15 : 0);
      k = Math.max(205, Math.min(255, k));
      const i = (y * S + x) * 4;
      d[i] = k - 3;
      d[i + 1] = k - 1;
      d[i + 2] = Math.min(255, k + 4);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function gridIndex(nx, nz) {
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  return new THREE.BufferAttribute(idx, 1);
}
