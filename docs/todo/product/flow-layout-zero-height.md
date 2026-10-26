---
title: "Prepare an upstream report for zero-height FlowLayout children"
status: idea
area: product
due: null
updated: 2026-10-26
owner: agent
brief: "GNOME 50.1 gives 28px-natural-height chips 0px allocation; local allocation workaround verified by real pointer clicks"
refs:
  - "extension/gridControls.js"
  - "tests/integration/scenario.js"
  - "docs/todo/done/product/gnome-50-upgrade.md"
test: null
---

- **Evidence:** Native upgrade run 2 `/tmp/ut-columns-bcpvoc5a/result.json` reported Terminals chip bounds 94×0 and All windows 93×0; real pointer input missed both. Focused native inspection measured natural height 28px but allocated height 0px. Measuring the FlowLayout preferred height at actual content width immediately before allocation restores 28px allocation. See `ChipBox.vfunc_allocate` in `extension/gridControls.js`.
- **Rejected fixes:** `min-row-height`, `snap_to_grid`, homogeneous layout and explicit child height still produced 0px allocation; do not repeat those as untested fixes.
- **Upstream target:** GNOME/mutter `clutter/clutter/clutter-flow-layout.c` on 50.1. Investigated mechanism: unconstrained preferred-height queries reset the cached row heights; allocation does not refresh them when requested width is -1. Confirm with a minimal standalone reproduction before assigning an upstream defect.
- **Local verification:** Native GNOME 50 run 4 PASS, source `80e3a0e56fdeec49b263c539e8907f0380de9136`; real pointer clicks hit both chips at 28px height. Retained results: `docs/verification/2026-10-26/gnome50-pass.json`. The app workaround is verified; upstream reproduction/reporting remains an idea.
- **Next:** Search existing GNOME/mutter issues, prepare a minimal generic St.Widget/FlowLayout reproduction showing natural versus allocated height and the focused workaround. Draft an issue/patch only; obtain Sam's go before an outward-facing submission. Done means an existing issue is linked or an approved report is submitted and recorded. No external clock starts until submission.
