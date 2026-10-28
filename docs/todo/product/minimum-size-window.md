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
- **Next:** Implement and verify the error path, run the project gates, and record installation and activation state.
- **Implemented and installed:** The overflow check identifies the offending window by its title, falling back to “An untitled window”; numbered and All layout advice and rollback remain. Installed source matches `gridController.js`; the current shell has cached older code. Respect Sam's prior choice to activate at logout/login, without restarting or toggling extensions.
- **Validation:** Node unit suite passed 138 tests; TODO suite passed 27 and generated check passed; offline harness passed 10, schema and metadata checks passed. Isolated native integration passed with exit 0; CI run 40702399379 passed for 3aa26b0. After activation, trigger an oversized window and verify the system alert identifies it.
