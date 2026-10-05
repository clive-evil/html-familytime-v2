import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PAL } from './palette.js';
import { mat, place, wobble, textTexture, eggGeometry } from './geo.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Hand-authored building models from primitives. Each builder returns a
// THREE.Group in local space (front = +z, centred on the footprint).
// Some models expose named parts in group.userData for animation.

const box = (w, h, d, color, x = 0, y = 0, z = 0, ry = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  return m;
};
const cyl = (rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y + h / 2, z);
  return m;
};
const sph = (r, color, x, y, z, sx = 1, sy = sx, sz = sx) => {
  const m = new THREE.Mesh(wobble(new THREE.SphereGeometry(r, 10, 8), 0.03, x * 7 + z), mat(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};

// Pitched roof prism spanning w (x) by d (z), ridge along x.
function roof(w, d, h, color, y, overhang = 0.3) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - overhang, 0);
  shape.lineTo(d / 2 + overhang, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -(w + overhang * 2) / 2);
  geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat(color, { flatShading: true }));
  m.position.y = y;
  return m;
}

function windowPane(x, y, z, ry = 0) {
  const g = new THREE.Group();
  g.add(box(0.7, 0.6, 0.08, 0x8fb8c8, 0, 0, 0));
  g.add(box(0.8, 0.08, 0.12, PAL.plaster, 0, -0.05, 0));
  g.add(box(0.06, 0.6, 0.1, PAL.woodDark, 0, 0, 0.01));
  g.add(box(0.7, 0.06, 0.1, PAL.woodDark, 0, 0.27, 0.01));
  g.position.set(x, y, z);
  g.rotation.y = ry;
  return g;
}

function cottage() {
  const g = new THREE.Group();
  g.add(box(5.2, 2.3, 3.8, PAL.plaster, 0, 0, -0.2));
  g.add(box(5.3, 0.3, 3.9, PAL.stoneDark, 0, 0, -0.2));
  g.add(roof(5.2, 3.8, 1.7, PAL.roof, 2.3));
  g.add(box(0.6, 1.4, 0.6, PAL.stone, 1.6, 2.6, -0.8));
  g.add(box(1.0, 1.6, 0.12, PAL.woodDark, 0, 0, 1.72));
  g.add(sph(0.06, PAL.brass, 0.35, 0.85, 1.8));
  g.add(windowPane(-1.6, 1.0, 1.72));
  g.add(windowPane(1.6, 1.0, 1.72));
  // flower boxes
  for (const x of [-1.6, 1.6]) {
    g.add(box(0.9, 0.2, 0.25, PAL.woodDark, x, 0.75, 1.85));
    for (let i = 0; i < 4; i++) g.add(sph(0.08, [0xe0607e, 0xf2c94c, 0xffffff, 0xcdb9de][i], x - 0.3 + i * 0.2, 1.02, 1.86));
  }
  // deposit cart (local 2.6, 3.4 is the deposit spot)
  const cart = new THREE.Group();
  cart.add(box(1.4, 0.5, 1.0, PAL.wood, 0, 0.3, 0));
  cart.add(box(1.5, 0.08, 1.1, PAL.woodDark, 0, 0.8, 0));
  for (const x of [-0.55, 0.55]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 12), mat(PAL.woodDark));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x * 1.35, 0.32, 0);
    cart.add(wheel);
  }
  cart.position.set(2.6, 0, 3.4);
  g.add(cart);
  // signpost
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshLambertMaterial({ map: textTexture('STORES', { w: 256, h: 70, font: 'bold 40px Georgia' }) }));
  sign.position.set(2.6, 1.25, 3.95);
  g.add(sign);
  g.add(box(0.06, 1.2, 0.06, PAL.woodDark, 2.6, 0, 3.9));
  return g;
}

function kitchen() {
  const g = new THREE.Group();
  g.add(box(2.6, 0.12, 1.3, PAL.wood, 0, 0.75, 0));
  g.add(box(2.7, 0.04, 1.4, 0xe9d6d0, 0, 0.87, 0)); // cloth
  for (const [x, z] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) g.add(box(0.12, 0.75, 0.12, PAL.woodDark, x, 0, z));
  g.add(sph(0.18, 0xf3ead2, 0.6, 1.05, 0, 1, 0.9)); // teapot
  g.add(cyl(0.03, 0.03, 0.18, 0xf3ead2, 0.8, 1.0, 0, 5));
  g.add(cyl(0.2, 0.2, 0.04, 0xffffff, -0.5, 0.92, 0.1, 12)); // plate
  for (const x of [-0.7, 0.7]) g.add(cyl(0.22, 0.2, 0.45, PAL.woodDark, x, 0, 1.3, 8));
  return g;
}

function basket(cap = 6, crate = false) {
  const g = new THREE.Group();
  if (crate) {
    g.add(box(1.6, 0.5, 1.2, PAL.plank, 0, 0, 0));
    g.add(box(1.7, 0.08, 1.3, PAL.woodDark, 0, 0.5, 0));
    g.add(box(1.5, 0.1, 1.1, PAL.thatch, 0, 0.42, 0));
  } else {
    const prof = [[0.5, 0], [0.62, 0.1], [0.72, 0.42], [0.75, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
    const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), mat(0xb98a4e, { side: THREE.DoubleSide }));
    g.add(m);
    g.add(cyl(0.5, 0.5, 0.05, PAL.thatch, 0, 0.12, 0, 16));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 5, 16, Math.PI), mat(0x8a6236));
    handle.position.y = 0.5;
    g.add(handle);
  }
  return g;
}

// ---- Gran-ulator ------------------------------------------------------------

let _dialTex = null;
function dialTexture() {
  if (_dialTex) return _dialTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f3ead2'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3b2a20'; g.lineWidth = 8; g.stroke();
  g.fillStyle = '#3b2a20'; g.font = 'bold 30px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const labels = [['WARM', -0.95], ['TOASTY', 0], ['NANA', 0.95]];
  for (const [t, a] of labels) {
    const x = 128 + Math.sin(a) * 78, y = 128 - Math.cos(a) * 78;
    g.save(); g.translate(x, y); g.rotate(a); g.fillText(t, 0, 0); g.restore();
  }
  g.fillStyle = '#c23b3b'; g.beginPath(); g.arc(128 + Math.sin(0.95) * 105, 128 - Math.cos(0.95) * 105, 9, 0, Math.PI * 2); g.fill();
  _dialTex = new THREE.CanvasTexture(c);
  _dialTex.colorSpace = THREE.SRGBColorSpace;
  return _dialTex;
}

// Round window: a dark oven interior disc with tinted glass in front.
// Eggs are drawn just behind the glass so they read as "inside".
function porthole(r) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 20), mat(PAL.chrome));
  g.add(ring);
  const inside = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat(0x4a3428));
  inside.position.z = -0.005;
  g.add(inside);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshLambertMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.25, emissive: 0x000000, depthWrite: false }));
  glass.position.z = 0.09;
  g.add(glass);
  g.userData.glass = glass;
  return g;
}

function granulator() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const shell = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.15, 1.3, 4, 0.22), mat(PAL.enamel));
  shell.position.y = 0.75;
  body.add(shell);
  body.add(box(1.56, 0.1, 1.36, PAL.chrome, 0, 0.98, 0));
  body.add(box(1.4, 0.16, 1.2, PAL.enamelCream, 0, 0.12, 0));
  for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) body.add(cyl(0.07, 0.05, 0.14, PAL.chrome, x, 0, z, 8));
  // Porthole on the front with the egg behind it.
  const ph = porthole(0.3);
  ph.position.set(0, 0.66, 0.66);
  body.add(ph);
  // Name plate
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.22), new THREE.MeshLambertMaterial({ map: textTexture('GRAN-ULATOR', { w: 512, h: 112, font: 'bold 64px Georgia', bg: '#c9a14a', border: '#6a4b1f' }) }));
  plate.position.set(0, 0.25, 0.66);
  body.add(plate);
  // Dial on the right side.
  const dial = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshLambertMaterial({ map: dialTexture() }));
  dial.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 24), mat(PAL.chrome));
  dial.add(rim);
  const knob = new THREE.Group();
  knob.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 12), mat(0x3b2a20)), 0, 0, 0.06));
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.05), mat(0xc23b3b));
  pointer.position.set(0, 0.12, 0.1);
  knob.add(pointer);
  knob.children[0].rotation.x = Math.PI / 2;
  dial.add(knob);
  dial.position.set(0.77, 0.7, 0.05);
  dial.rotation.y = Math.PI / 2;
  body.add(dial);
  // Lid (hinged at the back top edge).
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 1.03, -0.62);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.3, 1.3, 3, 0.12), mat(PAL.enamelCream));
  lid.position.set(0, 0.1, 0.62);
  lidPivot.add(lid);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 12, Math.PI), mat(PAL.chrome));
  handle.position.set(0, 0.25, 0.62);
  lidPivot.add(handle);
  body.add(lidPivot);
  // The egg inside (visible through the porthole and when the lid is open).
  const egg = new THREE.Mesh(eggGeometry(0.24, 0.17, 16), new THREE.MeshLambertMaterial({ vertexColors: true }));
  egg.position.set(0, 0.53, 0.55);
  egg.scale.setScalar(0.75);
  body.add(egg);
  // Crack marks on the egg (zig-zag dark slivers).
  const cracks = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.02), mat(0x5a3e2b));
    const a = i * 0.9;
    s.position.set(Math.sin(a) * 0.21, 0.2 + (i % 2) * 0.05, Math.cos(a) * 0.21);
    s.rotation.set(0, a, (i % 2 ? 0.6 : -0.6));
    cracks.add(s);
  }
  egg.add(cracks);
  // Little chimney vent for steam.
  body.add(cyl(0.08, 0.1, 0.35, PAL.chrome, -0.5, 1.05, -0.4, 8));
  g.userData = { body, lidPivot, egg, cracks, knob, glass: ph.userData.glass, vent: new THREE.Vector3(-0.5, 1.5, -0.4) };
  return g;
}

function autoIncubator(slots) {
  const g = new THREE.Group();
  const cols = slots === 2 ? 2 : 3, rows = slots === 2 ? 1 : 2;
  const w = cols * 1.05 + 0.3, h = rows * 0.85 + 0.6, d = slots === 2 ? 1.3 : 1.8;
  const shell = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.2), mat(slots === 2 ? PAL.enamel : 0xe7b7b0));
  shell.position.y = h / 2 + 0.15;
  g.add(shell);
  g.add(box(w + 0.06, 0.1, d + 0.06, PAL.chrome, 0, h + 0.1, 0));
  for (const [x, z] of [[-w / 2 + 0.2, -d / 2 + 0.2], [w / 2 - 0.2, -d / 2 + 0.2], [-w / 2 + 0.2, d / 2 - 0.2], [w / 2 - 0.2, d / 2 - 0.2]]) g.add(cyl(0.07, 0.05, 0.16, PAL.chrome, x, 0, z, 8));
  const slotPos = [];
  const glasses = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c - (cols - 1) / 2) * 1.05, y = 0.15 + 0.55 + r * 0.85;
    const ph = porthole(0.3);
    ph.position.set(x, y + 0.05, d / 2 + 0.01);
    g.add(ph);
    glasses.push(ph.userData.glass);
    slotPos.push(new THREE.Vector3(x, y - 0.12, d / 2 - 0.12));
  }
  const label = slots === 2 ? 'DOUBLE GRAN-ULATOR' : 'GRAN-ULATOR DELUXE';
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.3, 2.4), 0.22), new THREE.MeshLambertMaterial({ map: textTexture(label, { w: 768, h: 96, font: 'bold 56px Georgia', bg: '#c9a14a', border: '#6a4b1f' }) }));
  plate.position.set(0, h - 0.05, d / 2 + 0.02);
  g.add(plate);
  // ON/OFF lamp
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshLambertMaterial({ color: 0x6fae4c, emissive: 0x2a5a1a }));
  lamp.position.set(w / 2 - 0.25, h - 0.05, d / 2 + 0.05);
  g.add(lamp);
  g.add(cyl(0.08, 0.1, 0.4, PAL.chrome, -w / 2 + 0.3, h + 0.1, -d / 2 + 0.3, 8));
  g.userData = { slotPos, glasses, lamp, vent: new THREE.Vector3(-w / 2 + 0.3, h + 0.6, -d / 2 + 0.3) };
  return g;
}

function bed() {
  const g = new THREE.Group();
  g.add(box(0.95, 0.3, 1.9, PAL.wood, 0, 0.1, 0));
  g.add(box(0.85, 0.15, 1.8, 0xffffff, 0, 0.4, 0));
  g.add(box(0.9, 0.08, 1.2, [0xcdb9de, 0xd78a8f, 0x8aa86b][Math.floor(Math.random() * 3)], 0, 0.55, 0.3));
  g.add(sph(0.22, 0xffffff, 0, 0.62, -0.6, 1.5, 0.5, 0.9));
  g.add(box(1.0, 0.7, 0.1, PAL.woodDark, 0, 0, -0.95));
  return g;
}

function farm(w, d) {
  const g = new THREE.Group();
  g.add(box(w - 0.2, 0.12, d - 0.2, PAL.soil, 0, 0, 0));
  const rows = Math.floor(d / 1.2);
  const crops = [];
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + 0.9 + r * ((d - 1.4) / Math.max(1, rows - 1));
    g.add(box(w - 0.6, 0.08, 0.35, 0x8a6442, 0, 0.1, z));
    for (let x = -w / 2 + 0.7; x <= w / 2 - 0.6; x += 0.6) {
      const c = sph(0.17, (r + Math.round(x * 2)) % 3 === 0 ? 0x9bc46a : PAL.crop, x, 0.3, z, 1, 0.75, 1);
      crops.push(c);
      g.add(c);
    }
  }
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) g.add(box(0.12, 0.6, 0.12, PAL.woodDark, x * 0.97, 0, z * 0.97));
  g.add(box(w, 0.07, 0.07, PAL.wood, 0, 0.4, -d / 2 * 0.97));
  g.add(box(0.07, 0.07, d, PAL.wood, -w / 2 * 0.97, 0.4, 0));
  g.add(box(0.07, 0.07, d, PAL.wood, w / 2 * 0.97, 0.4, 0));
  g.userData = { crops };
  return g;
}

function stockpile() {
  const g = new THREE.Group();
  g.add(box(2.6, 0.15, 2.6, PAL.plank, 0, 0, 0));
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 8), mat(PAL.bark));
    l.rotation.z = Math.PI / 2; l.position.set(-0.6, 0.32 + (i === 2 ? 0.26 : 0), -0.7 + (i === 2 ? 0.15 : i * 0.3));
    g.add(l);
  }
  g.add(sph(0.3, PAL.stone, 0.7, 0.35, -0.6)); g.add(sph(0.22, PAL.stoneDark, 0.95, 0.3, -0.2));
  g.add(sph(0.3, 0xd9c49a, 0.6, 0.35, 0.7, 1, 1.2, 1)); // sack
  return g;
}

function lumber() {
  const g = new THREE.Group();
  for (const [x, z] of [[-1.2, 0.0], [0, 0.3], [1.2, 0.0]]) {
    g.add(cyl(0.32, 0.36, 0.4, PAL.bark, x, 0, z, 10));
    g.add(cyl(0.3, 0.3, 0.02, 0xd9b48a, x, 0.4, z, 10));
  }
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.6, 8), mat(i % 2 ? PAL.bark : PAL.wood));
    l.rotation.z = Math.PI / 2; l.position.set(0, 0.2 + (i > 2 ? 0.32 : 0), -1.0 + (i % 3) * 0.36);
    g.add(l);
  }
  // axe in a stump
  const axe = new THREE.Group();
  axe.add(box(0.05, 0.6, 0.05, PAL.woodDark, 0, 0, 0));
  axe.add(box(0.22, 0.14, 0.03, PAL.chrome, 0.08, 0.5, 0));
  axe.position.set(0.1, 0.4, 0.3); axe.rotation.z = -0.3;
  g.add(axe);
  return g;
}

function quarry() {
  const g = new THREE.Group();
  g.add(box(3.8, 0.06, 3.8, 0xb9a88a, 0, 0, 0));
  g.add(sph(1.1, PAL.stoneDark, 0, 0.6, -0.8, 1.6, 0.9, 1));
  g.add(sph(0.7, PAL.stone, -1.1, 0.4, -0.3));
  g.add(sph(0.6, PAL.stone, 1.2, 0.35, -0.4));
  g.add(sph(0.25, PAL.stone, -0.4, 0.2, 0.6)); g.add(sph(0.2, PAL.stoneDark, 0.6, 0.15, 0.4));
  g.add(box(0.05, 0.7, 0.05, PAL.woodDark, 1.5, 0, 1.2, 0.3));
  return g;
}

function house(color = 0xe7d3b5, roofC = PAL.roofDark, w = 3.6, d = 3.4, h = 2.0) {
  const g = new THREE.Group();
  g.add(box(w, h, d, color, 0, 0, 0));
  g.add(roof(w, d, 1.4, roofC, h));
  g.add(box(0.9, 1.4, 0.1, PAL.woodDark, 0, 0, d / 2 + 0.02));
  g.add(windowPane(-w / 2 + 0.7, 0.8, d / 2 + 0.03));
  g.add(windowPane(w / 2 - 0.7, 0.8, d / 2 + 0.03));
  return g;
}

function barn() {
  const g = house(0xb8593f, 0x6b4a3a, 5.4, 4.4, 2.8);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.4), new THREE.MeshLambertMaterial({ map: textTexture('BUNK BARN', { w: 512, h: 100, font: 'bold 56px Georgia' }) }));
  sign.position.set(0, 2.45, 2.23);
  g.add(sign);
  return g;
}

function table() {
  const g = new THREE.Group();
  g.add(box(3.6, 0.12, 1.2, PAL.wood, 0, 0.75, 0));
  g.add(box(3.7, 0.04, 1.3, 0xd9e3ea, 0, 0.87, 0));
  for (const [x, z] of [[-1.6, -0.45], [1.6, -0.45], [-1.6, 0.45], [1.6, 0.45]]) g.add(box(0.12, 0.75, 0.12, PAL.woodDark, x, 0, z));
  g.add(box(3.4, 0.1, 0.35, PAL.plank, 0, 0.45, 1.0));
  g.add(box(3.4, 0.1, 0.35, PAL.plank, 0, 0.45, -1.0));
  for (let i = 0; i < 4; i++) g.add(cyl(0.18, 0.18, 0.04, 0xffffff, -1.2 + i * 0.8, 0.92, 0.25 * (i % 2 ? 1 : -1), 12));
  return g;
}

function builderHut() {
  const g = new THREE.Group();
  g.add(box(2.6, 1.9, 2.0, PAL.plank, 0, 0, -0.2));
  const r = box(3.0, 0.12, 2.6, PAL.roofDark, 0, 1.95, -0.1);
  r.rotation.x = 0.2;
  g.add(r);
  g.add(box(1.0, 0.25, 0.5, PAL.wood, 0.8, 0, 1.1));
  g.add(box(1.2, 0.08, 0.3, PAL.plank, -0.7, 0.05, 1.1));
  g.add(box(1.2, 0.08, 0.3, PAL.plank, -0.7, 0.15, 1.1));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), new THREE.MeshLambertMaterial({ map: textTexture('BUILDERS', { w: 384, h: 84, font: 'bold 48px Georgia' }) }));
  sign.position.set(0, 1.5, 0.81);
  g.add(sign);
  return g;
}

function bell() {
  const g = new THREE.Group();
  g.add(box(0.15, 2.2, 0.15, PAL.woodDark, -0.5, 0, 0));
  g.add(box(0.15, 2.2, 0.15, PAL.woodDark, 0.5, 0, 0));
  g.add(box(1.3, 0.15, 0.2, PAL.woodDark, 0, 2.2, 0));
  const pivot = new THREE.Group();
  pivot.position.set(0, 2.2, 0);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.32, 0.45, 12, 1, true), mat(PAL.brass, { side: THREE.DoubleSide }));
  b.position.y = -0.3;
  pivot.add(b);
  g.add(pivot);
  g.add(box(0.8, 0.5, 0.6, PAL.stone, 0, 0, 0));
  g.userData = { bellPivot: pivot };
  return g;
}

// Merge every static, untextured Lambert mesh under `root` into a single
// vertex-coloured mesh (one draw call). Objects listed in `keep` (and their
// descendants) stay separate because they animate or change at runtime.
export function bake(root, keep = []) {
  if (globalThis.__NOBAKE) return root;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const keepSet = new Set(keep.filter(Boolean));
  const kept = (o) => { for (let p = o; p && p !== root; p = p.parent) if (keepSet.has(p)) return true; return false; };
  const geos = [];
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || kept(o)) return;
    const m = o.material;
    if (!m || !m.isMeshLambertMaterial || m.map || m.transparent || m.vertexColors) return;
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    // Flat-shaded sources must be un-indexed to keep their facets; everything
    // else keeps its index buffer (far fewer vertices).
    const ng = m.flatShading && g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
    const c = m.color;
    const n = ng.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // Flat-shaded sources keep their facets.
    if (m.flatShading) { ng.deleteAttribute('normal'); ng.computeVertexNormals(); }
    if (!ng.index) ng.setIndex(Array.from({ length: n }, (_, i) => i));
    geos.push(ng);
    victims.push(o);
  });
  if (geos.length < 2) return root;
  for (const o of victims) o.parent.remove(o);
  const merged = new THREE.Mesh(mergeGeometries(geos, false), BAKED);
  root.add(merged);
  return root;
}
const BAKED = new THREE.MeshLambertMaterial({ vertexColors: true });

export function buildModel(type) {
  const m = rawModel(type);
  const u = m.userData || {};
  return bake(m, [u.body, u.lidPivot, u.egg, u.knob, u.bellPivot, u.lamp, ...(u.crops || []), ...(u.glasses || [])]);
}

function rawModel(type) {
  switch (type) {
    case 'cottage': return cottage();
    case 'kitchen': return kitchen();
    case 'basket': return basket();
    case 'crate': return basket(8, true);
    case 'granulator': return granulator();
    case 'double': return autoIncubator(2);
    case 'deluxe': return autoIncubator(6);
    case 'bed': return bed();
    case 'farm': return farm(4, 4);
    case 'bigfarm': return farm(6, 6);
    case 'stockpile': return stockpile();
    case 'lumber': return lumber();
    case 'quarry': return quarry();
    case 'house': return house();
    case 'barn': return barn();
    case 'table': return table();
    case 'builder': return builderHut();
    case 'bell': return bell();
  }
  return new THREE.Group();
}

// Scaffold shown around construction sites.
export function scaffold(w, d) {
  return bake(rawScaffold(w, d));
}

function rawScaffold(w, d) {
  const g = new THREE.Group();
  const h = 2.0;
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) g.add(box(0.1, h, 0.1, PAL.plank, x, 0, z));
  g.add(box(w, 0.08, 0.1, PAL.plank, 0, h * 0.5, d / 2));
  g.add(box(w, 0.08, 0.1, PAL.plank, 0, h * 0.5, -d / 2));
  g.add(box(0.1, 0.08, d, PAL.plank, w / 2, h * 0.5, 0));
  g.add(box(0.1, 0.08, d, PAL.plank, -w / 2, h * 0.5, 0));
  const outline = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x7a5236, transparent: true, opacity: 0.35, depthWrite: false }));
  outline.rotation.x = -Math.PI / 2; outline.position.y = 0.03;
  g.add(outline);
  return g;
}
