# ubuntu-tiling

GNOME Shell extension `tiling-columns@samuelfrench.github.io` that extends Ubuntu's stock Tiling Assistant (`tiling-assistant@ubuntu.com`): with 2+ tiled columns filling the screen, Super+Left/Right or drag-to-edge adds a new column instead of covering one.

- Code: `extension/` (`columns.js` pure planner, `extension.js` hooks into Tiling Assistant). Spec: `docs/superpowers/specs/2026-09-26-tiling-columns-design.md`.
- Install: `./install.sh` (then restart GNOME Shell: X11 Alt+F2 `r`; Wayland re-login). Remove: `./install.sh uninstall`.
- Tests: `node --test tests/*.test.mjs` (unit) and `tests/integration/run.py` (isolated headless GNOME Shell; local only).
- Never disable `tiling-assistant@ubuntu.com`; this extension depends on it.
- Live TODO: `TODO.md`
