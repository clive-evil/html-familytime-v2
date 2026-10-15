// End-of-run judgement + Dave's verdict (authored, chosen from what happened).

export function majorFailure(dave, route, carEvents) {
  for (const e of carEvents) if (e.type === 'collision' && e.speed > 6.5) return 'crash';
  if (route.stats.collisions >= 7) return 'tooMany';
  return null;
}

export function verdict({ dave, route, outcome }) {
  const s = route.stats, T = dave.tel, p = dave.personality;
  const avgStress = T.stressN ? T.stressSum / T.stressN : 0;
  if (outcome === 'crash') return { nervous: '“I’m never driving again. Ever.”', cocky: '“He came out of nowhere.” (He was parked.)' }[p] || '“Well. That’s the car done.”';
  if (outcome === 'tooMany') return '“I think we’ll get the bus.”';
  if (outcome === 'quit') return '“Are we just... leaving it here?”';
  const incidents = s.stalls + s.collisions + s.kerbHits + T.wrongTurns;
  if (T.shouty >= 6) return { cocky: '“Next time you can drive. Oh wait.”', nervous: '“Please don’t ever shout at me like that again.”' }[p] || '“You need to learn to relax, mate.”';
  if (incidents === 0 && avgStress < 0.15) return { oldhand: '“Lovely. Like a Sunday.”', cocky: '“Told you I could drive.”', nervous: '“I... think that went well?”' }[p] || '“Not bad, that. Not bad at all.”';
  if (incidents <= 2) return { cocky: '“Flawless. Basically.”', nervous: '“I only cried a bit.”' }[p] || '“Could’ve gone worse.”';
  if (incidents <= 6) return { cocky: '“Car’s got issues.”', nervous: '“Can we not tell Nan about the kerb.”' }[p] || '“We got there. That’s the main thing.”';
  return { cocky: '“Mostly your navigating, that.”' }[p] || '“Don’t tell your nan.”';
}
