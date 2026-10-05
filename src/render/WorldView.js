import * as THREE from 'three';
import { BALANCE } from '../data/balance.js';
import { BUILDINGS } from '../data/buildings.js';
import { footprint } from '../core/entities/Building.js';
import { checkPlacement } from '../core/world/Placement.js';
import { PAL } from './palette.js';
import { mat, wobble, hashNoise, eggGeometry } from './geo.js';
import { buildModel, scaffold, bake } from './BuildingModels.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

// Everything in the world that isn't a Grandma.
export class WorldView {
  constructor(scene, crowd, effects) {
    this.scene = scene;
    this.crowd = crowd;
    this.effects = effects;
    this.buildings = new Map();
    this.nodes = new Map();
    this._ground();
    this._decor();
    this._player();
    this.eggGeo = eggGeometry(0.25, 0.18, 12);
    this.eggs = new THREE.InstancedMesh(this.eggGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), 2000);
    this.eggs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eggs.frustumCulled = false;
    this.eggs.count = 0;
    scene.add(this.eggs);
    this.ghost = null;
    this.ghostKey = '';
  }

  // ---- static scenery -----------------------------------------------------------

  _ground() {
    const size = 170, seg = 85;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const g1 = new THREE.Color(PAL.grass), g2 = new THREE.Color(PAL.grassDark), dirt = new THREE.Color(PAL.path), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = hashNoise(Math.round(x * 0.7), 0, Math.round(z * 0.7), 2);
      c.copy(g1).lerp(g2, n * 0.7);
      // Worn yard in front of the cottage, fading out.
      const yard = Math.max(0, 1 - Math.hypot(x * 0.8, (z + 1) * 1.1) / 9);
      // A path toward the berry hedge and one toward the woods.
      const path1 = Math.max(0, 1 - Math.abs(z - 1 - (x + 3) * -0.12) / 1.2) * (x < -3 && x > -12 ? 1 : 0);
      const path2 = Math.max(0, 1 - Math.abs(z + 4 - (x - 4) * -0.55) / 1.2) * (x > 4 && x < 16 ? 1 : 0);
      c.lerp(dirt, Math.min(0.85, yard * 1.4 + path1 * 0.6 + path2 * 0.6));
      // Out of bounds darker.
      if (Math.abs(x) > BALANCE.worldHalf + 2 || Math.abs(z) > BALANCE.worldHalf + 2) c.multiplyScalar(0.85);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      pos.setY(i, (hashNoise(Math.round(x), 1, Math.round(z), 5) - 0.5) * 0.06);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.name = 'ground';
    this.scene.add(ground);
    this.ground = ground;
  }

  _decor() {
    // Ring of border trees (instanced) so the world feels enclosed.
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 7);
    trunkGeo.translate(0, 0.8, 0);
    const canopyGeo = wobble(new THREE.IcosahedronGeometry(1.4, 1), 0.25, 3);
    canopyGeo.translate(0, 2.6, 0);
    const N = 220;
    const trunks = new THREE.InstancedMesh(trunkGeo, mat(PAL.bark), N);
    const canopies = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), N);
    const c = new THREE.Color();
    let k = 0;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + hashNoise(i, 2, 3) * 0.05;
      const H = BALANCE.worldHalf;
      // Points on a rounded square just outside the bounds.
      const r = H + 4 + hashNoise(i, 9, 1) * 9;
      const sq = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      const rr = Math.min(r * sq, r * 1.25);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const s = 0.9 + hashNoise(i, 4, 4) * 0.9;
      _m.compose(_v.set(x, 0, z), _q.setFromEuler(_e.set(0, a * 3, 0)), _s.set(s, s, s));
      trunks.setMatrixAt(k, _m); canopies.setMatrixAt(k, _m);
      canopies.setColorAt(k, c.set([PAL.leaf, PAL.leafDark, PAL.leafLight][i % 3]));
      k++;
    }
    trunks.count = canopies.count = k;
    this.scene.add(trunks, canopies);

    // Flowers dotted around.
    const fgeo = new THREE.IcosahedronGeometry(0.09, 0);
    const flowers = new THREE.InstancedMesh(fgeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), 400);
    for (let i = 0; i < 400; i++) {
      const x = (hashNoise(i, 1, 7) - 0.5) * 84, z = (hashNoise(i, 3, 9) - 0.5) * 84;
      if (Math.hypot(x, z + 2) < 9) { flowers.setMatrixAt(i, _m.makeScale(0, 0, 0)); flowers.setColorAt(i, c.set(0xffffff)); continue; }
      _m.makeTranslation(x, 0.1, z);
      flowers.setMatrixAt(i, _m);
      flowers.setColorAt(i, c.set([0xffffff, 0xf2c94c, 0xe0607e, 0xcdb9de][i % 4]));
    }
    this.scene.add(flowers);

    // Low picket fence round the cottage garden (decorative, gaps for paths).
    const post = new THREE.BoxGeometry(0.12, 0.7, 0.12);
    post.translate(0, 0.35, 0);
    const posts = new THREE.InstancedMesh(post, mat(0xf3ead2), 80);
    let p = 0;
    for (let x = -9; x <= 9; x += 0.9) {
      if (Math.abs(x) < 1.6) continue;
      posts.setMatrixAt(p++, _m.makeTranslation(x, 0, -11.5));
    }
    posts.count = p;
    this.scene.add(posts);
  }

  _player() {
    const g = new THREE.Group();
    const coat = mat(0xf2c14e);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.45, 4, 10), coat);
    body.position.y = 0.62;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), mat(0xf0c39f));
    head.position.y = 1.18;
    g.add(head);
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3f6fa0));
    hat.position.y = 1.22; hat.rotation.x = -0.15;
    g.add(hat);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xf3ead2));
    pom.position.set(0, 1.52, -0.05);
    g.add(pom);
    for (const x of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mat(0x2a1f1b));
      eye.position.set(x, 1.2, 0.25);
      g.add(eye);
    }
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 10, 1, true), mat(0xb98a4e, { side: THREE.DoubleSide }));
    basket.position.set(0, 0.85, -0.33);
    g.add(basket);
    const legs = [];
    for (const x of [-0.13, 0.13]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.2, 3, 6), mat(0x4a5a6a));
      leg.position.set(x, 0.2, 0);
      g.add(leg); legs.push(leg);
    }
    const arms = [];
    for (const x of [-0.36, 0.36]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.85, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.28, 3, 6), coat);
      arm.position.y = -0.2;
      pivot.add(arm);
      g.add(pivot); arms.push(pivot);
    }
    // Carry stack visual: little blocks peeking out of the basket.
    const blockGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const carry = [];
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(blockGeo, mat(0xffffff));
      b.position.set(((i % 3) - 1) * 0.15, 1.1 + Math.floor(i / 3) * 0.13, -0.33 + ((i % 2) - 0.5) * 0.08);
      b.visible = false;
      g.add(b); carry.push(b);
    }
    const heldEgg = new THREE.Mesh(eggGeometry(0.2, 0.14, 12), new THREE.MeshLambertMaterial({ vertexColors: true }));
    heldEgg.position.set(0, 0.8, 0.42);
    heldEgg.visible = false;
    g.add(heldEgg);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: 0x23301a, transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
    g.add(shadow);
    this.scene.add(g);
    this.player = { g, legs, arms, carry, heldEgg, body };
    this.carryMats = { food: mat(PAL.berry), wood: mat(PAL.wood), stone: mat(PAL.stone) };
  }

  // ---- nodes -----------------------------------------------------------------

  _nodeView(n) {
    const g = new THREE.Group();
    const seed = n.id;
    if (n.type === 'tree') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.6, 7), mat(PAL.bark));
      trunk.position.y = 0.8;
      g.add(trunk);
      const canopy = new THREE.Group();
      const col = [PAL.leaf, PAL.leafDark, PAL.leafLight][seed % 3];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(wobble(new THREE.IcosahedronGeometry(0.85 - i * 0.18, 1), 0.2, seed + i), mat(col, { flatShading: true }));
        m.position.set((hashNoise(seed, i, 1) - 0.5) * 0.5, 1.9 + i * 0.6, (hashNoise(seed, i, 2) - 0.5) * 0.5);
        canopy.add(m);
      }
      g.add(canopy);
      g.userData.canopy = canopy;
    } else if (n.type === 'bush') {
      const m = new THREE.Mesh(wobble(new THREE.IcosahedronGeometry(0.75, 1), 0.2, seed), mat(PAL.leafDark, { flatShading: true }));
      m.position.y = 0.55; m.scale.set(1, 0.8, 1);
      g.add(m);
      const berries = [];
      for (let i = 0; i < BALANCE.nodes.bush.charges; i++) {
        const a = i * 1.3 + seed, h = 0.35 + hashNoise(seed, i, 4) * 0.5;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(PAL.berry));
        b.position.set(Math.cos(a) * 0.68, h, Math.sin(a) * 0.68);
        g.add(b); berries.push(b);
      }
      g.userData.berries = berries;
    } else {
      const parts = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(wobble(new THREE.DodecahedronGeometry(0.75 - i * 0.18, 0), 0.15, seed + i), mat(i ? PAL.stone : PAL.stoneDark, { flatShading: true }));
        m.position.set((i - 1) * 0.45, 0.35 - i * 0.05, (hashNoise(seed, i, 3) - 0.5) * 0.5);
        m.rotation.set(seed, i, seed * 0.5);
        parts.add(m);
      }
      g.add(parts);
      g.userData.parts = parts;
    }
    bake(g, [g.userData.canopy, g.userData.parts, ...(g.userData.berries || [])]);
    if (g.userData.canopy) bake(g.userData.canopy);
    if (g.userData.parts) bake(g.userData.parts);
    g.position.set(n.x, 0, n.z);
    g.scale.setScalar(n.s);
    g.rotation.y = hashNoise(seed, 1, 1) * 6;
    this.scene.add(g);
    return g;
  }

  _syncNodes(s, time) {
    for (const n of s.nodes) {
      let v = this.nodes.get(n.id);
      if (!v) { v = this._nodeView(n); this.nodes.set(n.id, v); }
      const max = BALANCE.nodes[n.type].charges;
      const k = n.charges / max;
      if (v.userData.berries) v.userData.berries.forEach((b, i) => (b.visible = i < n.charges));
      if (v.userData.canopy) v.userData.canopy.scale.setScalar(0.55 + 0.45 * k);
      if (v.userData.parts) v.userData.parts.scale.setScalar(0.55 + 0.45 * k);
      // Wiggle when hit.
      if (v.userData.hitT && time - v.userData.hitT < 0.25) {
        const w = Math.sin((time - v.userData.hitT) * 60) * 0.06;
        v.rotation.z = w;
      } else v.rotation.z = 0;
    }
  }

  hitNode(id, time) {
    const v = this.nodes.get(id);
    if (v) v.userData.hitT = time;
  }

  // ---- buildings ----------------------------------------------------------------

  _buildingView(b) {
    const group = new THREE.Group();
    const model = buildModel(b.type);
    group.add(model);
    const [w, d] = BUILDINGS[b.type].size;
    const sc = scaffold(w + 0.2, d + 0.2);
    group.add(sc);
    group.position.set(b.x, 0, b.z);
    group.rotation.y = (b.rot * Math.PI) / 2;
    this.scene.add(group);
    return { group, model, scaffold: sc, built: null, ud: model.userData };
  }

  _syncBuildings(sim, time, dt) {
    const s = sim.state;
    for (const b of s.buildings) {
      let v = this.buildings.get(b.id);
      if (!v) { v = this._buildingView(b); this.buildings.set(b.id, v); }
      if (v.built !== b.built || !b.built) {
        v.scaffold.visible = !b.built;
        const k = b.built ? 1 : 0.08 + b.progress * 0.92;
        v.model.scale.set(1, k, 1);
        if (b.built && v.built === false) {
          // Completion pop.
          v.popT = time;
          this.effects.burst('dust', b.x, 0.3, b.z, 18);
          this.effects.burst('sparkle', b.x, 1.5, b.z, 12);
        }
        v.built = b.built;
      }
      if (v.popT && time - v.popT < 0.4) {
        const t = (time - v.popT) / 0.4;
        const sq = 1 + Math.sin(t * Math.PI) * 0.12;
        v.model.scale.set(sq, 2 - sq, sq);
      } else if (b.built) v.model.scale.set(1, 1, 1);

      if (b.inc && b.built) {
        if (b.inc.slots) this._animAutoInc(b, v, sim, time);
        else this._animManualInc(b, v, time, dt);
      }
      if ((b.type === 'farm' || b.type === 'bigfarm') && v.ud.crops) {
        const busy = b.workers.length > 0;
        for (let i = 0; i < v.ud.crops.length; i++) {
          const c = v.ud.crops[i];
          c.scale.y = 0.75 + (busy ? Math.max(0, Math.sin(time * 2 + i)) * 0.15 : 0);
        }
      }
      if (b.type === 'bell' && v.ud.bellPivot) {
        const ring = v.ringT && time - v.ringT < 1.2;
        v.ud.bellPivot.rotation.z = ring ? Math.sin((time - v.ringT) * 18) * 0.5 * (1 - (time - v.ringT) / 1.2) : 0;
      }
    }
  }

  ringBell(id, time) {
    const v = this.buildings.get(id);
    if (v) v.ringT = time;
  }

  _animManualInc(b, v, time, dt) {
    const u = v.ud;
    const inc = b.inc;
    const st = inc.stage;
    // Lid: open when empty/loaded, closed otherwise. Flies open on hatch.
    const lidTarget = st === 'empty' || st === 'loaded' ? -1.15 : 0;
    u.lidPivot.rotation.x += (lidTarget - u.lidPivot.rotation.x) * Math.min(1, dt * (st === 'empty' ? 14 : 8));
    u.egg.visible = st !== 'empty';
    u.knob.rotation.z = -inc.dial * 1.9 + 0.95;
    // Shake and glow while heating / cracking.
    const shaking = st === 'heating' || st === 'cracking';
    const amp = st === 'cracking' ? 0.05 : st === 'heating' ? 0.025 : 0;
    u.body.position.set(shaking ? Math.sin(time * 70) * amp : 0, shaking ? Math.abs(Math.sin(time * 45)) * amp : 0, 0);
    u.body.rotation.z = shaking ? Math.sin(time * 33) * amp * 0.6 : 0;
    const heat = st === 'heating' ? Math.min(1, inc.t / 1.0) : st === 'cracking' ? 1 : 0;
    u.glass.material.emissive.setRGB(heat * 0.8, heat * 0.45, heat * 0.1);
    u.glass.material.opacity = 0.35 + heat * 0.3;
    // Egg wobble & cracks.
    const wob = st === 'cracking' ? 0.35 : st === 'heating' ? 0.12 : st === 'loaded' || st === 'closed' ? 0.03 : 0;
    u.egg.rotation.z = Math.sin(time * (st === 'cracking' ? 16 : 7)) * wob;
    u.egg.rotation.x = Math.cos(time * 11) * wob * 0.5;
    u.cracks.visible = st === 'cracking';
    if (st === 'cracking') u.cracks.scale.setScalar(0.5 + Math.min(1, inc.t / 1.4) * 0.6);
    // Steam from the vent.
    if (shaking && Math.random() < dt * 8) {
      const p = u.vent.clone();
      v.group.localToWorld(p);
      this.effects.burst('steam', p.x, p.y, p.z, 1);
    }
  }

  _animAutoInc(b, v, sim, time) {
    const u = v.ud;
    u.lamp.material.color.set(b.autoOn ? 0x6fae4c : 0xb8593f);
    u.lamp.material.emissive.set(b.autoOn ? 0x2a5a1a : 0x3a1a10);
    const time0 = BUILDINGS[b.type].incubator.time;
    for (let i = 0; i < u.glasses.length; i++) {
      const k = b.inc.slots[i] ? b.inc.t[i] / time0 : 0;
      u.glasses[i].material.emissive.setRGB(k * 0.7, k * 0.4, k * 0.1);
    }
    let busy = b.inc.slots.some(Boolean);
    v.model.position.x = busy ? Math.sin(time * 50) * 0.008 : 0;
    if (busy && Math.random() < 0.05) {
      const p = u.vent.clone();
      v.group.localToWorld(p);
      this.effects.burst('steam', p.x, p.y, p.z, 1);
    }
  }

  // World position of a manual Gran-ulator's egg (for hatch effects).
  incubatorEggWorld(id) {
    const v = this.buildings.get(id);
    if (!v) return null;
    const p = new THREE.Vector3();
    if (v.ud.egg) v.ud.egg.getWorldPosition(p); else v.group.getWorldPosition(p);
    p.y += 0.3;
    return p;
  }

  // ---- eggs ------------------------------------------------------------------------

  _syncEggs(sim, time) {
    const s = sim.state;
    const perContainer = new Map();
    let n = 0;
    const put = (x, y, z, rx = 0, rz = 0, sc = 1) => {
      _e.set(rx, 0, rz);
      _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(sc, sc, sc));
      this.eggs.setMatrixAt(n++, _m);
    };
    for (const e of s.eggs) {
      if (n >= 1999) break;
      switch (e.loc) {
        case 'store': {
          const b = sim.getBuilding(e.container);
          if (!b) break;
          const k = perContainer.get(b.id) || 0;
          perContainer.set(b.id, k + 1);
          let lx, ly, lz;
          if (b.type === 'basket') {
            const a = k * 2.4; const r = k === 0 ? 0 : 0.32;
            lx = Math.cos(a) * r; lz = Math.sin(a) * r; ly = 0.2 + (k > 6 ? 0.22 : 0);
          } else {
            lx = ((k % 4) - 1.5) * 0.36; lz = (Math.floor(k / 4) % 2 - 0.5) * 0.4; ly = 0.45 + Math.floor(k / 8) * 0.25;
          }
          const [wx, wz] = rotLocal(b, lx, lz);
          put(wx, ly, wz, Math.sin(k * 3.1) * 0.2, Math.cos(k * 1.7) * 0.25);
          break;
        }
        case 'ground':
          put(e.x, 0.02, e.z, 0, Math.sin(e.id) * 0.3);
          break;
        case 'grandma': {
          const g = sim.getGrandma(e.container);
          if (!g) break;
          const k = perContainer.get(-g.id) || 0;
          perContainer.set(-g.id, k + 1);
          const top = this.crowd.headTop(g);
          put(g.x + Math.sin(g.rot) * 0.05, top + k * 0.27, g.z + Math.cos(g.rot) * 0.05, Math.sin(time * 6 + k) * 0.1, Math.sin(time * 5 + g.id + k) * 0.15);
          break;
        }
        case 'incubator': {
          const b = sim.getBuilding(e.container);
          if (!b || !b.inc.slots) break; // manual one draws its own egg
          const v = this.buildings.get(b.id);
          if (!v || !v.ud.slotPos) break;
          const sp = v.ud.slotPos[e.slot];
          _v.copy(sp);
          v.group.localToWorld(_v);
          const k = b.inc.t[e.slot] / BUILDINGS[b.type].incubator.time;
          const wob = k > 0.75 ? Math.sin(time * 18 + e.slot) * 0.3 * (k - 0.6) * 2 : 0;
          put(_v.x, _v.y, _v.z, 0, wob, 0.7);
          break;
        }
      }
    }
    this.eggs.count = n;
    this.eggs.instanceMatrix.needsUpdate = true;
  }

  // ---- player ---------------------------------------------------------------------

  _syncPlayer(s, time) {
    const P = this.player;
    const p = s.player;
    P.g.position.set(p.x, 0, p.z);
    P.g.rotation.y = p.rot;
    const speed = Math.hypot(p.vx, p.vz);
    const walk = Math.min(1, speed / 4);
    const w = Math.sin(time * (p.sprint ? 16 : 11));
    P.legs[0].position.z = w * 0.15 * walk; P.legs[1].position.z = -w * 0.15 * walk;
    P.body.position.y = 0.62 + Math.abs(w) * 0.05 * walk;
    let a0 = -w * 0.7 * walk, a1 = w * 0.7 * walk;
    if (p.action === 'gather' || p.action === 'build') { const sw = Math.sin(time * 22); a0 = a1 = -1.6 + sw * 0.8; }
    if (p.action === 'dial') { a1 = -1.4 + Math.sin(time * 12) * 0.3; }
    if (p.egg) { a0 = a1 = -1.2; }
    P.arms[0].rotation.x = a0; P.arms[1].rotation.x = a1;
    P.heldEgg.visible = !!p.egg;
    let i = 0;
    for (const r of ['wood', 'stone', 'food']) {
      for (let k = 0; k < p.carry[r] && i < 12; k++, i++) {
        P.carry[i].visible = true;
        P.carry[i].material = this.carryMats[r];
      }
    }
    for (; i < 12; i++) P.carry[i].visible = false;
    P.g.visible = s.phase === 'day' || s.nightTime < 0.6;
  }

  // ---- placement ghost --------------------------------------------------------------

  updateGhost(sim, type, cx, cz, rot) {
    if (!type) { if (this.ghost) this.ghost.visible = false; return null; }
    const key = type;
    if (this.ghostKey !== key) {
      if (this.ghost) this.scene.remove(this.ghost);
      const g = new THREE.Group();
      const model = buildModel(type);
      this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x6fae4c, transparent: true, opacity: 0.45, depthWrite: false });
      model.traverse((o) => { if (o.isMesh) o.material = this.ghostMat; });
      g.add(model);
      const [w, d] = BUILDINGS[type].size;
      this.ghostPad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x6fae4c, transparent: true, opacity: 0.35, depthWrite: false }));
      this.ghostPad.rotation.x = -Math.PI / 2; this.ghostPad.position.y = 0.04;
      g.add(this.ghostPad);
      this.scene.add(g);
      this.ghost = g;
      this.ghostKey = key;
    }
    const chk = checkPlacement(sim.state, type, cx, cz, rot);
    const [w, d] = footprint(type, rot);
    this.ghost.visible = true;
    this.ghost.position.set(cx + w / 2, 0, cz + d / 2);
    this.ghost.rotation.y = (rot * Math.PI) / 2;
    const col = chk.ok ? 0x6fae4c : 0xd2453a;
    this.ghostMat.color.set(col);
    this.ghostPad.material.color.set(col);
    return chk;
  }

  update(sim, time, dt) {
    const s = sim.state;
    this._syncNodes(s, time);
    this._syncBuildings(sim, time, dt);
    this._syncEggs(sim, time);
    this._syncPlayer(s, time);
  }
}

function rotLocal(b, lx, lz) {
  let x = lx, z = lz;
  switch (b.rot & 3) {
    case 1: x = lz; z = -lx; break;
    case 2: x = -lx; z = -lz; break;
    case 3: x = -lz; z = lx; break;
  }
  return [b.x + x, b.z + z];
}
