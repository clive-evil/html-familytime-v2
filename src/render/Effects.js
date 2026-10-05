import * as THREE from 'three';

// Pooled particles in a single InstancedMesh (no allocation per burst).
const MAX = 1500;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();

const PRESETS = {
  shell: { colors: [0xf5ecd8, 0xd7a6c8, 0xf5ecd8], size: 0.12, speed: 3.2, up: 4, gravity: 12, life: 1.1, spin: 10 },
  leaf: { colors: [0x5f8f4a, 0x7aa85a], size: 0.1, speed: 1.6, up: 2.2, gravity: 4, life: 0.9, spin: 6 },
  chip: { colors: [0xc89a66, 0xa9774a], size: 0.08, speed: 2.2, up: 3, gravity: 12, life: 0.7, spin: 12 },
  dust: { colors: [0xd8c09a, 0xc9b38f], size: 0.16, speed: 1.0, up: 0.8, gravity: -0.5, life: 0.8, spin: 1, grow: 1.5 },
  stone: { colors: [0xa8a39a, 0x857f76], size: 0.09, speed: 2.4, up: 3, gravity: 14, life: 0.7, spin: 10 },
  berry: { colors: [0xc23b5a, 0x9a2a48], size: 0.07, speed: 1.4, up: 2.5, gravity: 10, life: 0.6, spin: 4 },
  steam: { colors: [0xffffff, 0xf2f2f2], size: 0.1, speed: 0.2, up: 1.1, gravity: -0.3, life: 1.2, spin: 1, grow: 1.4 },
  sparkle: { colors: [0xffe58a, 0xffffff, 0xf2c94c], size: 0.09, speed: 2.0, up: 2.5, gravity: 2, life: 1.0, spin: 8 },
  heart: { colors: [0xe0607e, 0xf09ab0], size: 0.1, speed: 0.6, up: 1.8, gravity: -0.2, life: 1.0, spin: 2 },
};

export class Effects {
  constructor(scene) {
    const geo = new THREE.IcosahedronGeometry(0.5, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.mesh);
    // Struct-of-arrays pool.
    this.n = 0;
    this.px = new Float32Array(MAX); this.py = new Float32Array(MAX); this.pz = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX); this.vz = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX);
    this.size = new Float32Array(MAX); this.grav = new Float32Array(MAX); this.spin = new Float32Array(MAX);
    this.grow = new Float32Array(MAX); this.col = new Uint32Array(MAX);
  }

  burst(type, x, y, z, count = 10) {
    const P = PRESETS[type];
    if (!P) return;
    for (let k = 0; k < count; k++) {
      if (this.n >= MAX) return;
      const i = this.n++;
      const a = Math.random() * Math.PI * 2;
      const sp = P.speed * (0.4 + Math.random() * 0.8);
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.vx[i] = Math.cos(a) * sp; this.vz[i] = Math.sin(a) * sp;
      this.vy[i] = P.up * (0.5 + Math.random() * 0.7);
      this.maxLife[i] = this.life[i] = P.life * (0.7 + Math.random() * 0.6);
      this.size[i] = P.size * (0.7 + Math.random() * 0.6);
      this.grav[i] = P.gravity;
      this.spin[i] = P.spin * (Math.random() - 0.5);
      this.grow[i] = P.grow || 0;
      this.col[i] = P.colors[k % P.colors.length];
    }
  }

  update(dt, time) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        n--;
        this.px[i] = this.px[n]; this.py[i] = this.py[n]; this.pz[i] = this.pz[n];
        this.vx[i] = this.vx[n]; this.vy[i] = this.vy[n]; this.vz[i] = this.vz[n];
        this.life[i] = this.life[n]; this.maxLife[i] = this.maxLife[n]; this.size[i] = this.size[n];
        this.grav[i] = this.grav[n]; this.spin[i] = this.spin[n]; this.grow[i] = this.grow[n]; this.col[i] = this.col[n];
        i--;
        continue;
      }
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.03 && this.grav[i] > 0) { this.py[i] = 0.03; this.vy[i] *= -0.3; this.vx[i] *= 0.6; this.vz[i] *= 0.6; }
    }
    this.n = n;
    for (let i = 0; i < n; i++) {
      const k = this.life[i] / this.maxLife[i];
      const sz = this.size[i] * (this.grow[i] ? 1 + (1 - k) * this.grow[i] : Math.min(1, k * 3));
      _e.set(time * this.spin[i], time * this.spin[i] * 0.7, 0);
      _q.setFromEuler(_e);
      _m.compose(_v.set(this.px[i], this.py[i], this.pz[i]), _q, _s.set(sz, sz, sz));
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.set(this.col[i]));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
