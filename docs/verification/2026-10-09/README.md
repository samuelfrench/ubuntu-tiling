# Six- and eight-window verification

Verified locally on Ubuntu with GNOME Shell 46 on 2026-10-09. Runtime changes were reviewed independently. `node --test tests/*.test.mjs`: **77/77**; `node --test scripts/todo/__tests__/*.test.mjs`: **27/27**; generated TODO, schema compilation and syntax checks pass. `python3 tests/integration/install.py` passes installation, reinstallation and removal with exact-file and unrelated-settings checks on a private dconf-only bus.

`tests/integration/run.py --keep` **PASS**, stock root `/tmp/ut-stock-rmon76q4`, extension root `/tmp/ut-columns-hxz7d1rw`. The retained results and screenshots below are from that run. After it, only the native-preparation timeout wording changed in runtime code; geometry and lifecycle behavior are identical. The test compositor was Wayland with software rendering and private settings, D-Bus and runtime directories; `--mode=user` avoids loading Ubuntu DING. The user's live X11 Shell PID **12141**, started **2026-10-09 13:18:05**, was unchanged after the suite.

- Existing Super+Left/Right and drag insertion: three, four and five columns; stock behavior after disable.
- Real Super+Alt+6/8 input: exact three-by-two/four-by-two bounds; minimized and other-workspace windows excluded.
- Native picker: six/eight modes, selected-window identity, number-key placement, Escape, real pointer click on panel icon and re-enable.
- Undo: original frames, maximized/fullscreen state and underlying native restore bounds, including previously tiled windows; single-window placement; overflow arrangement.
- Tiling Assistant: selected windows share a group, excluded windows retain geometry with no stale selected-group references; gap changes retain exact prior frames; maximized-with-gaps hooks survive Undo and workspace movement.
- Disable with a modal open or native preparation pending: input released, shortcuts removed, no late movement or pending waiters.

The screenshots show the actual native picker. `picker-six.png` includes the isolated desktop because its actor allocation was pending when the capture rectangle was read; the dialog itself is visible and was inspected. No live v2 activation or desktop-use outcome is claimed by these isolated results. Installation and pending reload are recorded in the current task file.

`initial-failed-grid-run.json` retains the first native restore failure that led to waiting for frame commits. `advanced-failed-grid-run.json` retains the gap-preservation failure and two incorrect test assumptions, all resolved in the passing run. This evidence is historical and is not a current failing gate.
