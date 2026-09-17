# ubuntu-tiling

Draw screen zones on Ubuntu, then snap windows into them.

Built for GNOME on X11 (Ubuntu 24.04). A small GNOME Shell extension is included for Wayland.

## Install

```bash
git clone https://github.com/samuelfrench/ubuntu-tiling.git
cd ubuntu-tiling
./bin/ubuntu-tiling install
```

`install` puts `~/.local/bin/ubuntu-tiling` on your path, adds a desktop entry, copies the Wayland helper extension, and binds:

- **Super+Alt+E** — zone editor
- **Super+Alt+Space** — click a zone to snap the focused window
- **Super+Alt+1..9** — snap the focused window to zone 1..9

Runtime is `/usr/bin/python3` plus the distro packages `python3-gi` and `gir1.2-gtk-3.0`. Do not run it with conda python.

## Use

1. `ubuntu-tiling edit` — drag empty space to create a zone, drag edges to resize, double-click to split. Keys: `2`/`3`/`4`/`5` column presets, `M` master+stack, `X` 2×2, `G` cycle gap, Enter to save, Esc to cancel.
2. Focus a window. Press **Super+Alt+1** (or open the picker).

First run on an ultrawide (≥2.8 aspect) creates four equal columns. Config: `~/.config/ubuntu-tiling/config.json`.

```bash
ubuntu-tiling doctor
ubuntu-tiling layout 4
ubuntu-tiling snap 1
ubuntu-tiling picker
```

## Notes

Ubuntu's Tiling Assistant can stay enabled. Super+1..9 stays as dock launchers.

On GNOME Wayland, enable `ubuntu-tiling@samuelfrench.github.io` and restart the session. X11 does not need the extension.

## Tests

```bash
python -m pytest
```
