// Static scenery: trees (instanced), buildings, vehicles/boxes, logs, decor
// (signs, lift towers, flags), distant forests and peaks.

import * as THREE from 'three';
import { mulberry32, fbm } from '../sim/math.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function treeGeometry() {
  // trunk + three stacked cones, vertex coloured, height 1 (scaled per tree)
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 0.25, 6);
  trunk.translate(0, 0.125, 0);
  parts.push([trunk, new THREE.Color(0x4a3222)]);
  const tiers = [[0.3, 0.2, 0.45], [0.24, 0.42, 0.4], [0.16, 0.64, 0.36]];
  for (const [r, y, h] of tiers) {
    const c = new THREE.ConeGeometry(r, h, 7);
    c.translate(0, y + h / 2, 0);
    parts.push([c, new THREE.Color(0x1f4a35)]);
  }
  const snow = new THREE.ConeGeometry(0.1, 0.16, 7);
  snow.translate(0, 0.9, 0);
  parts.push([snow, new THREE.Color(0xf2f6fa)]);
  return merge(parts);
}

export function merge(parts) {
  let count = 0;
  for (const [g] of parts) count += g.toNonIndexed().attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const [g0, c] of parts) {
    const g = g0.toNonIndexed();
    g.computeVertexNormals();
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    pos.set(p, o * 3);
    nor.set(n, o * 3);
    for (let i = 0; i < p.length / 3; i++) {
      col[(o + i) * 3] = c.r;
      col[(o + i) * 3 + 1] = c.g;
      col[(o + i) * 3 + 2] = c.b;
    }
    o += p.length / 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export class PropsView {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildTrees();
    this.buildProps();
    this.buildDecor();
    this.buildPeaks();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => o.geometry && o.geometry.dispose());
  }

  buildTrees() {
    const w = this.world;
    const geo = treeGeometry();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const all = [];
    for (const t of w.trees) all.push({ x: t.x, z: t.z, y: t.baseY, h: t.h, r: t.r, ref: t });
    // decorative forest on the corridor walls and distant slopes
    const rnd = mulberry32(99);
    const zEnd = w.length + 300;
    for (let z = -150; z < zEnd; z += 5) {
      const cx = w.corridorCenter(Math.max(0, Math.min(z, w.length)));
      const hw = w.halfWidth(Math.max(0, Math.min(z, w.length)));
      for (let k = 0; k < 4; k++) {
        const side = rnd() < 0.5 ? -1 : 1;
        const d = hw * (1.05 + rnd() * 1.6);
        const x = cx + side * d;
        const y = w.height(x, z);
        if (w.treeLine !== undefined && y > w.treeLine + rnd() * 80) continue;
        if (fbm(x * 0.01, z * 0.01, 2) < -0.25) continue;
        const n = w.normal(x, z, 2);
        if (n.y < 0.75) continue;
        all.push({ x, z: z + rnd() * 5, y: y - 0.3, h: 9 + rnd() * 9, r: 0.4 });
      }
    }
    const mesh = new THREE.InstancedMesh(geo, mat, all.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const eul = new THREE.Euler();
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      const h = t.h;
      eul.set(0, (i * 2.399) % 6.28, 0);
      q.setFromEuler(eul);
      s.set(h * 0.9 * (0.8 + ((i * 7) % 5) * 0.08), h, h * 0.9 * (0.8 + ((i * 3) % 5) * 0.08));
      p.set(t.x, t.y - 0.2, t.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (t.ref) t.ref.instance = i;
    }
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.trees = mesh;
    this.treeList = all;
  }

  // hide/show a collidable tree (e.g. the falling-tree event takes it over)
  setTreeVisible(ref, vis) {
    if (ref.instance === undefined) return;
    const m = new THREE.Matrix4();
    this.trees.getMatrixAt(ref.instance, m);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    m.decompose(p, q, s);
    if (!vis) s.set(0.0001, 0.0001, 0.0001);
    else s.set(ref.h * 0.9, ref.h, ref.h * 0.9);
    m.compose(p, q, s);
    this.trees.setMatrixAt(ref.instance, m);
    this.trees.instanceMatrix.needsUpdate = true;
  }

  buildProps() {
    // Static props are baked into one vertex-coloured mesh (one draw call);
    // props that move (bridge planks) keep their own meshes.
    const w = this.world;
    const baked = [];
    for (const p of w.props) {
      if (p.noView) continue;
      const mesh = makePropMesh(p);
      if (!mesh) continue;
      if (p.seg !== undefined || p.dynamic) {
        this.group.add(mesh);
        p.mesh = mesh;
        continue;
      }
      mesh.updateMatrixWorld(true);
      mesh.traverse((o) => {
        if (!o.isMesh) return;
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        const col = o.material.color || new THREE.Color(0x888888);
        const n = g.attributes.position.count;
        const ca = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          ca[i * 3] = col.r;
          ca[i * 3 + 1] = col.g;
          ca[i * 3 + 2] = col.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        baked.push(g);
      });
    }
    if (baked.length) {
      const merged = mergeGeometries(baked, false);
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.staticProps = mesh;
    }
  }

  buildDecor() {
    const w = this.world;
    for (const d of w.decor) {
      const obj = makeDecor(d, w);
      if (obj) this.group.add(obj);
    }
  }

  buildPeaks() {
    // ring of big distant peaks so the world has a horizon
    const w = this.world;
    const rnd = mulberry32(5);
    const geo = new THREE.ConeGeometry(1, 1, 6, 3);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 0.5;
      const snow = y > 0.45 || ((i * 13) % 7 === 0 && y > 0.2);
      col[i * 3] = snow ? 0.95 : 0.38;
      col[i * 3 + 1] = snow ? 0.97 : 0.42;
      col[i * 3 + 2] = snow ? 1.0 : 0.48;
      pos.setX(i, pos.getX(i) * (0.85 + ((i * 31) % 10) * 0.03));
      pos.setZ(i, pos.getZ(i) * (0.85 + ((i * 17) % 10) * 0.03));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const n = 46;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -1200 + (i / n) * (w.length + 3500);
      const zc = Math.max(0, Math.min(z, w.length));
      const x = w.corridorCenter(zc) + side * (2200 + rnd() * 1800);
      const base = w.baseHeight(zc) - 400;
      const hgt = 1300 + rnd() * 1500;
      const rad = 900 + rnd() * 700;
      m.compose(new THREE.Vector3(x, base + hgt / 2, z), new THREE.Quaternion(), new THREE.Vector3(rad, hgt, rad));
      mesh.setMatrixAt(i, m);
    }
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }
}

const matCache = new Map();
function lam(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

export function makePropMesh(p) {
  if (p.kind === 'building') {
    const g = new THREE.Group();
    const wallH = p.wallH;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(p.w, wallH + 8, p.d), lam(p.color));
    walls.position.set(p.cx, p.baseY + (wallH - 8) / 2, p.cz);
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);
    // windows (dark strips)
    const win = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.05, 0.9, p.d * 0.7), lam(0x2a3540));
    win.position.set(p.cx, p.baseY + wallH * 0.55, p.cz);
    g.add(win);
    // roof prism (ridge along x)
    const ow = p.w / 2 + 0.6;
    const od = p.d / 2 + 0.6;
    const shape = new THREE.Shape();
    if (p.ridgeAlongX) {
      shape.moveTo(-od, 0);
      shape.lineTo(0, p.roofH);
      shape.lineTo(od, 0);
      shape.lineTo(-od, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: ow * 2, bevelEnabled: false });
      geo.rotateY(Math.PI / 2);
      geo.translate(-ow, 0, 0);
      const roof = new THREE.Mesh(geo, lam(p.roofColor));
      roof.position.set(p.cx, p.baseY + wallH, p.cz);
      roof.castShadow = true;
      roof.receiveShadow = true;
      g.add(roof);
    } else {
      shape.moveTo(-ow, 0);
      shape.lineTo(0, p.roofH);
      shape.lineTo(ow, 0);
      shape.lineTo(-ow, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: od * 2, bevelEnabled: false });
      geo.translate(0, 0, -od);
      const roof = new THREE.Mesh(geo, lam(p.roofColor));
      roof.position.set(p.cx, p.baseY + wallH, p.cz);
      roof.castShadow = true;
      roof.receiveShadow = true;
      g.add(roof);
    }
    return g;
  }
  if (p.kind === 'box') {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(p.w, p.height, p.d);
    const mesh = new THREE.Mesh(geo, lam(p.color || 0x7a8794));
    mesh.position.set(p.cx, p.baseY + p.height / 2, p.cz);
    mesh.rotation.y = p.rot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    if (p.visual === 'car') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(p.w * 0.9, p.height * 0.5, p.d * 0.5), lam(0x30404c));
      cab.position.set(0, p.height * 0.55, -p.d * 0.05);
      mesh.add(cab);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(p.w * 0.95, 0.12, p.d * 0.95), lam(0xf4f7fb));
      cap.position.set(0, p.height / 2 + 0.06, 0);
      mesh.add(cap);
    }
    if (p.visual === 'plank') {
      mesh.material = lam(0x6b4a2c);
    }
    return g;
  }
  if (p.kind === 'log') {
    const a = new THREE.Vector3(p.a.x, p.a.y, p.a.z);
    const b = new THREE.Vector3(p.b.x, p.b.y, p.b.z);
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(p.radius, p.radius, len, 10);
    const mesh = new THREE.Mesh(geo, lam(0x5a3d26));
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    mesh.castShadow = true;
    const snow = new THREE.Mesh(new THREE.CylinderGeometry(p.radius * 0.7, p.radius * 0.7, len * 0.95, 8, 1, false, -0.8, 1.6), lam(0xf4f7fb));
    snow.position.set(p.radius * 0.35, 0, 0);
    mesh.add(snow);
    return mesh;
  }
  return null;
}

function makeDecor(d, w) {
  const g = new THREE.Group();
  if (d.kind === 'sign') {
    const y = w.height(d.x, d.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), lam(0x333333));
    post.position.set(d.x, y + 1.1, d.z);
    g.add(post);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = d.bg || '#ffcf1f';
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#10202e';
    ctx.font = 'bold 30px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.text, 128, 44);
    if (d.text2) {
      ctx.font = '20px Trebuchet MS, sans-serif';
      ctx.fillText(d.text2, 128, 78);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    board.position.set(d.x, y + 2.4, d.z);
    board.rotation.y = Math.PI + (d.rot || 0);
    g.add(board);
    return g;
  }
  if (d.kind === 'flag') {
    const y = w.height(d.x, d.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, d.h || 6, 6), lam(0xdddddd));
    post.position.set(d.x, y + (d.h || 6) / 2, d.z);
    g.add(post);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshLambertMaterial({ color: d.color || 0xff3b1f, side: THREE.DoubleSide }));
    flag.position.set(d.x + 0.8, y + (d.h || 6) - 0.5, d.z);
    g.add(flag);
    return g;
  }
  if (d.kind === 'tower') {
    const y = w.height(d.x, d.z);
    const h = d.h || 12;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h, 8), lam(0x6f7c86));
    t.position.set(d.x, y + h / 2, d.z);
    t.castShadow = true;
    g.add(t);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 0.3), lam(0x6f7c86));
    bar.position.set(d.x, y + h, d.z);
    g.add(bar);
    return g;
  }
  if (d.kind === 'finish') {
    const y = w.height(d.x, d.z);
    const span = d.span || 30;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 7, 8), lam(0xff3b1f));
      post.position.set(d.x + (s * span) / 2, y + 3.5, d.z);
      g.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(span, 1.4, 0.2), lam(0xff3b1f));
    banner.position.set(d.x, y + 6.5, d.z);
    g.add(banner);
    return g;
  }
  if (d.kind === 'beacon') {
    // tall light column visible from the summit
    const y = w.height(d.x, d.z);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 300, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.18, depthWrite: false }));
    col.position.set(d.x, y + 150, d.z);
    g.add(col);
    return g;
  }
  if (d.kind === 'cable') {
    const pts = d.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x222222 })));
    return g;
  }
  if (d.kind === 'mesh' && d.build) return d.build(THREE, w);
  return null;
}
