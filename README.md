# Ubuntu window layouts

4 to 16 windows on one screen, or every window of the program types you pick, with a native GNOME picker, keyboard shortcuts and undo. Extends Ubuntu's built-in **Tiling Assistant** and keeps the existing column-insertion controls.

**Verified (2026-10-09, version 2):** 77 unit tests, 27 task-tool checks, isolated installation checks and the native GNOME 46 desktop suite pass. The desktop suite covers six/eight layouts, both picker modes, the panel button, keyboard placement, Undo, gaps, overflow groups and extension cleanup. See [verification](docs/verification/2026-10-09/README.md) and generated [TODO.md](TODO.md). Native GNOME verification of version 3 (more layouts, All and the program-type filter) is pending. Installing an update requires one Shell reload.

## Use

Click the **grid icon in the top bar**, or press **Super+Alt+Space**.

1. **Programs:** keep **All windows**, or pick one or more program types. The picker shows a chip with a window count for **Terminals** and for each other program with windows on this screen, for example **ChatGPT  2** or **Firefox  3**.
2. **Layout:** **All · N** sizes the grid to the N matching windows, up to 16. **4**, **6**, **8**, **9**, **10**, **12** and **16** use a fixed grid shaped to the monitor; the button shows columns × rows, for example **6 · 3×2**. Twelve windows are 6×2 on a 5120×1440 monitor and 4×3 on 1920×1080.
3. **Arrange windows** lays out the matching windows at once. To place only the current window, pick a numbered layout and click a tile, or press **1–9** for the first nine tiles.

| Action | Shortcut |
| --- | --- |
| Open the layout picker | **Super+Alt+Space** |
| Arrange all matching windows (up to 16) | **Super+Alt+A** |
| Arrange 4, 6, 8 or 9 windows | **Super+Alt+4**, **6**, **8**, **9** |
| Arrange 10 windows | **Super+Alt+0** |
| Arrange 12 windows | **Super+Alt+Shift+2** |
| Arrange 16 windows | **Super+Alt+Shift+6** |
| Undo the latest arrangement or placement | **Super+Alt+Z** |
| Place the selected window while the picker is open | **1–9** |
| Cancel the picker | **Escape** |

Super is usually the Windows key. Tab and arrow keys navigate the native controls; Enter activates the focused control.

### Program types

- **Terminals:** every program whose desktop file has the `TerminalEmulator` category (GNOME Terminal, Console, Ptyxis, Kitty, Alacritty, WezTerm, Ghostty, Konsole, Tilix and others), plus any window whose WM class is a known terminal, with or without a desktop file (for example `kitty`, `Alacritty`, `foot`, `xterm`, `org.wezfurlong.wezterm`).
- **Other programs:** one chip per desktop file. Windows without one are grouped by WM class; anything left over is **Other**.

The choice is saved when you press **Arrange windows**; Cancel and chip clicks do not change it. Every Super+Alt arrange shortcut then uses the saved choice, and the notification names it, for example `Arranged 11 windows (Terminals). Super+Alt+Z to undo.` A saved program with no open windows still shows a chip with count 0, so you can clear it.

To go back to all windows, open the picker, pick **All windows** and press **Arrange windows**, or run:

```bash
gsettings --schemadir ~/.local/share/gnome-shell/extensions/tiling-columns@samuelfrench.github.io/schemas reset org.gnome.shell.extensions.tiling-columns window-filter
```

### What Arrange moves

Arrange uses normal, resizable, non-minimized windows of the chosen program types on the **focused window's monitor and current workspace**. A numbered layout picks that many of the most recently used matching windows, then preserves their spatial order where practical; fewer windows leave empty tiles. **All** uses one tile per matching window, so 11 windows on a wide monitor become rows of 6 and 5. All picks the best-fitting rows for its number of windows, so **All · 16** can differ from the **16 · 8×2** button: on a 5120×1440 monitor All · 16 uses rows of 6, 5 and 5, while 16 keeps two rows of 8. Extra windows stay in place, and the picker and notification disclose the count. A window that cannot fit triggers a visible message and restores the previous layout.

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
python3 tests/integration/install.py
tests/integration/run.py
```

`columns.js`, `grids.js` and `windowGroups.js` (program types) handle pure planning. `hooks.js` wraps Tiling Assistant's `getTileFor`/`tile` for columns. `gridController.js` serializes reversible operations; `gridControls.js` provides the GNOME adapter, panel icon, modal picker and scoped keybindings. Explicit grid placement calls the original TA tile function and retains its tile groups. Disabling removes controls, shortcuts, pending timers and column hooks, and leaves already placed windows where they are. Undo history lasts for the current extension session.

The integration harness starts a private headless GNOME Shell with GTK test windows. It uses its own D-Bus session, dconf/data/cache/runtime directories, software rendering and `--mode=user`. Never share the live desktop's runtime directory or use Ubuntu mode, which loads DING. GNOME still calls GDM `RegisterSession` at startup; isolated test-shell permission is required under this project's operating rules and was granted for the October 9 task.

## License

MIT
