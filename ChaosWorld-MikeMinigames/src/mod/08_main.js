/* ==========================================================================
   MAIN — menu (live engine scene behind it), LAB panel, how-to, results.
   ========================================================================== */
const MenuScreen = {
  name: 'menu',
  enter() {
    E.takeover({ backdrop: 'arena', lava: 1, ui: { header: false, controls: false, diss: false, items: false, turnq: false } });
    E.hero('scrub', 330, 1000, {}); E.hero('knight', 200, 1120, {}); E.hero('ranger', 250, 870, {});
    const w = E.enemy('spireWarden', 820, 960, { scale: 1.7 }); w.data.noOverhead = true;
    this.t = 0;
    Main.showMenu();
  },
  exit() { E.menuRoot.innerHTML = ''; },
  update(dt) { this.t += dt; },
  drawWorld(ctx) { ctx.save(); ctx.globalAlpha = 0.9; E.L.gn(ctx, -150 + Math.sin(this.t * 0.6) * 20, 1000, 1.1, E.t, { frame: false, cards: false, grin: 0.7 }); ctx.restore(); },
  onKey(k) { if (k === '1') { Main.play(1); return true; } if (k === '2') { Main.play(2); return true; } return false; },
};

const Main = {
  init() { this.toMenu(); },
  play(n) { this.closeOverlays(); Game.setScreen(n === 1 ? M1 : M2); },
  toMenu() { this.closeOverlays(); Game.setScreen(MenuScreen); },
  closeOverlays() { $$('.cw-ov').forEach((o) => o.remove()); E.S.paused = false; },
  showMenu() {
    const b = Save.data.best;
    E.menuRoot.innerHTML = `
      <div class="cw-menu">
        <div class="tt-logo"><svg viewBox="0 0 64 64"><path d="M10 8 L20 22 Q32 14 44 22 L54 8 L56 30 Q58 50 32 58 Q6 50 8 30 Z" fill="#e8173a" stroke="#140818" stroke-width="3"/><circle cx="23" cy="34" r="6" fill="#140818"/><circle cx="41" cy="34" r="6" fill="#140818"/></svg>
          <h1 data-t="CHAOS WORLD">CHAOS WORLD</h1><h2><span>BATTLE EXPERIMENTS</span></h2><p>TWO NEW MODES · RUNNING ON THE BATTLE LAB ENGINE</p></div>
        <div class="cw-mode m1"><canvas width="960" height="360"></canvas><div class="md-tag">MODE 1 · CO-OP BOSS</div><div class="md-name">ROPE THE MONSTER</div>
          <div class="md-q">“Two rope. Two smash. Try not to get roasted.”</div><div class="md-best">${b.m1 ? 'BEST CLEAR ' + fmtTime(b.m1) : ''}</div><button class="big b-gold md-play"><i>🪢</i><b>PLAY</b></button></div>
        <div class="cw-mode m2"><canvas width="960" height="360"></canvas><div class="md-tag">MODE 2 · CHASE SURVIVAL</div><div class="md-name">HELL CHASE</div>
          <div class="md-q">“Fight forward. Keep whatever’s behind you... behind you.”</div><div class="md-best">${b.m2 ? 'BEST KILL ' + fmtTime(b.m2) : ''}</div><button class="big b-gold md-play"><i>🏃</i><b>PLAY</b></button></div>
        <div class="cw-mrow"><button class="big b-purple cw-how"><b>HOW TO PLAY</b></button><button class="big b-dark cw-reset"><b>RESET SAVE</b></button><button class="big b-dark cw-mlab"><b>🧪 LAB</b></button></div>
        <div class="cw-foot">Internal prototype · offline · Battle Lab art &amp; engine</div>
      </div>`;
    const [m1, m2] = $$('.cw-mode', E.menuRoot);
    press($('.md-play', m1), () => this.play(1)); press($('.md-play', m2), () => this.play(2));
    m1.addEventListener('click', (e) => { if (!e.target.closest('button')) this.play(1); });
    m2.addEventListener('click', (e) => { if (!e.target.closest('button')) this.play(2); });
    press($('.cw-how', E.menuRoot), () => this.howTo());
    press($('.cw-reset', E.menuRoot), () => { Save.reset(); E.syncMute(); E.toast('SAVE RESET', 1.2); this.showMenu(); });
    press($('.cw-mlab', E.menuRoot), () => this.lab());
    this.cardArt($('canvas', m1), 1); this.cardArt($('canvas', m2), 2);
  },
  /** paint mode-card art with the real Battle Lab rigs */
  cardArt(cv, n) {
    const x = cv.getContext('2d'), L = E.L;
    const bg = E.lavaBackdrop(n === 1 ? 'ruins' : 'arena', 1).bgImg;
    x.drawImage(bg, 0, 520, bg.width, bg.width * 0.375, 0, 0, 960, 360);
    x.fillStyle = 'rgba(20,6,24,0.25)'; x.fillRect(0, 0, 960, 360);
    const fig = (id, team, kind, px, py, sc, pose, face = 1) => {
      try {
        const f = new L.Kt('c' + id, id, team, kind, px, py, { hp: 1, atk: 1, def: 0, scale: sc, idle: 'idle', level: 1 });
        f.facing = face; if (pose) { f.pose = { ...L.M[pose] }; f.idlePose = L.M[pose]; } f.update(0.001);
        if (pose) f.pose = { ...L.M[pose] };
        f.draw(x, 1, team === 'hero' ? '#c9a0ff' : '#b36bff', {});
      } catch (e) { /* ignore */ }
    };
    if (n === 1) {
      fig('boss', 'enemy', 'skelElite', 720, 345, 1.25, 'heavyAntic', -1);
      fig('scrub', 'hero', 'scrub', 150, 300, 0.75, 'throwAntic'); fig('ranger', 'hero', 'ranger', 300, 345, 0.75, 'throwAntic');
      drawRope(x, 185, 205, 655, 330, { sag: 4, vib: 0 }); drawRope(x, 335, 250, 780, 335, { sag: 4, vib: 0 });
      wText(x, 'PULL!', 300, 70, 76, '#ff5ad8');
    } else {
      E.L.gn(x, 120, 230, 0.55, 0.4, { frame: false, cards: false, grin: 1 });
      fig('scrub', 'hero', 'scrub', 460, 330, 0.8, 'idleSword');
      fig('skel', 'enemy', 'skelGrunt', 700, 300, 0.7, null, -1); fig('fly', 'enemy', 'flySlime', 860, 250, 0.7, null, -1);
      ItemArt.card(x, 300, 120, 0.55, 'boulder', 'rare');
      wText(x, '+14m', 300, 205, 50, '#9aff6a'); wText(x, '126m', 130, 60, 56, '#ffd54a');
    }
  },
  overlay(cls) { const o = el('div', 'cw-ov lab-own ' + (cls || ''), E.S.stageEl); return o; },
  howTo() {
    const o = this.overlay('cw-how-ov');
    o.innerHTML = `<div class="cw-panel"><h2>HOW TO PLAY</h2>
      <h3>MODE 1 · ROPE THE MONSTER</h3><ul>
        <li><b>ROPERS</b> (big buttons, bottom left/right): a marker sweeps the bar — tap in the <b>GREEN</b> (yellow = PERFECT) to lasso a leg. One rope alone gets shaken off after 7s.</li>
        <li><b>BOTH ROPES SET → PULL!</b> Mash. Each side has its own meter. He only falls if <b>BOTH</b> max out at about the same time, before the <b>ROPE BURN</b> timer ends.</li>
        <li><b>STUNNED 4.5s</b> — attackers charge in, everything hits ×4. Fire <b>SLAM</b>, <b>METEOR</b>, <b>CHAOS BURST</b>. Outside the stun he's ARMORED.</li>
        <li>Red <b>!</b> = fireball on that hero · red zone = stomp on everyone. KO'd heroes get up after 10s or on a takedown.</li>
        <li><b>Keys:</b> A / L ropers · 1 2 attackers · 3 or SPACE burst · R restart · ESC menu</li></ul>
      <h3>MODE 2 · HELL CHASE</h3><ul>
        <li>Scrub auto-throws rocks. <b>TAP ENEMIES</b> to strike (or A). Skills <b>THROW · THRUST · SLASH</b> on 1 2 3. <b>CHAOS</b> (SPACE) when the meter is full.</li>
        <li>Kills roll <b>CHASE ITEMS</b> (common / rare / epic) that fly <b>back</b> at the Hell Hunter: damage, slow, stun, knockback.</li>
        <li><b>DISTANCE</b> is everything. Under 35m he's on screen and smashing you; at 0m you're caught. Knock him back to make him vanish.</li>
        <li><b>MANUAL</b> item mode: items wait in a 3-slot tray — fire with Q / W / E or tap.</li></ul>
      <h3>LAB</h3><p>The 🧪 LAB button holds speed, mute and per-mode tuning. R restarts instantly.</p>
      <button class="big b-gold cw-close"><b>GOT IT</b></button></div>`;
    press($('.cw-close', o), () => o.remove());
  },
  lab() {
    const ex = $('.cw-lab-ov'); if (ex) { ex.remove(); E.S.paused = false; return; }
    E.S.paused = true;
    const s = S(), o = this.overlay('cw-lab-ov');
    const row = (label, path, opts) => {
      const [g, k] = path.split('.'), cur = k ? s[g][k] : s[g];
      return `<div class="cw-lrow"><label>${label}</label><div class="cw-seg" data-path="${path}">${opts.map(([v, l]) => `<button data-v='${JSON.stringify(v)}' class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    };
    o.innerHTML = `<div class="cw-panel"><h2>🧪 LAB</h2>
      <h3>GLOBAL</h3>${row('SOUND', 'mute', [[false, 'ON'], [true, 'MUTED']])}${row('GAME SPEED', 'speed', [[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×']])}
      <h3>MODE 1 · ROPE THE MONSTER</h3>
      ${row('BOSS', 'm1.boss', [['spireWarden', 'WARDEN'], ['buffaloSkel', 'BUFFALO'], ['lavaLord', 'LAVA LORD'], ['neonLich', 'LICH']])}
      ${row('BOSS HP', 'm1.bossHp', [[0.5, '×0.5'], [1, '×1'], [2, '×2']])}
      ${row('ROPE BURN', 'm1.burn', [[3, '3.0s'], [3.8, '3.8s'], [5, '5.0s'], [6, '6.0s']])}
      ${row('PULL DIFFICULTY', 'm1.pullDiff', [[0.75, 'EASY'], [1, 'NORMAL'], [1.35, 'HARD']])}
      ${row('BOSS ATTACKS', 'm1.atkFreq', [[0.6, 'LOW'], [1, 'NORMAL'], [1.4, 'HIGH']])}
      ${row('ROPER 2', 'm1.partner', [['human', 'SOLO'], ['ai_ace', 'AI ACE'], ['ai_ok', 'AI OK'], ['ai_bad', 'SLOPPY']])}
      <h3>MODE 2 · HELL CHASE</h3>
      ${row('HUNTER SPEED', 'm2.hunterSpeed', [[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×']])}
      ${row('START DISTANCE', 'm2.startDist', [[80, '80m'], [120, '120m'], [160, '160m'], [200, '200m']])}
      ${row('ITEM DROPS', 'm2.dropRate', [[0.5, '×0.5'], [1, '×1'], [1.5, '×1.5'], [2, '×2']])}
      ${row('HUNTER HP', 'm2.hunterHp', [[0.5, '×0.5'], [1, '×1'], [1.5, '×1.5'], [2, '×2']])}
      ${row('CHASE ITEMS', 'm2.itemMode', [['auto', 'AUTO'], ['manual', 'MANUAL']])}
      <p class="cw-note">Boss / HP / start distance apply on restart. Everything else applies live.</p>
      <div class="cw-lact"><button class="big b-cyan cw-lr"><b>RESTART</b></button><button class="big b-dark cw-lm"><b>MENU</b></button><button class="big b-gold cw-lc"><b>CLOSE</b></button></div></div>`;
    $$('.cw-seg', o).forEach((sg) => {
      const [g, k] = sg.dataset.path.split('.');
      $$('button', sg).forEach((b) => press(b, () => {
        const v = JSON.parse(b.dataset.v); if (k) s[g][k] = v; else s[g] = v; Save.save();
        $$('button', sg).forEach((x) => x.classList.toggle('on', x === b));
        if (g === 'mute') E.syncMute();
        if (g === 'speed') E.S.timeScale = v;
        if (Game.screen === M1) M1.refreshPartnerUI();
        if (Game.screen === M2) M2.refreshModeUI();
      }));
    });
    const close = () => { o.remove(); E.S.paused = false; };
    press($('.cw-lr', o), () => { close(); if (Game.screen && Game.screen.reset) Game.screen.reset(true); });
    press($('.cw-lm', o), () => this.toMenu());
    press($('.cw-lc', o), close);
  },
  results(title, win, rows, extra, retry) {
    const o = this.overlay('cw-res-ov'); o.id = 'cw-results';
    o.innerHTML = `<div class="cw-rtitle ${win ? '' : 'lose'}" data-t="${title}">${title}</div>
      <div class="cw-panel"><div class="cw-rgrid">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>${extra || ''}</div>
      <div class="cw-lact"><button class="big b-gold cw-rr"><i>🔁</i><b>RETRY</b></button><button class="big b-dark cw-rm"><b>MENU</b></button></div>`;
    press($('.cw-rr', o), () => { o.remove(); retry(); });
    press($('.cw-rm', o), () => this.toMenu());
  },
};
