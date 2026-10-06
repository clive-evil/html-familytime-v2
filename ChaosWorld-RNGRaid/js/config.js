/* ChaosWorld RNG Raid — ALL tuning + content data lives here.
 * Plain script (no modules) so index.html runs straight from file://.
 * Everything hangs off window.CW (or globalThis.CW under Node tests).
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});

  // ---------------------------------------------------------------- RARITY
  // weight = pull odds (%). tier drives grief/steal/stat tables.
  // frame/pips/shape give a non-colour read (frame style, pip count, label, reveal behaviour).
  CW.RARITIES = [
    { id: 'common',    name: 'COMMON',    tier: 0, weight: 55,  color: '#b8ae9c', dark: '#5a5247', pips: 1, frame: 'plain',  revealMs: 1500, sfx: 'reveal' },
    { id: 'rare',      name: 'RARE',      tier: 1, weight: 28,  color: '#38a6ff', dark: '#0f4f8a', pips: 2, frame: 'rivet',  revealMs: 1800, sfx: 'rare' },
    { id: 'epic',      name: 'EPIC',      tier: 2, weight: 13,  color: '#b44dff', dark: '#561a8c', pips: 3, frame: 'spike',  revealMs: 2200, sfx: 'epic' },
    { id: 'legendary', name: 'LEGENDARY', tier: 3, weight: 3.5, color: '#ffbf1a', dark: '#8a5300', pips: 4, frame: 'crown',  revealMs: 3200, sfx: 'legendary' },
    { id: 'mythic',    name: 'CHAOS',     tier: 4, weight: 0.5, color: '#ff2fa0', dark: '#6b0a45', pips: 5, frame: 'chaos',  revealMs: 3800, sfx: 'mythic' },
  ];
  CW.RARITY_ORDER = CW.RARITIES.map((r) => r.id);
  CW.RARITY = Object.fromEntries(CW.RARITIES.map((r) => [r.id, r]));
  // Chance a Common reel "teases" a big pull (slows like a Legendary) then lands Common anyway.
  CW.FAKEOUT_CHANCE = 0.06;

  // ---------------------------------------------------------------- CLASSES
  // Base combat stats. variants = hero name per rarity (a "Legendary Brute" is a Chaos Lord).
  // atk values are race-calibrated (tools/class-calibrate.js) so class RNG doesn't decide the race — rarity should.
  // Chaos World archetypes. Scrub / Knight / Archer are the established trio; the rest are drawn in the same system
  // (js/chars.js). variants = hero name per rarity. The character's accent colour comes from the player, not the class.
  CW.CLASSES = {
    scrub:     { id: 'scrub',     name: 'SCRUB',       role: 'dps',    range: 'melee',  dmgType: 'phys',  hp: 540, atk: 19.9, aspd: 1.00, crit: 8,  hat: 'bucket',    tint: '#b5835a', skills: ['flail', 'haymaker'],
                 variants: { common: 'Scrub', rare: 'Seasoned Scrub', epic: 'Scrub Captain', legendary: 'Scrub Supreme', mythic: 'The Eternal Scrub' } },
    knight:    { id: 'knight',    name: 'KNIGHT',      role: 'tank',   range: 'melee',  dmgType: 'phys',  hp: 860, atk: 45, aspd: 0.85, crit: 5,  hat: 'bucket',    tint: '#9aa5b1', skills: ['taunt', 'rallyWall'],
                 variants: { common: 'Squire', rare: 'Knight', epic: 'Knight Errant', legendary: 'Knight Commander', mythic: 'The Iron Saint' } },
    archer:    { id: 'archer',    name: 'ARCHER',      role: 'dps',    range: 'ranged', dmgType: 'phys',  hp: 400, atk: 16.8, aspd: 1.10, crit: 9,  hat: 'hood',      tint: '#2e8b57', skills: ['volley', 'deadeye'],
                 variants: { common: 'Archer', rare: 'Sharpshooter', epic: 'Storm Archer', legendary: 'Starfall Archer', mythic: 'Eye of Ruin' } },
    mage:      { id: 'mage',      name: 'MAGE',        role: 'dps',    range: 'ranged', dmgType: 'spell', hp: 360, atk: 29.8, aspd: 0.75, crit: 6,  hat: 'wizard',    tint: '#6a3dcf', skills: ['fireball', 'meteor'],
                 variants: { common: 'Apprentice', rare: 'Ember Mage', epic: 'Void Mage', legendary: 'Archmage', mythic: 'The Unwritten' } },
    berserker: { id: 'berserker', name: 'BERSERKER',   role: 'dps',    range: 'melee',  dmgType: 'phys',  hp: 600, atk: 24.9, aspd: 1.00, crit: 7,  hat: 'viking',    tint: '#e67e22', skills: ['frenzy', 'rampage'],
                 variants: { common: 'Bar Brawler', rare: 'Rage Viking', epic: 'Bloodfrenzy', legendary: 'Wrath Incarnate', mythic: 'The Red Mist' } },
    rogue:     { id: 'rogue',     name: 'ROGUE',       role: 'dps',    range: 'melee',  dmgType: 'phys',  hp: 420, atk: 17.1, aspd: 1.45, crit: 15, hat: 'mask',      tint: '#34495e', skills: ['backstab', 'smokeBomb'],
                 variants: { common: 'Gutter Rat', rare: 'Cutpurse', epic: 'Shadowblade', legendary: "Nightmother's Knife", mythic: 'No-One' } },
    cleric:    { id: 'cleric',    name: 'CLERIC',      role: 'healer', range: 'ranged', dmgType: 'spell', hp: 460, atk: 56.1, aspd: 0.85, crit: 6,  hat: 'mitre',     tint: '#f1c40f', skills: ['mend', 'sanctuary'],
                 variants: { common: 'Candle Monk', rare: 'Lightbinder', epic: 'High Priest', legendary: 'Saint of Chaos', mythic: 'The Unholy Pope' } },
    necro:     { id: 'necro',     name: 'NECROMANCER', role: 'dps',    range: 'ranged', dmgType: 'spell', hp: 400, atk: 19.1, aspd: 0.80, crit: 6,  hat: 'skullhood', tint: '#1abc9c', skills: ['raiseDead', 'soulDrain'],
                 variants: { common: 'Grave Digger', rare: 'Bonecaller', epic: 'Lich Adept', legendary: 'Lord of Bones', mythic: "Death's Accountant" } },
    paladin:   { id: 'paladin',   name: 'PALADIN',     role: 'dps',    range: 'melee',  dmgType: 'phys',  hp: 640, atk: 29.1, aspd: 0.90, crit: 6,  hat: 'hornhelm',  tint: '#ffd166', skills: ['smite', 'consecrate'],
                 variants: { common: 'Acolyte', rare: 'Paladin', epic: 'Crusader', legendary: 'Lightbringer', mythic: 'Dawn Incarnate' } },
  };
  CW.CLASS_IDS = Object.keys(CW.CLASSES);


  // Hero rarity scales the hero's own HP / ATK / skill power.
  CW.HERO_RARITY_STATS = {
    common:    { mult: 1.00 },
    rare:      { mult: 1.10 },
    epic:      { mult: 1.22 },
    legendary: { mult: 1.38 },
    mythic:    { mult: 1.58 },
  };

  // ---------------------------------------------------------------- WEAPONS
  // Pool is PER CLASS PER RARITY so pulls always respect the hero.
  // kind = icon to draw. fx = on-hit special (see WEAPON_FX). Commons have no fx.
  CW.WEAPONS = {
    scrub: {
      common:    [{ name: 'Rusty Sword', kind: 'sword' }, { name: 'Plank With A Nail', kind: 'club' }],
      rare:      [{ name: 'Fire Axe', kind: 'axe', fx: 'burn' }, { name: 'Iron Cleaver', kind: 'cleaver', fx: 'bleed' }],
      epic:      [{ name: 'Flaming Greatsword', kind: 'greatsword', fx: 'burn' }, { name: 'Dread Maul', kind: 'hammer', fx: 'stun' }],
      legendary: [{ name: 'Chaos Blade', kind: 'greatsword', fx: 'voidEcho' }],
      mythic:    [{ name: 'Worldsplitter', kind: 'greatsword', fx: 'cataclysm' }],
    },
    archer: {
      common:    [{ name: 'Bent Bow', kind: 'bow' }, { name: 'Slingshot', kind: 'sling' }],
      rare:      [{ name: 'Yew Longbow', kind: 'bow', fx: 'bleed' }, { name: 'Crossbow of Spite', kind: 'crossbow', fx: 'stun' }],
      epic:      [{ name: 'Storm Bow', kind: 'bow', fx: 'chain' }, { name: 'Venom Repeater', kind: 'crossbow', fx: 'poison' }],
      legendary: [{ name: 'Starfall Bow', kind: 'bow', fx: 'voidEcho' }],
      mythic:    [{ name: 'The Last Arrow', kind: 'bow', fx: 'cataclysm' }],
    },
    mage: {
      common:    [{ name: 'Cracked Wand', kind: 'wand' }, { name: 'Magic-ish Stick', kind: 'stick' }],
      rare:      [{ name: 'Ember Staff', kind: 'staff', fx: 'burn' }, { name: 'Frost Rod', kind: 'wand', fx: 'stun' }],
      epic:      [{ name: 'Lightning Orb', kind: 'orb', fx: 'chain' }, { name: 'Grim Grimoire', kind: 'tome', fx: 'poison' }],
      legendary: [{ name: 'Void Staff', kind: 'staff', fx: 'voidEcho' }, { name: 'Cosmic Staff', kind: 'staff', fx: 'chain' }],
      mythic:    [{ name: 'Staff of Everything', kind: 'staff', fx: 'cataclysm' }],
    },
    rogue: {
      common:    [{ name: 'Butter Knives', kind: 'dagger' }, { name: 'Prison Shiv', kind: 'dagger' }],
      rare:      [{ name: 'Poisoned Daggers', kind: 'dagger', fx: 'poison' }, { name: 'Twin Sickles', kind: 'sickle', fx: 'bleed' }],
      epic:      [{ name: 'Shadow Blades', kind: 'dagger', fx: 'voidEcho' }, { name: 'Venom Fangs', kind: 'sickle', fx: 'poison' }],
      legendary: [{ name: 'Nightfall Daggers', kind: 'dagger', fx: 'voidEcho' }],
      mythic:    [{ name: 'Knife of Tomorrow', kind: 'dagger', fx: 'cataclysm' }],
    },
    knight: {
      common:    [{ name: 'Bin Lid & Club', kind: 'shield' }, { name: 'Squire Sword', kind: 'sword' }],
      rare:      [{ name: 'Tower Shield', kind: 'shield', fx: 'stun' }, { name: 'Spiked Buckler', kind: 'shield', fx: 'bleed' }],
      epic:      [{ name: 'Dragonscale Bulwark', kind: 'shield', fx: 'burn' }, { name: 'Thunder Hammer', kind: 'hammer', fx: 'chain' }],
      legendary: [{ name: 'Aegis of Spite', kind: 'shield', fx: 'voidEcho' }],
      mythic:    [{ name: 'The Unbreakable', kind: 'shield', fx: 'cataclysm' }],
    },
    necro: {
      common:    [{ name: 'Bone Wand', kind: 'wand' }, { name: 'Gravedigger Shovel', kind: 'shovel' }],
      rare:      [{ name: 'Skull Staff', kind: 'skullstaff', fx: 'poison' }, { name: 'Soul Lantern', kind: 'lantern', fx: 'burn' }],
      epic:      [{ name: 'Plague Scythe', kind: 'scythe', fx: 'poison' }, { name: 'Lich Tome', kind: 'tome', fx: 'voidEcho' }],
      legendary: [{ name: 'Reaper Scythe', kind: 'scythe', fx: 'voidEcho' }],
      mythic:    [{ name: 'Book of the Dead Dead', kind: 'tome', fx: 'cataclysm' }],
    },
    cleric: {
      common:    [{ name: 'Candle On A Stick', kind: 'candle' }, { name: 'Wooden Mace', kind: 'mace' }],
      rare:      [{ name: 'Holy Mace', kind: 'mace', fx: 'holy' }, { name: 'Sun Censer', kind: 'lantern', fx: 'burn' }],
      epic:      [{ name: 'Radiant Hammer', kind: 'hammer', fx: 'holy' }, { name: 'Choir Bell', kind: 'bell', fx: 'stun' }],
      legendary: [{ name: 'Staff of the Dawn', kind: 'staff', fx: 'holy' }],
      mythic:    [{ name: 'Halo Cannon', kind: 'orb', fx: 'cataclysm' }],
    },
    berserker: {
      common:    [{ name: 'Broken Bottle', kind: 'bottle' }, { name: 'Chair Leg', kind: 'club' }],
      rare:      [{ name: 'War Axes', kind: 'axe', fx: 'bleed' }, { name: 'Spiked Knuckles', kind: 'knuckles', fx: 'stun' }],
      epic:      [{ name: 'Bloodreaver', kind: 'axe', fx: 'bleed' }, { name: 'Twin Choppers', kind: 'cleaver', fx: 'burn' }],
      legendary: [{ name: 'Gorefather Axe', kind: 'axe', fx: 'voidEcho' }],
      mythic:    [{ name: 'Rage Itself', kind: 'axe', fx: 'cataclysm' }],
    },
    paladin: {
      common:    [{ name: 'Wooden Hammer', kind: 'hammer' }, { name: 'Training Mace', kind: 'mace' }],
      rare:      [{ name: 'Blessed Hammer', kind: 'hammer', fx: 'holy' }, { name: 'Dawn Mace', kind: 'mace', fx: 'stun' }],
      epic:      [{ name: 'Judgement Maul', kind: 'hammer', fx: 'chain' }, { name: 'Oathblade', kind: 'greatsword', fx: 'holy' }],
      legendary: [{ name: 'Lightbringer', kind: 'greatsword', fx: 'voidEcho' }],
      mythic:    [{ name: 'Hammer of Dawn', kind: 'hammer', fx: 'cataclysm' }],
    },
  };

  // Weapon rarity → combat numbers. dmg = % bonus to the wearer's damage.
  CW.WEAPON_RARITY_STATS = {
    common:    { dmg: -0.15, crit: 0,  aspd: 0.00, fxChance: 0.00 },
    rare:      { dmg: 0.05,  crit: 4,  aspd: 0.05, fxChance: 0.08 },
    epic:      { dmg: 0.18,  crit: 8,  aspd: 0.10, fxChance: 0.12 },
    legendary: { dmg: 0.35,  crit: 12, aspd: 0.15, fxChance: 0.15 },
    mythic:    { dmg: 0.55,  crit: 18, aspd: 0.20, fxChance: 0.22 },
  };

  CW.WEAPON_FX = {
    burn:      { name: 'Burn',       desc: 'sets target on fire',            color: '#ff7a1a' },
    bleed:     { name: 'Bleed',      desc: 'opens a bleeding wound',          color: '#d0021b' },
    poison:    { name: 'Poison',     desc: 'stacks poison',                   color: '#7ed321' },
    stun:      { name: 'Stun',       desc: 'stuns for 1s',                    color: '#f8e71c' },
    chain:     { name: 'Chain Zap',  desc: 'lightning jumps to 2 more foes',  color: '#7fdbff' },
    holy:      { name: 'Holy Burst', desc: 'heals the lowest ally',           color: '#fff6a8' },
    voidEcho:  { name: 'Void Echo',  desc: 'spawns a Void Echo that hits again', color: '#a259ff' },
    cataclysm: { name: 'Cataclysm',  desc: 'detonates on ALL enemies',        color: '#ff2fa0' },
  };

  // ---------------------------------------------------------------- GEAR
  CW.GEAR = {
    common:    [{ name: 'Cloth Armour', kind: 'tunic' }, { name: 'Sandals', kind: 'sandals', mod: 'dodge' }, { name: 'Bucket Helm', kind: 'helm' }, { name: 'Potato Sack', kind: 'tunic' }],
    rare:      [{ name: 'Knight Armour', kind: 'plate', mod: 'resist' }, { name: 'Studded Leather', kind: 'tunic', mod: 'dodge' }, { name: 'Winged Boots', kind: 'boots', mod: 'haste' }],
    epic:      [{ name: 'Spiked Plate', kind: 'plate', mod: 'thorns' }, { name: 'Vampire Cloak', kind: 'cloak', mod: 'lifesteal' }, { name: 'Arcane Robes', kind: 'robe', mod: 'haste' }],
    legendary: [{ name: 'Dragon Armour', kind: 'plate', mod: 'resist' }, { name: 'Chaos Crown', kind: 'crown', mod: 'revive' }],
    mythic:    [{ name: 'Skin of the World Serpent', kind: 'cloak', mod: 'revive' }],
  };
  CW.GEAR_RARITY_STATS = {
    common:    { hp: 0.00, def: 0.00, modPower: 0.6 },
    rare:      { hp: 0.10, def: 0.05, modPower: 1.0 },
    epic:      { hp: 0.20, def: 0.09, modPower: 1.4 },
    legendary: { hp: 0.32, def: 0.14, modPower: 1.8 },
    mythic:    { hp: 0.45, def: 0.20, modPower: 2.4 },
  };
  // value at modPower 1.0
  CW.GEAR_MODS = {
    dodge:     { name: 'Dodge',     unit: '%', base: 8 },
    resist:    { name: 'Resist',    unit: '%', base: 8 },
    haste:     { name: 'Haste',     unit: '%', base: 10 },
    thorns:    { name: 'Thorns',    unit: '%', base: 15 },
    lifesteal: { name: 'Lifesteal', unit: '%', base: 8 },
    revive:    { name: 'Revive',    unit: '%', base: 30, desc: 'revive once at this % HP' },
  };

  // ---------------------------------------------------------------- MANIPULATION ECONOMY
  CW.STEAL_ODDS = { common: 0.75, rare: 0.55, epic: 0.30, legendary: 0.12, mythic: 0.05 };
  // Steal is paid with 1 Jack Token, or this many coins if you have none.
  CW.STEAL_COST = { token: 'jack', amount: 1, coinAlt: 300 };
  CW.STEAL_RULES = {
    suspenseSec: 2.4,        // dial spin before reveal
    guardSec: 5,             // target can't be stolen from again for this long
    stealableSlots: ['weapon', 'gear'], // heroes are people, not loot
  };

  // Downgrade exactly one tier. Key = CURRENT rarity.
  CW.GRIEF_COSTS = {
    rare:      { coins: 50 },
    epic:      { coins: 100 },
    legendary: { coins: 200 },
    mythic:    { token: 'grief', amount: 1 },
  };
  CW.GRIEF_RULES = {
    maxPerPlayer: 3,      // human per lobby
    botMaxPerPlayer: 2,   // each bot per lobby
    immunitySec: 6,       // target shielded after being griefed
    resolveSec: 0.9,      // curse wind-up
  };

  CW.REROLL = { baseCost: 100, costStep: 50 }; // 100, 150, 200 … per player per lobby
  CW.SHUFFLE = { token: 'chaos', amount: 1 };

  // Raid pot stored as integer hundredths (100 = x1.00) to avoid float drift.
  CW.RAID_POT = { start: 100, step: 10, cap: 200, cost: 100 };
  // Cumulative danger tiers. Reaching x2.0 = CHAOS RAID.
  CW.RAID_MODIFIERS = [
    { at: 100, label: 'NORMAL',               short: 'NORMAL' },
    { at: 125, label: '+10% ENEMY HP',        short: '+HP',    enemyHp: 0.10 },
    { at: 150, label: '+20% ENEMY DAMAGE',    short: '+DMG',   enemyDmg: 0.20 },
    { at: 175, label: 'ELITES MORE LIKELY',   short: 'ELITES', eliteChance: 0.45 },
    { at: 200, label: 'CHAOS RAID: BOSS ENRAGED', short: 'ENRAGED', bossEnraged: true },
  ];

  // ---------------------------------------------------------------- MODES
  CW.MODES = {
    rng: {
      id: 'rng', name: 'RNG RAID', tagline: 'Pull. Pray. Pinch.',
      features: ['Roll hero, weapon, gear', 'Reroll a slot / Shuffle all', 'Steal from the lobby', 'Juice the raid pot'],
      grief: false,
      unstealable: [],              // everything can be stolen (at a price)
      chaosTaxOnSteal: 0,           // pot bump per steal attempt
      chaosTaxOnGrief: 0,
      botAggression: 1.0,
      botBoostBias: 1.0,
      chaosSec: 18,
    },
    grief: {
      id: 'grief', name: 'CHAOS / GRIEF RAID', tagline: "Can't take it? Ruin it.",
      features: ['Everything in RNG Raid', 'GRIEF: curse items down a tier', 'Legendary+ is BOLTED DOWN — no stealing', 'Chaos feeds the pot (+x0.02 per steal/grief)'],
      grief: true,
      unstealable: ['legendary', 'mythic'], // forces "I can't steal it. Fine, I'll ruin it."
      chaosTaxOnSteal: 2,
      chaosTaxOnGrief: 2,
      botAggression: 1.45,
      botBoostBias: 1.25,
      chaosSec: 20,
    },
  };

  // ---------------------------------------------------------------- TIMINGS (seconds, scaled by fast mode)
  CW.TIMINGS = {
    intro: 2.2,
    rollPhaseMax: 60,          // hard cap; idle humans get auto-pulled
    humanAutoPullSec: 7,       // idle time before YOU start the next round automatically
    reelMin: 1.3,              // reel spin before reveal for rerolls/shuffles (rarity adds its own revealMs)
    roundPause: 1.5,           // breather after the last reel of a round lands
    preChaosPause: 1.6,
    launchCountdown: 3.5,
    fastScale: 0.18,           // fast mode multiplies all lobby timings by this
    battleFastSpeed: 3,
  };

  // ---------------------------------------------------------------- ECONOMY / REWARDS
  CW.ECONOMY = {
    startCoins: 800, startChaos: 1, startJack: 2, startGrief: 1,
    winBase: 400,              // V2: base raid reward before placement % and raid pot
    mvpBonus: 100,             // V2: winner (1st place) bonus, not multiplied
    lossConsolation: 60,
    tokenDrops: { chaos: 0.14, jack: 0.12, grief: 0.10 }, // per win, scaled up by pot (x pot)
    lossTokenDrop: 0.03,
    botCoins: [350, 950],
    botTokens: { chaos: [0, 1], jack: [0, 2], grief: [0, 1] },
  };

  // ---------------------------------------------------------------- BOTS
  // Weighted personalities. w* = chance per "think" to try that action.
  CW.BOT_PERSONALITIES = {
    greedy:    { label: 'THE GREEDY ONE', think: [1.6, 3.0], wBoost: 0.70, wSteal: 0.10, wGrief: 0.06, wReroll: 0.15, wShuffle: 0.02, boostCeil: 200, boostMax: 2, griefMax: 1, chatty: 0.6, protect: { legendary: 0.0, mythic: 0.9 }, itemHold: [6, 11], boonPrefs: { fortune: 2, executioner: 1 } },
    rat:       { label: 'THE RAT',        think: [1.4, 2.6], wBoost: 0.05, wSteal: 0.80, wGrief: 0.2, wReroll: 0.10, wShuffle: 0.02, boostCeil: 140, boostMax: 0, griefMax: 1, chatty: 0.7, protect: { legendary: 0.05, mythic: 0.1 }, itemHold: [1, 3], itemTarget: 'leader', boonPrefs: { fortune: 2 } },
    griefer:   { label: 'THE GRIEFER',    think: [1.3, 2.4], wBoost: 0.08, wSteal: 0.25, wGrief: 0.85, wReroll: 0.08, wShuffle: 0.00, boostCeil: 160, boostMax: 0, griefMax: 2, chatty: 0.8, protect: { legendary: 0.3, mythic: 0.5 }, itemHold: [1, 3], itemTarget: 'cluster', boonPrefs: { chaosBlessing: 2 } },
    coward:    { label: 'THE COWARD',     think: [2.4, 4.0], wBoost: 0.25, wSteal: 0.05, wGrief: 0.03, wReroll: 0.30, wShuffle: 0.00, boostCeil: 130, boostMax: 1, griefMax: 0, chatty: 0.5, protect: { legendary: 0.85, mythic: 0.95 }, itemHold: [3, 6], holdShield: true, boonPrefs: { ironSkin: 2, secondWind: 2 } },
    highroller:{ label: 'THE HIGH ROLLER',think: [1.3, 2.4], wBoost: 0.20, wSteal: 0.20, wGrief: 0.08, wReroll: 0.85, wShuffle: 0.35, boostCeil: 200, boostMax: 1, griefMax: 1, chatty: 0.6, protect: { legendary: 0.08, mythic: 0.15 }, itemHold: [0, 0.4], boonPrefs: { chaosBlessing: 2, criticalMass: 1 } },
    hype:      { label: 'THE HYPE MAN',   think: [2.0, 3.4], wBoost: 0.35, wSteal: 0.10, wGrief: 0.05, wReroll: 0.20, wShuffle: 0.05, boostCeil: 190, boostMax: 1, griefMax: 1, chatty: 1.0, protect: { legendary: 0.4, mythic: 0.6 }, itemHold: [1, 4], boonPrefs: { bloodlust: 2 } },
    grudge:    { label: 'THE GRUDGE',     think: [1.8, 3.0], wBoost: 0.10, wSteal: 0.30, wGrief: 0.3, wReroll: 0.20, wShuffle: 0.02, boostCeil: 170, boostMax: 0, griefMax: 1, chatty: 0.6, revenge: 0.9, protect: { legendary: 0.35, mythic: 0.6 }, itemHold: [1, 4], itemTarget: 'revenge', boonPrefs: { executioner: 2 } },
  };

  // look = Overlord appearance. body/belly colours, horns, eyes, mouth, extra.
  CW.BOT_ROSTER = [
    { name: 'BIGCLIVE99',    personality: 'greedy',     level: 11, look: { body: '#7bc142', belly: '#c9e89a', horns: 'curl',    eyes: 'big',    mouth: 'grin',  extra: 'gold' } },
    { name: 'GODSPEED',      personality: 'highroller', level: 23, look: { body: '#3b82f6', belly: '#a9cdfc', horns: 'spike',   eyes: 'cool',   mouth: 'smirk', extra: 'shades' } },
    { name: 'PUNCHFACE99',   personality: 'hype',       level: 7,  look: { body: '#f97316', belly: '#fed7aa', horns: 'nub',     eyes: 'big',    mouth: 'open',  extra: 'bandage' } },
    { name: 'SIRLOINS',      personality: 'rat',        level: 15, look: { body: '#a16207', belly: '#e9c98a', horns: 'ears',    eyes: 'shifty', mouth: 'teeth', extra: 'whiskers' } },
    { name: 'NANA_RAGE',     personality: 'griefer',    level: 31, look: { body: '#db2777', belly: '#fbcfe8', horns: 'spike',   eyes: 'angry',  mouth: 'fangs', extra: 'curlers' } },
    { name: 'MOTHMAN_TTV',   personality: 'coward',     level: 4,  look: { body: '#a3a3a3', belly: '#e5e5e5', horns: 'antenna', eyes: 'worried',mouth: 'wobble',extra: 'none' } },
    { name: 'QUITCUZZZ',     personality: 'grudge',     level: 19, look: { body: '#10b981', belly: '#a7f3d0', horns: 'ears',    eyes: 'angry',  mouth: 'fangs', extra: 'nosering' } },
  ];
  CW.HUMAN_PROFILE = { name: 'YOU', level: 12, look: { body: '#8b5cf6', belly: '#ddd6fe', horns: 'curl', eyes: 'big', mouth: 'grin', extra: 'none' } };

  // ---------------------------------------------------------------- BOT LINES
  // Short, authored, a bit rude, never nasty. {t} = target name, {i} = item name.
  CW.LINES = {
    join:        ['yo', 'gl everyone', 'feeling lucky', 'one more then bed', 'dont touch my stuff'],
    selfLegend:  ['NO WAY', 'LETS GOOOO', 'dont touch my {i}', 'sorry not sorry', 'built different'],
    otherLegend: ['NO WAY', 'of course he gets that', 'rigged', 'hand it over {t}', "I'm stealing that", 'how'],
    selfCommon:  ['welp', 'trash roll 💀', 'cool cool cool', 'this game hates me', 'its fine. its fine.'],
    sandals:     ['bro got sandals', 'SANDALS', 'nice sandals {t}'],
    otherCommon: ['HAHAHAHA', 'unlucky', 'rip {t}', 'skill issue'],
    stealWin:    ['mine now', 'thanks {t}', 'yoink', 'finders keepers'],
    stealLose:   ['worth a shot', 'eh', 'next time {t}'],
    stolenFrom:  ['GIVE IT BACK', 'you absolute rat', '{t} WHY', 'reported'],
    stealBlocked:['lol no', 'nice try {t}', 'hands OFF', 'caught you'],
    griefed:     ['you absolute rat', 'WHAT', 'ok thats personal', 'I will remember this {t}', 'my beautiful {i}'],
    grieferGloat:['oops', 'balance patch', 'its called strategy', 'cry about it'],
    boost:       ['JUICE IT', 'more loot', 'trust', 'we ball'],
    boostPanic:  ['STOP BOOSTING', 'guys pls', 'why are we like this', "I'm not carrying this"],
    chaosRaid:   ['oh no', 'CHAOS RAID LETS GO', 'we are so dead', 'this is fine'],
    reroll:      ['reroll it coward', 'one more', 'come on come on'],
    rerollWorse: ['WHY', 'it got WORSE', 'should not have'],
    shuffle:     ['YOLO', 'all in', 'send it'],
    taunt:       ['ez', 'scared?', 'gg already', 'lmao'],
    launch:      ['here we go', 'stay behind me', 'gl', 'dont die'],
    lastReel:    ['still going…', 'oh no', 'COME ON', 'here it comes', 'why is it still spinning'],
    protect:     ['mine. forever.', 'locked in', 'nobody touches this', 'ward up'],
    wardBroken:  ['WARD BROKEN?!', 'I PAID FOR THAT', 'that was ALL my coins', 'actually crying'],
    ready:       ['ready', 'lets go', 'k', 'gl all'],
    vote:        ['trust me on this one', 'easy pick', 'come on guys', 'vote with me'],
    itemBomb:    ['eat bomb', 'catch', 'fore!'],
    itemGhost:   ['borrowing this', 'nice weapon. mine now', "I'll give it back. maybe"],
    ghosted:     ['NOT THE STAFF', 'give that back', 'HEY', 'that is MINE'],
    lightning:   ['LIGHTNING?!', 'who did that', 'cant move!!'],
    crownHit:    ['not again', 'ok who sent that', 'heavy is the head'],
    leader:      ['first place looks comfy', 'catch me', 'too easy'],
    overtaken:   ['NO', 'how', 'unbelievable'],
  };

  // ---------------------------------------------------------------- DUNGEON
  CW.BIOMES = [
    { id: 'gutter', name: 'THE GUTTERWORKS',  difficulty: 2, sky: '#1d2a1f', floor: '#33402b', glow: '#9cff57', boss: 'grubmaw' },
    { id: 'bones',  name: 'THE BONE ORCHARD', difficulty: 3, sky: '#221a2b', floor: '#3b3045', glow: '#c9b8ff', boss: 'orchardKing' },
    { id: 'molten', name: 'THE MOLTEN CRYPT', difficulty: 3, sky: '#2a1512', floor: '#4a2418', glow: '#ff8a3d', boss: 'pyreMother' },
  ];

  // One enormous boss per dungeon. hp/atk before raid modifiers + BATTLE scales.
  CW.BOSSES = {
    grubmaw:     { name: 'GRUBMAW THE BLOATED', hp: 30000, atk: 48, skin: '#8fc25a', dark: '#4b7a2a', horn: '#efe0b0', eye: '#ffe14d', style: 'tusks' },
    orchardKing: { name: 'THE ORCHARD KING',    hp: 30000, atk: 48, skin: '#cfc6b0', dark: '#7b715c', horn: '#6b4f2a', eye: '#b6ff3b', style: 'antlers' },
    pyreMother:  { name: 'PYRE MOTHER',         hp: 30000, atk: 48, skin: '#e8643a', dark: '#8a2a12', horn: '#2b1a14', eye: '#fff07a', style: 'flames' },
  };

  CW.BATTLE = {
    enemyHpScale: 0.95,        // global tuning knobs (boss HP / damage) — see tools/difficulty-sweep.js
    enemyAtkScale: 4.6,
    baseEliteChance: 0.15,     // (kept for raidMods compatibility)
    critMult: 1.8,
    enrageAtPct: 0.25,         // boss enrages below this HP
    enrage: { aspd: 0.35, atk: 0.20 },
    chaosRaidEnrage: { atk: 0.25, every: 0.8, hp: 0.15 }, // x2.0 pot: tougher boss that hits harder and attacks more often
    maxTime: 120,              // berserk timer: boss obliterates the raid
    stunSec: 1.0,
    koSec: 6,                  // knocked-out raiders get back up after this…
    respawnPct: 0.5,           // …at this % HP. If ALL 8 are down at once → WIPE.
    healScoreWeight: 0.1,      // race score = boss damage + this × healing (healing can't dominate)
  };

  // ---------------------------------------------------------------- SKILLS
  // power = % of attack. cd seconds. target types handled in battle-core.
  CW.SKILLS = {
    cleave:    { name: 'CLEAVE',      cd: 6,  type: 'multi',  hits: 3, power: 1.7,  icon: 'axe' },
    chaosSlam: { name: 'CHAOS SLAM',  cd: 16, type: 'aoe',    power: 2.0, stun: 1.5, icon: 'hammer' },
    volley:    { name: 'VOLLEY',      cd: 7,  type: 'random', hits: 5, power: 0.9,  icon: 'bow' },
    deadeye:   { name: 'DEADEYE',     cd: 14, type: 'single', power: 4.5, forceCrit: true, icon: 'crossbow' },
    fireball:  { name: 'FIREBALL',    cd: 6,  type: 'splash', power: 2.0, splash: 0.8, icon: 'orb' },
    meteor:    { name: 'METEOR',      cd: 18, type: 'aoe',    power: 2.4, burn: true, icon: 'staff' },
    backstab:  { name: 'BACKSTAB',    cd: 5,  type: 'single', power: 3.0, critBonus: 30, icon: 'dagger' },
    smokeBomb: { name: 'SMOKE BOMB',  cd: 15, type: 'buffParty', dodge: 30, dur: 4, icon: 'cloak' },
    taunt:     { name: 'TAUNT',       cd: 8,  type: 'taunt',  dur: 5, shield: 0.25, icon: 'shield' },
    rallyWall: { name: 'RALLY WALL',  cd: 18, type: 'shieldParty', shield: 0.14, icon: 'plate' },
    raiseDead: { name: 'RAISE DEAD',  cd: 10, type: 'summon', count: 2, icon: 'skullstaff' },
    soulDrain: { name: 'SOUL DRAIN',  cd: 16, type: 'aoe',    power: 1.4, drainHeal: 0.3, icon: 'scythe' },
    mend:      { name: 'MEND',        cd: 5,  type: 'heal',   power: 0.30, icon: 'candle' },
    sanctuary: { name: 'SANCTUARY',   cd: 18, type: 'healParty', power: 0.25, revive: true, icon: 'bell' },
    frenzy:    { name: 'FRENZY',      cd: 10, type: 'buffSelf', aspd: 0.6, dur: 5, icon: 'knuckles' },
    rampage:   { name: 'RAMPAGE',     cd: 16, type: 'random', hits: 4, power: 1.25, lifesteal: 0.3, icon: 'axe' },
    flail:     { name: 'FLAIL',       cd: 6,  type: 'random', hits: 4, power: 0.8,  icon: 'club' },
    haymaker:  { name: 'HAYMAKER',    cd: 14, type: 'single', power: 3.6, critBonus: 40, icon: 'knuckles' },
    smite:     { name: 'SMITE',       cd: 7,  type: 'single', power: 2.4, healParty: 0.05, icon: 'hammer' },
    consecrate:{ name: 'CONSECRATE',  cd: 16, type: 'aoe',    power: 1.9, shieldParty: 0.06, icon: 'greatsword' },
  };

  // =================================================================== V2 TUNING
  // ---------------------------------------------------------------- SIMULTANEOUS ROUNDS
  // Each round spins EVERYONE's slot at once; reels land one by one. Big rarities (and fake-outs) land last.
  CW.ROUND_REEL = {
    firstLand: 1.15,           // first reel lands after this
    step: [0.14, 0.34],        // gap between ordinary landings
    dramaGap: [0.65, 1.0],     // extra pause before the "still spinning…" reels
    dramaStep: [0.55, 0.9],    // gap between dramatic landings
    epicDramaChance: 0.45,     // epics sometimes join the dramatic tail
    fakeoutChance: 0.05,       // per reel: a Common that hangs on like a Legendary
    lastSpinningAfter: 0.5,    // announce "still spinning" if the tail is at least this long
  };

  // ---------------------------------------------------------------- PROTECT
  // Legendary+/Mythic only. Costs ALL your coins and locks you out of every other paid lobby action.
  CW.PROTECTION_STEAL_MULTIPLIER = 0.25;   // 12% legendary steal → 3%. Never absolute.
  CW.PROTECT = {
    eligible: ['legendary', 'mythic'],
    minCoins: 1,               // must have something to give
    griefPassChance: 0.3,      // Grief Raid: a curse only breaks a ward this often (cost is spent either way)
  };

  // ---------------------------------------------------------------- BOONS (group votes)
  // Applied to ALL raiders. Effects read by battle-core.
  CW.BOON_OPTIONS = {
    bloodlust:     { name: 'BLOODLUST',        desc: '+15% ATTACK SPEED',            aspd: 0.15,       color: '#ff3b3b', icon: 'axe' },
    ironSkin:      { name: 'IRON SKIN',        desc: '+20% DEFENCE',                 def: 0.20,        color: '#9aa5b1', icon: 'plate' },
    fortune:       { name: "FORTUNE'S FAVOUR", desc: 'ITEM REELS COME FASTER',       itemRate: 0.33,   color: '#ffbf1a', icon: 'crown' },
    executioner:   { name: 'EXECUTIONER',      desc: '+25% DMG WHILE BOSS < 25% HP', execute: 0.25,    color: '#c0392b', icon: 'greatsword' },
    criticalMass:  { name: 'CRITICAL MASS',    desc: '+10% CRIT CHANCE',             crit: 10,         color: '#ffe14d', icon: 'dagger' },
    vampiric:      { name: 'VAMPIRIC PACT',    desc: '5% LIFESTEAL',                 lifesteal: 0.05,  color: '#9b111e', icon: 'cloak' },
    chaosBlessing: { name: 'CHAOS BLESSING',   desc: 'WILD DAMAGE, HIGHER AVERAGE',  variance: [0.35, 2.05], color: '#ff2fa0', icon: 'orb' },
    secondWind:    { name: 'SECOND WIND',      desc: 'ONE FREE RECOVERY AT LOW HP',  secondWind: 0.6, color: '#7dff7a', icon: 'bell' },
  };
  CW.BOON_VOTE = {
    seconds: 10,               // human gets ~10s
    choices: 3,
    botVoteWindow: [1.2, 8.5], // bots cast during this part of the timer
    herd: 0.5,                 // bots lean towards whatever is already winning
    midFightAtPct: 0.5,        // second vote when boss drops to this HP
    tieBreakSec: 1.4,          // visible tie-break spin
  };

  // ---------------------------------------------------------------- BATTLE ITEMS (Mario-Kart-ish)
  CW.ITEM_INTERVAL = 10;       // seconds between item reels (before rank modifiers)
  CW.ITEM_REEL_SEC = 1.4;      // reel spin time
  CW.ITEM_FIRST = [3, 7];      // first reel arrives in this window
  CW.LIGHTNING_DURATION = 3.5; // try 3 / 5 / 10 in the debug panel
  CW.GHOST_DURATION = 8;
  CW.SWAP_CURSE_DURATION = 8;
  CW.COMEBACK_STRENGTH = 1.0;  // 0 = everyone draws from the same odds, 1 = full position weighting, >1 = exaggerated
  // Faster reels for those behind (multiplies the countdown speed), index = rank-1.
  CW.ITEM_RATE_BY_RANK = [0.85, 0.92, 1.0, 1.0, 1.05, 1.1, 1.2, 1.3];
  CW.BATTLE_ITEMS = {
    haste:        { name: 'HASTE',         kind: 'self',   icon: 'boots',     color: '#7fdbff', desc: '+40% ATTACK SPEED · 6s', aspd: 0.4, dur: 6 },
    surge:        { name: 'POWER SURGE',   kind: 'self',   icon: 'knuckles',  color: '#ff7a1a', desc: '+35% DAMAGE · 5s', dmg: 0.35, dur: 5 },
    shield:       { name: 'CHAOS SHIELD',  kind: 'self',   icon: 'shield',    color: '#ffe14d', desc: 'INVULNERABLE · 4.5s (boss + rivals)', dur: 4.5 },
    bomb:         { name: 'BOMB',          kind: 'target', icon: 'bomb',      color: '#ff3b3b', desc: 'STUNS TARGET + 2 NEARBY RIVALS', stun: 1.6, splash: 2 },
    hex:          { name: 'HEX',           kind: 'target', icon: 'skullstaff',color: '#b44dff', desc: '-35% ATK SPEED, -25% DMG · 5s', aspd: -0.35, dmg: -0.25, dur: 5 },
    ghost:        { name: 'GHOST',         kind: 'target', icon: 'ghost',     color: '#c9f1ff', desc: 'SWAP WEAPONS WITH A RIVAL · 8s', slot: 'weapon' },
    swapCurse:    { name: 'SWAP CURSE',    kind: 'target', icon: 'swap',      color: '#c45cff', desc: 'SWAP YOUR WORST PIECE WITH THEIRS · 8s' },
    lightning:    { name: 'LIGHTNING',     kind: 'auto',   icon: 'bolt',      color: '#fff07a', desc: 'STUNS EVERY RIVAL' },
    crownBreaker: { name: 'CROWN BREAKER', kind: 'auto',   icon: 'crown',     color: '#ff2fa0', desc: 'HUNTS 1ST PLACE', warn: 1.6, stun: 2.5, dmg: -0.3, dur: 5 },
    tonic:        { name: 'CHAOS TONIC',   kind: 'self',   icon: 'bottle',    color: '#7dff7a', desc: 'RANDOM GOOD THING' },
    mimic:        { name: 'MIMIC',         kind: 'self',   icon: 'mimic',     color: '#d6a8ff', desc: "COPY THE LEADER'S BUFFS" },
    purge:        { name: 'PURGE',         kind: 'self',   icon: 'candle',    color: '#ffffff', desc: 'CLEANSE ONE DEBUFF' },
  };
  // Weights per race bucket: [1st, 2nd–3rd, 4th–6th, 7th–8th]. Weighting, not guarantees.
  CW.POSITION_ITEM_WEIGHTS = {
    haste:        [16, 12, 10, 8],
    surge:        [14, 12, 10, 9],
    shield:       [18, 10, 6, 4],
    purge:        [12, 7, 5, 3],
    tonic:        [12, 10, 8, 5],
    bomb:         [4, 10, 12, 11],
    hex:          [5, 10, 11, 8],
    mimic:        [2, 6, 7, 6],
    ghost:        [2, 6, 10, 13],
    swapCurse:    [1, 4, 7, 8],
    crownBreaker: [0, 3, 7, 11],
    lightning:    [0, 1, 4, 9],
  };
  CW.rankBucket = (rank) => (rank <= 1 ? 0 : rank <= 3 ? 1 : rank <= 6 ? 2 : 3);

  // ---------------------------------------------------------------- BOSS ATTACKS (telegraphed)
  CW.BOSS_ATTACKS = {
    slam:    { name: 'GROUND SLAM',   weight: 3, warn: 1.25, power: 1.6, radius: 95,  stun: 0.8 },
    beam:    { name: 'SHADOW BEAM',   weight: 3, warn: 1.0,  power: 1.3, targets: 3 },
    roar:    { name: 'ROAR',          weight: 2, warn: 0.9,  aspd: -0.3, dur: 3.5, power: 0.25 },
    meteors: { name: 'CHAOS METEORS', weight: 2, warn: 1.4,  power: 1.2, count: 4, radius: 55 },
  };
  CW.BOSS_ATTACK_EVERY = [3.4, 4.6]; // seconds between attacks (enrage speeds this up)

  // ---------------------------------------------------------------- PLACEMENT REWARDS
  // % of base raid reward by finishing place, THEN × raid pot. 1st also gets ECONOMY.mvpBonus + a Jack Token.
  CW.PLACEMENT_REWARDS = [1.0, 0.85, 0.75, 0.65, 0.6, 0.55, 0.5, 0.45];
  CW.RACE = { rankEvery: 0.25, leaderAnnounceCd: 2.5 };
})(typeof window !== 'undefined' ? window : globalThis);
