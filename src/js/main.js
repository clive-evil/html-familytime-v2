'use strict';
// ============================================================================
// MAIN — boot, loop, endings, test hooks
// ============================================================================

function newGame(seed) {
  RNG = mulberry32(seed ?? ((Date.now() ^ 0x5f3759df) >>> 0));
  Object.assign(G, { t: 0, log: [], story: [], deaths: 0, phase: 1, shake: 0, started: false, over: false, logId: 0,
    meteor: null, nestRoom: null, firstSighting: 0, delayedLogs: [], pendingMissing: [], foodTheft: 0, infectedEver: 0, creaturesKilled: 0, fab: 0 });
  initShip(); initCrew(); initThreat();
  const extra = +(new URLSearchParams(location.search).get('crew') || 0);
  for (let i = G.crew.length; i < extra; i++) { const src = G.crew[i % 12]; const c = JSON.parse(JSON.stringify(src)); Object.assign(c, { id: i, name: src.first + ' ' + src.last + ' ' + (i + 1), rel: [], task: null, path: [], infection: null }); c.x = rnd(G.roomById[c.duty].x0 + 40, G.roomById[c.duty].x1 - 40); G.crew.push(c); }
  G.director = makeDirector();
  // settle observation/power before first frame
  updatePower(0.01); updateObservation(0.01);
}

function simStep(dt) {
  G.t += dt;
  G.director.update(dt);
  updatePower(dt);
  updateAtmosphere(dt);
  updateFire(dt);
  updateCrew(dt);
  updateCreatures(dt);
  updateContamination(dt);
  updateInfection(dt);
  updateResearch(dt);
  updateEVAState(dt);
  updateResources(dt);
  updateObservation(dt);
  FX.update(dt);
  checkEnd();
}

function checkEnd() {
  if (G.over) return;
  const alive = G.crew.filter((c) => c.alive && !c.missing).length;
  if (alive === 0) endGame('lost', 'Nobody left awake in Section 6.');
  else if (G.res.hull <= 0) endGame('lost', 'The frame of Section 6 let go.');
  else if (G.t >= ARC_LENGTH) endGame('survived', 'The next watch is thawed.');
}

function endGame(kind, line) {
  G.over = true; UI.speed = 0;
  if (G.ffwd) return;
  const alive = G.crew.filter((c) => c.alive && !c.missing);
  const orgAlive = G.creatures.filter((m) => m.alive).length;
  const infectedAlive = alive.filter((c) => c.infection).length;
  let verdict = kind === 'lost' ? line : `${line} ${alive.length} of 12 crew hand over the watch.`;
  if (kind === 'survived') {
    if (orgAlive || infectedAlive) verdict += ` The relief crew is not told what is still aboard.${infectedAlive ? ' One of the survivors keeps asking when they can eat.' : ''}`;
    else verdict += ' Section 6 is clean. As far as anyone can tell.';
  }
  const rows = G.crew.map((c) => `<tr class="${c.alive && !c.missing ? '' : 'dead'}"><td>${esc(fullName(c))}</td><td>${c.prof}</td><td>${c.alive && !c.missing ? (c.infection ? 'ALIVE' : 'ALIVE') : c.missing && !c.bodyFound ? 'MISSING' : 'DEAD — ' + esc(c.deathCause)}</td></tr>`).join('');
  $('endTitle').textContent = kind === 'survived' ? 'WATCH RELIEVED' : 'SECTION 6 LOST';
  $('endVerdict').textContent = verdict;
  $('endStats').innerHTML = `<table>${rows}</table><p>Colonists lost in cryo: <b>${G.colonistsLost}</b> · Organisms destroyed: <b>${G.creaturesKilled || 0}</b> · Organisms unaccounted for: <b>${orgAlive}</b> · Time on watch: ${fmtT(G.t)}</p>`;
  $('endStory').innerHTML = G.story.slice(-22).map((s) => `<div>${esc(s)}</div>`).join('');
  $('end').style.display = 'flex';
}

// fast-forward for testing / audit (no render)
G.fastForward = function (seconds, step = 0.1) {
  G.ffwd = true; const n = Math.round(seconds / step);
  for (let i = 0; i < n && !G.over; i++) simStep(step);
  G.ffwd = false;
  if (G.pendingDecision) { const d = G.pendingDecision; G.pendingDecision = null; UI.decision(d); }
};

let lastT = 0, uiAcc = 0;
function frame(ts) {
  const dtReal = Math.min(0.1, (ts - lastT) / 1000 || 0.016); lastT = ts;
  if (G.started && !G.over) {
    const sp = UI.speed;
    if (sp > 0) { let rem = dtReal * sp; while (rem > 1e-4) { const s = Math.min(0.05, rem); simStep(s); rem -= s; } }
  }
  UI.panKeys(dtReal);
  try { render(dtReal); } catch (e) { console.error(e); }
  AUDIO.update(dtReal);
  uiAcc += dtReal;
  if (uiAcc > 0.15) { uiAcc = 0; UI.updateTop(); UI.updateRoster(); UI.updatePower(); UI.updateAlerts(); UI.renderCtx(false); }
  requestAnimationFrame(frame);
}

function boot() {
  const params = new URLSearchParams(location.search);
  const seed = params.has('seed') ? +params.get('seed') : undefined;
  newGame(seed);
  buildArt(); initRender(); UI.init();
  document.getElementById('fxGrain').style.backgroundImage = `url(${ART.grain.toDataURL()})`;
  UI.fitShip(); R.cam.x = R.cam.tx; R.cam.y = R.cam.ty; R.cam.z = R.cam.tz;
  $('btnStart').onclick = () => start();
  $('btnRestart').onclick = () => location.reload();
  if (params.has('autostart')) start();
  if (params.has('t')) { start(); G.fastForward(+params.get('t')); }
  requestAnimationFrame(frame);
}
function start() {
  if (G.started) return;
  AUDIO.init(); if (AUDIO.ctx && AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume();
  $('title').style.display = 'none';
  G.started = true;
  logEvent('story', 'Watch handover complete. Section 6 nominal. 2,400 colonists in stasis. 14 years to landfall.', null, { story: true });
  logEvent('hint', 'Take a minute. Click crew and rooms to learn the section. SPACE pauses. Mouse wheel zooms; drag or WASD pans.');
  UI.updateTop();
}
window.addEventListener('load', boot);
