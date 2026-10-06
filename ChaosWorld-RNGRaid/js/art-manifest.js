/* ART MANIFEST — drop real Chaos World art in here.
 *
 * Every entry left as null uses the procedural placeholder art in js/chars.js / js/boss-art.js.
 * To swap in real art:
 *   1. put PNG/WebP files in ChaosWorld-RNGRaid/assets/…
 *   2. set the path below (relative to index.html)
 *   3. tune anchor/scale so the sprite's FEET sit on the anchor point
 * No other code changes are needed. `npm run build` inlines these files into the single-file build.
 *
 * Characters are drawn facing RIGHT (towards the boss, upper-right). Sprites facing left: set flip: true.
 * Optional per-state frames: { idle: 'path', attack: 'path', cast: 'path', down: 'path' } instead of a single src.
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});
  CW.ART_MANIFEST = {
    characters: {
      // classId: { src: 'assets/characters/knight.png', anchorX: 0.5, anchorY: 0.96, height: 104, flip: false }
      scrub: null,
      knight: null,
      archer: null,
      mage: null,
      berserker: null,
      rogue: null,
      cleric: null,
      necro: null,
      paladin: null,
    },
    bosses: {
      // bossKey: { src: 'assets/bosses/grubmaw.png', anchorX: 0.55, anchorY: 0.97, height: 330, flip: false }
      grubmaw: null,
      orchardKing: null,
      pyreMother: null,
    },
    items: {
      // item/weapon/gear kind: { src: 'assets/items/staff.png' }  (drawn into the 72px icon box)
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
