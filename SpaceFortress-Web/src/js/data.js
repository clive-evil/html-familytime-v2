// Static game data: installation archetypes, weapons, upgrades and the campaign.
(function () {
  const SF = globalThis.SF;

  // ---------------------------------------------------------------- installations
  // armor: soft | hard | hardened | orbital.  mil: counts as a military target.
  SF.INST = {
    shield: {
      name: 'Shield Generator', icon: 'shield', armor: 'hard', hp: 180, mil: true,
      role: 'Projects the planetary shield. Every OTHER surface installation takes heavily reduced damage while it stands.',
      kill: 'Planetary shield collapses. Surface targets exposed; invasion defence falls sharply.',
    },
    cannon: {
      name: 'Anti-Orbital Cannon', icon: 'cannon', armor: 'hard', hp: 170, mil: true, fortDmg: 14, invDef: 0.15,
      role: 'Fires on the fortress every cycle and shreds descending dropships.',
      kill: 'Less fire on the fortress. Invasion losses drop.',
    },
    silo: {
      name: 'Missile Silo', icon: 'silo', armor: 'hard', hp: 130, mil: true, fortDmg: 24,
      role: 'Launches a heavy missile at the fortress every second cycle.',
      kill: 'No more missile strikes from this world.',
    },
    interceptor: {
      name: 'Interceptor Grid', icon: 'grid', armor: 'soft', hp: 100, mil: true, intercept: 0.35,
      role: 'Point defence. Each grid has a 35% chance to intercept each incoming missile.',
      kill: 'Missiles fly unopposed.',
    },
    barracks: {
      name: 'Garrison Base', icon: 'barracks', armor: 'soft', hp: 100, mil: true,
      role: 'Houses the bulk of the enemy ground army.',
      kill: 'Enemy ground strength collapses. Your invasion gets much cheaper.',
    },
    hq: {
      name: 'Military Command', icon: 'hq', armor: 'hard', hp: 160, mil: true, invDef: 0.3,
      role: 'Coordinates the defence (+30% enemy effectiveness) and organises repairs and reinforcement.',
      kill: 'Defenders lose coordination. Enemy repairs slow.',
    },
    power: {
      name: 'Power Station', icon: 'power', armor: 'soft', hp: 100, mil: true,
      role: 'Feeds the defence grid. While it stands, shields and guns run at full strength.',
      kill: 'Shield and guns on this world run at 50% efficiency.',
    },
    bunker: {
      name: 'Deep Bunker', icon: 'bunker', armor: 'hardened', hp: 240, mil: true,
      role: 'Buried fortress holding elite troops. Shrugs off most orbital fire. Bunker Busters and nukes reach it.',
      kill: 'The hard core of the defence is gone.',
    },
    station: {
      name: 'Orbital Defence Platform', icon: 'station', armor: 'orbital', hp: 150, mil: true, fortDmg: 16, invDef: 0.1, orbital: true,
      role: 'Armed platform in orbit, above the shield. Heavy bombardment cannot hit it.',
      kill: 'Orbit is clear.',
    },
    mine: {
      name: 'Mine', icon: 'mine', armor: 'soft', hp: 100, econ: true,
      role: 'Extraction site. Once captured it produces resources every cycle.',
      kill: 'Its future income is lost permanently.',
    },
    industry: {
      name: 'Industrial Zone', icon: 'industry', armor: 'soft', hp: 110, econ: true,
      role: 'Factories. Repairs enemy installations and reinforces troops. Captured, it yields metals and spoils.',
      kill: 'Enemy repairs stop, but the captured world is worth less.',
    },
    city: {
      name: 'City', icon: 'city', armor: 'soft', hp: 120, econ: true,
      role: 'Population centre. Fields a militia. Captured, it supplies recruits and a little income.',
      kill: 'Mass civilian casualties. No recruits from this world.',
    },
  };

  SF.ARMOR_NAME = { soft: 'Soft', hard: 'Armoured', hardened: 'Hardened', orbital: 'Orbital', ship: 'Warship' };

  // ---------------------------------------------------------------- weapons
  // dmg * mult[armor] * (vsType[instType] || 1).  shieldMult applies to shield-protected targets.
  SF.WEAPONS = {
    railgun: {
      name: 'RAILGUN', sub: 'Spinal mass driver', power: 30, perCycle: 1, accuracy: 0.8, shieldMult: 0.6, color: '#9fe8ff',
      blurb: 'Precise kinetic strike. Cheap. Excellent vs armour, warships and the shield generator. One shot per cycle.',
      ammo: {
        kinetic: { name: 'Kinetic Penetrator', cost: { metals: 6 }, dmg: 110, mult: { soft: 0.8, hard: 1.0, hardened: 0.6, orbital: 1.2, ship: 1.5 }, collat: 0.12, desc: 'Tungsten-core slug. Precise and reliable.' },
        frag: { name: 'Fragmentation Round', cost: { metals: 8 }, dmg: 85, mult: { soft: 1.35, hard: 0.6, hardened: 0.2, orbital: 0.9, ship: 1.0 }, collat: 0.3, garrisonHit: 0.08, desc: 'Air-burst over soft targets. Kills troops.' },
        buster: { name: 'Bunker Buster', cost: { metals: 12, fissile: 2 }, dmg: 130, mult: { soft: 0.7, hard: 1.1, hardened: 1.6, orbital: 0.8, ship: 1.0 }, collat: 0.1, req: 'rail_heavy', desc: 'Deep-penetration shell for hardened targets.' },
      },
    },
    laser: {
      name: 'ORBITAL LASER', sub: 'Focused thermal emitter', power: 40, perCycle: 9, accuracy: 0.97, shieldMult: 0.4, color: '#ff6a3d', req: 'laser_unlock',
      heat: 40,
      blurb: 'Sustained beam. No shells, but heavy power draw and heat. Excellent vs soft targets and power grids. Weak through shields.',
      ammo: {
        beam: { name: 'Sustained Beam', cost: { crystals: 2 }, dmg: 90, mult: { soft: 1.2, hard: 1.0, hardened: 0.3, orbital: 1.1, ship: 0.8 }, vsType: { power: 1.6 }, collat: 0.08, desc: 'Cuts through structures and power grids.' },
      },
    },
    missile: {
      name: 'MISSILE ARRAY', sub: 'Long-range strike racks', power: 15, perCycle: 1, accuracy: 0.92, shieldMult: 0.5, color: '#ffc04d',
      interceptable: true,
      blurb: 'Flexible payloads. Interceptor grids can shoot salvos down, so kill those first.',
      ammo: {
        conv: { name: 'Conventional', cost: { metals: 8 }, dmg: 90, mult: { soft: 1.1, hard: 0.9, hardened: 0.4, orbital: 0.8, ship: 0.9 }, collat: 0.22, desc: 'High-explosive warhead.' },
        emp: { name: 'EMP Payload', cost: { metals: 6, crystals: 4 }, dmg: 25, mult: { soft: 1, hard: 1, hardened: 0.3, orbital: 1, ship: 1 }, vsType: { shield: 2.5, power: 2.5 }, disable: 2, shieldMult: 1, collat: 0, req: 'mis_smart', desc: 'Disables shields, guns, grids and power for 2 cycles.' },
        nuke: { name: 'Nuclear Warhead', cost: { metals: 6, fissile: 10 }, dmg: 320, blast: 130, mult: { soft: 1.2, hard: 1.0, hardened: 0.55, orbital: 0.3, ship: 1.2 }, popLoss: 0.45, contam: 0.35, garrisonHit: 0.55, collat: 0, req: 'mis_nuke', desc: 'Devastates the whole world. Contaminates mines (-60% yield at full contamination).' },
      },
    },
    bombard: {
      name: 'HEAVY BOMBARDMENT', sub: 'Mass-driver barrage', power: 20, perCycle: 1, accuracy: 0.72, shieldMult: 0.3, color: '#ff9a5a',
      blurb: 'Blunt area barrage. Good vs troops, cities and soft targets. Heavy collateral damage. Cannot reach orbit.',
      ammo: {
        barrage: { name: 'Saturation Barrage', cost: { metals: 10 }, dmg: 75, mult: { soft: 1.3, hard: 0.7, hardened: 0.2, orbital: 0, ship: 0 }, collat: 0.5, collatTargets: 2, popLoss: 0.06, garrisonHit: 0.12, desc: 'Carpet of kinetic rods across the target zone.' },
      },
    },
  };
  SF.WEAPON_ORDER = ['railgun', 'laser', 'missile', 'bombard'];

  SF.PK = {
    name: 'PLANET KILLER', cost: { exotic: 40, fissile: 30 }, cooldown: 4, req: 'fort_pk',
    blurb: 'Annihilates a world. Every resource, every installation and every living thing on it is gone forever.',
  };

  // ---------------------------------------------------------------- fortress
  SF.FORT_BASE = { hull: 100, shield: 60, shieldRegen: 12, power: 100, troopCap: 50000, troopRegen: 600, troops: 40000 };
  SF.BASE_INCOME = { metals: 8 };
  SF.COSTS = {
    scan: { power: 10 },
    claim: { power: 10, metals: 20 },
    repair: { power: 10, metals: 20, hull: 25 },
    mine2: { metals: 35 },
    mine3: { metals: 70, crystals: 12 },
  };
  SF.MINE_MULT = [0, 1, 1.6, 2.4];
  SF.MINE_NAME = ['', 'Mine I', 'Mine II', 'Deep-Core Mine'];

  // ---------------------------------------------------------------- upgrades
  SF.BRANCHES = [
    { id: 'railgun', name: 'RAILGUN' },
    { id: 'laser', name: 'ORBITAL LASER' },
    { id: 'missile', name: 'MISSILES' },
    { id: 'ground', name: 'GROUND FORCES' },
    { id: 'defence', name: 'DEFENCE' },
    { id: 'fortress', name: 'FORTRESS CORE' },
  ];
  SF.UPGRADES = {
    rail_caps: { branch: 'railgun', name: 'Improved Capacitors', cost: { metals: 50, crystals: 8 }, desc: '+25% railgun damage. Charge draws 10 less power.' },
    rail_heavy: { branch: 'railgun', name: 'Heavy Penetrator', cost: { metals: 80, fissile: 12 }, req: 'rail_caps', desc: 'Unlocks Bunker Buster shells for hardened targets.' },
    rail_twin: { branch: 'railgun', name: 'Twin Rail Array', cost: { metals: 150, crystals: 20, fissile: 10 }, req: 'rail_heavy', desc: 'A second barrel. Railgun fires twice per cycle.' },
    laser_unlock: { branch: 'laser', name: 'Focused Beam Emitter', cost: { metals: 60, crystals: 25 }, desc: 'Installs the Orbital Laser.' },
    laser_cool: { branch: 'laser', name: 'Improved Cooling', cost: { metals: 60, crystals: 25 }, req: 'laser_unlock', desc: 'Less heat per shot (30) and faster cooling (60 per cycle).' },
    laser_lance: { branch: 'laser', name: 'Thermal Lance', cost: { metals: 110, crystals: 45, exotic: 5 }, req: 'laser_cool', desc: '+50% beam damage. The beam sweeps into a second installation.' },
    mis_smart: { branch: 'missile', name: 'Smart Guidance', cost: { metals: 60, crystals: 15 }, desc: 'Interception halved. Two salvos per cycle. Unlocks EMP payload.' },
    mis_nuke: { branch: 'missile', name: 'Nuclear Payload', cost: { metals: 80, fissile: 35 }, req: 'mis_smart', desc: 'Unlocks nuclear warheads. Fast, decisive, ruinous.' },
    troop_bay: { branch: 'ground', name: 'Troop Bay Expansion', cost: { metals: 55 }, desc: '+30,000 troop capacity. +1,000 recruits per cycle.' },
    troop_pods: { branch: 'ground', name: 'Assault Drop Pods', cost: { metals: 90, fissile: 10 }, req: 'troop_bay', desc: 'Troops fight 15% harder, lose 30% fewer, and capture a cycle faster.' },
    def_pd: { branch: 'defence', name: 'Point Defence Lattice', cost: { metals: 60, crystals: 12 }, desc: 'Incoming missiles and fleet fire -40%. +8 shield regen.' },
    def_armour: { branch: 'defence', name: 'Reinforced Armour', cost: { metals: 100, fissile: 10 }, req: 'def_pd', desc: '+60 hull. Weapon modules can no longer be knocked offline.' },
    fort_reactor: { branch: 'fortress', name: 'Reactor Upgrade', cost: { metals: 70, fissile: 15 }, desc: '+40 reactor power per cycle.' },
    fort_modules: { branch: 'fortress', name: 'Module Capacity', cost: { metals: 130, fissile: 25, crystals: 20 }, req: 'fort_reactor', desc: '+30 power, +40 hull, +20 shield.' },
    fort_pk: { branch: 'fortress', name: 'Planet Killer Infrastructure', cost: { metals: 200, fissile: 60, crystals: 60, exotic: 30 }, req: 'fort_modules', desc: 'Completes the annihilation chamber. Each firing costs 40 Exotic Matter + 30 Fissile.' },
  };

  // ---------------------------------------------------------------- campaign
  // Planet orbit: radius in world units from star (or parent), angle in radians.
  // type drives the procedural look.
  SF.CAMPAIGN = [
    {
      id: 'kessler', name: "KESSLER'S REACH", tag: 'Frontier', star: '#ffb347', threat: 0.6, fleets: [],
      brief: 'A lightly held frontier. Take Varn II intact. Its mine will fund the war.',
      planets: [
        { id: 'varn', name: 'VARN II', type: 'rocky', owner: 'enemy', orbit: 330, angle: 0.15, size: 46, pop: 0.3,
          desc: 'Frontier mining colony. Old guns, a small garrison.',
          insts: [{ type: 'cannon', name: 'Aging Anti-Orbital Cannon', hp: 90, fortDmg: 5 }, { type: 'barracks', garrison: 7000 }, { type: 'mine', yields: { metals: 8 } }],
          spoils: { metals: 45, crystals: 14 } },
        { id: 'ossa', name: 'OSSA', type: 'moon', owner: 'neutral', parent: 'varn', orbit: 95, angle: 2.4, size: 18, pop: 0,
          desc: 'Airless moon with an automated extraction rig. Unclaimed.',
          insts: [{ type: 'mine', yields: { metals: 5 } }, { type: 'mine', yields: { crystals: 3 } }] },
        { id: 'corvin', name: "CORVIN'S REST", type: 'desert', owner: 'enemy', orbit: 520, angle: 2.6, size: 40, pop: 1.2,
          desc: 'Dust-world township under a missile umbrella.',
          insts: [{ type: 'city', militia: 2500, recruits: 900, yields: { metals: 2 } }, { type: 'silo' }, { type: 'barracks', garrison: 6000 }, { type: 'mine', yields: { fissile: 3 } }],
          spoils: { metals: 30, fissile: 12 } },
        { id: 'kbelt', name: 'KESSLER BELT', type: 'asteroid', owner: 'neutral', orbit: 700, angle: 4.4, size: 22, pop: 0,
          desc: 'Mineral-rich asteroid cluster. Free to claim.',
          insts: [{ type: 'mine', yields: { metals: 4 } }, { type: 'mine', yields: { fissile: 2 } }] },
      ],
    },
    {
      id: 'halcyon', name: 'HALCYON DRIFT', tag: 'Fortified Colony', star: '#fff2c8', threat: 1.0, fleets: [3, 7, 11],
      brief: 'Meridian is shielded and rich. Bombarding it is easy. Capturing it is worth far more.',
      planets: [
        { id: 'meridian', name: 'MERIDIAN', type: 'terran', owner: 'enemy', orbit: 380, angle: 0.5, size: 58, pop: 6.5,
          desc: 'Prosperous garden colony. Shielded, well garrisoned, very valuable.',
          insts: [{ type: 'shield' }, { type: 'cannon' }, { type: 'interceptor' }, { type: 'barracks', garrison: 16000 }, { type: 'city', militia: 6000, recruits: 900, yields: { metals: 3 } }, { type: 'mine', yields: { metals: 12 } }, { type: 'industry', yields: { metals: 5 } }],
          spoils: { metals: 70, crystals: 18, fissile: 12 } },
        { id: 'pell', name: 'PELL', type: 'moon', owner: 'enemy', parent: 'meridian', orbit: 110, angle: 3.6, size: 20, pop: 0,
          desc: 'Crystal moon guarded by an orbital gun platform.',
          insts: [{ type: 'station' }, { type: 'barracks', garrison: 4800 }, { type: 'mine', yields: { crystals: 6 } }],
          spoils: { crystals: 15 } },
        { id: 'nadir', name: 'NADIR BELT', type: 'asteroid', owner: 'neutral', orbit: 640, angle: 3.0, size: 22, pop: 0,
          desc: 'Unclaimed ore field.',
          insts: [{ type: 'mine', yields: { metals: 6 } }, { type: 'mine', yields: { crystals: 2 } }] },
      ],
    },
    {
      id: 'aurum', name: 'AURUM CASCADE', tag: 'Resource System', star: '#ffd27a', threat: 1.6, fleets: [2, 4, 6, 8, 10, 12, 14, 16],
      brief: 'Sable holds Exotic Matter, the fuel of the Planet Killer. Ruin its mines and that future is gone.',
      planets: [
        { id: 'khepri', name: 'KHEPRI IV', type: 'arid', owner: 'enemy', orbit: 340, angle: 5.6, size: 56, pop: 3.1,
          desc: 'Excellent metals, high crystal yield. Shielded and well defended.',
          insts: [{ type: 'shield' }, { type: 'cannon' }, { type: 'cannon' }, { type: 'barracks', garrison: 16000 }, { type: 'power' }, { type: 'mine', yields: { metals: 14 } }, { type: 'mine', yields: { crystals: 7 } }],
          spoils: { metals: 60, crystals: 25 } },
        { id: 'thule', name: 'THULE', type: 'ice', owner: 'neutral', parent: 'khepri', orbit: 100, angle: 1.2, size: 18, pop: 0,
          desc: 'Frozen moon with fissile ice deposits.',
          insts: [{ type: 'mine', yields: { fissile: 5 } }] },
        { id: 'sable', name: 'SABLE', type: 'exotic', owner: 'enemy', orbit: 560, angle: 2.2, size: 44, pop: 0.2,
          desc: 'Violet crystal world. Its veins hold Exotic Matter, the rarest substance in the Reach.',
          insts: [{ type: 'interceptor' }, { type: 'bunker', garrison: 19200 }, { type: 'power' }, { type: 'hq', garrison: 4000 }, { type: 'mine', yields: { exotic: 4 } }, { type: 'mine', yields: { exotic: 3 } }],
          spoils: { exotic: 15, crystals: 10 } },
        { id: 'aurumg', name: 'AURUM', type: 'gas', owner: 'enemy', orbit: 780, angle: 4.0, size: 70, pop: 0,
          desc: 'Gas giant with a fissile skimmer platform in its upper cloud deck.',
          insts: [{ type: 'station' }, { type: 'barracks', garrison: 4000 }, { type: 'mine', name: 'Gas Skimmer', yields: { fissile: 6 } }],
          spoils: { fissile: 20 } },
      ],
    },
    {
      id: 'ironcrown', name: 'IRON CROWN', tag: 'Enemy Stronghold', star: '#ff7a5c', threat: 1.6, fleets: [2, 4, 6, 8, 10, 12, 14, 16],
      brief: 'The enemy war-world. Layered shields, bunkers and guns. No single weapon will do it alone.',
      planets: [
        { id: 'bastion', name: 'BASTION', type: 'fortress', owner: 'enemy', orbit: 360, angle: 0.9, size: 54, pop: 2.0,
          desc: 'Militarised world. Every hill is a gun emplacement.',
          insts: [{ type: 'shield' }, { type: 'power' }, { type: 'cannon' }, { type: 'cannon' }, { type: 'interceptor' }, { type: 'bunker', garrison: 25600 }, { type: 'hq', garrison: 4800 }],
          spoils: { metals: 110, fissile: 30, crystals: 20 } },
        { id: 'gallows', name: 'GALLOWS', type: 'moon', owner: 'enemy', parent: 'bastion', orbit: 105, angle: 4.0, size: 20, pop: 0,
          desc: 'Gun-moon ringed with orbital platforms.',
          insts: [{ type: 'station' }, { type: 'station' }, { type: 'silo' }, { type: 'barracks', garrison: 4800 }],
          spoils: { metals: 30 } },
        { id: 'ember', name: 'EMBER', type: 'lava', owner: 'enemy', orbit: 600, angle: 3.4, size: 42, pop: 0.8,
          desc: 'Volcanic forge-world rich in fissiles.',
          insts: [{ type: 'cannon' }, { type: 'barracks', garrison: 12800 }, { type: 'silo' }, { type: 'mine', yields: { fissile: 8 } }, { type: 'mine', yields: { metals: 8 } }],
          spoils: { fissile: 25, metals: 30 } },
      ],
    },
    {
      id: 'palethrone', name: 'THE PALE THRONE', tag: 'Final World', star: '#cfe4ff', threat: 1.9, fleets: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
      brief: 'Aeternum, the enemy capital. Thirty-eight million people. Take it, or erase it.',
      final: true,
      planets: [
        { id: 'aeternum', name: 'AETERNUM', type: 'capital', owner: 'enemy', orbit: 380, angle: 0.3, size: 66, pop: 38,
          desc: 'Capital world. Twin shields, deep bunkers, a vast city. The richest prize in the Reach.',
          insts: [{ type: 'shield', name: 'Primary Shield Array' }, { type: 'shield', name: 'Secondary Shield Array' }, { type: 'hq', garrison: 6400 }, { type: 'bunker', garrison: 25600 }, { type: 'bunker', garrison: 25600 }, { type: 'city', name: 'Aeternum Prime', militia: 12000, recruits: 2400, yields: { metals: 10, crystals: 5 } }, { type: 'cannon' }],
          spoils: { metals: 200, crystals: 60, fissile: 40, exotic: 20 } },
        { id: 'vigil', name: 'VIGIL', type: 'moon', owner: 'enemy', parent: 'aeternum', orbit: 115, angle: 2.0, size: 22, pop: 0,
          desc: 'Picket moon covering the capital.',
          insts: [{ type: 'station' }, { type: 'silo' }, { type: 'interceptor' }, { type: 'barracks', garrison: 6400 }],
          spoils: { metals: 40 } },
        { id: 'requiem', name: 'REQUIEM SHARD', type: 'asteroid', owner: 'neutral', orbit: 660, angle: 3.7, size: 22, pop: 0,
          desc: 'A fragment rich in Exotic Matter, ripe for the taking.',
          insts: [{ type: 'mine', yields: { exotic: 3 } }] },
      ],
    },
  ];
})();
