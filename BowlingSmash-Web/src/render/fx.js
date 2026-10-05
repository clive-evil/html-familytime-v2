// Lightweight CPU particle system rendered as a single Points draw call.
import * as THREE from 'three';
import { softDot } from './textures.js';

const MAX = 1800;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX);
    this.baseAlpha = new Float32Array(MAX);
    this.count = 0;
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, scale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float scale;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t=texture2D(map, gl_PointCoord); gl_FragColor=linearToOutputTexel(vec4(vC, t.a*vA)); if(gl_FragColor.a<0.01) discard; }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.geo = geo;
    for (let i = 0; i < MAX; i++) this.alpha[i] = 0;
  }

  setScale(px) { this.points.material.uniforms.scale.value = px; }

  emit(x, y, z, o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    const c = o.color;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = this.maxLife[i] = o.life || 0.6;
    this.baseSize[i] = o.size || 0.2;
    this.grav[i] = o.gravity ?? -9;
    this.grow[i] = o.grow || 0;
    this.drag[i] = o.drag ?? 1.5;
    this.alpha[i] = this.baseAlpha[i] = o.alpha ?? 1;
    this.count = Math.min(MAX, this.count + 1);
  }

  burst(kind, p, strength = 1, color) {
    const c = new THREE.Color();
    const R = Math.random;
    if (kind === 'dust') {
      const n = Math.round(4 + strength * 10);
      for (let i = 0; i < n; i++) {
        c.set(color || '#e9dccb').multiplyScalar(0.9 + R() * 0.2);
        const a = R() * Math.PI * 2, s = 0.6 + R() * 1.6 * strength;
        this.emit(p.x, p.y + 0.05, p.z, { vx: Math.cos(a) * s, vy: 0.3 + R() * 0.8, vz: Math.sin(a) * s, color: c, life: 0.6 + R() * 0.5, size: 0.25 + R() * 0.3, grow: 0.7, gravity: 0.4, drag: 2.5, alpha: 0.55 });
      }
    } else if (kind === 'spark') {
      const n = Math.round(5 + strength * 14);
      for (let i = 0; i < n; i++) {
        c.set(color || (R() < 0.5 ? '#fff3a0' : '#ffb347'));
        const a = R() * Math.PI * 2, s = 2 + R() * 6 * strength;
        this.emit(p.x, p.y, p.z, { vx: Math.cos(a) * s, vy: 1 + R() * 4 * strength, vz: Math.sin(a) * s, color: c, life: 0.25 + R() * 0.35, size: 0.07 + R() * 0.07, gravity: -14, drag: 1 });
      }
    } else if (kind === 'chips') {
      const n = Math.round(4 + strength * 10);
      for (let i = 0; i < n; i++) {
        c.set(color || '#ffffff').multiplyScalar(0.8 + R() * 0.3);
        const a = R() * Math.PI * 2, s = 1.5 + R() * 4 * strength;
        this.emit(p.x, p.y, p.z, { vx: Math.cos(a) * s, vy: 1.5 + R() * 4, vz: Math.sin(a) * s, color: c, life: 0.5 + R() * 0.4, size: 0.08 + R() * 0.06, gravity: -16, drag: 0.6 });
      }
    } else if (kind === 'confetti') {
      const cols = ['#ff3f6c', '#ffd23f', '#3fd2ff', '#7cff6b', '#b46bff', '#ffffff'];
      const n = Math.round(60 * strength);
      for (let i = 0; i < n; i++) {
        c.set(cols[i % cols.length]);
        const a = R() * Math.PI * 2, s = 1 + R() * 5;
        this.emit(p.x + (R() - 0.5), p.y, p.z + (R() - 0.5), { vx: Math.cos(a) * s, vy: 5 + R() * 7, vz: Math.sin(a) * s, color: c, life: 1.4 + R() * 1.2, size: 0.14 + R() * 0.1, gravity: -6, drag: 1.8 });
      }
    } else if (kind === 'sparkle') {
      const n = Math.round(10 * strength);
      for (let i = 0; i < n; i++) {
        c.set(color || '#fff6c2');
        const a = R() * Math.PI * 2, s = 0.5 + R() * 2;
        this.emit(p.x, p.y, p.z, { vx: Math.cos(a) * s, vy: 0.5 + R() * 2.5, vz: Math.sin(a) * s, color: c, life: 0.5 + R() * 0.5, size: 0.18 + R() * 0.15, gravity: -1, drag: 2 });
      }
    } else if (kind === 'explosion') {
      for (let i = 0; i < 70; i++) {
        c.set(R() < 0.3 ? '#fff1a8' : R() < 0.6 ? '#ff8a1f' : '#ff3b1f');
        const a = R() * Math.PI * 2, e = R() * Math.PI - Math.PI / 2, s = 3 + R() * 8;
        this.emit(p.x, p.y, p.z, { vx: Math.cos(a) * Math.cos(e) * s, vy: Math.abs(Math.sin(e)) * s, vz: Math.sin(a) * Math.cos(e) * s, color: c, life: 0.4 + R() * 0.5, size: 0.3 + R() * 0.4, grow: 1.2, gravity: -2, drag: 3 });
      }
      this.burst('dust', p, 2.5, '#6b625a');
    } else if (kind === 'trail') {
      c.set(color || '#bcd4ff');
      this.emit(p.x, p.y, p.z, { color: c, life: 0.35, size: 0.42 * strength, gravity: 0, drag: 0, alpha: 0.35, grow: -0.6 });
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr + this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] < -3) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] = Math.max(0.01, this.baseSize[i] * (1 + this.grow[i] * (1 - k)));
      this.alpha[i] = Math.min(1, k * 1.6) * this.baseAlpha[i];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.alpha.fill(0); }
}
