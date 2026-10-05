// Mesh builders for every catalog `look`. Shapes mirror the physics parts.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { profilePoints } from '../sim/catalog.js';
import * as TX from './textures.js';

const geoCache = new Map();
const matCache = new Map();
const g = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };

export function mat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}
const std = (color, rough = 0.5, metal = 0, extra = {}) =>
  mat(`std:${color}:${rough}:${metal}:${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));

function rbox(w, h, d, r = 0.04) {
  const rr = Math.min(r, w / 2.2, h / 2.2, d / 2.2);
  return g(`rbox:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${rr.toFixed(3)}`, () => new RoundedBoxGeometry(w, h, d, 2, rr));
}

function latheGeo(lathe, segs = 24) {
  const key = `lathe:${lathe.h}:${lathe.rScale}:${lathe.profile.length}:${segs}`;
  return g(key, () => {
    const pts = profilePoints(lathe.profile, lathe.h, lathe.rScale, lathe.yNorm).map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y));
    const geo = new THREE.LatheGeometry(pts, segs);
    geo.computeVertexNormals();
    return geo;
  });
}

/** Pin with painted neck stripes via vertex colours. */
function pinGeo(lathe, base, stripe) {
  const key = `pin:${lathe.h}:${base}:${stripe}`;
  return g(key, () => {
    const geo = latheGeo(lathe, 28).clone();
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const cb = new THREE.Color(base), cs = new THREE.Color(stripe);
    for (let i = 0; i < pos.count; i++) {
      const yn = (pos.getY(i) + lathe.h / 2) / lathe.h; // 0..1
      const s = (yn > 0.6 && yn < 0.645) || (yn > 0.68 && yn < 0.725);
      const c = s ? cs : cb;
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return geo;
  });
}

function mesh(geo, material, cast = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

const PIN_LOOKS = {
  pin: ['#fbfbf7', '#e8213f', 0.28, 0],
  heavyPin: ['#3a3f4f', '#ffcc33', 0.35, 0.3],
  lightPin: ['#bfe9ff', '#ffffff', 0.3, 0],
  giantPin: ['#fbfbf7', '#e8213f', 0.3, 0],
  miniPin: ['#fbfbf7', '#2b7bff', 0.3, 0],
  goldPin: ['#ffcf3a', '#fff3b0', 0.2, 0.85],
};

const CAN_COLORS = ['#e8213f', '#2b7bff', '#21b573', '#ff9f1a', '#9b59ff'];

/** Build the visual for an entity. */
export function buildEntityMesh(ent, theme) {
  const look = ent.look;
  const def = ent.def;
  const grp = new THREE.Group();
  const size = ent.size;

  if (PIN_LOOKS[look]) {
    const [base, stripe, rough, metal] = PIN_LOOKS[look];
    const m = mesh(pinGeo(def.lathe, base, stripe), mat(`pinmat:${look}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, envMapIntensity: 1.2 })));
    grp.add(m);
    return grp;
  }

  switch (look) {
    case 'bottle': {
      const color = ent.color || ['#2fae5f', '#3b8fd9', '#b5651d'][ent.id % 3];
      grp.add(mesh(latheGeo(def.lathe, 16), mat(`bottle:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.08, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.82, clearcoat: 1 }))));
      const lab = mesh(g(`blabel:${def.h}`, () => new THREE.CylinderGeometry(def.lathe.rScale * 1.01, def.lathe.rScale * 1.01, def.h * 0.22, 16, 1, true)), mat('blabel', () => new THREE.MeshStandardMaterial({ map: TX.labelTexture('#f5f0e1', 'bl'), roughness: 0.6 })));
      lab.position.y = -def.h * 0.12;
      grp.add(lab);
      return grp;
    }
    case 'vase': {
      const color = ent.color || '#3a7bd5';
      grp.add(mesh(latheGeo(def.lathe, 24), std(color, 0.25, 0.05, { side: THREE.DoubleSide })));
      const band = mesh(g(`vband:${def.h}`, () => new THREE.TorusGeometry(def.lathe.rScale * 0.97, 0.018, 6, 28)), std('#ffd25a', 0.3, 0.6));
      band.rotation.x = Math.PI / 2; band.position.y = def.h * -0.1;
      grp.add(band);
      return grp;
    }
    case 'can': {
      const color = ent.color || CAN_COLORS[ent.id % CAN_COLORS.length];
      const p = def.parts[0];
      const body = mesh(g(`can:${p.r}:${p.h}`, () => new THREE.CylinderGeometry(p.r, p.r, p.h * 0.9, 18)), mat(`canlab:${color}`, () => new THREE.MeshStandardMaterial({ map: TX.labelTexture(color), roughness: 0.35, metalness: 0.3 })));
      grp.add(body);
      const lid = g(`canlid:${p.r}:${p.h}`, () => new THREE.CylinderGeometry(p.r * 0.96, p.r * 0.96, p.h * 0.05, 18));
      const metal = std('#d9dde3', 0.25, 0.9);
      const t = mesh(lid, metal); t.position.y = p.h * 0.475; grp.add(t);
      const b = mesh(lid, metal); b.position.y = -p.h * 0.475; grp.add(b);
      return grp;
    }
    case 'barrel': {
      const p = def.parts[0];
      const color = ent.color || ['#2f7dd1', '#21a36b', '#e8413a'][ent.id % 3];
      grp.add(mesh(g(`barrel:${p.r}:${p.h}`, () => new THREE.CylinderGeometry(p.r, p.r, p.h, 22)), std(color, 0.35, 0.45)));
      for (const y of [-0.42, -0.14, 0.14, 0.42]) {
        const ring = mesh(g(`bring:${p.r}`, () => new THREE.TorusGeometry(p.r * 1.0, 0.018, 6, 24)), std('#d9dde3', 0.3, 0.8), false);
        ring.rotation.x = Math.PI / 2; ring.position.y = y * p.h; grp.add(ring);
      }
      const lid = mesh(g(`blid:${p.r}`, () => new THREE.CylinderGeometry(p.r * 0.92, p.r * 0.92, 0.02, 22)), std('#d9dde3', 0.3, 0.8), false);
      lid.position.y = p.h / 2; grp.add(lid);
      const cap = mesh(g('bcap', () => new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10)), std('#ffcc33', 0.4, 0.5), false);
      cap.position.set(p.r * 0.5, p.h / 2 + 0.015, 0); grp.add(cap);
      return grp;
    }
    case 'cone': {
      const base = mesh(rbox(0.46, 0.06, 0.46, 0.02), std('#222', 0.7));
      base.position.y = -def.h / 2 + 0.03; grp.add(base);
      const c = mesh(g('conebody', () => new THREE.ConeGeometry(0.17, def.h - 0.06, 20)), std('#ff6a13', 0.45));
      c.position.y = 0.03; grp.add(c);
      const stripe = mesh(g('conestripe', () => new THREE.CylinderGeometry(0.075, 0.105, 0.1, 20, 1, true)), std('#ffffff', 0.4));
      stripe.position.y = 0.06; grp.add(stripe);
      return grp;
    }
    case 'gnome': {
      const h = def.h;
      const body = mesh(g('gbody', () => new THREE.CylinderGeometry(0.13, 0.17, 0.36, 16)), std('#2f6fd1', 0.5));
      body.position.y = -h / 2 + 0.18; grp.add(body);
      const head = mesh(g('ghead', () => new THREE.SphereGeometry(0.13, 16, 12)), std('#f2c7a5', 0.6));
      head.position.y = -h / 2 + 0.44; grp.add(head);
      const beard = mesh(g('gbeard', () => new THREE.ConeGeometry(0.12, 0.2, 14)), std('#ffffff', 0.8));
      beard.rotation.x = Math.PI; beard.position.set(0, -h / 2 + 0.36, -0.07); grp.add(beard);
      const hat = mesh(g('ghat', () => new THREE.ConeGeometry(0.15, 0.3, 16)), std('#e8213f', 0.5));
      hat.position.y = h / 2 - 0.15; grp.add(hat);
      const nose = mesh(g('gnose', () => new THREE.SphereGeometry(0.035, 8, 6)), std('#ff9f8a', 0.6));
      nose.position.set(0, -h / 2 + 0.44, -0.13); grp.add(nose);
      return grp;
    }
    case 'statue': {
      const h = def.h;
      const ped = mesh(rbox(0.44, 0.2, 0.44, 0.03), std('#8f8a82', 0.8));
      ped.position.y = -h / 2 + 0.1; grp.add(ped);
      const body = mesh(g('stbody', () => new THREE.CapsuleGeometry(0.14, 0.5, 6, 14)), std('#d6c9a8', 0.55, 0.1));
      body.position.y = -h / 2 + 0.6; grp.add(body);
      const head = mesh(g('sthead', () => new THREE.SphereGeometry(0.16, 16, 12)), std('#d6c9a8', 0.55, 0.1));
      head.position.y = h / 2 - 0.16; grp.add(head);
      const crown = mesh(g('stcrown', () => new THREE.CylinderGeometry(0.12, 0.1, 0.08, 8)), std('#ffcc33', 0.3, 0.8));
      crown.position.y = h / 2 - 0.02; grp.add(crown);
      return grp;
    }
    case 'chair': {
      const h = def.h;
      const baseC = mesh(g('chbase', () => new THREE.CylinderGeometry(0.32, 0.32, 0.08, 5)), std('#2a2d35', 0.4, 0.5));
      baseC.position.y = -h / 2 + 0.04; grp.add(baseC);
      const post = mesh(g('chpost', () => new THREE.CylinderGeometry(0.05, 0.05, 0.38, 10)), std('#c9ced8', 0.2, 0.9));
      post.position.y = -h / 2 + 0.27; grp.add(post);
      const seatColor = ent.color || ['#e8413a', '#2b7bff', '#21b573'][ent.id % 3];
      const seat = mesh(rbox(0.56, 0.1, 0.54, 0.04), std(seatColor, 0.6));
      seat.position.y = -h / 2 + 0.51; grp.add(seat);
      const back = mesh(rbox(0.52, 0.56, 0.08, 0.04), std(seatColor, 0.6));
      back.position.set(0, h / 2 - 0.28, 0.25); grp.add(back);
      return grp;
    }
    case 'dummy': {
      const h = def.h;
      const base = mesh(g('dbase', () => new THREE.CylinderGeometry(0.24, 0.24, 0.08, 18)), std('#3a3a3a', 0.5, 0.3));
      base.position.y = -h / 2 + 0.04; grp.add(base);
      const torso = mesh(g('dtorso', () => new THREE.CapsuleGeometry(0.2, 0.8, 6, 16)), std(ent.color || '#f1d9b5', 0.55));
      torso.position.y = -h / 2 + 0.68; grp.add(torso);
      const tie = mesh(rbox(0.07, 0.3, 0.04, 0.01), std('#e8213f', 0.5));
      tie.position.set(0, -h / 2 + 0.9, -0.2); grp.add(tie);
      const head = mesh(g('dhead', () => new THREE.SphereGeometry(0.17, 18, 14)), std(ent.color || '#f1d9b5', 0.55));
      head.position.y = h / 2 - 0.17; grp.add(head);
      const eyeM = std('#22252b', 0.4);
      for (const x of [-0.06, 0.06]) {
        const e = mesh(g('deye', () => new THREE.SphereGeometry(0.025, 8, 6)), eyeM, false);
        e.position.set(x, h / 2 - 0.15, -0.155); grp.add(e);
      }
      return grp;
    }
    case 'crate':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.03), mat('cratemat', () => new THREE.MeshStandardMaterial({ map: TX.crateTexture(), roughness: 0.75 }))));
      return grp;
    case 'box':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.02), mat('boxmat', () => new THREE.MeshStandardMaterial({ map: TX.cardboardTexture(), roughness: 0.85 }))));
      return grp;
    case 'cabinet': {
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.03), std('#9aa3b5', 0.35, 0.6)));
      for (let i = 0; i < 3; i++) {
        const dr = mesh(rbox(size[0] * 0.8, size[1] * 0.26, 0.02, 0.008), std('#b9c1d1', 0.3, 0.6));
        dr.position.set(0, size[1] * (0.31 - i * 0.31), -size[2] / 2 - 0.005); grp.add(dr);
      }
      return grp;
    }
    case 'domino': {
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.03), std(ent.color || ['#ffffff', '#ffd23f', '#3fd2ff', '#ff5fa2'][ent.id % 4], 0.35)));
      const dotM = std('#1d1d2b', 0.4);
      for (const y of [-0.22, 0.22]) {
        const d = mesh(g('ddot', () => new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10)), dotM, false);
        d.rotation.x = Math.PI / 2; d.position.set(0, y * size[1], -size[2] / 2 - 0.004); grp.add(d);
        const d2 = d.clone(); d2.position.z = size[2] / 2 + 0.004; grp.add(d2);
      }
      const line = mesh(rbox(size[0] * 0.8, 0.02, size[2] + 0.01, 0.005), dotM, false);
      grp.add(line);
      return grp;
    }
    case 'plank': case 'post': case 'slab': case 'block':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.025), mat(`woodmat:${look}:${ent.color || ''}`, () => new THREE.MeshStandardMaterial({ map: TX.woodTexture(ent.color || (look === 'post' ? '#b9783e' : '#d49a5c'), `wood:${look}:${ent.color || ''}`), roughness: 0.7 }))));
      return grp;
    case 'stone':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.05), std('#9d9a94', 0.9)));
      return grp;
    case 'beam':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.02), std('#f2b01e', 0.45, 0.4)));
      return grp;
    case 'boulder':
      grp.add(mesh(g(`boulder:${size[0]}`, () => new THREE.IcosahedronGeometry(size[0] / 2, 2)), std('#8a857d', 0.85)));
      return grp;
    case 'glass': {
      const m = mesh(rbox(size[0], size[1], size[2], 0.02), mat('glassmat', () => new THREE.MeshPhysicalMaterial({ color: '#bfe8ff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false })), false);
      grp.add(m);
      const frameM = std('#e8f6ff', 0.3, 0.5);
      const f = mesh(rbox(size[0] + 0.06, 0.06, size[2] + 0.04, 0.02), frameM);
      f.position.y = size[1] / 2; grp.add(f);
      const f2 = f.clone(); f2.position.y = -size[1] / 2; grp.add(f2);
      return grp;
    }
    case 'bumper': {
      const p = def.parts[0];
      grp.add(mesh(g(`bump:${p.r}:${p.h}`, () => new THREE.CylinderGeometry(p.r, p.r, p.h, 24)), std('#ff3fa4', 0.35, 0.1, { emissive: '#ff3fa4', emissiveIntensity: 0.25 })));
      const top = mesh(g(`bumptop:${p.r}`, () => new THREE.TorusGeometry(p.r * 0.75, 0.05, 8, 24)), std('#ffffff', 0.3));
      top.rotation.x = Math.PI / 2; top.position.y = p.h / 2; grp.add(top);
      grp.userData.flash = grp.children[0];
      return grp;
    }
    case 'bumperWall':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.08), std('#ff3fa4', 0.35, 0.1, { emissive: '#ff3fa4', emissiveIntensity: 0.25 })));
      grp.userData.flash = grp.children[0];
      return grp;
    case 'pillar': {
      const p = def.parts[0];
      grp.add(mesh(g(`pillar:${p.r}:${p.h}`, () => new THREE.CylinderGeometry(p.r, p.r * 1.05, p.h, 20)), std(theme.wall, 0.8)));
      const cap = mesh(rbox(p.r * 2.4, 0.12, p.r * 2.4, 0.03), std(theme.wall, 0.7));
      cap.position.y = p.h / 2 - 0.06; grp.add(cap);
      return grp;
    }
    case 'shelf':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.02), std('#cfd5dc', 0.3, 0.7)));
      return grp;
    case 'desk': {
      const top = mesh(rbox(size[0], 0.08, size[2], 0.02), mat('desktop', () => new THREE.MeshStandardMaterial({ map: TX.woodTexture('#c79a6b', 'desk'), roughness: 0.6 })));
      top.position.y = size[1] / 2 - 0.04; grp.add(top);
      const panel = mesh(rbox(size[0] * 0.98, size[1] - 0.08, size[2] * 0.9, 0.02), std('#e6e9ef', 0.6));
      panel.position.y = -0.04; grp.add(panel);
      return grp;
    }
    case 'mover': {
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.04), std('#30343d', 0.5, 0.4)));
      const edge = mesh(rbox(size[0] + 0.02, 0.04, size[2] + 0.02, 0.01), mat('moveredge', () => new THREE.MeshStandardMaterial({ map: TX.hazardTexture('#222', '#ffc21a', 'hz2'), roughness: 0.5 })));
      edge.position.y = size[1] / 2 - 0.02; grp.add(edge);
      return grp;
    }
    case 'rotator':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.05), mat('rotmat', () => new THREE.MeshStandardMaterial({ map: TX.hazardTexture('#ffffff', '#e8213f', 'hzrot'), roughness: 0.4 }))));
      return grp;
    case 'stage':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.06), std(theme.backstop, 0.6)));
      return grp;
    case 'ramp': {
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.04), std(theme.ramp, 0.5)));
      const stripe = mesh(rbox(0.12, 0.012, size[2] * 0.95, 0.004), std('#ffffff', 0.4), false);
      stripe.position.y = size[1] / 2 + 0.004; grp.add(stripe);
      return grp;
    }
    case 'rail':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.06), std(theme.rail, 0.45)));
      return grp;
    case 'backstop':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.06), std(theme.backstop, 0.6)));
      return grp;
    case 'barrier': {
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.06), std(theme.block, 0.5)));
      const s = mesh(rbox(size[0] * 1.002, Math.min(0.14, size[1] * 0.2), size[2] * 1.01, 0.02), mat(`barhz:${theme.name}`, () => new THREE.MeshStandardMaterial({ map: TX.hazardTexture('#ffffff', theme.block, `bh:${theme.block}`), roughness: 0.5 })));
      s.position.y = size[1] / 2 - 0.12; grp.add(s);
      return grp;
    }
    case 'platform':
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.04), std(ent.color || theme.wall, 0.65)));
      return grp;
    case 'wall':
    default:
      grp.add(mesh(rbox(size[0], size[1], size[2], 0.05), std(ent.color || theme.wall, 0.6)));
      return grp;
  }
}

export function buildBallMesh(radius, kind) {
  const grp = new THREE.Group();
  const colors = kind === 'heavy' ? ['#1b1b24', '#5b5b7a'] : kind === 'bomb' ? ['#2a0d0d', '#ff3b1f'] : kind === 'triple' ? ['#0fb6a7', '#7a3cff'] : ['#2b2bff', '#ff3fa4'];
  const m = new THREE.Mesh(
    g(`ball:${radius}`, () => new THREE.SphereGeometry(radius, 40, 28)),
    mat(`ballmat:${kind}`, () => new THREE.MeshPhysicalMaterial({ map: TX.ballTexture(colors[0], colors[1]), roughness: 0.12, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 })),
  );
  m.castShadow = true;
  grp.add(m);
  if (kind === 'bomb') {
    const fuse = new THREE.Mesh(g('fuse', () => new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8)), std('#ddd', 0.5));
    fuse.position.y = radius + 0.05; grp.add(fuse);
  }
  return grp;
}

export function shardMesh(size, matKey) {
  const color = matKey === 'glass' ? '#cfefff' : matKey === 'ceramic' ? '#3a7bd5' : '#9fd8a8';
  const m = new THREE.Mesh(
    g(`shard:${size.map((v) => v.toFixed(2)).join(':')}`, () => new THREE.BoxGeometry(size[0], size[1], size[2])),
    mat(`shardmat:${matKey}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.08, transparent: true, opacity: matKey === 'glass' ? 0.55 : 0.95, clearcoat: 1 })),
  );
  m.castShadow = matKey !== 'glass';
  return m;
}
