/* ==========================================================================
   MAIN — menu, how-to, LAB panel, boot
   ========================================================================== */
const MenuScreen = {
  name: 'menu',
  enter() {
    $('#menu').classList.remove('hidden');
    this.t = 0; this.drawCards();
    const b = Save.data.best;
    $('#best1').textContent = b.m1 ? 'BEST CLEAR ' + fmtTime(b.m1) : '';
    $('#best2').textContent = b.m2 ? 'BEST KILL ' + fmtTime(b.m2) : '';
  },
  exit() { $('#menu').classList.add('hidden'); },
  onKey(k) { if (k === '1') Main.play(1); if (k === '2') Main.play(2); },
  update(dt) { this.t += dt; if (Math.random() < 0.5) FX.burst(rand(0, W), H + 10, 1, { color: ['#ff6a13', '#ffd21f'], type: 'fire', grav: -80, spMin: 10, spMax: 40, lifeMin: 2, lifeMax: 4, sMin: 2, sMax: 5 }); },
  render(ctx) { FX.drawParts(ctx); },
  drawCards() {
    // Mode 1 scene: roped boss + heroes
    const c1 = $('#art1').getContext('2d'), w = 420, h = 190;
    c1.setTransform(1, 0, 0, 1, 0, 0); c1.clearRect(0, 0, w, h);
    c1.drawImage(arenaBackground(), 0, 230, W, 410, 0, 0, w, h * 1.0);
    c1.fillStyle = 'rgba(90,10,18,0.35)'; c1.fillRect(0, 0, w, h);
    const P = { lift: -8, rot: 0.02, jaw: 0.9, legLx: -30, legLy: 8, legRx: -24, legRy: 14, heat: 0.8, eyes: 'glow', ropedL: true, ropedR: true };
    c1.save(); c1.translate(300, 178); c1.scale(0.52, 0.52); drawBoss(c1, P, 1.3); c1.restore();
    const ank = (side) => { const [x, y] = bossAnkle(side, P); return [300 + x * 0.52, 178 + y * 0.52]; };
    const heroes = [['scrub', 70, 160], ['archer', 120, 182]];
    heroes.forEach(([id, x, y], i) => { const [ax, ay] = ank(i ? 'R' : 'L'); ropeLine(c1, x + 9, y - 32, ax, ay, 2, 0, 0.4, 0); });
    heroes.forEach(([id, x, y]) => drawHero(c1, id, x, y, 0.65, { pose: 'brace', strain: 1, t: 0.3 }));
    drawHero(c1, 'knight', 172, 190, 0.6, { pose: 'attack', p: 0.4 });
    for (let i = 0; i < 8; i++) { c1.fillStyle = i % 2 ? '#ffd21f' : '#ff6a13'; c1.beginPath(); c1.arc(210 + Math.random() * 60, 70 + Math.random() * 50, 3 + Math.random() * 5, 0, 7); c1.fill(); }
    outlinedText(c1, 'PULL!', 120, 70, 34, '#ff2e88');
    // Mode 2 scene: party running, hunter looming behind, item flying back
    const c2 = $('#art2').getContext('2d');
    c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, w, h);
    c2.save(); c2.translate(0, 0); c2.rotate(0); c2.drawImage(chaseTile(), 0, 200, W, 400, 0, 0, w, h); c2.restore();
    c2.fillStyle = 'rgba(40,10,60,0.35)'; c2.fillRect(0, 0, w, h);
    const g = c2.createLinearGradient(0, 0, 160, 0); g.addColorStop(0, 'rgba(255,0,20,0.55)'); g.addColorStop(1, 'rgba(255,0,20,0)'); c2.fillStyle = g; c2.fillRect(0, 0, 160, h);
    drawHunter(c2, 70, 290, 0.75, { punch: 0.6 }, 0.4);
    drawHero(c2, 'knight', 250, 168, 0.62, { pose: 'run', t: 0.1 });
    drawHero(c2, 'archer', 215, 182, 0.58, { pose: 'run', t: 0.4 });
    drawHero(c2, 'scrub', 285, 186, 0.58, { pose: 'run', t: 0.7 });
    [['skeleton', 360, 110], ['slime', 395, 140], ['imp', 330, 60]].forEach(([type, x, y]) => drawEnemy(c2, { type, def: ENEMY_DEF[type], x, y, seed: 1, scale: 0.75, flip: true }, 0.2));
    c2.save(); c2.translate(150, 70); c2.rotate(-0.3); poly(c2, [-26, -28, 26, -24, 24, 28, -26, 24], '#4aa8ff', 3); c2.drawImage(itemIcon('boulder'), -22, -22, 44, 44); c2.restore();
    outlinedText(c2, '+18m', 150, 120, 24, '#4fe03a');
    outlinedText(c2, '126m', 70, 170, 24, '#ffd21f');
  },
};

const Main = {
  init() {
    Save.load(); ART.init(); Input.init(); Game.init();
    press($('#play1'), () => this.play(1));
    press($('#play2'), () => this.play(2));
    $('#card1').addEventListener('click', (e) => { if (e.target.id !== 'play1') this.play(1); });
    $('#card2').addEventListener('click', (e) => { if (e.target.id !== 'play2') this.play(2); });
    press($('#btnHow'), () => this.howTo());
    press($('#btnReset'), () => { Save.reset(); Callout.show('SAVE RESET', 'teal low', 1.0); MenuScreen.enter(); });
    press($('#labBtn'), () => this.lab());
    this.toMenu();
    window.CW = { Game, M1, M2, Main, FX, Save, S, ART, Audio };
  },
  play(n) { this.closeOverlays(); Audio.play('click'); Game.setScreen(n === 1 ? M1 : M2); },
  toMenu() { this.closeOverlays(); Game.setScreen(MenuScreen); },
  closeOverlays() { $('#lab').classList.add('hidden'); $('#howto').classList.add('hidden'); $('#results').classList.add('hidden'); Game.paused = false; },
  howTo() {
    const el = $('#howto');
    el.innerHTML = `<div class="panel howto"><div class="panel-in">
      <h2>HOW TO PLAY</h2>
      <h3>MODE 1 · ROPE THE MONSTER</h3>
      <ul>
        <li><b>ROPERS (bottom left / right)</b> — a marker sweeps the bar. Tap when it's in the <b>GREEN</b> (yellow = PERFECT) to lasso a front leg. One rope alone gets shaken off after 7s.</li>
        <li><b>BOTH ROPES SET → PULL!</b> Mash both PULL buttons. Each side has its own meter. The boss only falls when <b>BOTH</b> sides max out at roughly the same time — before the <b>ROPE BURN</b> timer hits zero.</li>
        <li><b>STUNNED (4.5s)</b> — attackers charge in, everything does ×4. Fire <b>SLAM</b>, <b>METEOR</b> and <b>CHAOS BURST</b> now. Outside the stun he's ARMORED.</li>
        <li>Boss telegraphs: red <b>!</b> marker = fireball on one hero, red zone = stomp on everyone. KO'd heroes get back up after 10s or on a takedown.</li>
        <li><b>Keys:</b> A = Roper 1, L = Roper 2, 1/2 = attacker skills, 3 or SPACE = Chaos Burst, R = restart.</li>
      </ul>
      <h3>MODE 2 · HELL CHASE</h3>
      <ul>
        <li>The squad auto-attacks. <b>TAP ENEMIES</b> to strike (or A). Skills on <b>1 2 3</b>, <b>SPACE</b> = Rampage.</li>
        <li>Kills roll <b>CHASE ITEMS</b> (common / rare / epic) that fire <b>backward</b> at the Hell Hunter: damage, slow, stun, knockback.</li>
        <li><b>DISTANCE</b> is everything. Under 35m he's on screen and smashing you. At 0m you're caught. Knock him back to make him vanish again.</li>
        <li>Win by killing the Hunter with items. Lose if caught or your squad HP hits zero.</li>
        <li><b>MANUAL</b> item mode (intro screen or LAB): items wait in a 3-slot tray — fire with Q / W / E or tap.</li>
      </ul>
      <h3>LAB</h3>
      <p>The small LAB button (top-right) holds speed, mute and per-mode tuning. Restart is instant: R key or RETRY.</p>
      <div class="lab-actions"><button class="btn btn-play" id="howClose">GOT IT</button></div>
    </div></div>`;
    el.classList.remove('hidden');
    press($('#howClose'), () => el.classList.add('hidden'));
  },
  lab() {
    const el = $('#lab');
    if (!el.classList.contains('hidden')) { el.classList.add('hidden'); Game.paused = false; return; }
    Game.paused = true;
    const s = S();
    const seg = (path, opts) => {
      const [grp, key] = path.split('.'); const cur = key ? s[grp][key] : s[grp];
      return `<div class="seg" data-path="${path}">${opts.map(([v, l]) => `<button data-v='${JSON.stringify(v)}' class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    };
    const row = (label, path, opts) => `<div class="lab-row"><label>${label}</label>${seg(path, opts)}</div>`;
    el.innerHTML = `<div class="panel"><div class="panel-in">
      <h2>LAB</h2>
      <h3>GLOBAL</h3>
      ${row('SOUND', 'mute', [[false, 'ON'], [true, 'MUTED']])}
      ${row('GAME SPEED', 'speed', [[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×']])}
      <h3>MODE 1 · ROPE THE MONSTER</h3>
      ${row('BOSS HP', 'm1.bossHp', [[0.5, '×0.5'], [1, '×1'], [2, '×2']])}
      ${row('ROPE BURN TIME', 'm1.burn', [[3, '3.0s'], [3.8, '3.8s'], [5, '5.0s'], [6, '6.0s']])}
      ${row('PULL DIFFICULTY', 'm1.pullDiff', [[0.75, 'EASY'], [1, 'NORMAL'], [1.35, 'HARD']])}
      ${row('BOSS ATTACK FREQ', 'm1.atkFreq', [[0.6, 'LOW'], [1, 'NORMAL'], [1.4, 'HIGH']])}
      ${row('ROPER 2', 'm1.partner', [['human', 'SOLO'], ['ai_ace', 'AI ACE'], ['ai_ok', 'AI OK'], ['ai_bad', 'SLOPPY']])}
      <h3>MODE 2 · HELL CHASE</h3>
      ${row('HUNTER SPEED', 'm2.hunterSpeed', [[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×']])}
      ${row('START DISTANCE', 'm2.startDist', [[80, '80m'], [120, '120m'], [160, '160m'], [200, '200m']])}
      ${row('ITEM DROP RATE', 'm2.dropRate', [[0.5, '×0.5'], [1, '×1'], [1.5, '×1.5'], [2, '×2']])}
      ${row('HUNTER HP', 'm2.hunterHp', [[0.5, '×0.5'], [1, '×1'], [1.5, '×1.5'], [2, '×2']])}
      ${row('CHASE ITEMS', 'm2.itemMode', [['auto', 'AUTO'], ['manual', 'MANUAL']])}
      <div class="lab-note">Boss HP / Hunter HP / start distance apply on restart. Everything else applies live.</div>
      <div class="lab-actions">
        <button class="btn btn-small btn-teal" id="labRestart">RESTART</button>
        <button class="btn btn-small btn-dark" id="labMenu">MAIN MENU</button>
        <button class="btn btn-small" id="labClose">CLOSE</button>
      </div>
    </div></div>`;
    el.classList.remove('hidden');
    $$('.seg', el).forEach((sg) => {
      const [grp, key] = sg.dataset.path.split('.');
      $$('button', sg).forEach((b) => press(b, () => {
        const v = JSON.parse(b.dataset.v);
        if (key) s[grp][key] = v; else s[grp] = v;
        Save.save();
        $$('button', sg).forEach((x) => x.classList.toggle('on', x === b));
        if (Game.screen === M1) M1.refreshPartnerUI();
        if (Game.screen === M2) M2.refreshModeUI();
      }));
    });
    press($('#labRestart'), () => { el.classList.add('hidden'); Game.paused = false; if (Game.screen && Game.screen.reset) Game.screen.reset(true); });
    press($('#labMenu'), () => this.toMenu());
    press($('#labClose'), () => { el.classList.add('hidden'); Game.paused = false; });
  },
};

window.addEventListener('error', (e) => { Game.errors.push(String(e.message)); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Main.init()); else Main.init();
