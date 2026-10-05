// Persistent save with versioning + migration. Never throws: corrupt or
// unknown data falls back to a fresh save (old blob kept under a backup key).
import { LIVES } from './config.js';

export const SAVE_VERSION = 3;
const KEY = 'bowlingsmash.save';

export function defaultSave(now = Date.now()) {
  return {
    version: SAVE_VERSION,
    currentLevel: 1, // next level to play (highest unlocked)
    completed: {}, // id -> { best: 'strike'|'spare'|'clear', bestBalls, plays, wins }
    coins: 0,
    lives: LIVES.max,
    livesUpdatedAt: now,
    boosters: { heavy: 0, triple: 0, bomb: 0 },
    boosterIntro: { heavy: false, triple: false, bomb: false },
    chests: {}, // level -> true when claimed
    rewardedLevels: {}, // level -> true once first-clear coins given (no duplicate rewards)
    daily: { index: 0, lastClaim: null },
    settings: { sound: true, unlimitedLives: false, unlimitedBalls: false },
    stats: { strikes: 0, spares: 0, clears: 0, retries: 0, ballsUsed: 0, fails: 0, boostersUsed: 0, playMs: 0, continues: 0 },
    seen: {}, // tutorial flags
    createdAt: now,
    sessions: 0,
  };
}

/** Migrate any older shape forward. Exported for tests. */
export function migrate(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return defaultSave(now);
  let s = { ...raw };
  const v = Number(s.version) || 1;
  if (v > SAVE_VERSION) return defaultSave(now); // from the future: don't guess
  if (v < 2) {
    // v1 (early prototype): { level, coins, best: {id: 'strike'} }
    s = {
      ...defaultSave(now),
      currentLevel: clampInt(s.level, 1, 20, 1),
      coins: clampInt(s.coins, 0, 1e7, 0),
      completed: Object.fromEntries(Object.entries(s.best || {}).map(([k, b]) => [k, { best: b, bestBalls: 3, plays: 1, wins: 1 }])),
    };
  }
  if (v < 3) {
    // v2 had no rewardedLevels/chests split; derive from completed levels
    s.rewardedLevels = s.rewardedLevels || Object.fromEntries(Object.keys(s.completed || {}).map((k) => [k, true]));
    s.chests = s.chests || {};
  }
  // fill any missing fields + sanitise
  const d = defaultSave(now);
  const out = { ...d, ...s, version: SAVE_VERSION };
  out.boosters = { ...d.boosters, ...(s.boosters || {}) };
  out.boosterIntro = { ...d.boosterIntro, ...(s.boosterIntro || {}) };
  out.settings = { ...d.settings, ...(s.settings || {}) };
  out.stats = { ...d.stats, ...(s.stats || {}) };
  out.daily = { ...d.daily, ...(s.daily || {}) };
  out.coins = clampInt(out.coins, 0, 1e9, 0);
  out.lives = clampInt(out.lives, 0, LIVES.max, LIVES.max);
  out.currentLevel = clampInt(out.currentLevel, 1, 20, 1);
  if (!Number.isFinite(out.livesUpdatedAt) || out.livesUpdatedAt > now) out.livesUpdatedAt = now;
  for (const k of Object.keys(out.boosters)) out.boosters[k] = clampInt(out.boosters[k], 0, 999, 0);
  return out;
}

function clampInt(v, lo, hi, dflt) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

/** Storage backend; playtest mode uses an in-memory store (fresh every load). */
export class SaveStore {
  constructor({ memory = false, storage } = {}) {
    this.memory = memory;
    this.mem = new Map();
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  }

  _get(k) {
    if (this.memory) return this.mem.get(k) ?? null;
    try { return this.storage ? this.storage.getItem(k) : null; } catch { return null; }
  }
  _set(k, v) {
    if (this.memory) { this.mem.set(k, v); return; }
    try { this.storage && this.storage.setItem(k, v); } catch { /* quota / private mode */ }
  }
  _del(k) {
    if (this.memory) { this.mem.delete(k); return; }
    try { this.storage && this.storage.removeItem(k); } catch { /* */ }
  }

  load(now = Date.now()) {
    const raw = this._get(KEY);
    if (!raw) return { save: defaultSave(now), fresh: true };
    try {
      const parsed = JSON.parse(raw);
      const save = migrate(parsed, now);
      return { save, fresh: false };
    } catch {
      this._set(`${KEY}.corrupt-backup`, raw);
      return { save: defaultSave(now), fresh: true };
    }
  }

  write(save) { this._set(KEY, JSON.stringify(save)); }
  reset() { this._del(KEY); }
  rawKey() { return KEY; }
}
