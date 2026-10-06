/* ArtPack — the ONLY entry point game/UI code uses to draw characters, bosses and item icons.
 * It renders a sprite from CW.ART_MANIFEST when one is provided and loaded, otherwise the procedural placeholder.
 * So swapping in real Chaos World art = editing js/art-manifest.js. Nothing else.
 */
(function (root) {
  'use strict';
  const CW = (root.CW = root.CW || {});
  const ArtPack = { images: {}, stats: { sprite: 0, procedural: 0 } };

  function load(key, entry) {
    if (!entry || typeof Image === 'undefined') return null;
    const srcs = typeof entry.src === 'string' ? { idle: entry.src } : Object.fromEntries(['idle', 'attack', 'cast', 'down', 'stun'].filter((k) => entry[k]).map((k) => [k, entry[k]]));
    const out = {};
    for (const [state, src] of Object.entries(srcs)) { const img = new Image(); img.src = src; out[state] = img; }
    ArtPack.images[key] = { entry, frames: out };
    return ArtPack.images[key];
  }
  ArtPack.init = function () {
    const m = CW.ART_MANIFEST || { characters: {}, bosses: {}, items: {} };
    for (const [k, v] of Object.entries(m.characters || {})) load('char:' + k, v);
    for (const [k, v] of Object.entries(m.bosses || {})) load('boss:' + k, v);
    for (const [k, v] of Object.entries(m.items || {})) load('item:' + k, v);
  };
  // Register at runtime (debug / tests / art previews): ArtPack.register('char:knight', { src, anchorX, anchorY, height })
  ArtPack.register = (key, entry) => load(key, entry);
  ArtPack.has = (key) => { const a = ArtPack.images[key]; const img = a && (a.frames.idle || Object.values(a.frames)[0]); return !!(img && img.complete && img.naturalWidth); };

  function drawSprite(ctx, key, x, y, s, state, face) {
    const a = ArtPack.images[key];
    const img = (a.frames[state] && a.frames[state].complete && a.frames[state].naturalWidth ? a.frames[state] : a.frames.idle) || Object.values(a.frames)[0];
    const e = a.entry;
    const h = (e.height || 100) * s, w = h * (img.naturalWidth / img.naturalHeight);
    ctx.save();
    ctx.translate(x, y);
    if ((face || 1) * (e.flip ? -1 : 1) < 0) ctx.scale(-1, 1);
    if (state === 'down') { ctx.globalAlpha *= 0.45; ctx.rotate(-1.2); }
    ctx.drawImage(img, -w * (e.anchorX ?? 0.5), -h * (e.anchorY ?? 0.96), w, h);
    ctx.restore();
  }

  // pose: { t, face, state: idle|attack|cast|stun|down|hurt|cheer, accent, rarity, weaponKind, weaponRarity, gearKind, gearRarity, emote, emoteT, lunge }
  ArtPack.drawCharacter = function (ctx, classId, x, y, s, pose = {}) {
    const key = 'char:' + classId;
    if (ArtPack.has(key)) { drawSprite(ctx, key, x, y, s, pose.state || 'idle', pose.face); ArtPack.stats.sprite++; return 'sprite'; }
    CW.Chars.draw(ctx, classId, x, y, s, pose);
    ArtPack.stats.procedural++;
    return 'procedural';
  };
  ArtPack.drawBoss = function (ctx, boss, t, pose = {}) {
    const key = 'boss:' + boss.key;
    if (ArtPack.has(key)) { drawSprite(ctx, key, boss.x, boss.y, pose.scale || 1, boss.pose === 'idle' ? 'idle' : 'attack', -1); ArtPack.stats.sprite++; return 'sprite'; }
    CW.BossArt.draw(ctx, boss, t, pose);
    ArtPack.stats.procedural++;
    return 'procedural';
  };
  // Hero class portrait for slots/podium/cards
  ArtPack.heroIcon = function (classId, rarity, size = 72, accent) {
    const key = 'char:' + classId;
    if (ArtPack.has(key)) return ArtPack.images[key].frames.idle.src;
    return CW.Chars.icon(classId, rarity, size, accent);
  };
  ArtPack.itemIcon = function (kind, rarity, size = 72) {
    const key = 'item:' + kind;
    if (ArtPack.has(key)) return ArtPack.images[key].frames.idle.src;
    return CW.Art.icon(kind, rarity, size);
  };

  CW.ArtPack = ArtPack;
})(typeof window !== 'undefined' ? window : globalThis);
