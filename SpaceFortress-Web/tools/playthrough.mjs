// Plays the whole campaign through the real UI event path (no direct state pokes except the bot helper for weapon choice).
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const url = 'file://' + process.cwd() + '/dist/SpaceFortress.html';
const errs = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.goto(url + '?seed=5');
await page.waitForFunction(() => window.SF && window.SF.ui);
await page.click('#t-skip');
await page.waitForFunction(() => window.SF.game);
// Use the bot for decisions but route FIRING through the UI's auto path so the full render/FX/impact pipeline runs.
const summary = await page.evaluate(async () => {
  const SF = window.SF, UI = SF.ui, G = SF.game;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const settle = async () => { for (let i = 0; i < 40 && UI.busy; i++) await sleep(50); };
  SF.stations.current = 'tactical'; SF.stations.trans = null; SF.stations.applyDOM();
  let guard = 0;
  while (!G.over && guard++ < 400) {
    const sys = SF.curSys(G);
    for (const p of sys.planets) { if (!p.scanned && p.owner === 'enemy') SF.scan(G, p.id); if (p.owner === 'neutral') SF.claim(G, p.id); }
    for (const u of ['rail_caps','troop_bay','laser_unlock','fort_reactor','mis_smart','def_pd','rail_heavy','fort_modules','troop_pods','laser_cool','rail_twin','def_armour','mis_nuke','fort_pk'])
      if (SF.upgradeState(G, u) === 'available' && G.res.metals - (SF.UPGRADES[u].cost.metals||0) > 20) SF.buyUpgrade(G, u);
    // fire a few shots this cycle via the UI path
    let shots = 0;
    for (const fl of sys.fleets.slice()) { if (SF.canFire(G,'railgun','kinetic','fleet:'+fl.id).ok){ UI.selectedFleet=fl.id; UI.selected=null; UI.weapon='railgun'; UI.fireAuto(); await settle(); } }
    for (let n=0;n<6;n++){
      const enemies = SF.enemyWorlds(G).filter(p=>!SF.troopsOnSurface(G,p.id) && SF.invasionForecast(G,p.id,G.troops).chance<0.9);
      let best=null;
      for(const p of enemies) for(const w of SF.WEAPON_ORDER) for(const a of Object.keys(SF.WEAPONS[w].ammo)){
        if(a==='nuke')continue; const i=p.insts.filter(x=>x.hp>0&&SF.INST[x.type].mil)[0]; if(!i)continue;
        if(!SF.canFire(G,w,a,p.id,i.id).ok)continue; const pv=SF.attackPreview(G,w,a,p.id,i.id,null);
        const s=pv.land*Math.min(pv.frac,1.2)-pv.collat*0.4-(SF.INST[i.type].armor==='hardened'&&a!=='buster'?1:0);
        if(!best||s>best.s)best={s,w,a,pid:p.id,iid:i.id};
      }
      if(!best||best.s<0.2)break;
      UI.selected=best.pid; UI.selectedInst=best.iid; UI.selectedFleet=null; UI.weapon=best.w; UI.ammo[best.w]=best.a;
      UI.fireAuto(); shots++; await settle();
    }
    for (const p of SF.enemyWorlds(G).filter(p=>!SF.troopsOnSurface(G,p.id))) { const t=SF.suggestTroops(G,p.id,0.85); if(SF.invasionForecast(G,p.id,t).chance>=0.8 && t<=G.troops) SF.deploy(G,p.id,t); }
    if (SF.canJump(G)) { SF.jump(G); SF.stations.current='tactical'; SF.stations.trans=null; await sleep(60); continue; }
    SF.endCycle(G); await sleep(60);
    if (UI.modal==='report'){ UI.closeModal(); }
  }
  const s = SF.score(G);
  return { over: G.over, sys: G.sysIndex+1, cycles: s.cycles, worlds: s.worlds, income: s.income, hull: Math.round(G.fort.hull), troopsLost: s.troopsLost };
});
console.log('PLAYTHROUGH:', JSON.stringify(summary));
console.log('ERRORS:', errs.length ? '\n'+errs.slice(0,8).join('\n') : 'none');
await browser.close();
process.exit(errs.length || summary.over!=='win' ? 1 : 0);
