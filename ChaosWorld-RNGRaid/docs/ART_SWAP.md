# Swapping in the real Chaos World art

The Battle Lab art (`C:\AI-Prototypes\ChaosWorld-BattleLab`) was **not reachable** from the cloud environment that built
this prototype (it isn't in the GitHub repo or on any branch). Everything you see is procedural placeholder art written
to be replaced. The replacement path is deliberately one file.

## 1. Drop files in

```
ChaosWorld-RNGRaid/assets/characters/scrub.png
ChaosWorld-RNGRaid/assets/characters/knight.png
ChaosWorld-RNGRaid/assets/characters/archer.png
…
ChaosWorld-RNGRaid/assets/bosses/grubmaw.png
```

## 2. Point the manifest at them — `js/art-manifest.js`

```js
characters: {
  knight: { src: 'assets/characters/knight.png', anchorX: 0.5, anchorY: 0.96, height: 104 },
  // optional per-state frames instead of src:
  archer: { idle: 'assets/characters/archer_idle.png', attack: 'assets/characters/archer_shoot.png', down: 'assets/characters/archer_ko.png', height: 100 },
},
bosses: {
  grubmaw: { src: 'assets/bosses/grubmaw.png', anchorX: 0.55, anchorY: 0.97, height: 330 },
},
items: { staff: { src: 'assets/items/staff.png' } },
```

* `anchorX/anchorY` = where the character's **feet** are inside the image (0–1).
* `height` = drawn height in design pixels at scale 1 (heroes ≈ 104, boss ≈ 330).
* Characters face **right** (towards the boss). Left-facing art: add `flip: true`.

That's it. `js/art-pack.js` draws the sprite when it has loaded and falls back to the placeholder otherwise. Lobby
crowd, battle, podium and class portraits all go through it. `npm run build` inlines the files into the single-file build.

## What the placeholders are

| Class id | Archetype | Notes |
|---|---|---|
| `scrub` | **Scrub** | scruffy everyman: messy hair + sprout, patched tunic, bare feet, gap-tooth grin |
| `knight` | **Knight** | great helm + plume, pauldrons, tabard + kite shield in the player's colour |
| `archer` | **Archer** | green hood + cape, quiver, scarf in the player's colour |
| `mage` | Mage | floppy star hat (player colour), long beard, robe |
| `berserker` | Berserker | horned helm, braided beard, bare chest, war paint |
| `rogue` | Rogue | hood + mask, trailing scarf, twin daggers |
| `cleric` | Cleric | halo, robe + stole, candle/mace |
| `necro` | Necromancer | skull mask, tattered robe, orbiting skull |
| `paladin` | Paladin | winged open helm, gold armour, cape |

Review sheet with every class/state/rarity, the three bosses and all item icons: open `tools/art-sheet.html`.
