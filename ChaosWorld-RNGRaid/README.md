# Chaos World — RNG Raid (internal HTML prototype)

A Chaos World dungeon mode where **the match starts in the pre-match lobby**. Nobody picks a loadout: everyone pulls a
**HERO → class-legal WEAPON → GEAR** on a slot reel, watches the other 7 players roll, then gets an ~18–20s
**CHAOS PHASE** to *reroll, shuffle, steal, grief* and *juice the raid pot* before all 8 walk into the dungeon with
whatever they ended up holding.

Two rulesets, selectable from the front menu so they can be compared:

| | **RNG RAID** | **CHAOS / GRIEF RAID** |
|---|---|---|
| Hero / weapon / gear pulls | ✓ | ✓ |
| Reroll one slot (coins, escalating) | ✓ | ✓ |
| Shuffle everything (Chaos Token, confirm) | ✓ | ✓ |
| Steal (forced swap, odds by rarity) | ✓ all rarities | ✓ but **Legendary+ is BOLTED DOWN** → "can't take it? ruin it" |
| Grief (curse an item down one tier) | – | ✓ (3 curses each, 6s immunity on victim) |
| Raid pot boost | ✓ | ✓ + **chaos tax** (+x0.02 per steal/grief) |
| Bot aggression | 1.0× | 1.45×, boost bias 1.25× |

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
| `?auto=1` | your hero auto-casts skills in battle |
| `?sound=0` | mute |
| `?biome=gutter\|bones\|molten` | force the dungeon |

Example: `index.html?mode=grief&seed=42&debug=1`

### Controls

Mouse/touch everywhere. Keyboard: **Space/Enter** pull · **1/2/3** reroll your slot · **R** reroll mode · **S** steal mode ·
**G** grief mode · **X** shuffle · **B** boost · **Esc** cancel · battle **Q/E** skills, **A** auto · **`** debug panel.
Tap any other player's item during the Chaos Phase for a steal/grief sheet.

## Folder layout

```
ChaosWorld-RNGRaid/
  index.html              entry point (plain <script> tags, runs from file://)
  css/style.css           Chaos World comic UI (thick ink, hard shadows, rarity frames)
  css/fonts.css           Luckiest Guy + Bangers (OFL) inlined as base64 — see fonts/OFL-*.txt
  js/config.js            ALL tuning + content: RARITIES, CLASSES, WEAPONS, GEAR, STEAL_ODDS, GRIEF_COSTS,
                          RAID_POT, RAID_MODIFIERS, MODES, TIMINGS, ECONOMY, BOT_PERSONALITIES, BOT_ROSTER,
                          LINES (bot chat), BIOMES, ENEMIES, WAVES, BATTLE, SKILLS
  js/rng.js               seeded RNG (mulberry32)
  js/lobby-core.js        lobby simulation (pure logic, no DOM): pulls, reroll, shuffle, steal, grief, boost, bot brains
  js/battle-core.js       loadout→stats (deriveStats), 8-player auto-battle with skills/crits/fx, rewards
  js/save.js              localStorage meta save
  js/audio.js             procedural WebAudio SFX bank (named hooks)
  js/art.js               procedural Overlords, class hats, 34 item icons, enemies, bosses
  js/ui-common.js         stage scaling, banners, modals, fly/chain/beam animations
  js/lobby-ui.js          lobby presentation: reels, cards, targeting, steal dial, crowd, callouts
  js/battle-ui.js         battle canvas + HUD
  js/screens.js           menu, results, stats/settings
  js/debug.js             QA panel
  js/main.js              app flow + RAF loop
  tests/unit.test.js      35 logic tests (node:test)
  tests/browser.test.mjs  15 Playwright checks (real index.html, portrait, touch audit, screenshots)
  tests/isolation.test.js QA #30: nothing outside this folder changed
  tools/                  balance-sim.js, lobby-sim.js, difficulty-sweep.js, art-sheet.html, load-core.js
  docs/                   PLAYTEST_CHECKLIST.md, DESIGN_NOTES.md, screenshots/
```

## Tests

```
npm install            # only needed for the browser suite (Playwright); Chromium must be available
npm test               # unit + isolation + browser
npm run test:unit      # no dependencies
npm run sim:balance    # win-rate by raid pot / loadout quality
npm run sim:lobby      # bot behaviour per mode (avg pot, steals, griefs, hits on the human)
```

## About ChaosWorld-BattleLab

The brief references `C:\AI-Prototypes\ChaosWorld-BattleLab`. **That project is not in this repository** (or any
repository this environment can reach), so nothing could be copied from it and it was not touched. The battle here is
a self-contained Chaos World-style auto-battler written for this prototype. It is deliberately isolated behind two
seams so BattleLab code can be dropped in later — see `docs/DESIGN_NOTES.md` → “Swapping in BattleLab”.
