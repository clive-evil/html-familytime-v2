// Player car (exterior + driver's-eye interior), AI cars, cameras, mirrors.
import * as THREE from 'three';
import { Batch, hexa } from './geo.js';
import { makeCarMesh, carBodyBatch } from './carModel.js';
import { Cluster } from './groundTexture.js';
import { CAR } from '../sim/params.js';

const PLAYER_COLOUR = 0x9fb3a3; // faded sage green

export const EYE = new THREE.Vector3(-0.37, 1.16, -0.34); // right-hand drive: driver at -x

export class View {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.04, 900);
    this.look = { yaw: 0, pitch: -0.06, tyaw: 0, tpitch: -0.06, idle: 0 };
    this.mode = 'first';
    this.buildPlayer();
    this.buildMirrors();
    this.aiMeshes = new Map();
    this.chase = new THREE.Vector3();
    this.chaseInit = false;
  }

  buildPlayer() {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mat = mat;
    const car = makeCarMesh(PLAYER_COLOUR, mat);
    this.car = car;
    this.body = new THREE.Group(); // suspension-moved part
    this.root = new THREE.Group();
    this.root.add(this.body);
    this.body.add(car.group);
    this.scene.add(this.root);
    // wheels hang from the root (not the body) so body roll shows
    for (const w of car.wheels) { car.group.remove(w.pivot); this.root.add(w.pivot); }

    // ---------------------------------------------------------- interior
    const I = new THREE.Group();
    this.interior = I;
    const b = new Batch();
    const DASH = 0x2b2c2e, LINER = 0xb8b2a2, CARD = 0x4a4b4d, SEAT = 0x3b3a39;
    // dashboard: top slab + lower face
    b.add(hexa(
      [[-0.78, 0.78, 0.38], [0.78, 0.78, 0.38], [0.78, 0.78, 0.75], [-0.78, 0.78, 0.75]],
      [[-0.78, 0.95, 0.42], [0.78, 0.95, 0.42], [0.78, 0.9, 0.86], [-0.78, 0.9, 0.86]]), DASH);
    // binnacle hood in front of the driver
    b.box(0.46, 0.06, 0.2, DASH, [-0.37, 1.0, 0.5], [-0.15, 0, 0]);
    b.box(0.46, 0.12, 0.04, DASH, [-0.37, 0.96, 0.6]);
    // centre console
    b.box(0.28, 0.32, 0.5, DASH, [0.0, 0.55, 0.42]);
    b.box(0.2, 0.18, 0.75, 0x333436, [0.0, 0.4, -0.15]);
    // A-pillars (from dash corners up to the roof front)
    for (const sx of [-1, 1]) {
      const p0 = new THREE.Vector3(sx * 0.74, 0.93, 0.84), p1 = new THREE.Vector3(sx * 0.66, 1.4, 0.06);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      const len = p0.distanceTo(p1);
      const pitch = Math.atan2(p1.z - p0.z, p1.y - p0.y);
      b.box(0.05, len, 0.075, LINER, [mid.x, mid.y, mid.z], [pitch, 0, 0]);
      // door card + window sill
      b.box(0.06, 0.5, 1.75, CARD, [sx * 0.79, 0.66, -0.35]);
      b.box(0.08, 0.04, 1.75, 0x6a6b6c, [sx * 0.765, 0.915, -0.35]);
      // B pillar
      b.box(0.08, 0.5, 0.12, LINER, [sx * 0.7, 1.15, -0.88]);
      // seats
      b.box(0.5, 0.12, 0.5, SEAT, [sx * 0.37, 0.42, -0.25]);
      b.box(0.5, 0.65, 0.12, SEAT, [sx * 0.37, 0.8, -0.55], [0.18, 0, 0]);
      b.box(0.3, 0.2, 0.1, SEAT, [sx * 0.37, 1.24, -0.6], [0.1, 0, 0]);
    }
    // roof liner + windscreen header
    b.box(1.34, 0.03, 1.75, LINER, [0, 1.405, -0.8]);
    b.box(1.34, 0.035, 0.06, LINER, [0, 1.39, 0.05]);
    // rear seat back + parcel shelf
    b.box(1.4, 0.5, 0.12, SEAT, [0, 0.75, -1.25], [0.2, 0, 0]);
    b.box(1.4, 0.03, 0.5, 0x2a2a2a, [0, 0.98, -1.55]);
    // floor
    b.box(1.5, 0.02, 2.6, 0x1f1f20, [0, 0.3, -0.3]);
    const imesh = b.build(mat);
    I.add(imesh);

    // instrument cluster
    this.cluster = new Cluster();
    this.clusterTex = new THREE.CanvasTexture(this.cluster.cv);
    this.clusterTex.colorSpace = THREE.SRGBColorSpace;
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.156), new THREE.MeshBasicMaterial({ map: this.clusterTex }));
    cl.position.set(-0.37, 0.955, 0.585);
    cl.rotation.set(-0.35, Math.PI, 0);
    I.add(cl);

    // steering wheel on a tilted column
    this.columnPivot = new THREE.Group();
    this.columnPivot.position.set(-0.37, 0.86, 0.3);
    this.columnPivot.rotation.x = 0.45; // column runs forward and down into the dash
    I.add(this.columnPivot);
    this.wheel = new THREE.Group();
    const wm = new THREE.MeshLambertMaterial({ color: 0x1d1d1e });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.016, 8, 40), wm);
    this.wheel.add(rim);
    for (const a of [0, Math.PI, -Math.PI / 2]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.028, 0.012), wm);
      sp.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0);
      sp.rotation.z = a;
      this.wheel.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), wm);
    hub.rotation.x = Math.PI / 2;
    this.wheel.add(hub);
    // top-dead-centre marker so turns are readable
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.034, 0.036), new THREE.MeshLambertMaterial({ color: 0xa89d80 }));
    mark.position.set(0, 0.18, 0);
    this.wheel.add(mark);
    this.wheel.position.set(0, 0, 0.0);
    this.wheel.rotation.y = Math.PI; // face the driver
    const wheelSpin = new THREE.Group();
    wheelSpin.add(this.wheel);
    this.wheelSpin = wheelSpin;
    this.columnPivot.add(wheelSpin);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 8), new THREE.MeshLambertMaterial({ color: 0x232324 }));
    col.rotation.x = Math.PI / 2; col.position.z = 0.17;
    this.columnPivot.add(col);

    // gear lever (driver's left = +x side of the driver; console at x≈0)
    this.gearPivot = new THREE.Group();
    this.gearPivot.position.set(-0.05, 0.58, 0.28);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.26, 8), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    stick.position.y = 0.13;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
    knob.position.y = 0.27;
    const gaiter = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 10), new THREE.MeshLambertMaterial({ color: 0x1f1f1f }));
    gaiter.position.y = 0.03;
    this.gearPivot.add(stick, knob, gaiter);
    I.add(this.gearPivot);
    // handbrake lever
    this.hbPivot = new THREE.Group();
    this.hbPivot.position.set(0.0, 0.5, -0.05);
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.3), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
    hb.position.z = 0.15;
    this.hbPivot.add(hb);
    I.add(this.hbPivot);

    // first-person shell: just the bits of bodywork you can see from the seat
    const sh = new Batch();
    const PC = PLAYER_COLOUR;
    sh.add(hexa(
      [[-0.79, 0.62, 0.7], [0.79, 0.62, 0.7], [0.79, 0.62, 1.84], [-0.79, 0.62, 1.84]],
      [[-0.78, 0.9, 0.72], [0.78, 0.9, 0.72], [0.76, 0.86, 1.76], [-0.76, 0.86, 1.76]]), PC);
    for (const sx of [-1, 1]) {
      sh.box(0.05, 0.05, 0.12, PC, [sx * 0.84, 0.96, 0.52]); // mirror arms
    }
    sh.box(1.5, 0.04, 0.05, 0x1c1c1c, [0, 0.9, 0.73]); // scuttle / wiper line
    this.fpShell = sh.build(mat);
    I.add(this.fpShell);
    this.body.add(I);

    // camera mount
    this.head = new THREE.Group();
    this.head.position.copy(EYE);
    this.body.add(this.head);
  }

  buildMirrors() {
    const mk = (w, h, rw, rh) => {
      const rt = new THREE.WebGLRenderTarget(rw, rh, { samples: 0 });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      const geo = new THREE.PlaneGeometry(w, h);
      // mirror image: flip u
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: rt.texture }));
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.025, h + 0.025, 0.02), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
      frame.position.z = -0.014;
      const g = new THREE.Group(); g.add(frame); g.add(mesh);
      const cam = new THREE.PerspectiveCamera(30, rw / rh, 0.1, 400);
      return { rt, mesh: g, cam };
    };
    this.mirrors = [];
    // interior mirror (top centre of the screen)
    const inner = mk(0.24, 0.07, 320, 96);
    inner.mesh.position.set(-0.02, 1.27, 0.38);
    inner.mesh.rotation.set(0.05, Math.PI - 0.32, 0);
    inner.camOffset = new THREE.Vector3(0, 1.3, -1.3);
    inner.camYaw = Math.PI;
    inner.cam.fov = 26;
    this.body.add(inner.mesh);
    this.mirrors.push(inner);
    // driver's door mirror (right, -x) and passenger (left, +x)
    for (const sx of [-1, 1]) {
      const m = mk(0.16, 0.1, 200, 128);
      m.mesh.position.set(sx * 0.92, 1.0, 0.5);
      m.mesh.rotation.set(0, Math.PI + sx * (sx < 0 ? 0.42 : 0.62), 0);
      m.camOffset = new THREE.Vector3(sx * 1.0, 1.0, 0.45);
      m.camYaw = Math.PI - sx * 0.12;
      m.cam.fov = 24;
      this.body.add(m.mesh);
      this.mirrors.push(m);
    }
    this.mirrorFrame = 0;
  }

  // ---------------------------------------------------------------- per frame
  sync(car, driver, settings, dt) {
    const root = this.root;
    root.position.set(car.x, car.y, car.z);
    root.rotation.set(0, 0, 0);
    // terrain orientation of the whole car + body motion on top
    const e = new THREE.Euler(-car.groundPitch, car.psi, car.groundRoll, 'YXZ');
    root.quaternion.setFromEuler(e);
    const bump = car.bump * 0.04;
    this.body.position.set(0, bump * 0.6, 0);
    this.body.rotation.set(-car.bodyPitch + bump * 0.3, 0, car.bodyRoll, 'YXZ');
    // wheels
    const ws = this.car.wheels;
    const road = (car.roadAngle || 0) * Math.PI / 180;
    for (let i = 0; i < 4; i++) {
      const w = ws[i];
      const hRel = (car.wheelH[i] - car.y);
      w.pivot.position.y = 0.28 + hRel * 0.9;
      w.pivot.rotation.y = i < 2 ? -road : 0;
      w.mesh.rotation.x = i < 2 ? car.wheelRotF : car.wheelRotR;
    }
    // steering wheel: positive (right turn) = clockwise as the driver sees it
    this.wheelSpin.rotation.z = (driver.steerDeg * Math.PI) / 180;
    // gear lever
    const lv = driver.lever;
    this.gearPivot.rotation.set(-lv.y * 0.26, 0, -lv.x * 0.2, 'XYZ');
    this.hbPivot.rotation.x = -0.05 - driver.handbrake * 0.45;
    // interior visibility
    const fp = this.mode === 'first';
    this.interior.visible = fp;
    this.car.group.visible = !fp;
    for (const w of this.car.wheels) w.pivot.visible = !fp;
    for (const m of this.mirrors) m.mesh.visible = fp;
    // instrument cluster (every other frame is plenty)
    this.clusterT = (this.clusterT || 0) + 1;
    if (fp && this.clusterT % 2 === 0) {
      this.cluster.draw({
        rpm: car.rpm, mph: Math.abs(car.fwdSpeed) * 2.237, running: car.running, ignitionOn: car.ignitionOn || car.cranking,
        handbrake: driver.handbrake, clutchHot: car.clutchHot,
      });
      this.clusterTex.needsUpdate = true;
    }
    void settings; void dt;
  }

  updateCamera(dt, car, ui, settings, input) {
    const L = this.look;
    // mouse: free look with a lazy return to the road ahead
    const sens = 0.0026 * settings.mouseSensitivity;
    if (ui.lookDX || ui.lookDY) {
      L.tyaw -= ui.lookDX * sens; L.tpitch -= ui.lookDY * sens; L.idle = 0;
    } else L.idle += dt;
    if (ui.padLook) {
      // right stick = where your head is pointing (absolute)
      const [rx, ry] = ui.padLook;
      if (Math.abs(rx) > 0.01 || Math.abs(ry) > 0.01) { L.tyaw = -rx * 2.3; L.tpitch = -0.06 - ry * 0.7; L.idle = 0; L.pad = true; }
      else if (L.pad) { L.tyaw = 0; L.tpitch = -0.06; }
    }
    if (ui.glance) { L.tyaw = ui.glance * 1.45; L.idle = 0; L.glancing = true; }
    else if (L.glancing) { L.glancing = false; L.tyaw = 0; }
    if (L.idle > 2.5 && !L.pad) { L.tyaw *= Math.exp(-dt * 1.2); L.tpitch += (-0.06 - L.tpitch) * (1 - Math.exp(-dt * 1.2)); }
    L.tyaw = Math.max(-2.6, Math.min(2.6, L.tyaw));
    L.tpitch = Math.max(-1.0, Math.min(0.7, L.tpitch));
    const k = 1 - Math.exp(-dt * 14);
    L.yaw += (L.tyaw - L.yaw) * k;
    L.pitch += (L.tpitch - L.pitch) * k;
    void input;

    const cam = this.camera;
    if (this.mode === 'first') {
      if (cam.parent !== this.head) { this.head.add(cam); }
      cam.position.set(Math.max(0, L.yaw) * 0.05, 0, Math.abs(L.yaw) > 1.6 ? 0.06 : 0);
      cam.rotation.set(L.pitch, Math.PI + L.yaw, 0, 'YXZ');
      cam.near = 0.04;
      this.chaseInit = false;
    } else {
      if (cam.parent) cam.parent.remove(cam);
      const yaw = car.psi + L.yaw;
      const target = new THREE.Vector3(car.x - Math.sin(yaw) * 6.8, car.y + 2.7 - L.pitch * 3, car.z - Math.cos(yaw) * 6.8);
      if (!this.chaseInit) { this.chase.copy(target); this.chaseInit = true; }
      this.chase.lerp(target, 1 - Math.exp(-dt * 4));
      cam.position.copy(this.chase);
      cam.lookAt(car.x, car.y + 1.0, car.z);
      cam.near = 0.1;
    }
    cam.updateProjectionMatrix();
    return L.yaw;
  }

  renderMirrors(scene, car) {
    if (this.mode !== 'first') return;
    this.mirrorFrame++;
    const r = this.renderer;
    const prevAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    this.root.visible = false;
    this.root.updateMatrixWorld(true);
    this.mirrors.forEach((m, i) => {
      if ((this.mirrorFrame + i) % 2) return;
      const p = m.camOffset.clone().applyMatrix4(this.body.matrixWorld);
      m.cam.position.copy(p);
      m.cam.rotation.set(0, car.psi + m.camYaw + Math.PI, 0, 'YXZ');
      m.cam.updateMatrixWorld();
      r.setRenderTarget(m.rt);
      r.render(scene, m.cam);
    });
    r.setRenderTarget(null);
    this.root.visible = true;
    r.shadowMap.autoUpdate = prevAuto;
  }

  // ---------------------------------------------------------------- AI cars
  syncAI(cars, world) {
    const seen = new Set();
    for (const c of cars) {
      seen.add(c.id);
      let m = this.aiMeshes.get(c.id);
      if (!m) {
        m = makeCarMesh(c.color, this.mat);
        this.scene.add(m.group);
        this.aiMeshes.set(c.id, m);
      }
      const g = world.grade(c.z);
      m.group.position.set(c.x, world.base(c.z), c.z);
      m.group.rotation.set(-Math.atan(g * Math.cos(c.psi)), c.psi, 0, 'YXZ');
      for (let i = 0; i < 4; i++) m.wheels[i].mesh.rotation.x += c.v / CAR.wheelR / 60;
    }
    for (const [id, m] of this.aiMeshes) if (!seen.has(id)) { this.scene.remove(m.group); this.aiMeshes.delete(id); }
  }
}

export function makePedestrian() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.2), mat(0x2c2f3a)); legs.position.y = 0.43;
  const coat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.68, 0.26), mat(0x6b5a45)); coat.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat(0xd9b49a)); head.position.y = 1.65;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 10), mat(0x3a3a3a)); hat.position.y = 1.75;
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.3), mat(0x2a4a3a)); bag.position.set(0.28, 0.95, 0);
  g.add(legs, coat, head, hat, bag);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

void carBodyBatch;
