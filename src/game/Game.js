import { BALANCE } from '../data/balance.js';
import { BUILDINGS, BUILD_ORDER, ROLE_NAMES } from '../data/buildings.js';
import { Simulation } from '../core/Simulation.js';
import { AutoPlayer } from '../core/bot/AutoPlayer.js';
import { footprint } from '../core/entities/Building.js';
import { isUnlocked } from '../core/systems/PopulationSystem.js';
import { canAfford } from '../core/systems/ResourceSystem.js';
import { Renderer } from '../render/Renderer.js';
import { GrandmaCrowd } from '../render/GrandmaCrowd.js';
import { WorldView } from '../render/WorldView.js';
import { Effects } from '../render/Effects.js';
import { Input } from './Input.js';
import { CameraController } from './CameraController.js';
import { SaveStore } from './SaveStore.js';
import { HUD } from '../ui/HUD.js';
import { Menus } from '../ui/Menus.js';
import { Speech, pickLine } from '../ui/Speech.js';
import { DevPanel, PerfPanel } from '../ui/DevPanel.js';
import { Sfx } from '../audio/Sfx.js';

// Presentation layer: owns the render loop, turns input into simulation
// commands and turns simulation events into sound, particles and words.
export class Game {
  constructor(canvas, uiRoot, params) {
    this.params = params;
    this.canvas = canvas;
    this.r = new Renderer(canvas);
    this.effects = new Effects(this.r.scene);
    this.crowd = new GrandmaCrowd(this.r.scene);
    this.world = new WorldView(this.r.scene, this.crowd, this.effects);
    this.input = new Input(canvas);
    this.cam = new CameraController(this.r.camera);
    this.hud = new HUD(uiRoot);
    this.speech = new Speech(this.hud.speechLayer);
    this.sfx = new Sfx();
    this.store = new SaveStore(params.nosave);
    this.perf = { fps: 0, frameMs: 0, simMs: 0, renderMs: 0, frames: 0, acc: 0, history: [] };
    this.perfPanel = new PerfPanel(uiRoot, params.debug);
    this.menus = new Menus(uiRoot, this._menuHandlers());
    this.dev = params.debug ? new DevPanel(uiRoot, this) : null;
    this.sim = null;
    this.mode = 'title';
    this.build = { on: false, type: 'bed', rot: 0, cx: 0, cz: 0, ok: false };
    this.time = 0;
    this.timers = [];
    this.rattleUntil = 0;
    this.chatT = 6;
    this.bot = null;
    this.input.onLockChange = (locked) => {
      if (!locked && this.mode === 'play' && !this.params.test && !this.menus.open) this.pause();
    };
    canvas.addEventListener('click', () => {
      this.sfx.unlock();
      if (this.mode === 'play' && !this.params.test) this.input.requestLock();
    });
    this.hud.buildbar.addEventListener('click', (e) => {
      const it = e.target.closest('.bitem');
      if (it && isUnlocked(this.sim.state, it.dataset.type)) { this.build.type = it.dataset.type; this.sfx.play('ui'); }
    });
    window.addEventListener('beforeunload', () => this.save());
    window.__TMG = this; // test / debug hook

    // Render the world behind the title screen.
    this.sim = Simulation.newGame(params.seed ?? undefined);
    if (params.test && params.cont && this.store.has()) this.start(true);
    else if (params.stress || params.test) this.start(false);
    else this.menus.title(this.store.has());
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---- lifecycle ----------------------------------------------------------------

  start(fromSave) {
    this.speech.clear();
    if (fromSave) {
      const sim = this.store.load();
      if (sim) this.sim = sim;
    } else {
      this.sim = Simulation.newGame(this.params.seed ?? undefined);
      if (this.params.stress) this.sim.setupStress(this.params.stress);
    }
    this.resetViews();
    this.mode = 'play';
    this.menus.close();
    if (!this.params.test) this.input.requestLock();
    if (this.params.autoplay) this.bot = new AutoPlayer(this.sim, { policy: 'balanced' });
    if (!fromSave && !this.params.stress) {
      this.later(1.2, () => this.say(this.sim.state.grandmas[0]?.id, pickLine('intro'), 3.5, true));
    }
  }

  // Throw away all per-entity views (after load/reset).
  resetViews() {
    for (const v of this.world.buildings.values()) this.r.scene.remove(v.group);
    this.world.buildings.clear();
    for (const v of this.world.nodes.values()) this.r.scene.remove(v);
    this.world.nodes.clear();
    this.crowd.lastColorKey = '';
    const p = this.sim.state.player;
    this.cam.target.set(p.x, 1, p.z);
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.menus.pause();
  }

  resume() {
    this.mode = 'play';
    this.menus.close();
    if (!this.params.test) this.input.requestLock();
  }

  save() {
    if (this.sim && this.mode !== 'title') this.store.save(this.sim);
  }

  _menuHandlers() {
    return {
      click: () => { this.sfx.unlock(); this.sfx.play('ui'); },
      continue: () => this.start(true),
      newGame: () => { this.store.clear(); this.start(false); },
      resume: () => this.resume(),
      save: () => { this.save(); this.hud.toast('Saved.'); this.resume(); },
      toggleMute: () => { this.sfx.setMuted(!this.sfx.muted); this.hud.toast(this.sfx.muted ? 'Sound off' : 'Sound on'); },
      confirmReset: () => this.menus.confirmReset(),
      pauseMenu: () => this.menus.pause(),
      reset: () => { this.store.clear(); this.start(false); },
      dismissSummary: () => this.dismissSummary(),
    };
  }

  dismissSummary() {
    this.mode = 'play';
    this.menus.close();
    if (!this.params.test) this.input.requestLock();
    const s = this.sim.state;
    if (s.day === 2 && !s.flags.firstHatch) {
      this.later(0.8, () => this.say(s.grandmas[0]?.id, pickLine('firstEgg'), 4.5, true));
    }
  }

  later(sec, fn) { this.timers.push({ at: this.time + sec, fn }); }

  // force=false lines are chatter: rate-limited and only near the player,
  // so a crowd never talks over itself.
  say(id, text, dur = 2.8, force = false) {
    if (!id || !text) return;
    if (!force) {
      const g0 = this.sim.getGrandma(id);
      if (!g0 || this._near(g0.x, g0.z) < 0.35 || this.time - (this.lastSay || -9) < 1.6) return;
      this.lastSay = this.time;
    }
    this.speech.say(id, text, this.time, dur);
    const g = this.sim.getGrandma(id);
    if (g) this.sfx.play('grandma', { volume: this._near(g.x, g.z) * 0.8 });
  }

  // Volume falloff by distance from the player.
  _near(x, z) {
    const p = this.sim.state.player;
    const d = Math.hypot(x - p.x, z - p.z);
    return Math.max(0, 1 - d / 30);
  }

  // ---- main loop -------------------------------------------------------------------

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const t0 = performance.now();

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.time >= this.timers[i].at) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    }

    if (this.input.hit('F3')) this.perfPanel.toggle();
    if (this.mode === 'play') this.handleInput(dt);
    else this.sim.setInput(0, 0);

    let simMs = 0;
    if (this.mode === 'play') {
      const ts = performance.now();
      let rem = dt * (this.params.speed || 1);
      while (rem > 1e-4) { const h = Math.min(0.05, rem); if (this.bot) this.bot.update(h); this.sim.step(h); rem -= h; }
      simMs = performance.now() - ts;
      this.handleEvents();
      this.ambient(dt);
    }

    // Camera & views.
    const p = this.sim.state.player;
    this.cam.update(dt, p.x, p.z, this.mode === 'play' ? this.input : { mouseDX: 0, mouseDY: 0, wheel: 0, down: () => false });
    if (this.mode === 'title') this.cam.yaw += dt * 0.05;
    const rs = performance.now();
    this.r.setTime(this.sim.state, BALANCE.dayLength, BALANCE.nightLength);
    this.world.update(this.sim, this.time, dt);
    const cs = performance.now();
    this.crowd.update(this.sim, this.time, this.r.camera);
    const crowdMs = performance.now() - cs;
    this.effects.update(dt, this.time);
    this.updateBuildGhost();
    this.r.render();
    const renderMs = performance.now() - rs;

    // HUD (~10 Hz for the heavy bits).
    this.hudT = (this.hudT || 0) - dt;
    const showHud = this.mode !== 'title';
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.hud.update(this.sim.status(), this.sim.objective(), !showHud);
    }
    this.hud.nightText.classList.toggle('hidden', this.sim.state.phase !== 'night' || this.mode === 'title');
    this.speech.update(this.sim, this.r.camera, this.time, window.innerWidth, window.innerHeight);
    this.input.endFrame();

    // Perf stats.
    const pf = this.perf;
    pf.frames++; pf.acc += dt;
    pf.simMs = pf.simMs * 0.9 + simMs * 0.1;
    pf.renderMs = pf.renderMs * 0.9 + renderMs * 0.1;
    pf.crowdMs = (pf.crowdMs || 0) * 0.9 + crowdMs * 0.1;
    pf.frameMs = pf.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    if (pf.acc >= 1) {
      pf.fps = pf.frames / pf.acc;
      pf.history.push({ t: Math.round(this.time), fps: Math.round(pf.fps), n: this.sim.state.grandmas.length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null });
      if (pf.history.length > 600) pf.history.shift();
      pf.frames = 0; pf.acc = 0;
      this.perfPanel.update(this);
    }
  }

  // ---- input -> commands ------------------------------------------------------------

  handleInput(dt) {
    const inp = this.input;
    const s = this.sim.state;
    if (inp.hit('Escape')) {
      if (this.build.on) { this.toggleBuild(false); } else { this.pause(); return; }
    }
    if (inp.hit('KeyB')) this.toggleBuild(!this.build.on);
    const ax = inp.moveAxis();
    const w = this.cam.toWorld(ax.x, ax.y);
    if (!this.bot) this.sim.setInput(w.x, w.z, inp.down('ShiftLeft') || inp.down('ShiftRight'));

    if (this.build.on) {
      for (let i = 0; i < 10; i++) {
        if (inp.hit('Digit' + ((i + 1) % 10))) {
          const t = BUILD_ORDER[i];
          if (t && isUnlocked(s, t)) { this.build.type = t; this.sfx.play('ui'); }
        }
      }
      if (inp.hit('Tab')) this.cycleBuild(1);
      if (inp.hit('KeyR')) { this.build.rot = (this.build.rot + 1) % 4; this.sfx.play('ui'); }
      if (inp.rmbPressed) this.toggleBuild(false);
      if (inp.hit('KeyE') || inp.lmbPressed) this.tryPlace();
      this.hud.setPrompt(null);
      return;
    }

    const press = inp.hit('KeyE') || inp.lmbPressed;
    const hold = inp.down('KeyE') || inp.lmb;
    const it = this.sim.getInteraction();
    if (!this.bot && (press || hold)) this.sim.interact(press, hold, dt);
    else if (!this.bot) this.sim.interact(false, false, 0);
    if (!this.bot && inp.hit('KeyQ')) this.sim.secondary();
    // Prompt with a progress bar for hold actions.
    let extra = '';
    if (it && it.kind === 'build') { const b = this.sim.getBuilding(it.id); extra = `<span class="progress"><div style="width:${Math.round((b?.progress || 0) * 100)}%"></div></span>`; }
    if (it && it.kind === 'dial') { const b = this.sim.getBuilding(it.id); extra = `<span class="progress"><div style="width:${Math.round((b?.inc.dial || 0) * 100)}%"></div></span>`; }
    if (it && it.kind === 'sleep') extra = `<span class="progress"><div style="width:${Math.round(((s.player.sleepHold || 0) / 0.6) * 100)}%"></div></span>`;
    this.hud.setPrompt(s.phase === 'day' ? it : null, extra);
  }

  toggleBuild(on) {
    this.build.on = on;
    this.hud.showBuild(on);
    if (on && !isUnlocked(this.sim.state, this.build.type)) this.build.type = 'bed';
    this.sfx.play('ui');
    if (!on) this.world.updateGhost(this.sim, null);
  }

  cycleBuild(dir) {
    const list = BUILD_ORDER.filter((t) => isUnlocked(this.sim.state, t));
    const i = list.indexOf(this.build.type);
    this.build.type = list[(i + dir + list.length) % list.length];
    this.sfx.play('ui');
  }

  updateBuildGhost() {
    if (!this.build.on || this.mode !== 'play') { this.world.updateGhost(this.sim, null); return; }
    const s = this.sim.state;
    const p = s.player;
    const t = this.build.type;
    const [w, d] = footprint(t, this.build.rot);
    // Place in front of the player (camera-facing), snapped to the grid.
    const fwd = this.cam.toWorld(0, 1);
    const dist = Math.max(w, d) / 2 + 1.6;
    const cx = Math.round(p.x + fwd.x * dist - w / 2);
    const cz = Math.round(p.z + fwd.z * dist - d / 2);
    this.build.cx = cx; this.build.cz = cz;
    const chk = this.world.updateGhost(this.sim, t, cx, cz, this.build.rot);
    this.build.ok = chk.ok;
    this.hud.renderBuildBar(s, t, (k) => isUnlocked(s, k), (k) => canAfford(s, BUILDINGS[k].cost));
    const def = BUILDINGS[t];
    const cost = Object.entries(def.cost).map(([k, v]) => `${v} ${k}`).join(', ');
    this.hud.setBuildHint(`<b>${def.name}</b> — ${def.desc} <i>(${cost})</i> ${chk.ok ? '' : `<span class="bad">${chk.reason}</span>`}<br><span class="key">E</span>place <span class="key">R</span>rotate <span class="key">1-0</span>pick <span class="key">B</span>close`);
  }

  tryPlace() {
    const b = this.build;
    const r = this.sim.place(b.type, b.cx, b.cz, b.rot);
    if (r.ok) {
      this.sfx.play('place');
      if (!this.input.down('ShiftLeft')) this.toggleBuild(false);
      this.hud.toast(`${BUILDINGS[b.type].name} placed. Hold E to build it${this.sim.state.grandmas.some((g) => g.job === 'builder') ? ' (or let the Builders do it)' : ''}.`);
    } else {
      this.sfx.play('warn', { volume: 0.4 });
      this.hud.toast(r.reason);
    }
  }

  // ---- events -> presentation -----------------------------------------------------

  handleEvents() {
    const evs = this.sim.drainEvents();
    const s = this.sim.state;
    const sfx = this.sfx;
    let unlocked = null;
    for (const e of evs) {
      switch (e.type) {
        case 'gather': {
          const fx = e.res === 'food' ? 'berry' : e.res === 'wood' ? 'chip' : 'stone';
          this.effects.burst(fx, e.x, 0.8, e.z, 5);
          if (e.res === 'wood') this.effects.burst('leaf', e.x, 2.4, e.z, 3);
          this.world.hitNode(e.node, this.time);
          sfx.play(e.res === 'food' ? 'berry' : e.res, { pitch: 0.9 + Math.random() * 0.2 });
          this.speech.floaty(`+1 ${e.res}`, s.player.x, 1.7, s.player.z, this.time);
          break;
        }
        case 'playerDeposit':
          sfx.play('deposit');
          this.speech.floaty('Stored', s.player.x, 1.9, s.player.z, this.time, '#ffe58a');
          break;
        case 'deposit':
          if (e.source === 'grandma') sfx.play('deposit', { volume: 0.15 * this._near(s.player.x, s.player.z) });
          break;
        case 'placed': break;
        case 'built': {
          sfx.play('built');
          const b = this.sim.getBuilding(e.id);
          if (b && e.btype !== 'bed') this.hud.toast(`${BUILDINGS[e.btype].name} built.`);
          if (e.btype === 'double' || e.btype === 'deluxe') this.later(0.5, () => this.hud.toast('Auto-hatch is ON. Builders will carry eggs to it. Press E on it to switch off.', 5000));
          if (BUILDINGS[e.btype].job) this.later(0.3, () => this.hud.toast(`Press E at the ${BUILDINGS[e.btype].name} to assign a Grandma.`, 4000));
          break;
        }
        case 'hammer': {
          const b = this.sim.getBuilding(e.id);
          sfx.play('hammer', { pitch: 0.9 + Math.random() * 0.25 });
          if (b) this.effects.burst('dust', b.x + (Math.random() - 0.5) * b.w, 0.3, b.z + (Math.random() - 0.5) * b.d, 2);
          break;
        }
        case 'eggPickup':
          sfx.play('pickup');
          if (!s.flags.firstHatch) this.say(s.grandmas[0]?.id, pickLine('eggPickup'), 2.8, true);
          break;
        case 'eggDrop': sfx.play('place', { volume: 0.5 }); break;
        case 'eggInserted': sfx.play('place', { pitch: 1.3 }); break;
        case 'lidClosed': sfx.play('lid'); break;
        case 'dialClick':
          sfx.play('dial', { pitch: 0.8 + e.v * 0.5 });
          if (e.v === 1 && !s.flags.firstHatch) this.say(s.grandmas[0]?.id, 'There. Nana.', 2.5, true);
          break;
        case 'heating': sfx.play('rattle'); this.rattleId = e.id; this.rattleUntil = this.time + BALANCE.incubator.heatTime + BALANCE.incubator.crackTime - 0.3; break;
        case 'cracking': sfx.play('crack'); sfx.play('wobble'); break;
        case 'wobble': sfx.play('wobble', { volume: 0.4 * this._nearB(e.id) }); break;
        case 'hatched': this.onHatched(e); break;
        case 'night':
          sfx.play('night');
          this.toggleBuild(false);
          this.hud.nightText.textContent = e.homeless ? `Night. ${e.homeless} Grandma${e.homeless > 1 ? 's' : ''} sleep${e.homeless > 1 ? '' : 's'} on the lawn.` : 'Night. Everyone is tucked in.';
          break;
        case 'dawn':
          sfx.play('dawn');
          this.save();
          if (!this.params.stress && !this.params.test && !this.bot) { this.mode = 'summary'; this.menus.summary(e.summary); if (document.exitPointerLock) document.exitPointerLock(); }
          if (e.summary.eggsLaid) this.later(0.2, () => sfx.play('eggLaid'));
          break;
        case 'unlock':
          (unlocked = unlocked || []).push(e.name);
          break;
        case 'assigned': {
          sfx.play('assign');
          const g = this.sim.getGrandma(e.id);
          if (g && e.by !== 'foreman') { this.say(g.id, pickLine('assigned')); this.hud.toast(`Grandma is now a ${ROLE_NAMES[e.role]}.`, 1800); }
          break;
        }
        case 'unassigned': this.say(e.id, pickLine('unassigned')); sfx.play('ui'); break;
        case 'eat':
          if (!s.flags.saidFirstMeal && e.id === s.grandmas[0]?.id && s.day === 1) { s.flags.saidFirstMeal = true; this.say(e.id, pickLine('firstMeal'), 3, true); }
          break;
        case 'noFood':
          if (this.time - (this.lastHungry || -99) > 9) { this.lastHungry = this.time; this.say(e.id, pickLine('hungry')); sfx.play('warn', { volume: 0.5 }); }
          break;
        case 'quirk':
          if (Math.random() < 0.3 && (e.quirk === 'tea' || e.quirk === 'nap')) this.say(e.id, pickLine(e.quirk));
          break;
        case 'pat': {
          const g = this.sim.getGrandma(e.id);
          this.crowd.pat(e.id, this.time);
          sfx.play('pat');
          if (g) { this.effects.burst('heart', g.x, 1.4, g.z, 3); this.say(g.id, pickLine('pat'), 2.5, true); }
          break;
        }
        case 'foremanRing': {
          const bell = this.sim.getBuilding(e.id);
          if (bell) { this.world.ringBell(bell.id, this.time); this.crowd.temp.ring.set(bell.workers[0], this.time); }
          sfx.play('bell', { volume: 0.5 * this._near(bell ? bell.x : 0, bell ? bell.z : 0) });
          if (Math.random() < 0.25 && bell) this.say(bell.workers[0], pickLine('foreman'));
          break;
        }
        case 'notice': this.hud.toast(e.text); sfx.play('warn', { volume: 0.3 }); break;
        case 'objective': sfx.play('ui', { pitch: 1.4 }); break;
        case 'tutorialDone': this.later(1, () => this.hud.toast('That is the job. Keep them fed, housed and busy. They will keep hatching.', 6000)); break;
        case 'toggle': sfx.play('dial'); this.hud.toast(`Auto-hatch ${e.on ? 'ON' : 'OFF'}`, 1500); break;
      }
    }
    if (unlocked) {
      const names = unlocked.map((n) => `<b>${n}</b>`).join(', ');
      this.later(0.8, () => { this.hud.toast(`New building${unlocked.length > 1 ? 's' : ''}: ${names} (press B)`, 5000); sfx.play('built', { pitch: 1.3 }); });
    }
    // Keep the appliance rattling while it works.
    if (this.rattleUntil > this.time && (this.time - (this.lastRattle || 0)) > 1.1) {
      this.lastRattle = this.time;
      if (this.time > 0.5) sfx.play('rattle', { volume: this._nearB(this.rattleId) });
    }
  }

  _nearB(id) {
    const b = this.sim.getBuilding(id);
    return b ? this._near(b.x, b.z) : 0.5;
  }

  onHatched(e) {
    const s = this.sim.state;
    const pos = this.world.incubatorEggWorld(e.building) || { x: e.x, y: 1, z: e.z };
    this.effects.burst('shell', pos.x, pos.y + 0.2, pos.z, e.first ? 26 : 14);
    this.effects.burst('sparkle', e.x, 1.0, e.z, e.first ? 20 : 8);
    this.sfx.play('crack', { volume: this._near(e.x, e.z) });
    this.sfx.play('pop', { volume: Math.max(0.25, this._near(e.x, e.z)) });
    this.later(1.3, () => this.say(e.id, pickLine('hatch'), 2.8, !!e.first));
    if (e.first) {
      this.later(3.4, () => this.say(s.grandmas[0]?.id, pickLine('firstHatch'), 3, true));
      this.later(0.6, () => this.hud.toast('<b>GRANDMAS: 2</b>', 3500));
    }
    if (e.rare) {
      const names = { big: 'A BIG GRANDMA hatched.', tiny: 'A TINY GRANDMA hatched.', golden: 'A GOLDEN GRANDMA hatched. Nobody mentions it.' };
      this.later(0.8, () => this.hud.toast(names[e.rare], 5000));
      if (e.rare === 'golden') this.effects.burst('sparkle', e.x, 1.2, e.z, 40);
    }
  }

  // Occasional chatter near the player; more crowd comments as the colony grows.
  ambient(dt) {
    const s = this.sim.state;
    if (s.phase !== 'day') return;
    this.chatT -= dt;
    if (this.chatT > 0) return;
    this.chatT = 7 + Math.random() * 8;
    const p = s.player;
    const near = s.grandmas.filter((g) => !g.inside && Math.hypot(g.x - p.x, g.z - p.z) < 12);
    if (!near.length) return;
    const g = near[Math.floor(Math.random() * near.length)];
    const key = s.grandmas.length > 25 && Math.random() < 0.5 ? 'crowd' : g.stiff && Math.random() < 0.5 ? 'noBed' : 'idle';
    this.say(g.id, pickLine(key));
  }
}
