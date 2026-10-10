# Ubuntu window layouts

Six or eight windows on one screen, with a native GNOME picker, keyboard shortcuts and undo. Extends Ubuntu's built-in **Tiling Assistant** and keeps the existing column-insertion controls.

**Development status (2026-10-09):** six/eight-grid controls are implemented and 77 unit tests pass. Native grid integration, final review and installation verification are pending; see generated [TODO.md](TODO.md). The earlier isolated three/four/five-column proof does not verify the new grids.

## Use

Click the **grid icon in the top bar**, or press **Super+Alt+Space**. Choose **6 windows (3 × 2)** or **8 windows (4 × 2)**. Click a numbered tile to put your current window there; number keys work while the picker is open. Use **Arrange windows** to lay out the current screen at once.

| Action | Shortcut |
| --- | --- |
| Open the layout picker | **Super+Alt+Space** |
| Arrange six windows | **Super+Alt+6** |
| Arrange eight windows | **Super+Alt+8** |
| Undo the latest arrangement or placement | **Super+Alt+Z** |
| Place the selected window while the picker is open | **1–6** or **1–8** |
| Cancel the picker | **Escape** |

Super is usually the Windows key. Tab and arrow keys navigate the native controls; Enter activates the focused control.

Arrange uses normal, resizable, non-minimized windows on the **focused window's monitor and current workspace**. It picks the six/eight most recently used windows, then preserves their spatial order where practical. Extra windows stay in place, and the picker and notification disclose the count. Fewer windows leave empty tiles. A window that cannot fit triggers a visible message and restores the previous layout.

Undo restores the preceding positions and tiling/maximized/fullscreen/always-on-top state; closed windows are ignored. There is one undo step, retained until the next successful layout or extension reload. Undo requires the original workspace and monitor arrangement. Existing Tiling Assistant gaps and shared-border resizing apply.

## Full-height columns

Tile two windows with **Super+Left** and **Super+Right**. Focus a third window and press **Super+Right**, or drag it to that screen edge: it becomes a third column. **Super+Left** adds a column on the left. Existing columns shrink proportionally; no column goes below 400 px. The drag preview shows the insertion slot.

This only applies when two or more full-height tiled columns already fill the monitor. Normal halves, corners, maximize and Tiling Assistant's tiling popup retain their behavior. Ctrl-drag onto the middle of a column uses Tiling Assistant's adaptive placement.

## Install

Requires GNOME Shell 46 and enabled Tiling Assistant, included with Ubuntu 24.04. Keep `tiling-assistant@ubuntu.com` enabled.

```bash
git clone https://github.com/samuelfrench/ubuntu-tiling.git
cd ubuntu-tiling
./install.sh
```

The installer validates and compiles the keyboard schemas before replacing installed files. Then load the new code:

- **X11:** Alt+F2, type `r`, Enter. Windows stay open.
- **Wayland:** log out and back in.

Check `gnome-extensions info tiling-columns@samuelfrench.github.io` for `State: ACTIVE`, then open the picker with **Super+Alt+Space**. An already active extension continues running its old code until the shell reloads.

Remove with `./install.sh uninstall`.

## Development and verification

```bash
node --test tests/*.test.mjs
node --test scripts/todo/__tests__/*.test.mjs
node scripts/todo/build.mjs --check
tests/integration/run.py
```

`columns.js` and `grids.js` handle pure planning. `hooks.js` wraps Tiling Assistant's `getTileFor`/`tile` for columns. `gridController.js` serializes reversible operations; `gridControls.js` provides the GNOME adapter, panel icon, modal picker and scoped keybindings. Explicit grid placement calls the original TA tile function and retains its tile groups. Disabling removes controls, shortcuts, pending timers and column hooks, and leaves already placed windows where they are. Undo history lasts for the current extension session.

The integration harness starts a private headless GNOME Shell with GTK test windows. It uses its own D-Bus session, dconf/data/cache/runtime directories, software rendering and `--mode=user`. Never share the live desktop's runtime directory or use Ubuntu mode, which loads DING. GNOME still calls GDM `RegisterSession` at startup; isolated test-shell permission is required under this project's operating rules and was granted for the October 9 task.

## License

MIT
