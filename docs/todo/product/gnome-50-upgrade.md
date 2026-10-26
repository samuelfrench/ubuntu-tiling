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
- **Next:** Port from the installed GNOME 50 / Tiling Assistant 54 APIs and run `tests/integration/run.py --keep`; determine a supported reload path for this never-imported OUT OF DATE extension without restarting the live Shell.
