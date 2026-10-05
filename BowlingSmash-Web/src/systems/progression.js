// Pure progression logic (lives, rewards, daily, chests, boosters) operating
// on a save object. No DOM - unit-testable in Node.
import { ECONOMY, LIVES, CHESTS, DAILY, DAILY_MIN_LEVELS } from './config.js';

// ---------------------------------------------------------------- lives
/** Apply regeneration up to `now`. Returns ms until next heart (0 if full). */
export function regenLives(save, now = Date.now()) {
  if (save.lives >= LIVES.max) { save.livesUpdatedAt = now; return 0; }
  const elapsed = Math.max(0, now - save.livesUpdatedAt);
  const gained = Math.floor(elapsed / LIVES.regenMs);
  if (gained > 0) {
    save.lives = Math.min(LIVES.max, save.lives + gained);
    save.livesUpdatedAt = save.lives >= LIVES.max ? now : save.livesUpdatedAt + gained * LIVES.regenMs;
  }
  if (save.lives >= LIVES.max) return 0;
  return LIVES.regenMs - ((now - save.livesUpdatedAt) % LIVES.regenMs);
}

export function canPlay(save, now = Date.now()) {
  if (save.settings.unlimitedLives) return true;
  regenLives(save, now);
  return save.lives > 0;
}

/** Lose a heart for a failed attempt (respecting FTUE protection). Returns true if one was lost. */
export function loseLife(save, levelId, now = Date.now()) {
  if (save.settings.unlimitedLives) return false;
  if (levelId <= LIVES.protectedLevels) return false;
  regenLives(save, now);
  if (save.lives <= 0) return false;
  if (save.lives === LIVES.max) save.livesUpdatedAt = now; // regen clock starts now
  save.lives -= 1;
  return true;
}

// -------------------------------------------------------------- results
export function grade(shotsTaken) {
  return shotsTaken <= 1 ? 'strike' : shotsTaken === 2 ? 'spare' : 'clear';
}
const RANK = { clear: 1, spare: 2, strike: 3 };

/**
 * Apply a level win. Returns a reward breakdown. First-clear coins are paid
 * once per level (replays pay strike/spare bonus only), so rewards can't be duplicated.
 */
export function applyWin(save, level, { shotsTaken, ballsLeft, bonusPins = 0 }) {
  const g = grade(shotsTaken);
  const firstClear = !save.rewardedLevels[level.id];
  const lines = [];
  if (firstClear) lines.push({ label: level.diff === 'superhard' ? 'SUPER HARD CLEAR' : level.diff === 'hard' ? 'HARD CLEAR' : 'LEVEL CLEAR', coins: ECONOMY.clearReward[level.diff] || 20 });
  if (g === 'strike') lines.push({ label: 'STRIKE BONUS', coins: ECONOMY.strikeBonus });
  if (g === 'spare') lines.push({ label: 'SPARE BONUS', coins: ECONOMY.spareBonus });
  if (ballsLeft > 0 && firstClear) lines.push({ label: `BALLS LEFT ×${ballsLeft}`, coins: ballsLeft * ECONOMY.unusedBallBonus });
  if (bonusPins > 0) lines.push({ label: `GOLD PIN ×${bonusPins}`, coins: bonusPins * ECONOMY.goldPinBonus });
  const total = lines.reduce((a, l) => a + l.coins, 0);
  save.coins += total;
  save.rewardedLevels[level.id] = true;
  const prev = save.completed[level.id] || { best: null, bestBalls: 99, plays: 0, wins: 0 };
  const best = !prev.best || RANK[g] > RANK[prev.best] ? g : prev.best;
  save.completed[level.id] = { ...prev, best, bestBalls: Math.min(prev.bestBalls, shotsTaken), wins: prev.wins + 1, plays: prev.plays + 1 };
  if (save.currentLevel <= level.id) save.currentLevel = Math.min(20, level.id + 1);
  save.stats[g === 'strike' ? 'strikes' : g === 'spare' ? 'spares' : 'clears']++;
  const chest = CHESTS[level.id] && !save.chests[level.id] ? level.id : null;
  return { grade: g, lines, total, firstClear, chest, newBest: best !== prev.best };
}

export function openChest(save, levelId) {
  const c = CHESTS[levelId];
  if (!c || save.chests[levelId]) return null;
  save.chests[levelId] = true;
  save.coins += c.coins || 0;
  for (const [k, n] of Object.entries(c.boosters || {})) save.boosters[k] = (save.boosters[k] || 0) + n;
  return c;
}

// ---------------------------------------------------------------- daily
export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Is a daily reward claimable now? Never during the very first session / early FTUE. */
export function dailyAvailable(save, now = Date.now()) {
  if (Object.keys(save.completed).length < DAILY_MIN_LEVELS) return false;
  return save.daily.lastClaim !== dayKey(now);
}

export function claimDaily(save, now = Date.now()) {
  if (!dailyAvailable(save, now)) return null;
  // missing a day resets the streak to day 1 (lightweight, forgiving: no punishment beyond that)
  const yesterday = dayKey(now - 86400000);
  if (save.daily.lastClaim && save.daily.lastClaim !== yesterday) save.daily.index = 0;
  const idx = save.daily.index % DAILY.length;
  const r = DAILY[idx];
  save.coins += r.coins || 0;
  for (const [k, n] of Object.entries(r.boosters || {})) save.boosters[k] = (save.boosters[k] || 0) + n;
  save.daily.lastClaim = dayKey(now);
  save.daily.index = (idx + 1) % DAILY.length;
  return { day: idx + 1, reward: r };
}

// ------------------------------------------------------------- boosters
export function buyBooster(save, kind, cost) {
  if (save.coins < cost) return false;
  save.coins -= cost;
  save.boosters[kind] = (save.boosters[kind] || 0) + 1;
  return true;
}

export function consumeBooster(save, kind) {
  if ((save.boosters[kind] || 0) <= 0) return false;
  save.boosters[kind]--;
  save.stats.boostersUsed++;
  return true;
}

export function spendCoins(save, n) {
  if (save.coins < n) return false;
  save.coins -= n;
  return true;
}
