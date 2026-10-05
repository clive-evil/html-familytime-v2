// Builds the deliberately ordinary town from the World description.
import * as THREE from 'three';
import { Batch, roofGeo } from './geo.js';
import { paintGround, GROUND } from './groundTexture.js';
import { parkedCarGeometry } from './carModel.js';
import { rng } from '../sim/math.js';
import { KERB_H } from '../world/layout.js';

let groundCanvasCache = null;

export function buildTown(world, renderer) {
  const root = new THREE.Group();
  const lambertVC = new THREE.MeshLambertMaterial({ vertexColors: true });
  const lambertVC2 = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

  // ---------------------------------------------------------------- ground
  if (!groundCanvasCache) groundCanvasCache = paintGround(world);
  const tex = new THREE.CanvasTexture(groundCanvasCache);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const groundMat = new THREE.MeshLambertMaterial({ map: tex });
  const G = GROUND;
  const region = (x0, x1, z0, z1, step) => {
    const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    const uv = new Float32Array((nx + 1) * (nz + 1) * 2);
    let k = 0, u = 0;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + (i * (x1 - x0)) / nx, z = z0 + (j * (z1 - z0)) / nz;
        pos[k++] = x; pos[k++] = world.height(x, z); pos[k++] = z;
        uv[u++] = (x - G.x0) / (G.x1 - G.x0); uv[u++] = (z - G.z0) / (G.z1 - G.z0);
      }
    }
    const idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, groundMat);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const S = 0.5;
  region(-34, 34, -118, -46, S);       // car park
  region(-8, 8, -50, -6, S);           // access road
  region(-94, 64, -10, 10, S);         // Mill Road
  region(56, 98, -10, 30, S);          // the bend
  region(62, 92, 26, 252, S);          // the hill
  region(-50, 150, 241, 270, S);       // top road + Nan's

  // coarse ground everywhere else (slightly lower so the detail wins)
  {
    const x0 = -260, x1 = 320, z0 = -320, z1 = 520, step = 6;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.round((x1 - x0) / step), Math.round((z1 - z0) / step));
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const R = rng(5);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const far = Math.max(0, Math.hypot(x - 30, z - 80) - 230);
      p.setY(i, world.base(z) - 0.2 + far * far * 0.0009 + Math.sin(x * 0.03) * far * 0.02);
      const n = 0.92 + R() * 0.1;
      colors[i * 3] = 0.36 * n; colors[i * 3 + 1] = 0.44 * n; colors[i * 3 + 2] = 0.28 * n;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, lambertVC);
    m.receiveShadow = true;
    root.add(m);
  }

  // ---------------------------------------------------------------- walls & hedges
  {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x8b4a37 });
    const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x3f5a2e });
    const walls = world.walls.filter((w) => w.tag === 'wall');
    const hedges = world.walls.filter((w) => w.tag === 'hedge');
    const inst = (list, mat, h, wExtra) => {
      const im = new THREE.InstancedMesh(unit, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      list.forEach((w, i) => {
        const fz = Math.cos(w.rot), fx = Math.sin(w.rot);
        const za = w.cz - fz * w.hz, zb = w.cz + fz * w.hz;
        const ya = world.base(za), yb = world.base(zb);
        const pitch = -Math.atan2(yb - ya, 2 * w.hz);
        e.set(pitch, w.rot, 0, 'YXZ'); q.setFromEuler(e);
        const y = (ya + yb) / 2 + KERB_H + h / 2 - 0.25;
        m.compose(new THREE.Vector3(w.cx, y, w.cz), q, new THREE.Vector3(w.hx * 2 + wExtra, h + 0.5, w.hz * 2 + 0.05));
        im.setMatrixAt(i, m);
        void fx;
      });
      im.receiveShadow = true;
      root.add(im);
    };
    inst(walls, wallMat, 0.85, 0.05);
    inst(hedges, hedgeMat, 1.35, 0.25);
  }

  // ---------------------------------------------------------------- houses
  {
    const R = rng(31);
    const b = new Batch();
    const brick = [0x8a4b38, 0x9a5a42, 0x7c4433, 0xa36a50, 0x8f5a48, 0xc9bfa8, 0xd8d0bc, 0x9b9488];
    const roofs = [0x3c3c40, 0x4a3b34, 0x55463c, 0x343538];
    const doors = [0x1f3b5a, 0x6b1f1f, 0x2f4a2f, 0xe8e4da, 0x222222];
    for (const h of world.houses) {
      const c = Math.cos(h.rot), s = Math.sin(h.rot);
      // lowest/highest ground under the footprint
      let lo = Infinity, hi = -Infinity;
      for (const [lx, lz] of [[-h.w / 2, -h.d / 2], [h.w / 2, -h.d / 2], [-h.w / 2, h.d / 2], [h.w / 2, h.d / 2]]) {
        const z = h.z - lx * s + lz * c;
        const y = world.base(z) + KERB_H;
        lo = Math.min(lo, y); hi = Math.max(hi, y);
      }
      const storeys = h.nan ? 2 : 2;
      const wallH = storeys * 2.7 + 0.3;
      const bodyH = wallH + (hi - lo) + 0.4;
      const col = h.nan ? 0xb98a6a : brick[Math.floor(R() * brick.length)];
      const yBase = lo - 0.4;
      const place = (lx, ly, lz) => [h.x + lx * c + lz * s, ly, h.z - lx * s + lz * c];
      b.box(h.w, bodyH, h.d, col, place(0, yBase + bodyH / 2, 0), [0, h.rot, 0]);
      const roofH = 2.2 + R() * 0.8;
      b.add(roofGeo(h.w, h.d, roofH, 0.35), roofs[Math.floor(R() * roofs.length)], place(0, hi + wallH, 0), [0, h.rot, 0]);
      // chimney
      if (R() < 0.7) b.box(0.6, 1.6, 0.9, col, place((R() < 0.5 ? -1 : 1) * (h.w / 2 - 0.5), hi + wallH + roofH * 0.6, 0), [0, h.rot, 0]);
      // windows front (+z local) and back
      const yG = hi + 0.4;
      for (const side of [1, -1]) {
        const lz = side * (h.d / 2 + 0.03);
        for (let st = 0; st < storeys; st++) {
          const y = yG + 0.9 + st * 2.7;
          const n = h.w > 6.8 ? 2 : 2;
          for (let k = 0; k < n; k++) {
            const lx = (k - (n - 1) / 2) * (h.w * 0.45);
            if (side === 1 && st === 0 && k === 1) continue; // door goes here
            b.box(1.3, 1.15, 0.08, 0xe9e6dc, place(lx, y + 0.55, lz), [0, h.rot, 0]);
            b.box(1.12, 0.98, 0.1, 0x283038, place(lx, y + 0.55, lz + side * 0.01), [0, h.rot, 0]);
          }
        }
        if (side === 1) {
          const lx = 0.5 * (h.w * 0.45);
          const dc = h.nan ? 0xe2b33a : doors[Math.floor(R() * doors.length)];
          b.box(1.0, 2.05, 0.1, dc, place(lx, yG + 1.0, lz + 0.01), [0, h.rot, 0]);
          b.box(1.3, 0.1, 0.5, 0xd6d2c6, place(lx, yG + 2.2, lz + 0.2), [0, h.rot, 0]);
        }
      }
    }
    // Nan's garage
    const nd = world.nanDrive;
    const gy = world.base(nd.cz + nd.hz) + KERB_H;
    b.box(nd.hx * 2 + 0.6, 2.6, 5.5, 0xb98a6a, [nd.cx, gy + 1.0, nd.cz + nd.hz + 2.95]);
    b.box(nd.hx * 2 - 0.1, 2.0, 0.08, 0xd9d4c4, [nd.cx, gy + 0.95, nd.cz + nd.hz + 0.2]);
    b.box(nd.hx * 2 + 0.8, 0.12, 5.7, 0x3c3c40, [nd.cx, gy + 2.36, nd.cz + nd.hz + 2.95]);
    // shops near the car park get flat roofs anyway (fine)
    const hm = b.build(lambertVC2);
    hm.receiveShadow = true;
    root.add(hm);
  }

  // ---------------------------------------------------------------- trees
  {
    const R = rng(77);
    const b = new Batch();
    const trunk = new THREE.CylinderGeometry(0.18, 0.25, 3, 6);
    const crown = new THREE.IcosahedronGeometry(2.2, 0);
    const spots = [];
    for (let i = 0; i < 160; i++) {
      const x = -120 + R() * 300, z = -150 + R() * 450;
      if (world.sd(x, z) < 9) continue;
      if (world.houses.some((h) => Math.hypot(h.x - x, h.z - z) < h.w * 0.75 + 2.5)) continue;
      spots.push([x, z]);
    }
    for (const [x, z] of spots) {
      const y = world.base(z) + KERB_H;
      const s = 0.8 + R() * 0.7;
      b.add(trunk, 0x5a4636, [x, y + 1.5 * s, z], [0, 0, 0], [s, s, s]);
      b.add(crown, [0x3d5a2c, 0x4a6634, 0x35502a][Math.floor(R() * 3)], [x, y + (3.2 + R()) * s, z], [R(), R(), 0], [s, s * (0.9 + R() * 0.4), s]);
    }
    const m = b.build(lambertVC);
    root.add(m);
  }

  // ---------------------------------------------------------------- lamp posts, cones, barriers, signs
  {
    const b = new Batch();
    for (const l of world.lamps) {
      const y = world.base(l.z) + KERB_H;
      b.add(new THREE.CylinderGeometry(0.07, 0.1, 6, 6), 0x7d8285, [l.x, y + 3, l.z]);
      b.box(0.25, 0.12, 0.55, 0x5d6265, [l.x, y + 6, l.z]);
    }
    for (const c of world.cones) {
      const y = world.height(c.x, c.z);
      b.add(new THREE.ConeGeometry(0.17, 0.62, 10), 0xe0601f, [c.x, y + 0.31, c.z]);
      b.add(new THREE.CylinderGeometry(0.105, 0.125, 0.1, 10), 0xeeeeee, [c.x, y + 0.36, c.z]);
      b.box(0.36, 0.04, 0.36, 0x222222, [c.x, y + 0.02, c.z]);
    }
    // roadworks barrier blocks
    const rw = world.roadworks;
    for (let z = rw.cz - rw.hz; z < rw.cz + rw.hz; z += 2) {
      const y = world.base(z + 1);
      b.box(rw.hx * 2, 0.08, 1.9, 0x6f6a62, [rw.cx, y + 0.04, z + 1]); // dug up bit
      b.box(0.08, 0.8, 1.9, z % 4 < 2 ? 0xd32f2f : 0xf2f2f2, [rw.cx - rw.hx, y + 0.6, z + 1], [Math.atan(world.grade(z)) * -1, 0, 0]);
      b.box(0.08, 0.8, 1.9, z % 4 < 2 ? 0xf2f2f2 : 0xd32f2f, [rw.cx + rw.hx, y + 0.6, z + 1], [Math.atan(world.grade(z)) * -1, 0, 0]);
    }
    b.box(rw.hx * 2, 0.8, 0.08, 0xd32f2f, [rw.cx, world.base(rw.cz - rw.hz) + 0.6, rw.cz - rw.hz]);
    // give way sign
    const gs = world.giveWay.sign, gsy = world.base(gs.z) + KERB_H;
    b.add(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), 0x9ba0a3, [gs.x, gsy + 1.2, gs.z]);
    b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 3), 0xc62828, [gs.x, gsy + 2.4, gs.z - 0.03], [Math.PI / 2, 0, Math.PI]);
    b.add(new THREE.CylinderGeometry(0.29, 0.29, 0.05, 3), 0xf4f4f0, [gs.x, gsy + 2.4, gs.z - 0.05], [Math.PI / 2, 0, Math.PI]);
    // roadworks sign before the lights
    const rsx = world.lights.laneX1 + 0.8, rsz = 50, rsy = world.base(rsz) + KERB_H;
    b.add(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), 0x9ba0a3, [rsx, rsy + 1.1, rsz]);
    b.add(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 3), 0xc62828, [rsx, rsy + 2.2, rsz - 0.03], [Math.PI / 2, 0, 0]);
    b.add(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 3), 0xf4f4f0, [rsx, rsy + 2.2, rsz - 0.05], [Math.PI / 2, 0, 0]);
    const m = b.build(lambertVC);
    m.castShadow = true;
    root.add(m);
  }

  // ---------------------------------------------------------------- parked cars (instanced)
  {
    const geo = parkedCarGeometry();
    const im = new THREE.InstancedMesh(geo, lambertVC, world.parked.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    world.parked.forEach((p, i) => {
      const g = world.grade(p.z);
      const pitch = -Math.atan(g * Math.cos(p.rot));
      e.set(pitch, p.rot, 0, 'YXZ'); q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, world.height(p.x, p.z), p.z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m);
      im.setColorAt(i, new THREE.Color(p.color));
    });
    im.castShadow = true; im.receiveShadow = true;
    root.add(im);
  }

  // ---------------------------------------------------------------- traffic lights (dynamic lamps)
  const lights = [];
  for (const [pole, facing] of [[world.lights.pole, Math.PI], [world.lights.pole2, 0]]) {
    const g = new THREE.Group();
    const y = world.base(pole.z) + KERB_H;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x3a3c3e }));
    post.position.set(0, 1.3, 0); g.add(post);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.24), new THREE.MeshLambertMaterial({ color: 0x222426 }));
    head.position.set(0, 2.9, 0); g.add(head);
    const lamp = (yy, col) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x202020 });
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), mat);
      s.position.set(0, 2.9 + yy, 0.125);
      g.add(s);
      return { mat, on: new THREE.Color(col), off: new THREE.Color(0x1d1d1d) };
    };
    const red = lamp(0.28, 0xff3b2f), amber = lamp(0, 0xffaa22), green = lamp(-0.28, 0x3dff7a);
    g.position.set(pole.x, y, pole.z);
    g.rotation.y = facing;
    root.add(g);
    lights.push({ red, amber, green });
  }

  return { root, lights };
}

export function setLights(lights, state) {
  for (const L of lights) {
    L.red.mat.color.copy(state === 'red' ? L.red.on : L.red.off);
    L.amber.mat.color.copy(L.amber.off);
    L.green.mat.color.copy(state === 'green' ? L.green.on : L.green.off);
  }
}
