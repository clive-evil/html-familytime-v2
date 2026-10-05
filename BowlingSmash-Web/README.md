# BOWLING SMASH (working title) — HTML prototype

A standalone browser prototype: **a heavy bowling ball + real physics destruction + short puzzle levels**. It is structurally inspired by the mobile game *Royal Smash! – Physics Puzzle*, but all names, art, levels, text and sounds are original. It is a validation prototype only and is not commercially ready.

* Three.js r186 + Rapier 3D (WASM) physics, Vite build, fully static `dist/`
* 20 hand-authored levels across 5 environments (Toy Arena, Supermarket, Office, Construction Site, City Plaza)
* Drag-to-aim/power (mouse or touch), HOOK spin from Level 6, three boosters, hearts, coins, chests, daily reward, journey map
* No real ads or payments: monetisation moments are **simulated** and labelled as such

## Run

```bash
cd BowlingSmash-Web
npm install
npm run dev          # http://localhost:5317/
```

| URL | What |
|---|---|
| `http://localhost:5317/` | Normal play (persistent save in localStorage) |
| `http://localhost:5317/?playtest=1` | Fresh temporary save, starts at Level 1, ends with PROTOTYPE COMPLETE stats |
| `http://localhost:5317/?debug=1` | QA panel: level select, restart, win now, auto-solve, ∞ lives, ∞ balls, slow-mo, +coins, +boosters, wireframe, daily reset, −1 heart, reset save, FPS and body count |
| `?level=N` | Jump to level N |
| `?unlimitedlives` / `?memsave` | Testing helpers |

## Production build

```bash
npm run build        # -> dist/ (static, relative paths; open via any static server)
npm run preview      # http://localhost:5318/
```

## Tests

```bash
npm test                         # node --test: physics rules, all 20 levels, saves, economy, solutions
npm run build && npm run test:browser   # Playwright: FTUE + every level's solution in a real browser (production build)
```

The browser test starts its own static server on a random port and its own headless Chromium (flag `--bowlingsmash-qa-browser`). It closes both when done and never touches other processes.

## Controls

* **Drag** anywhere, then pull back to aim and set power (a longer drag gives more power) and **release** to bowl.
* **SPIN** slider (from Level 6), or **Q** / **E** on desktop, curves the ball. The dotted guide shows the curve.
* Booster buttons sit on the right (unlocked at L8, L13 and L17). **R** restarts the level.

See `DESIGN.md` for the design write-up and `REFERENCE_AUDIT.md` for the reference research.
