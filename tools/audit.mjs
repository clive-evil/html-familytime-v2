// Headless systemic audit: runs the whole arc with a scripted policy and prints the story.
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
const [policy = 'competent', seed = '7', until = '1700'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file://' + process.cwd() + '/dist/ColonyShipHorror.html?autostart=1&seed=' + seed);
await page.waitForTimeout(800);
const out = await page.evaluate(({ policy, until }) => {
  const G = window.__game; const snaps = []; G.fullLog = [];
  G.autoDecide = (d) => d.options[policy === 'passive' ? 1 : 0].fn();
  const busy = (c) => c.task && c.task.ordered && !['move', 'duty'].includes(c.task.type);
  function act() {
    if (policy === 'passive') return;
    const R0 = G.reactor;
    const eng = G.crew.filter((c) => crewAvailable(c) && ['Engineer', 'Technician'].includes(c.prof));
    if (R0.needsRestart && !G.crew.some((c) => c.task && c.task.type === 'restart')) { const e = eng.find((c) => !busy(c)) || eng[0]; if (e) orderCrew(e, { type: 'restart', room: 'reactor' }, { insist: true }); }
    else if (!R0.manned && !G.crew.some((c) => c.task && c.task.type === 'reactor')) { const a = G.crew.find((c) => c.first === 'Avery' && crewAvailable(c)) || eng.find((c) => !busy(c)); if (a) orderCrew(a, { type: 'reactor', room: 'reactor' }, { insist: true }); }
    for (const r of G.rooms) {
      const has = (k) => G.crew.some((c) => c.alive && c.task && c.task.type === k && c.task.room === r.id);
      if (r.breach > 0 && r.p < 70 && !r.sealed && !G.crew.some((c) => c.alive && c.room === r.id)) sealRoom(r);
      if (r.fire > 0.05 && !has('extinguish')) dispatchBest(r, 'extinguish');
      if (r.breach > 0 && !has('seal')) { if (r.sealed) unsealRoom(r); dispatchBest(r, 'seal'); }
      if (r.elecFault && !has('power')) dispatchBest(r, 'power');
      if ((r.integ < 65 || r.leak) && !has('repair') && r.fire === 0) dispatchBest(r, 'repair');
      if (r.contamKnown && !has('decon')) dispatchBest(r, 'decon');
      if (r.breach === 0 && r.sealed && !r.venting && !G.creatures.some((m) => m.alive && m.room === r.id)) unsealRoom(r);
    }
    // power triage
    if (G.supply < G.demand - 2 && G.battery < 30) { for (const id of ['SENS', 'HAB']) if (G.groups[id].on) { setGroup(id, false); break; } }
    if (G.supply > G.demand + 12 && G.battery > 40) for (const id of ['HAB', 'SENS', 'HYD', 'SEC', 'MED', 'LIFE', 'CRYO']) if (!G.groups[id].on) { setGroup(id, true); break; }
    // threat: trap and vent organism when seen in a room without crew
    for (const m of G.creatures) if (m.alive && m.state === 'room' && m.visible) {
      const r = G.roomById[m.room];
      const crew = G.crew.filter((c) => c.alive && c.room === r.id);
      if (!crew.length && !r.venting) { sealRoom(r); startVent(r); }
    }
    for (const r of G.rooms) if (r.venting && !G.creatures.some((m) => m.alive && m.room === r.id)) { stopVent(r); }
    // infection: blood test anyone flagged odd
    for (const c of G.crew) if (c.alive && !c.missing && c.reportedOdd && !c.lastTest && !c.quarantined && G.t - c.reportedOdd < 60) orderMedicalTest(c, 'bloodtest');
    for (const c of G.crew) if (c.alive && c.lastTest && c.lastTest.result === 'POSITIVE' && !c.quarantined && !c.quarantineOrder) orderQuarantine(c);
    // quarantined + transformed → vent quarantine
    const q = G.roomById.quarantine; if (G.creatures.some((m) => m.alive && m.room === 'quarantine') && !G.crew.some((c) => c.alive && c.room === 'quarantine' && !c.infection) && !q.venting) { sealRoom(q); startVent(q); }
  }
  while (G.t < until && !G.over) {
    G.fastForward(2);
    act();
    if (Math.floor(G.t) % 60 < 2) snaps.push(`O2room ${G.rooms.map((r) => r.id.slice(0,3) + Math.round(effO2(r))).join(' ')} LIFE ${G.groups.LIFE.on ? 1 : 0}${G.groups.LIFE.powered ? 1 : 0} o2integ ${Math.round(G.roomById.o2.integ)}\n   ` + `${fmtT(G.t)} ph${G.phase} pow ${Math.round(G.supply)}/${G.demand} bat ${Math.round(G.battery)} o2 ${Math.round(G.res.o2)} food ${Math.round(G.res.food)} water ${Math.round(G.res.water)} parts ${Math.round(G.res.parts)} med ${Math.round(G.res.med)} hull ${Math.round(G.res.hull)} crew ${G.crew.filter((c) => c.alive && !c.missing).length} col ${G.colonists} cre ${G.creatures.filter((m) => m.alive).map((m) => m.state + ':' + (m.room || m.ventRoom) + ':' + Math.round(m.hp)).join(',')} inf ${G.crew.filter((c) => c.alive && c.infection).map((c) => c.first + c.infection.stage).join(',')} nest ${G.nestRoom}:${G.nestRoom ? G.roomById[G.nestRoom].contam.toFixed(2) : ''} cams ${G.rooms.filter((r) => !r.observed).length}`);
  }
  const log = G.fullLog.filter((e) => !/No crew available|not responding to orders|EMERGENCY SEALED|spare parts|REFUSES|seal released|dump valve/.test(e.text)).filter((e) => ['crit', 'story', 'warn', 'phase'].includes(e.sev)).map((e) => `${fmtT(e.t)} [${e.sev}] ${e.text}`);
  return { snaps, log, over: G.over, t: G.t, deaths: G.crew.filter((c) => !c.alive).map((c) => c.name + ':' + c.deathCause) };
}, { policy, until: +until });
console.log(out.snaps.join('\n'));
console.log('---- LOG ----');
console.log(out.log.join('\n'));
console.log('---- END ----', out.over, out.t, out.deaths);
console.log(errs.slice(0, 10).join('\n') || 'no errors');
await browser.close();
