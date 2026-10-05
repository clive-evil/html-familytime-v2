import { BALANCE } from '../../data/balance.js';
import { newDayStats } from '../GameState.js';
import { bedCapacity } from './BuildingSystem.js';
import { layEggs } from './EggSystem.js';
import { assignBeds } from './NeedsSystem.js';
import { ageGrandmas } from './PopulationSystem.js';

// DAY  -> gather/build/assign/incubate (clock runs from Day 2)
// NIGHT-> Grandmas walk to beds; unbedded sleep on the lawn
// DAWN -> eggs are laid, hatchlings grow up, summary, next day

export function updateDay(sim, dt) {
  const s = sim.state;
  if (s.phase === 'day') {
    if (s.clockRunning) {
      s.dayTime += dt;
      if (s.dayTime >= BALANCE.dayLength) startNight(sim, 'clock');
    }
  } else {
    s.nightTime += dt;
    if (s.nightTime >= BALANCE.nightLength) dawn(sim);
  }
}

export function canSleep(state) {
  if (state.phase !== 'day') return false;
  if (state.day === 1) return bedCapacity(state) >= 2; // tutorial: build a bed first
  return true;
}

export function startNight(sim, reason = 'sleep') {
  const s = sim.state;
  if (s.phase !== 'day') return false;
  s.phase = 'night';
  s.nightTime = 0;
  const homeless = assignBeds(sim);
  s.stats.today.sleptOutside = homeless;
  sim.ai.startNight();
  sim.emit('night', { reason, homeless });
  return true;
}

export function dawn(sim) {
  const s = sim.state;
  const { laid, lost } = layEggs(sim);
  for (const g of s.grandmas) {
    g.stiff = !g.bed;
    g.hungryToday = false;
  }
  const grown = ageGrandmas(sim);
  const summary = {
    day: s.day,
    ...s.stats.today,
    eggsLaid: laid,
    eggsLost: lost,
    grown,
    pop: s.grandmas.length,
    beds: bedCapacity(s),
    food: s.resources.food,
    wood: s.resources.wood,
    stone: s.resources.stone,
    eggsWaiting: s.eggs.filter((e) => e.loc !== 'incubator').length,
  };
  s.stats.history.push(summary);
  if (s.stats.history.length > 60) s.stats.history.shift();
  s.stats.today = newDayStats();
  s.day++;
  s.dayTime = 0;
  s.phase = 'day';
  s.clockRunning = true;
  s.lastSummary = summary;
  sim.ai.dawn();
  sim.emit('dawn', { summary });
}
