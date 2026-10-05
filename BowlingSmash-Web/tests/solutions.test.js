// EVERY LEVEL IS WINNABLE: replays the stored known-good solution for each
// level deterministically and checks it wins within the ball budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runShots } from '../src/sim/Sim.js';
import { LEVELS } from '../src/levels/levels.js';
import { SOLUTIONS } from '../src/levels/solutions.js';

for (const level of LEVELS) {
  test(`L${level.id} ${level.name} has a winning solution`, async () => {
    const sol = SOLUTIONS[level.id];
    assert.ok(sol, 'solution stored');
    assert.ok(sol.shots.length <= level.balls, 'within ball budget');
    const r = await runShots(level, sol.shots, { afterWin: 60 });
    assert.equal(r.won, true, `remaining ${r.remaining}`);
    assert.equal(r.shotsTaken, sol.shots.length);
    assert.equal(r.nan, false);
    assert.equal(r.duplicateDown, false);
    const again = await runShots(level, sol.shots, { afterWin: 60 });
    assert.equal(again.hash, r.hash, 'deterministic replay');
  });
}

test('L20 (SUPER HARD) has a perfect one-ball STRIKE solution', async () => {
  const sol = SOLUTIONS[20];
  assert.ok(sol.strike, 'strike solution stored');
  const r = await runShots(LEVELS[19], [sol.strike], { afterWin: 60 });
  assert.equal(r.won, true);
  assert.equal(r.shotsTaken, 1);
});
