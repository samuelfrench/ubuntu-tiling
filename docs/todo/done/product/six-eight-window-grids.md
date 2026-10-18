---
title: "Easy six- and eight-window layouts"
status: done
area: product
due: null
updated: 2026-10-18
owner: agent
brief: "Superseded by version 3 (more-layouts-app-filters); v2 grids were loaded live 2026-10-17 21:40; live trial folded into the v3 task"
refs:
  - "extension/"
  - "docs/verification/2026-10-09/README.md"
  - "docs/verification/2026-10-09/installed.json"
  - "tests/integration/run.py"
test: null
---

- **Closed 2026-10-18:** superseded by `docs/todo/product/more-layouts-app-filters.md` (version 3 adds 4/9/10/12/16, All and program filters on top of these grids; native suite PASS). Sam's live trial of the grid controls is tracked there.
- **What:** Six-window (3 columns × 2 rows) and eight-window (4 columns × 2 rows) layouts, native top-bar picker, numbered placement, shortcuts and one-step Undo, added to the existing Tiling Assistant column extension.
- **Why:** Sam asked 2026-10-09 to go beyond four corners easily and make it "super high quality". Implemented and verified locally; live activation remains explicit below.
- **Next — Sam:** On this X11 session, press **Alt+F2**, type **r**, Enter. Then `gnome-extensions info tiling-columns@samuelfrench.github.io` must show **Version: 2**, **State: ACTIVE**. Open **Super+Alt+Space** or the top-bar grid icon, try **Super+Alt+6 / 8**, then **Super+Alt+Z**. Record observed live behavior and move this task to done. No agent-initiated live Shell restart is authorized by the isolated-test approval.

## Installed and verified

- Runtime commit **d5ef510aa004f95ed3f49b1933b4b034559445bf** pushed to main; [CI 38010654491](https://github.com/samuelfrench/ubuntu-tiling/actions/runs/38010654491) **SUCCESS**. Later closeout-only commits leave the installed runtime unchanged.
- `./install.sh` installed version **2** at **2026-10-10 00:49:30 UTC** (October 9 CT). All **9** runtime source files match exactly; compiled schema and all four shortcut defaults verified. Unrelated extension settings preserved; stock `tiling-assistant@ubuntu.com` ACTIVE. Receipt: `docs/verification/2026-10-09/installed.json`. Prior installed copy retained at `/home/sam/.local/share/ubuntu-tiling-backups/20261010T004930Z/`.
- **Live activation confirmed 2026-10-18:** `gnome-extensions info` shows Version **2**, State **ACTIVE**; gnome-shell PID **6883** started **2026-10-17 21:40** CT. Sam's own live grid trial is still unrecorded.
- **Superseded (2026-10-09):** Shell still runs Columns **version 1**, ACTIVE, PID **12141**, started **2026-10-09 13:18:05**. The installed version 2 is not yet loaded into that process. Current host is GNOME 46, X11, 5120×1440. No live grid-use success is claimed.
- `node --test tests/*.test.mjs`: **77/77** (52 existing + 25 new). `node --test scripts/todo/__tests__/*.test.mjs`: **27/27**. Generated TODO, strict schema compilation and syntax checks pass. `python3 tests/integration/install.py`: PASS install/reinstall/uninstall with private settings, exact-file checks and unrelated settings retained.
- `tests/integration/run.py --keep`: final native **PASS**, stock `/tmp/ut-stock-rmon76q4`, extension `/tmp/ut-columns-hxz7d1rw`; retained JSON and screenshots in `docs/verification/2026-10-09/`. Covers existing 3/4/5 columns, real six/eight shortcuts, minimized/other-workspace exclusions, both picker modes, real panel click, number placement, Escape, Undo including native underlying restore frames, exact old/new gaps, overflow group reconciliation, gapped-max hooks, disable/re-enable and cancellation during native preparation. Last native run precedes only the actionable timeout text change, not geometry/lifecycle changes. No extension JavaScript error observed. Live PID was unchanged after all test processes exited.

## Behavior and retained evidence

- Controls: **Super+Alt+Space** picker; **Super+Alt+6 / 8** arrange; **Super+Alt+Z** undo. Picker **1–6 / 1–8** places its captured window. Arrange selects recent non-minimized eligible normal windows on the focused monitor/current workspace; extras stay in place and their count is disclosed. One Undo preserves preceding geometry, tiled/maximized/fullscreen/above states and TA groups. Existing column insertion remains active.
- Independent review corrections: wait for actual native restore frames before tiling/re-maximizing; restore via original TA tile to rebuild edge constraints/gapped-max hooks, then apply saved actual bounds even if gap preferences changed; reunite selected groups and clear reciprocal references from excluded groups. All are exercised by passing native tests.
- First failed gate `initial-failed-grid-run.json`: native unmaximize/unfullscreen after Undo restored grid sizes; fixed asynchronous preparation/restoration. Re-enable fixture also needed stock popup dismissal. Advanced failed gate `advanced-failed-grid-run.json`: exact Undo adopted newly changed gaps; fixed saved actual bounds. Two test assumptions corrected from stock source: group raising updates whole-group MRU, and gapped-max stays maximized on an equal-workarea workspace. The final passing receipts supersede both failures.
- Installer probe initially used standard bus activation and wrongly expected our UUID absent from the disabled list after uninstall. Durable `tests/integration/install.py` reuses the dconf-only bus helpers and checks preservation of unrelated entries. Do not use default bus activation for isolated tests; it can spawn portals/GVFS.
- Narrow **unobserved** identical-native-frame refusal is retained in `docs/todo/product/native-unchanged-frame.md`; clear manual-restore/retry message, conservative guard unchanged. No public exact configure-ack API was found. This is not a measured failing gate.
- Sam explicitly approved isolated Shell tests for this task on October 9. Use private D-Bus, dconf/data/cache/runtime, software rendering and **--mode=user**. Never share `/run/user/1000`, run Ubuntu-mode DING or disable stock TA. No account, billing, publication or external approval clock applies.
- Shared canonical memory: `/home/sam/.codex/memories/extensions/ad_hoc/notes/20261010T004942Z-ubuntu-tiling-grids-installed.md`; matching symlink `/home/sam/.claude/projects/-home-sam-claude-workspace-ubuntu-tiling/memory/ubuntu-tiling-grids-installed.md`. Supersedes September WIP/live state and the stale zone-app index description. Existing generated registries are not edited under the memory update constraint; the new canonical note supplies the correction for reconciliation.
