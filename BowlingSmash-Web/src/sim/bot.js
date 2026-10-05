// A naive "casual player" bot used by QA: aims straight at the densest cluster
// of standing targets. Used to prove early levels are forgiving.
export function botShot(sim, power = 0.75) {
  const s = sim.level.start || [0, 0, 0];
  const standing = sim.targets.filter((e) => !e.down && !e.removed);
  if (!standing.length) return { angle: 0, power };
  let best = standing[0], bestN = -1;
  for (const e of standing) {
    const p = e.body.translation();
    let n = 0;
    for (const o of standing) {
      const q = o.body.translation();
      if (Math.hypot(p.x - q.x, p.z - q.z) < 1.3) n++;
    }
    // prefer nearer/lower targets on ties
    const score = n - p.y * 0.1;
    if (score > bestN) { bestN = score; best = e; }
  }
  const p = best.body.translation();
  const angle = (Math.atan2(p.x - s[0], -(p.z - s[2])) * 180) / Math.PI;
  return { angle, power };
}

/** Play a level: fixed first shots, then bot shots until won/lost. */
export async function playWithBot(Sim, level, firstShots, opts = {}) {
  const sim = await Sim.create(level, opts);
  let i = 0;
  for (let step = 0; step < 60 * 90; step++) {
    if (sim.state === 'aim') sim.launch(i < firstShots.length ? firstShots[i++] : botShot(sim));
    sim.step();
    if (sim.state === 'won' || sim.state === 'lost') break;
  }
  const r = { won: sim.state === 'won', shots: sim.shotsTaken, remaining: sim.targetsRemaining };
  sim.dispose();
  return r;
}
