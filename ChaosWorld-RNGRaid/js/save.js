/* Local meta save (localStorage). Storage is injectable for Node tests. */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});
  const KEY = 'cw_rngraid_save_v1';

  function fresh() {
    const E = CW.ECONOMY;
    return {
      v: 1,
      wallet: { coins: E.startCoins, chaos: E.startChaos, jack: E.startJack, grief: E.startGrief },
      stats: {
        raidsPlayed: 0, wins: 0, losses: 0, legendaryPulls: 0, steals: 0, stealFails: 0,
        timesGriefed: 0, playersGriefed: 0, highestPotCleared: 0, boosts: 0, rerolls: 0, shuffles: 0,
        racesWon: 0, podiums: 0, bestPlace: 0, protects: 0, wardsBroken: 0, itemsUsed: 0, rivalsHit: 0,
        byMode: { rng: { played: 0, wins: 0 }, grief: { played: 0, wins: 0 } },
      },
      settings: { sound: true, fast: false },
      tutorial: { rng: false, grief: false },
    };
  }

  function merge(base, over) {
    for (const k of Object.keys(over || {})) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') merge(base[k], over[k]);
      else if (k in base) base[k] = over[k];
    }
    return base;
  }

  const Save = {
    KEY,
    storage: null,
    _store() {
      if (this.storage) return this.storage;
      try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { /* blocked */ }
      return (this._mem = this._mem || { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } });
    },
    load() {
      let d = fresh();
      try { const raw = this._store().getItem(KEY); if (raw) d = merge(d, JSON.parse(raw)); } catch (e) { /* corrupt → fresh */ }
      this.data = d;
      return d;
    },
    save() { try { this._store().setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
    reset() { try { this._store().removeItem(KEY); } catch (e) { /* ignore */ } this.data = fresh(); this.save(); return this.data; },
    fresh,

    // Fold a finished raid into the meta save.
    recordRaid({ modeId, won, potX100, rewards, lobbyHuman, place, battleHuman }) {
      const s = this.data.stats, w = this.data.wallet;
      s.raidsPlayed++; s.byMode[modeId].played++;
      if (won) { s.wins++; s.byMode[modeId].wins++; s.highestPotCleared = Math.max(s.highestPotCleared, potX100); } else s.losses++;
      if (lobbyHuman) {
        const st = lobbyHuman.stats;
        s.legendaryPulls += st.legendaries; s.steals += st.steals; s.stealFails += st.stealFails;
        s.timesGriefed += st.griefed; s.playersGriefed += st.griefsDone; s.boosts += st.boosts;
        s.rerolls += st.rerolls; s.shuffles += st.shuffles;
        s.protects += st.protects || 0; s.wardsBroken += st.wardsBroken || 0;
      }
      if (place) {
        if (won && place === 1) s.racesWon++;
        if (won && place <= 3) s.podiums++;
        s.bestPlace = s.bestPlace ? Math.min(s.bestPlace, place) : place;
      }
      if (battleHuman) { s.itemsUsed += battleHuman.tally.itemsUsed; s.rivalsHit += battleHuman.tally.rivalsHit; }
      w.coins += rewards.coins;
      for (const k of Object.keys(rewards.tokens)) w[k] += rewards.tokens[k];
      this.save();
    },
  };
  CW.Save = Save;
})(typeof window !== 'undefined' ? window : globalThis);
