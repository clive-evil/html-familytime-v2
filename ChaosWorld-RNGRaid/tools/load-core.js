// Loads the browser-global core scripts into Node (used by tests + sim tools).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const FILES = ['config.js', 'rng.js', 'vote-core.js', 'lobby-core.js', 'battle-core.js', 'battle-race.js', 'save.js'];
module.exports = function loadCore() {
  delete globalThis.CW;
  for (const f of FILES) {
    const p = path.join(__dirname, '..', 'js', f);
    if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
  }
  return globalThis.CW;
};
