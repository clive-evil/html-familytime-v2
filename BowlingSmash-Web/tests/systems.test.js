// Save / economy / lives / daily / analytics QA (pure logic, mock storage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveStore, defaultSave, migrate, SAVE_VERSION } from '../src/systems/save.js';
import * as P from '../src/systems/progression.js';
import { LIVES, ECONOMY, CHESTS } from '../src/systems/config.js';
import { Analytics } from '../src/systems/analytics.js';
import { getLevel } from '../src/levels/levels.js';

class MockStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const T0 = new Date(2026, 9, 5, 12, 0, 0).getTime();
const DAY = 86400000;

test('fresh save, roundtrip persistence', () => {
  const st = new SaveStore({ storage: new MockStorage() });
  const { save, fresh } = st.load(T0);
  assert.equal(fresh, true);
  assert.equal(save.currentLevel, 1);
  save.coins = 321; save.boosters.heavy = 2; save.lives = 3; save.completed[1] = { best: 'strike', bestBalls: 1, plays: 1, wins: 1 };
  st.write(save);
  const again = st.load(T0);
  assert.equal(again.fresh, false);
  assert.equal(again.save.coins, 321);
  assert.equal(again.save.boosters.heavy, 2);
  assert.equal(again.save.lives, 3);
  assert.equal(again.save.completed[1].best, 'strike');
});

test('migration / versioning never crashes', () => {
  const v1 = migrate({ version: 1, level: 7, coins: 90, best: { 1: 'strike', 2: 'spare' } }, T0);
  assert.equal(v1.version, SAVE_VERSION);
  assert.equal(v1.currentLevel, 7);
  assert.equal(v1.coins, 90);
  assert.equal(v1.completed[2].best, 'spare');
  const v2 = migrate({ version: 2, currentLevel: 4, completed: { 1: {}, 2: {} }, coins: 10 }, T0);
  assert.equal(v2.rewardedLevels[1], true, 'v2 -> v3 derives paid levels (no duplicate rewards)');
  assert.equal(v2.boosters.bomb, 0);
  // garbage values sanitised
  const junk = migrate({ version: 3, coins: 'lots', lives: 99, currentLevel: -4, boosters: { heavy: NaN }, livesUpdatedAt: 'x' }, T0);
  assert.equal(junk.coins, 0); assert.equal(junk.lives, LIVES.max); assert.equal(junk.currentLevel, 1); assert.equal(junk.boosters.heavy, 0);
  // from the future -> fresh
  assert.equal(migrate({ version: 999, coins: 5 }, T0).coins, 0);
  assert.equal(migrate(null, T0).currentLevel, 1);
  // corrupt JSON in storage -> fresh + backup
  const ms = new MockStorage();
  ms.setItem('bowlingsmash.save', '{not json');
  const st = new SaveStore({ storage: ms });
  assert.equal(st.load(T0).fresh, true);
  assert.equal(ms.getItem('bowlingsmash.save.corrupt-backup'), '{not json');
  // storage that throws (private mode) -> still works
  const broken = { getItem() { throw new Error('nope'); }, setItem() { throw new Error('nope'); }, removeItem() {} };
  const sb = new SaveStore({ storage: broken });
  assert.equal(sb.load(T0).fresh, true);
  sb.write(defaultSave(T0));
});

test('lives: loss, FTUE protection, regeneration, persistence', () => {
  const s = defaultSave(T0);
  assert.equal(P.loseLife(s, 3, T0), false, 'levels 1-5 never cost hearts');
  assert.equal(s.lives, LIVES.max);
  assert.equal(P.loseLife(s, 8, T0), true);
  assert.equal(P.loseLife(s, 8, T0), true);
  assert.equal(s.lives, LIVES.max - 2);
  const ms = P.regenLives(s, T0 + 1000);
  assert.ok(ms > 0 && ms <= LIVES.regenMs);
  P.regenLives(s, T0 + LIVES.regenMs + 1);
  assert.equal(s.lives, LIVES.max - 1, 'one heart regenerates');
  P.regenLives(s, T0 + LIVES.regenMs * 10);
  assert.equal(s.lives, LIVES.max, 'caps at max');
  // drain to zero
  for (let i = 0; i < 10; i++) P.loseLife(s, 12, T0 + LIVES.regenMs * 10);
  assert.equal(s.lives, 0);
  assert.equal(P.canPlay(s, T0 + LIVES.regenMs * 10), false);
  // persists through storage
  const st = new SaveStore({ storage: new MockStorage() });
  st.write(s);
  const back = st.load(T0 + LIVES.regenMs * 10).save;
  assert.equal(back.lives, 0);
  assert.equal(P.canPlay(back, T0 + LIVES.regenMs * 11 + 5), true, 'regenerates after load');
  // unlimited lives (QA toggle)
  back.lives = 0; back.settings.unlimitedLives = true;
  assert.equal(P.canPlay(back, T0), true);
  assert.equal(P.loseLife(back, 15, T0), false);
});

test('rewards: coins, grades, no duplicate rewards, chests once', () => {
  const s = defaultSave(T0);
  const r1 = P.applyWin(s, getLevel(1), { shotsTaken: 1, ballsLeft: 2 });
  assert.equal(r1.grade, 'strike');
  assert.equal(r1.total, ECONOMY.clearReward.easy + ECONOMY.strikeBonus + 2 * ECONOMY.unusedBallBonus);
  assert.equal(s.coins, r1.total);
  const r2 = P.applyWin(s, getLevel(1), { shotsTaken: 2, ballsLeft: 1 });
  assert.equal(r2.grade, 'spare');
  assert.equal(r2.firstClear, false);
  assert.equal(r2.total, ECONOMY.spareBonus, 'replay pays only the skill bonus');
  assert.equal(s.completed[1].best, 'strike', 'best result kept');
  assert.equal(P.applyWin(s, getLevel(10), { shotsTaken: 3, ballsLeft: 0 }).lines[0].coins, ECONOMY.clearReward.hard);
  assert.equal(P.applyWin(s, getLevel(20), { shotsTaken: 3, ballsLeft: 0 }).lines[0].coins, ECONOMY.clearReward.superhard);
  // progression
  const p = defaultSave(T0);
  P.applyWin(p, getLevel(1), { shotsTaken: 1, ballsLeft: 2 });
  assert.equal(p.currentLevel, 2);
  P.applyWin(p, getLevel(1), { shotsTaken: 1, ballsLeft: 2 });
  assert.equal(p.currentLevel, 2, 'replay does not skip ahead');
  // chests
  const c = defaultSave(T0);
  const w = P.applyWin(c, getLevel(5), { shotsTaken: 2, ballsLeft: 1 });
  assert.equal(w.chest, 5);
  const before = c.coins;
  const contents = P.openChest(c, 5);
  assert.equal(c.coins, before + CHESTS[5].coins);
  assert.equal(c.boosters.heavy, 1);
  assert.equal(P.openChest(c, 5), null, 'chest only once');
  assert.equal(P.applyWin(c, getLevel(5), { shotsTaken: 1, ballsLeft: 2 }).chest, null);
  assert.ok(contents);
});

test('boosters: buy, consume, persist', () => {
  const s = defaultSave(T0);
  s.coins = 100;
  assert.equal(P.buyBooster(s, 'heavy', 90), true);
  assert.equal(P.buyBooster(s, 'heavy', 90), false, 'cannot overspend');
  assert.equal(s.coins, 10);
  assert.equal(P.consumeBooster(s, 'heavy'), true);
  assert.equal(P.consumeBooster(s, 'heavy'), false);
  assert.equal(s.stats.boostersUsed, 1);
  const st = new SaveStore({ storage: new MockStorage() });
  s.boosters.bomb = 4; st.write(s);
  assert.equal(st.load(T0).save.boosters.bomb, 4);
});

test('daily reward: gated, once per day, streak, persists', () => {
  const s = defaultSave(T0);
  assert.equal(P.dailyAvailable(s, T0), false, 'not during FTUE');
  s.completed = { 1: {}, 2: {}, 3: {} };
  assert.equal(P.dailyAvailable(s, T0), true);
  const c1 = P.claimDaily(s, T0);
  assert.equal(c1.day, 1);
  assert.equal(P.claimDaily(s, T0 + 1000), null, 'once per day');
  const c2 = P.claimDaily(s, T0 + DAY);
  assert.equal(c2.day, 2);
  assert.equal(s.boosters.heavy, 1);
  const st = new SaveStore({ storage: new MockStorage() });
  st.write(s);
  const back = st.load(T0 + DAY).save;
  assert.equal(back.daily.index, 2);
  assert.equal(P.dailyAvailable(back, T0 + DAY), false);
  // skip a day -> streak resets to day 1
  const c4 = P.claimDaily(back, T0 + 4 * DAY);
  assert.equal(c4.day, 1);
  // full week -> big reward on day 7
  const w = defaultSave(T0); w.completed = { 1: {}, 2: {}, 3: {} };
  let last;
  for (let d = 0; d < 7; d++) last = P.claimDaily(w, T0 + d * DAY);
  assert.equal(last.day, 7);
  assert.ok(last.reward.big);
});

test('analytics records required fields locally', () => {
  const a = new Analytics({ memory: true });
  for (const ev of ['session_start', 'level_start', 'shot', 'level_win', 'level_fail', 'retry', 'continue', 'booster_used', 'heart_lost', 'daily_claim', 'session_end']) {
    a.track(ev, { level: 3, balls_used: 2, balls_remaining: 1, targets_remaining: 0, attempt_number: 1, time_to_complete: 1234 });
  }
  assert.equal(a.events().length, 11);
  const win = a.events('level_win')[0];
  for (const k of ['level', 'balls_used', 'balls_remaining', 'targets_remaining', 'attempt_number', 'time_to_complete', 't', 'session']) assert.ok(k in win, k);
});
