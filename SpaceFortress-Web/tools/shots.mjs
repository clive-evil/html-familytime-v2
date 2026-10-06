import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('docs/screenshots', { recursive: true });
const url = 'file://' + process.cwd() + '/dist/SpaceFortress.html';
const browser = await chromium.launch();
async function shot(name, w, h, fn){ const p=await browser.newPage({viewport:{width:w,height:h}}); await p.goto(url+'?seed=5'); await p.waitForFunction(()=>window.SF&&window.SF.ui); await p.waitForTimeout(100); await fn(p); await p.waitForTimeout(700); await p.screenshot({path:'docs/screenshots/'+name+'.jpg'}); await p.close(); }
// 1. Title
await shot('01-title',1600,900, async(p)=>{ await p.waitForTimeout(500); });
// 2. Command panel on a shielded world (system 2)
await shot('02-command',1600,900, async(p)=>{
  await p.click('#t-skip'); await p.waitForFunction(()=>window.SF.game); await p.waitForTimeout(550);
  await p.evaluate(()=>{const SF=window.SF,G=SF.game; while(G.sysIndex<1){for(const pl of SF.curSys(G).planets)if(pl.owner==='enemy')pl.owner='player';SF.curSys(G).fleets=[];SF.jump(G);} SF.scan(G,'meridian'); SF.main.select({kind:'planet',id:'meridian'}); SF.ui.afterAction();});
  await p.waitForTimeout(1400);
});
// 3. Weapon dock preview with a target installation selected
await shot('03-targeting',1600,900, async(p)=>{
  await p.click('#t-skip'); await p.waitForFunction(()=>window.SF.game); await p.waitForTimeout(550);
  await p.evaluate(()=>{const SF=window.SF,G=SF.game; while(G.sysIndex<1){for(const pl of SF.curSys(G).planets)if(pl.owner==='enemy')pl.owner='player';SF.curSys(G).fleets=[];SF.jump(G);} SF.scan(G,'meridian'); const sh=SF.planet(G,'meridian').insts.find(i=>i.type==='shield'); SF.ui.selected='meridian'; SF.ui.selectedInst=sh.id; SF.ui.weapon='railgun'; SF.render.focusOn(G,'meridian'); SF.ui.afterAction();});
  await p.waitForTimeout(1600);
});
// 4. Manual railgun
await shot('04-manual-railgun',1600,900, async(p)=>{
  await p.click('#t-skip'); await p.waitForFunction(()=>window.SF.game); await p.waitForTimeout(550);
  await p.evaluate(()=>{const SF=window.SF,G=SF.game;SF.scan(G,'varn');const b=SF.planet(G,'varn').insts.find(i=>i.type==='barracks');SF.ui.selected='varn';SF.ui.selectedInst=b.id;SF.ui.weapon='railgun';SF.ui.openManual();});
  await p.waitForTimeout(600);
});
// 5. Planet killer
await shot('05-planet-killer',1600,900, async(p)=>{
  await p.click('#t-skip'); await p.waitForFunction(()=>window.SF.game); await p.waitForTimeout(550);
  await p.evaluate(()=>{const SF=window.SF,G=SF.game; while(G.sysIndex<SF.CAMPAIGN.length-1){for(const pl of SF.curSys(G).planets)if(pl.owner==='enemy')pl.owner='player';SF.curSys(G).fleets=[];SF.jump(G);} G.res={metals:999,fissile:999,crystals:999,exotic:999}; for(const u of['fort_reactor','fort_modules','fort_pk'])SF.buyUpgrade(G,u); G.fort.power=SF.powerMax(G); SF.ui.selected='aeternum'; SF.pkMode.open('aeternum');});
  await p.waitForTimeout(600);
});
// 6. Fortress engineering
await shot('06-fortress',1600,900, async(p)=>{
  await p.click('#t-skip'); await p.waitForFunction(()=>window.SF.game); await p.waitForTimeout(550);
  await p.evaluate(()=>{const SF=window.SF,G=SF.game;G.res={metals:400,fissile:120,crystals:120,exotic:40};for(const u of['rail_caps','rail_heavy','laser_unlock','troop_bay','fort_reactor','def_pd'])SF.buyUpgrade(G,u);SF.ui.openFortress();});
  await p.waitForTimeout(600);
});
// 7. Tutorial
await shot('07-tutorial',1600,900, async(p)=>{
  await p.click('#t-new'); await p.waitForFunction(()=>window.SF.game&&window.SF.game.tutorial.active);
  await p.waitForTimeout(1200);
});
// 8. Smaller laptop resolution — system overview
await shot('08-laptop-1366',1366,768, async(p)=>{
  await p.click('#t-skip'); await p.waitForFunction(()=>window.SF.game); await p.waitForTimeout(550);
  await p.evaluate(()=>{const SF=window.SF,G=SF.game;while(G.sysIndex<2){for(const pl of SF.curSys(G).planets)if(pl.owner==='enemy')pl.owner='player';SF.curSys(G).fleets=[];SF.jump(G);}for(const pl of SF.curSys(G).planets)SF.scan(G,pl.id);SF.render.focusOn(G,null);SF.render.snap();SF.ui.afterAction();});
  await p.waitForTimeout(1200);
});
console.log('shots written');
await browser.close();
