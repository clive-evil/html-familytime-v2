# Chaos World — RNG Raid (internal HTML prototype) — V2

A Chaos World dungeon mode where **the match starts in the pre-match lobby**, and the raid itself is a
**co-op damage race** against one enormous boss.

```
LOBBY  round 1/2/3: EVERYONE's hero → weapon → gear reels spin at once, land one by one ("still spinning…")
       CHAOS PHASE (~18–20s): reroll · shuffle · steal · grief (Grief Raid) · boost the raid pot · PROTECT a Legendary+
       LOADOUTS LOCKED: inspect everyone → CONTINUE TO RAID (only when YOU press it)
       BOON VOTE (10s): 3 boons, all 8 vote, winner applies to everyone
RAID   one giant boss, all 8 raiders hit it at once; live race positions by boss damage
       Mario-Kart-ish battle items every ~10s (comeback-weighted by position): Haste, Power Surge, Chaos Shield,
       Bomb, Hex, Ghost, Swap Curse, Lightning, Crown Breaker, Chaos Tonic, Mimic, Purge
       boss at 50% → fight pauses → second boon vote
RESULT 1/2/3 podium with the actual characters, 4th–8th, awards; rewards by placement × raid pot
```

Two rulesets on the front menu (compare them):

| | **RNG RAID** | **CHAOS / GRIEF RAID** |
|---|---|---|
| Simultaneous hero/weapon/gear rounds | ✓ | ✓ |
| Reroll / Shuffle / Steal / Boost / Protect | ✓ | ✓ |
| Steal Legendary+ | ✓ (odds ×0.25 if warded) | ✗ BOLTED DOWN → curse it instead |
| Grief (curse one tier) | – | ✓ (wards hold 70% of the time) |
| Chaos tax on the pot | – | +x0.02 per steal/grief |
| Bot aggression | 1.0× | 1.45× |

## Run it

**Single file:** `dist/ChaosWorld-RNGRaid.html` is the whole game in one self-contained HTML file (CSS, fonts, art, audio, JS all inlined). Rebuild it after edits with `npm run build`.

No build, no server, no network. Everything (fonts, art, audio) is generated or inlined locally.

* **Double-click `index.html`** (works from `file://`), or
* `npm start` → <http://localhost:8080/> (any static server is fine).

Useful URL parameters (all optional):

| param | effect |
|---|---|
| `?seed=123` | deterministic lobby/battle RNG (each “play again” offsets it) |
| `?fast=1` | QA fast mode (lobby timings ×0.18, battle ×3) |
| `?mode=rng` / `?mode=grief` | skip the menu |
| `?debug=1` | open the QA panel on load |
| `?auto=1` | your hero auto-casts skills and auto-uses items in battle |
| `?sound=0` | mute |
| `?biome=gutter\|bones\|molten` | force the dungeon |

Example: `index.html?mode=grief&seed=42&debug=1`

### Controls

Mouse/touch everywhere. Keyboard — lobby: **Space/Enter** spin the round / Continue · **1/2/3** your slot (reroll/protect) ·
**R** reroll mode · **S** steal · **G** grief · **X** shuffle · **B** boost · **P** protect · **1/2/3** vote · **Esc** cancel.
Battle: **Q/E** skills · **Space/F** use item (then **1–7** picks a rival by rank) · **A** auto · **1/2/3** vote · **`** debug panel.

## Folder layout

```
ChaosWorld-RNGRaid/
  index.html              entry point (plain <script> tags, runs from file://)
  css/style.css           Chaos World comic UI (thick ink, hard shadows, rarity frames)
  css/fonts.css           Luckiest Guy + Bangers (OFL) inlined as base64 — see fonts/OFL-*.txt
  js/config.js            ALL tuning + content: RARITIES, CLASSES, WEAPONS, GEAR, STEAL_ODDS, GRIEF_COSTS,
                          RAID_POT, RAID_MODIFIERS, MODES, TIMINGS, ECONOMY, BOT_PERSONALITIES, BOT_ROSTER,
                          LINES, BIOMES, BOSSES, BATTLE, SKILLS + V2: ROUND_REEL, PROTECT, PROTECTION_STEAL_MULTIPLIER,
                          BOON_OPTIONS, BOON_VOTE, BATTLE_ITEMS, POSITION_ITEM_WEIGHTS, ITEM_INTERVAL, ITEM_RATE_BY_RANK,
                          COMEBACK_STRENGTH, LIGHTNING_DURATION, GHOST_DURATION, BOSS_ATTACKS, PLACEMENT_REWARDS
  js/rng.js               seeded RNG (mulberry32)
  js/lobby-core.js        lobby simulation (pure logic): simultaneous rounds, reroll, shuffle, steal, grief, boost,
                          PROTECT, locked review, pre-raid vote, bot brains
  js/vote-core.js         boon vote (shared by lobby + mid-fight)
  js/battle-core.js       loadout→stats (deriveStats) + item stat lines
  js/battle-race.js       the boss race: ranks, battle items + bot item AI, telegraphed boss, mid vote, placement rewards
  js/art-manifest.js      ← put real Chaos World art paths here (see docs/ART_SWAP.md)
  js/art-pack.js          sprite-or-placeholder drawing layer used by all UI
  js/chars.js             placeholder archetypes: Scrub, Knight, Archer + Mage, Berserker, Rogue, Cleric, Necro, Paladin
  js/boss-art.js          placeholder giant bosses with attack poses
  js/save.js              localStorage meta save
  js/audio.js             procedural WebAudio SFX bank (named hooks)
  js/art.js               procedural Overlords, class hats, 34 item icons, enemies, bosses
  js/ui-common.js         stage scaling, banners, modals, fly/chain/beam animations
  js/lobby-ui.js          lobby presentation: reels, cards, targeting, steal dial, crowd, callouts
  js/battle-ui.js         battle canvas + HUD
  js/screens.js           menu, results, stats/settings
  js/debug.js             QA panel
  js/main.js              app flow + RAF loop
  tests/unit.test.js      35 V1 logic tests (node:test) — kept, updated where V2 deliberately changed behaviour
  tests/v2.test.js        43 V2 logic tests (reels, Protect, votes, ranking, items, rewards)
  tests/browser.test.mjs  Playwright checks (real index.html, 3 portrait sizes, touch audit, V2 visual capture)
  tests/isolation.test.js QA #30: nothing outside this folder changed
  tools/                  balance-sim.js, lobby-sim.js, difficulty-sweep.js, art-sheet.html, load-core.js
  docs/                   PLAYTEST_CHECKLIST.md, DESIGN_NOTES.md, screenshots/
```

## Tests

```
npm install            # only needed for the browser suite (Playwright); Chromium must be available
npm test               # unit + isolation + browser
npm run test:unit      # no dependencies (V1 + V2 logic)
npm run build          # → dist/ChaosWorld-RNGRaid.html, the whole game in one file
npm run sim:balance    # boss race: win-rate by raid pot / loadout quality, lead changes, items used
npm run sim:lobby      # bot behaviour per mode (avg pot, steals, griefs, hits on the human)
```

## About ChaosWorld-BattleLab

`C:\AI-Prototypes\ChaosWorld-BattleLab` is **not reachable** from the cloud environment (searched every branch of this
repo for BattleLab / Scrub / Knight / Archer / Chaos World assets — nothing). So no real art was reused. The art layer is
now isolated behind `js/art-manifest.js` + `js/art-pack.js`: dropping in the real sprites is a config change — see
**docs/ART_SWAP.md**.
