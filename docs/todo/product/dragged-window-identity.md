---
title: "Verify dragged-window identity before changing it"
status: idea
area: product
due: null
updated: 2026-10-09
owner: agent
brief: "Historical possible preview/drop mismatch is unobserved; preserve the exact reproduction lead"
refs:
  - "TODO-archive.md:81"
  - "extension/hooks.js"
  - "tests/integration/run.py"
test: null
---

- **What:** Investigate the old possible discrepancy when an unfocused window is Super-dragged to an edge.
- **Why:** `getTileFor` has no window argument and the wrapper assumes `global.display.focus_window`, as stock adaptive tiling does. A mismatch was possible, not observed; do not report an established failure.
- **Next:** Reproduce unfocused Super-drag in an authorized isolated integration scenario. Only if the preview/drop plan disagrees, track `global.display` `grab-op-begin` `(display, window, op)` (stock TA `moveHandler.js:22`) and add a regression case. Done means measured matching preview and final placement.
- Source: `TODO-archive.md:81`. No GNOME Shell started during this migration.
