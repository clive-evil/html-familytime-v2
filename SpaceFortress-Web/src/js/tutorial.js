// Guided first session. Steps are pure predicates over (game, ui) so they are testable.
// ui = { selected, selectedInst, weapon, mode, ack } — supplied by the UI layer.
(function () {
  const SF = globalThis.SF;
  const varn = (g) => SF.planet(g, 'varn');
  const cannon = (g) => varn(g).insts.find((i) => i.type === 'cannon');
  SF.TUTORIAL = [
    { id: 'select', title: 'SELECT A TARGET WORLD', text: 'This is Varn II, a weakly held mining colony. Click it on the tactical display.', hl: 'planet:varn',
      done: (g, ui) => ui.selected === 'varn' },
    { id: 'scan', title: 'SCAN THE WORLD', text: 'You know nothing about its defences yet. Run a deep scan (10 power).', hl: '#act-scan',
      done: (g) => varn(g).scanned },
    { id: 'identify', title: 'IDENTIFY THE THREAT', text: 'The scan found an Anti-Orbital Cannon. It shoots at the fortress and at your dropships. Select it.', hl: 'inst:cannon',
      done: (g, ui) => ui.selectedInst === cannon(g).id || cannon(g).hp <= 0 },
    { id: 'weapon', title: 'ARM THE RAILGUN', text: 'Armoured targets call for precision. Select the RAILGUN.', hl: '#w-railgun',
      done: (g, ui) => ui.weapon === 'railgun' || cannon(g).hp <= 0 },
    { id: 'manual', title: 'TAKE MANUAL CONTROL', text: 'Auto-fire is quick. Manual control is slower but more accurate and does more damage. Press MANUAL.', hl: '#fire-manual',
      done: (g, ui) => ui.mode === 'manual' || cannon(g).hp <= 0 },
    { id: 'destroy', title: 'DESTROY THE CANNON', text: 'Follow the procedure on the console: load, lock, aim, cool, charge, release the safety, then FIRE.', hl: null,
      done: (g) => cannon(g).hp <= 0 },
    { id: 'deploy', title: 'DEPLOY GROUND FORCES', text: 'With the gun gone, a landing costs far fewer lives. Check the forecast and press DEPLOY TROOPS.', hl: '#act-deploy',
      done: (g) => g.invasions.some((iv) => iv.pid === 'varn') || varn(g).owner === 'player' },
    { id: 'capture', title: 'END THE CYCLE', text: 'Troops fight while the cycle turns. Enemy guns fire, income arrives. Press END CYCLE.', hl: '#btn-end',
      done: (g) => varn(g).owner === 'player' },
    { id: 'income', title: 'MINING INCOME', text: 'Varn II is yours, with its mine intact. Captured mines pay out every cycle. Destroyed mines never do. Preserve what you want to own.', hl: '#res-bar',
      done: (g, ui) => !!ui.ack },
    { id: 'upgrade', title: 'UPGRADE THE FORTRESS', text: 'Spend the spoils. Open FORTRESS ENGINEERING and install your first upgrade.', hl: '#btn-fortress',
      done: (g) => Object.keys(g.upgrades).length > 0 },
  ];
  // Advance as far as predicates allow. Returns true if the step changed.
  SF.tutorialAdvance = function (g, ui) {
    const t = g.tutorial;
    if (!t.active || t.done) return false;
    const start = t.step;
    while (t.step < SF.TUTORIAL.length && SF.TUTORIAL[t.step].done(g, ui)) { t.step++; ui.ack = false; }
    if (t.step >= SF.TUTORIAL.length) { t.done = true; SF.log(g, 'Training complete. The Reach is yours to take.', 'sys'); }
    return t.step !== start;
  };
})();
