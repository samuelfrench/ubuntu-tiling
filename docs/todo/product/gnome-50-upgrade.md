---
title: "Restore the layouts tray after the Ubuntu upgrade"
status: now
area: product
due: null
updated: 2026-10-26
owner: agent
brief: "GNOME 50.1 rejects version 3 as OUT OF DATE; port, test, install and verify the live panel"
refs:
  - "extension/metadata.json"
  - "extension/gridControls.js"
  - "tests/integration/run.py"
test: null
---

- **Observed:** Ubuntu 26.04.1 / GNOME Shell 50.1; `gnome-extensions info tiling-columns@samuelfrench.github.io` reports version 3, enabled, OUT OF DATE. `extension/metadata.json` supports only GNOME 46. Stock `tiling-assistant@ubuntu.com` version 54 is ACTIVE. Main and origin/main both start at def408e with a clean tree.
- **Work:** Check GNOME 46→50 API changes, implement compatibility, run unit/TODO/offline/install/schema and isolated native tests, then install and activate the extension. Preserve stock Tiling Assistant and the live desktop; no shell restart or logout. The isolated harness uses private D-Bus/XDG/dconf, software rendering and `--mode=user`.
- **Done criterion:** Current source committed/pushed with green CI; installed bytes match; extension ACTIVE and layouts panel/picker visibly restored in the live session. Record evidence and reconcile the old v3 activation handoff.
- **External clocks/upstream:** Existing GitHub CI starts after push. No new service or billing. No reusable third-party defect established; existing upstream column-insertion idea remains separate.
- **Compatibility evidence:** GNOME 49/50 removed `Meta.Window.get_maximized()` in favor of `get_maximize_flags()` and changed native maximize/unmaximize arguments. Version 4 adapts calls across eligibility, column hooks and grid/Undo operations. Initial focused checks: 136 node tests, 10 offline harness tests, isolated installer and schema pass. Native run 1 exposed removed Tiling Assistant JS constants; use stable setting/shortcut strings instead. Native run 2 (`/tmp/ubuntu-tiling-gnome50-native-2.log`, receipts `/tmp/ut-stock-3onltpli`, `/tmp/ut-columns-bcpvoc5a`) finished with 7 failures: TA 54 marks full-height tiles vertically maximized, confusing Undo's native-maximize handling; GNOME 50 gives the wrapping program chips zero height. Both are being fixed before installation. Remaining layout assertions passed and no extension JS errors were reported in run 2.
- **Live activation investigation:** GNOME 50 Wayland session is active; Shell Eval is disabled. Public D-Bus `ReloadExtension` is deprecated and always returns NOT_SUPPORTED (installed `/usr/lib/gnome-shell/libshell-18.so`, `ui/shellDBus.js:489`). Internal `extensionSystem.reloadExtension` can reload this never-imported OUT OF DATE copy, unlike an already imported older version. Do not toggle global version validation: its handler disables every extension including stock Tiling Assistant. Investigate a targeted reload through GNOME's built-in Looking Glass UI after native validation; otherwise record a precise logout handoff.
- **Activation preflight verified:** Existing user ACL permits `/dev/uinput`; temporary `uv run --cache-dir /tmp/ubuntu-tiling-uv-cache --no-project --with evdev` provides keyboard input. Alt+F2 → `lg` opens Looking Glass, and AT-SPI exposes its focused editable entry. Closed with Escape after inspection; no live extension change. After green tests, use `await Main.extensionManager.reloadExtension(Main.extensionManager.lookup('tiling-columns@samuelfrench.github.io'))` there; no global validation changes. Live Shell PID before recovery is 10586.
- **Further native evidence:** Run 3 (`/tmp/ubuntu-tiling-gnome50-native-3.log`, columns `/tmp/ut-columns-w_etdhg5`) passes pointer-based program-chip clicks and ordinary column Undo. Two remaining assertions exposed native maximize/fullscreen layered over a corner tile. The new `needsNativeRestore(state, workArea)` distinguishes TA-owned axis constraints from independent native state; 137 node tests pass, including regression cases for full-height/full-width tiles and native overlays. Native run 4 `/tmp/ubuntu-tiling-gnome50-native-4.log` is running; read-only task review is in progress.
- **Validated runtime:** `80e3a0e56fdeec49b263c539e8907f0380de9136`, version 4. Run 4 PASS (`/tmp/ut-stock-zi8mi3hu`, `/tmp/ut-columns-688a538j`), no extension JS errors; real-pointer chips are 28px high and both picker captures fit within 2560×720. All 11 runtime source files byte-match the native test install. Full local gates: 137 unit, 10 offline, 27 TODO tests; generated TODO, isolated installer, strict schema, syntax, metadata and diff checks pass. Read-only review found no blockers. Retained receipts: `docs/verification/2026-10-26/`.
- **Next:** Push the validated code and receipts, confirm CI, then install and target only this extension for activation. Parent owns the live session; native tests only used isolated sessions.
