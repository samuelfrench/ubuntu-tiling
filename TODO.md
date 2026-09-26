# ubuntu-tiling

Live source of truth. Update in the same beat as work changes.

## Current (2026-09-26) — `beba665` verified headless; `4b804d5` review fixes node-tested; awaiting headless re-run + Sam's live try

Sam, 2026-09-26: "essentially throw out what we have, and figure out how to simply extend the existing ubuntu tiling feature to support allowing more tiling (like I want to have a 2 pane view and add a third item to the right)". Later: "continue but try not to cause my computer to crash".

- Built: GNOME Shell extension `tiling-columns@samuelfrench.github.io` (`extension/`) that wraps stock Tiling Assistant's `TilingWindowManager.getTileFor` and `.tile`. With 2+ full-height tiled columns filling the screen, Super+Left/Right or drag-to-edge inserts a new column; existing columns shrink proportionally; min 400 px; everything else stock. Spec: `docs/superpowers/specs/2026-09-26-tiling-columns-design.md`.
- **Verified 2026-09-26 11:18 (headless, isolated):** `tests/integration/run.py` → `PASS` in ~25 s. Measured on a 2560x688 work area:
  - stock: A|B halves + C Super+Right → C covers B (`C x=1280 w=1280`, B unchanged).
  - columns: + C Super+Right → `854/853/853`; + D dragged to right edge → `641/639/640/640`; + E Super+Left → `512/513/511/512/512`; Tiling Popup not opened (no free space); after `disableExtension`, F Super+Right → stock right half `1280`.
- Unit: `node --test tests/*.test.mjs` → 52/52 (39 planner + 13 hooks with fake Tiling Assistant objects).
- **Review 2026-09-26 (Sam: "double check for bugs"), fixed in `4b804d5`, node-tested, NOT yet re-run headless:**
  1. `enable()` was async → a `disable()` before the dynamic imports settled (every screen lock disables/re-enables all extensions) left the wrappers installed with no restore; the next `enable()` captured our wrapper as "original" and double-wrapped. Fix: sync `enable()` (throws synchronously when TA is missing → state ERROR) + session token checked after the imports.
  2. `tile()` wrapper shrank the columns before TA's own early returns (`is_skip_taskbar`, `!allows_move || !allows_resize`), so a fixed-size window (calculator-style) or skip-taskbar window shrank the columns and stayed floating. Fix: mirror the checks (maximized/fullscreen windows pass, since TA unmaximizes before checking) and roll the columns back if TA still returns without tiling the window.
  3. Wrapper logic was untestable under node (GNOME imports). Fix: moved to `extension/hooks.js` (`installHooks(deps) → restore`), `extension.js` is glue only. `install.sh` now copies 4 files.
  - Verified against TA source while reviewing (no change needed): `Rect` 1-arg constructor accepts plain `{x,y,width,height}`; `Shortcuts.LEFT/RIGHT` = `tile-left-half`/`tile-right-half`; the drag path's `workArea` (`window.get_work_area_for_monitor(this._monitorNr)`) equals the one the tile wrapper derives from `params.monitorNr`; `toggleTiling` untiles when the rect equals `tiledRect` (so Super+Right on the rightmost column untiles it, stock behavior); no listener for TA's `window-tiled` signal in Ubuntu's TA; live TA settings are schema defaults (`disable-tile-groups false`, popup on, animations on, gaps 0, `dynamic-keybinding-behavior 0`).
- **Not yet verified:** (a) the headless integration test on `4b804d5` (last PASS was on `beba665`'s extension.js; needs Sam's go to start a test shell); (b) Sam's live X11 session (5120x1440, work area `5054x1408+66+32`, Ubuntu session mode with dock/DING). The headless test runs Wayland + `--mode=user`.
- Host: Ubuntu 24.04.4, GNOME Shell 46.0, X11 `DISPLAY=:1`, `GNOME_SHELL_SESSION_MODE=ubuntu`. Stock tiling `tiling-assistant@ubuntu.com` v46 (deb `46-1ubuntu1.1`), untouched.

## Repo + install state

- `main` code = `4b804d5` (review fixes; commits after it are TODO/docs only). Earlier `beba665` = the headless-verified code. CI `test` green on `4b804d5` (run 36261360395).
- Installed on this host 2026-09-26 via `./install.sh` (re-run after `4b804d5`): `~/.local/share/gnome-shell/extensions/tiling-columns@samuelfrench.github.io/` = repo `extension/` (4 files, `diff -r` clean), live `enabled-extensions` = `['tiling-columns@samuelfrench.github.io']` (was `@as []`; Ubuntu's own extensions come from the session mode, not this key). NOT loaded yet: the live shell (PID 5068) only discovers new extensions at startup.

## Next steps

0. Re-run `tests/integration/run.py` on `4b804d5` (≈25 s, isolated headless shell; ask Sam first per memory `ask-before-starting-gnome-shell`). Expect the same PASS as 11:18 (3/4/5 columns, no popup after drag, F at 1280 after disable). If it fails, `./install.sh` from `beba665`'s `extension/` is the known-good fallback (`git show beba665:extension/extension.js`).
1. **[Sam]** Restart GNOME Shell to load the extension (X11: Alt+F2, type `r`, Enter — windows stay open; or log out/in). Then: Super+Left on A, Super+Right on B, focus C, Super+Right → three columns. Also try dragging a 4th window to the right edge. Check `gnome-extensions info tiling-columns@samuelfrench.github.io` → `State: ACTIVE`.
   - Back out without restart: `gnome-extensions disable tiling-columns@samuelfrench.github.io` (restores the original Tiling Assistant methods immediately). Remove: `./install.sh uninstall`.
2. After Sam confirms on the live session: drop "Not yet tried on a live desktop session" from the README status line; record the live result here and in memory.
3. Write down anything that feels off on the ultrawide (e.g. min column width 400 px, proportional vs equal widths) as ideas below.

## Done (2026-09-26)

- Old Python zone app removed from repo and host (11 `<Super><Alt>` custom keybindings, `~/.local/bin/ubuntu-tiling`, desktop entry). Old config + old extension moved to `~/.local/share/ubuntu-tiling-zone-app-backup-2026-09-26/`.
- Planner reviewed against the spec (sort, 2 px tolerance, proportional edges, 400 px floor, fresh plain rects).
- `node --test tests/` fails on Node 24 (`Cannot find module '.../tests'`); all docs + CI use `node --test tests/*.test.mjs`.
- `install.sh` detects Tiling Assistant from disk (not via the running shell); install + uninstall tested in an isolated env (private XDG dirs + private bus): adds/removes only our uuid in `enabled-extensions`, keeps other entries.
- Integration harness isolation hardened (see "Test isolation" below); debug helper pattern: import `tests/integration/run.py` and use `prepare_root`, `env_for`, `bus_command`, `TestShell`.

## Test isolation (tests/integration/run.py) — why each piece exists

- `--mode=user`, `GNOME_SHELL_SESSION_MODE` unset: Ubuntu mode loads DING, whose enable kills other `ding.js` processes → relaunched the LIVE desktop icons once (09:47 spike).
- Private `XDG_RUNTIME_DIR`: the live `/run/user/1000` holds gnome-shell's crash marker `gnome-shell-disable-extensions` (created at shell start, deleted on clean shutdown or after 60 s; if the live shell crashes while it exists, the systemd unit disables its extensions). A test shell killed early leaves it behind (happened: see incidents).
- Private bus config (`bus.conf`, only dconf activatable): the default session config spawned xdg-desktop-portal-gnome, which segfaulted and left an apport report in `/var/crash`.
- `gvfs`/`doc` pre-created as regular files in the private runtime dir: blocks FUSE mounts inside the temp dir; `cleanup()` refuses to delete a root with a live mount.
- Lock screen + idle disabled in private dconf: locking is the only path where the test shell calls logind `SetLockedHint` on the login session it inherits (`loginManager.js` falls back to the user's `Display` session because `XDG_SESSION_ID` is unset in agent shells).
- `LIBGL_ALWAYS_SOFTWARE=1`, `nice -n 10`: no GPU use, low CPU priority.
- `ready()` waits for `Main.layoutManager._startingUp` to clear, extensions to settle, and `Main.actionMode === NORMAL`; before that the startup overview holds a modal grab and Super+Arrow never reaches Tiling Assistant (first run: 33 false failures).
- Stock run: after D covers the right half, Tiling Assistant opens its modal Tiling Popup (free left half); the harness records it and presses Escape (`dismissModal`). The columns run asserts no popup.
- Unavoidable: every GNOME Shell start calls GDM `RegisterSession` on the system bus (`main.js:361`, unconditional). No-op for an already-registered session; nothing in the journal.

## Incidents today (all resolved; kept so nobody repeats them)

- 09:47 spike (Ubuntu mode) relaunched the live DING process. Auto-recovered.
- 09:54: the run Sam interrupted HAD started. Its shell died without clean shutdown and left `/run/user/1000/gnome-shell-disable-extensions` until 11:10 (a later test shell's clean shutdown deleted it) plus socket `ut-wayland-2829688` (deleted 11:13). Its sandboxed portal segfault produced `/var/crash/_usr_libexec_xdg-desktop-portal-gnome.1000.crash` (Date 09:54:04; update-notifier fired 11:08); deleted 11:19. The live portal (PID 5622) never crashed. Whoopsie later left `/var/crash/_usr_libexec_xdg-desktop-portal-gnome.1000.uploaded` (5-byte marker, 11:25:24): it had uploaded that report; not a new crash. No test shell ran after 11:18.
- 11:15:22 the live screen locked. Evidence it was a manual lock, not the test: idle time == lock time (69 s at 11:16:31), idle-delay is 900 s, `gsd-media-keys` handled a key action at 11:15:22, and the test shells' virtual input devices are in-process in their own compositor (no uinput). While locked, all live extensions show INACTIVE and DING is stopped; they return on unlock. Not proven.
- Live session PIDs unchanged through all runs: Xorg 4816, gnome-shell 5068, ibus-daemon 5178, xdg-desktop-portal 5605/5622.

## Ideas (not doing now)

- Re-expand remaining columns when a column window closes or is untiled (stock leaves free space and offers the Tiling Popup on the next tile).
- Row insertion (top/bottom). Rejected for now: Super+Up/Down mean maximize/restore in stock; rows rarely useful at 5120x1440.
- Integration test in CI (`ubuntu-24.04` runner + `apt install gnome-shell gnome-shell-extension-ubuntu-tiling-assistant`). Untested; large install.
- Upstream: propose "insert column at screen edge" to Leleat/Tiling-Assistant on GitHub after Sam has used it for a while (check for an existing issue first; needs Sam's go).

## Rejected

- Replace GNOME with i3/sway: would replace the DE.
- Fork the whole Tiling Assistant (6,668 lines) under a new UUID: not "simple", drifts from Ubuntu's package.
- Patch files under `/usr/share/gnome-shell/extensions/`: overwritten by apt, needs sudo.
- Favorite-layout mode (`adapt-edge-tiling-to-favorite-layout`): forces a fixed layout for ALL edge tiling, so the normal 2-pane halves stop working.
- Old approach (Python Tk zone editor + X11 ctypes snapper + Super+Alt+1..9): separate UI, ignores Tiling Assistant tile groups.
- Restarting the live shell from an agent (`xdotool` Alt+F2 `r`: if the run dialog opens late, `r`+Enter lands in the focused terminal; `gnome-shell --replace` fights the systemd `org.gnome.Shell@x11` unit). Sam restarts the shell himself.
- Faking the system bus for the test shell to avoid GDM `RegisterSession`: riskier (logind/accountsservice lookups at startup) than the no-op call.

## Known non-blocking failures / gotchas — check here BEFORE diagnosing

- Drag path identity: `getTileFor` has no window argument, so the wrapper (like stock TA's own adaptive tiling) assumes the dragged window is `global.display.focus_window`. If it isn't (unfocused window Super-dragged), the preview slot and the drop plan can disagree and the window lands on the preview slot without the columns moving. Not observed; stock TA has the same assumption. Fix if it shows up: track the grab window via `global.display` `grab-op-begin` `(display, window, op)` (TA's `moveHandler.js:22` uses that signature).
- Test shell stderr noise: `Failed to set environment variable WAYLAND_DISPLAY for gnome-session`, `Error connecting to the screencast service`, `Error in size change accounting`. Harmless.
- Pushes: GitHub rejects commits authored with `samfrench@gmail.com` (`push declined due to email privacy restrictions`). Repo-local config sets `user.name samuelfrench` / `user.email 5598505+samuelfrench@users.noreply.github.com` (lost once when `.git` was replaced; re-set 2026-09-26).
- 2026-09-26: local `.git` had 9 zero-byte objects (`fatal: bad object HEAD`); fixed by swapping in a fresh clone's `.git`.

## Next session FIRST

- `git fetch && git status`. Read this file, then the spec.
- Ask Sam whether the live try (Next steps 1) worked before changing behavior. If he hasn't tried it yet, get his go for Next steps 0 (headless re-run of `4b804d5`).
- Ask Sam before starting any GNOME Shell (even the isolated test) — see memory `ask-before-starting-gnome-shell`.
- Repo: https://github.com/samuelfrench/ubuntu-tiling
