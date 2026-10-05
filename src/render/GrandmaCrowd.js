import * as THREE from 'three';
import { PAL } from './palette.js';
import { merge, place, tint, wobble } from './geo.js';

// One Grandma "rig" built from ~15 simple authored parts. Every part is an
// InstancedMesh shared by the whole crowd, so 300 Grandmas cost ~30 draw
// calls. Animation is computed on the CPU per instance (cheap matrix maths).
//
// Fixed-index parts (index == Grandma index): body, cardigan, shawl, hair,
// face, arms(x2), slippers(x2), shadow.
// Compacted parts (filled per frame): bun variants, glasses variants, job
// hats, carried items, status icons.

const MAX = 1200;
const LOD_FAR = 42; // beyond this, skip faces/glasses/limbs

const _m = new THREE.Matrix4();
const _p = new THREE.Matrix4();
const _o = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function lm(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

function buildGeometries() {
  const G = {};
  G.body = wobble(new THREE.SphereGeometry(0.5, 22, 16), 0.025, 2);
  place(G.body, 0, 0.5, 0, 0, 0, 0, 1, 0.98, 0.95);

  const prof = [[0.34, 0.04], [0.45, 0.12], [0.525, 0.25], [0.54, 0.35], [0.52, 0.43], [0.47, 0.49]].map(([x, y]) => new THREE.Vector2(x, y));
  G.cardigan = wobble(new THREE.LatheGeometry(prof, 22), 0.02, 5);

  G.shawl = new THREE.TorusGeometry(0.4, 0.1, 8, 22);
  place(G.shawl, 0, 0.49, 0.0, Math.PI / 2, 0, 0, 1.08, 1.02, 0.6);

  G.hair = new THREE.SphereGeometry(0.515, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.44);
  place(G.hair, 0, 0.53, -0.02, -0.5, 0, 0, 1, 0.92, 0.97);
  wobble(G.hair, 0.03, 9);

  // Bun variants (hair colour)
  G.bun = [
    tint(place(wobble(new THREE.SphereGeometry(0.17, 12, 10), 0.03, 3), 0, 1.0, -0.12), 0xffffff),
    merge([
      place(new THREE.SphereGeometry(0.125, 10, 8), -0.21, 0.93, -0.1),
      place(new THREE.SphereGeometry(0.125, 10, 8), 0.21, 0.93, -0.1),
    ]),
    merge([
      place(wobble(new THREE.SphereGeometry(0.16, 12, 10), 0.03, 4), 0, 1.08, -0.1, 0, 0, 0, 1, 1.55, 1),
      tint(place(new THREE.TorusGeometry(0.06, 0.025, 5, 10), 0, 0.88, -0.24, 0.3, 0, 0), 0xffffff),
    ]),
  ];

  // Glasses variants (frame colour). Eyes sit at y=0.62, z≈0.44.
  const lens = (r, tube, radial, tubular, rotZ, x) =>
    place(new THREE.TorusGeometry(r, tube, radial, tubular), x, 0.625, 0.47, 0, x > 0 ? 0.22 : -0.22, rotZ);
  const bridge = () => place(new THREE.CylinderGeometry(0.016, 0.016, 0.1, 5), 0, 0.64, 0.5, 0, 0, Math.PI / 2);
  const temples = () => [
    place(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 4), -0.27, 0.63, 0.32, Math.PI / 2, 0, 0.35),
    place(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 4), 0.27, 0.63, 0.32, Math.PI / 2, 0, -0.35),
  ];
  G.glasses = [
    merge([lens(0.105, 0.02, 5, 16, 0, -0.15), lens(0.105, 0.02, 5, 16, 0, 0.15), bridge(), ...temples()]),
    merge([lens(0.12, 0.022, 4, 4, Math.PI / 4, -0.155), lens(0.12, 0.022, 4, 4, Math.PI / 4, 0.155), bridge(), ...temples()]),
    merge([lens(0.135, 0.028, 5, 6, Math.PI / 6, -0.16), lens(0.135, 0.028, 5, 6, Math.PI / 6, 0.16), bridge(), ...temples()]),
  ];

  // Face + buttons (constant colours, vertex coloured).
  const eye = (x) => tint(place(new THREE.SphereGeometry(0.045, 8, 6), x, 0.615, 0.44, 0, 0, 0, 1, 1.15, 0.6), 0x2a1f1b);
  const glint = (x) => tint(place(new THREE.SphereGeometry(0.014, 5, 4), x + 0.014, 0.632, 0.468), 0xffffff);
  const cheek = (x) => tint(place(new THREE.SphereGeometry(0.07, 8, 6), x, 0.52, 0.39, 0, x > 0 ? 0.55 : -0.55, 0, 1, 0.65, 0.4), 0xec9a9a);
  const mouth = tint(place(new THREE.TorusGeometry(0.045, 0.012, 4, 8, Math.PI), 0, 0.52, 0.462, 0, 0, Math.PI), 0x6a3a30);
  const nose = tint(place(new THREE.SphereGeometry(0.05, 8, 6), 0, 0.57, 0.48, 0, 0, 0, 1, 0.85, 0.8), 0xe9a88c);
  const button = (y, z) => tint(place(new THREE.SphereGeometry(0.03, 6, 5), 0, y, z), 0xf3ead2);
  G.face = merge([eye(-0.15), eye(0.15), glint(-0.15), glint(0.15), cheek(-0.27), cheek(0.27), mouth, nose, button(0.37, 0.535), button(0.26, 0.54), button(0.15, 0.5)]);

  // Arm with mitten, pivot at the shoulder (origin), hanging down -y.
  G.arm = merge([
    place(new THREE.CapsuleGeometry(0.075, 0.2, 4, 8), 0, -0.14, 0),
    tint(place(new THREE.SphereGeometry(0.075, 8, 6), 0, -0.28, 0.01), 0xf2ead8),
  ]);
  G.slipper = merge([
    place(new THREE.SphereGeometry(0.12, 10, 6), 0, 0.045, 0.06, 0, 0, 0, 1, 0.55, 1.45),
    tint(place(new THREE.SphereGeometry(0.045, 6, 5), 0, 0.09, 0.2), 0xffffff), // pom-pom
  ]);
  G.shadow = new THREE.CircleGeometry(0.55, 16);
  place(G.shadow, 0, 0.02, 0, -Math.PI / 2, 0, 0);

  // Job hats (vertex coloured, sit on the head; hide the bun).
  G.hats = {
    farmer: merge([
      tint(place(new THREE.CylinderGeometry(0.46, 0.5, 0.04, 16), 0, 0.92, -0.02, -0.15, 0, 0), PAL.thatch),
      tint(place(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 12), 0, 1.02, -0.04, -0.15, 0, 0), PAL.thatch),
      tint(place(new THREE.CylinderGeometry(0.265, 0.265, 0.06, 12), 0, 0.96, -0.03, -0.15, 0, 0), 0xb8593f),
    ]),
    lumber: merge([
      tint(place(new THREE.SphereGeometry(0.33, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.84, -0.03, -0.2, 0, 0), 0xb8333a),
      tint(place(new THREE.TorusGeometry(0.3, 0.05, 6, 14), 0, 0.85, -0.03, Math.PI / 2 - 0.2, 0, 0), 0x2f2f2f),
      tint(place(new THREE.SphereGeometry(0.09, 8, 6), 0, 1.17, -0.1), 0xf2ead8),
    ]),
    miner: merge([
      tint(place(new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.86, -0.03, -0.15, 0, 0), 0x6b6f78),
      tint(place(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 14), 0, 0.86, 0.0, -0.15, 0, 0), 0x55585f),
      tint(place(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 8), 0, 1.0, 0.27, Math.PI / 2 - 0.4, 0, 0), 0xfff2a8),
    ]),
    builder: merge([
      tint(place(new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.86, -0.03, -0.15, 0, 0), 0xe58a2e),
      tint(place(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 14), 0, 0.86, 0.04, -0.15, 0, 0), 0xd3771f),
    ]),
    foreman: merge([
      tint(place(new THREE.CylinderGeometry(0.2, 0.22, 0.32, 12), 0, 1.06, -0.05, -0.12, 0, 0), 0x2b2b33),
      tint(place(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 14), 0, 0.91, -0.03, -0.12, 0, 0), 0x2b2b33),
      tint(place(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 12), 0, 0.95, -0.04, -0.12, 0, 0), 0xb8333a),
    ]),
  };

  // Carried items (held in front at chest height).
  const turnip = merge([
    tint(place(new THREE.SphereGeometry(0.14, 10, 8), 0, 0, 0, 0, 0, 0, 1, 1.05, 1), 0xe9dff0),
    tint(place(new THREE.SphereGeometry(0.1, 8, 6), 0, 0.04, 0, 0, 0, 0, 1.25, 0.7, 1.25), 0x9b5aa6),
    tint(place(new THREE.ConeGeometry(0.05, 0.2, 5), -0.04, 0.2, 0, 0, 0, 0.3), PAL.crop),
    tint(place(new THREE.ConeGeometry(0.05, 0.22, 5), 0.04, 0.21, 0, 0, 0, -0.3), PAL.crop),
  ]);
  const logs = merge([
    tint(place(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 7), 0, 0, 0, 0, 0, Math.PI / 2), PAL.bark),
    tint(place(new THREE.CylinderGeometry(0.065, 0.065, 0.4, 7), 0.02, 0.12, 0.02, 0, 0.1, Math.PI / 2), PAL.wood),
    tint(place(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 7), 0, 0, 0.13, 0, 0, Math.PI / 2), PAL.bark),
  ]);
  const rock = tint(wobble(new THREE.DodecahedronGeometry(0.16, 0), 0.04, 7), PAL.stone);
  const plank = tint(place(new THREE.BoxGeometry(0.7, 0.06, 0.16), 0, 0, 0, 0, 0.2, 0.15), PAL.plank);
  const tea = merge([
    tint(place(new THREE.CylinderGeometry(0.07, 0.055, 0.09, 10), 0, 0.04, 0), 0xffffff),
    tint(place(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 12), 0, -0.01, 0), 0xffffff),
    tint(place(new THREE.TorusGeometry(0.03, 0.01, 4, 8), 0.08, 0.05, 0, 0, 0, 0), 0xffffff),
    tint(place(new THREE.CylinderGeometry(0.06, 0.06, 0.005, 10), 0, 0.08, 0), 0x8a5a3a),
  ]);
  G.items = { food: turnip, wood: logs, stone: rock, material: plank, tea };
  return G;
}

function makeIconAtlas() {
  const S = 64, names = ['hungry', 'sleep', 'confused', 'heart', 'bell', 'nobed'];
  const c = document.createElement('canvas');
  c.width = S * names.length; c.height = S;
  const g = c.getContext('2d');
  names.forEach((n, i) => {
    const x = i * S + S / 2, y = S / 2;
    g.save();
    g.translate(x, y);
    const bubble = (fill) => {
      g.fillStyle = fill; g.strokeStyle = '#3b2a20'; g.lineWidth = 4;
      g.beginPath(); g.arc(0, -2, 24, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-6, 20); g.lineTo(0, 30); g.lineTo(6, 20); g.fill();
    };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (n === 'hungry') {
      bubble('#fff4e6');
      g.fillStyle = '#ffffff'; g.strokeStyle = '#c23b3b'; g.lineWidth = 4;
      g.beginPath(); g.arc(0, -2, 13, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = '#c23b3b'; g.beginPath(); g.moveTo(-10, -12); g.lineTo(10, 8); g.stroke();
    } else if (n === 'sleep') {
      g.fillStyle = '#4a6fa5'; g.font = 'bold 34px Georgia'; g.fillText('z', -6, 4); g.font = 'bold 22px Georgia'; g.fillText('z', 12, -14);
    } else if (n === 'confused') {
      bubble('#fff4e6'); g.fillStyle = '#3b2a20'; g.font = 'bold 32px Georgia'; g.fillText('?', 0, 0);
    } else if (n === 'heart') {
      g.fillStyle = '#e0607e';
      g.beginPath(); g.moveTo(0, 18); g.bezierCurveTo(-30, -4, -14, -26, 0, -10); g.bezierCurveTo(14, -26, 30, -4, 0, 18); g.fill();
    } else if (n === 'bell') {
      g.fillStyle = '#c9a14a'; g.strokeStyle = '#3b2a20'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-14, 12); g.quadraticCurveTo(-14, -18, 0, -18); g.quadraticCurveTo(14, -18, 14, 12); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, 15, 4, 0, Math.PI * 2); g.fill();
    } else if (n === 'nobed') {
      bubble('#e6eef8'); g.fillStyle = '#4a6fa5'; g.font = 'bold 26px Georgia'; g.fillText('z!', 0, 0);
    }
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, names };
}

export class GrandmaCrowd {
  constructor(scene) {
    this.scene = scene;
    const G = buildGeometries();
    this.G = G;
    const lam = (opts) => new THREE.MeshLambertMaterial(opts);
    const inst = (geo, material, count = MAX) => {
      const m = new THREE.InstancedMesh(geo, material, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      return m;
    };
    const white = lam({ color: 0xffffff });
    this.body = inst(G.body, white);
    this.cardigan = inst(G.cardigan, lam({ color: 0xffffff, side: THREE.DoubleSide }));
    this.shawl = inst(G.shawl, white);
    this.hair = inst(G.hair, white);
    this.face = inst(G.face, lam({ vertexColors: true }));
    this.arms = inst(G.arm, lam({ vertexColors: true }), MAX * 2);
    this.slippers = inst(G.slipper, lam({ vertexColors: true }), MAX * 2);
    this.shadow = inst(G.shadow, new THREE.MeshBasicMaterial({ color: 0x23301a, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow.renderOrder = -1;
    this.buns = G.bun.map((g) => inst(g, lam({ vertexColors: true })));
    this.glasses = G.glasses.map((g) => inst(g, lam({ vertexColors: true })));
    const vc = lam({ vertexColors: true });
    this.hats = {};
    for (const k in G.hats) this.hats[k] = inst(G.hats[k], vc, MAX);
    this.items = {};
    for (const k in G.items) this.items[k] = inst(G.items[k], vc, MAX);
    // Initialise colour buffers.
    for (const m of [this.body, this.cardigan, this.shawl, this.hair, this.arms, this.slippers, ...this.buns, ...this.glasses]) {
      m.setColorAt(0, _c.set(0xffffff));
    }
    // Status icons (billboards).
    const atlas = makeIconAtlas();
    this.iconNames = atlas.names;
    this.icons = {};
    atlas.names.forEach((n, i) => {
      const geo = new THREE.PlaneGeometry(0.55, 0.55);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / atlas.names.length);
      const mesh = inst(geo, new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, alphaTest: 0.3, depthWrite: false }), MAX);
      mesh.renderOrder = 5;
      this.icons[n] = mesh;
    });
    this.lastColorKey = '';
    this.camPos = new THREE.Vector3();
    this.camQuat = new THREE.Quaternion();
    this.stats = { drawn: 0, lod: 0 };
    this.temp = { hearts: new Map(), ring: new Map() }; // id -> until time (pat / fuss feedback)
  }

  // Positions for things other renderers attach to Grandmas (carried eggs).
  headTop(g) {
    return 1.1 * g.scale * (g.adult ? 1 : 0.68);
  }

  update(sim, time, camera) {
    const s = sim.state;
    const gs = s.grandmas;
    const n = Math.min(gs.length, MAX);
    this.camPos.copy(camera.position);
    this.camQuat.copy(camera.quaternion);
    this._colors(gs, n);
    const counters = { bun: [0, 0, 0], gl: [0, 0, 0], hat: {}, item: {}, icon: {} };
    for (const k in this.hats) counters.hat[k] = 0;
    for (const k in this.items) counters.item[k] = 0;
    for (const k in this.icons) counters.icon[k] = 0;
    let lodCount = 0;

    for (let i = 0; i < n; i++) {
      const g = gs[i];
      if (g.inside) {
        this.body.setMatrixAt(i, ZERO); this.cardigan.setMatrixAt(i, ZERO); this.shawl.setMatrixAt(i, ZERO);
        this.hair.setMatrixAt(i, ZERO); this.face.setMatrixAt(i, ZERO); this.shadow.setMatrixAt(i, ZERO);
        this.arms.setMatrixAt(i * 2, ZERO); this.arms.setMatrixAt(i * 2 + 1, ZERO);
        this.slippers.setMatrixAt(i * 2, ZERO); this.slippers.setMatrixAt(i * 2 + 1, ZERO);
        continue;
      }
      const a = this._pose(g, time);
      const sc = g.scale * (g.adult ? 1 : 0.68);
      _e.set(a.pitch, g.rot + a.yaw, a.roll, 'YXZ');
      _q.setFromEuler(_e);
      _v.set(g.x, a.y, g.z);
      _s.set(sc * a.sx, sc * a.sy, sc * a.sx);
      _m.compose(_v, _q, _s);

      this.body.setMatrixAt(i, _m);
      this.cardigan.setMatrixAt(i, _m);
      this.shawl.setMatrixAt(i, _m);
      // Hair cap: during emerge, it "settles" with the bun.
      this.hair.setMatrixAt(i, _m);

      // Shadow ignores pose.
      _o.makeScale(sc * (a.lying ? 1.5 : 1), 1, sc * (a.lying ? 1.2 : 1));
      _o.setPosition(g.x, 0.02, g.z);
      this.shadow.setMatrixAt(i, _o);

      const dx = g.x - this.camPos.x, dz = g.z - this.camPos.z;
      const far = dx * dx + dz * dz > LOD_FAR * LOD_FAR;
      if (far) lodCount++;

      // Bun / hat
      const hat = g.job && this.hats[g.job];
      if (hat) {
        hat.setMatrixAt(counters.hat[g.job]++, _m);
      } else if (a.bun > 0.01) {
        const bi = g.v.b;
        if (a.bun !== 1) {
          _p.makeTranslation(0, 0.95, -0.1).multiply(_o.makeScale(a.bun, a.bun, a.bun)).multiply(_o.makeTranslation(0, -0.95, 0.1));
          _o.multiplyMatrices(_m, _p);
          this.buns[bi].setMatrixAt(counters.bun[bi], _o);
        } else this.buns[bi].setMatrixAt(counters.bun[bi], _m);
        this.buns[bi].setColorAt(counters.bun[bi], this._hairColor(g));
        counters.bun[bi]++;
      }

      if (far) {
        this.face.setMatrixAt(i, ZERO);
        this.arms.setMatrixAt(i * 2, ZERO); this.arms.setMatrixAt(i * 2 + 1, ZERO);
        this.slippers.setMatrixAt(i * 2, ZERO); this.slippers.setMatrixAt(i * 2 + 1, ZERO);
      } else {
        this.face.setMatrixAt(i, _m);
        // Glasses (drop into place during emerge).
        const gi = g.v.g;
        if (a.glassesY !== 0) { _p.makeTranslation(0, a.glassesY, 0); _o.multiplyMatrices(_m, _p); this.glasses[gi].setMatrixAt(counters.gl[gi], _o); }
        else this.glasses[gi].setMatrixAt(counters.gl[gi], _m);
        this.glasses[gi].setColorAt(counters.gl[gi], _c.set(g.rare === 'golden' ? PAL.brass : PAL.frame[g.v.f]));
        counters.gl[gi]++;
        // Arms
        for (let k = 0; k < 2; k++) {
          const side = k === 0 ? -1 : 1;
          const ar = k === 0 ? a.armL : a.armR;
          _e.set(ar[0], 0, side * ar[1], 'XYZ');
          _q.setFromEuler(_e);
          _p.compose(_v.set(side * 0.44, 0.47, 0.02), _q, _s.set(1, 1, 1));
          _o.multiplyMatrices(_m, _p);
          this.arms.setMatrixAt(i * 2 + k, _o);
          const f = k === 0 ? a.footL : a.footR;
          _p.makeTranslation(side * 0.17, f[1], f[0]);
          _o.multiplyMatrices(_m, _p);
          this.slippers.setMatrixAt(i * 2 + k, _o);
        }
      }

      // Carried item
      let item = '';
      if (g.carryType && g.carryType !== 'egg') item = g.carryType;
      if (g.anim === 'tea') item = 'tea';
      if (item && this.items[item]) {
        const big = g.bigItem ? 2.0 : 1;
        if (item === 'material') _p.compose(_v.set(0.3, 0.75, 0), _q.identity(), _s.set(1, 1, 1));
        else if (item === 'tea') _p.compose(_v.set(0.25, 0.56 + Math.max(0, Math.sin(time * 1.5 + g.phase)) * 0.08, 0.42), _q.identity(), _s.set(1, 1, 1));
        else _p.compose(_v.set(0, 0.5 + (big - 1) * 0.2, 0.5 + (big - 1) * 0.12), _q.identity(), _s.set(big, big, big));
        _o.multiplyMatrices(_m, _p);
        this.items[item].setMatrixAt(counters.item[item]++, _o);
      }

      // Status icon
      const icon = this._icon(g, s, time);
      if (icon) {
        const ic = this.icons[icon];
        const bob = Math.sin(time * 3 + g.phase) * 0.05;
        _v.set(g.x, (a.lying ? 0.9 : 1.45) * sc + 0.15 + bob, g.z);
        ic.setMatrixAt(counters.icon[icon]++, _o.compose(_v, this.camQuat, _s.set(1, 1, 1)));
      }
    }

    const setCount = (m, c) => { m.count = c; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };
    for (const m of [this.body, this.cardigan, this.shawl, this.hair, this.face, this.shadow]) setCount(m, n);
    setCount(this.arms, n * 2);
    setCount(this.slippers, n * 2);
    this.buns.forEach((m, i) => setCount(m, counters.bun[i]));
    this.glasses.forEach((m, i) => setCount(m, counters.gl[i]));
    for (const k in this.hats) setCount(this.hats[k], counters.hat[k]);
    for (const k in this.items) setCount(this.items[k], counters.item[k]);
    for (const k in this.icons) setCount(this.icons[k], counters.icon[k]);
    this.stats.drawn = n;
    this.stats.lod = lodCount;
  }

  _hairColor(g) {
    if (g.rare === 'golden') return _c.set(PAL.golden);
    return _c.set(PAL.hairGrey[g.id % 3]);
  }

  // Static per-instance colours only change when the population does.
  _colors(gs, n) {
    const key = n + ':' + (n ? gs[n - 1].id : 0);
    if (key === this.lastColorKey) return;
    this.lastColorKey = key;
    for (let i = 0; i < n; i++) {
      const g = gs[i];
      const gold = g.rare === 'golden';
      this.body.setColorAt(i, _c.set(gold ? 0xf4d77a : PAL.skin[g.v.s]));
      this.cardigan.setColorAt(i, _c.set(gold ? PAL.golden : PAL.cardigan[g.v.c]));
      this.shawl.setColorAt(i, _c.set(gold ? 0xfff1c0 : PAL.shawl[g.v.w]));
      this.hair.setColorAt(i, this._hairColor(g));
      const card = gold ? PAL.golden : PAL.cardigan[g.v.c];
      this.arms.setColorAt(i * 2, _c.set(card));
      this.arms.setColorAt(i * 2 + 1, _c.set(card));
      const sl = PAL.slipper[g.v.p];
      this.slippers.setColorAt(i * 2, _c.set(sl));
      this.slippers.setColorAt(i * 2 + 1, _c.set(sl));
    }
    for (const m of [this.body, this.cardigan, this.shawl, this.hair, this.arms, this.slippers]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  _icon(g, s, time) {
    const h = this.temp.hearts.get(g.id);
    if (h && h > time) return 'heart';
    if (g.anim === 'sleepOut') return 'nobed';
    if (g.anim === 'sleep' || g.anim === 'nap') return 'sleep';
    if (g.starving || g.anim === 'sad') return 'hungry';
    if (g.anim === 'confused') return 'confused';
    if (g.anim === 'fuss') return 'heart';
    if (g.job === 'foreman' && time - (this.temp.ring.get(g.id) || -9) < 1.2) return 'bell';
    if (g.stiff && s.phase === 'day' && ((time + g.phase) % 9) < 1.5) return 'nobed';
    return '';
  }

  // Procedural pose for the current animation state.
  _pose(g, t) {
    const P = this._P || (this._P = { y: 0, sx: 1, sy: 1, pitch: 0, roll: 0, yaw: 0, armL: [0, 0.25], armR: [0, 0.25], footL: [0, 0], footR: [0, 0], bun: 1, glassesY: 0, lying: false, eyesClosed: false });
    const ph = t * 1 + g.phase;
    P.y = 0; P.sx = 1; P.sy = 1; P.pitch = 0; P.roll = 0; P.yaw = 0;
    P.armL[0] = 0; P.armL[1] = 0.25; P.armR[0] = 0; P.armR[1] = 0.25;
    P.footL[0] = 0; P.footL[1] = 0; P.footR[0] = 0; P.footR[1] = 0;
    P.bun = 1; P.glassesY = 0; P.lying = false; P.eyesClosed = false;
    const anim = g.moving ? (g.anim === 'confused' ? 'walk' : 'walk') : g.anim;
    const breathe = Math.sin(ph * 2.2) * 0.02;
    P.sy = 1 + breathe; P.sx = 1 - breathe * 0.5;
    switch (anim) {
      case 'walk': {
        const sp = (g.adult ? 9 : 12) * (g.starving ? 0.8 : 1);
        const w = Math.sin(t * sp + g.phase * 3);
        P.y = Math.abs(w) * 0.07;
        P.roll = w * 0.13;
        P.footL[0] = w * 0.16; P.footL[1] = Math.max(0, w) * 0.07;
        P.footR[0] = -w * 0.16; P.footR[1] = Math.max(0, -w) * 0.07;
        P.armL[0] = -w * 0.6; P.armR[0] = w * 0.6;
        P.sy = 1 - Math.abs(w) * 0.04; P.sx = 1 + Math.abs(w) * 0.02;
        if (g.carryN && g.carryType !== 'egg') { P.armL[0] = -1.2; P.armR[0] = -1.2; P.armL[1] = 0.1; P.armR[1] = 0.1; }
        if (g.carryType === 'egg') { P.armL[0] = -2.6; P.armR[0] = -2.6; P.armL[1] = 0.25; P.armR[1] = 0.25; }
        if (g.starving) P.pitch = 0.15;
        break;
      }
      case 'work': case 'build': {
        const w = Math.sin(t * (anim === 'build' ? 9 : 6) + g.phase);
        P.pitch = 0.18 + w * 0.15;
        P.sy = 1 - Math.max(0, w) * 0.08; P.sx = 1 + Math.max(0, w) * 0.05;
        P.armL[0] = -1.4 - w * 0.6; P.armR[0] = -1.4 - w * 0.6;
        P.y = Math.max(0, -w) * 0.04;
        break;
      }
      case 'eat': {
        const w = Math.sin(t * 8 + g.phase);
        P.pitch = 0.12 + w * 0.08;
        P.armR[0] = -1.5 + w * 0.3;
        break;
      }
      case 'queue':
        P.yaw = Math.sin(t * 0.7 + g.phase) * 0.3;
        P.armL[1] = 0.05; P.armR[1] = 0.05;
        break;
      case 'sad':
        P.pitch = 0.3; P.sy = 0.94; P.sx = 1.04;
        P.armL[1] = 0.05; P.armR[1] = 0.05;
        break;
      case 'tea':
        P.armR[0] = -1.4 - Math.max(0, Math.sin(t * 1.5 + g.phase)) * 0.4;
        P.sy = 0.96; P.sx = 1.03;
        break;
      case 'nap': case 'sleep': case 'sleepOut':
        P.lying = true;
        P.roll = 1.42; P.y = -0.06;
        P.sy = 1 + Math.sin(t * 1.6 + g.phase) * 0.04;
        P.eyesClosed = true;
        if (anim === 'sleepOut') P.y = -0.05 + Math.sin(t * 30 + g.phase) * 0.006; // shivering
        break;
      case 'fuss': {
        const w = Math.sin(t * 7 + g.phase);
        P.armR[0] = -1.2; P.armR[1] = 0.6 + w * 0.4;
        P.armL[0] = -0.8 - w * 0.3;
        P.y = Math.abs(w) * 0.03;
        break;
      }
      case 'confused':
        P.yaw = Math.sin(t * 5 + g.phase) * 0.6;
        P.armL[1] = 0.9; P.armR[1] = 0.9;
        break;
      case 'foreman': {
        const rt = this.temp.ring.get(g.id) || -9;
        const ring = t - rt < 1.2;
        if (ring) { P.armR[0] = -2.6 + Math.sin(t * 22) * 0.4; P.armR[1] = 0.4; }
        P.armL[1] = 0.6; P.armL[0] = -0.3; // hand on hip-ish
        break;
      }
      case 'emerge': {
        // Squeeze out, overshoot, settle; bun pops; glasses drop; wave.
        const T = g.spawnT;
        if (T < 0.35) { const k = T / 0.35; P.sy = 0.3 + k * 0.85; P.sx = 1.35 - k * 0.45; }
        else if (T < 1.0) { const k = (T - 0.35) / 0.65; const d = Math.sin(k * Math.PI * 3) * (1 - k) * 0.18; P.sy = 1 + d; P.sx = 1 - d * 0.6; }
        P.bun = T < 0.55 ? 0 : T < 0.75 ? ((T - 0.55) / 0.2) * 1.35 : T < 0.9 ? 1.35 - ((T - 0.75) / 0.15) * 0.35 : 1;
        P.glassesY = T < 0.8 ? 0.45 : T < 1.05 ? 0.45 * (1 - (T - 0.8) / 0.25) : T < 1.2 ? Math.sin(((T - 1.05) / 0.15) * Math.PI) * 0.04 : 0;
        if (T > 1.2 && T < 2.5) { P.armR[0] = -2.7; P.armR[1] = 0.5 + Math.sin(T * 14) * 0.35; }
        break;
      }
      default: break;
    }
    return P;
  }

  pat(id, time) {
    this.temp.hearts.set(id, time + 1.6);
  }
}
