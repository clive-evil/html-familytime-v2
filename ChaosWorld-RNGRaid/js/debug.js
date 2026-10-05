/* QA / debug panel. Toggle with ` or the tiny DBG button. Everything is also scriptable via window.CW.App + CW.Debug. */
(function (root) {
  'use strict';
  const CW = root.CW;
  const UI = CW.UI;
  const $ = UI.$;
  const Debug = {};

  Debug.init = function (app) {
    this.app = app;
    this.panel = $('#debug-panel');
    $('#dbg-btn').onclick = () => this.toggle();
    this.render();
  };
  Debug.toggle = function (force) {
    const open = force ?? this.panel.hidden;
    this.panel.hidden = !open;
    if (open) this.render();
  };

  Debug.render = function () {
    const app = this.app, ds = app.debugState;
    const on = (c) => (c ? 'on' : '');
    const rs = ['auto', ...CW.RARITY_ORDER];
    this.panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-family:var(--font-d);font-size:18px;color:var(--lime)">QA / DEBUG</b><button data-d="close">✕</button></div>
      <h4>FORCE RARITY (YOUR ROLLS)</h4>
      <div class="r">${rs.map((r) => `<button data-d="rar" data-v="${r}" class="${on((ds.forceRarity || 'auto') === r)}">${r === 'mythic' ? 'MYTHIC' : r.toUpperCase()}</button>`).join('')}</div>
      <div class="r" style="margin-top:4px"><button data-d="rarbots" class="${on(ds.forceRarityBots)}">ALSO FORCE BOTS</button></div>
      <h4>FORCE STEAL</h4>
      <div class="r">${['auto', 'success', 'fail'].map((v) => `<button data-d="steal" data-v="${v}" class="${on((ds.forceSteal || 'auto') === v)}">${v.toUpperCase()}</button>`).join('')}</div>
      <h4>WALLET</h4>
      <div class="r"><input id="dbg-coins" type="number" value="${app.save.data.wallet.coins}"><button data-d="coins">SET COINS</button></div>
      <div class="r" style="margin-top:4px"><button data-d="give" data-v="chaos">+1 CHAOS</button><button data-d="give" data-v="jack">+1 JACK</button><button data-d="give" data-v="grief">+1 GRIEF</button></div>
      <h4>RAID POT</h4>
      <div class="r">${[100, 125, 150, 175, 200].map((v) => `<button data-d="pot" data-v="${v}">${CW.potLabel(v)}</button>`).join('')}</div>
      <h4>FLOW</h4>
      <div class="r"><button data-d="skipphase">SKIP PHASE</button><button data-d="skiplobby">SKIP LOBBY</button></div>
      <div class="r" style="margin-top:4px"><button data-d="win">WIN BATTLE</button><button data-d="lose">LOSE BATTLE</button></div>
      <div class="r" style="margin-top:4px"><button data-d="fast" class="${on(app.fast)}">FAST MODE</button><button data-d="menu">MENU</button></div>
      <h4>SAVE</h4>
      <div class="r"><button data-d="reset">RESET SAVE</button></div>
      <h4>STATE</h4>
      <div class="info" id="dbg-info"></div>`;
    this.panel.onclick = (e) => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      const v = b.dataset.v;
      switch (b.dataset.d) {
        case 'close': return this.toggle(false);
        case 'rar': ds.forceRarity = v === 'auto' ? null : v; break;
        case 'rarbots': ds.forceRarityBots = !ds.forceRarityBots; break;
        case 'steal': ds.forceSteal = v === 'auto' ? null : v; break;
        case 'coins': this.setCoins(+$('#dbg-coins').value || 0); break;
        case 'give': this.give(v, 1); break;
        case 'pot': if (app.lobby) app.lobby.setPot(+v); else UI.toast('ONLY IN LOBBY'); break;
        case 'skipphase': if (app.lobby && app.screen === 'lobby') app.lobby.skipPhase(); break;
        case 'skiplobby': this.skipLobby(); break;
        case 'win': if (app.battle) app.battle.forceWin(); else UI.toast('ONLY IN BATTLE'); break;
        case 'lose': if (app.battle) app.battle.forceLose(); else UI.toast('ONLY IN BATTLE'); break;
        case 'fast': app.setFast(!app.fast); break;
        case 'menu': app.showMenu(); break;
        case 'reset': app.resetSave(); UI.toast('SAVE RESET', true); break;
      }
      this.render();
    };
  };

  Debug.setCoins = function (n) { this.app.save.data.wallet.coins = n; this.app.save.save(); };
  Debug.give = function (k, n) { this.app.save.data.wallet[k] += n; this.app.save.save(); };
  Debug.skipLobby = function () {
    const app = this.app;
    if (app.screen !== 'lobby' || !app.lobby) return UI.toast('ONLY IN LOBBY');
    app.lobby.skipToBattle();
  };

  Debug.frame = function () {
    if (this.panel.hidden) return;
    const info = $('#dbg-info');
    if (!info) return;
    const a = this.app, L = a.lobby, B = a.battle;
    const lines = [`screen: ${a.screen}  fast: ${a.fast}`, `seed: ${L ? L.seed : '-'}`];
    if (L) {
      lines.push(`phase: ${L.phase} t=${L.time.toFixed(1)} left=${L.phaseRemaining().toFixed(1)}`);
      lines.push(`pot: ${CW.potLabel(L.potX100)}  bot actions: ${L.stats.botActions}`);
      lines.push(`steals ${L.stats.steals}/${L.stats.stealFails} griefs ${L.stats.griefs} boosts ${L.stats.boosts}`);
    }
    if (B) lines.push(`battle: ${B.state} wave ${B.wave + 1} t=${B.time.toFixed(1)}`, `party alive: ${B.heroes().length}  enemies: ${B.enemies().length}`);
    const s = lines.join('\n');
    if (info.textContent !== s) info.textContent = s;
  };

  CW.Debug = Debug;
})(window);
