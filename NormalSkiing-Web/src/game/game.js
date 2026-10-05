// Game: owns the world, the skier simulation, crash/ragdoll/respawn flow,
// checkpoints and all the views. Physics runs at a fixed 240 Hz.

import * as THREE from 'three';
import { makeTune } from '../config.js';
import { Session } from './session.js';
import { clamp } from '../sim/math.js';
import { makeLab } from '../world/lab.js';
import { makeMountain } from '../world/mountain.js';
import { TerrainView } from '../render/terrain.js';
import { PropsView } from '../render/props.js';
import { SkierView } from '../render/skierView.js';
import { ChaseCam } from '../render/camera.js';
import { SnowFx } from '../render/fx.js';
import { EventViews } from '../render/eventViews.js';
import { Input } from './input.js';
import { Hud } from '../ui/hud.js';
import { Audio } from '../audio/audio.js';
import { DebugPanel } from '../ui/debug.js';

const DT = 1 / 240;

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.tune = makeTune(opts.tune || {});
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = makeSky();
    this.scene.fog = new THREE.FogExp2(0xd6e4ef, 0.00032);
    this.camera = new THREE.PerspectiveCamera(this.tune.fovBase, 1, 0.3, 9000);
    const hemi = new THREE.HemisphereLight(0xdceaff, 0x5d6f86, 0.85);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1de, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0005;
    this.sunDir = new THREE.Vector3(0.78, 0.42, 0.34).normalize();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.input = new Input(canvas, this.tune);
    this.input.absolute = !!opts.absoluteMouse;
    this.hud = new Hud();
    this.audio = new Audio();
    this.cam = new ChaseCam(this.camera, this.tune);
    this.skierView = new SkierView(this.scene);
    this.fx = new SnowFx(this.scene);
    this.acc = 0;
    this.paused = false;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.load(opts.mode || 'lab');
    if (opts.debug) this.debug = new DebugPanel(this);
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  load(mode) {
    this.mode = mode;
    if (this.terrainView) this.terrainView.dispose();
    if (this.propsView) this.propsView.dispose();
    if (this.eventViews) this.eventViews.dispose();
    this.world = mode === 'mountain' ? makeMountain() : makeLab();
    this.terrainView = new TerrainView(this.scene, this.world);
    this.propsView = new PropsView(this.scene, this.world);
    this.session = new Session(this.world, this.tune, {
      audio: this.audio, cam: this.cam, hud: this.hud, terrainView: this.terrainView,
      onSkierEvents: (evs) => this.onSkierEvents(evs),
      onCrash: (cause) => this.onCrash(cause),
      onRespawn: () => this.onRespawn(),
      onFinish: () => this.showFinish(),
      jointsProvider: (sk) => {
        this.skierView.pose(sk, sk.p, 0);
        return this.skierView.joints;
      },
    });
    this.session.onRegion = (reg, first) => {
      if (!first || this.mode === 'lab' || reg.z < 30) this.hud.toast(reg.name.toUpperCase(), reg.tip || '', this.mode === 'lab' ? 4.5 : 3);
    };
    this.session.onSaved = () => {
      this.hud.callout('SAVED IT!', '#9ff0ff', 1.2);
      this.audio.saved();
    };
    this.skier = this.session.skier;
    this.ragdoll = this.session.ragdoll;
    this.eventViews = new EventViews(this.scene, this.world, this);
    this.onRespawn();
    for (let i = 0; i < 40; i++) if (this.terrainView.update(this.skier.p.x, this.skier.p.z, 0, 1, 8) === 0) break;
    document.getElementById('finish').style.display = 'none';
  }

  get state() { return this.session.state; }
  get crashes() { return this.session.crashes; }
  get runTime() { return this.session.runTime; }
  get regionName() { return this.session.regionName; }
  get rumble() { return this.session.rumble; }
  get whiteout() { return this.session.whiteout; }
  get crashT() { return this.session.crashT; }
  get stats() { return this.session.stats; }

  respawnAt(i, reset = true) {
    this.session.finished = false;
    this.session.respawnAt(i, reset);
  }

  onRespawn() {
    this.input.resetPosture();
    this.skierView.showBoots();
    this.fx.breakTrack();
    this.cam.snap();
  }

  // ------------------------------------------------------------ main loop
  frame(now) {
    requestAnimationFrame(this.frame);
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps = this.fps ? this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05 : 60;
    if (this.paused) dt = 0;
    this.handleKeys();
    this.input.frame(dt);
    this.acc += dt;
    let steps = 0;
    const inp = this.input.state();
    while (this.acc >= DT && steps < 40) {
      this.session.step(DT, inp);
      this.acc -= DT;
      steps++;
    }
    this.render(dt);
  }

  handleKeys() {
    for (const code of this.input.consume()) {
      if (code === 'KeyR') {
        if (this.state === 'finished') this.restartRun();
        else this.respawnAt(this.session.cpIndex, true);
      } else if (code === 'Space' || code === 'Enter') {
        if (this.state === 'crashed' && this.crashT > 0.4) this.session.getUp();
        else if (this.state === 'finished') this.restartRun();
      } else if (code === 'KeyM') this.audio.toggleMute();
      else if (code === 'KeyP') this.paused = !this.paused;
      else if (code === 'Backquote' && !this.debug) this.debug = new DebugPanel(this);
      else if (/^Digit\d$/.test(code) && this.mode === 'lab') {
        const d = +code.slice(5);
        this.respawnAt(d === 0 ? 9 : d - 1, true);
      }
    }
  }

  restartRun() {
    document.getElementById('finish').style.display = 'none';
    this.session.finished = false;
    this.session.runTime = 0;
    this.session.crashes = 0;
    this.respawnAt(0, true);
  }

  onSkierEvents(evs) {
    const sk = this.skier;
    for (const e of evs) {
      if (e.type === 'jump') {
        const r = e.report;
        this.audio.takeoff(r.timing, r.popVel);
        if (r.timing === 'perfect' && r.pop !== 'weak') {
          this.hud.callout(r.pop === 'huge' ? 'HUGE POP' : 'CLEAN POP', '#fff', 0.9);
          this.cam.addTrauma(0.15);
          this.fovKick = 6;
        }
        if (this.debug) this.debug.addJump(r);
        this.fx.breakTrack();
      } else if (e.type === 'takeoff') {
        this.fx.emit(sk.p.x, sk.p.y - sk.L, sk.p.z, sk.v.x * 0.3, 1, sk.v.z * 0.3, 2.5, 20);
      } else if (e.type === 'touchdown') {
        const imp = -e.vn;
        this.cam.addTrauma(Math.min(0.6, imp / 16));
        this.fx.emit(sk.p.x, sk.p.y - sk.L, sk.p.z, sk.v.x * 0.4, 2, sk.v.z * 0.4, 3 + imp * 0.4, 30 + imp * 6);
      } else if (e.type === 'landed') {
        const L = e.report;
        this.audio.land(L.quality, L.impactVel);
        if (L.quality === 'perfect' && L.airTime > 0.5) this.hud.callout('CLEAN', '#bff7c4', 0.9);
        else if (L.quality === 'sketchy') this.hud.callout('sketchy...', '#ffd27a', 0.8);
        if (this.debug && this.debug.jumps[0] && !this.debug.jumps[0].landing) this.debug.jumps[0].landing = L;
      } else if (e.type === 'thud') {
        this.audio.compress(-e.vn);
      } else if (e.type === 'bottom') {
        this.audio.thump(Math.min(1, e.dv / 6));
        this.cam.addTrauma(Math.min(0.5, e.dv / 8));
      } else if (e.type === 'hit') {
        if (e.what === 'tree' || e.what === 'wall' || e.what === 'pole') this.audio.wood(Math.min(1, e.speed / 6));
        this.cam.addTrauma(Math.min(0.6, e.speed / 10));
      }
    }
  }

  onCrash(cause) {
    const sk = this.skier;
    this.audio.crash(Math.min(1, sk.speed / 20));
    this.cam.addTrauma(0.7);
    this.hud.callout(cause.toUpperCase(), '#ffb4a8', 1.6);
    this.fx.emit(sk.p.x, sk.p.y - sk.L, sk.p.z, sk.v.x * 0.5, 2, sk.v.z * 0.5, 4, 60);
    this.fx.breakTrack();
  }

  showFinish() {
    const el = document.getElementById('finish');
    const t = this.runTime;
    const mm = Math.floor(t / 60);
    const ss = (t % 60).toFixed(1).padStart(4, '0');
    el.innerHTML = `<h2>${this.mode === 'lab' ? 'LAB COMPLETE' : 'YOU MADE IT DOWN'}</h2>
      <div>time ${mm}:${ss} &nbsp; crashes ${this.crashes} &nbsp; saves ${this.session.saves} &nbsp; longest air ${this.stats.bestAir.toFixed(2)} s &nbsp; clean landings ${this.stats.perfectLandings}</div>
      <p>R / Enter: go again</p>`;
    el.style.display = 'flex';
  }

  // Ballistic landing prediction for the camera.
  predictLanding() {
    const sk = this.skier;
    let x = sk.p.x;
    let y = sk.p.y - sk.L;
    let z = sk.p.z;
    let vx = sk.v.x;
    let vy = sk.v.y;
    let vz = sk.v.z;
    const st = 0.05;
    for (let t = 0; t < 4; t += st) {
      vy -= 9.81 * st;
      x += vx * st;
      y += vy * st;
      z += vz * st;
      const h = this.world.height(x, z);
      if (y <= h) return { x, y: h, z, t };
    }
    return null;
  }

  // ---------------------------------------------------------------- render
  render(dt) {
    const sk = this.skier;
    const alpha = this.acc / DT;
    const t = performance.now() / 1000;
    let focus;
    if (this.state === 'crashed') {
      this.skierView.poseRagdoll(this.ragdoll);
      const c = this.ragdoll.center();
      focus = { ...c, vel: this.ragdoll.velocity(), ragdoll: true };
    } else {
      this.skierView.pose(sk, sk.p, t);
      focus = { ...sk.p, vel: sk.v, ragdoll: false };
      // spray & tracks
      if (sk.grounded && this.state === 'skiing') {
        const left = { x: Math.cos(sk.heading), z: -Math.sin(sk.heading) };
        const f = this.skierView.feet;
        const s = 0.14;
        this.fx.addTrack({ x: f.x + left.x * s, y: f.y, z: f.z + left.z * s }, { x: f.x - left.x * s, y: f.y, z: f.z - left.z * s });
        const spray = sk.skid * 1.4 + Math.abs(sk.edge) * sk.speed * 0.08 + (sk.surf && sk.surf.powder ? sk.speed * 0.15 : 0);
        if (spray > 0.6) {
          const n = Math.min(6, Math.floor(spray * dt * 30) + (Math.random() < spray * dt * 30 % 1 ? 1 : 0));
          const r = { x: -left.x, z: -left.z };
          const side = Math.sign(sk.edge || 1);
          this.fx.emit(f.x, f.y, f.z, sk.v.x * 0.35 + r.x * side * 3, 1.2, sk.v.z * 0.35 + r.z * side * 3, 1.5, n, 0.7);
        }
      }
    }
    this.fx.update(dt);
    const landing = !sk.grounded && this.state === 'skiing' ? this.predictLanding() : null;
    this.fovKick = Math.max(0, (this.fovKick || 0) - dt * 12);
    this.cam.update(dt, {
      x: focus.x, y: focus.y, z: focus.z, vel: focus.vel, heading: sk.heading, grounded: sk.grounded,
      world: this.world, landing, ragdoll: focus.ragdoll, boostFov: this.fovKick,
    });
    // rough snow & avalanche shake
    if (sk.grounded && sk.surf && sk.surf.rough > 0.2 && sk.speed > 8) this.cam.addTrauma(dt * sk.surf.rough * 0.6);
    if (this.rumble > 0.2) this.cam.addTrauma(dt * this.rumble * 0.9);

    // sun follows the skier for crisp local shadows
    this.sun.position.set(focus.x + this.sunDir.x * 150, focus.y + this.sunDir.y * 150, focus.z + this.sunDir.z * 150);
    this.sun.target.position.set(focus.x, focus.y, focus.z);

    const fwd = { x: this.cam.dir.x, z: this.cam.dir.z };
    this.terrainView.update(focus.x, focus.z, fwd.x, fwd.z, 2);
    this.eventViews.update(dt);

    this.audio.update({
      speed: sk.speed, grounded: sk.grounded, crashed: this.state !== 'skiing', edge: sk.edge, load: sk.load,
      skid: sk.skid, ice: sk.surf && sk.surf.chatter, rock: sk.surf && sk.surf.name === 'rock',
      powder: sk.surf && sk.surf.powder, rumble: this.rumble,
    });
    const vertical = sk.p.y - this.world.endElevation;
    this.hud.update(dt, {
      speed: this.state === 'crashed' ? 0 : sk.speed, vertical, balance: sk.balance, balF: sk.balF, balL: sk.balL,
      px: this.input.px, py: this.input.py, whiteout: this.whiteout,
    });
    if (this.state === 'crashed') this.hud.hint(this.crashT > 0.4 ? 'SPACE get up  -  R restart from checkpoint' : '');
    else if (this.state === 'finished') this.hud.hint('');
    else if (!this.input.locked && !this.input.absolute && !this.input.override) this.hud.hint('click to capture the mouse');
    else this.hud.hint('');
    if (this.debug) this.debug.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

function makeSky() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#5f8fc4');
  gr.addColorStop(0.45, '#a9c6e2');
  gr.addColorStop(0.62, '#dbe7f1');
  gr.addColorStop(1, '#eef3f7');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
