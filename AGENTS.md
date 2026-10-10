# ubuntu-tiling

GNOME Shell extension that adds column insertion to Ubuntu's Tiling Assistant. Read `TODO.md` and `CLAUDE.md` before work.

- Unit tests: `node --test tests/*.test.mjs`. Integration: `tests/integration/run.py` (runs its own isolated headless GNOME Shell; never touches the live session's dconf).
- The headless shell must use `--mode=user` (Ubuntu mode loads DING, which restarts the live session's desktop icons).
- Do not disable `tiling-assistant@ubuntu.com`.
- `TODO.md` is generated from `docs/todo/<area>/<slug>.md`. Update task files in the same beat as work changes, run `node scripts/todo/build.mjs`, and commit task sources, `TODO.md` and `docs/todo/index.json` together. Never hand-edit `TODO.md`; see `docs/todo/README.md`. Check with `node --test scripts/todo/__tests__/*.test.mjs` and `node scripts/todo/build.mjs --check`.
