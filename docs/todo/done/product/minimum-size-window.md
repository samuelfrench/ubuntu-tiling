---
title: "Identify the window with a minimum-size constraint"
status: done
area: product
due: null
updated: 2026-11-25
owner: sam
brief: "Done 2026-11-25: Nov 24 shell restart loaded the installed alert code that names the window; reopen only if an unnamed alert appears"
refs:
  - "extension/gridController.js"
  - "tests/gridController.test.mjs"
test: null
---

- **Request:** Identify the window whose minimum size exceeds its assigned tile in the system alert, preserving rollback and layout advice.
- **Next:** After Sam’s chosen logout/login, reproduce the warning in the live session and confirm the named window.
- **Implemented and installed:** The overflow check identifies the offending window by its title, falling back to “An untitled window”; numbered and All layout advice and rollback remain. Installed source matches `gridController.js`; the current shell has cached older code. Respect Sam's prior choice to activate at logout/login, without restarting or toggling extensions.
- **Validation:** Node unit suite passed 138 tests; TODO suite passed 27 and generated check passed; offline harness passed 10, schema and metadata checks passed. Isolated native integration passed with exit 0; CI run 40702399379 passed for 3aa26b0. After activation, trigger an oversized window and verify the system alert identifies it.
- **Native alert proof (2026-10-28):** A separate private `--mode=user` headless shell with the installed-source extension and a real GTK window requesting 1100 × 500 pixels placed into a 16-tile layout returned the minimum-size error. The actual GNOME System notification had title `Window layouts` and body `“Constraint test window” has a minimum size too large for this layout. Try a layout with fewer tiles.` The private shell exited successfully. This does not identify the window that caused Sam’s earlier live warning; no matching warning was in the user journal and the live shell is still the October 26 session.
- **Activation audit (2026-10-28):** The same live-session activation condition persists across three goal turns. Shell PID 10586 still dates to October 26, both extensions report ACTIVE, and installed `gridController.js` matches the source. The real notification was verified in an isolated shell; live verification remains pending Sam's chosen logout/login. Do not restart or toggle extensions. Resume by checking the new shell session and reproducing the oversized-window alert.

## P10 inbox burn-down 2026-11-25

- **Closed as done (type 2).** The remaining step was Sam's logout/login; that has since occurred (the Nov 24 reboot).
- **Activation happened.** The live GNOME Shell (PID 14616, `ps -o lstart`) started 2026-11-24 06:23:15 CT, after the 2026-10-26/28 installs (system boot 06:22:53; the earlier Oct 26 shell PID 10586 is gone). `gnome-extensions info` reports both tiling-columns@samuelfrench.github.io (version 4) and tiling-assistant@ubuntu.com ACTIVE. All 8 installed files under ~/.local/share/gnome-shell/extensions/tiling-columns@samuelfrench.github.io are byte-identical (`cmp`) to `extension/*.js` at origin/main ff06455, so the shell loaded the tested code. No repo commit has landed since 2026-10-28.
- **What was and was not verified.** Verified: the installed alert code (`gridController.js`) is the revision tested in the isolated native shell on 2026-10-28 (real GNOME notification titled `Window layouts` naming the window). Not verified: the specific window behind Sam's earlier live warning; no matching line exists in the user journal (`journalctl --user -b` has no `minimum size` entry), so it cannot be recovered. The next time the alert fires it now names the window by title. Reopen with the alert text if it shows an unnamed window.
- **Known failure found while checking.** The native harness `tests/integration/run.py` exits 1 (58 checks) on 2026-11-25 from a 32 px panel offset in the private shell, in the stock configuration too; see `docs/todo/ci/integration-harness-panel-offset.md`.
