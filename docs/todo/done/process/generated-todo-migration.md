---
title: "Generate TODO from per-task files"
status: done
area: process
due: null
updated: 2026-10-09
owner: agent
brief: "Reviewed: 27 tests pass; 91 source lines preserved byte-for-byte; generated TODO guards active"
refs:
  - "docs/todo/README.md"
  - "docs/todo/migration-2026-10-09.md"
  - ".github/workflows/test.yml"
test: null
---

- **What:** Replace hand-maintained TODO with per-task source files, deterministic generated `TODO.md` and `docs/todo/index.json`, a query tool and CI drift guards.
- **Why:** The standing 2026-10-02 instruction requires migration before substantial runtime work. Original TODO is 91 lines and has zero open `- [ ]` checkboxes; its complete bytes are retained in `TODO-archive.md`.
- **Next:** Maintain task files and regenerate both outputs for every milestone. Parent reviewed the archive, generated tasks, workflow and 27 passing tooling tests on 2026-10-09; migration is committed separately from runtime work. No runtime or GNOME process was touched by this lane.
- Tooling is adapted from coffee-explorer's dependency-free generator; project areas are `ci`, `infra`, `process`, `product`. Day-to-day edits go in task files only.
- `.github/workflows/test.yml` gains TODO tests and drift check. There is no deploy workflow. Its unit/test workflow remains always-on: adding docs paths-ignore to this only workflow would skip the very TODO checks needed on docs-only pushes.
- Scope excludes extension/runtime files, integration harness, README and install script. Local verification: 27/27 TODO tests pass; build --check passes (7 task files). Original source/archive compare equal, SHA-256 `f199ed37e9b6ae5aeac9b462a0a6cfeddacd3c68eaacc70b16fc88af20e4b4b4`; 91 total lines / 69 non-empty lines / 0 open checkboxes; accounting missing 0. Section split yields 11 sections. Parent review and separate migration commit/push pending.
