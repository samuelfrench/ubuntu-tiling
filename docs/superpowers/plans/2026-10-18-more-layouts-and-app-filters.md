# More Layouts and Program-Type Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4/9/10/12/16-window layouts and an "All" layout that sizes the grid to the matching windows, plus a program-type filter (Terminals, ChatGPT, Firefox, ...) chosen in the picker and reused by every arrange shortcut.

**Architecture:** Pure planners stay node-testable: `grids.js` gains monitor-aware grid shapes (uniform for fixed counts, ragged rows for "All"); new `windowGroups.js` classifies windows into program types from injected app data. `gridController.js` accepts a per-call `{matches, label}` filter. `gridControls.js` adapts GNOME (`Shell.WindowTracker`, `Gio.DesktopAppInfo` categories), renders filter chips and more layout buttons, persists the filter in GSettings, and registers the new shortcuts.

**Tech Stack:** GJS ES modules for GNOME Shell 46 (St, Clutter, Meta, Shell), GSettings schema, `node --test` with fakes.

**Spec:** No separate spec; Sam said "skip questions, build" (2026-10-18). Request: "more layout shortcut options (more windows) and can select program types (like terminal and chatgpt) when specifying the layout option to filter to." The decisions below are the agent's calls.

## Global Constraints

- GNOME Shell 46 only; never disable `tiling-assistant@ubuntu.com`; X11 live host 5120×1440, test harness virtual monitor 2560×720.
- Fixed layouts: `LAYOUTS = [4, 6, 8, 9, 10, 12, 16]`. "All" layout id: `FIT = 'all'`. `MAX_WINDOWS = 16`.
- Shape choice: target cell aspect `4 / 3`; score `Math.abs(Math.log(cellAspect / (4 / 3)))`; ties keep fewer rows. 6 and 8 must stay 3×2 and 4×2 on 5054×1408, 1919×1001, 2560×720 and 1920×1080 (existing behavior).
- Shortcut defaults (GSettings `as`): `show-grid-picker` `<Super><Alt>space`; `arrange-all-windows` `<Super><Alt>a`; `arrange-four-windows` `<Super><Alt>4`; `arrange-six-windows` `<Super><Alt>6`; `arrange-eight-windows` `<Super><Alt>8`; `arrange-nine-windows` `<Super><Alt>9`; `arrange-ten-windows` `<Super><Alt>0`; `arrange-twelve-windows` `<Super><Alt><Shift>2`; `arrange-sixteen-windows` `<Super><Alt><Shift>6`; `undo-grid-layout` `<Super><Alt>z`. Checked 2026-10-18 against live gsettings: none of the new ones conflict (`<Alt><Super>8` already collides with the GNOME magnifier; recorded, not changed here).
- Filter key: `window-filter` type `as`, default `[]` (empty = all windows). Written only when the picker's Arrange runs, never on chip toggle or Cancel. Every arrange shortcut uses it.
- Group ids: `terminals`; `app:<desktop-id>` (e.g. `app:chatgpt.desktop`); `class:<lowercase wm class>` for windows without a desktop file; `other`.
- Copy: notifications and summaries name the filter, e.g. `Arranged 11 windows (Terminals). Super+Alt+Z to undo.`
- Subagents do not commit; the controller commits after each review. Tests: `node --test tests/*.test.mjs` must stay green (77 before this work).

## Review Focus

- Filter selects a program type that has no windows on this workspace now → `arrange` reports `No Terminals windows on this monitor and workspace.` and moves nothing (Task 1 test `reports the filter label when nothing matches`).
- "All" with more than 16 matching windows → tiles the 16 most recent, reports overflow 4 (Task 1 test `fit caps at MAX_WINDOWS`).
- "All" with 1 matching window → one cell equal to the work area, no throw (Task 1 test `fit with one window fills the work area`).
- A window closes while chips are computed → classification never throws; matcher returns false (Task 2 tests `groupFor errors are not fatal`).
- Persisted filter names an app that is not open → chip still shown with count 0 so it can be cleared (Task 2 test `selected absent groups stay listed`).

---

### Task 1: Monitor-aware grid shapes and filtered planning

**Files:**
- Modify: `extension/grids.js` (whole file, 76 lines)
- Modify: `extension/gridController.js:31-38` (`arrange`), `:90-92` (min-size message)
- Test: `tests/grids.test.mjs`, `tests/gridController.test.mjs`

**Interfaces:**
- Produces (grids.js): `LAYOUTS`, `FIT`, `MAX_WINDOWS`; `gridShape(count, workArea, {ragged = false} = {}) → number[]` (windows per row, top to bottom); `gridCells(count, workArea, {ragged = false} = {}) → Rect[]` row-major; `planGrid(layout, context, normalType = 0, matches = () => true) → {moves, overflow, eligible, count, rows}` where `layout` is a `LAYOUTS` number or `FIT`, `count` is the number of cells used and `rows` the shape. `eligibleWindows`, `fitsCell`, `copyRect` unchanged.
- Produces (controller): `arrange(layout, context = this.captureContext(), {matches, label} = {})` → on success `{ok: true, moved, overflow, count, label}`. `place(count, cell, context)` unchanged (fixed layouts only).

- [ ] **Step 1: Write failing tests in `tests/grids.test.mjs`**
  - Replace the `[6, 8]` geometry loop with every `LAYOUTS` count on `area`, `{x: -1920, y: -107, width: 1919, height: 1001}` and `{x: 0, y: 0, width: 2560, height: 720}`: cells tile the work area exactly (same assertions as today, generalized to per-row column counts from `gridShape`).
  - `test('keeps six and eight as 3×2 and 4×2')`: `gridShape(6, a)` deep-equals `[3, 3]` and `gridShape(8, a)` deep-equals `[4, 4]` for the four work areas in Global Constraints.
  - `test('chooses shapes from the monitor aspect')`: on 5120×1440 → `gridShape(4)` `[4]`, `gridShape(12)` `[6, 6]`, `gridShape(16)` `[8, 8]`, `gridShape(9)` `[3, 3, 3]`; on 1920×1080 → `gridShape(4)` `[2, 2]`, `gridShape(12)` `[4, 4, 4]`, `gridShape(16)` `[4, 4, 4, 4]`.
  - `test('ragged fit rows')`: on 5120×1440 with `{ragged: true}` → 11 `[6, 5]`, 7 `[4, 3]`, 3 `[3]`, 1 `[1]`; ragged never yields an empty row; cells still tile exactly.
  - Rejections: `gridCells(5, area)` throws (not a fixed layout), `gridCells(5, area, {ragged: true})` does not, `gridCells(17, area, {ragged: true})` throws, plus the existing null/fractional/too-narrow cases.
  - `planGrid`: existing MRU/overflow/spatial tests pass unchanged with `planGrid(6, ...)`. Add `fit tiles exactly the matching windows` (9 windows, 3 match → `count` 3, `rows` per `gridShape(3, area, {ragged: true})`, unmatched windows absent from `moves`); `fit caps at MAX_WINDOWS` (20 matching → 16 moves, `overflow` 4); `fit with one window fills the work area` (single move whose rect equals `area`); `fit with no matches returns no moves` (`moves.length === 0`, `count === 0`); `focused window first only when it matches`; `spatial order uses three rows for a 3-row shape` (windows at top/middle/bottom bands sort by band then x).
- [ ] **Step 2: Run** `node --test tests/grids.test.mjs` — Expected: FAIL (missing exports / shapes).
- [ ] **Step 3: Implement `grids.js`.** `gridShape`: for `rows = 1..count`, `cols = Math.ceil(count / rows)`; skip when `!ragged && cols * rows !== count`; skip when `(rows - 1) * cols >= count`; cell aspect `(width / cols) / (height / rows)`; keep the lowest score, strict `<` so fewer rows win ties. Row lengths: `base = Math.floor(count / rows)`, the first `count % rows` rows get `base + 1`. `gridCells` validates `Number.isInteger(count) && 1 <= count <= MAX_WINDOWS && (ragged || LAYOUTS.includes(count))` (message `Choose a layout with 4 to 16 windows.`), integer work area with `width >= max row length` and `height >= rows`; row `r` spans `floor(r * H / R)` edges, column `c` of an `n`-window row spans `floor(c * W / n)` edges, so every pixel is used once. `planGrid`: filter `eligibleWindows(...)` by `matches`, move focus first if present, `count = layout === FIT ? Math.min(eligible.length, MAX_WINDOWS) : layout`, return the empty result before computing cells when `count === 0`, sort chosen windows by band `Math.min(R - 1, Math.max(0, Math.ceil((centerY - y) * R / height) - 1))` then `x` then `y`.
- [ ] **Step 4: Run** `node --test tests/grids.test.mjs` — Expected: PASS.
- [ ] **Step 5: Controller tests in `tests/gridController.test.mjs`:** `test('arranges only matching windows and returns the label')` (5 windows, matcher keeps ids 1 and 3, `arrange(FIT, context, {matches, label: 'Terminals'})` → `moved` 2, `label` 'Terminals', only those two tiled, cells from `gridCells(2, area, {ragged: true})`); `test('reports the filter label when nothing matches')` → `ok: false`, error text exactly `No Terminals windows on this monitor and workspace.`, no tiles; unlabeled empty case keeps `No resizable windows on this monitor and workspace.`; `test('arranges twelve and sixteen')` with 16 windows. Update any assertion on the old min-size text to `A window’s minimum size is too large for this layout. Try a layout with fewer tiles.`
- [ ] **Step 6: Implement controller changes**, then run `node --test tests/*.test.mjs` — Expected: all PASS (77 prior + new).

### Task 2: Program-type classification

**Files:**
- Create: `extension/windowGroups.js`
- Test: `tests/windowGroups.test.mjs`

**Interfaces:**
- Produces: `TERMINALS = 'terminals'`; `classifyWindow({appId, appName, hasAppInfo, categories, wmClass}) → {id, label}`; `defaultLabel(id) → string`; `summarizeGroups(windows, groupFor, selected = [], labelFor = defaultLabel) → Array<{id, label, count, selected}>`; `windowMatcher(selected, groupFor) → window => boolean`; `toggleGroup(selected, id) → string[]` (new array); `describeFilter(selected, labelFor = defaultLabel) → string | null` (`null` for empty, labels joined with ` + `).

- [ ] **Step 1: Write failing tests** in `tests/windowGroups.test.mjs`:
  - `categories` containing `TerminalEmulator` → `{id: 'terminals', label: 'Terminals'}` (gnome-terminal: appId `org.gnome.Terminal.desktop`).
  - No app info, `wmClass` in the known-terminal list (`kitty`, `Alacritty`, `org.wezfurlong.wezterm`, `foot`, `xterm`, `com.mitchellh.ghostty`, `org.gnome.Ptyxis`, `konsole`, `tilix`, `terminator`, `xfce4-terminal`, case-insensitive) → `terminals`.
  - ChatGPT (`appId 'chatgpt.desktop'`, `appName 'ChatGPT'`, `hasAppInfo true`, categories `['Utility', 'Development']`, wmClass `Chatgpt`) → `{id: 'app:chatgpt.desktop', label: 'ChatGPT'}`.
  - Window-backed app (`hasAppInfo false`, appId `window:42`, wmClass `grok-bot`, appName `Grok Bot`) → `{id: 'class:grok-bot', label: 'Grok Bot'}`; nothing usable → `{id: 'other', label: 'Other windows'}`.
  - `defaultLabel`: `terminals` → `Terminals`, `app:chatgpt.desktop` → `chatgpt`, `class:grok-bot` → `grok-bot`, `other` → `Other windows`.
  - `summarizeGroups` orders Terminals first, then count descending, then label (`localeCompare`); counts are correct; `selected` flags match. `selected absent groups stay listed` with `count: 0` after present groups.
  - `windowMatcher([])` matches everything; `windowMatcher(['terminals', 'app:chatgpt.desktop'])` matches only those; `groupFor errors are not fatal` — a `groupFor` that throws yields `false` from the matcher and the window counts under `other` in `summarizeGroups`.
  - `toggleGroup(['a'], 'b')` → `['a', 'b']`, `toggleGroup(['a', 'b'], 'a')` → `['b']`, input not mutated. `describeFilter(['terminals', 'app:chatgpt.desktop'], id => ({terminals: 'Terminals', 'app:chatgpt.desktop': 'ChatGPT'})[id])` → `'Terminals + ChatGPT'`.
- [ ] **Step 2: Run** `node --test tests/windowGroups.test.mjs` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `extension/windowGroups.js`** (plain JS, no `gi://` imports; module doc comment in the style of `grids.js`).
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` — Expected: PASS.

### Task 3: Picker, shortcuts, settings and packaging

**Files:**
- Modify: `extension/gridControls.js` (dialog, adapter, bindings, notifications)
- Modify: `extension/schemas/org.gnome.shell.extensions.tiling-columns.gschema.xml`, `extension/stylesheet.css`, `extension/metadata.json` (version 3; description `Arrange 4 to 16 windows, or every window of the program types you pick, with a native picker, shortcuts and undo. Adds columns with Super+Left/Right or edge dragging. Requires Tiling Assistant.`), `install.sh` (copy `windowGroups.js`), `README.md` (Use section, shortcut table).

**Interfaces:**
- Consumes: Task 1 `LAYOUTS`, `FIT`, `MAX_WINDOWS`, `gridShape`, `planGrid`, controller `arrange(layout, context, {matches, label})`; Task 2 `classifyWindow`, `summarizeGroups`, `windowMatcher`, `toggleGroup`, `describeFilter`, `defaultLabel`.
- Produces: `GridControls.arrange(layout, context, selected = this.filter)`; `get filter()` reads `window-filter`; `groupFor(window)` adapter (catches errors → `{id: 'other', label: 'Other windows'}`); `labelFor(id)` (apps via `Shell.AppSystem.get_default().lookup_app(id.slice(4))?.get_name()`, else `defaultLabel`).

- [ ] **Step 1: Schema.** Add the keys and defaults from Global Constraints with summaries; run `glib-compile-schemas --strict --dry-run extension/schemas` — Expected: no output, exit 0.
- [ ] **Step 2: Adapter.** `groupFor` uses `Shell.WindowTracker.get_default().get_window_app(window)`, `app.get_app_info()` (`hasAppInfo`), `info.get_categories()` split on `;`, `window.get_wm_class()`. Shortcut actions: picker, `FIT`, each `LAYOUTS` count, undo; each arrange shortcut passes the persisted filter. `arrange` builds `{matches: windowMatcher(selected, groupFor), label: describeFilter(selected, labelFor)}`; notification `Arranged N window(s) (Label). [overflow text] Super+Alt+Z to undo.`, without the parenthesis when unfiltered.
- [ ] **Step 3: Dialog.** Width 600px. Order: eyebrow/title; subtitle `Pick which programs and how many windows.`; `PROGRAMS` chip row (`Clutter.FlowLayout`, wraps) with `All windows` plus one toggle chip per `summarizeGroups` entry labelled `Label  N`, `:checked` when selected, `All windows` checked when the selection is empty and clicking it clears the selection; hint `Your choice also applies to the Super+Alt shortcuts.`; `LAYOUT` buttons for `[FIT, ...LAYOUTS]` in two rows of four, labels `All · N` (N = matching windows capped at 16) and `6 · 3×2` built from `gridShape(count, workArea)` (ragged rows shown as `6+5`); window title, instruction, preview built from the current shape (row heights 60px for ≤2 rows, 44px for 3, 34px for 4); summary; footer; Cancel / Arrange. Tiles are placeable only for fixed layouts and an eligible focused window; for `FIT` the instruction reads `All sizes the grid to the matching windows. Pick a numbered layout to place one window.` Digit keys 1–9 (and keypad) place when `digit < count`. Toggling a chip recomputes chips, the All count, preview and summary and does not write settings. Arrange writes `window-filter`, sets `lastCount` (may be `FIT`) and calls `controls.arrange`. Summary: `Arrange N window(s)[ (Label)] on this monitor and workspace.` plus the existing overflow sentence; empty: `No [Label ]windows on this monitor and workspace.` with Arrange insensitive.
- [ ] **Step 4: Styles** for `.tiling-grid-chips`, `.tiling-grid-chip` (+ `:checked`, `:hover`, `:focus`), `.tiling-grid-hint`, matching the existing palette.
- [ ] **Step 5: Verify** `node --test tests/*.test.mjs` PASS; `node --check` on every changed `extension/*.js` (or `gjs -m` parse if node rejects `gi://` specifiers); `python3 tests/integration/install.py` — Expected: `PASS: isolated install, reinstall and uninstall ...` (proves `install.sh` ships every file in `extension/`).

### Task 4: Native GNOME verification (needs Sam's go for an isolated test shell)

**Files:** `tests/integration/run.py`, `tests/integration/scenario.js`, `tests/integration/client.py`

- [ ] `client.py <title> [app-id]`: set the Wayland app id via `GLib.set_prgname(app_id)` before creating the window; assert from the scenario that `get_wm_class()` equals it.
- [ ] Private `XDG_DATA_HOME/applications/ut-term.desktop` (`Categories=System;TerminalEmulator;`, `StartupWMClass=ut-term`, `NoDisplay=true`).
- [ ] `gridKey(value, shortcut, shift)` supports Shift. New columns-mode steps after the overflow block: open three `ut-term` windows; set `window-filter` to `['terminals']`; Super+Alt+A → exactly the three terminals in one 3-cell row on 2560×720, all other frames unchanged; Super+Alt+Z restores; picker screenshot with chips; clear the filter; Super+Alt+Shift+2 → 12 cells 6×2; Super+Alt+Z.
- [ ] Run `tests/integration/run.py --keep` — Expected: `PASS`. Keep JSON + screenshots under `docs/verification/2026-10-18/`.

### Task 5: Review, install, record

- [ ] Whole-change review subagent; fix findings; rerun Task 1–3 verifications.
- [ ] `./install.sh`; confirm installed files match; live shell keeps old code until Sam reloads (Alt+F2 `r`). No agent-initiated live restart.
- [ ] Update `docs/todo/product/six-eight-window-grids.md` (or a new task file), rebuild TODO, memory, `~/shared-status.md`; commit and push.
