# Tiling Assistant Columns — design

Date: 2026-09-26. Status: approved under Sam's `/goal` directive (no pause for review); decisions below were made autonomously and are listed so they can be overridden.

## Request

Sam: "essentially throw out what we have, and figure out how to simply extend the existing ubuntu tiling feature to support allowing more tiling (like I want to have a 2 pane view and add a third item to the right)".

- **Said:** discard the current zone app; extend Ubuntu's built-in tiling; example is 2 panes plus a third window on the right.
- **Assumed:** "existing ubuntu tiling feature" = `tiling-assistant@ubuntu.com` (the deb Ubuntu 24.04 ships and enables). The result should work with the gestures Sam already uses (Super+Left/Right, drag to the screen edge), not a new UI.

## What stock Tiling Assistant does today (v46, GNOME 46)

With A tiled left half and B tiled right half, sending C to the right edge (Super+Right or drag) tiles C to the right half and **covers B**. The hidden Ctrl-drag "adaptive" mode can split a tile, but only by dragging, with uneven widths (50/25/25 or 50/33/17).

## Behavior

A small companion extension, `tiling-columns@samuelfrench.github.io`, changes one case:

> If the monitor's top tile group (ignoring the window being placed) is 2 or more full-height columns that together span the whole work area, then Super+Right / drag-to-right-edge inserts the window as a new rightmost column, and Super+Left / drag-to-left-edge inserts it as a new leftmost column. Existing columns shrink proportionally to make room.

- A|B at 50/50 + C on the right → 33/33/33. Add D on the left → 25/25/25/25.
- Uneven columns keep their ratio: 60/40 + C → 40/27/33.
- The new column's width is `floor(workArea.width / (n + 1))`.
- The drag preview shows the new column's slot, so the gesture is visible before release.
- Everything else is stock: a single half-tiled window, quarters, maximize, top/bottom, Ctrl-drag, tiling popup, resizing a shared edge (Tiling Assistant already resizes neighbors in a tile group).
- Replacing a column instead of adding one stays possible with the stock Ctrl-drag onto the middle of that column.

### Fallback to stock (no insertion)

- Fewer than 2 columns, any tile not full height, gaps or overlaps between columns (2 px tolerance), or columns not reaching both work-area edges.
- Any resulting column narrower than 400 px (`MIN_COLUMN_WIDTH`). On the 5054 px work area that allows 12 columns.
- A column window that cannot move or resize.
- Tiling Assistant settings `disable-tile-groups = true`, or `adapt-edge-tiling-to-favorite-layout = true` with a favorite layout set.
- `tile()` calls with `ignoreTA` or `fakeTile`.

## Architecture

Tiling Assistant's `TilingWindowManager` is a class of static methods in an ES module. GJS caches modules by URI, so importing `<TA dir>/src/extension/tilingWindowManager.js` returns the same class object Tiling Assistant uses. The extension replaces two static methods and restores them on disable:

1. `getTileFor(shortcut, workArea, monitor)` — for `tile-left-half` / `tile-right-half`, return the insertion slot when a plan exists. This one hook covers both the keyboard path (`keybindingHandler` → `getTileFor` → `toggleTiling` → `tile`) and the drag preview (`moveHandler._edgeTilingPreview` → `getTileFor`; drop → `tile`).
2. `tile(window, rect, params)` — if `rect` equals the insertion slot of a current plan for this window, first re-tile the existing columns to their shrunk rects (`openTilingPopup: false`), then tile the window. This is the same order stock adaptive tiling uses for its split rects, so the tile group is rebuilt with all columns.

The plan is recomputed from live state in both hooks; nothing is cached between the preview and the drop.

### Units

- `extension/columns.js` — pure planner, no GI imports, runs under node and GJS.
  - `planColumnInsert(workArea, tiles, side)` → `{ slot, moves: [{ id, rect }] }` or `null`. `workArea` and every `rect` are `{ x, y, width, height }`; `tiles` is `[{ id, rect }]`; `side` is `'left' | 'right'`.
  - `sameRect(a, b)` → exact `x/y/width/height` equality.
  - `MIN_COLUMN_WIDTH = 400`, `EDGE_TOLERANCE = 2`.
- `extension/extension.js` — finds Tiling Assistant (`tiling-assistant@ubuntu.com`, fallback `tiling-assistant@leleat-on-github`) through `Main.extensionManager.lookup`, imports its modules by URI, installs and removes the two hooks. Throws on enable if Tiling Assistant is missing, so GNOME shows the extension as errored instead of silently doing nothing.
- `extension/metadata.json` — `shell-version: ["46"]` (only version tested).
- `install.sh` — copies `extension/` to `~/.local/share/gnome-shell/extensions/<uuid>/`, adds the uuid to `org.gnome.shell enabled-extensions`, prints the restart step. `install.sh uninstall` reverses it.

## Testing

- Unit: `node --test tests/*.test.mjs` against `columns.js` (2→3, 3→4, left and right, uneven ratios, offset work area like the real `5054x1408+66+32`, rounding sums exactly to the work area, every fallback case).
- Integration: `tests/integration/run.sh` starts an isolated headless GNOME Shell 46 (`--headless --wayland --no-x11 --mode=user --virtual-monitor 2560x720`, private D-Bus via `dbus-run-session`, private `XDG_CONFIG_HOME`/`XDG_DATA_HOME` so dconf and extensions never touch the live session). A test-only extension sets `global.context.unsafe_mode` so the runner can drive the shell through `org.gnome.Shell.Eval`. It opens GTK test windows, sends real Super+Left/Right through a Clutter virtual keyboard and a Super+drag through a virtual pointer, and asserts window frame rects. It runs once with the extension (expect columns) and once without (expect stock: C covers B), so a passing run proves the extension caused the change.
- CI runs the unit tests only; the integration test needs GNOME Shell 46 + the Ubuntu Tiling Assistant package.

## Removal of the old app

- Repo: delete the Python package, Tk overlay, X11 backend, CLI, desktop file, old Wayland helper extension, Python tests, `pyproject.toml`.
- Host: remove the 11 `<Super><Alt>` custom keybindings (`/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/ubuntu-tiling-*`), `~/.local/bin/ubuntu-tiling`, `~/.local/share/applications/ubuntu-tiling.desktop`, `~/.local/share/gnome-shell/extensions/ubuntu-tiling@samuelfrench.github.io/`, and move `~/.config/ubuntu-tiling/` to a dated backup.

## Out of scope (recorded in TODO.md as ideas)

- Rows (top/bottom insertion). Super+Up/Down mean maximize/restore in stock, and rows are rarely useful on a 5120x1440 screen.
- Re-expanding the remaining columns when a column window closes or is untiled (stock leaves free space and offers the tiling popup on the next tile).
- A preferences UI (min width, equal vs proportional).
