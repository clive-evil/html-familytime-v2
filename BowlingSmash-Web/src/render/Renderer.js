// Three.js presentation layer. Reads the Sim; never writes physics.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { THEMES } from './themes.js';
import * as TX from './textures.js';
import { buildEntityMesh, buildBallMesh, shardMesh, mat } from './models.js';
import { Particles } from './fx.js';
import { buildDecor } from './decor.js';
import { SHOT, DT } from '../sim/Sim.js';
import { BALL_RADIUS } from '../sim/catalog.js';
import { clamp, lerp } from '../sim/math.js';

const MAT_FX = {
  pin: ['chips', '#ffffff'], wood: ['chips', '#c98a4b'], card: ['dust', '#d2a56d'], metal: ['spark'], can: ['spark'],
  glass: ['chips', '#cfefff'], stone: ['dust', '#9d9a94'], plastic: ['chips', '#ff8a3d'], ceramic: ['chips', '#3a7bd5'],
  bumper: ['sparkle', '#ff8ad8'], floor: ['dust'],
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFShadowMap;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.0;
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.hemi = new THREE.HemisphereLight('#fff', '#888', 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff', 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this.fx = new Particles(this.scene);
    this.meshes = new Map(); // entity id -> {obj, ent}
    this.ballMeshes = new Map();
    this.debrisMeshes = new Map();
    this.fading = [];
    this.markers = [];
    this.shake = 0;
    this.camState = null;
    this.aim = this._buildAim();
    this.scene.add(this.aim.group);
    this.showColliders = false;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setScale(h * this.r.getPixelRatio() * 0.9);
    if (this.level) this._frame();
  }

  // ------------------------------------------------------------ level setup
  load(sim) {
    this.sim = sim;
    this.level = sim.level;
    const theme = (this.theme = THEMES[sim.level.env] || THEMES.arena);
    // clear
    this.levelGroup.clear();
    this.meshes.clear(); this.ballMeshes.clear(); this.debrisMeshes.clear();
    this.fading = []; this.markers = [];
    this.fx.clear();
    this.shake = 0;
    this.scene.background = TX.skyTexture(theme.sky[0], theme.sky[1]);
    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    this.hemi.color.set(theme.hemi[0]); this.hemi.groundColor.set(theme.hemi[1]); this.hemi.intensity = theme.hemi[2];
    this.sun.color.set(theme.sun[0]); this.sun.intensity = theme.sun[1];

    // floor(s)
    const f = sim.level.floor;
    const floors = [{ cx: f.cx || 0, cz: f.cz || 0, w: f.w, d: f.d, y: 0 }, ...(f.extra || [])];
    for (const fl of floors) {
      const tex = TX.floorTexture(theme.floor, theme.floorColor).clone();
      tex.needsUpdate = true;
      tex.repeat.set(fl.w / 4, fl.d / 4);
      const top = new THREE.Mesh(new THREE.BoxGeometry(fl.w, 0.5, fl.d), [
        mat(`edge:${theme.edge}`, () => new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 0.6 })),
        mat(`edge:${theme.edge}`, () => new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 0.6 })),
        new THREE.MeshStandardMaterial({ map: tex, roughness: theme.floor === 'lane' ? 0.32 : 0.8, metalness: 0 }),
        mat(`edge:${theme.edge}`, () => new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 0.6 })),
        mat(`edge:${theme.edge}`, () => new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 0.6 })),
        mat(`edge:${theme.edge}`, () => new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 0.6 })),
      ]);
      top.position.set(fl.cx || 0, (fl.y || 0) - 0.25, fl.cz || 0);
      top.receiveShadow = true;
      this.levelGroup.add(top);
    }
    if (theme.floor === 'lane') {
      const s = sim.level.start || [0, 0, 0];
      const arrows = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: TX.laneArrows(), transparent: true, depthWrite: false }));
      arrows.rotation.x = -Math.PI / 2;
      arrows.position.set(s[0], (s[1] || 0) > 0.01 ? -10 : 0.005, s[2] - 3);
      this.levelGroup.add(arrows);
    }
    // void below
    const voidM = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: theme.void, fog: true }));
    voidM.rotation.x = -Math.PI / 2; voidM.position.y = -8;
    this.levelGroup.add(voidM);
    this.levelGroup.add(buildDecor(sim.level, theme));

    // entities
    for (const e of sim.entities) {
      const obj = buildEntityMesh(e, theme);
      this.levelGroup.add(obj);
      const rec = { obj, ent: e, prevP: new THREE.Vector3(), prevQ: new THREE.Quaternion(), curP: new THREE.Vector3(), curQ: new THREE.Quaternion() };
      this._read(rec);
      rec.prevP.copy(rec.curP); rec.prevQ.copy(rec.curQ);
      obj.position.copy(rec.curP); obj.quaternion.copy(rec.curQ);
      this.meshes.set(e.id, rec);
      if (e.target) this._addMarker(e, rec);
      if (e.bonus) this._addMarker(e, rec, '#ffcf3a');
    }
    this._syncBalls(1);
    this._frame();
    this.camState = null;
  }

  _addMarker(e, rec, color) {
    const sm = new THREE.SpriteMaterial({ map: TX.markerTexture(), depthTest: false, transparent: true, color: color || '#ffffff' });
    const sp = new THREE.Sprite(sm);
    const s = clamp(e.h * 0.35, 0.16, 0.42);
    sp.scale.set(s, s, s);
    sp.renderOrder = 20;
    this.levelGroup.add(sp);
    this.markers.push({ sp, rec, ent: e, off: e.h / 2 + 0.22 + s * 0.4, phase: e.id * 0.7, s, hide: 0 });
  }

  _read(rec) {
    const b = rec.ent.body;
    if (rec.ent.removed) return;
    const t = b.translation(), q = b.rotation();
    rec.curP.set(t.x, t.y, t.z);
    rec.curQ.set(q.x, q.y, q.z, q.w);
  }

  /** Call after each sim step so we can interpolate between steps. */
  afterStep() {
    for (const rec of this.meshes.values()) {
      if (rec.ent.removed || !(rec.ent.dynamic || rec.ent.move || rec.ent.spin)) continue;
      rec.prevP.copy(rec.curP); rec.prevQ.copy(rec.curQ);
      this._read(rec);
    }
    for (const rec of this.ballMeshes.values()) {
      rec.prevP.copy(rec.curP); rec.prevQ.copy(rec.curQ);
      if (rec.ball.active && !rec.ball.removed) {
        const t = rec.ball.body.translation(), q = rec.ball.body.rotation();
        rec.curP.set(t.x, t.y, t.z); rec.curQ.set(q.x, q.y, q.z, q.w);
      }
    }
    for (const rec of this.debrisMeshes.values()) {
      rec.prevP.copy(rec.curP); rec.prevQ.copy(rec.curQ);
      if (!rec.d.removed) {
        const t = rec.d.body.translation(), q = rec.d.body.rotation();
        rec.curP.set(t.x, t.y, t.z); rec.curQ.set(q.x, q.y, q.z, q.w);
      }
    }
  }

  // ------------------------------------------------------------- per-frame
  sync(alpha, dt, time) {
    const sim = this.sim;
    for (const rec of this.meshes.values()) {
      const e = rec.ent;
      if (e.removed) {
        if (!rec.gone) {
          rec.gone = true;
          if (e.shattered) rec.obj.visible = false;
          else this.fading.push({ obj: rec.obj, t: 0, dur: e.fellOut ? 0.01 : 0.35 });
        }
        continue;
      }
      if (!(e.dynamic || e.move || e.spin)) continue;
      rec.obj.position.lerpVectors(rec.prevP, rec.curP, alpha);
      rec.obj.quaternion.slerpQuaternions(rec.prevQ, rec.curQ, alpha);
    }
    this._syncBalls(alpha);
    this._syncDebris(alpha);
    // fades
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      f.t += dt;
      const k = clamp(1 - f.t / f.dur, 0, 1);
      f.obj.scale.setScalar(Math.max(0.001, k));
      if (k <= 0) { f.obj.visible = false; this.fading.splice(i, 1); }
    }
    // markers
    for (const m of this.markers) {
      const e = m.ent;
      if ((e.target && e.down) || (e.bonus && e.bonusTaken) || e.removed) {
        m.hide = Math.min(1, m.hide + dt * 5);
      }
      const p = m.rec.obj.position;
      m.sp.position.set(p.x, p.y + m.off + Math.sin(time * 3 + m.phase) * 0.05, p.z);
      const s = m.s * (1 + m.hide * 0.8);
      m.sp.scale.set(s, s, s);
      m.sp.material.opacity = (1 - m.hide) * (this.aiming ? 0.95 : 0.8);
      m.sp.visible = m.hide < 1;
    }
    // bumper flashes
    for (const rec of this.meshes.values()) {
      const fl = rec.obj.userData.flash;
      if (fl && rec.flashT > 0) { rec.flashT -= dt; fl.material.emissiveIntensity = 0.25 + rec.flashT * 4; }
    }
    // ball trail
    for (const rec of this.ballMeshes.values()) {
      if (!rec.ball.active) continue;
      const sp = rec.ball.speed || 0;
      if (sp > 3) this.fx.burst('trail', rec.obj.position, rec.ball.radius / BALL_RADIUS, rec.ball.booster === 'bomb' ? '#ffb38a' : '#cfe0ff');
    }
    this.fx.update(dt);
  }

  _syncBalls(alpha) {
    const sim = this.sim;
    const want = [];
    if (sim.aimBall) want.push({ key: `aim${sim.shotsTaken}`, ball: sim.aimBall, body: sim.aimBall.body, radius: sim.aimBall.radius, kind: this.pendingBooster || 'normal', aim: true });
    for (const b of sim.balls) if (b.active) want.push({ key: `b${b.id}`, ball: b, body: b.body, radius: b.radius, kind: b.booster || 'normal' });
    const keys = new Set(want.map((w) => w.key));
    for (const [k, rec] of this.ballMeshes) {
      if (!keys.has(k) || (rec.kind !== (want.find((w) => w.key === k) || {}).kind)) {
        this.levelGroup.remove(rec.obj);
        this.ballMeshes.delete(k);
      }
    }
    for (const w of want) {
      let rec = this.ballMeshes.get(w.key);
      if (!rec) {
        const obj = buildBallMesh(w.aim && w.kind === 'heavy' ? w.radius * 1.4 : w.radius, w.kind);
        this.levelGroup.add(obj);
        const t = w.body.translation(), q = w.body.rotation();
        rec = { obj, kind: w.kind, ball: w.ball, prevP: new THREE.Vector3(t.x, t.y, t.z), curP: new THREE.Vector3(t.x, t.y, t.z), prevQ: new THREE.Quaternion(q.x, q.y, q.z, q.w), curQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) };
        if (w.aim && w.kind === 'heavy') { rec.curP.y += w.radius * 0.4; rec.prevP.y = rec.curP.y; }
        this.ballMeshes.set(w.key, rec);
      }
      rec.obj.position.lerpVectors(rec.prevP, rec.curP, alpha);
      rec.obj.quaternion.slerpQuaternions(rec.prevQ, rec.curQ, alpha);
    }
  }

  _syncDebris(alpha) {
    const live = new Set();
    for (const d of this.sim.debris) {
      live.add(d.id);
      let rec = this.debrisMeshes.get(d.id);
      if (!rec) {
        const obj = shardMesh(d.size, d.mat);
        this.levelGroup.add(obj);
        const t = d.body.translation(), q = d.body.rotation();
        rec = { obj, d, prevP: new THREE.Vector3(t.x, t.y, t.z), curP: new THREE.Vector3(t.x, t.y, t.z), prevQ: new THREE.Quaternion(q.x, q.y, q.z, q.w), curQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) };
        this.debrisMeshes.set(d.id, rec);
      }
      rec.obj.position.lerpVectors(rec.prevP, rec.curP, alpha);
      rec.obj.quaternion.slerpQuaternions(rec.prevQ, rec.curQ, alpha);
      const age = (this.sim.stepCount - d.born) * DT;
      if (age > 2.8) rec.obj.scale.setScalar(Math.max(0.01, 1 - (age - 2.8) / 0.5));
    }
    for (const [k, rec] of this.debrisMeshes) {
      if (!live.has(k)) { this.levelGroup.remove(rec.obj); this.debrisMeshes.delete(k); }
    }
  }

  // -------------------------------------------------------------- effects
  onEvent(ev) {
    switch (ev.t) {
      case 'impact': {
        const [kind, color] = MAT_FX[ev.mat] || ['dust'];
        if (ev.s > 0.15) this.fx.burst(ev.floorHit ? 'dust' : kind, ev, ev.s, color);
        if (ev.ball && ev.s > 0.3) this.addShake(0.12 + ev.s * 0.35);
        break;
      }
      case 'shatter': this.fx.burst('chips', ev, 1.4, ev.mat === 'glass' ? '#e6f7ff' : '#3a7bd5'); this.fx.burst('sparkle', ev, 1, '#ffffff'); break;
      case 'down': this.fx.burst('sparkle', { x: ev.x, y: ev.y + 0.4, z: ev.z }, 0.6, '#fff1a8'); break;
      case 'bonus': this.fx.burst('sparkle', { x: ev.x, y: ev.y + 0.4, z: ev.z }, 2.5, '#ffcf3a'); break;
      case 'bomb': this.fx.burst('explosion', ev, 1); this.addShake(1.2); break;
      case 'bumper': {
        this.fx.burst('sparkle', ev, 1.2, '#ff8ad8');
        for (const rec of this.meshes.values()) {
          const p = rec.ent.initPos;
          if (rec.ent.kick && Math.hypot(p.x - ev.x, p.z - ev.z) < 1.5) rec.flashT = 0.25;
        }
        break;
      }
    }
  }

  celebrate(kind) {
    const c = this._focusPoint();
    const n = kind === 'strike' ? 2.2 : kind === 'spare' ? 1.4 : 1;
    this.fx.burst('confetti', { x: c.x, y: 1.5, z: c.z }, n);
    if (kind === 'strike') {
      this.fx.burst('confetti', { x: c.x - 2, y: 1, z: c.z + 1 }, 1);
      this.fx.burst('confetti', { x: c.x + 2, y: 1, z: c.z + 1 }, 1);
    }
  }

  addShake(a) { this.shake = Math.min(1.4, this.shake + a); }

  // --------------------------------------------------------------- camera
  _bounds() {
    const b = new THREE.Box3();
    for (const e of this.sim.entities) {
      if (e.look === 'rail' || e.look === 'backstop') continue;
      if (!e.target && !e.dynamic && !e.panel && !e.kick && e.look !== 'barrier' && e.look !== 'ramp') continue;
      const p = e.initPos;
      const r = Math.max(e.size[0], e.size[2]) / 2;
      b.expandByPoint(new THREE.Vector3(p.x - r, p.y + e.h / 2, p.z - r));
      b.expandByPoint(new THREE.Vector3(p.x + r, Math.max(0, p.y - e.h / 2), p.z + r));
    }
    return b;
  }

  _frame() {
    const b = this._bounds();
    const center = b.getCenter(new THREE.Vector3());
    const cam = this.level.camera || {};
    const pitch = (cam.pitch || 33) * (Math.PI / 180);
    const st = this.level.start || [0, 0, 0];
    const target = new THREE.Vector3((center.x + st[0]) / 2, Math.min(1.2, b.max.y * 0.25), (center.z * 0.75 + st[2] * 0.25));
    if (cam.target) target.set(...cam.target);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const corners = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const ballPt = new THREE.Vector3(st[0], (st[1] || 0) + 0.4, st[2]);
    const cam2 = this.camera.clone();
    let d = 6;
    const margin = this.camera.aspect < 0.8 ? 0.84 : 0.9;
    for (; d < 60; d += 0.25) {
      cam2.position.copy(target).addScaledVector(dir, d);
      cam2.lookAt(target);
      cam2.updateMatrixWorld();
      let ok = true;
      const bp = ballPt.clone().project(cam2);
      if (bp.z > 1 || bp.y < -0.86 || Math.abs(bp.x) > 0.9) ok = false;
      for (const c of ok ? corners : []) {
        const p = c.clone().project(cam2);
        if (Math.abs(p.x) > margin || p.y > margin - 0.12 || p.y < -0.97) { ok = false; break; }
      }
      if (ok) break;
    }
    d *= cam.zoom || 1;
    this.frame = { target, dir, d, center };
    // shadow camera covers level
    const ext = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.75 + 4;
    const sc = this.sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 80;
    sc.updateProjectionMatrix();
    this.sun.position.set(center.x + 8, 22, center.z + 10);
    this.sun.target.position.set(center.x, 0, center.z);
  }

  _focusPoint() {
    // centroid of fast-moving dynamic bodies, else the level centre
    let n = 0; const c = new THREE.Vector3();
    for (const rec of this.meshes.values()) {
      const e = rec.ent;
      if (e.removed || !e.dynamic || e.body.isSleeping()) continue;
      const v = e.body.linvel();
      if (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 1) continue;
      c.add(rec.obj.position); n++;
    }
    if (n < 2) return this.frame.target.clone();
    return c.multiplyScalar(1 / n);
  }

  updateCamera(dt, mode) {
    const f = this.frame;
    if (!f) return;
    let target = f.target.clone();
    let d = f.d;
    if (mode === 'rolling' || mode === 'won' || mode === 'settle') {
      let ball = null;
      for (const rec of this.ballMeshes.values()) if (rec.ball.active && rec.ball.body && !rec.ball.placeholder) { ball = rec.obj.position; break; }
      const sim = this.sim;
      if (ball && sim.firstImpactStep < 0) {
        // follow the ball a little
        target.lerp(new THREE.Vector3(ball.x, Math.max(0.3, ball.y * 0.6), ball.z), 0.35);
        d *= 0.92;
      } else {
        // frame the destruction
        const fp = this._focusPoint();
        target.lerp(new THREE.Vector3(fp.x, Math.min(1.5, Math.max(0.3, fp.y)), fp.z), 0.3);
        d *= 0.9;
      }
    }
    if (!this.camState) this.camState = { t: target.clone(), d };
    const k = 1 - Math.exp(-dt * 2.2);
    this.camState.t.lerp(target, k);
    this.camState.d = lerp(this.camState.d, d, k);
    const pos = this.camState.t.clone().addScaledVector(f.dir, this.camState.d);
    // shake
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.22;
    const t = performance.now() / 1000;
    pos.x += Math.sin(t * 47) * s; pos.y += Math.sin(t * 59 + 1) * s; pos.z += Math.sin(t * 37 + 2) * s * 0.5;
    this.camera.position.copy(pos);
    this.camera.lookAt(this.camState.t);
  }

  // ------------------------------------------------------------- aim guide
  _buildAim() {
    const group = new THREE.Group();
    const N = 46;
    const dot = new THREE.InstancedMesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }), N);
    dot.rotation.x = 0;
    dot.renderOrder = 15;
    dot.frustumCulled = false;
    group.add(dot);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 3), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }));
    arrow.renderOrder = 16;
    group.add(arrow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 48, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 15;
    group.add(ring);
    group.visible = false;
    return { group, dot, arrow, ring, N };
  }

  /** aim: {angle, power, spin} or null. Draws predicted path (no collisions). */
  setAim(aim) {
    const a = this.aim;
    this.aiming = !!aim;
    if (!aim || !this.sim || !this.sim.aimBall) { a.group.visible = false; return; }
    a.group.visible = true;
    const s = this.level.start || [0, 0, 0];
    const y = (s[1] || 0) + 0.03;
    let heading = aim.angle * (Math.PI / 180);
    let x = s[0], z = s[2];
    const length = 3 + aim.power * 9;
    const ds = length / a.N;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const col = new THREE.Color();
    let dist = 0;
    const kappa = SHOT.hookCurvature * 0.74 * aim.spin; // effective rolling curvature
    for (let i = 0; i < a.N; i++) {
      const ramp = clamp((dist - SHOT.hookStartDist) / SHOT.hookRampDist, 0, 1);
      heading += kappa * ramp * ds;
      x += Math.sin(heading) * ds; z -= Math.cos(heading) * ds;
      dist += ds;
      const surfY = this._surfaceY(x, z, y);
      const k = i / a.N;
      const sc = (1 - k * 0.5) * (i % 2 ? 0.75 : 1);
      m.compose(new THREE.Vector3(x, surfY + 0.02, z), q, new THREE.Vector3(sc, sc, sc));
      a.dot.setMatrixAt(i, m);
      col.setHSL(0.33 - aim.power * 0.33, 0.9, 0.62 + (1 - k) * 0.2);
      a.dot.setColorAt(i, col);
    }
    a.dot.instanceMatrix.needsUpdate = true;
    if (a.dot.instanceColor) a.dot.instanceColor.needsUpdate = true;
    const surfY = this._surfaceY(x, z, y);
    a.arrow.position.set(x, surfY + 0.25, z);
    a.arrow.rotation.set(-Math.PI / 2, 0, -heading);
    a.arrow.material.color.setHSL(0.33 - aim.power * 0.33, 0.9, 0.6);
    const bp = this.sim.aimBall.body.translation();
    a.ring.position.set(bp.x, (s[1] || 0) + 0.02, bp.z);
    const rs = 0.9 + aim.power * 0.6;
    a.ring.scale.set(rs, rs, rs);
    a.ring.material.color.setHSL(0.33 - aim.power * 0.33, 0.9, 0.6);
  }

  _surfaceY(x, z, fallback) {
    // approximate: ramps follow their slope, otherwise floor height
    for (const e of this.sim.entities) {
      if (e.look !== 'ramp' && e.look !== 'stage' && e.look !== 'platform') continue;
      const p = e.initPos;
      const hx = e.size[0] / 2;
      if (e.look === 'ramp') {
        const L = e.size[2] / 2;
        const rx = e.spec.rot ? e.spec.rot[0] * (Math.PI / 180) : 0;
        const dz = z - p.z;
        if (Math.abs(x - p.x) < hx && Math.abs(dz) < L * Math.cos(rx)) {
          return p.y + (e.size[1] / 2) / Math.cos(rx) - Math.tan(rx) * dz;
        }
      } else if (Math.abs(x - p.x) < hx && Math.abs(z - p.z) < e.size[2] / 2) {
        return p.y + e.h / 2;
      }
    }
    return fallback < 0.1 ? 0.0 : fallback;
  }

  // ------------------------------------------------------------- helpers
  project(p) {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight, behind: v.z > 1 };
  }

  /** Screen -> world point on plane y = h. */
  screenToPlane(sx, sy, h) {
    const ndc = new THREE.Vector2((sx / this.canvas.clientWidth) * 2 - 1, -(sy / this.canvas.clientHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }

  render() { this.r.render(this.scene, this.camera); }
}
