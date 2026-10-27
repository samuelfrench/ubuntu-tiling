---
title: "Silence successful keyboard resize notifications"
status: now
area: product
due: null
updated: 2026-10-26
owner: agent
brief: "Shortcut success toasts suppressed and local checks pass; install after green CI, then Sam activates later"
refs:
  - "extension/gridControls.js"
  - "README.md"
test: null
---

- **Request and observation:** Sam asked for no system notification when resizing with a keyboard shortcut. All layout shortcuts currently call `GridControls.arrange`, which sends `Main.notify('Window layouts', 'Arranged …')` on every successful arrangement. The picker calls the same method.
- **Scope:** Silence successful keyboard arrangements, including the All shortcut and saved program filters. Preserve picker success feedback, actionable error messages, geometry and Undo. This is a local extension behavior change; no external approval clock or upstream submission is needed.
- **Implemented:** All eight arrangement callbacks pass `{notifySuccess: false}` to `GridControls.arrange`. Its default retains picker success feedback. The saved program-filter default and controller behavior are unchanged; README describes the distinction.
- **Validation:** `node --test tests/*.test.mjs` passed 137/137; `node --test scripts/todo/__tests__/*.test.mjs` passed 27/27; `/usr/bin/python3 tests/integration/test_run_offline.py` passed 10/10; generated TODO, isolated install/reinstall/uninstall, strict schema, metadata, Bash/JS syntax and whitespace checks passed. One-off `/tmp/ubuntu-tiling-quiet-resize-verify.mjs` executed actual source for all eight shortcut callbacks and `arrange`: zero success notifications, saved filter read at invocation, picker success/overflow/Undo text retained, actual controller error notification retained. Receipt: `docs/verification/2026-10-26/quiet-keyboard-resize.json`. Parent task review found no blocking issue. No new native GNOME test shell was launched; this focused check uses stubs for GNOME dependencies and is not live-desktop proof.
- **Activation control:** On October 26 Sam answered "Install it; I’ll activate it later." Live GNOME 50.1 currently has v4 ACTIVE and Shell Eval returns `(false, '')`; installed JS changes will remain cached until his next logout/login. Do not open command boxes, inject keys, change shortcuts, restart the desktop, toggle global version validation or disable stock Tiling Assistant.
- **Next:** Commit/push and wait for the exact revision's green CI, install with a private backup and byte verification, then retain this task as `waiting-sam` for logout/login. After Sam activates, verify both extensions ACTIVE and ask for a keyboard resize with no success toast before closing the task or goal.
