# ubuntu-tiling

Live source of truth. Update in the same beat as work changes.

## Current (2026-09-17)

Public GitHub repo + Ubuntu zone tiling app.

- Host: Ubuntu 24.04.4, GNOME Shell 46.0, **X11** `DISPLAY=:1`, primary `DisplayPort-3` **5120x1440**.
- Workarea (app `doctor`, matches `xprop _NET_WORKAREA`): `5054x1408+66+32`.
- Runtime: `/usr/bin/python3` (3.12 + gi). Conda python has no `gi`.
- Tests: `python -m pytest tests` → **16 passed**.
- Installed: `~/.local/bin/ubuntu-tiling`, desktop file, GNOME keys `<Super><Alt>e` / `<Super><Alt>space` / `<Super><Alt>1..9`.
- Default layout: 4 columns on DisplayPort-3. Config: `~/.config/ubuntu-tiling/config.json`.
- Snap probe (GTK3 `ubuntu-tiling-probe`): zone 2 target `1248x1392+1337+40`; xwininfo client `1248x1371+1337+69`. X/width exact. Y is client origin under a 37px SSD titlebar; mutter clamps the frame to the panel (`32+37=69`). Usable.
- `tiling-assistant@ubuntu.com` left enabled. Super+1..9 remains dock launchers.

## Done

- [x] Geometry/config/X11 snap + tests
- [x] GTK zone editor + picker + keybindings + CLI
- [x] Install on this session
- [x] Public repo `https://github.com/samuelfrench/ubuntu-tiling` (`PUBLIC`, `main`)
- [ ] Start editor overlay
- [ ] Shared memory closeout

## Rejected

- Replace GNOME with i3/sway: would replace the DE.
- Pure userspace Wayland snap without a GNOME extension: mutter does not let regular clients move other windows.
- Drive Tiling Assistant layouts instead of our editor: no draw-your-own-zones UI. Leave TA installed.
- `Ctrl+Alt+1..9` shortcuts: TTY/session risk. Use Super+Alt.

## Known non-blocking

- Wayland: enable `ubuntu-tiling@samuelfrench.github.io` then restart the session. This machine is X11.
- `wmctrl` is not installed; X11 is ctypes/`libX11.so.6`.
- SSD titlebar: xwininfo client Y sits below `_NET_FRAME_EXTENTS` top; frame still fills the workarea. Not chasing a 1px decoration match.
- `python -m pytest` on `/usr/bin/python3` has no pytest; use conda pytest or `pip install pytest` in a venv. Geometry tests are pure Python.

## Next session FIRST

- Repo is public. Resume from this file, then `ubuntu-tiling doctor`.
- Repo URL: https://github.com/samuelfrench/ubuntu-tiling
- HEAD at publish: `26b8c8b48a7b16d15e3cd7c92809cb41d5da57af`
- Deploy: none (local desktop app). Installed on this machine via `ubuntu-tiling install`.
- Shared note: `~/.codex/memories/extensions/ad_hoc/notes/20260917T144929Z-ubuntu-tiling-public.md`
