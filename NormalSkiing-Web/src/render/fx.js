// Snow spray particles and ski tracks.

import * as THREE from 'three';

const MAXP = 900;

export class SnowFx {
  constructor(scene) {
    this.scene = scene;
    this.pos = new Float32Array(MAXP * 3);
    this.vel = new Float32Array(MAXP * 3);
    this.life = new Float32Array(MAXP);
    this.size = new Float32Array(MAXP);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const tex = makeDot();
    this.mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.35, map: tex, transparent: true, depthWrite: false, opacity: 0.9,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;

    // tracks: two ribbons as line segments
    this.trackMax = 1400;
    this.trackPos = new Float32Array(this.trackMax * 2 * 3);
    this.trackN = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trackPos, 3));
    this.trackGeo = tg;
    this.tracks = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xaab9c8, transparent: true, opacity: 0.8 }));
    this.tracks.frustumCulled = false;
    scene.add(this.tracks);
    this.lastTrack = null;
  }

  dispose() {
    this.scene.remove(this.points);
    this.scene.remove(this.tracks);
  }

  emit(x, y, z, vx, vy, vz, spread, n, life = 0.8) {
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % MAXP;
      this.pos[k * 3] = x + (Math.random() - 0.5) * 0.4;
      this.pos[k * 3 + 1] = y + Math.random() * 0.2;
      this.pos[k * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
      this.vel[k * 3] = vx + (Math.random() - 0.5) * spread;
      this.vel[k * 3 + 1] = vy + Math.random() * spread * 0.8;
      this.vel[k * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      this.life[k] = life * (0.5 + Math.random() * 0.7);
    }
  }

  clearTracks() {
    this.trackN = 0;
    this.lastTrack = null;
    this.trackGeo.setDrawRange(0, 0);
  }

  // left/right ski contact points
  addTrack(l, r) {
    if (this.lastTrack) {
      const [pl, pr] = this.lastTrack;
      const d = Math.hypot(l.x - pl.x, l.z - pl.z);
      if (d < 0.6) return;
      if (d > 6) {
        this.lastTrack = [l, r];
        return;
      }
      for (const [a, b] of [[pl, l], [pr, r]]) {
        const k = (this.trackN % this.trackMax) * 6;
        this.trackPos[k] = a.x;
        this.trackPos[k + 1] = a.y + 0.04;
        this.trackPos[k + 2] = a.z;
        this.trackPos[k + 3] = b.x;
        this.trackPos[k + 4] = b.y + 0.04;
        this.trackPos[k + 5] = b.z;
        this.trackN++;
      }
      this.trackGeo.attributes.position.needsUpdate = true;
      this.trackGeo.setDrawRange(0, Math.min(this.trackN, this.trackMax) * 2);
    }
    this.lastTrack = [l, r];
  }

  breakTrack() {
    this.lastTrack = null;
  }

  update(dt) {
    for (let k = 0; k < MAXP; k++) {
      if (this.life[k] <= 0) {
        this.size[k] = 0;
        this.pos[k * 3 + 1] = -1e5;
        continue;
      }
      this.life[k] -= dt;
      this.vel[k * 3 + 1] -= 6 * dt;
      const drag = Math.exp(-2.5 * dt);
      this.vel[k * 3] *= drag;
      this.vel[k * 3 + 2] *= drag;
      this.pos[k * 3] += this.vel[k * 3] * dt;
      this.pos[k * 3 + 1] += this.vel[k * 3 + 1] * dt;
      this.pos[k * 3 + 2] += this.vel[k * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

function makeDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
