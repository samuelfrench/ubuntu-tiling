---
title: "Re-expand columns after a window leaves"
status: idea
area: product
due: null
updated: 2026-10-09
owner: agent
brief: "Retained follow-up: stock leaves free space after close or untile; no current implementation"
refs:
  - "TODO-archive.md:64"
test: null
---

- **What:** Consider widening remaining columns when a tiled window closes or becomes untiled.
- **Why:** The old TODO records that stock behavior leaves free space and can offer Tiling Popup on the next tile. This is a retained idea, not a newly observed defect.
- **Next:** Inspect `extension/columns.js` and `extension/hooks.js`, reproduce under an authorized isolated run, then decide whether this improves the new grid workflow. Preserve stock behavior unless the scope is explicitly extended.
- Historical source: `TODO-archive.md:64`. No measurement or implementation was added in the migration.
