# REFERENCE AUDIT: "Royal Smash! - Physics Puzzle" (Cypher Games)

- Google Play id: `com.cyphergames.royalsmash`; App Store id `6780891673`
- Publisher: Cypher Games (CYPHER GAMES YAZILIM PAZARLAMA ANONIM SIRKETI, Istanbul, Turkey), an indie mobile studio (cyphergames.com).
- Research date: 2026-10-05
- Purpose: structural reference for an ORIGINAL bowling-ball physics-puzzle game. Do not copy names, art, level layouts or text.

> **Important method note:** in this research environment, direct page fetching (Google Play, App Store, AppBrain, YouTube, APK sites, GameCompass) was blocked by the network egress proxy. All evidence below comes from **web-search result snippets and search-engine summaries** of those pages. Treat every "CONFIRMED" item as "confirmed by a search snippet of the named page", not as verified by reading the full page. Re-verify key numbers by hand on a device before relying on them.

> **Key difference from our concept:** the reference uses a **cannon firing cannonballs** (one-tap angle + power), not a rolled/thrown bowling ball. The "ball" in reviews = a cannonball shot.

---

## Executive summary (core loop as evidenced)

1. Each level is a 3D scene of towers/structures (jars, stone blocks, towers) on a platform; the goal is to knock everything down / off the table.
2. Player fires a "royal cannon": set angle, charge power, fire, with "simple one-tap aiming" (store description).
3. Physics-based destruction with chain reactions is the core spectacle ("oddly satisfying").
4. Each level has a limited number of balls/shots (reviews cite level allotments such as 18 balls, formerly 22).
5. Running out of balls triggers an offer to buy **5 extra balls for 900 coins** (reviews).
6. Winning pays coins: **15 coins for an average level, 50 for a "super hard" level** (reviews).
7. "Super hard" levels appear roughly **every 6-7 levels** (review).
8. Candy-Crush-style **5 lives** that regenerate over time; timed "unlimited lives" rewards exist (reviews).
9. Monetization: interstitial ads (after level / every 2-3 levels per some reviews), Remove Ads IAP, coin packs, Level End Offer, Special Offer, packs ($1.99-$99.99).
10. Meta: a "Journey" (clear levels, hit milestones, unlock new areas; added v1.11 with first 300 levels rebuilt), plus limited-time events ("Build Up Event", "Trouble Trap", "Power Play") and "Daily Gains".

### Numerical values found (sourced only)

| Value | Figure | Source |
|---|---|---|
| Coins per average level | 15 | User review (via search snippet of Play/App Store/GameCompass pages) |
| Coins per super-hard level | 50 | Same |
| Extra balls continue | 5 balls for 900 coins | App Store reviews (search snippet) |
| Balls per level (example) | 18 now, previously 22 on certain levels | Review (search snippet) |
| Lives | 5, regenerate over time | Review (search snippet) |
| Life regen time | **Not confirmed** | (a 30-min figure surfaced only for *Royal Match*, a different game, so it does not apply here) |
| Super-hard cadence | about every 6-7 levels | Review |
| IAP: 1000 Gold | $1.99 | App Store listing (search summary) |
| IAP: Special Offer | $2.99 | Same |
| IAP: Level End Offer | $3.99 | Same |
| IAP: Pack 4.99 / Pack 9.99 | $4.99 / $9.99 | Same |
| IAP price range | up to $99.99 | Same |
| Ratings | App Store US 4.7 (about 92K ratings); UK 4.6 (about 4.7K); Google Play about 4.6 (about 303K reviews); 5M+ downloads | Search snippets |
| Latest known versions | 1.13 (what's new: "Trouble Trap and Power Play"); APK mirror lists 1.14.386; an update dated about 2026-09-20 mentioned | Search snippets |

---

## 1. First 10 levels
**CONFIRMED IN REFERENCE**
- Not confirmed in accessible sources (content). YouTube walkthroughs exist covering them: "Royal Smash! Physics Puzzle Level 1: Gameplay Solution" (youtube.com/watch?v=hr_HTH0wYYM), "Royal Smash - Levels 1 to 20 Full Gameplay" (55bvWxHBnTA), "Royal Smash! Physics Puzzle Levels 1-20 Gameplay" (m-vZ7OndcAU), "All Levels 1-30" (20mk0_bd2QM). The videos could not be watched.
- v1.11 "what's new": "the first 300 levels have been rebuilt from the ground up" (App Store, via search). So early-level content changed in 2026, and older videos may show the old layouts.

**INFERRED**
- Uptodown says levels rise "from relaxing knockdowns to skill tests". The first 10 are probably simple single-structure knockdowns with generous ball counts. Given the about 6-7 level super-hard cadence, there is possibly a first "hard" spike around level 6-10.

**OUR ADAPTATION**
- 20 hand-authored levels (no procedural stacks). L1-3 are near-unfailable "instant satisfaction" racks (classic ten-pin, 15-pin, a 3-storey weak-point tower); L4-6 add one idea each (domino fork, launch ramp, hook). See `src/levels/levels.js` and DESIGN.md level table.

## 2. Tutorial
**CONFIRMED IN REFERENCE**
- A YouTube video is titled "Royal Smash! - Physics Puzzle - Gameplay Walkthrough Part 1 - Tutorial (iOS, Android)" (youtube.com/watch?v=EiNq5JpPYn0), so some tutorial exists. Its content was not viewable.
- Store copy: "takes seconds to learn, but mastering every royal level requires true precision and perfect timing."

**INFERRED**
- Likely a hand/finger prompt showing the one-tap angle + power flow on level 1, with no text-heavy tutorial (typical for this genre; not verified).

**OUR ADAPTATION**
- Zero-text-wall tutorial: fresh save boots straight into Level 1 with a looping hand animation and **DRAG TO AIM** → while dragging **RELEASE TO BOWL**. Spin is taught on Level 6 (glowing SPIN slider + 2-line hint). Each booster gets a one-time modal + one FREE forced use on its intro level (8, 13, 17).

## 3. Number of shots/balls
**CONFIRMED IN REFERENCE**
- Limited balls per level. Reviews mention a level that "used to offer 22 balls... now they only offer 18", which the reviewer called an "invisible paywall" (review via search snippet of the Play/App Store pages).
- One reviewer used a hypothetical "allotted 25 shots... only need 15" while proposing a coin bonus for leftover shots. This shows allotments in the 15-25 range are plausible, but the 25 is the reviewer's example, not a confirmed level value.
- Reviews say leftover balls currently earn **no** extra reward ("there should be extra points awarded if you have balls left over"; App Store reviews).

**INFERRED**
- Ball counts are relatively high (double digits) compared with games like Angry Birds, which fits a "many shots, chip away at the structure" design. Counts are likely tuned per level and per difficulty tier and adjusted live (the 22 to 18 change).

**OUR ADAPTATION**
- Small, readable bowling-sized budgets instead of 15-25 cannonballs: 3-4 balls per level (shown as ball pips). Easy levels generous (4 on L5/L15/L16), HARD/SUPER HARD tight (3). Leftover balls pay +5 coins each on first clear (fixes reference complaint).

## 4. Aiming
**CONFIRMED IN REFERENCE**
- "Set your angle, charge the power, and fire", with "simple one-tap aiming" / "intuitive one-tap controls" (App Store/Play description via search; Softonic).
- Players must "read structures, pick weak points, and balance angle with power" (Uptodown).

**INFERRED**
- The exact gesture (drag to aim vs. an oscillating auto-aim with a tap to lock) is not confirmed. "One tap to set your shot" plus "charge the power" and "perfect timing" suggests a timing-based meter (tap to lock the angle/power as it oscillates) or a press-and-hold to charge. Unverified.

**OUR ADAPTATION**
- Drag anywhere → pull back (slingshot) to set direction, with a dotted predicted path + arrow. Pushing forward also works (forgiving). Early levels (1-3, 5, 11, 16) have a gentle first-ball aim assist. Desktop: mouse; mobile: same single-finger drag (pointer events).

## 5. Power
**CONFIRMED IN REFERENCE**
- "charge the power" and "adjust their shot power" (store description; Softonic). Timing matters ("perfect timing", "well timed blasts"; Uptodown).

**INFERRED**
- A charge meter, probably hold-to-charge or a timed tap. Not confirmed.

**OUR ADAPTATION**
- Power = drag length (same gesture as aim), colour-coded green→red on the path and ball ring. No timing meter: mass-market, one gesture. Ramp levels cap max speed so full power isn't punished.

## 6. Projectile physics
**CONFIRMED IN REFERENCE**
- Cannonballs fired in arcs ("perfect arcs"; Uptodown); "every hit powered by realistic physics" (store description).
- Reviews describe the "last ball" still rolling and knocking blocks when the level ends. So balls keep simulating after impact (rolling), and the end-of-level check can fire before the physics settle.

**INFERRED**
- Ballistic trajectory under gravity; ball mass is high relative to blocks. A trajectory preview is not confirmed.

**OUR ADAPTATION**
- A rolled 9 kg-equivalent bowling ball (Rapier dynamic sphere, CCD on, rolling angular velocity at launch) instead of a ballistic cannonball. Optional HOOK: a constant-curvature lateral force (speed-independent, so the preview is honest). Taught at L6, never required before.

## 7. Destruction physics
**CONFIRMED IN REFERENCE**
- "smash jars, topple stone towers, and trigger chain reactions that crumble everything in sight"; "One clean smash can trigger an unstoppable chain reaction" (store description).
- Materials mentioned: "fragile jars, heavy stones, and tall towers collapse in cascading chain reactions" (Uptodown). "Festival arenas" (Uptodown); "colorful kingdoms" (Softonic).
- Reviewers: "addictive to smash well-designed stacks" (App Store review).

**INFERRED**
- Rigid-body blocks (stacking/toppling) plus breakable "jars" (shatter). At least two material classes: fragile vs. heavy.

**OUR ADAPTATION**
- Real rigid-body destruction (Rapier): pins, cans, crates, boxes, barrels, cones, gnomes, statues, office chairs, dummies, dominoes, planks/posts/slabs; breakable glass panels, bottles and vases shatter into physical shards; bumpers kick; kinematic conveyors move. No canned animations. A small arcade "smash" impulse on first ball contact makes pins scatter into each other (still physics).

## 8. Win conditions
**CONFIRMED IN REFERENCE**
- Reviews: the last ball was "knocking the final block off the table", which implies the win means clearing all target blocks off the table/platform. The description shows "block towers standing on a platform".

**INFERRED**
- Win = every target object knocked off the platform (or destroyed) before balls run out. Whether partial/star ratings exist: not confirmed (no star system seen in any source).

**OUR ADAPTATION**
- Required targets are clearly marked (floating marker + HUD counter TARGETS 14 → 13 → …). Down = tilted past a per-type angle, dropped off its support, knocked well off its spot (boxes/cans/chairs) or fell off the world. Non-target props (posts, dominoes, crates on L11) don't count.

## 9. Failure
**CONFIRMED IN REFERENCE**
- Running out of balls while blocks remain ends the level, with an offer to buy more balls (900 coins). Declining means you "lose progress" / retry the level (App Store reviews).
- Complaint: the game ends early while the final ball is still moving ("a trap to make you use and/or buy more credits").
- "No timers or pressure" (store description), so failure is not time-based.

**INFERRED**
- Failing costs one life (standard 5-lives model; see 11).

**OUR ADAPTATION**
- **OUT OF BALLS** only after the shot fully resolves (balls stopped AND world quiet AND no target fell in the last 0.5 s, 13 s hard cap). This directly fixes the reference's #1 complaint (offer shown while the last ball is still knocking blocks).

## 10. Retries
**CONFIRMED IN REFERENCE**
- Super-hard levels are "beatable, if not on the first try, on the second or third" thanks to lives (review). Retry = replay the level from scratch.

**INFERRED**
- Retry consumes a life; probably the same fixed layout on each retry (fixed puzzles, "find the one perfect angle").

**OUR ADAPTATION**
- Fail panel: **+5 BALLS** (simulated rewarded ad, or 150 coins) or **RETRY**. Retry rebuilds the identical deterministic level instantly. Mid-level restart from the HUD is free on L1-5 and costs a heart otherwise (with confirmation).

## 11. Lives
**CONFIRMED IN REFERENCE**
- "you get 5 lives which generate over time like Candy Crush" (review via search snippet).
- "Unlimited life" timed rewards exist. A reviewer complains "the unlimited life countdowns should not be auto activated", because they start immediately on collection and get wasted.

**INFERRED**
- A life is lost on failure (not on win). Unlimited-lives timers are probably granted from events, packs or rewards.

**OUR ADAPTATION**
- 5 hearts. A heart is lost only when you give up on a failed attempt (retry/restart), not when the fail panel appears, so taking a continue never costs a heart. Hearts are hidden until Level 4 and levels 1-5 never cost one (first-session protection). DEV toggle: Unlimited Lives (`?debug=1` or `?unlimitedlives`).

## 12. Life regeneration
**CONFIRMED IN REFERENCE**
- Lives "generate over time" (review). **Exact regen time: not confirmed in accessible sources.**

**INFERRED**
- Genre norm is about 20-30 min per life (Royal Match uses 30 min, but that is a different game and is not evidence for this one).

**OUR ADAPTATION**
- 1 heart / 20 minutes, persisted in localStorage with timestamp maths (works across reloads). Out-of-hearts panel: simulated ad for +1, 200-coin full refill, or wait (live countdown).

## 13. Coins/currency
**CONFIRMED IN REFERENCE**
- Soft currency is called coins/"Gold"/"credits" in different sources (IAP "1000 Gold" $1.99; reviews say "coins" and "900 credits").
- Earned: 15 per average level, 50 per super-hard level (review).
- Spent on: extra balls (5 for 900); reviewers note "every other level is nearly impossible without using coins" (review).

**INFERRED**
- Probably also spent on boosters and life refills (not confirmed). The economy is tight: 900 / 15 = 60 average levels to afford one continue. The reviewers' complaints confirm it is designed to push IAP.

**OUR ADAPTATION**
- Single soft currency: coins. Earn: 20 per first clear (50 HARD, 100 SUPER HARD), STRIKE BONUS +30, SPARE +10, +5 per unused ball, +15 per gold bonus pin, chests, daily track. Spend: +5 balls (150), boosters (90/120/150), heart refill (200). Deliberately far less punishing than 900-coin continues.

## 14. Rewards
**CONFIRMED IN REFERENCE**
- Level coins (15/50). Journey milestones unlock new areas (v1.11 what's new). "Daily Gains" and limited-time events are mentioned (search summary). Timed unlimited lives as rewards (review).
- No reward for leftover balls (reviews request it).

**INFERRED**
- Event rewards are likely coins, boosters and unlimited-life timers. Not itemised in sources.

**OUR ADAPTATION**
- Bowling-language grades: **STRIKE!** (1 ball), **SPARE!** (2), **CLEAR!** (within allowance). Replays pay only the skill bonus (no duplicate first-clear rewards). Best result per level stored and shown on the map.

## 15. Boosters
**CONFIRMED IN REFERENCE**
- Boosters exist: "you don't really need boosters" (App Store review). **Booster names: not confirmed in accessible sources.**
- What's new names "Power Play" (v1.13) alongside "Trouble Trap". It is unclear whether these are events, features or level mechanics.

**INFERRED**
- Likely pre-level or in-level power balls (e.g. bigger/explosive ball). A snippet mentioning "powerful special balls and useful boosters" may belong to a different same-name clone (com.hitscale.royal.smash), so it is not attributed here.

**OUR ADAPTATION**
- Three original boosters: HEAVY BALL (×3.2 mass, ×1.4 radius), TRIPLE BALL (3 balls, ±6° spread, one ball spent), BOMB BALL (radial impulse on first major impact). Unlocked one at a time at L8 / L13 / L17 with one free forced use each, then buy with coins or a simulated ad.

## 16. Hard levels
**CONFIRMED IN REFERENCE**
- Reviews distinguish "average levels" from "super hard ones". Uptodown: difficulty rises "from relaxing knockdowns to skill tests".
- Complaint about a reduced ball count (22 to 18) on certain levels, an "invisible paywall".

**INFERRED**
- A separate "hard" tier between normal and super-hard is not confirmed. It possibly exists, as in Royal Match-style games (Hard/Super Hard labels).

**OUR ADAPTATION**
- Level 10 is the single HARD level of the prototype (red HARD tag in HUD, intro and map; bigger red map node; 50 coins). Three separated groups, one hidden behind a wall → needs a hook or a bank shot.

## 17. Super-hard levels
**CONFIRMED IN REFERENCE**
- "superhard boards come up once every 6 or 7 rounds and are beatable, if not on the first try, on the second or third"; they pay 50 coins vs 15 (review via search snippet).

**INFERRED**
- Probably flagged pre-level with a special label/colour. Not confirmed.

**OUR ADAPTATION**
- Level 20 SUPER HARD showcase (purple/pink glowing tag + largest map node; 100 coins). Ramp + glass + domino fork + two raised tables + pin rack + gold pin; a stored perfect one-ball STRIKE solution is verified by tests.

## 18. Reward cadence
**CONFIRMED IN REFERENCE**
- Coins every level (15), a spike every 6-7 levels (50 on super-hard). Journey milestones unlock areas. Limited-time events run periodically.

**INFERRED**
- Milestone rewards are likely every N levels along the Journey. The interval is not confirmed.

**OUR ADAPTATION**
- Coins every clear, spikes on HARD/SUPER HARD and STRIKE, chest every 5 levels (5/10/15/20), daily 7-day track, gold bonus pins on L19/L20. Sawtooth: hard spike → easy spectacle reset (L10 → L11, L15 → L16).

## 19. Progression/map/journey structure
**CONFIRMED IN REFERENCE**
- "hundreds of levels", "progress through the kingdom", "variety of colorful kingdoms to explore" (store description / Softonic).
- v1.11 added **"Journey"**: "clear levels, hit milestones, and unlock new areas" (App Store what's new, via search). First 300 levels rebuilt.

**INFERRED**
- A linear level sequence with themed areas/kingdoms. Journey acts as a meta layer (possibly building/decoration) gated by milestones.

**OUR ADAPTATION**
- Vertical JOURNEY map (1 at the bottom, scrolls to current), environment labels where the setting changes, chest icons at milestones, HARD/SUPER HARD nodes visually distinct, result badges (STRIKE/SPARE/CLEAR) on cleared nodes. It is reachable from the HUD and never forced on the player.

## 20. Ads
**CONFIRMED IN REFERENCE**
- Contains ads. Mixed reviews: "ads are less intrusive than many other games" / "can play quite a few games without one" vs. "an ad after playing one level regardless of whether you win or lose, then another ad every 2 to 3 levels" and "increasing number of forced ads between gameplay" (App Store/Play reviews).
- GameCompass Health Score 31/100 ("Mixed"): "free-to-play model is highly aggressive, with frequent, intrusive ads and a 'pay-to-progress' difficulty curve".
- Remove Ads IAP exists; a reviewer paid for ad-free and found it "absolutely worth it".

**INFERRED**
- Interstitial frequency is likely remote-configured and differs by cohort (which explains contradictory reviews).

**OUR ADAPTATION**
- **No ads in the prototype.** Interstitial integration point exists (`Platform` class, CrazyGames `gameplayStart/Stop/happytime/loadingStop` calls made at the right moments), but no interstitials are scheduled. Recommendation: none before level 10, then a remote-configured cadence.

## 21. Rewarded ads
**CONFIRMED IN REFERENCE**
- Not confirmed in accessible sources. A search summary said players "need to watch ads or spend money to continue", but no specific rewarded-ad placement (e.g. ad for extra balls) was evidenced. The "watch one video for 4 extra shots" quote found belongs to a **different game** (Cannon Balls 3D), so it is not attributed.

**INFERRED**
- Rewarded video for lives or a small ball top-up is likely but unverified.

**OUR ADAPTATION**
- SIMULATED rewarded placements, clearly labelled: +5 balls on fail, +1 heart when out of hearts, 1 free booster. Each shows a 1-second fake "SIMULATED AD" overlay and is tracked (`sim_rewarded_ad`). There are no real ads.

## 22. Continue mechanics
**CONFIRMED IN REFERENCE**
- On running out of balls: offer to buy **5 extra balls for 900 coins** (App Store reviews). Declining means losing level progress.
- The continue offer can appear while the last ball is still in motion (top complaint).

**INFERRED**
- Possibly an escalating price on repeated continues, and/or a "Level End Offer" IAP ($3.99) shown at this moment if coins are insufficient. The name suggests it, but this is not confirmed.

**OUR ADAPTATION**
- +5 balls continue for a simulated ad or 150 coins, offered only after the physics settle. Level state is preserved (balls are added and the same physics continues). There is no escalating price yet, and the panel says it is a simulation.

## 23. IAP hooks
**CONFIRMED IN REFERENCE** (App Store in-app purchase list, via search summary; full list not viewable)
- Level End Offer: $3.99
- Pack 4.99: $4.99
- 1000 Gold: $1.99
- Pack 9.99: $9.99
- Special Offer: $2.99
- Higher packs "ranging from $9.99 to $99.99"
- Remove Ads (exists per reviews; price not confirmed)

**INFERRED**
- "Level End Offer" = a contextual fail-state offer. "Special Offer" = a pop-up/starter-style deal. The packs likely bundle coins + boosters + unlimited-life time.

**OUR ADAPTATION**
- None implemented (no real money). Hook points are listed in DESIGN.md: the fail-panel continue (a "Level End Offer" analogue), out-of-hearts refill, booster purchase panel and coin shortage.

## 24. Daily/return systems
**CONFIRMED IN REFERENCE**
- "limited-time events" and "Daily Gains" (search summary; exact source page unclear). Named events in what's new: "BUILD UP EVENT", "Trouble Trap", "Power Play" (App Store, via search).
- Life regen (return trigger).

**INFERRED**
- "Daily Gains" is probably a daily login/reward feature. Its mechanics are unknown. Another same-name game (different developer) lists daily/weekly tasks, win-streak tower and daily boss levels; **not attributable** to Cypher's game.

**OUR ADAPTATION**
- A lightweight 7-day DAILY REWARD track (coins / single boosters / a big day-7 bundle) is persisted. It appears only from the second session and only after 3 cleared levels, so it never interrupts the first session. Missing a day resets the streak to day 1. There is also a gift button on the map.

## 25. Level-complete celebration
**CONFIRMED IN REFERENCE**
- Not confirmed in accessible sources (beyond the general "oddly satisfying" destruction spectacle).

**INFERRED**
- Coin award screen (15/50) followed by Journey progress and possibly an interstitial ad.

**OUR ADAPTATION**
- On the last target: about 0.75 s slow-motion, camera shake, sparkles and confetti, a rising chain-pop sound per target, then a slammed **STRIKE!/SPARE!/CLEAR!** banner with a fanfare. The panel counts targets up rapidly, coins fly to the counter, and a large **NEXT LEVEL** button appears. The next level is playable about 2-3 s after the final pin if the player taps quickly.

## 26. Difficulty curve
**CONFIRMED IN REFERENCE**
- "rising from relaxing knockdowns to skill tests" (Uptodown). A super-hard spike every 6-7 levels (review). "Pay-to-progress difficulty curve" (GameCompass). Ball allotments reduced on some levels (22 to 18) (review). Levels "reworked and retuned" in 2026 updates ("cleaner, fairer levels"; what's new about 2026-09-20).

**INFERRED**
- A saw-tooth curve (normal, normal, ..., super-hard spike) with live tuning. The developer appears to be responding to fairness complaints.

**OUR ADAPTATION**
- Explicit sawtooth: 1-3 near-unfailable, 4-6 minor thought, 7-9 moderate, **10 HARD**, 11 easy spectacle in a new setting, 12-15 moderate, 16 easy spectacle, 17-19 rising, **20 SUPER HARD**.

## 27. FTUE
**CONFIRMED IN REFERENCE**
- "takes seconds to learn"; "no timers or pressure"; one-tap controls (store description). A tutorial video exists (title only).

**INFERRED**
- Short guided first level, then immediate play. The early game probably has light ads/monetization (GameCompass: "starts simple but quickly pushes players towards in-app purchases").

**OUR ADAPTATION**
- No menu wall: a fresh save loads directly into Level 1. Only aiming is explained; coins appear after the first win, hearts from L4, spin at L6, boosters at L8+, daily only from session 2. `?playtest=1` gives a fresh temporary save every time.

## 28. Session pacing
**CONFIRMED IN REFERENCE**
- Reviewers play to "kill a few minutes" on breaks (unlimited-lives review). Lives cap (5) gates session length. Ads every 1-3 levels for some users.

**INFERRED**
- Levels likely last under 1-2 minutes. A natural session ends when lives run out (about 5 fails) or a super-hard wall is hit.

**OUR ADAPTATION**
- Levels take about 20-90 s and downtime between levels is about 2-3 s. Hearts gate long fail streaks only after L5. A 20-level run takes roughly 20-35 minutes for a first-time player.

---

## Notable player complaints (design lessons)
1. Level ends while the last ball is still knocking blocks off, then asks for 900 coins (App Store reviews).
2. Low coin payouts (15) vs. continue cost (900).
3. No bonus for unused balls.
4. Unlimited-life timers auto-activate and get wasted.
5. Ball counts reduced after the fact ("invisible paywall").
6. Ad frequency (for some cohorts).

Positives: satisfying destruction, well-designed stacks, playable without boosters, "less intrusive ads" for some.

---

## Sources (all accessed 2026-10-05; content seen via web-search snippets only)
- Google Play listing: https://play.google.com/store/apps/details?id=com.cyphergames.royalsmash
- Google Play PC: https://play.google.com/pc-store/games/details?id=com.cyphergames.royalsmash
- App Store (US): https://apps.apple.com/us/app/royal-smash-physics-puzzle/id6780891673
- App Store (UK reviews): https://apps.apple.com/gb/app/royal-smash-physics-puzzle/id6780891673?see-all=reviews&platform=iphone
- App Store (other storefronts): https://apps.apple.com/al/app/royal-smash-physics-puzzle/id6780891673 ; https://apps.apple.com/bz/app/royal-smash/id6780891673 ; https://apps.apple.com/lu/app/royal-smash-physics-puzzle/id6780891673?l=fr-FR
- Cypher Games developer page: https://apps.apple.com/id/developer/cypher-games/id1648701385 ; https://play.google.com/store/apps/developer?id=Cypher+Games ; https://www.cyphergames.com/
- GameCompass: https://www.gamecompass.co/games/royal-smash-physics-puzzle
- AppBrain: https://www.appbrain.com/app/royal-smash-physics-puzzle/com.cyphergames.royalsmash
- Uptodown: https://royal-smash.en.uptodown.com/android
- Softonic: https://royal-smash-physics-puzzle.en.softonic.com/android
- APK mirrors (version history): https://apkpure.com/royal-smash/com.cyphergames.royalsmash ; https://apkaward.com/royal-smash-physics-puzzle ; https://royal-smash-physics-puzzle.soft112.com/
- YouTube (titles only): https://www.youtube.com/watch?v=EiNq5JpPYn0 (Tutorial) ; https://www.youtube.com/watch?v=hr_HTH0wYYM (Level 1) ; https://www.youtube.com/watch?v=55bvWxHBnTA (1-20) ; https://www.youtube.com/watch?v=m-vZ7OndcAU (1-20) ; https://www.youtube.com/watch?v=20mk0_bd2QM (1-30) ; https://www.youtube.com/watch?v=KHUMQBsKO0I (1-50) ; https://www.youtube.com/watch?v=ogWSUGkeZ50 (31-50) ; https://www.youtube.com/watch?v=U9MKNqBGlK0 (71-100) ; https://www.youtube.com/watch?v=sVzzP2nCYEY (2026/07/23) ; https://www.youtube.com/watch?v=CPSf18IeiIU

## Research limitations
- **All direct page fetches were blocked** (egress proxy denied play.google.com, apps.apple.com, appbrain, youtube, apkpure, sharebie, ldplayer, soft112). Evidence comes solely from search-engine snippets and AI summaries of those pages. Summaries may merge content from different pages, so attributions to a specific store are best-effort.
- Could not watch any videos; only titles were available.
- Could not view the full App Store IAP list, the full version history or full review text. Prices are US-storefront values as summarised.
- No Reddit threads or dedicated wikis/walkthrough text sites were found for this game.
- Several unrelated games share the name "Royal Smash" (e.g. com.hitscale.royal.smash, com.matchstars.royalsmash) and similar cannon games exist (Cannon Balls 3D, Smash Fest). Claims traced to those were excluded or flagged.
- Booster names, life regen time, tutorial steps, level-complete flow, rewarded-ad placements and daily-reward mechanics remain unconfirmed and need a hands-on playthrough.
