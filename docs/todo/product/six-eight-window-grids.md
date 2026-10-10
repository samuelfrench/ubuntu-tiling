---
title: "Easy six- and eight-window layouts"
status: now
area: product
due: null
updated: 2026-10-09
owner: agent
brief: "Native six/eight grids, Undo, gaps, overflow groups and panel button pass; packaging passes; committing and installing tested v2"
refs:
  - "extension/"
  - "tests/integration/run.py"
  - "TODO-archive.md"
test: null
---

- **What:** Add six-window (3 columns × 2 rows) and eight-window (4 columns × 2 rows) layouts to the existing Tiling Assistant extension, with a native panel picker and numbered cells for placing the focused window.
- **Why:** Sam asked 2026-10-09 for more than the stock four corners, easily, and "super high quality". The 2026-09-26 three/four/five full-height column proof does not verify these grids.
- **Next:** Commit/push final corrections, verify exact CI head, install through `./install.sh`, verify installed file identity and retain the live Shell restart as Sam's activation step. Sam explicitly authorized isolated GNOME tests for this task on 2026-10-09. A live Shell restart remains Sam-only.

- Controls: `Super+Alt+Space` opens the picker; `Super+Alt+6` and `Super+Alt+8` arrange; `Super+Alt+Z` undoes the latest layout action.
- Arrange only recent non-minimized, eligible normal windows on the focused monitor and active workspace; cap at six/eight, disclose overflow, and leave extra windows in their original positions. Undo restores original rectangles plus tiled/maximized states.
- Existing column insertion and Ubuntu's `tiling-assistant@ubuntu.com` stay active. Do not disable the stock extension or replace/restart the live shell from an agent.
- Current inspection 2026-10-09 by the parent agent: GNOME Shell 46, X11, 5120×1440; both extensions ACTIVE; live Shell PID 12141 since 2026-10-09 13:18:05. The old "not loaded" snapshot is stale. Prior three/four/five-column use on the live desktop remains unproven.
- Runtime implementation checkpoint 2026-10-09: pure exact integer geometry/MRU-selection module `extension/grids.js`; dependency-injected reversible transaction controller `extension/gridController.js`; native picker/panel/GNOME adapters in `extension/gridControls.js`; schema defaults, compact stylesheet, extension lifecycle integration and staged schema compilation in `install.sh`. Original bound TA tile bypasses only column insertion; TA tile groups and gaps stay active. Controller rejects overlapping invocations, restores partial failures, guards changed workspace/monitor context, skips closed windows, checks actual settled frames for app minimum-size overflow and cancels pending settle sources on disable.
- Verification checkpoint: `node --test tests/*.test.mjs` passed **77/77** (52 existing plus 25 new) on 2026-10-09. New coverage includes odd/offset work areas, normal/minimized/workspace/monitor filtering, MRU caps and spatial order, captured-window placement, undo metadata, closed windows, failure recovery, rapid calls and disable during pending effects. Final review and native integration passed; installed file identity and live v2 behavior remain pending. The old archive is historical evidence, not a current deployment claim.
- Done means focused/full checks pass, changes committed and pushed, installed through the existing path, exact installed files verified, authorized integration results recorded, and live-session activation status recorded without claiming unobserved results.
- No account, billing or third-party publication clock applies. Sam granted the isolated Shell test permission on 2026-10-09. Any required live restart remains Sam-only.

- Native verification launched 2026-10-09 with `tests/integration/run.py --keep`: retained stock and extension runs now cover real six/eight shortcuts, maximized/fullscreen Undo, exclusions, both picker screenshots, number-key placement, cancel, disable cleanup and re-enable. Initial run retained at `/tmp/ut-columns-fswy0mpk/result.json`: grids, picker, number placement, cancel and disable cleanup passed, but native unmaximize/unfullscreen after Undo returned grid-cell sizes; re-enable assertion also needed to dismiss stock TA popup. Those failures prompted asynchronous frame restoration and a corrected popup precondition. Second run PASS: `/tmp/ut-columns-sq1t5esg/result.json`. A final run now also exercises native maximize/fullscreen of already-tiled windows, overflow group reconciliation, maximized-with-gaps workspace hooks and disabling during native preparation. Final integration/install still pending. Full runtime unit suite is now 77/77.

- Review found and addressed: Undo must restore through the original TA tile path to preserve edge constraints and maximized-with-gaps hooks; successful Arrange must explicitly reunite chosen windows into one group (unless TA groups disabled). Wayland restoration waits are cancellable and bounded; disabling cancels pending operations and leaves committed geometry, with no delayed moves after disable.

- Failed-gate receipt retained in `docs/verification/2026-10-09/initial-failed-grid-run.json`; the second run fixed and passed all three original failures. Review also required an explicit timeout error for an unresponsive native frame; the bounded preparation now fails instead of recording unverified geometry.

- Advanced run `/tmp/ut-columns-cyze04a1/result.json` retained as `docs/verification/2026-10-09/advanced-failed-grid-run.json`: native tiled→maximize/fullscreen→grid→undo→native restore and disable during preparation passed. Twelve failed assertions had three causes: actual Undo reapplied newly changed gaps to old tiles (now restore saved actual bounds after rebuilding TA hooks); mixed-group fixture assumed independent MRU despite stock group raising (disable group raising only in private fixture); workspace assertion incorrectly expected gapped-max to untile on an equal-workarea workspace (stock deliberately retains maximization; now verify retained geometry and connected workspace/unmanaging handlers). Final run also exercises a real pointer click on the panel button. Reproduce: `tests/integration/run.py --keep`.

- Final advanced integration **PASS**: stock `/tmp/ut-stock-rmon76q4/result.json`, extension `/tmp/ut-columns-hxz7d1rw/result.json`; retained JSON and picker screenshots in `docs/verification/2026-10-09/`. No extension JavaScript error in the headless log; only expected isolated-service messages. Live Shell PID remains **12141**, start **2026-10-09 13:18:05**, after test processes exit. Packaging `python3 tests/integration/install.py` PASS: install/reinstall/uninstall, exact files, compiled schema and unrelated settings retained using the existing dconf-only bus helpers. Initial packaging probe wrongly expected our own disabled UUID to be absent after uninstall and used default bus activation; corrected assertions and isolation are in the durable test. Final review accepted conservative native frame verification; timeout copy now tells the user to restore maximized/fullscreen windows and retry. The last native run precedes only that text change and the standalone installer test; geometry/lifecycle code is identical.
