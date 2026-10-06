# The Long Watch — colony-ship survival-horror management prototype

Open **`dist/ColonyShipHorror.html`** in a desktop browser (works from `file://`, no install, no network). Best at 1920×1080 with headphones. Press **H** in game for the manual.

- `PROTOTYPE_REPORT.md` — controls, systems, design decisions, playtest evidence, final audit, known issues, next steps
- `docs/VISUAL_LANGUAGE.md` — art direction derived from the reference screenshots before coding
- `docs/screenshots/` — routine, fire + breach, security bus offline, organism

## Source & build
Sources live in `src/` (`style.css`, `shell.html`, `js/*.js`). `node tools/build.mjs` inlines them into the single standalone HTML file. The built file is committed; no build step is needed to play.

## Test tooling (optional, needs Playwright + Chromium)
- `node tools/systems.mjs` — system assertions for the audit questions
- `node tools/audit.mjs competent|passive <seed>` — headless full-arc playthrough with a scripted policy
- `node tools/uitest.mjs` — drives the real UI (menus, orders, decision, end screen)
- `node tools/scene.mjs`, `tools/shot.mjs`, `tools/perf.mjs` — screenshots and performance (written to `shots/`)
