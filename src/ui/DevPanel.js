import { AutoPlayer } from '../core/bot/AutoPlayer.js';

// Performance readout (F3, or always on with ?debug=1).
export class PerfPanel {
  constructor(root, on) {
    this.el = document.createElement('div');
    this.el.id = 'perf';
    this.el.className = 'card' + (on ? '' : ' hidden');
    root.appendChild(this.el);
  }
  toggle() { this.el.classList.toggle('hidden'); }
  update(game) {
    if (this.el.classList.contains('hidden')) return;
    const s = game.sim.state;
    const st = game.sim.status();
    const info = game.r.renderer.info.render;
    const heap = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : 'n/a';
    const p = game.perf;
    this.el.innerHTML = [
      `FPS ${p.fps.toFixed(0)}  frame ${p.frameMs.toFixed(1)}ms`,
      `sim ${p.simMs.toFixed(2)}ms  crowd ${(p.crowdMs || 0).toFixed(2)}ms  render ${p.renderMs.toFixed(1)}ms`,
      `draw calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k`,
      `Grandmas ${s.grandmas.length} (lod ${game.crowd.stats.lod})`,
      `workers ${st.workers}  idle ${st.idleAdults}`,
      `eggs waiting ${st.eggsWaiting}  warming ${st.incubating}`,
      `buildings ${s.buildings.length}  particles ${game.effects.n}`,
      `heap ${heap}`,
    ].join('<br>');
  }
}

// Developer controls, only created with ?debug=1.
export class DevPanel {
  constructor(root, game) {
    this.game = game;
    const el = document.createElement('div');
    el.id = 'dev';
    el.className = 'card';
    const btn = (label, fn) => `<button data-f="${fn}">${label}</button>`;
    el.innerHTML = `<div class="t">DEV</div>
      ${btn('+50 food', 'food')}${btn('+50 wood', 'wood')}${btn('+50 stone', 'stone')}
      ${btn('+1 egg', 'egg1')}${btn('+5 eggs', 'egg5')}${btn('hatch all', 'hatch')}
      ${btn('+1 Grandma', 'spawn1')}${btn('+10', 'spawn10')}${btn('+50', 'spawn50')}
      ${btn('next day', 'day')}${btn('unlock all', 'unlock')}${btn('skip tutorial', 'skip')}
      ${btn('pop 50', 'p50')}${btn('pop 100', 'p100')}${btn('pop 200', 'p200')}${btn('pop 300', 'p300')}
      ${btn('autopilot', 'auto')}${btn('x4 speed', 'speed')}`;
    el.addEventListener('click', (e) => {
      const f = e.target.dataset && e.target.dataset.f;
      if (f) { this.run(f); e.stopPropagation(); }
    });
    root.appendChild(el);
  }

  run(f) {
    const g = this.game;
    const sim = g.sim;
    switch (f) {
      case 'food': case 'wood': case 'stone': sim.debug(f, 50); break;
      case 'egg1': sim.debug('egg', 1); break;
      case 'egg5': sim.debug('egg', 5); break;
      case 'hatch': sim.debug('hatch'); break;
      case 'spawn1': sim.debug('spawn', 1); break;
      case 'spawn10': sim.debug('spawn', 10); break;
      case 'spawn50': sim.debug('spawn', 50); break;
      case 'day': sim.debug('day'); break;
      case 'unlock': sim.debug('unlock'); break;
      case 'skip': sim.debug('skipTutorial'); break;
      case 'p50': case 'p100': case 'p200': case 'p300': sim.setupStress(Number(f.slice(1))); break;
      case 'auto': g.bot = g.bot ? null : new AutoPlayer(sim); g.hud.toast(g.bot ? 'Autopilot on' : 'Autopilot off'); break;
      case 'speed': g.params.speed = g.params.speed === 4 ? 1 : 4; g.hud.toast(`Speed x${g.params.speed}`); break;
    }
  }
}
