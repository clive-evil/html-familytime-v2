import { Simulation } from '../core/Simulation.js';

// localStorage persistence. The sim state is already plain JSON, so a save is
// one JSON.stringify. Browser-only: a Roblox port would swap in DataStore.
const KEY = 'tmg.save.v1';

export class SaveStore {
  constructor(disabled = false) {
    this.disabled = disabled;
  }

  _ls() {
    try { return this.disabled ? null : window.localStorage; } catch (_) { return null; }
  }

  has() {
    const ls = this._ls();
    try { return !!(ls && ls.getItem(KEY)); } catch (_) { return false; }
  }

  save(sim) {
    const ls = this._ls();
    if (!ls) return false;
    try { ls.setItem(KEY, sim.toJSON()); return true; } catch (_) { return false; }
  }

  load() {
    const ls = this._ls();
    if (!ls) return null;
    try {
      const raw = ls.getItem(KEY);
      return raw ? Simulation.fromJSON(raw) : null;
    } catch (err) {
      console.warn('Save could not be loaded, starting fresh.', err);
      return null;
    }
  }

  clear() {
    const ls = this._ls();
    try { if (ls) ls.removeItem(KEY); } catch (_) { /* ignore */ }
  }
}
