import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../../src/data/balance.js';
import { AutoPlayer, runHeadless } from '../../src/core/bot/AutoPlayer.js';
import { spawnGrandma } from '../../src/core/systems/PopulationSystem.js';
import { newSim, stepFor, finite } from './helpers.js';

test("debug('day') advances exactly one day and records a summary", () => {
  const sim = newSim(1);
  const s = sim.state;
  for (let d = 1; d <= 4; d++) {
    assert.equal(s.day, d);
    sim.debug('day');
    assert.equal(s.phase, 'day');
    assert.equal(s.dayTime, 0);
    assert.equal(s.lastSummary.day, d);
  }
  assert.equal(s.stats.history.length, 4);
  assert.equal(s.clockRunning, true);
});

test('the day clock ends the day at dayLength and dawn follows the night', () => {
  const sim = newSim(1);
  sim.debug('skipTutorial');
  sim.debug('food', 100);
  const s = sim.state;
  assert.equal(s.day, 2);
  let ev = stepFor(sim, BALANCE.dayLength - 1);
  assert.equal(s.phase, 'day');
  ev = stepFor(sim, 1.5);
  assert.equal(s.phase, 'night');
  assert.ok(ev.some((e) => e.type === 'night' && e.reason === 'clock'));
  ev = stepFor(sim, BALANCE.nightLength + 0.1);
  assert.equal(s.phase, 'day');
  assert.equal(s.day, 3);
});

test('hatchlings become adults at dawn', () => {
  const sim = newSim(1);
  sim.debug('skipTutorial');
  const baby = spawnGrandma(sim, 2, 2);
  assert.equal(baby.adult, false);
  assert.equal(sim.status().hatchlings, 1);
  sim.sleep();
  const ev = stepFor(sim, BALANCE.nightLength + 0.2);
  const dawn = ev.find((e) => e.type === 'dawn');
  assert.equal(dawn.summary.grown, 1);
  assert.equal(baby.adult, true);
  assert.equal(sim.status().hatchlings, 0);
});

test('the bot plays several days without exceptions', () => {
  const sim = newSim(9);
  const bot = new AutoPlayer(sim);
  const summaries = [];
  let guard = 0;
  while (sim.state.day === 1 && guard++ < 7200) { bot.update(0.05); sim.step(0.05); sim.drainEvents(); }
  assert.equal(sim.state.day, 2, 'bot finished day 1');
  runHeadless(sim, bot, 3 * (BALANCE.dayLength + BALANCE.nightLength) + 1, 0.05, (sum) => summaries.push(sum));
  assert.ok(sim.state.day >= 5, `reached day ${sim.state.day}`);
  assert.ok(summaries.length >= 3);
  for (let i = 1; i < summaries.length; i++) assert.equal(summaries[i].day, summaries[i - 1].day + 1);
  assert.ok(sim.state.grandmas.length > 1, 'colony grew');
  for (const g of sim.state.grandmas) assert.ok(finite(g.x) && finite(g.z) && finite(g.hunger));
  for (const k of ['food', 'wood', 'stone']) assert.ok(finite(sim.state.resources[k]) && sim.state.resources[k] >= 0, `${k} sane`);
  // At dawn every hatchling grew up, so before more hatching nobody is a hatchling from >1 day ago.
  for (const g of sim.state.grandmas) if (!g.adult) assert.equal(g.bornDay, sim.state.day);
});
