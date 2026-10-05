// Views for dynamic world events: falling bridge planks, the avalanche wall,
// ice cracks/holes, the falling tree, snowplough, rockfall and cable car.

import * as THREE from 'three';
import { mulberry32 } from '../sim/math.js';

const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });

export class EventViews {
  constructor(scene, world, game) {
    this.scene = scene;
    this.world = world;
    this.game = game;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.views = [];
    for (const ev of world.events) {
      const v = this.make(ev);
      if (v) this.views.push(v);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.views = [];
  }

  update(dt) {
    for (const v of this.views) v(dt);
  }

  make(ev) {
    const g = this.group;
    const w = this.world;
    if (ev.kind === 'bridge') {
      // rails + supports
      const railMat = lam(0x4a3220);
      const len = ev.z1 - ev.z0;
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, len), railMat);
        rail.position.set(ev.x + side * (ev.width / 2 - 0.1), (ev.y0 + ev.y1) / 2 + 1.0, (ev.z0 + ev.z1) / 2);
        rail.rotation.x = Math.atan2(ev.y0 - ev.y1, len);
        g.add(rail);
      }
      for (const zz of [ev.z0 + 6, ev.z1 - 6]) {
        const ground = w.terrain(ev.x, zz);
        const top = ev.y0 + ((ev.y1 - ev.y0) * (zz - ev.z0)) / len;
        const h = Math.max(1, top - ground);
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 1.2), lam(0x5d4630));
        pier.position.set(ev.x, ground + h / 2, zz);
        g.add(pier);
      }
      return () => {
        for (const p of ev.planks) {
          if (!p.mesh) continue;
          const m = p.mesh.children[0];
          m.position.y = p.baseY + p.height / 2;
          m.rotation.x = p.rotX || 0;
          m.rotation.z = p.rotZ || 0;
          m.visible = p.baseY > p.home.y - 80;
        }
      };
    }
    if (ev.kind === 'avalanche') {
      const rnd = mulberry32(11);
      const N = 260;
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const mat = lam(0xf3f6fa, { transparent: true, opacity: 0.95 });
      const mesh = new THREE.InstancedMesh(geo, mat, N);
      mesh.frustumCulled = false;
      g.add(mesh);
      const parts = [];
      for (let i = 0; i < N; i++) parts.push({ u: rnd() * 2 - 1, back: rnd() * 40, r: 3 + rnd() * 8, ph: rnd() * 6.28, h: rnd() });
      const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), cloudMat);
      g.add(cloud);
      // crack line at the top
      const crack = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.8), lam(0x2a3a48));
      g.add(crack);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      let t = 0;
      return (dt) => {
        t += dt;
        const active = ev.state === 'running' || ev.state === 'cracking' || ev.state === 'stopped';
        mesh.visible = ev.state === 'running' || ev.state === 'stopped';
        cloud.visible = ev.state === 'running';
        crack.visible = active;
        const zc = ev.crackZ;
        const cx = w.corridorCenter(zc);
        const hw = w.halfWidth(zc);
        crack.position.set(cx, w.height(cx, zc) + 0.1, zc);
        crack.scale.set(hw * 1.7, 1, 1);
        if (!mesh.visible) return;
        const fz = ev.front;
        const fcx = w.corridorCenter(fz);
        const fhw = w.halfWidth(fz);
        const settle = ev.state === 'stopped' ? 0.4 : 1;
        for (let i = 0; i < N; i++) {
          const p = parts[i];
          const z = fz - p.back * (0.4 + 0.6 * p.h);
          const x = fcx + p.u * fhw * 1.05;
          const y = w.height(x, z) + p.r * 0.5 * settle + Math.sin(t * 3 + p.ph) * 1.2 * settle + (1 - p.back / 40) * p.r * 0.6 * settle;
          const s = p.r * (0.7 + 0.3 * Math.sin(t * 2 + p.ph)) * (0.5 + 0.5 * (1 - p.back / 40)) * settle;
          q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), t * 2 + p.ph);
          m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
          mesh.setMatrixAt(i, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;
        // powder cloud billboard over the front
        const cam = this.game.camera;
        cloud.position.set(fcx, w.height(fcx, fz) + 18, fz - 10);
        cloud.scale.set(fhw * 2.6, 40, 1);
        cloud.quaternion.copy(cam.quaternion);
      };
    }
    if (ev.kind === 'ice') {
      // instanced crack decals (colour = stress) + instanced dark holes
      const tex = crackTexture();
      const s = ev.size;
      const n = ev.cells.length;
      const crackMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 });
      const cracks = new THREE.InstancedMesh(new THREE.PlaneGeometry(s, s), crackMat, n);
      const holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(s, s), lam(0x0d2130), n);
      cracks.frustumCulled = false;
      holes.frustumCulled = false;
      g.add(cracks, holes);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const col = new THREE.Color();
      const ys = ev.cells.map((c) => w.terrain(c.x + s / 2, c.z + s / 2));
      const place = () => {
        ev.cells.forEach((c, i) => {
          const rot = ((Math.round(c.x * 7 + c.z * 3) % 4) + 4) % 4;
          q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot * Math.PI / 2));
          const vis = c.broken ? 0.0001 : 1;
          m4.compose(new THREE.Vector3(c.x + s / 2, ys[i] + 0.05, c.z + s / 2), q, new THREE.Vector3(vis, vis, vis));
          cracks.setMatrixAt(i, m4);
          // faint pre-existing cracks hint at fragile ice; they darken with stress
          const k = 0.25 + Math.min(1, c.stress) * 0.75;
          col.setRGB(0.75 - k * 0.55, 0.85 - k * 0.5, 0.92 - k * 0.45);
          cracks.setColorAt(i, col);
          const hv = c.broken ? 1 : 0.0001;
          m4.compose(new THREE.Vector3(c.x + s / 2, ys[i] - 2.0, c.z + s / 2), q, new THREE.Vector3(hv, hv, hv));
          holes.setMatrixAt(i, m4);
        });
        cracks.instanceMatrix.needsUpdate = true;
        if (cracks.instanceColor) cracks.instanceColor.needsUpdate = true;
        holes.instanceMatrix.needsUpdate = true;
      };
      place();
      let seen = -1;
      let brokenSeen = 0;
      return () => {
        if (seen === ev.changed) return;
        seen = ev.changed;
        place();
        const broken = ev.cells.reduce((a, c) => a + (c.broken ? 1 : 0), 0);
        if (broken !== brokenSeen) {
          brokenSeen = broken;
          this.game.terrainView.invalidate(w.lake.x, w.lake.z, 260);
        }
      };
    }
    if (ev.kind === 'fallingTree') {
      const geo = new THREE.CylinderGeometry(0.35, 0.5, 1, 8);
      geo.translate(0, 0.5, 0);
      const trunk = new THREE.Mesh(geo, lam(0x5a3d26));
      trunk.castShadow = true;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9, 8), lam(0x1f4a35));
      crown.position.y = 0.72;
      crown.scale.set(1 / 1, 1 / ev.length * 1, 1);
      const pivot = new THREE.Group();
      pivot.add(trunk);
      trunk.scale.set(1, ev.length, 1);
      const crownG = new THREE.Group();
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(2.4, ev.length * 0.6, 8), lam(0x1f4a35));
      c2.position.y = ev.length * 0.65;
      crownG.add(c2);
      pivot.add(crownG);
      pivot.position.set(ev.x, ev.baseY, ev.z);
      g.add(pivot);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), lam(0x555b63, { flatShading: true }));
      rock.position.set(ev.x + ev.dir.x * ev.length * 0.55, w.terrain(ev.x + ev.dir.x * ev.length * 0.55, ev.z + ev.dir.z * ev.length * 0.55) + 0.3, ev.z + ev.dir.z * ev.length * 0.55);
      g.add(rock);
      const axis = new THREE.Vector3(ev.dir.z, 0, -ev.dir.x).normalize();
      return () => {
        const tilt = Math.PI / 2 - ev.angle;
        pivot.quaternion.setFromAxisAngle(axis, -tilt);
      };
    }
    if (ev.kind === 'plough') {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(ev.box.w, ev.box.height, ev.box.d), lam(0xf2a516));
      body.position.y = ev.box.height / 2;
      body.castShadow = true;
      grp.add(body);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(ev.box.w + 1.6, 1.0, 0.3), lam(0x333333));
      blade.position.set(0, 0.5, ev.box.d / 2 + 0.4);
      grp.add(blade);
      const lightM = new THREE.MeshBasicMaterial({ color: 0xff8a00 });
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), lightM);
      beacon.position.y = ev.box.height + 0.15;
      grp.add(beacon);
      g.add(grp);
      let t = 0;
      return (dt) => {
        t += dt;
        grp.position.set(ev.box.cx, ev.box.baseY, ev.box.cz);
        grp.rotation.y = ev.box.rot + (ev.dirSign < 0 ? Math.PI : 0);
        lightM.color.setHex(Math.sin(t * 8) > 0 ? 0xff8a00 : 0x552200);
      };
    }
    if (ev.kind === 'rockfall') {
      const meshes = ev.rocks.map((r) => {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r.r, 0), lam(0x4c5259, { flatShading: true }));
        m.castShadow = true;
        g.add(m);
        return m;
      });
      return () => {
        ev.rocks.forEach((r, i) => {
          meshes[i].visible = r.active;
          meshes[i].position.set(r.x, r.y, r.z);
          meshes[i].rotation.x = r.spin;
        });
      };
    }
    if (ev.kind === 'cablecar') {
      const grp = new THREE.Group();
      const cab = new THREE.Mesh(new THREE.BoxGeometry(ev.size * 1.3, ev.size, ev.size), lam(0xd81e3a));
      cab.castShadow = true;
      grp.add(cab);
      const win = new THREE.Mesh(new THREE.BoxGeometry(ev.size * 1.32, ev.size * 0.35, ev.size * 0.8), lam(0x2a3540));
      win.position.y = ev.size * 0.15;
      grp.add(win);
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), lam(0x333333));
      hanger.position.y = ev.size / 2 + 1.5;
      grp.add(hanger);
      g.add(grp);
      for (const p of [ev.a, ev.b]) {
        const h = p.y - w.terrain(p.x, p.z);
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, h, 8), lam(0x6f7c86));
        tower.position.set(p.x, p.y - h / 2, p.z);
        g.add(tower);
      }
      return () => {
        grp.position.set(ev.pos.x, ev.pos.y, ev.pos.z);
      };
    }
    if (ev.kind === 'cornice') {
      // a subtle overhang lip mesh that falls away
      const len = ev.z1 - ev.z0;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, len), lam(0xf6f9fc));
      g.add(lip);
      let fall = 0;
      return (dt) => {
        if (ev.state === 'intact') fall = 0;
        else fall += dt * 6;
        const x = ev.x0 - 0.8;
        const z = (ev.z0 + ev.z1) / 2;
        lip.position.set(x, w.height(ev.x0 + 1, z) - 0.25 - fall * fall * 0.3, z);
        lip.visible = fall < 30;
      };
    }
    return null;
  }
}

function crackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 2;
  const rnd = mulberry32(3);
  for (let k = 0; k < 6; k++) {
    let x = 64;
    let y = 64;
    g.beginPath();
    g.moveTo(x, y);
    const a = rnd() * Math.PI * 2;
    for (let i = 0; i < 8; i++) {
      x += Math.cos(a + (rnd() - 0.5) * 1.2) * 10;
      y += Math.sin(a + (rnd() - 0.5) * 1.2) * 10;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
