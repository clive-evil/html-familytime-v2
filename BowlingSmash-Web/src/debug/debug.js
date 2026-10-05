// ?debug=1 developer / QA panel.
import { LEVELS } from '../levels/levels.js';
import { SOLUTIONS } from '../levels/solutions.js';

export class DebugPanel {
  constructor(game) {
    this.g = game;
    const el = (this.el = document.createElement('div'));
    el.id = 'debug';
    el.innerHTML = `
      <div class="stats" id="dbgStats"></div>
      <button id="dbgMin">_</button>
      <div class="body">
        <select id="dbgLvl">${LEVELS.map((l) => `<option value="${l.id}">${l.id}. ${l.name}${l.diff === 'hard' ? ' [H]' : l.diff === 'superhard' ? ' [SH]' : ''}</option>`).join('')}</select>
        <button id="dbgGo">GO</button><br>
        <button id="dbgRestart">restart</button>
        <button id="dbgWin">win now</button>
        <button id="dbgSolve">auto-solve</button><br>
        <button id="dbgLives">∞ lives</button>
        <button id="dbgBalls">∞ balls</button>
        <button id="dbgSlow">slow-mo</button><br>
        <button id="dbgCoins">+500 coins</button>
        <button id="dbgBoost">+3 boosters</button>
        <button id="dbgWire">wireframe</button><br>
        <button id="dbgDaily">daily reset</button>
        <button id="dbgHeart">-1 heart</button>
        <button id="dbgReset">RESET SAVE</button>
      </div>`;
    document.body.appendChild(el);
    const $ = (id) => el.querySelector(id);
    $('#dbgMin').onclick = () => el.classList.toggle('min');
    $('#dbgLvl').value = game.level.id;
    $('#dbgGo').onclick = () => { const id = +$('#dbgLvl').value; game.save.currentLevel = Math.max(game.save.currentLevel, id); game.startLevel(id, { skipLives: true }); };
    $('#dbgRestart').onclick = () => game.startLevel(game.level.id, { skipLives: true });
    $('#dbgWin').onclick = () => game.winInstantly();
    $('#dbgSolve').onclick = () => game.autoSolve();
    const toggle = (btn, key) => {
      const b = $(btn);
      const sync = () => b.classList.toggle('on', !!game.save.settings[key]);
      b.onclick = () => { game.save.settings[key] = !game.save.settings[key]; game.persist(); sync(); if (key === 'unlimitedBalls') game.sim.unlimitedBalls = game.save.settings[key]; game._refreshHud(); };
      sync();
    };
    toggle('#dbgLives', 'unlimitedLives');
    toggle('#dbgBalls', 'unlimitedBalls');
    $('#dbgSlow').onclick = () => { game.debugSlowmo = !game.debugSlowmo; $('#dbgSlow').classList.toggle('on', game.debugSlowmo); };
    $('#dbgCoins').onclick = () => { game.save.coins += 500; game.persist(); game._refreshHud(); };
    $('#dbgBoost').onclick = () => { for (const k of ['heavy', 'triple', 'bomb']) { game.save.boosters[k] += 3; game.save.boosterIntro[k] = true; } game.persist(); game._refreshHud(); };
    $('#dbgWire').onclick = () => { this.wire = !this.wire; game.renderer.levelGroup.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) o.material.wireframe = this.wire; }); $('#dbgWire').classList.toggle('on', this.wire); };
    $('#dbgDaily').onclick = () => { game.save.daily.lastClaim = null; game.persist(); game.showDaily(); };
    $('#dbgHeart').onclick = () => { game.save.lives = Math.max(0, game.save.lives - 1); if (game.save.lives === 4) game.save.livesUpdatedAt = Date.now(); game.persist(); };
    $('#dbgReset').onclick = () => { game.store.reset(); localStorage.removeItem('bowlingsmash.analytics'); location.reload(); };
  }

  update() {
    const g = this.g;
    if (!g.sim) return;
    const now = performance.now();
    if (now - (this.t || 0) < 250) return;
    this.t = now;
    const s = g.sim;
    this.el.querySelector('#dbgStats').textContent =
      `FPS ${g.fps.toFixed(0)}  bodies ${s.bodyCount()}\n` +
      `draws ${g.renderer.r.info.render.calls}  tris ${(g.renderer.r.info.render.triangles / 1000).toFixed(0)}k\n` +
      `L${g.level.id} ${s.state}  step ${s.stepCount}\n` +
      `targets ${s.targetsRemaining}/${s.targetsTotal}  balls ${s.ballsLeft}\n` +
      `debris ${s.debris.length}  sol ${SOLUTIONS[g.level.id] ? 'yes' : 'no'}\n` +
      `coins ${g.save.coins} lives ${g.save.lives}`;
  }
}
