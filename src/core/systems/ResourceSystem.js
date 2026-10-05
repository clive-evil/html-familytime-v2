import { BALANCE } from '../../data/balance.js';

export function canAfford(state, cost = {}) {
  for (const k in cost) if ((state.resources[k] || 0) < cost[k]) return false;
  return true;
}

export function spend(state, cost = {}) {
  for (const k in cost) state.resources[k] -= cost[k];
}

// Resources entering the stockpile (from the player or workers).
export function deposit(sim, type, n, source) {
  const s = sim.state;
  s.resources[type] = (s.resources[type] || 0) + n;
  s.stats.today[type] += n;
  sim.prodAcc[type] += n;
  sim.emit('deposit', { type, n, source });
}

// Regrow gatherable nodes and update smoothed production rates.
export function updateResources(sim, dt) {
  const s = sim.state;
  for (const n of s.nodes) {
    const def = BALANCE.nodes[n.type];
    if (n.charges < def.charges) {
      n.regenT += dt;
      if (n.regenT >= def.regen) { n.regenT = 0; n.charges++; }
    }
  }
  // Exponential moving average of production per second (~40 s window).
  if (s.phase === 'day') {
    const a = Math.min(1, dt / 40);
    for (const k of ['food', 'wood', 'stone']) {
      s.stats.prod[k] += (sim.prodAcc[k] / dt - s.stats.prod[k]) * a;
      sim.prodAcc[k] = 0;
    }
  }
}

// Food per day consumed by the whole population at full appetite.
export function foodDemandPerDay(state) {
  return state.grandmas.length * BALANCE.grandma.mealSize * BALANCE.grandma.mealsPerDay;
}
