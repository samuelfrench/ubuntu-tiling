# ubuntu-tiling

Live source of truth. Update in the same beat as work changes.

## Current (2026-09-26) — PAUSED by Sam mid-pivot

Sam, 2026-09-26: "essentially throw out what we have, and figure out how to simply extend the existing ubuntu tiling feature to support allowing more tiling (like I want to have a 2 pane view and add a third item to the right)".

Then, while the first headless integration run was about to start: **"pause for now and update TODO.md, I don't want you to cause a crash"**. The integration run was rejected before it started. Nothing is running (checked: no `gnome-shell --headless`, `dbus-run-session`, or `client.py` processes). The planner subagent was stopped after it finished.

- Host: Ubuntu 24.04.4, GNOME Shell 46.0, **X11** `DISPLAY=:1`, `GNOME_SHELL_SESSION_MODE=ubuntu`, one monitor 5120x1440, work area `5054x1408+66+32` (dock on the left).
- Stock tiling = `tiling-assistant@ubuntu.com` v46 (deb `gnome-shell-extension-ubuntu-tiling-assistant 46-1ubuntu1.1`), `/usr/share/gnome-shell/extensions/tiling-assistant@ubuntu.com`. Still enabled and untouched.
- Decision: replace the Python zone app with a companion GNOME Shell extension `tiling-columns@samuelfrench.github.io` that wraps Tiling Assistant's `TilingWindowManager.getTileFor` and `.tile`. Spec: `docs/superpowers/specs/2026-09-26-tiling-columns-design.md`.

## Repo state — WIP on branch `tiling-columns` (pushed); `main` untouched at `a02fdcc` (old zone app)

- Branch `tiling-columns` holds all WIP as one commit (SHA in "Next session FIRST" below). `main` still has the old Python app and its README; do NOT merge until step 3 or 5 below passes.
- Deleted on the branch: whole old Python app — `ubuntu_tiling/`, `bin/`, `share/`, `gnome-extension/`, `pyproject.toml`, `tests/test_*.py`.
- Rewritten: `README.md` (starts with a WIP status line), `CLAUDE.md`, `AGENTS.md`, `.gitignore`, `.github/workflows/test.yml` (runs `node --test tests/*.test.mjs` + metadata JSON check).
- New:
  - `extension/columns.js` (122 lines, pure planner) + `tests/columns.test.mjs` (533 lines) — **39/39 pass** with `node --test tests/*.test.mjs` (2026-09-26).
  - `extension/extension.js` (hooks), `extension/metadata.json` (`shell-version: ["46"]`) — **never loaded in any shell yet**.
  - `install.sh` (`./install.sh` / `./install.sh uninstall`) — `bash -n` clean, **never run**.
  - `tests/integration/run.py`, `scenario.js`, `client.py`, `driver/` (test-only `ut-test-driver@local` that sets `global.context.unsafe_mode`) — `py_compile` clean, **never run**.
- Not reviewed yet: the subagent's `columns.js`/tests were only skimmed by the main agent; do a code review before merging.

## Host state (this machine)

- Old app REMOVED from the host 2026-09-26: 11 `<Super><Alt>` custom keybindings (list now `@as []`), `~/.local/bin/ubuntu-tiling`, `~/.local/share/applications/ubuntu-tiling.desktop`. Moved (not deleted) to `~/.local/share/ubuntu-tiling-zone-app-backup-2026-09-26/`: old `config/config.json` and the old `extension/` (`ubuntu-tiling@samuelfrench.github.io`, was never enabled).
- New extension NOT installed on the host.

## Next steps (in order) — get Sam's go before any step that starts GNOME Shell

1. ~~Fix the test command~~ DONE 2026-09-26: `node --test tests/` fails on Node 24 (`Cannot find module '.../tests'`; a directory is treated as a file); all docs + CI now use `node --test tests/*.test.mjs`.
2. Review `extension/columns.js` + `tests/columns.test.mjs` against the spec's "Behavior" / "Fallback to stock" sections.
3. **[needs Sam's OK — he paused this over crash risk]** Run `tests/integration/run.py --keep`. What it does: starts `gnome-shell --headless --wayland --no-x11 --mode=user --virtual-monitor 2560x720` twice inside `dbus-run-session`, with private `XDG_CONFIG_HOME/DATA_HOME/CACHE_HOME/STATE_HOME`, opens GTK windows on a private Wayland socket, sends virtual keyboard/pointer input, asserts geometry, then SIGTERMs the shell. It does not touch the live X11 shell, its dconf, or its extensions. Known side effect seen once: see "Known non-blocking" (DING). Lower-risk alternative if Sam prefers: run it on another machine/VM, or skip straight to step 5.
4. After 3 and/or 5 pass: drop the README WIP line, merge `tiling-columns` into `main`, push, confirm CI green, delete the branch.
5. **[Sam]** `./install.sh`, then restart GNOME Shell (X11: Alt+F2, `r`, Enter — windows stay open) and try: Super+Left on A, Super+Right on B, Super+Right on C → three columns. Check `gnome-extensions info tiling-columns@samuelfrench.github.io` shows `State: ACTIVE`. If anything misbehaves: `gnome-extensions disable tiling-columns@samuelfrench.github.io` restores stock behavior immediately (no restart needed); `./install.sh uninstall` removes it.
6. Update the shared memory note + global `~/TODO.md` entry with the result (both updated 2026-09-26 to describe this WIP).

## Findings (2026-09-26)

- Stock behavior with A|B tiled as halves: Super+Right or drag-to-right-edge on C tiles C to the right half and **covers B**. There is no "add a column" action.
- Stock hidden Ctrl-drag "adaptive tiling" can split a tile (drop on right quarter of B → 50/25/25) or insert at an edge (drop on B's right edge → 50/33/17). Not keyboard-accessible, not equal widths.
- `TilingWindowManager` is a class of static methods in an ES module; any extension that imports the same file URI gets the same class object, so wrapping `getTileFor`/`tile` changes both the drag preview (`moveHandler._edgeTilingPreview` → `getTileFor`) and keyboard tiling (`keybindingHandler` → `getTileFor` → `toggleTiling` → `tile`).
- Stock `tile()` calls `raise_and_make_recent`, and adaptive split tiling tiles the neighbors before the dragged window; the extension uses the same order so `_getWindowsForBuildingTileGroup` rebuilds one tile group.
- New extensions are only discovered at shell start (`extensionSystem.js` `_callExtensionEnable` returns if `lookup(uuid)` is null). X11 needs Alt+F2 `r`; Wayland needs re-login. GNOME enables system extensions (Tiling Assistant) before user ones.
- `org.gnome.Shell.Eval` needs `global.context.unsafe_mode = true`; Eval `await`s and runs in `shellDBus.js` scope (Main, Meta, GLib, Gio, Shell).

## Ideas (not doing now)

- Re-expand remaining columns when a column window closes or is untiled (stock leaves free space).
- Row insertion (top/bottom). Rejected for now: Super+Up/Down mean maximize/restore in stock; rows are rarely useful at 5120x1440.
- Run the integration test in CI (`ubuntu-24.04` runner + `apt install gnome-shell gnome-shell-extension-ubuntu-tiling-assistant`). Untested; large install.
- Upstream: propose "insert column at screen edge" to Leleat/Tiling-Assistant on GitHub once it has been used for a while (check for an existing issue first; needs Sam's go).

## Rejected

- Replace GNOME with i3/sway: would replace the DE.
- Fork the whole Tiling Assistant (6,668 lines) under a new UUID: not "simple", drifts from Ubuntu's package.
- Patch files under `/usr/share/gnome-shell/extensions/`: overwritten by apt, needs sudo.
- Favorite-layout mode (`adapt-edge-tiling-to-favorite-layout`): forces a fixed layout for ALL edge tiling, so the normal 2-pane halves stop working.
- Old approach (Python Tk zone editor + X11 ctypes snapper + Super+Alt+1..9): separate UI from the stock tiling, does not interact with Tiling Assistant tile groups.
- Restarting the live shell from an agent via `xdotool` Alt+F2 `r`: if the run dialog opens late, `r`+Enter lands in the focused terminal. `gnome-shell --replace` fights the systemd `org.gnome.Shell@x11` unit. Sam restarts the shell himself.

## Known non-blocking failures / gotchas — check here BEFORE diagnosing

- Headless test shell MUST run with `--mode=user` and `GNOME_SHELL_SESSION_MODE` unset (`run.py` does both). In `ubuntu` mode it loads DING, and DING's enable kills other `ding.js` processes, which relaunched the LIVE session's desktop-icons process during the first spike (2026-09-26 09:47:30, live gnome-shell PID 5068 logged "Launching DING process"; auto-recovered; ibus, portals, nautilus, evolution in the live session were NOT restarted — verified by process age).
- Headless shell spam: `fusermount3 ... /run/user/1000/gvfs: Permission denied`, xdg-desktop-portal "connection is closed" criticals on shutdown. Harmless; they come from the private D-Bus session.
- Push rejected with `push declined due to email privacy restrictions` if commits use `samfrench@gmail.com` (global git config). Repo-local config now sets `user.name samuelfrench` / `user.email 5598505+samuelfrench@users.noreply.github.com` (lost once when `.git` was replaced; re-set 2026-09-26).
- 2026-09-26: local `.git` had 9 zero-byte objects (`fatal: bad object HEAD`). Fixed by swapping in a fresh clone's `.git` (worktree was byte-identical to `origin/main` `a02fdcc`). Corrupt copy kept at session scratchpad `corrupt-dotgit-2026-09-26` (not durable).

## Next session FIRST

- Read this file top to bottom, then the spec. Ask Sam before step 3.
- `git fetch && git switch tiling-columns`. WIP commit `c54c5c0` (plus a TODO-only commit on top). `main` = `a02fdcc`.
- Repo: https://github.com/samuelfrench/ubuntu-tiling (branch `tiling-columns`)
- Exit state 2026-09-26: nothing running, no timers/crons, no background agents. Deploy: none (local desktop extension; install is step 5).
