# ubuntu-tiling

Live source of truth. Update in the same beat as work changes.

## Current (2026-09-17)

Public GitHub repo + Ubuntu zone tiling app.

- Host: Ubuntu 24.04.4, GNOME Shell 46.0, **X11** `DISPLAY=:1`, primary `DisplayPort-3` **5120x1440**.
- Workarea: `5054x1408+66+32`.
- Runtime: `/usr/bin/python3` (3.12). Overlay is **Tkinter** (stdlib). Snap backend is X11 ctypes. Do not use conda python for the app.
- Tests: `python -m pytest tests` → **20 passed**.
- Installed: `~/.local/bin/ubuntu-tiling`. Keys `<Super><Alt>e` / `<Super><Alt>space` / `<Super><Alt>1..9`.
- Overlay shows those snap shortcuts on each zone plus a bottom keycap legend (editor + snap).
- Editor running this session: `/usr/bin/python3 -m ubuntu_tiling edit` (started after Tk rewrite).
- Repo: https://github.com/samuelfrench/ubuntu-tiling
- `tiling-assistant@ubuntu.com` left enabled.

## Done

- [x] Geometry/config/X11 snap + tests
- [x] Zone editor + picker + keybindings + CLI
- [x] Install on this session
- [x] Public repo `https://github.com/samuelfrench/ubuntu-tiling`
- [x] Start editor overlay (Tk)
- [x] Shortcuts drawn on overlay (zone labels + bottom legend)

## Rejected

- Replace GNOME with i3/sway: would replace the DE.
- Pure userspace Wayland snap without a GNOME extension: mutter blocks it.
- GTK3 DrawingArea/CSS overlay: needs `python3-gi-cairo`; `gi._gi_cairo` missing and sudo apt was password-blocked. Switched to Tk.
- `Ctrl+Alt+1..9`: TTY risk. Use Super+Alt.

## Known non-blocking

- Wayland: enable `ubuntu-tiling@samuelfrench.github.io` then restart the session. This machine is X11.
- SSD titlebar: snap X/width exact; client Y sits under `_NET_FRAME_EXTENTS` top. Usable.
- `/usr/bin/python3 -m pytest` has no pytest; conda pytest is fine.

## Next session FIRST

- Repo URL: https://github.com/samuelfrench/ubuntu-tiling
- `ubuntu-tiling doctor` then `ubuntu-tiling edit` if the overlay is not up.
- Deploy: none (local desktop app).
- Shared note: `~/.codex/memories/extensions/ad_hoc/notes/20260917T144929Z-ubuntu-tiling-public.md`
