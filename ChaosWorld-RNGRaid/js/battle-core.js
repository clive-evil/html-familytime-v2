/* Loadout → combat numbers. deriveStats() is the ONLY place lobby items become combat numbers.
 * The boss race itself lives in battle-race.js.
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});

  // ------------------------------------------------------------ LOADOUT → STATS
  CW.deriveStats = function (loadout) {
    const hero = loadout.hero, weapon = loadout.weapon, gear = loadout.gear;
    const cls = CW.CLASSES[hero.classId];
    const hm = CW.HERO_RARITY_STATS[hero.rarity].mult;
    const ws = CW.WEAPON_RARITY_STATS[weapon ? weapon.rarity : 'common'];
    const gs = CW.GEAR_RARITY_STATS[gear ? gear.rarity : 'common'];
    const s = {
      classId: cls.id, role: cls.role, range: cls.range, dmgType: cls.dmgType,
      hp: cls.hp * hm * (1 + gs.hp),
      atk: cls.atk * hm * (1 + ws.dmg),
      aspd: cls.aspd * (1 + ws.aspd),
      crit: cls.crit + ws.crit,
      def: gs.def, dodge: 0, resist: 0, thorns: 0, lifesteal: 0, revive: 0,
      fx: weapon && weapon.fx && ws.fxChance > 0 ? weapon.fx : null,
      fxChance: ws.fxChance,
      skillPower: hm,
      skills: cls.skills.slice(),
    };
    if (gear && gear.mod) {
      const m = CW.GEAR_MODS[gear.mod];
      const v = (m.base * gs.modPower) / 100;
      if (gear.mod === 'haste') s.aspd *= 1 + v; else s[gear.mod] = v;
    }
    s.hp = Math.round(s.hp);
    s.atk = Math.round(s.atk * 10) / 10;
    s.dps = s.atk * s.aspd * (1 + (s.crit / 100) * (CW.BATTLE.critMult - 1));
    s.power = Math.round(s.dps * 4 + s.hp / 10);
    return s;
  };

  // Human-readable stat lines for an item card (keeps UI out of the maths).
  CW.itemStatLines = function (item) {
    if (!item) return [];
    if (item.slot === 'hero') {
      const c = CW.CLASSES[item.classId];
      const m = CW.HERO_RARITY_STATS[item.rarity].mult;
      return [`${c.role.toUpperCase()} · ${c.range.toUpperCase()}`, `HP ${Math.round(c.hp * m)} · ATK ${Math.round(c.atk * m)}`];
    }
    if (item.slot === 'weapon') {
      const w = CW.WEAPON_RARITY_STATS[item.rarity];
      const out = [`${w.dmg >= 0 ? '+' : ''}${Math.round(w.dmg * 100)}% DMG${w.crit ? ` · +${w.crit}% CRIT` : ''}`];
      if (item.fx && w.fxChance > 0) out.push(`${Math.round(w.fxChance * 100)}% ${CW.WEAPON_FX[item.fx].name.toUpperCase()}`);
      else out.push(item.fx ? `${CW.WEAPON_FX[item.fx].name.toUpperCase()} (DEAD AT COMMON)` : 'NO SPECIAL');
      return out;
    }
    const g = CW.GEAR_RARITY_STATS[item.rarity];
    const out = [g.hp ? `+${Math.round(g.hp * 100)}% HP · ${Math.round(g.def * 100)}% DEF` : 'BASICALLY CLOTHES'];
    if (item.mod) { const m = CW.GEAR_MODS[item.mod]; out.push(`${m.name.toUpperCase()} ${Math.round(m.base * g.modPower)}${m.unit}`); }
    return out;
  };

})(typeof window !== 'undefined' ? window : globalThis);
