const CW = require('./load-core')();
const runs = 60;
const [hp, atk] = process.argv.slice(2).map(Number);
CW.BATTLE.enemyHpScale = hp; CW.BATTLE.enemyAtkScale = atk;
function rate(pot, force){ let w=0,t=0; for(let i=0;i<runs;i++){ const L=new CW.Lobby({seed:1000+i,debug:{forceRarity:force||null,forceRarityBots:!!force}}); L.skipToBattle(); const b=new CW.Battle({party:L.partySpec(),seed:5000+i,mods:CW.raidMods(pot),biome:CW.BIOMES[i%3],autoHuman:true}); const r=b.runToEnd(); if(r.won)w++; t+=r.time;} return `${Math.round(100*w/runs)}%/${Math.round(t/runs)}s`; }
console.log(hp,atk,'rnd1',rate(100),'rnd1.5',rate(150),'rnd2',rate(200),'com1',rate(100,'common'),'com2',rate(200,'common'),'leg2',rate(200,'legendary'), 'epic1.5', rate(150,'epic'));
