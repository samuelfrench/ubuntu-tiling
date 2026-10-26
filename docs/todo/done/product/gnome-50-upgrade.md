---
title: "Restore the layouts tray after the Ubuntu upgrade"
status: done
area: product
due: null
updated: 2026-10-26
owner: agent
brief: "v4 ACTIVE; Sam confirmed tray and picker work; verified and activated without a desktop restart"
refs:
  - "extension/metadata.json"
  - "extension/windowState.js"
  - "extension/gridControls.js"
  - "docs/verification/2026-10-26/README.md"
  - "docs/verification/2026-10-26/live.json"
test: null
---

- **Outcome:** Sam confirmed "yes, it's all working now" after being asked to click the restored grid icon and verify the picker. Version 4 is ACTIVE on Ubuntu 26.04.1 / GNOME Shell 50.1 Wayland. Read-only checks found a visible 60×32 panel at x4820/y0, no registered extension errors, stock Tiling Assistant 54 ACTIVE, and the same live Shell PID 10586. No logout or desktop restart occurred. This closes the old v3 layouts/filters activation handoff as well.
- **Cause and fix:** The upgrade rejected v3 as OUT OF DATE because its metadata supported only GNOME 46. Runtime commit `80e3a0e56fdeec49b263c539e8907f0380de9136` adds GNOME 50 support, feature-detects changed maximization APIs, uses stable TA settings/shortcut strings, preserves Undo for TA axis-constrained tiles and independent native maximize/fullscreen overlays, and repairs zero-height FlowLayout program chips.
- **Validation:** 137 unit tests, 10 offline harness tests, 27 TODO-tool tests, generated TODO, isolated installer, strict schema, metadata and syntax checks pass. Full isolated GNOME 50 suite run 4 PASS; no extension JS errors, actual pointer chip clicks at 28px height, and picker screenshots fit the 2560×720 test monitor. Read-only code review found no blockers. All 11 installed runtime files match the tested hashes. GNOME 46 native coverage is historical, with current legacy-API unit coverage. Reproduce non-native gates from `.github/workflows/test.yml`; native harness `tests/integration/run.py --keep` uses private D-Bus/XDG/dconf/runtime, software rendering and `--mode=user`.
- **Receipts and deployment:** `docs/verification/2026-10-26/` contains native results, screenshots, `runtime-sha256.json` and live evidence with Sam's final confirmation. Runtime verification revision `8d30d29e697adf2efcf7038a4e7e98d6a699be34` passed CI `40406347257`; installed v4 was byte-verified and then manually activated. Private pre-repair backup: `/home/sam/.local/state/ubuntu-tiling/gnome50-recovery-20261026/`. No new service or billing.
- **Activation lesson and user control:** Public D-Bus ReloadExtension is deprecated; an OUT OF DATE extension that has never been imported can be reloaded through Looking Glass's internal extension manager, while already imported code remains cached. Automated command-box attempts were unreliable and annoyed Sam; he told another terminal to disable Alt+F2. All automated key input stopped. Do not reopen command boxes, reconfigure his shortcut, restart the desktop, disable stock Tiling Assistant, or toggle global version validation automatically. Global version validation remained enabled throughout.
- **Earlier failures resolved:** Native run 1 found removed TA constants; run 2 found axis-flag Undo failures and zero-height chips; run 3 narrowed the remaining failures to two native-overlay Undo cases. Run 4 passed after `needsNativeRestore` distinguished native state from TA's own constraints. Retained measurements and the bounded GNOME/mutter upstream lead are in `docs/todo/product/flow-layout-zero-height.md`; no upstream report was submitted.
- **Exit state:** No remaining work for this repair. Future work must start from the separate idea tasks in generated `TODO.md`; do not reopen this resolved activation handoff.
- **Shared memory:** `/home/sam/.codex/memories/extensions/ad_hoc/notes/20261026T220307Z-codex-ubuntu-tiling-gnome50-complete-28914f79.md` supersedes the pending activation/picker notes and records Sam's final confirmation and the no-automated-command-box correction.
