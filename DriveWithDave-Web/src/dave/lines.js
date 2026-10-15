// Dave's lines. Authored, short, and only for things that actually happened.
// Keyed by event; personality-specific variants override the default set.
// Selection cycles deterministically so he doesn't repeat himself back-to-back.

const L = {
  hello: { default: ['Right. Where are we going?'], nervous: ['Right. OK. Where are we going?'], cocky: ['Go on then. Where to?'], oldhand: ['Right then. Where to?'] },
  ack: { default: ['Yep.', 'Got it.', 'OK.', 'Right.', 'Mm-hm.'], nervous: ['OK. OK.', 'Right. Yep.', 'OK, yes.'], cocky: ['Yeah yeah.', 'Easy.', 'Sorted.'], oldhand: ['Right you are.', 'Will do.', 'OK.'] },
  ackLeft: { default: ['Left. Yep.', 'Left here?', 'Next left.'], nervous: ['Left. Left. OK.'], cocky: ['Left, easy.'] },
  ackRight: { default: ['Right. Yep.', 'Right it is.', 'Next right.'], nervous: ['Right... that way. OK.'], cocky: ['Right, yeah.'] },
  ackUrgent: { default: ['Alright!', 'I heard you!', 'Yes!'], nervous: ['Sorry! Sorry!', 'I’m doing it!'], cocky: ['Calm down!', 'Alright, alright.'], oldhand: ['Yes, I heard.'] },
  ackShout: { default: ['I’m turning!', 'Stop shouting!', 'I KNOW!'], nervous: ['Please stop shouting.', 'You’re making it worse!'], cocky: ['Mate. Relax.', 'Who’s driving here?'], oldhand: ['There’s no need for that.'] },
  what: { default: ['What?', 'Say again?', 'Sorry, what?'], cocky: ['Eh?'] },
  leftWhere: { default: ['Left where?', 'There’s nothing on the left.'], cocky: ['Into a wall? No.'] },
  rightWhere: { default: ['Right where?', 'There’s nothing there.'], cocky: ['There’s no right, mate.'] },
  noStraight: { default: ['Can’t go straight, it’s a T-junction.', 'Straight into that wall?'] },
  whichWay: { default: ['Left or right?', 'Which way?', 'Where now?'], nervous: ['Which way? Which way?', 'Is it left? Is it right?'], cocky: ['Left or right, quick.'], oldhand: ['Which way here?'] },
  assume: { default: ['I’ll just go right then.'], cocky: ['Right, is it? Right.', 'I’ll go right. It’s always right.'] },
  forgot: { default: ['Hang on, which way was it?', 'Where did you say?'], cocky: ['Did you say something earlier?'] },
  refuse: { default: ['No.', 'What? No.'], cocky: ['No chance, mate.', 'Not happening.'], nervous: ['I’m not doing that!', 'No, no, no.'], oldhand: ['Not yet.', 'I don’t think so.'] },
  refuseRed: { default: ['It’s red!', 'It’s on red.'], cocky: ['It’s red, genius.'], oldhand: ['Lights are red.'] },
  complyReluctant: { default: ['Fine!', 'Alright, fine!', 'Your call.'], nervous: ['Oh god. OK.'], cocky: ['If you say so.'] },
  stall: { default: ['Ah, bollocks.', 'Give me a second.', 'Hang on.', 'Every time.'], nervous: ['Oh no. Oh no.', 'Sorry. Sorry.'], cocky: ['That’s the car, that.', 'Clutch is weird on this.'], oldhand: ['Hm.'] },
  restart: { default: ['Right. Again.', 'OK. Here we go.'], nervous: ['OK. Deep breath.'], cocky: ['Right, proper this time.'] },
  rollback: { default: ['Whoa whoa whoa.', 'We’re going backwards.'], nervous: ['We’re rolling! We’re rolling!'], cocky: ['That’s fine. That’s fine.'] },
  kerb: { default: ['Oops.', 'That was the kerb.', 'Sorry.'], nervous: ['Sorry!'], cocky: ['Kerb’s in a stupid place.', 'It’s fine.'], oldhand: ['Clipped that.'] },
  crash: { default: ['Oh no.', 'Oh, for...', 'That’s not good.'], nervous: ['Oh god. Oh god.', 'I’m so sorry.'], cocky: ['That wasn’t me.', 'He was parked badly.'], oldhand: ['Damn.'] },
  nearMiss: { default: ['Jesus.', 'That was close.'], nervous: ['I can’t do this.', 'Too close!'], cocky: ['See? Fine.', 'Plenty of room.'], oldhand: ['Bit close.'] },
  grind: { default: ['Ugh.', 'Where’s second?'], cocky: ['Gearbox is shot on this.'], nervous: ['Sorry!'] },
  horn: { default: ['Alright! Alright!', 'Yes, I know.'], nervous: ['They’re beeping at me.', 'Everyone’s looking.'], cocky: ['Yeah, and you.'], oldhand: ['Patience.'] },
  redLight: { default: ['Red.'], nervous: ['Lights. Stopping.'] },
  green: { default: ['Green.', 'Off we go.'], nervous: ['Green. Should I go?'] },
  giveWayWait: { default: ['I’ll let him through.'], nervous: ['Is he stopping? Should I go?'], cocky: ['I can make that.'] },
  giveWayGo: { default: ['Going.'], cocky: ['Plenty of room.'], nervous: ['Going! Going.'] },
  standoff: { default: ['He’s not moving.', 'Well, one of us has to.'], cocky: ['I’m not backing up.'] },
  backingUp: { default: ['Fine. I’ll back up.'], cocky: ['Ugh. Fine.'] },
  deadEnd: { default: ['Dead end.', 'Well this goes nowhere.'], cocky: ['Who builds a road that goes nowhere?'] },
  turningAround: { default: ['Turning round.', 'Right. Three-point turn.'], nervous: ['Oh, a three-point turn. Great.'] },
  hesitate: { default: ['Is it clear?', 'OK... OK...'], nervous: ['Should I go?', 'I’m not sure.', 'Is that car stopping?'] },
  cocky: { cocky: ['I’ve got this.', 'Plenty of room.'] },
  parkStart: { default: ['Park here? Right.', 'In there? OK.'], nervous: ['In THAT?', 'That’s tiny.'], cocky: ['Easy. Watch this.'], oldhand: ['Right, nice and slow.'] },
  parkDone: { default: ['There.', 'That’ll do.'], nervous: ['Is that OK? Is it in?'], cocky: ['Perfect. Obviously.'], oldhand: ['Lovely.'] },
  parkBad: { default: ['Hm. Not great.'], cocky: ['That’s in.'], nervous: ['That’s terrible, isn’t it.'] },
  noPark: { default: ['Park where?', 'There’s nowhere to park here.'] },
  arrive: { default: ['This one? Yellow door?', 'Is this it?'], cocky: ['Here we are then.'] },
  shutdown: { default: ['Handbrake. Engine off. Done.'], nervous: ['We made it. We actually made it.'], cocky: ['Told you.'], oldhand: ['Safe and sound.'] },
  wrongTurnNoCmd: { default: ['You didn’t say!', 'Well you didn’t tell me.'] },
  wrongTurnLate: { default: ['You left that a bit late.', 'Bit more notice next time.'] },
  wrongTurnOld: { default: ['You said that ages ago.', 'I forgot, alright?'] },
  wrongTurnMine: { default: ['That one’s on me.', 'I thought you meant the next one.'], cocky: ['Scenic route.'] },
  wrongTurnYours: { default: ['You said left!', 'You said right!'] },
  blameShout: { default: ['You were shouting at me.', 'That’s because you were shouting.'], cocky: ['Wasn’t helping, the shouting.'] },
  blameSelf: { default: ['That one’s on me.', 'My fault.'], nervous: ['That was me. Sorry.'], cocky: ['Car’s fault, that.'] },
  blameLate: { default: ['You told me too late.'], cocky: ['Bit late with that, weren’t you.'] },
  blameCommand: { default: ['You told me to!', 'You said go!'] },
  careful: { default: ['Careful. Yep.'], cocky: ['I am being careful.'], nervous: ['I’m always careful.'] },
  goForIt: { default: ['Right!'], nervous: ['Are you sure?'], cocky: ['Now we’re talking.'] },
  reverse: { default: ['Backing up.', 'Reverse. OK.'] },
  pullOver: { default: ['Pulling over.'] },
  stopping: { default: ['Stopping.'], nervous: ['Stopping! Stopping.'] },
  stressHigh: { default: ['Can everyone just... be quiet a sec.'], nervous: ['I need a minute.'], cocky: ['Bit much, this.'] },
  stressDown: { default: ['Right. Better.'] },
  hillStart: { nervous: ['I hate hills.'], cocky: ['Hill start. Easy.'], default: ['Hill start. Great.'] },
};

const counters = new Map();
export function line(key, personality) {
  const set = L[key];
  if (!set) return null;
  const list = set[personality] || set.default || set[Object.keys(set)[0]];
  if (!list || !list.length) return null;
  const k = key + ':' + personality;
  const i = counters.get(k) || 0;
  counters.set(k, i + 1);
  return list[i % list.length];
}
export function resetLines() { counters.clear(); }
export { L as LINES };
