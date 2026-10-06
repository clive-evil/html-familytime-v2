#!/usr/bin/env node
/*
 * Pull real Chaos World art out of the existing Battle Lab into ./assets so build.js embeds it.
 * READ-ONLY on the Battle Lab folder — it only copies files out.
 *
 *   node tools/import-battlelab-assets.js "C:\AI-Prototypes\ChaosWorld-BattleLab" --dry   (preview)
 *   node tools/import-battlelab-assets.js "C:\AI-Prototypes\ChaosWorld-BattleLab"         (copy)
 *   node build.js
 *
 * Matching is by filename keywords. To pin a slot to a specific file, create assets/map.json:
 *   { "boss": "art/bosses/lava_dragon_idle.png", "portrait_scrub": "ui/portraits/scrub.png" }
 * (paths relative to the Battle Lab root). Sprites should be single, bottom-anchored characters
 * facing RIGHT; sprite sheets need a manual crop first.
 */
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
const dry = process.argv.includes('--dry');
if (!src || !fs.existsSync(src)) { console.error('Usage: node tools/import-battlelab-assets.js <BattleLabFolder> [--dry]'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'assets');
const IMG = /\.(png|webp|jpe?g)$/i;
const PORTRAIT = /(portrait|avatar|icon|face|head|thumb|card)/i;

// slot: [must-match regex, optional exclude regex]
const RULES = {
  scrub: [/scrub/i, PORTRAIT], archer: [/archer|ranger/i, PORTRAIT], knight: [/knight|paladin/i, PORTRAIT],
  hexa: [/mage|witch|wizard|hexa|sorc/i, PORTRAIT],
  boss: [/boss|dragon|magma|lava|hellhound|hound|beast|behemoth/i, PORTRAIT],
  hunter: [/hunter|pursuer|reaper|demon_?lord|executioner|hell/i, PORTRAIT],
  slime: [/slime|blob/i, PORTRAIT], goblin: [/goblin/i, PORTRAIT], skeleton: [/skel/i, PORTRAIT],
  imp: [/imp\b|imp_|devil/i, PORTRAIT], brute: [/ogre|brute|troll|orc/i, PORTRAIT],
  portrait_scrub: [/scrub.*(portrait|avatar|icon|face|head)|(portrait|avatar|icon|face|head).*scrub/i],
  portrait_archer: [/archer.*(portrait|avatar|icon|face)|(portrait|avatar|icon|face).*archer/i],
  portrait_knight: [/knight.*(portrait|avatar|icon|face)|(portrait|avatar|icon|face).*knight/i],
  portrait_hexa: [/(mage|witch|wizard|hexa).*(portrait|avatar|icon|face)|(portrait|avatar|icon|face).*(mage|witch|wizard|hexa)/i],
  portrait_boss: [/(boss|dragon|magma|hound|beast).*(portrait|avatar|icon|face)/i],
  portrait_hunter: [/(hunter|reaper|demon).*(portrait|avatar|icon|face)/i],
  bg_mode1: [/(bg|background|arena|battlefield).*(lava|hell|volcan|fire|arena)|(lava|hell|volcan).*(bg|background)/i],
  bg_mode2: [/(bg|background|road|path|corridor|dungeon)/i],
};

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (!/node_modules|\.git|dist/i.test(f.name)) walk(p); }
    else if (IMG.test(f.name)) files.push(p);
  }
})(src);
console.log(`Scanned ${files.length} image(s) in ${src}`);

let manual = {};
const mapFile = path.join(OUT, 'map.json');
if (fs.existsSync(mapFile)) manual = JSON.parse(fs.readFileSync(mapFile, 'utf8'));

const chosen = {};
for (const slot of Object.keys(RULES)) {
  if (manual[slot]) { chosen[slot] = path.join(src, manual[slot]); continue; }
  const [must, not] = RULES[slot];
  const cands = files.filter((f) => { const rel = path.relative(src, f); return must.test(rel) && !(not && not.test(path.basename(f))); });
  if (!cands.length) continue;
  // prefer larger files (more likely to be full art than tiny icons) and names with idle/main
  cands.sort((a, b) => (/idle|main|base|default/i.test(b) - /idle|main|base|default/i.test(a)) || fs.statSync(b).size - fs.statSync(a).size);
  chosen[slot] = cands[0];
}
if (!dry) fs.mkdirSync(OUT, { recursive: true });
for (const slot of Object.keys(RULES)) {
  const f = chosen[slot];
  console.log(`${slot.padEnd(16)} ${f ? path.relative(src, f) : '(none found — procedural art stays)'}`);
  if (f && !dry) fs.copyFileSync(f, path.join(OUT, slot + path.extname(f).toLowerCase()));
}
console.log(dry ? '\nDry run — nothing copied.' : `\nCopied ${Object.keys(chosen).length} file(s) into assets/. Now run: node build.js`);
