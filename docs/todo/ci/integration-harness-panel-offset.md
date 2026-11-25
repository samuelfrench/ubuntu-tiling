---
title: "Native integration harness fails with a 32 px panel offset"
status: known-failure
area: ci
due: null
updated: 2026-11-25
owner: agent
brief: "tests/integration/run.py exits 1 (58 checks) on GNOME 50.1 because the private shell has a 32 px top panel; stock mode fails identically"
refs:
  - "tests/integration/run.py"
test: "/usr/bin/python3 tests/integration/run.py"
---
- **Observed (2026-11-25, sam-MS-7D75, GNOME Shell 50.1):** exit 1, 58 failed checks. First line: `FAIL work areas differ: {'x': 0, 'y': 0, 'width': 2560, 'height': 720} vs {'x': 0, 'y': 32, 'width': 2560, 'height': 688}`. Every later geometry check fails by the same 32 px, in the [stock] shell as well as the [columns] shell.
- **Not a regression of the extension:** the stock shell has only Tiling Assistant and fails the same way; no repo commit since 2026-10-28 (ff06455); the same harness passed on 2026-10-28 (task minimum-size-window).
- **Trigger:** the private user-mode shell now shows a 32 px top bar, so the work area starts at y=32. Likely cause (unverified): another enabled extension or a Shell 50.1 default that the Oct 28 session did not have.
- **Real fix, not done:** read the work area from the shell instead of assuming 0,0,2560,720 (or disable the panel in `prepare_root`), then rerun the harness. Done = exit 0.
