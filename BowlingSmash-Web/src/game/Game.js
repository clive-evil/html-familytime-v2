// Game orchestrator: owns the Sim, Renderer, UI, save and the main loop.
import { Sim, DT } from '../sim/Sim.js';
import { initPhysics } from '../sim/rapier.js';
import { LEVELS, getLevel } from '../levels/levels.js';
import { SOLUTIONS } from '../levels/solutions.js';
import { Renderer } from '../render/Renderer.js';
import { UI, fmtTime } from '../ui/ui.js';
import { audio } from '../audio/Audio.js';
import { SaveStore } from '../systems/save.js';
import { Analytics } from '../systems/analytics.js';
import { Platform, haptics } from '../systems/platform.js';
import { ECONOMY, LIVES, BOOSTER_UNLOCK, BOOSTER_INFO } from '../systems/config.js';
import * as P from '../systems/progression.js';
import { clamp } from '../sim/math.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor({ root, canvas, params }) {
    this.root = root;
    this.canvas = canvas;
    this.params = params;
    this.debug = params.has('debug');
    this.playtest = params.has('playtest');
    this.store = new SaveStore({ memory: this.playtest || params.has('memsave') });
    this.analytics = new Analytics({ memory: this.playtest || params.has('memsave'), debug: this.debug });
    this.timeScale = 1;
    this.slowmoUntil = 0;
    this.hitStopUntil = 0;
    this.debugSlowmo = false;
    this.acc = 0;
    this.aim = null;
    this.pendingBooster = null;
    this.spin = 0;
    this.lastFrame = performance.now();
    this.fps = 60;
    this.sessionStart = Date.now();
    this.handled = {};
  }

  async init() {
    await initPhysics();
    const { save, fresh } = this.store.load();
    this.save = save;
    this.fresh = fresh;
    save.sessions = (save.sessions || 0) + 1;
    if (this.params.has('unlimitedlives')) save.settings.unlimitedLives = true;
    this.persist();
    this.renderer = new Renderer(this.canvas);
    this.ui = new UI(this.root, audio);
    this.platform = new Platform({ ui: this.ui, analytics: this.analytics });
    audio.setEnabled(save.settings.sound);
    this.ui.setSound(save.settings.sound);
    this._wireUI();
    this._wireInput();
    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.analytics.track('session_end', { duration_ms: Date.now() - this.sessionStart, reason: 'hidden' });
    });
    window.addEventListener('pagehide', () => this.analytics.track('session_end', { duration_ms: Date.now() - this.sessionStart }));
    this.analytics.track('session_start', { fresh, playtest: this.playtest, level: save.currentLevel, sessions: save.sessions });

    const lv = +this.params.get('level');
    const startId = lv >= 1 && lv <= LEVELS.length ? lv : this.playtest ? 1 : Math.min(save.currentLevel, LEVELS.length);
    // FTUE: a fresh save launches straight into Level 1 - no menus.
    await this.startLevel(startId, { skipLives: true });
    if (!fresh && !this.playtest && P.dailyAvailable(save) && save.sessions > 1 && !lv) {
      setTimeout(() => this.showDaily(), 700);
    }
    this.platform.loadingStop();
    requestAnimationFrame((t) => this.frame(t));
    if (this.debug) {
      const { DebugPanel } = await import('../debug/debug.js');
      this.dbg = new DebugPanel(this);
    }
    window.__game = this; // QA / automation hook
  }

  persist() { this.store.write(this.save); }

  // ============================================================== levels
  async startLevel(id, { skipLives = false, retry = false } = {}) {
    const level = getLevel(id);
    if (!level) return;
    this.ui.closeModal();
    this.ui.hideMap();
    this.ui.clearBanner();
    if (!skipLives && !P.canPlay(this.save) && id > LIVES.protectedLevels) {
      this.showOutOfHearts(() => this.startLevel(id, { retry }));
      return;
    }
    if (this.sim) this.sim.dispose();
    this.level = level;
    this.sim = new Sim(level, { unlimitedBalls: this.save.settings.unlimitedBalls });
    this.renderer.pendingBooster = null;
    this.renderer.load(this.sim);
    this.acc = 0;
    this.timeScale = 1;
    this.slowmoUntil = 0;
    this.handled = {};
    this.pendingBooster = null;
    this.autoQueue = null;
    this.aim = null;
    this.renderer.setAim(null);
    this.firstHitThisShot = false;
    this.attemptStart = performance.now();
    const prev = this.save.completed[id];
    this.attemptNumber = (this.attemptCounts ||= {})[id] = (this.attemptCounts[id] || 0) + 1;
    this.ui.setLevel(level);
    if (!(id === 1 && !prev)) this.ui.intro(level);
    else this.ui.el.intro.innerHTML = '';
    this.ui.setSpin(0);
    this.ui.showSpin(level.id >= 6, false);
    this._refreshHud();
    this.analytics.track('level_start', { level: id, attempt_number: this.attemptNumber, retry, balls: level.balls, targets: this.sim.targetsTotal });
    this.platform.gameplayStart();
    this._tutorialForLevel();
  }

  _tutorialForLevel() {
    const id = this.level.id;
    this.ui.hint(null); this.ui.hand(null);
    this.tutorial = null;
    if (id === 1 && !this.save.seen.aim) {
      this.tutorial = 'aim';
      setTimeout(() => this._showAimHint(), 350);
    } else if (id === 6 && !this.save.seen.spin) {
      this.tutorial = 'spin';
      this.ui.showSpin(true, true);
      this.ui.hint('SLIDE FOR SPIN', 'Curve the ball around the block');
    }
    // booster intro (one free forced use when first introduced)
    for (const [k, lvl] of Object.entries(BOOSTER_UNLOCK)) {
      if (id === lvl && !this.save.boosterIntro[k]) {
        setTimeout(() => this.boosterIntro(k), 900);
      }
    }
  }

  _showAimHint() {
    if (this.tutorial !== 'aim' || !this.sim?.aimBall) return;
    const bp = this.sim.aimBall.body.translation();
    const a = this.renderer.project(bp);
    const b = { x: a.x - 10, y: Math.min(window.innerHeight - 40, a.y + Math.min(170, window.innerHeight * 0.2)) };
    this.ui.hint('DRAG TO AIM');
    this.ui.hand(a, b);
  }

  boosterIntro(kind) {
    if (this.level.id !== BOOSTER_UNLOCK[kind] || this.sim.state !== 'aim' || this.autoQueue || this.sim.shotsTaken > 0) return;
    this.platform.gameplayStop();
    const m = this.ui.boosterIntroPanel(kind);
    this.ui.btn(m, '#ok', () => {
      this.ui.closeModal();
      this.save.boosterIntro[kind] = true;
      this.save.boosters[kind] = (this.save.boosters[kind] || 0) + 1; // free tutorial use
      this.persist();
      this.pendingBooster = kind;
      this.tutorial = `booster:${kind}`;
      this.ui.hint(`BOWL THE ${BOOSTER_INFO[kind].name}!`, 'Drag back and release');
      this._refreshHud(kind);
      this.platform.gameplayStart();
    });
  }

  restartLevel() {
    if (!this.sim) return;
    const midAttempt = this.sim.shotsTaken > 0 && this.sim.state !== 'won';
    const costs = midAttempt && this.level.id > LIVES.protectedLevels && !this.save.settings.unlimitedLives;
    const go = () => {
      if (midAttempt) {
        this._recordFail('restart');
        this.save.stats.retries++;
        this.analytics.track('retry', { level: this.level.id, attempt_number: this.attemptNumber, from: 'hud' });
      }
      this.persist();
      this.startLevel(this.level.id, { retry: true });
    };
    if (!costs) { go(); return; }
    const m = this.ui.modal(`<h2>RESTART?</h2><p>Restarting a level you've started costs <b>1 heart</b>.</p><div class="row"><button class="btn grey" id="no">KEEP PLAYING</button><button class="btn" id="yes">RESTART</button></div>`);
    this.ui.btn(m, '#no', () => this.ui.closeModal());
    this.ui.btn(m, '#yes', () => { this.ui.closeModal(); go(); });
  }

  _recordFail(reason) {
    this.save.stats.fails++;
    const lost = P.loseLife(this.save, this.level.id);
    if (lost) {
      this.analytics.track('heart_lost', { level: this.level.id, lives: this.save.lives, reason });
      audio.fanfare('heart');
    }
    this.persist();
  }

  // ================================================================ input
  _wireInput() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => {
      audio.unlock();
      if (this.ui.modalOpen || this.ui.mapEl || !this.sim || !this.sim.canShoot()) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      c.setPointerCapture(e.pointerId);
      if (this.tutorial === 'aim') { this.ui.hand(null); }
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!this.sim.canShoot()) { drag = null; this.renderer.setAim(null); return; }
      const aim = this._aimFromDrag(drag, e.clientX, e.clientY);
      this.aim = aim;
      this.renderer.setAim(aim);
      if (this.tutorial === 'aim' && aim) this.ui.hint('RELEASE TO BOWL');
    });
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      const aim = this.aim;
      this.renderer.setAim(null);
      this.aim = null;
      if (aim && aim.power >= 0.06 && this.sim.canShoot()) this.shoot(aim);
      else if (this.tutorial === 'aim') this._showAimHint();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { drag = null; this.aim = null; this.renderer.setAim(null); });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'q') this.ui.setSpin(this.ui.spin - 0.25);
      if (e.key === 'e') this.ui.setSpin(this.ui.spin + 0.25);
      if (e.key === 'r' && !this.ui.modalOpen) this.restartLevel();
    });
  }

  _aimFromDrag(start, x, y) {
    const s = this.level.start || [0, 0, 0];
    const hgt = (s[1] || 0) + 0.38;
    const p0 = this.renderer.screenToPlane(start.x, start.y, hgt);
    const p1 = this.renderer.screenToPlane(x, y, hgt);
    const sd = Math.hypot(x - start.x, y - start.y);
    if (!p0 || !p1 || sd < 10) return null;
    let vx = p0.x - p1.x, vz = p0.z - p1.z;
    // pulled back (toward camera) -> bowl forward. Pushing forward also works (forgiving).
    if (vz > 0) { vx = -vx; vz = -vz; }
    const angle = clamp((Math.atan2(vx, -vz) * 180) / Math.PI, -70, 70);
    const power = clamp(sd / (0.3 * Math.min(window.innerWidth, window.innerHeight * 0.9)), 0, 1);
    return { angle, power, spin: this.ui.spin };
  }

  shoot(aim) {
    const booster = this.pendingBooster;
    if (booster && !P.consumeBooster(this.save, booster)) this.pendingBooster = null;
    const shot = { angle: aim.angle, power: aim.power, spin: this.level.id >= 6 ? aim.spin : 0, booster: this.pendingBooster };
    this.sim.launch(shot);
    if (this.pendingBooster) this.analytics.track('booster_used', { level: this.level.id, booster: this.pendingBooster });
    this.pendingBooster = null;
    this.renderer.pendingBooster = null;
    this.save.stats.ballsUsed++;
    this.persist();
    this.firstHitThisShot = false;
    audio.launch(aim.power, booster === 'heavy');
    haptics.pulse('medium');
    this.analytics.track('shot', { level: this.level.id, angle: +shot.angle.toFixed(2), power: +shot.power.toFixed(3), spin: shot.spin, booster, balls_used: this.sim.ballsUsed, balls_remaining: this.sim.ballsLeft, targets_remaining: this.sim.targetsRemaining });
    if (this.tutorial === 'aim') { this.save.seen.aim = true; this.tutorial = null; }
    if (this.tutorial === 'spin' && shot.spin !== 0) { this.save.seen.spin = true; this.tutorial = null; }
    if (this.tutorial?.startsWith('booster')) this.tutorial = null;
    this.ui.hint(null); this.ui.hand(null);
    this.ui.el.intro.innerHTML = '';
    this._refreshHud();
  }

  // ============================================================== frame
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const rawDt = Math.min(0.1, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    this.fps = this.fps * 0.95 + (rawDt > 0 ? 1 / rawDt : 60) * 0.05;
    if (!this.sim) return;
    if (!document.hidden) this.save.stats.playMs += rawDt * 1000;
    audio.newFrame && audio.newFrame();

    // time scale: hit-stop > slow-mo > normal
    const now = performance.now();
    let ts = 1;
    if (now < this.hitStopUntil) ts = 0.06;
    else if (now < this.slowmoUntil) ts = 0.32;
    if (this.debugSlowmo) ts *= 0.25;
    this.acc += rawDt * ts;
    let steps = 0;
    while (this.acc >= DT && steps < 4) {
      if (this.autoQueue?.length && this.sim.state === 'aim') this._autoShot();
      this.sim.step();
      this.renderer.afterStep();
      this._events(this.sim.events);
      this.acc -= DT;
      steps++;
    }
    if (steps === 4) this.acc = 0;
    const alpha = clamp(this.acc / DT, 0, 1);
    this.renderer.sync(alpha, rawDt, t / 1000);
    this.renderer.updateCamera(rawDt, this.sim.state);
    this.renderer.render();
    this._rollSound();
    this._stateWatch();
    if ((this._hudTick = (this._hudTick || 0) + rawDt) > 0.5) { this._hudTick = 0; this._refreshHearts(); }
    this.dbg?.update();
  }

  _rollSound() {
    let sp = 0, ground = false;
    for (const b of this.sim.balls) {
      if (!b.active) continue;
      const v = b.body.linvel();
      sp = Math.max(sp, Math.hypot(v.x, v.z));
      ground = ground || Math.abs(v.y) < 1.2;
    }
    audio.setRoll(sp, ground);
  }

  _events(evs) {
    for (const ev of evs) {
      this.renderer.onEvent(ev);
      switch (ev.t) {
        case 'impact':
          audio.impact(ev.mat, ev.s, ev.ball);
          if (ev.ball && !ev.floorHit && ev.s > 0.45 && !this.firstHitThisShot) {
            this.firstHitThisShot = true;
            this.hitStopUntil = performance.now() + 45 + ev.s * 45; // brief hit pause
            haptics.pulse('heavy');
          }
          break;
        case 'shatter': if (ev.look === 'glass') audio.glassSmash(); else audio.shatterSmall(); break;
        case 'down': audio.targetDown(); this.ui.setTargets(this.sim.targetsRemaining, true); break;
        case 'bonus': {
          audio.bonus();
          const p = this.renderer.project(ev);
          this.ui.floater(`+${ECONOMY.goldPinBonus} GOLD PIN`, p.x, p.y - 30, '#ffcf3a');
          break;
        }
        case 'bomb': audio.bomb(); haptics.pulse('heavy'); break;
        case 'bumper': audio.impact('bumper', 1, true); break;
        case 'won': this.slowmoUntil = performance.now() + 750; break;
      }
    }
  }

  _stateWatch() {
    const st = this.sim.state;
    if (st === 'won' && !this.handled.won) { this.handled.won = true; this.onWin(); }
    if (st === 'lost' && !this.handled.lost) { this.handled.lost = true; this.onLose(); }
    if (st === 'aim' && this.handled.wasRolling) {
      this.handled.wasRolling = false;
      this._refreshHud();
      if (this.level.id <= 2 && this.sim.shotsTaken > 0) this.ui.hint('NICE! AGAIN!', 'Finish the rest');
      setTimeout(() => { if (this.sim?.state === 'aim' && this.ui.el.hint.querySelector('.bubble').textContent === 'NICE! AGAIN!') this.ui.hint(null); }, 1500);
    }
    if (st === 'rolling') this.handled.wasRolling = true;
  }

  // ========================================================== win / lose
  async onWin() {
    const level = this.level;
    const sim = this.sim;
    const ballsLeft = sim.ballsLeft;
    const result = P.applyWin(this.save, level, { shotsTaken: sim.shotsTaken, ballsLeft, bonusPins: sim.bonusDown });
    this.persist();
    const timeMs = performance.now() - this.attemptStart;
    this.analytics.track('level_win', { level: level.id, grade: result.grade, balls_used: sim.ballsUsed, balls_remaining: ballsLeft, targets_remaining: 0, attempt_number: this.attemptNumber, time_to_complete: Math.round(timeMs), coins: result.total });
    this.platform.gameplayStop();
    if (result.grade === 'strike') this.platform.happytime();
    haptics.pulse('success');
    this.renderer.addShake(0.6);
    await wait(380);
    this.ui.banner(result.grade);
    audio.fanfare(result.grade === 'clear' ? 'win' : result.grade);
    this.renderer.celebrate(result.grade);
    await wait(result.grade === 'strike' ? 1250 : 950);
    if (this.sim !== sim) return;
    this.ui.clearBanner();
    this._winPanel(result);
  }

  _winPanel(result) {
    const level = this.level;
    const last = level.id === LEVELS.length;
    const m = this.ui.winPanel({ level, result, targetsTotal: this.sim.targetsTotal, next: last ? 'FINISH' : 'NEXT LEVEL' });
    // coins fly to the counter
    if (result.total > 0) {
      const shown = this.save.coins - result.total;
      let running = shown;
      this.ui.setCoins(shown, true);
      const r = m.querySelector('.lines').getBoundingClientRect();
      setTimeout(() => this.ui.flyCoins({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, result.total, (amt, i) => {
        running += amt; this.ui.setCoins(running, true, true); audio.coin(i);
      }), 350);
    }
    const proceed = async () => {
      if (result.chest) {
        const contents = P.openChest(this.save, result.chest);
        this.persist();
        if (contents) await this.ui.chestPanel(result.chest, contents);
        this.ui.closeModal();
        this._refreshHud();
      }
      if (last) { this.showComplete(); return; }
      this.startLevel(level.id + 1);
    };
    this.ui.btn(m, '#next', proceed);
    this.ui.btn(m, '#replay', () => this.startLevel(level.id, { retry: true }));
  }

  async onLose() {
    const sim = this.sim;
    this.analytics.track('level_fail', { level: this.level.id, balls_used: sim.ballsUsed, balls_remaining: 0, targets_remaining: sim.targetsRemaining, attempt_number: this.attemptNumber, time_to_complete: Math.round(performance.now() - this.attemptStart) });
    this.ui.banner('out', `${sim.targetsRemaining} TARGET${sim.targetsRemaining === 1 ? '' : 'S'} LEFT`);
    audio.fanfare('fail');
    this.platform.gameplayStop();
    await wait(900);
    if (this.sim !== sim) return;
    this.ui.clearBanner();
    this._failPanel();
  }

  _failPanel() {
    const level = this.level;
    const protectedLvl = level.id <= LIVES.protectedLevels || this.save.settings.unlimitedLives;
    const m = this.ui.failPanel({ level, remaining: this.sim.targetsRemaining, canAfford: this.save.coins >= ECONOMY.continueCost, cost: ECONOMY.continueCost, heartsNote: protectedLvl ? '' : '−1 HEART' });
    const cont = (via) => {
      this.sim.addBalls(ECONOMY.continueBalls);
      this.handled.lost = false;
      this.save.stats.continues++;
      this.persist();
      this.analytics.track('continue', { level: level.id, via, targets_remaining: this.sim.targetsRemaining, attempt_number: this.attemptNumber });
      this.ui.closeModal();
      this._refreshHud();
      this.platform.gameplayStart();
    };
    this.ui.btn(m, '#ad', async () => { this.ui.closeModal(); await this.platform.requestRewarded('continue_+5_balls'); cont('sim_rewarded_ad'); });
    this.ui.btn(m, '#coinbuy', () => { if (P.spendCoins(this.save, ECONOMY.continueCost)) cont('coins'); });
    this.ui.btn(m, '#retry', () => {
      this._recordFail('out_of_balls');
      this.save.stats.retries++;
      this.analytics.track('retry', { level: level.id, attempt_number: this.attemptNumber, from: 'fail_panel' });
      this.persist();
      this.startLevel(level.id, { retry: true });
    });
  }

  showOutOfHearts(then) {
    const ms = P.regenLives(this.save);
    const m = this.ui.outOfHeartsPanel({ msToNext: ms, cost: ECONOMY.heartRefillCost, canAfford: this.save.coins >= ECONOMY.heartRefillCost });
    const iv = setInterval(() => {
      const left = P.regenLives(this.save);
      const el = m.querySelector('#hrt');
      if (el) el.textContent = fmtTime(left);
      if (this.save.lives > 0) { clearInterval(iv); this.persist(); then(); }
    }, 500);
    this.ui.btn(m, '#ad', async () => {
      clearInterval(iv); this.ui.closeModal();
      await this.platform.requestRewarded('refill_heart');
      this.save.lives = Math.min(LIVES.max, this.save.lives + 1); this.persist(); then();
    });
    this.ui.btn(m, '#refill', () => {
      if (P.spendCoins(this.save, ECONOMY.heartRefillCost)) { clearInterval(iv); this.save.lives = LIVES.max; this.persist(); then(); }
    });
    this.ui.btn(m, '#close', () => { clearInterval(iv); this.ui.closeModal(); this.openMap(); });
  }

  // ========================================================= meta screens
  openMap() {
    this.platform.gameplayStop();
    this.ui.showMap({
      levels: LEVELS, save: this.save,
      dailyReady: P.dailyAvailable(this.save) && !this.playtest,
      onPlay: (id) => { this.ui.hideMap(); this.startLevel(id); },
      onClose: () => { this.ui.hideMap(); this.platform.gameplayStart(); },
      onDaily: () => this.showDaily(),
    });
  }

  showDaily() {
    const claimed = !P.dailyAvailable(this.save);
    const m = this.ui.dailyPanel(this.save.daily.index, claimed);
    this.ui.btn(m, '#claim', () => {
      if (claimed) { this.ui.closeModal(); return; }
      const r = P.claimDaily(this.save);
      this.persist();
      if (r) {
        this.analytics.track('daily_claim', { day: r.day, coins: r.reward.coins || 0, boosters: r.reward.boosters || {} });
        audio.chest();
        this.ui.toast(`DAY ${r.day} REWARD CLAIMED!`);
      }
      this.ui.closeModal();
      if (this.ui.mapEl) this.openMap();
      this._refreshHud();
    });
  }

  showComplete() {
    const s = this.save.stats;
    const m = this.ui.completePanel({
      levels: Object.keys(this.save.completed).length, strikes: s.strikes, spares: s.spares, retries: s.retries,
      ballsUsed: s.ballsUsed, fails: s.fails, boostersUsed: s.boostersUsed, time: fmtTime(s.playMs),
    });
    this.analytics.track('prototype_complete', { ...s });
    this.ui.btn(m, '#again', () => {
      if (this.playtest) {
        this.store = new SaveStore({ memory: true });
        this.save = this.store.load().save;
        this.attemptCounts = {};
      }
      this.startLevel(1);
    });
    this.ui.btn(m, '#map', () => { this.ui.closeModal(); this.openMap(); });
  }

  // ============================================================ boosters
  onBooster(kind) {
    if (!this.sim || this.sim.state !== 'aim') return;
    if (this.pendingBooster === kind) { this.pendingBooster = null; this._refreshHud(); return; }
    if ((this.save.boosters[kind] || 0) > 0) {
      this.pendingBooster = kind;
      this._refreshHud();
      return;
    }
    const cost = ECONOMY.boosterCost[kind];
    const m = this.ui.buyBoosterPanel(kind, cost, this.save.coins >= cost);
    this.ui.btn(m, '#close', () => this.ui.closeModal());
    this.ui.btn(m, '#buy', () => {
      if (P.buyBooster(this.save, kind, cost)) {
        this.persist(); this.ui.closeModal(); this.pendingBooster = kind; this._refreshHud();
        this.analytics.track('booster_purchase', { booster: kind, cost, via: 'coins' });
      }
    });
    this.ui.btn(m, '#ad', async () => {
      this.ui.closeModal();
      await this.platform.requestRewarded(`booster_${kind}`);
      this.save.boosters[kind]++; this.persist(); this.pendingBooster = kind; this._refreshHud();
      this.analytics.track('booster_purchase', { booster: kind, via: 'sim_rewarded_ad' });
    });
  }

  // ================================================================= HUD
  _refreshHud(glow) {
    const s = this.save;
    this.ui.setTargets(this.sim.targetsRemaining);
    this.ui.setBalls(this.sim.ballsLeft, this.level.balls, s.settings.unlimitedBalls);
    const showCoins = s.coins > 0 || Object.keys(s.rewardedLevels).length > 0;
    this.ui.setCoins(s.coins, showCoins);
    this._refreshHearts();
    const unlocked = Object.entries(BOOSTER_UNLOCK).filter(([k, lvl]) => s.boosterIntro[k] || this.level.id > lvl).map(([k]) => k);
    this.ui.setBoosters(unlocked, s.boosters, this.pendingBooster, glow || (this.tutorial?.startsWith('booster') ? this.pendingBooster : null));
    this.renderer.pendingBooster = this.pendingBooster;
  }

  _refreshHearts() {
    const s = this.save;
    const ms = P.regenLives(s);
    const show = (this.level?.id || 1) >= LIVES.showFromLevel || s.lives < LIVES.max;
    this.ui.setHearts(s.lives, ms, show, s.settings.unlimitedLives);
  }

  _wireUI() {
    this.ui.on('map', () => this.openMap());
    this.ui.on('restart', () => this.restartLevel());
    this.ui.on('sound', () => {
      this.save.settings.sound = !this.save.settings.sound;
      audio.unlock();
      audio.setEnabled(this.save.settings.sound);
      this.ui.setSound(this.save.settings.sound);
      this.persist();
    });
    this.ui.on('booster', (k) => this.onBooster(k));
    this.ui.on('spin', (v) => {
      this.spin = v;
      if (this.tutorial === 'spin' && v !== 0) { this.ui.showSpin(true, false); this.ui.hint('NOW DRAG TO AIM', 'Aim right of the block - spin brings it back'); }
    });
  }

  // ============================================================ QA hooks
  /**
   * Plays the stored solution for the current level (debug / automated QA).
   * Restarts the level so shots are fired on exactly the same physics steps as
   * the headless solver (runShots) - the browser then reproduces the result.
   */
  async autoSolve() {
    const sol = SOLUTIONS[this.level.id];
    if (!sol) return false;
    await this.startLevel(this.level.id, { skipLives: true });
    this.ui.closeModal();
    this.tutorial = 'auto';
    this.autoQueue = sol.shots.map((s) => ({ ...s }));
    return true;
  }

  _autoShot() {
    const shot = this.autoQueue.shift();
    if (shot.booster) this.save.boosters[shot.booster] = Math.max(1, this.save.boosters[shot.booster] || 0);
    this.pendingBooster = shot.booster || null;
    this.ui.setSpin(shot.spin || 0);
    this.shoot({ angle: shot.angle, power: shot.power, spin: shot.spin || 0 });
  }

  winInstantly() {
    for (const e of this.sim.targets) if (!e.down) this.sim._markDown(e, 'debug');
  }
}
