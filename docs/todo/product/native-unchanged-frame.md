---
title: "Investigate native restore with identical bounds if encountered"
status: idea
area: product
due: null
updated: 2026-10-09
owner: agent
brief: "Unobserved narrow native-restore case; retain conservative 500 ms frame guard and manual-restore workaround"
refs:
  - "extension/gridControls.js"
  - "tests/integration/scenario.js"
test: null
---

- **Condition:** `extension/gridControls.js` native preparation requires a changed, stable frame within 25 × 20 ms before recording the underlying restore rectangle. A partial-maximized/fullscreen window whose normal frame is identical could time out even when responsive. This is a source-level possibility, not an observed failure. The review's original full-maximize example was rejected: Mutter shrinks saved full-workarea windows on unmaximize, so that example does not establish the issue.
- **Why retained:** GNOME 46's public Meta typelib has no configure-ack/commit accessor. Accepting an unchanged frame after a timer could save the wrong original bounds for an unresponsive Wayland client. Do not weaken the guard based only on cleared native state, generic actor damage, animation completion or ping liveness.
- **Next if reported:** Add a reproducible partial-max/fullscreen same-frame fixture to `tests/integration/scenario.js`, run `tests/integration/run.py --keep`, and record native flags plus frame snapshots through unmaximize/commit. Done means a real failing case and an acknowledgement mechanism preserving Undo, or close this as unobserved if the actual client always changes frame. Current safe workaround: restore the window from maximize/fullscreen, then invoke the grid. The timeout notification names this action.
