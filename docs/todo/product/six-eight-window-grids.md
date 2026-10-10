---
title: "Easy six- and eight-window layouts"
status: now
area: product
due: null
updated: 2026-10-09
owner: agent
brief: "Native 3x2/4x2 picker, safe arrange and undo implemented; 77 unit tests pass; isolated integration, review and installation pending"
refs:
  - "extension/"
  - "tests/integration/run.py"
  - "TODO-archive.md"
test: null
---

- **What:** Add six-window (3 columns × 2 rows) and eight-window (4 columns × 2 rows) layouts to the existing Tiling Assistant extension, with a native panel picker and numbered cells for placing the focused window.
- **Why:** Sam asked 2026-10-09 for more than the stock four corners, easily, and "super high quality". The 2026-09-26 three/four/five full-height column proof does not verify these grids.
- **Next:** Review `extension/gridControls.js`, `extension/gridController.js` and the new grid unit tests, then extend/run `tests/integration/run.py` to verify native picker, shortcuts, placement, six/eight arrangements, rollback, undo (including underlying floating bounds after maximization), existing columns and disable cleanup. Sam explicitly authorized isolated GNOME tests for this task on 2026-10-09. A live Shell restart remains Sam-only.

- Controls: `Super+Alt+Space` opens the picker; `Super+Alt+6` and `Super+Alt+8` arrange; `Super+Alt+Z` undoes the latest layout action.
- Arrange only recent non-minimized, eligible normal windows on the focused monitor and active workspace; cap at six/eight, disclose overflow, and leave extra windows in their original positions. Undo restores original rectangles plus tiled/maximized states.
- Existing column insertion and Ubuntu's `tiling-assistant@ubuntu.com` stay active. Do not disable the stock extension or replace/restart the live shell from an agent.
- Current inspection 2026-10-09 by the parent agent: GNOME Shell 46, X11, 5120×1440; both extensions ACTIVE; live Shell PID 12141 since 2026-10-09 13:18:05. The old "not loaded" snapshot is stale. Prior three/four/five-column use on the live desktop remains unproven.
- Runtime implementation checkpoint 2026-10-09: pure exact integer geometry/MRU-selection module `extension/grids.js`; dependency-injected reversible transaction controller `extension/gridController.js`; native picker/panel/GNOME adapters in `extension/gridControls.js`; schema defaults, compact stylesheet, extension lifecycle integration and staged schema compilation in `install.sh`. Original bound TA tile bypasses only column insertion; TA tile groups and gaps stay active. Controller rejects overlapping invocations, restores partial failures, guards changed workspace/monitor context, skips closed windows, checks actual settled frames for app minimum-size overflow and cancels pending settle sources on disable.
- Verification checkpoint: `node --test tests/*.test.mjs` passed **77/77** (52 existing plus 25 new) on 2026-10-09. New coverage includes odd/offset work areas, normal/minimized/workspace/monitor filtering, MRU caps and spatial order, captured-window placement, undo metadata, closed windows, failure recovery, rapid calls and disable during pending effects. Native grid integration, final review, installed file identity and user-visible behavior remain pending. The old archive is historical evidence, not a current deployment claim.
- Done means focused/full checks pass, changes committed and pushed, installed through the existing path, exact installed files verified, authorized integration results recorded, and live-session activation status recorded without claiming unobserved results.
- No account, billing or third-party publication clock applies. Sam granted the isolated Shell test permission on 2026-10-09. Any required live restart remains Sam-only.

- Native verification launched 2026-10-09 with `tests/integration/run.py --keep`: retained stock and extension runs now cover real six/eight shortcuts, maximized/fullscreen Undo, exclusions, both picker screenshots, number-key placement, cancel, disable cleanup and re-enable. Initial run retained at `/tmp/ut-columns-fswy0mpk/result.json`: grids, picker, number placement, cancel and disable cleanup passed, but native unmaximize/unfullscreen after Undo returned grid-cell sizes; re-enable assertion also needed to dismiss stock TA popup. Those failures prompted asynchronous frame restoration and a corrected popup precondition. Second run PASS: `/tmp/ut-columns-sq1t5esg/result.json`. A final run now also exercises native maximize/fullscreen of already-tiled windows, overflow group reconciliation, maximized-with-gaps workspace hooks and disabling during native preparation. Final integration/install still pending. Full runtime unit suite is now 77/77.

- Review found and addressed: Undo must restore through the original TA tile path to preserve edge constraints and maximized-with-gaps hooks; successful Arrange must explicitly reunite chosen windows into one group (unless TA groups disabled). Wayland restoration waits are cancellable and bounded; disabling cancels pending operations and leaves committed geometry, with no delayed moves after disable.

- Failed-gate receipt retained in `docs/verification/2026-10-09/initial-failed-grid-run.json`; the second run fixed and passed all three original failures. Review also required an explicit timeout error for an unresponsive native frame; the bounded preparation now fails instead of recording unverified geometry.
