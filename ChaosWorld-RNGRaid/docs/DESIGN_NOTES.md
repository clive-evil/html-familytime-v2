# RNG Raid — design + tech notes

## Flow
`MENU → LOBBY (intro 2s → ROLL ≤40s → CHAOS 18/20s → LAUNCH 3.5s countdown) → DUNGEON (3 waves, boss) → RESULTS → PLAY AGAIN`

The lobby is real-time: modals never pause it, so deciding whether to spend a token costs you seconds.

## Pulls
* Rarity odds: Common 55 / Rare 28 / Epic 13 / Legendary 3.5 / Chaos (mythic) 0.5 — `CW.RARITIES[].weight`.
* Hero rarity = a named variant of the class (Common *Pit Brute* … Legendary *Chaos Lord* … Chaos *The Unmade King*).
* Weapon pool is `CW.WEAPONS[classId][rarity]`, so it always fits the hero. Gear is class-agnostic.
* Reels slow down, Legendary/Chaos reels *tease* (gold shake + rising tone) before landing; 6% of Commons fake the tease.
* Rarity reads without colour: frame shape (plain → rivets → hatched → gold rays → glitch), pip count 1–5, label text,
  reveal behaviour (thump → burst → rays + screen flash + lobby-wide reaction banner).
* Bots roll on staggered timers so you watch other people's pulls; Legendary pulls trigger a banner, card flash,
  crowd turning to look, and authored chat ("of course he gets that", "bro got sandals").

## Chaos phase
| Action | Cost | Rule |
|---|---|---|
| Reroll | 100c, +50 per reroll | one slot, fresh rarity roll (can be worse). Hero reroll reforges your weapon to the new class at the same rarity |
| Shuffle | 1 Chaos Token | all three re-rolled, confirm modal "Potentially lose it all" |
| Steal | 1 Jack Token or 300c | weapon/gear only. Odds C75/R55/E30/L12/M5%. Success = forced swap (weapons reforge to each class). 2.4s suspense dial. Victim is "on guard" 5s |
| Grief | R→C 50c, E→R 100c, L→E 200c, M→L 1 Grief Token | exactly one tier, can't go below Common, 3 per human / 1–2 per bot, victim immune 6s. Cracks + curse beam + banner naming who did it |
| Boost | 100c | pot +x0.1, cap x2.0 |

### Raid pot (stored as integer hundredths)
| pot | added danger |
|---|---|
| x1.25 | +10% enemy HP |
| x1.5 | +20% enemy damage |
| x1.75 | elite chance 15% → 45% |
| x2.0 | **CHAOS RAID** — boss enraged (+25% atk speed, +12% dmg, spawns adds at 50%), red lobby lighting |

Measured (`npm run sim:balance`, human auto-casting): random lobby wins ≈96% at x1.0, ≈83% at x1.5, ≈41% at x2.0;
all-Common lobby at x2.0 ≈2%; all-Legendary ≈100%. So x2 is a real gamble and the loadout matters.

Bot economy (`npm run sim:lobby`, human idle): RNG Raid ends ≈x1.36 avg, Grief Raid ≈x1.65 — bots will juice it, but
reaching x2.0 needs the human to push. Grief raid ≈5 griefs + ≈7 steal attempts per lobby; the human gets hit ≈1.3×.

### Bot personalities (`CW.BOT_PERSONALITIES`)
Greedy One (boosts, ceiling x2.0) · Rat (steals) · Griefer (curses, 2 per lobby) · Coward (never boosts past x1.3,
panics when others do) · High Roller (rerolls/shuffles) · Hype Man (chatty, boosts) · Grudge (revenge-targets whoever hit
them). Simple weighted choice per "think" tick; a 4s cooldown stops bots dog-piling the human.

## Loadout → battle (`CW.deriveStats`)
* **Hero/class**: base HP/ATK/attack speed/crit, role (dps/tank/healer), range, two skills. Hero rarity ×1.00–1.58 HP/ATK/skill power.
* **Weapon**: Common −15% dmg / no special … Legendary +35% dmg, +12% crit, +15% attack speed, 15% special …
  Chaos +55%. Specials: Burn, Bleed, Poison, Stun, Chain Zap, Holy Burst (heal), Void Echo (repeat hit), Cataclysm (hit all).
  e.g. Legendary Void Staff → `+35% DMG · +12% CRIT · 15% VOID ECHO`.
* **Gear**: +0–45% HP, 0–20% damage reduction, plus a mod scaled by rarity: Dodge, Resist, Haste, Thorns, Lifesteal, Revive-once.
* Griefed items keep their name but fight at their new rarity. All 8 lobby players fight; Legendary heroes glow.

## Rewards
Win: 250 × pot (breakdown shows the pot's share) + 40 MVP bonus if you top the damage/heal board; token drop chances
(Chaos 14%, Jack 12%, Grief 10% in Grief Raid) scale with the pot. Loss: 60 coins; at pot ≥x1.5 the results screen calls
it "YOU LOST THE JUICED RAID. WE GOT GREEDY."

## Swapping in BattleLab
BattleLab wasn't available here (see README). To use its combat instead of `battle-core.js`:
1. Input contract: `lobby.partySpec()` → 8 × `{ id, name, isHuman, look, loadout: { hero, weapon, gear } }` and
   `CW.raidMods(pot)` → `{ enemyHp, enemyDmg, eliteChance, bossEnraged }`.
2. Map items to BattleLab units through `CW.deriveStats(loadout)` (single place lobby items become numbers).
3. Output contract: call `App.finishBattle({ won, why })` and expose per-unit `stats[uid] = { pid, dmg, heal }` for the board.
Only `js/battle-core.js` + `js/battle-ui.js` need replacing; lobby, economy, save and tests stay.

## Known issues / not done
* BattleLab assets/mechanics could not be reused (not in repo) — battle is an original stand-in in the same comic style.
* Bots are local simulations; there is no networking. Their "minds" don't see your modal (the lobby keeps running).
* Audio is procedural placeholder (hooks named for real assets). Verified to execute without errors, not judged by ear.
* Battle movement is formation-based (melee lunge, ranged projectiles) rather than free pathing.
* Healers often top the "who carried" board because healing counts with damage.
* Very long names can be truncated on player cards.
