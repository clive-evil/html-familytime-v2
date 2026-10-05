// Non-physical environment dressing so each theme reads instantly.
// Kept outside the play area and cheap (few dozen meshes, shared materials).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { hazardTexture } from './textures.js';

const box = (w, h, d, color, r = 0.05, rough = 0.7, metal = 0) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3)), new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  m.castShadow = false; m.receiveShadow = true;
  return m;
};

export function buildDecor(level, theme) {
  const g = new THREE.Group();
  const f = level.floor;
  const cx = f.cx || 0, cz = f.cz || 0;
  const halfW = f.w / 2, halfD = f.d / 2;
  const zFar = cz - halfD, zNear = cz + halfD;
  const rnd = mulberry(level.id * 101);

  if (level.env === 'arena') {
    // big toy-box back wall with colourful blocks and a giant scoreboard
    const wall = box(f.w + 18, 7, 0.6, '#6c4bd1', 0.2);
    wall.position.set(cx, 2.5, zFar - 5); g.add(wall);
    const board = box(6, 2.2, 0.3, '#1d1640', 0.15, 0.4);
    board.position.set(cx, 4.2, zFar - 4.6); g.add(board);
    const cols = ['#ff4f7b', '#ffd23f', '#3fd2ff', '#7cff6b', '#ff9f1a'];
    // stacks of giant toy blocks at the far corners
    for (const side of [-1, 1]) {
      let y = -0.45;
      for (let i = 0; i < 3; i++) {
        const s = 1.6 - i * 0.35;
        const b = box(s, s, s, cols[(i + (side > 0 ? 2 : 0)) % cols.length], 0.12, 0.5);
        b.position.set(cx + side * (halfW + 2.4), y + s / 2, zFar + 1.5);
        b.rotation.y = (i - 1) * 0.3 * side;
        y += s;
        g.add(b);
      }
    }
    addSidePlatforms(g, f, '#4a347f');
  } else if (level.env === 'market') {
    // shelving units with colourful products along both sides (products are
    // one InstancedMesh: a single draw call for hundreds of boxes)
    const prodCols = ['#e8213f', '#2b7bff', '#21b573', '#ffcc33', '#ff7a1a', '#ffffff', '#9b59ff'];
    const prods = [];
    const frameGeo = new RoundedBoxGeometry(1.2, 3, 3, 2, 0.03);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#dfe4ea', roughness: 0.4, metalness: 0.5 });
    for (const side of [-1, 1]) {
      for (let z = zNear - 1; z > zFar; z -= 3.2) {
        const ux = cx + side * (halfW + 1.2), uz = z - 1.5;
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(ux, 1.3, uz); frame.receiveShadow = true;
        g.add(frame);
        for (let sh = 0; sh < 4; sh++) {
          for (let k = 0; k < 6; k++) {
            const w = 0.3 + rnd() * 0.15, h = 0.35 + rnd() * 0.25;
            prods.push({ x: ux - side * 0.35, y: -0.2 + 0.25 + sh * 0.72 + h / 2, z: uz - 1.3 + k * 0.5, sx: 0.5, sy: h, sz: w, c: prodCols[(sh * 3 + k + (z | 0) + 70) % prodCols.length] });
          }
        }
      }
    }
    const inst = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 1, 0.08), new THREE.MeshStandardMaterial({ roughness: 0.5 }), prods.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    prods.forEach((p, i) => {
      m4.makeScale(p.sx, p.sy, p.sz).setPosition(p.x, p.y, p.z);
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col.set(p.c));
    });
    inst.receiveShadow = true;
    g.add(inst);
    const sign = box(5, 0.9, 0.2, '#2fbf8f', 0.1, 0.5);
    sign.position.set(cx, 4.2, zFar - 1.5); g.add(sign);
    addSidePlatforms(g, f, '#cfd8d3');
  } else if (level.env === 'office') {
    // windows wall, plants, ceiling lights
    const wall = box(f.w + 14, 5, 0.4, '#e6e9ef', 0.05);
    wall.position.set(cx, 2.3, zFar - 2.5); g.add(wall);
    for (let i = -3; i <= 3; i++) {
      const w = box(2.2, 2.6, 0.1, '#8fd3ff', 0.03, 0.1, 0.2);
      w.material.emissive = new THREE.Color('#5fb8ff'); w.material.emissiveIntensity = 0.35;
      w.position.set(cx + i * 2.8, 2.6, zFar - 2.25); g.add(w);
    }
    for (const side of [-1, 1]) {
      for (let z = zNear - 2; z > zFar; z -= 5) {
        const pot = box(0.6, 0.6, 0.6, '#f1f1f1', 0.1);
        pot.position.set(cx + side * (halfW + 1), 0.1, z); g.add(pot);
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ color: '#3faa5a', roughness: 0.7, flatShading: true }));
        leaf.position.set(cx + side * (halfW + 1), 1.0, z); g.add(leaf);
      }
    }
    addSidePlatforms(g, f, '#59647d');
  } else if (level.env === 'site') {
    // crane, scaffold, hazard barriers
    const mast = box(0.6, 14, 0.6, '#f2b01e', 0.05, 0.5, 0.3);
    mast.position.set(cx + halfW + 4, 6.5, zFar - 3); g.add(mast);
    const jib = box(14, 0.5, 0.5, '#f2b01e', 0.05, 0.5, 0.3);
    jib.position.set(cx + halfW - 1, 13.4, zFar - 3); g.add(jib);
    const hook = box(0.1, 4, 0.1, '#333', 0.02);
    hook.position.set(cx - 2, 11.2, zFar - 3); g.add(hook);
    for (const side of [-1, 1]) {
      for (let z = zNear - 1; z > zFar; z -= 2.2) {
        const bar = new THREE.Mesh(new RoundedBoxGeometry(2, 0.7, 0.25, 2, 0.05), new THREE.MeshStandardMaterial({ map: hazardTexture('#e8213f', '#ffffff', 'barrier-rw'), roughness: 0.5 }));
        bar.position.set(cx + side * (halfW + 0.9), 0.15, z);
        bar.rotation.y = Math.PI / 2;
        g.add(bar);
      }
    }
    const shed = box(4, 3, 3, '#8a8f99', 0.08);
    shed.position.set(cx - halfW - 4, 1.3, zFar + 3); g.add(shed);
    addSidePlatforms(g, f, '#7a6a55');
  } else if (level.env === 'plaza') {
    const cols = ['#ffd6a5', '#bde0fe', '#caffbf', '#ffc6ff', '#fdffb6'];
    for (let i = -3; i <= 3; i++) {
      const h = 6 + rnd() * 8;
      const b = box(3.2, h, 3, cols[(i + 3) % cols.length], 0.1, 0.8);
      b.position.set(cx + i * 3.6, h / 2 - 0.3, zFar - 6 - rnd() * 3); g.add(b);
      for (let r = 1; r < h - 1; r += 1.4) {
        const win = box(2.4, 0.6, 0.05, '#7fb3ff', 0.02, 0.2);
        win.position.set(b.position.x, r, b.position.z + 1.53); g.add(win);
      }
    }
    for (const side of [-1, 1]) {
      for (let z = zNear - 2; z > zFar; z -= 4) {
        const trunk = box(0.25, 1.6, 0.25, '#7a5230', 0.05);
        trunk.position.set(cx + side * (halfW + 1.3), 0.6, z); g.add(trunk);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshStandardMaterial({ color: '#4cb963', roughness: 0.8, flatShading: true }));
        crown.position.set(cx + side * (halfW + 1.3), 2.0, z); g.add(crown);
      }
    }
    addSidePlatforms(g, f, '#b8aea2');
  }
  return g;
}

function addSidePlatforms(g, f, color) {
  // low surround so the lane doesn't float in the void
  const cx = f.cx || 0, cz = f.cz || 0;
  for (const side of [-1, 1]) {
    const m = box(8, 0.6, f.d + 10, color, 0.05, 0.85);
    m.position.set(cx + side * (f.w / 2 + 4.6), -0.75, cz);
    g.add(m);
  }
}

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
