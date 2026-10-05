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
  CW.CLASSES = {
    brute:     { id: 'brute',     name: 'BRUTE',       role: 'dps',    range: 'melee',  dmgType: 'phys',  hp: 560, atk: 31, aspd: 0.95, crit: 5,  hat: 'hornhelm', tint: '#c0392b', skills: ['cleave', 'chaosSlam'],
                 variants: { common: 'Pit Brute', rare: 'Blood Knight', epic: 'Warlord', legendary: 'Chaos Lord', mythic: 'The Unmade King' } },
    ranger:    { id: 'ranger',    name: 'RANGER',      role: 'dps',    range: 'ranged', dmgType: 'phys',  hp: 400, atk: 30, aspd: 1.10, crit: 8,  hat: 'hood',     tint: '#2e8b57', skills: ['volley', 'deadeye'],
                 variants: { common: 'Bog Ranger', rare: 'Hawkeye', epic: 'Storm Ranger', legendary: 'Starfall Hunter', mythic: 'Eye of Ruin' } },
    hexer:     { id: 'hexer',     name: 'HEXER',       role: 'dps',    range: 'ranged', dmgType: 'spell', hp: 360, atk: 38, aspd: 0.75, crit: 6,  hat: 'wizard',   tint: '#6a3dcf', skills: ['fireball', 'meteor'],
                 variants: { common: 'Hedge Hexer', rare: 'Ember Magus', epic: 'Void Warlock', legendary: 'Archmage of Rot', mythic: 'The Unwritten' } },
    rogue:     { id: 'rogue',     name: 'ROGUE',       role: 'dps',    range: 'melee',  dmgType: 'phys',  hp: 420, atk: 24, aspd: 1.45, crit: 15, hat: 'mask',     tint: '#34495e', skills: ['backstab', 'smokeBomb'],
                 variants: { common: 'Gutter Rat', rare: 'Cutpurse', epic: 'Shadowblade', legendary: "Nightmother's Knife", mythic: 'No-One' } },
    bulwark:   { id: 'bulwark',   name: 'BULWARK',     role: 'tank',   range: 'melee',  dmgType: 'phys',  hp: 900, atk: 18, aspd: 0.80, crit: 4,  hat: 'bucket',   tint: '#7f8c8d', skills: ['taunt', 'rallyWall'],
                 variants: { common: 'Door Guard', rare: 'Ironhide', epic: 'Bastion', legendary: 'Living Fortress', mythic: 'The Wall That Walks' } },
    necro:     { id: 'necro',     name: 'NECROMANCER', role: 'dps',    range: 'ranged', dmgType: 'spell', hp: 400, atk: 27, aspd: 0.80, crit: 6,  hat: 'skullhood', tint: '#1abc9c', skills: ['raiseDead', 'soulDrain'],
                 variants: { common: 'Grave Digger', rare: 'Bonecaller', epic: 'Lich Adept', legendary: 'Lord of Bones', mythic: "Death's Accountant" } },
    cleric:    { id: 'cleric',    name: 'CLERIC',      role: 'healer', range: 'ranged', dmgType: 'spell', hp: 440, atk: 18, aspd: 0.80, crit: 5,  hat: 'mitre',    tint: '#f1c40f', skills: ['mend', 'sanctuary'],
                 variants: { common: 'Candle Monk', rare: 'Lightbinder', epic: 'High Priest', legendary: 'Saint of Chaos', mythic: 'The Unholy Pope' } },
    berserker: { id: 'berserker', name: 'BERSERKER',   role: 'dps',    range: 'melee',  dmgType: 'phys',  hp: 600, atk: 30, aspd: 1.00, crit: 7,  hat: 'viking',   tint: '#e67e22', skills: ['frenzy', 'rampage'],
                 variants: { common: 'Bar Brawler', rare: 'Rage Viking', epic: 'Bloodfrenzy', legendary: 'Wrath Incarnate', mythic: 'The Red Mist' } },
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
    brute: {
      common:    [{ name: 'Rusty Sword', kind: 'sword' }, { name: 'Plank With A Nail', kind: 'club' }],
      rare:      [{ name: 'Fire Axe', kind: 'axe', fx: 'burn' }, { name: 'Iron Cleaver', kind: 'cleaver', fx: 'bleed' }],
      epic:      [{ name: 'Flaming Greatsword', kind: 'greatsword', fx: 'burn' }, { name: 'Dread Maul', kind: 'hammer', fx: 'stun' }],
      legendary: [{ name: 'Chaos Blade', kind: 'greatsword', fx: 'voidEcho' }],
      mythic:    [{ name: 'Worldsplitter', kind: 'greatsword', fx: 'cataclysm' }],
    },
    ranger: {
      common:    [{ name: 'Bent Bow', kind: 'bow' }, { name: 'Slingshot', kind: 'sling' }],
      rare:      [{ name: 'Yew Longbow', kind: 'bow', fx: 'bleed' }, { name: 'Crossbow of Spite', kind: 'crossbow', fx: 'stun' }],
      epic:      [{ name: 'Storm Bow', kind: 'bow', fx: 'chain' }, { name: 'Venom Repeater', kind: 'crossbow', fx: 'poison' }],
      legendary: [{ name: 'Starfall Bow', kind: 'bow', fx: 'voidEcho' }],
      mythic:    [{ name: 'The Last Arrow', kind: 'bow', fx: 'cataclysm' }],
    },
    hexer: {
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
    bulwark: {
      common:    [{ name: 'Bin Lid & Club', kind: 'shield' }, { name: 'Old Door', kind: 'shield' }],
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
    rollPhaseMax: 40,          // hard cap; idle humans get auto-pulled
    humanAutoPullSec: 7,       // idle time before your pull fires itself
    botFirstPull: [0.8, 3.0],
    botBetweenPulls: [1.4, 3.6],
    reelMin: 1.3,              // reel spin before reveal (rarity adds its own revealMs)
    preChaosPause: 1.6,
    launchCountdown: 3.5,
    fastScale: 0.18,           // fast mode multiplies all lobby timings by this
    battleFastSpeed: 3,
  };

  // ---------------------------------------------------------------- ECONOMY / REWARDS
  CW.ECONOMY = {
    startCoins: 800, startChaos: 1, startJack: 2, startGrief: 1,
    winBase: 250,
    mvpBonus: 40,
    lossConsolation: 60,
    tokenDrops: { chaos: 0.14, jack: 0.12, grief: 0.10 }, // per win, scaled up by pot (x pot)
    lossTokenDrop: 0.03,
    botCoins: [350, 950],
    botTokens: { chaos: [0, 1], jack: [0, 2], grief: [0, 1] },
  };

  // ---------------------------------------------------------------- BOTS
  // Weighted personalities. w* = chance per "think" to try that action.
  CW.BOT_PERSONALITIES = {
    greedy:    { label: 'THE GREEDY ONE', think: [1.6, 3.0], wBoost: 0.70, wSteal: 0.10, wGrief: 0.06, wReroll: 0.15, wShuffle: 0.02, boostCeil: 200, boostMax: 2, griefMax: 1, chatty: 0.6 },
    rat:       { label: 'THE RAT',        think: [1.4, 2.6], wBoost: 0.05, wSteal: 0.80, wGrief: 0.2, wReroll: 0.10, wShuffle: 0.02, boostCeil: 140, boostMax: 0, griefMax: 1, chatty: 0.7 },
    griefer:   { label: 'THE GRIEFER',    think: [1.3, 2.4], wBoost: 0.08, wSteal: 0.25, wGrief: 0.85, wReroll: 0.08, wShuffle: 0.00, boostCeil: 160, boostMax: 0, griefMax: 2, chatty: 0.8 },
    coward:    { label: 'THE COWARD',     think: [2.4, 4.0], wBoost: 0.25, wSteal: 0.05, wGrief: 0.03, wReroll: 0.30, wShuffle: 0.00, boostCeil: 130, boostMax: 1, griefMax: 0, chatty: 0.5 },
    highroller:{ label: 'THE HIGH ROLLER',think: [1.3, 2.4], wBoost: 0.20, wSteal: 0.20, wGrief: 0.08, wReroll: 0.85, wShuffle: 0.35, boostCeil: 200, boostMax: 1, griefMax: 1, chatty: 0.6 },
    hype:      { label: 'THE HYPE MAN',   think: [2.0, 3.4], wBoost: 0.35, wSteal: 0.10, wGrief: 0.05, wReroll: 0.20, wShuffle: 0.05, boostCeil: 190, boostMax: 1, griefMax: 1, chatty: 1.0 },
    grudge:    { label: 'THE GRUDGE',     think: [1.8, 3.0], wBoost: 0.10, wSteal: 0.30, wGrief: 0.3, wReroll: 0.20, wShuffle: 0.02, boostCeil: 170, boostMax: 0, griefMax: 1, chatty: 0.6, revenge: 0.9 },
  };

  // look = Overlord appearance. body/belly colours, horns, eyes, mouth, extra.
  CW.BOT_ROSTER = [
    { name: 'BIGCLIVE99',    personality: 'greedy',     level: 11, look: { body: '#7bc142', belly: '#c9e89a', horns: 'curl',    eyes: 'big',    mouth: 'grin',  extra: 'gold' } },
    { name: 'GODSPEED',      personality: 'highroller', level: 23, look: { body: '#3b82f6', belly: '#a9cdfc', horns: 'spike',   eyes: 'cool',   mouth: 'smirk', extra: 'shades' } },
    { name: 'PUNCHFACE99',   personality: 'hype',       level: 7,  look: { body: '#f97316', belly: '#fed7aa', horns: 'nub',     eyes: 'big',    mouth: 'open',  extra: 'bandage' } },
    { name: 'SIRLOINS',      personality: 'rat',        level: 15, look: { body: '#a16207', belly: '#e9c98a', horns: 'ears',    eyes: 'shifty', mouth: 'teeth', extra: 'whiskers' } },
    { name: 'NANA_RAGE',     personality: 'griefer',    level: 31, look: { body: '#db2777', belly: '#fbcfe8', horns: 'spike',   eyes: 'angry',  mouth: 'fangs', extra: 'curlers' } },
    { name: 'MOTHMAN_TTV',   personality: 'coward',     level: 4,  look: { body: '#a3a3a3', belly: '#e5e5e5', horns: 'antenna', eyes: 'worried',mouth: 'wobble',extra: 'none' } },
    { name: 'xX_GOBLINA_Xx', personality: 'grudge',     level: 19, look: { body: '#10b981', belly: '#a7f3d0', horns: 'ears',    eyes: 'angry',  mouth: 'fangs', extra: 'nosering' } },
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
  };

  // ---------------------------------------------------------------- DUNGEON
  CW.BIOMES = [
    { id: 'gutter', name: 'THE GUTTERWORKS',  difficulty: 2, sky: '#1d2a1f', floor: '#33402b', glow: '#9cff57', enemies: ['sludge', 'ratman', 'gutterGob'], elite: 'bigRat',   boss: 'grubmaw' },
    { id: 'bones',  name: 'THE BONE ORCHARD', difficulty: 3, sky: '#221a2b', floor: '#3b3045', glow: '#c9b8ff', enemies: ['skelly', 'boneDog', 'ghoul'],     elite: 'boneKnight', boss: 'orchardKing' },
    { id: 'molten', name: 'THE MOLTEN CRYPT', difficulty: 3, sky: '#2a1512', floor: '#4a2418', glow: '#ff8a3d', enemies: ['imp', 'magmaSlug', 'cinderGob'],  elite: 'magmaBrute', boss: 'pyreMother' },
  ];

  // hp/atk are base values before raid modifiers. size = draw scale. shape = drawer.
  CW.ENEMIES = {
    sludge:      { name: 'Sludge',         hp: 820,  atk: 22, aspd: 0.7, shape: 'blob',   color: '#7fbf3f', size: 1.0 },
    ratman:      { name: 'Ratman',         hp: 640,  atk: 26, aspd: 1.0, shape: 'rat',    color: '#8d6e63', size: 0.95 },
    gutterGob:   { name: 'Gutter Goblin',  hp: 720,  atk: 24, aspd: 0.9, shape: 'gob',    color: '#6fae4f', size: 0.95 },
    bigRat:      { name: 'ELITE Rat King', hp: 2600, atk: 46, aspd: 0.8, shape: 'rat',    color: '#5d4037', size: 1.4, elite: true },
    grubmaw:     { name: 'GRUBMAW THE BLOATED', hp: 11000, atk: 60, aspd: 0.65, shape: 'blob', color: '#9ccc65', size: 2.3, boss: true },
    skelly:      { name: 'Skelly',         hp: 640,  atk: 25, aspd: 1.0, shape: 'skull',  color: '#e8e2d0', size: 0.95 },
    boneDog:     { name: 'Bone Dog',       hp: 600,  atk: 27, aspd: 1.2, shape: 'rat',    color: '#d7ccc8', size: 0.9 },
    ghoul:       { name: 'Ghoul',          hp: 820,  atk: 23, aspd: 0.8, shape: 'gob',    color: '#8e9aaf', size: 1.0 },
    boneKnight:  { name: 'ELITE Bone Knight', hp: 2700, atk: 44, aspd: 0.8, shape: 'skull', color: '#bdb6a3', size: 1.4, elite: true },
    orchardKing: { name: 'THE ORCHARD KING', hp: 11500, atk: 58, aspd: 0.7, shape: 'skull', color: '#cfc6b0', size: 2.3, boss: true },
    imp:         { name: 'Imp',            hp: 600,  atk: 27, aspd: 1.1, shape: 'gob',    color: '#ff5a36', size: 0.85 },
    magmaSlug:   { name: 'Magma Slug',     hp: 880,  atk: 21, aspd: 0.7, shape: 'blob',   color: '#ff8a3d', size: 1.0 },
    cinderGob:   { name: 'Cinder Goblin',  hp: 700,  atk: 25, aspd: 0.9, shape: 'gob',    color: '#b0411f', size: 0.95 },
    magmaBrute:  { name: 'ELITE Magma Brute', hp: 2800, atk: 45, aspd: 0.75, shape: 'blob', color: '#e8590c', size: 1.4, elite: true },
    pyreMother:  { name: 'PYRE MOTHER',    hp: 11200, atk: 60, aspd: 0.68, shape: 'gob',  color: '#ff6b2b', size: 2.3, boss: true },
  };
  // Waves: counts of regular mobs; last wave = boss + adds.
  CW.WAVES = [
    { mobs: 4, eliteRoll: false },
    { mobs: 5, eliteRoll: true },
    { boss: true, adds: 2 },
  ];
  CW.BATTLE = {
    enemyHpScale: 1.4,         // global tuning knobs
    enemyAtkScale: 2.3,
    baseEliteChance: 0.15,
    waveHealPct: 0.30,         // party heals this % between waves
    critMult: 1.8,
    bossEnrage: { aspd: 0.25, atk: 0.12, addsAtHalf: 3 },
    maxTime: 150,              // safety: boss wins on timeout
    stunSec: 1.0,
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
  };
})(typeof window !== 'undefined' ? window : globalThis);
