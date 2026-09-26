# ubuntu-tiling

GNOME Shell extension that adds column insertion to Ubuntu's Tiling Assistant. Read `TODO.md` and `CLAUDE.md` before work.

- Unit tests: `node --test tests/*.test.mjs`. Integration: `tests/integration/run.py` (runs its own isolated headless GNOME Shell; never touches the live session's dconf).
- The headless shell must use `--mode=user` (Ubuntu mode loads DING, which restarts the live session's desktop icons).
- Do not disable `tiling-assistant@ubuntu.com`.
