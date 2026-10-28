---
title: "Identify the window with a minimum-size constraint"
status: waiting-sam
area: product
due: null
updated: 2026-10-28
owner: sam
brief: "Installed and tested; verify the alert after Sam’s chosen logout/login"
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
