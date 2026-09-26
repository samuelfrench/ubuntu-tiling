# ubuntu-tiling

Adds columns to Ubuntu's built-in tiling.

> **Status (2026-09-26): work in progress.** The column math passes its unit tests. The extension has not been loaded in GNOME Shell yet, and the integration test has not been run. See `TODO.md`.

Ubuntu 24.04 ships **Tiling Assistant** (`tiling-assistant@ubuntu.com`). It tiles halves and quarters. With two windows side by side, sending a third window to the right edge makes it **cover** the right window.

This repo is a small GNOME Shell extension, **Tiling Assistant Columns**, that changes that one case: the third window becomes a **new column**.

```
Before (stock)            After (this extension)
+---------+---------+     +------+------+------+
|    A    |  C (B   |     |  A   |  B   |  C   |
|         | hidden) |     |      |      |      |
+---------+---------+     +------+------+------+
```

## Use

1. Tile two windows the normal way: **Super+Left** on A, **Super+Right** on B (or drag them to the screen edges).
2. Focus a third window and press **Super+Right**, or drag it to the right screen edge. It becomes a third column. All three are 1/3 wide.
3. Keep going: **Super+Left** or the left edge adds a column on the left. Four windows on a 5120x1440 ultrawide with the Ubuntu dock (5054 px work area) = four 1263 px columns.

Details:

- It only kicks in when 2+ tiled windows already fill the screen as full-height columns. Everything else is stock Tiling Assistant: first half, quarters, maximize, the tiling popup, Ctrl-drag.
- Existing columns shrink proportionally (60/40 + one more = 40/27/33).
- The drag preview shows the new column's slot before you let go.
- Drag the border between two columns to resize both (stock tile-group resizing).
- To **replace** a column instead of adding one, Ctrl-drag the window onto the middle of that column (stock adaptive tiling).
- No column goes below 400 px. If adding one would, you get the stock behavior.

## Install

Needs GNOME Shell 46 and Tiling Assistant (installed and enabled by default on Ubuntu 24.04).

```bash
git clone https://github.com/samuelfrench/ubuntu-tiling.git
cd ubuntu-tiling
./install.sh
```

Then restart GNOME Shell so it loads the new extension:

- **X11:** Alt+F2, type `r`, Enter. Windows stay open.
- **Wayland:** log out and back in.

Check: `gnome-extensions info tiling-columns@samuelfrench.github.io` shows `State: ACTIVE`.

Remove: `./install.sh uninstall`.

## How it works

Tiling Assistant decides where a window goes in `TilingWindowManager.getTileFor()` (used by both Super+Arrow and the drag preview) and moves windows in `TilingWindowManager.tile()`. Both are static methods on a class in an ES module. GJS caches modules by file URI, so this extension imports that same module and wraps the two methods:

- `getTileFor`: for left/right, if the other tiled windows are full-height columns that span the screen, return the new column's slot.
- `tile`: if a window is being tiled into that slot, shrink the existing columns first, then tile it.

Disabling the extension puts the original methods back. The column math is in `extension/columns.js` (pure JS, no GNOME imports).

## Tests

```bash
node --test tests/*.test.mjs        # column math
tests/integration/run.py            # real GNOME Shell, headless
```

The integration test starts an isolated headless GNOME Shell (own D-Bus session, own dconf, own extension dir), opens GTK windows, and sends real Super+Left/Right keypresses and a Super+drag through virtual input devices. It runs twice: stock Tiling Assistant (third window covers the right half) and with this extension (windows become 3, 4, then 5 equal columns). It is built to stay isolated from the running desktop session (see the gotchas in `TODO.md`).

## License

MIT
