# ubuntu-tiling

GNOME Shell extension `tiling-columns@samuelfrench.github.io` that extends Ubuntu's stock Tiling Assistant (`tiling-assistant@ubuntu.com`): with 2+ tiled columns filling the screen, Super+Left/Right or drag-to-edge adds a new column instead of covering one.

- Code: `extension/` (`columns.js` and `grids.js` pure planners, `hooks.js` column wrappers, `gridController.js` reversible node-tested transactions, `gridControls.js` native picker/panel/GNOME adapters, `extension.js` lifecycle glue). `install.sh` stages runtime files/styles and compiles schemas before copying. Column spec: `docs/superpowers/specs/2026-09-26-tiling-columns-design.md`.
- Install: `./install.sh` (then restart GNOME Shell: X11 Alt+F2 `r`; Wayland re-login). Remove: `./install.sh uninstall`.
- Tests: `node --test tests/*.test.mjs` (unit) and `tests/integration/run.py` (isolated headless GNOME Shell; local only).
- Never disable `tiling-assistant@ubuntu.com`; this extension depends on it.
- Live TODO: generated `TODO.md`; edit `docs/todo/<area>/<slug>.md`, then run `node scripts/todo/build.mjs`. Commit the task file, `TODO.md` and `docs/todo/index.json` together. Never hand-edit generated output. Rules and queries: `docs/todo/README.md`; validation: `node --test scripts/todo/__tests__/*.test.mjs` and `node scripts/todo/build.mjs --check`.
