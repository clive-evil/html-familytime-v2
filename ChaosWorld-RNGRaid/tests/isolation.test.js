// QA #30: this prototype must not touch anything outside ChaosWorld-RNGRaid/ (incl. any ChaosWorld-BattleLab copy).
const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const path = require('path');
const sh = (c) => execSync(c, { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).replace(/\s+$/, ''); // keep porcelain's leading status columns
const FOLDER = 'ChaosWorld-RNGRaid/';

function changedFiles() {
  let base = '';
  for (const ref of ['origin/main', 'main']) { try { base = sh(`git merge-base HEAD ${ref}`); break; } catch (e) { /* try next */ } }
  const committed = base ? sh(`git diff --name-only ${base} HEAD`).split('\n') : [];
  const working = sh('git status --porcelain --untracked-files=all').split('\n').map((l) => l.slice(3).replace(/^"|"$/g, ''));
  return [...new Set([...committed, ...working].filter(Boolean))];
}

test('30a every change lives inside ChaosWorld-RNGRaid/', () => {
  const outside = changedFiles().filter((f) => !f.startsWith(FOLDER));
  assert.deepEqual(outside, [], 'files changed outside the new prototype folder');
});

test('30b ChaosWorld-BattleLab (if present in this repo) is untouched', () => {
  const tracked = sh('git ls-files').split('\n');
  const battleLab = tracked.filter((f) => /(^|\/)ChaosWorld-BattleLab\//i.test(f));
  const touched = changedFiles().filter((f) => /(^|\/)ChaosWorld-BattleLab\//i.test(f));
  assert.deepEqual(touched, []);
  if (!battleLab.length) console.log('# note: no ChaosWorld-BattleLab folder exists in this repository — nothing to modify.');
});

test('30c the prototype never references files outside its own folder', () => {
  const fs = require('fs');
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(!m[1].startsWith('..') && !/^https?:/.test(m[1]), 'external/parent reference: ' + m[1]);
    assert.ok(fs.existsSync(path.join(root, m[1])), 'missing file ' + m[1]);
  }
  for (const f of fs.readdirSync(path.join(root, 'js'))) {
    const src = fs.readFileSync(path.join(root, 'js', f), 'utf8');
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(src), `${f} references a remote URL`);
    assert.ok(!/fetch\(|XMLHttpRequest|import\(/.test(src), `${f} makes network/module requests`);
  }
});
