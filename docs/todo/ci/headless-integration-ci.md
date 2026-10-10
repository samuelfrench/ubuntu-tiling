---
title: "Evaluate isolated GNOME integration in CI"
status: idea
area: ci
due: null
updated: 2026-10-09
owner: agent
brief: "Retained untested CI proposal; unit and TODO guards remain the actual CI gate"
refs:
  - "TODO-archive.md:43"
  - "TODO-archive.md:55"
  - "TODO-archive.md:66"
test: null
---

- **What:** Assess running the isolated integration harness on an `ubuntu-24.04` hosted runner.
- **Why:** The old TODO suggested installing `gnome-shell` and `gnome-shell-extension-ubuntu-tiling-assistant`; its cost and suitability were untested. Do not treat it as a current failing CI gate.
- **Next:** Read `tests/integration/run.py` and `.github/workflows/test.yml`, confirm packages and headless support, and only propose the CI lane after local authorized isolation succeeds. Preserve `--mode=user`, private XDG runtime/bus/dconf, software rendering and cleanup.
- Integration isolation reasons and historical incidents are preserved verbatim at `TODO-archive.md:43` and `TODO-archive.md:55`. Never run an Ubuntu-mode test shell: DING can restart live desktop icons.
