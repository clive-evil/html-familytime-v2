// Tunable economy & retention constants (ORIGINAL values - see DESIGN.md).
export const ECONOMY = {
  clearReward: { easy: 20, normal: 20, hard: 50, superhard: 100 },
  strikeBonus: 30, // "STRIKE BONUS"
  spareBonus: 10,
  unusedBallBonus: 5, // per ball left - fixes a top complaint in reference reviews
  goldPinBonus: 15,
  continueCost: 150, // +5 balls for coins (alternative to simulated rewarded ad)
  continueBalls: 5,
  boosterCost: { heavy: 90, triple: 120, bomb: 150 },
  heartRefillCost: 200,
};

export const LIVES = {
  max: 5,
  regenMs: 20 * 60 * 1000, // one heart every 20 minutes
  protectedLevels: 5, // first-session protection: failing L1-5 never costs a heart
  showFromLevel: 4, // hearts HUD appears here (FTUE: don't explain before relevant)
};

export const BOOSTER_UNLOCK = { heavy: 8, triple: 13, bomb: 17 }; // level where a free forced try happens
export const BOOSTER_INFO = {
  heavy: { name: 'HEAVY BALL', desc: 'Bigger. Heavier. Flattens everything in its path.', color: '#4b4b6a' },
  triple: { name: 'TRIPLE BALL', desc: 'One throw, three balls, three times the chaos.', color: '#0fb6a7' },
  bomb: { name: 'BOMB BALL', desc: 'Explodes on its first big hit.', color: '#ff3b1f' },
};

export const CHESTS = {
  5: { coins: 100, boosters: { heavy: 1 } },
  10: { coins: 150, boosters: { heavy: 1, triple: 1 } },
  15: { coins: 200, boosters: { triple: 1, bomb: 1 } },
  20: { coins: 400, boosters: { heavy: 1, triple: 1, bomb: 1 } },
};

export const DAILY = [
  { coins: 50 },
  { boosters: { heavy: 1 } },
  { coins: 100 },
  { boosters: { triple: 1 } },
  { coins: 150 },
  { boosters: { bomb: 1 } },
  { coins: 300, boosters: { heavy: 1, triple: 1, bomb: 1 }, big: true },
];
export const DAILY_MIN_LEVELS = 3; // never shown before the player has completed this many levels
