// Geometry helpers: coloured boxes/prisms merged into single meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export function colorize(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function strip(geo) {
  // keep only position/normal/color so everything merges
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

export class Batch {
  constructor() { this.parts = []; }
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale) {
    const g = geo.clone();
    tmpE.set(rot[0], rot[1], rot[2], 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(new THREE.Vector3(...pos), tmpQ, scale ? new THREE.Vector3(...scale) : new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(tmpM);
    colorize(g, color);
    this.parts.push(strip(g));
    return this;
  }
  box(w, h, d, color, pos, rot) { return this.add(new THREE.BoxGeometry(w, h, d), color, pos, rot); }
  addMatrix(geo, color, m) {
    const g = geo.clone(); g.applyMatrix4(m); colorize(g, color); this.parts.push(strip(g)); return this;
  }
  build(material) {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    g.computeBoundingSphere();
    return material ? new THREE.Mesh(g, material) : g;
  }
}

// hexahedron from 8 corners: bottom 4 (ccw from above) then top 4
export function hexa(b, t) {
  const p = [...b, ...t];
  const faces = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const pos = [];
  for (const [a, bq, c, d] of faces) {
    pos.push(...p[a], ...p[bq], ...p[c], ...p[a], ...p[c], ...p[d]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// triangular prism roof: width along x, depth along z, ridge along x
export function roofGeo(w, d, h, overhang = 0.3) {
  const W = w / 2 + overhang, D = d / 2 + overhang;
  const v = [
    [-W, 0, -D], [W, 0, -D], [W, 0, D], [-W, 0, D], [-W, h, 0], [W, h, 0],
  ];
  const tri = (a, b, c) => [...v[a], ...v[b], ...v[c]];
  const pos = [
    ...tri(0, 4, 1), ...tri(1, 4, 5),   // back slope
    ...tri(3, 2, 4), ...tri(2, 5, 4),   // front slope
    ...tri(0, 3, 4), ...tri(1, 5, 2),   // gables
    ...tri(0, 1, 2), ...tri(0, 2, 3),   // underside
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
