import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('shots', { recursive: true });
const url = 'file://' + process.cwd() + '/dist/SpaceFortress.html';
const errs = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type()==='error') errs.push(m.text()); });
await page.goto(url + '?seed=5');
await page.waitForFunction(() => window.SF && window.SF.ui);
await page.click('#t-new'); // with training
await page.waitForFunction(() => window.SF.game && window.SF.game.tutorial.active);
await page.waitForTimeout(1000);
const steps = [];
async function stepId(){ return page.evaluate(()=>window.SF.TUTORIAL[window.SF.game.tutorial.step].id); }
steps.push('start:'+await stepId());
await page.screenshot({ path: 'shots/08-tutorial-start.png' });
// drive tutorial via real-ish actions
await page.evaluate(()=>window.SF.main.select({kind:'planet',id:'varn'}));
await page.waitForTimeout(300); steps.push('afterSelect:'+await stepId());
await page.evaluate(()=>{window.SF.scan(window.SF.game,'varn');window.SF.ui.afterAction();});
await page.waitForTimeout(300); steps.push('afterScan:'+await stepId());
await page.evaluate(()=>{const G=window.SF.game;const c=window.SF.planet(G,'varn').insts.find(i=>i.type==='cannon');window.SF.ui.selectedInst=c.id;window.SF.ui.weapon='railgun';window.SF.ui.afterAction();});
await page.waitForTimeout(200); steps.push('afterTarget:'+await stepId());
// open manual, auto-complete a tutorial shot via guarantee
await page.evaluate(()=>window.SF.ui.openManual());
await page.waitForTimeout(300);
await page.evaluate(()=>{const G=window.SF.game;const c=window.SF.planet(G,'varn').insts.find(i=>i.type==='cannon');window.SF.ui.resolveShot('railgun','kinetic',{pid:'varn',iid:c.id},{manual:0.5,guarantee:true});window.SF.manual.forceClose();});
await page.waitForTimeout(400); steps.push('afterFire:'+await stepId());
// deploy
await page.evaluate(()=>{const G=window.SF.game;window.SF.ui.selected='varn';window.SF.deploy(G,'varn',window.SF.suggestTroops(G,'varn'));window.SF.ui.afterAction();});
await page.waitForTimeout(200); steps.push('afterDeploy:'+await stepId());
// end cycles until captured
for(let k=0;k<4;k++){ await page.evaluate(()=>window.SF.main.endCycle()); await page.waitForTimeout(300); await page.evaluate(()=>{if(window.SF.ui.modal==='report')window.SF.ui.closeModal();}); await page.waitForTimeout(200); if((await stepId())==='income')break; }
steps.push('afterCapture:'+await stepId());
await page.evaluate(()=>{const b=document.getElementById('tut-ack');if(b)b.click();});
await page.waitForTimeout(200); steps.push('afterAck:'+await stepId());
await page.evaluate(()=>{window.SF.buyUpgrade(window.SF.game,'rail_caps');window.SF.ui.afterAction();});
await page.waitForTimeout(200);
const done = await page.evaluate(()=>window.SF.game.tutorial.done);
console.log('STEPS:', steps.join('  '));
console.log('tutorial done:', done);
console.log('ERRORS:', errs.length?'\n'+errs.join('\n'):'none');
await browser.close();
process.exit(errs.length||!done?1:0);
