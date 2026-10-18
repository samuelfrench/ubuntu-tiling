# Layouts and program-type filter verification

Verified locally on Ubuntu with GNOME Shell 46 on 2026-10-18 at commit **7c3653a**, version 3. `node --test tests/*.test.mjs`: **133/133**; `python3 tests/integration/test_run_offline.py`: **10/10**; `node --test scripts/todo/__tests__/*.test.mjs`: **27/27**; `node scripts/todo/build.mjs --check`, `glib-compile-schemas --strict --dry-run extension/schemas` and `node --check` on every `extension/*.js` pass. `python3 tests/integration/install.py` **PASS**.

`tests/integration/run.py --keep` **PASS** (isolated native GNOME 46 suite, approved by the user on 2026-10-18), stock root `/tmp/ut-stock-lc4ykg79`, extension root `/tmp/ut-columns-ba5zfymf`. The retained results are `layouts-filters-pass.json` and `stock-pass.json`; the screenshots below are from that run.

Version 3 adds layouts 4/6/8/9/10/12/16 with monitor-aware shapes, an All layout sized to the matching windows (maximum 16) and program-type filter chips (Terminals, per app, WM class, Other). The filter is saved to GSettings `window-filter` on Arrange and used by every shortcut. Shortcuts: Super+Alt+A/4/6/8/9/0, Super+Alt+Shift+2 (12), Super+Alt+Shift+6 (16), Super+Alt+Z (Undo), Super+Alt+Space (picker).

Native coverage carried over from version 2: existing 3/4/5 columns, six/eight shortcuts, exclusions, picker modes, panel click, placement, Undo, gaps, overflow groups, gapped max, disable and re-enable. New in this run:

- `ut-term` windows are classified as Terminals through a private TerminalEmulator desktop file.
- Picker Terminals chip + All + Arrange tiles exactly 3 terminals in one row; every other window is unchanged.
- The filter is persisted; Undo restores the prior frames; Super+Alt+A applies the saved filter; Cancel never writes the filter.
- Super+Alt+Shift+2 (6x2) and Super+Alt+Shift+6 (8x2) with Undo.
- All with one matching window maximizes it, and Undo restores it.
- Arranging Terminals while `ut-A` is focused leaves a terminal focused and topmost; Undo returns focus to `ut-A`.
- Real-pointer clicks and the `shell.log` extension-error gate.
- Picker dialog measured at 600x565 (Terminals/All) and 600x635 (12 layout), inside the 2560x720 monitor.

Screenshots: `picker-all-terminals.png`, `picker-twelve.png`, `picker-six.png`, `picker-eight.png`.

Two earlier native runs, at dacf764 and 0698586, failed only `screenshot_all_terminals` and `screenshot_twelve`, which reported bounds 0,0,2560x720. Cause: the helper measured the full-stage `dialogLayout` instead of the visible inner `Dialog._dialog`. These were test-measurement false positives, not extension defects; 7c3653a measures the visible box and the suite passes. The run at 0698586 had already confirmed the All-with-one-window and focus behavior above natively.
