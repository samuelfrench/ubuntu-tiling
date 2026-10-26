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
- **Compatibility evidence:** GNOME 49/50 removed `Meta.Window.get_maximized()` in favor of `get_maximize_flags()` and changed native maximize/unmaximize arguments. Version 4 adapts calls across eligibility, column hooks and grid/Undo operations. Focused checks: 136 node tests, 10 offline harness tests, isolated installer and schema pass. Full native suite is running with output `/tmp/ubuntu-tiling-gnome50-native-1.log`; stock receipt `/tmp/ut-stock-bc3foaja`.
- **Live activation investigation:** GNOME 50 Wayland session is active; Shell Eval is disabled. Public D-Bus `ReloadExtension` is deprecated and always returns NOT_SUPPORTED (installed `/usr/lib/gnome-shell/libshell-18.so`, `ui/shellDBus.js:489`). Internal `extensionSystem.reloadExtension` can reload this never-imported OUT OF DATE copy, unlike an already imported older version. Do not toggle global version validation: its handler disables every extension including stock Tiling Assistant. Investigate a targeted reload through GNOME's built-in Looking Glass UI after native validation; otherwise record a precise logout handoff.
- **Next:** Read the full native result, review the code, commit/push and confirm CI, then install and target only this extension for activation. Parent owns the live session; implementer works only in isolated test sessions.
