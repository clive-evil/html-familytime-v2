// Local-only playtest telemetry (localStorage). Nothing leaves the machine.
const KEY = 'drive-with-dave-telemetry-v1';

export function loadRuns() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function saveRun(run) {
  try { const all = loadRuns(); all.push(run); localStorage.setItem(KEY, JSON.stringify(all.slice(-200))); } catch { /* private mode */ }
}
export function clearRuns() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export function buildRun({ dave, route, profileName, inputMode, outcome, restarts }) {
  const T = dave.tel, s = route.stats;
  const mins = Math.max(1 / 60, s.time / 60);
  const rt = T.reactionTimes;
  return {
    when: new Date().toISOString(), profile: profileName, inputMode, outcome,
    duration: Math.round(s.time), commands: T.commands, commandsPerMin: +(T.commands / mins).toFixed(1),
    repeated: T.repeated, shouty: T.shouty, avgUrgency: T.commands ? +(T.urgencySum / T.commands).toFixed(2) : 0,
    avgStress: T.stressN ? +(T.stressSum / T.stressN).toFixed(2) : 0, maxStress: +T.maxStress.toFixed(2),
    wrongTurns: T.wrongTurns, junctionsOk: T.junctionsOk, stalls: s.stalls, kerbs: s.kerbHits, collisions: s.collisions,
    nearMisses: T.nearMisses, parkingAttempts: T.parkingAttempts, parkingQuality: T.parkingQuality,
    refused: T.refused, misheard: T.misheard, voice: T.voice || 0, buttons: (T.button || 0), keys: (T.key || 0), pad: (T.pad || 0),
    reactionAvg: rt.length ? +(rt.reduce((a, b) => a + b, 0) / rt.length).toFixed(2) : null,
    restarts: restarts || 0, byCmd: T.byCmd,
  };
}
