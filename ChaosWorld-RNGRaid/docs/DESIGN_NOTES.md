# RNG Raid — design + tech notes

> **V2 (current).** Sections below the V2 block describe V1 systems that are still in place (rarity, chaos-phase
> actions, raid pot tiers, bot personalities). Where V2 changed something it says so here.

## V2 at a glance
`MENU → LOBBY (intro → 3 simultaneous rounds → CHAOS 18/20s → LOADOUTS LOCKED [waits for you] → BOON VOTE 10s → 3·2·1)
→ BOSS RACE (one boss, all 8 raiders; mid-fight vote at 50%) → PODIUM`

### Simultaneous rounds (lobby-core `startRound`)
* You press **SPIN** (auto after 7s idle); all 8 players' slot for that round starts spinning on the same frame.
* Each reel gets its own landing time: ordinary results drop in randomly from **1.15s** in **0.14–0.34s** steps.
  Legendary+/Chaos results, fake-outs (5% of reels, Commons that hang on) and ~45% of Epics are held for a
  **dramatic tail**: +0.65–1.0s gap, then 0.55–0.9s apart, biggest last.
* When only the tail is left, a `lastSpinning` beat fires: cards glow **STILL SPINNING…**, the crowd turns to look,
  someone says "COME ON". Tunables: `CW.ROUND_REEL`.

### Protect (lobby-core `protect`)
* Offered during the Chaos Phase for **Legendary or Chaos** items (your slot sheet, or the PROTECT button).
* Costs **all your coins** (tokens kept but unusable) and sets `locked`: reroll/shuffle/steal/grief/boost/protect
  all return *LOCKED IN*.
* Steal chance × `PROTECTION_STEAL_MULTIPLIER` (0.25 → Legendary 12% → 3%, Chaos 5% → 1.25%). Never absolute: a
  success emits `wardBroken` → **WARD BROKEN!** slam, victim panics, everyone reacts.
* Grief Raid: Legendary+ is already unstealable, so the ward protects against **curses** instead — a curse only
  passes `PROTECT.griefPassChance` (30%); cost is spent either way ("WARD HELD").
* Bots: per-personality chance (Coward 85%/95%, Greedy Mythic-only 90%, High Roller 8%, Rat 5%…). Measured: ~0.3
  protects per lobby.

### LOADOUTS LOCKED
Chaos ends → phase `locked` with no timer. Cards show READY (bots), PWR, ward badges, raid pot; tapping any item
opens an inspect sheet. Only **CONTINUE TO RAID** (or Space) moves on.

### Boon votes (vote-core `BoonVote`)
* 3 random boons from `BOON_OPTIONS` (Bloodlust, Iron Skin, Fortune's Favour, Executioner, Critical Mass, Vampiric
  Pact, Chaos Blessing, Second Wind). 10s. Bots vote between 1.2–8.5s, weighted by personality prefs + a herd pull
  towards the current leader. Votes appear on cards/as faces on the options.
* Most votes wins; a tie triggers a **seeded tie-break spin** (deterministic per seed); debug can force the result.
* **Mid-fight:** first time the boss drops to 50% the battle **pauses** (battle time, cooldowns, effect timers and
  telegraphs all frozen) for a second vote. Its options never include an already-won boon and never repeat the
  first vote's exact set. Both boons stack and apply to all 8 raiders.

### Boss race (battle-race.js)
* Isometric staging: boss upper-right, raiders on a diagonal lower-left → centre (you near the front).
* Boss attacks are **telegraphed** (zones fill / beams aim before impact): Ground Slam (zone + stun), Shadow Beam
  (3 targets, Knights' Taunt draws it), Roar (everyone −30% attack speed 3.5s), Chaos Meteors (4 zones).
  Enrage < 25% HP; a x2.0 pot boss starts tougher/angrier. Big crits make the boss flinch.
* Knocked-out raiders get up after 6s at 50% HP (uptime matters). Lose = all 8 down at once, or the 120s berserk timer.
* **Ranking** = boss damage + 0.1 × healing (`BATTLE.healScoreWeight`). Healing can't dominate; the board reads as
  "who did the most boss damage". Recomputed every 0.25s; overtakes emit `rankChange` (▲/▼ markers, OVERTAKEN!) and
  `newLeader` banners.
* Class attack values are calibrated (`tools/class-calibrate.js`) so the class roll doesn't decide the race —
  measured avg finishing place per class 3.9–5.5; 1st/8th damage ≈1.7×; ~9 lead changes per raid.

### Battle items
* Every raider has one item slot. A reel spins (1.4s) roughly every `ITEM_INTERVAL` (10s) — faster further back
  (`ITEM_RATE_BY_RANK`, 0.85× for 1st → 1.3× for 8th). **While you hold an item the next reel waits.**
* Result is weighted by race bucket (`POSITION_ITEM_WEIGHTS`: 1st / 2–3 / 4–6 / 7–8) blended by
  `COMEBACK_STRENGTH` (0 = flat odds, 1 = full, 2 = exaggerated). Weighting, not guarantees: 1st can (rarely) roll a
  Bomb; last place still rolls plain Haste.

| Item | Type | Effect |
|---|---|---|
| HASTE | self | +40% attack speed 6s |
| POWER SURGE | self | +35% damage 5s |
| CHAOS SHIELD | self | invulnerable 4.5s to boss hits **and** rival items |
| BOMB | target | target + 2 nearest rivals stunned 1.6s, attacks interrupted |
| HEX | target | −35% attack speed, −25% damage, 5s |
| GHOST | target | swap **weapons** for 8s (`GHOST_DURATION`), then both restored — lobby loadouts untouched |
| SWAP CURSE | target | swap your weakest piece (weapon/gear where they're most better) for 8s |
| LIGHTNING | auto | every rival (not the caster, not shielded) stunned `LIGHTNING_DURATION` = 3.5s (debug: 3/5/10) |
| CROWN BREAKER | auto | locks on the current 1st (2nd if you're 1st): 1.6s warning, then 2.5s stun + −30% dmg 5s. Shield/Purge in the window saves them |
| CHAOS TONIC | self | random: haste / crit / short shield / 40% heal / surge |
| MIMIC | self | copy the leader's active buffs (fizzles into a small surge if none) |
| PURGE | self | remove one debuff (stun → crown warning → hex → curse → roar → being swapped) |

* One swap per raider at a time (no chained Ghosts). Swaps restore on timeout, on Purge, and at battle end.
* Bot item AI: personality hold windows (High Roller fires instantly, Greedy sits on it 6–11s), Coward holds Shield
  until threatened, Rat Ghosts 1st place, Griefer Bombs the biggest cluster, Grudge targets whoever hit them,
  back-markers fire at leaders immediately, leaders use defensive items fast. Occasional authored lines.

### Rewards by placement
`coins = winBase (400) × PLACEMENT_REWARDS[place] (100/85/75/65/60/55/50/45%) × raid pot` + 100 winner bonus and a
Jack Token for 1st. Token drop chances scale with pot (+25% for podium). Loss: 60 consolation for everyone
("WE GOT GREEDY" at pot ≥ x1.5). Podium shows the top three characters, then 4th–8th, plus up to three awards
(Most Chaotic, Thief, Biggest Hit).

### Measured balance (sims: `npm run sim:balance`, `npm run sim:lobby`)
| | win | avg length | KOs | lead changes |
|---|---|---|---|---|
| random loadouts x1.0 | 99% | 82s | 3.7 | 8.5 |
| random x1.5 | 98% | 93s | 7.7 | 9.3 |
| random x2.0 | 58% | 112s | 19 | 8.9 |
| all Common x1.0 / x2.0 | 68% / 0% | 113s / 120s | | |
| all Legendary x2.0 | 100% | 46s | | |

Lobby (human idle): RNG Raid ends ≈x1.35, Grief Raid ≈x1.64; ≈0.3 bot protects per lobby; ≈70s lobby.

### Art
No Battle Lab art was reachable. Placeholder archetypes (Scrub, Knight, Archer + Mage, Berserker, Rogue, Cleric,
Necromancer, Paladin) and three giant bosses are procedural, in one shared ink/flat-fill system. All drawing goes
through `ArtPack` → see `docs/ART_SWAP.md`.

---
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

## (V1) Swapping in BattleLab — superseded by docs/ART_SWAP.md for art
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
