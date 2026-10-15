// Canonical passenger commands + a deliberately small phrase parser.
// No AI: a fixed vocabulary mapped to canonical commands.

export const CMD = {
  LEFT: 'LEFT', RIGHT: 'RIGHT', STRAIGHT: 'STRAIGHT',
  GO: 'GO', STOP: 'STOP', SLOWER: 'SLOWER', FASTER: 'FASTER', BRAKE: 'BRAKE', REVERSE: 'REVERSE',
  CAREFUL: 'CAREFUL', GO_FOR_IT: 'GO_FOR_IT', WAIT: 'WAIT', PULL_OVER: 'PULL_OVER',
  PARK: 'PARK', TURN_AROUND: 'TURN_AROUND',
};

export const LABEL = {
  LEFT: 'LEFT', RIGHT: 'RIGHT', STRAIGHT: 'STRAIGHT ON', GO: 'GO', STOP: 'STOP', SLOWER: 'SLOW DOWN',
  FASTER: 'SPEED UP', BRAKE: 'BRAKE!', REVERSE: 'REVERSE', CAREFUL: 'CAREFUL', GO_FOR_IT: 'GO FOR IT',
  WAIT: 'WAIT', PULL_OVER: 'PULL OVER', PARK: 'PARK HERE', TURN_AROUND: 'TURN AROUND',
};

// Phrases are matched as whole words after normalisation. Longer phrases win.
const PHRASES = [
  ['TURN_AROUND', ['turn around', 'turn round', 'u turn', 'u-turn', 'go back', 'wrong way', 'three point turn', 'turn it around']],
  ['PULL_OVER', ['pull over', 'pull in', 'pull up', 'stop at the side', 'side of the road']],
  ['GO_FOR_IT', ['go for it', 'floor it', 'put your foot down', 'send it', 'gun it']],
  ['CAREFUL', ['careful', 'be careful', 'carefully', 'easy', 'take it easy', 'gently', 'steady', 'watch it', 'watch out', 'mind']],
  ['REVERSE', ['reverse', 'back up', 'back it up', 'go back a bit', 'backwards', 'back a bit', 'back']],
  ['PARK', ['park', 'park here', 'park it', 'park up', 'in there', 'parking']],
  ['LEFT', ['left', 'turn left', 'go left', 'take a left', 'hang a left', 'next left', 'left here', 'take the left', 'to the left', 'bear left']],
  ['RIGHT', ['right', 'turn right', 'go right', 'take a right', 'hang a right', 'next right', 'right here', 'take the right', 'to the right', 'bear right']],
  ['STRAIGHT', ['straight', 'straight on', 'go straight', 'straight ahead', 'keep going', 'carry on', 'ahead', 'forward', 'forwards', 'keep straight']],
  ['SLOWER', ['slow', 'slow down', 'slower', 'ease off', 'not so fast', 'too fast', 'slow it down', 'calm down']],
  ['FASTER', ['faster', 'speed up', 'quicker', 'hurry', 'hurry up', 'get a move on', 'come on', 'more', 'accelerate', 'too slow']],
  ['BRAKE', ['brake', 'brakes', 'emergency', 'whoa', 'woah', 'look out']],
  ['STOP', ['stop', 'halt', 'hold it', 'stop here', 'stop the car', 'pull up here']],
  ['WAIT', ['wait', 'hang on', 'hold on', 'not yet', 'wait a sec', 'give way']],
  ['GO', ['go', 'drive', 'off you go', 'move', 'lets go', 'pull away', 'yes', 'now', 'you can go', 'clear']],
];

const COMPILED = PHRASES.flatMap(([cmd, list]) => list.map((p) => ({ cmd, words: p.split(' '), len: p.length })))
  .sort((a, b) => b.words.length - a.words.length || b.len - a.len);

export function normalise(text) {
  return String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z\- ]+/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns { commands: [CMD...], repeats } — every command found in order.
// "left left left" → [LEFT, LEFT, LEFT] (each is a repetition, which raises urgency).
export function parsePhrase(text) {
  let words = normalise(text).split(' ').filter(Boolean);
  // strip the driver's name and filler
  const FILLER = new Set(['dave', 'davey', 'mate', 'please', 'ok', 'okay', 'just', 'now', 'the', 'oi', 'um', 'er', 'erm', 'right then', 'so', 'and', 'then', 'a', 'it', 'here', 'quick', 'quickly', 'mate']);
  const out = [];
  let i = 0;
  while (i < words.length) {
    let hit = null;
    for (const p of COMPILED) {
      if (p.words.every((w, k) => words[i + k] === w)) { hit = p; break; }
    }
    if (hit) {
      // "right" used as filler at the very start ("right, left at the end") is ambiguous; keep it — players learn.
      out.push(hit.cmd);
      i += hit.words.length;
    } else {
      // single filler words that weren't part of a phrase (e.g. "now", "here") are dropped
      void FILLER;
      i += 1;
    }
  }
  return { commands: out };
}

// Convenience: the single most relevant command (last spoken wins), or null.
export function parseCommand(text) {
  const { commands } = parsePhrase(text);
  return commands.length ? commands[commands.length - 1] : null;
}
