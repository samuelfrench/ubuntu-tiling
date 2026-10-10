---
title: "Easy six- and eight-window layouts"
status: now
area: product
due: null
updated: 2026-10-09
owner: agent
brief: "Implement native 3x2 and 4x2 picker, shortcuts, safe arrange and undo; isolated tests authorized 2026-10-09; runtime implementation pending"
refs:
  - "extension/"
  - "tests/integration/run.py"
  - "TODO-archive.md"
test: null
---

- **What:** Add six-window (3 columns × 2 rows) and eight-window (4 columns × 2 rows) layouts to the existing Tiling Assistant extension, with a native panel picker and numbered cells for placing the focused window.
- **Why:** Sam asked 2026-10-09 for more than the stock four corners, easily, and "super high quality". The 2026-09-26 three/four/five full-height column proof does not verify these grids.
- **Next:** Implement pure geometry and reversible window operations, then native controls; run `node --test tests/*.test.mjs`. Sam explicitly authorized isolated GNOME tests for this task on 2026-10-09; run `tests/integration/run.py` after implementing unit-verified runtime changes. A live Shell restart remains Sam-only.

- Controls: `Super+Alt+Space` opens the picker; `Super+Alt+6` and `Super+Alt+8` arrange; `Super+Alt+Z` undoes the latest layout action.
- Arrange only recent non-minimized, eligible normal windows on the focused monitor and active workspace; cap at six/eight, disclose overflow, and leave extra windows in their original positions. Undo restores original rectangles plus tiled/maximized states.
- Existing column insertion and Ubuntu's `tiling-assistant@ubuntu.com` stay active. Do not disable the stock extension or replace/restart the live shell from an agent.
- Current inspection 2026-10-09 by the parent agent: GNOME Shell 46, X11, 5120×1440; both extensions ACTIVE; live Shell PID 12141 since 2026-10-09 13:18:05. The old "not loaded" snapshot is stale. Prior three/four/five-column use on the live desktop remains unproven.
- Runtime implementation, current unit results, grid integration evidence, installed file identity and user-visible behavior are pending. The old archive is historical evidence, not a current deployment claim.
- Done means focused/full checks pass, changes committed and pushed, installed through the existing path, exact installed files verified, authorized integration results recorded, and live-session activation status recorded without claiming unobserved results.
- No account, billing or third-party publication clock applies. Sam granted the isolated Shell test permission on 2026-10-09. Any required live restart remains Sam-only.
