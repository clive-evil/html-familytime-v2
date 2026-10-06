/* App flow: menu → lobby → battle → results → again. Owns the RAF loop + save. */
(function (root) {
  'use strict';
  const CW = root.CW;
  const UI = CW.UI;
  const $ = UI.$;

  const params = new URLSearchParams(location.search);
  const App = {
    screen: 'menu', fast: false, lobby: null, battle: null, modeId: 'rng', raidIndex: 0, lastResult: null,
    debugState: { forceRarity: null, forceRarityBots: false, forceSteal: null, forceVote: null, forceItem: null, itemInterval: null, comebackStrength: null, lightningDuration: null, ghostDuration: null },
    params,
  };
  CW.App = App;

  App.init = function () {
    this.save = CW.Save;
    this.save.load();
    CW.ArtPack.init();
    this.fast = params.get('fast') === '1' || !!this.save.data.settings.fast;
    CW.Sfx.setEnabled(this.save.data.settings.sound && params.get('sound') !== '0');
    document.documentElement.style.setProperty('--grain', `url(${CW.Art.grain()})`);
    UI.fit();
    window.addEventListener('resize', () => UI.fit());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', () => CW.Sfx.unlock(), { once: false, passive: true });
    CW.Debug.init(this);
    this.showMenu();
    if (params.get('debug') === '1') CW.Debug.toggle(true);
    const m = params.get('mode');
    if (m && CW.MODES[m]) this.startLobby(m);
    this._last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  };

  App.setScreen = function (s) {
    this.screen = s;
    $('#stage').dataset.screen = s;
    if (UI.modalOpen) UI.closeModal();
  };

  App.showMenu = function () {
    this.lobby = null; this.battle = null;
    CW.LobbyUI.unmount(); CW.BattleUI.unmount();
    this.setScreen('menu');
    CW.Screens.menu(this);
  };

  App.startLobby = function (modeId) {
    this.modeId = modeId;
    CW.BattleUI.unmount();
    const seedParam = params.get('seed');
    const seed = seedParam ? (+seedParam + this.raidIndex * 7919) >>> 0 : CW.randomSeed();
    this.raidIndex++;
    this.lobby = new CW.Lobby({ mode: modeId, seed, fast: this.fast, wallet: this.save.data.wallet, debug: this.debugState, biome: params.get('biome') || null });
    this.battle = null;
    this.setScreen('lobby');
    CW.LobbyUI.mount(this.lobby, { tutorial: !this.save.data.tutorial[modeId], onLaunch: () => this.startBattle() });
    CW.Sfx.play('pop');
  };

  App.startBattle = function () {
    const L = this.lobby;
    if (!L || this.screen !== 'lobby') return;
    this.save.data.tutorial[this.modeId] = true;
    this.save.save(); // coins spent in the lobby are committed
    const mods = CW.raidMods(L.potX100);
    this.battle = new CW.Battle({ party: L.partySpec(), seed: (L.seed + 99) >>> 0, mods, biome: L.biome, autoHuman: params.get('auto') === '1', boons: L.boons, firstVoteOptions: L.voteOptions, debug: this.debugState });
    CW.Sfx.play('transition');
    UI.flash('#000');
    CW.LobbyUI.unmount();
    this.setScreen('battle');
    CW.BattleUI.mount(this.battle, { humanLoadout: L.human.loadout, auto: params.get('auto') === '1', onEnd: (r) => this.finishBattle(r) });
  };

  // Race finish: placement → reward % × raid pot (+ winner bonus), podium, awards.
  App.finishBattle = function (result) {
    const B = this.battle, L = this.lobby;
    if (!B || this.screen !== 'battle') return;
    const placed = CW.raceRewards({ won: result.won, standings: result.standings, potX100: L.potX100, modeId: this.modeId, seed: L.seed + 7 });
    const rows = placed.map((s) => {
      const u = B.get(s.uid), p = L.get(s.pid);
      return { ...s, classId: u.classId, accent: u.accent, look: u.look, heroRarity: p.loadout.hero.rarity, rar: { hero: p.loadout.hero.rarity, weapon: p.loadout.weapon.rarity, gear: p.loadout.gear.rarity }, weaponKind: p.loadout.weapon.kind, weaponRarity: p.loadout.weapon.rarity, tally: u.tally };
    });
    const me = rows.find((r) => r.isHuman);
    const awards = CW.raceAwards(B.units);
    this.save.recordRaid({ modeId: this.modeId, won: result.won, potX100: L.potX100, rewards: me.reward, lobbyHuman: L.human, place: me.rank, battleHuman: B.human });
    this.lastResult = { won: result.won, potX100: L.potX100, rewards: me.reward, place: me.rank, rows, awards, boons: B.boons.slice(), modeId: this.modeId, modeName: L.mode.name, biome: L.biome.name, why: result.why };
    CW.BattleUI.unmount();
    this.setScreen('results');
    CW.Screens.results(this, this.lastResult);
  };

  App.setFast = function (on) {
    this.fast = on;
    this.save.data.settings.fast = on; this.save.save();
    if (this.lobby) this.lobby.setFast(on);
    UI.toast('FAST MODE ' + (on ? 'ON' : 'OFF'), true);
  };
  App.resetSave = function () {
    this.save.reset();
    if (this.lobby) this.lobby.human.wallet = this.save.data.wallet;
    if (this.screen === 'menu') CW.Screens.menu(this);
  };

  App.onKey = function (e) {
    if (e.key === '`' || e.key === '~') { CW.Debug.toggle(); return; }
    if (e.target && e.target.tagName === 'INPUT') return;
    if (this.screen === 'lobby') CW.LobbyUI.key(e);
    else if (this.screen === 'battle') { if (e.key === 'Escape') return; CW.BattleUI.key(e); }
    else if (this.screen === 'results' && (e.key === 'Enter' || e.key === ' ')) this.startLobby(this.modeId);
    else if (UI.modalOpen && e.key === 'Escape') UI.closeModal();
  };

  App.loop = function (t) {
    const dt = Math.min(0.05, Math.max(0, (t - this._last) / 1000));
    this._last = t;
    try {
      if (this.screen === 'lobby' && this.lobby) { this.lobby.update(dt); CW.LobbyUI.frame(dt); }
      else if (this.screen === 'battle' && this.battle) {
        const speed = this.fast ? CW.TIMINGS.battleFastSpeed : 1;
        let left = dt * speed;
        while (left > 0) { const s = Math.min(left, 1 / 30); this.battle.update(s); left -= s; }
        CW.BattleUI.frame(dt);
      }
      CW.Debug.frame();
    } catch (err) {
      console.error(err);
      this.lastError = String(err && err.stack || err);
    }
    requestAnimationFrame((tt) => this.loop(tt));
  };

  window.addEventListener('DOMContentLoaded', () => App.init());
})(window);
