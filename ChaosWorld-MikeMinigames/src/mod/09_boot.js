/* ==========================================================================
   GAME shell — routes engine hooks / input to the active screen, boots the mod.
   ========================================================================== */
const Game = {
  screen: null, errors: [],
  err(e) { this.errors.push(String((e && e.stack) || e)); console.error(e); },
  setScreen(s) {
    if (this.screen && this.screen.exit) this.screen.exit();
    this.screen = s;
    if (s && s.enter) s.enter();
  },
  call(fn, ...a) { const s = this.screen; return s && typeof s[fn] === 'function' ? s[fn](...a) : undefined; },
  update(dt) { if (dt > 0) this.call('update', dt); },
  postHud() { this.call('postHud'); },
  drawGround(ctx) { this.call('drawGround', ctx); },
  drawWorld(ctx) { this.call('drawWorld', ctx); },
  drawOverhead(ctx) { this.call('drawOverhead', ctx); },
  onSkill(i) { this.call('onSkill', i); },
  onUlt() { this.call('onUlt'); },
  ultReady() { return !!this.call('ultReady'); },
  onWorldTap(x, y) { return !!this.call('onWorldTap', x, y); },
  onKey(k, e) {
    if (k === 'Escape' && this.screen && this.screen.name !== 'menu') { Main.toMenu(); return true; }
    return !!this.call('onKey', k, e);
  },
};

function boot() {
  if (!E.ready()) { setTimeout(boot, 50); return; }
  Save.load();
  E.init();
  Main.init();
  window.CW = { Game, E, Save, S, M1: typeof M1 !== 'undefined' ? M1 : null, M2: typeof M2 !== 'undefined' ? M2 : null, Main };
  window.__cwReady = true;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
