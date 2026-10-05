# CLAUDE.md: Too Many Grandmas

Constraints for anyone (human or AI) working in this repo.

## What this is
A browser prototype that validates one loop: dependants hatch from eggs, need food and beds, become workers, and the colony grows exponentially. It is not a full game. Do not add systems unless a playtest asks for them.

## Hard rules
- **Original IP only.** Do not copy Family Time (or any other game's) characters, names, text, UI art, levels, audio or presentation. Only the broad loop is shared.
- **Grandmas are stylised mascot blobs** (bun, big glasses, cardigan or shawl, slippers) built from simple authored geometry. Never use realistic humans or AI-generated portraits.
- **The tone is deadpan.** The world treats eggs and the Gran-ulator as completely normal. No "lol random" copy.
- **Keep the simulation separate from presentation.**
  - `src/core/**` and `src/data/**` must never import three.js, touch the DOM, or use `window`/`localStorage`. They must run in Node (`npm test`).
  - Presentation (`src/render`, `src/ui`, `src/game`, `src/audio`) reads `sim.state` and drains `sim.events`. It mutates the sim only through `Simulation` commands (`setInput`, `interact`, `secondary`, `place`, `sleep`, `debug`).
- **State is plain JSON**: ids, never object references. A save is `JSON.stringify(state)`, which keeps it Luau-portable.
- **Gameplay randomness uses the seeded RNG** in `src/core/rng.js`. `Math.random` is allowed only for cosmetics or debug tools.
- **Performance is a feature.** Grandmas are flat records updated by one AI loop and drawn as shared InstancedMeshes. Do not make per-Grandma `Object3D`s, materials or DOM nodes.

## Before committing
```bash
npm test && npm run sim -- --check && npm run build && npm run test:smoke
```
Run `npm run test:stress` if you touched the crowd, AI, movement or rendering.

## Where things live
- Tunables: `src/data/balance.js`, `src/data/buildings.js`, `src/data/lines.js`
- Systems: `src/core/systems/*`, orchestrated by `src/core/Simulation.js`
- Balance bot: `src/core/bot/AutoPlayer.js` (used by the sim script, the tests and `?autoplay`)
- Rendering: `src/render/*` (the crowd is `GrandmaCrowd.js`)
- Glue: `src/game/Game.js`

## Git
Work on a feature branch. Make small meaningful commits. Never force-push shared branches.
