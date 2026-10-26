#!/usr/bin/python3
"""Headless GNOME Shell integration test for tiling-columns.

Runs an isolated GNOME Shell (private D-Bus session via dbus-run-session, private
XDG dirs so dconf and extensions never touch the live session) twice:

  stock    Tiling Assistant only: the third window covers the right half.
  columns  Tiling Assistant + tiling-columns: windows become columns.

Input is real: Super+Left/Right through a Clutter virtual keyboard and a
Super+drag through a virtual pointer. Exit status 0 means every check passed,
including no JS errors from tiling-columns in either shell.log.

Needs GNOME Shell 46 or 50, the Ubuntu Tiling Assistant package, and /usr/bin/python3
with python3-gi + GTK 3. Usage: tests/integration/run.py [--keep]
"""
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
UUID = "tiling-columns@samuelfrench.github.io"
TILING_ASSISTANT = "tiling-assistant@ubuntu.com"
DRIVER = "ut-test-driver@local"
WIDTH, HEIGHT = 2560, 720
ACTIVE = 1  # ExtensionState.ACTIVE in GNOME Shell 46 and 50
TOLERANCE = 2
# Windows opened with Wayland app id ut-term; the private desktop file below makes
# Shell.WindowTracker map them to ut-term.desktop, a TerminalEmulator.
TERMINALS = ["ut-T1", "ut-T2", "ut-T3"]
# Opened with Wayland app id ut-solo and no desktop file: group class:ut-solo.
SOLO = "ut-S1"
MAXIMIZED_BOTH = 3  # Meta.MaximizeFlags.BOTH
UT_TERM_DESKTOP = """[Desktop Entry]
Type=Application
Name=UT Term
Exec=/bin/true
Categories=System;TerminalEmulator;
StartupWMClass=ut-term
NoDisplay=true
"""


def prepare_root(mode: str) -> Path:
    """Private XDG dirs for one test shell, including its own XDG_RUNTIME_DIR.

    The live session's /run/user/<uid> holds its Wayland/pipewire/keyring sockets and
    gnome-shell's crash marker `gnome-shell-disable-extensions` (created at shell start,
    deleted after 60 s; if the live shell crashes while it exists, systemd disables its
    extensions). A private runtime dir keeps the test shell away from all of that.
    """
    root = Path(tempfile.mkdtemp(prefix=f"ut-{mode}-"))
    extensions = root / "data/gnome-shell/extensions"
    shutil.copytree(HERE / "driver", extensions / DRIVER)
    if mode == "columns":
        shutil.copytree(REPO / "extension", extensions / UUID)
        subprocess.run(["glib-compile-schemas", "--strict", str(extensions / UUID / "schemas")], check=True)
        # XDG_DATA_HOME/applications: read by Shell.AppSystem at shell start.
        (root / "data/applications").mkdir(parents=True)
        (root / "data/applications/ut-term.desktop").write_text(UT_TERM_DESKTOP)
    for sub in ("config", "cache", "state", "runtime"):
        (root / sub).mkdir()
    (root / "runtime").chmod(0o700)
    # Block FUSE mounts (gvfsd-fuse, xdg-document-portal) inside the temp dir: a regular
    # file where they expect a directory makes the mount fail.
    for blocker in ("gvfs", "doc"):
        (root / "runtime" / blocker).write_text("blocked by ubuntu-tiling test\n")
    # Private session bus that can auto-start only dconf. The standard session config would
    # also spawn portals, evolution, goa, gvfs... (a sandboxed portal segfaulted and left an
    # apport report in /var/crash on 2026-09-26).
    services = root / "dbus-services"
    services.mkdir()
    (services / "ca.desrt.dconf.service").write_text(
        "[D-BUS Service]\nName=ca.desrt.dconf\nExec=/usr/libexec/dconf-service\n")
    (root / "bus.conf").write_text(f"""<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <keep_umask/>
  <listen>unix:dir={root / "runtime"}</listen>
  <auth>EXTERNAL</auth>
  <servicedir>{services}</servicedir>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
""")
    return root


def bus_command(root: Path, *argv: str) -> list:
    return ["dbus-run-session", f"--config-file={root / 'bus.conf'}", "--", *argv]


def env_for(root: Path) -> dict:
    env = {k: v for k, v in os.environ.items()
           if k not in {"DISPLAY", "WAYLAND_DISPLAY", "GNOME_SHELL_SESSION_MODE",
                        "DBUS_SESSION_BUS_ADDRESS", "XAUTHORITY"}}
    env.update(XDG_CONFIG_HOME=str(root / "config"), XDG_DATA_HOME=str(root / "data"),
               XDG_CACHE_HOME=str(root / "cache"), XDG_STATE_HOME=str(root / "state"),
               XDG_RUNTIME_DIR=str(root / "runtime"),
               NO_AT_BRIDGE="1", GVFS_DISABLE_FUSE="1",
               # Software rendering: the test shell never touches the GPU the live session uses.
               LIBGL_ALWAYS_SOFTWARE="1")
    return env


def cleanup(root: Path) -> None:
    """Delete the temp root unless something is still mounted under it."""
    mounts = Path("/proc/self/mountinfo").read_text().split()
    if any(m.startswith(str(root)) for m in mounts):
        print(f"not deleting {root}: a filesystem is still mounted under it")
        return
    shutil.rmtree(root, ignore_errors=True)


def outer(keep: bool) -> int:
    runs = {}
    for mode in ("stock", "columns"):
        root = prepare_root(mode)
        proc = subprocess.run(
            bus_command(root, "/usr/bin/python3", __file__, "--inner", mode, str(root)),
            env=env_for(root), capture_output=True, text=True, timeout=480)
        result = next((json.loads(line[7:]) for line in proc.stdout.splitlines()
                       if line.startswith("RESULT ")), None)
        if result is None:
            print(f"[{mode}] no result (exit {proc.returncode}); shell log {root}/shell.log")
            print(proc.stdout[-3000:], proc.stderr[-3000:])
            return 1
        result["extension_log_errors"] = extension_log_errors(root / "shell.log")
        runs[mode] = result
        (root / "result.json").write_text(json.dumps(result, indent=1))
        if keep:
            print(f"[{mode}] kept {root}")
        else:
            cleanup(root)

    failures = check(runs)
    for line in warnings(runs):
        print("WARN", line)
    for line in failures:
        print("FAIL", line)
    print("PASS" if not failures else f"{len(failures)} check(s) failed")
    return 1 if failures else 0


class TestShell:
    """An isolated headless GNOME Shell. Construct inside dbus-run-session with env_for(root)."""

    def __init__(self, root: Path, enabled: list):
        import gi
        gi.require_version("Gio", "2.0")
        from gi.repository import Gio, GLib
        self._Gio, self._GLib = Gio, GLib

        subprocess.run(["gsettings", "set", "org.gnome.shell", "enabled-extensions", str(enabled)], check=True)
        # Private dconf only (XDG_CONFIG_HOME). Never lock or go idle: locking is the only path
        # where the test shell would call logind SetLockedHint on the login session it inherits.
        for schema, key, value in [
            ("org.gnome.shell", "welcome-dialog-last-shown-version", "'999'"),
            ("org.gnome.desktop.screensaver", "lock-enabled", "false"),
            ("org.gnome.desktop.lockdown", "disable-lock-screen", "true"),
            ("org.gnome.desktop.session", "idle-delay", "uint32 0"),
        ]:
            subprocess.run(["gsettings", "set", schema, key, value], check=True)

        self.display = f"ut-wayland-{os.getpid()}"
        self._log = open(root / "shell.log", "w")
        self._shell = subprocess.Popen(
            ["nice", "-n", "10", "gnome-shell", "--headless", "--wayland", "--no-x11", "--mode=user",
             "--virtual-monitor", f"{WIDTH}x{HEIGHT}", "--wayland-display", self.display],
            stdout=self._log, stderr=subprocess.STDOUT)
        self._clients = []
        self._bus = Gio.bus_get_sync(Gio.BusType.SESSION)
        self._scenario = (HERE / "scenario.js").as_uri()
        for _ in range(120):
            try:
                if self.ev("1+1") == 2:
                    return
            except Exception:
                pass
            time.sleep(0.25)
        self.stop()
        raise RuntimeError("shell never answered Eval")

    def ev(self, code: str):
        Gio, GLib = self._Gio, self._GLib
        reply = self._bus.call_sync("org.gnome.Shell", "/org/gnome/Shell", "org.gnome.Shell", "Eval",
                                    GLib.Variant("(s)", (code,)), GLib.VariantType("(bs)"),
                                    Gio.DBusCallFlags.NONE, 60000, None)
        ok, out = reply.unpack()
        if not ok:
            raise RuntimeError(f"Eval failed: {out!r} for {code[:120]}")
        return json.loads(out) if out else None

    def call(self, fn: str, *args):
        return self.ev(f"import('{self._scenario}').then(m => m.{fn}(...{json.dumps(list(args))}))")

    def open_window(self, title: str, app_id: str = None):
        self._clients.append(subprocess.Popen(
            ["/usr/bin/python3", str(HERE / "client.py"), title, *([app_id] if app_id else [])],
            env={**os.environ, "WAYLAND_DISPLAY": self.display, "GDK_BACKEND": "wayland"},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        if not self.call("waitForWindow", title):
            raise RuntimeError(f"window {title} never appeared")
        focused = self.call("focus", title)
        if focused != title:
            raise RuntimeError(f"focus went to {focused!r}, wanted {title}")

    def stop(self):
        for client in self._clients:
            client.terminate()
        self._shell.send_signal(signal.SIGTERM)
        try:
            self._shell.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self._shell.kill()


def inner(mode: str, root: Path) -> None:
    enabled = [TILING_ASSISTANT, DRIVER] + ([UUID] if mode == "columns" else [])
    shell = None
    result = {"mode": mode}
    try:
        shell = TestShell(root, enabled)
        ev, call, open_window = shell.ev, shell.call, shell.open_window
        result["ready"] = info = call("ready")
        wa = info["workArea"]

        open_window("ut-A")
        call("superArrow", "left")
        open_window("ut-B")
        call("superArrow", "right")
        open_window("ut-C")
        call("superArrow", "right")
        result["after_C_super_right"] = call("state")

        open_window("ut-D")
        result["drag"] = call("superDrag", "ut-D", wa["x"] + wa["width"] - 1, wa["y"] + wa["height"] // 2)
        result["after_D_drag_right"] = call("state")
        # Stock tiling leaves free space here and opens its modal Tiling Popup; close it.
        result["popup_after_drag"] = call("dismissModal")

        open_window("ut-E")
        call("superArrow", "left")
        result["after_E_super_left"] = call("state")

        if mode == "columns":
            # Actual grid shortcuts, including maximized/fullscreen restoration.
            open_window("ut-F")
            result["before_F_maximize"] = call("state")
            call("windowAction", "ut-F", "maximize")
            result["before_six"] = call("state")
            result["six_status"] = call("gridKey", "6")
            result["after_six"] = call("state")
            call("gridKey", "z")
            result["after_six_undo"] = call("state")
            result["after_F_unmaximize"] = call("windowAction", "ut-F", "unmaximize")

            open_window("ut-G")
            open_window("ut-H")
            result["before_H_fullscreen"] = call("state")
            call("windowAction", "ut-H", "fullscreen")
            result["before_eight_fullscreen"] = call("state")
            call("gridKey", "8")
            result["after_eight_fullscreen"] = call("state")
            call("gridKey", "z")
            result["after_fullscreen_undo"] = call("state")
            result["after_H_unfullscreen"] = call("windowAction", "ut-H", "unfullscreen")
            call("gridKey", "8")
            result["after_eight"] = call("state")

            open_window("ut-I")
            call("windowAction", "ut-I", "minimize")
            open_window("ut-J")
            call("windowAction", "ut-J", "other-workspace")
            call("focus", "ut-H")
            result["before_exclusions"] = call("state")
            call("gridKey", "8")
            result["after_exclusions"] = call("state")
            result["picker_eight"] = call("gridKey", "Space")
            result["screenshot_eight"] = call("pickerScreenshot", str(root / "picker-eight.png"))
            result["picker_six"] = call("pickerLayout", 6)
            result["screenshot_six"] = call("pickerScreenshot", str(root / "picker-six.png"))
            call("gridKey", "Escape", False)
            result["after_cancel"] = call("state")
            call("gridKey", "Space")
            call("gridKey", "3", False)
            result["after_place"] = call("state")
            result["after_place_status"] = call("gridStatus")
            call("gridKey", "z")
            result["after_place_undo"] = call("state")

            # Disable while the modal is open: it must release input immediately.
            call("gridKey", "Space")
            ev(f"Main.extensionManager.disableExtension('{UUID}')")
            time.sleep(0.5)
            result["columns_after_disable"] = ev(f"Main.extensionManager.lookup('{UUID}').state")
            result["after_disable_status"] = call("gridStatus")
            open_window("ut-K")
            call("superArrow", "right")
            result["after_disable_K_super_right"] = call("state")
            # Stock TA can open its own popup for free space after K is tiled.
            call("dismissModal")
            call("gridKey", "6")
            result["after_disabled_shortcut"] = call("state")
            ev(f"Main.extensionManager.enableExtension('{UUID}')")
            time.sleep(0.5)
            result["reenabled_picker"] = call("panelClick")
            call("gridKey", "Escape", False)
            result["after_reenable_cancel"] = call("gridStatus")

            call("cornerSetup")
            for title in ["ut-L", "ut-M", "ut-N", "ut-O"]:
                open_window(title)
            call("focus", "ut-A")
            call("focus", "ut-B")
            result["before_overflow"] = call("state")
            call("gridKey", "6")
            result["after_overflow"] = call("state")
            result["overflow_groups"] = call("tileGroups", ["ut-A", "ut-B", "ut-C", "ut-D", "ut-L", "ut-M", "ut-N", "ut-O"])
            call("gridKey", "z")
            result["after_overflow_undo"] = call("state")

            result["before_tiled_native_max"] = call("state")
            call("windowAction", "ut-B", "maximize")
            call("gridKey", "6")
            call("gridKey", "z")
            result["after_tiled_native_max_restore"] = call("windowAction", "ut-B", "unmaximize")
            call("windowAction", "ut-B", "fullscreen")
            call("gridKey", "6")
            call("gridKey", "z")
            result["after_tiled_native_full_restore"] = call("windowAction", "ut-B", "unfullscreen")

            result["before_gapped_max"] = call("gappedMaximize", "ut-B")
            call("gridKey", "6")
            call("gridKey", "z")
            result["after_gapped_max_undo"] = call("state")
            result["gapped_max_signals"] = call("tilingSignalState", "ut-B")
            result["gapped_max_workspace_change"] = call("windowAction", "ut-B", "other-workspace")
            call("gapReset")
            call("windowAction", "ut-A", "maximize")
            result["cancel_during_native_preparation"] = call("cancelDuringNativePreparation", "ut-A")

            # Program-type filter and the 4-16 window layouts. The step above leaves
            # tiling-columns disabled and ut-A possibly maximized: re-enable, restore,
            # close any modal, then add three windows that map to ut-term.desktop.
            result["filter_reenabled"] = call("enableColumns")
            call("windowAction", "ut-A", "unmaximize")
            call("dismissModal")
            call("focus", "ut-C")
            result["filter_initial"] = call("windowFilter")
            for title in TERMINALS:
                open_window(title, "ut-term")
            result["terminal_identity"] = [call("appIdentity", title) for title in TERMINALS]

            # Picker: Terminals chip + All, then Arrange (the only place the filter is saved).
            call("focus", "ut-T1")
            result["before_terminals_picker"] = call("state")
            result["terminals_picker_open"] = call("gridKey", "Space")
            result["terminals_chip"] = call("pickerChip", "terminals")
            result["terminals_all_layout"] = call("pickerLayout", "all", True)
            result["screenshot_all_terminals"] = call("pickerScreenshot", str(root / "picker-all-terminals.png"))
            result["terminals_arrange"] = call("pickerButton", "Arrange windows")
            result["modal_after_terminals_arrange"] = call("dismissModal")
            result["after_terminals_picker"] = call("state")
            result["filter_after_terminals_picker"] = call("windowFilter")
            call("gridKey", "z")
            call("waitIdle")
            result["after_terminals_picker_undo"] = call("state")

            # Super+Alt+A applies the saved ['terminals'] filter.
            result["before_all_shortcut"] = call("state")
            call("gridKey", "a")
            result["all_shortcut_status"] = call("waitIdle")
            result["after_all_shortcut"] = call("state")
            call("gridKey", "z")
            call("waitIdle")
            result["after_all_shortcut_undo"] = call("state")

            # Picker: All windows chip + 12, then the Cancel button: the saved filter stays.
            result["twelve_picker_open"] = call("gridKey", "Space")
            result["twelve_all_windows_chip"] = call("pickerChip", "All windows")
            result["twelve_layout"] = call("pickerLayout", 12, True)
            result["screenshot_twelve"] = call("pickerScreenshot", str(root / "picker-twelve.png"))
            result["twelve_cancel_status"] = call("pickerButton", "Cancel")
            result["after_twelve_cancel"] = call("state")
            result["filter_after_twelve_cancel"] = call("windowFilter")

            # Clear the filter through GSettings rather than the picker, so no extra
            # layout or Undo entry; then Super+Alt+Shift+2/6 on every eligible window.
            result["filter_after_reset"] = call("setWindowFilter", [])
            result["active_workspace"] = ev("global.workspace_manager.get_active_workspace_index()")
            result["before_twelve"] = call("state")
            call("gridKey", "2", True, True)
            result["twelve_status"] = call("waitIdle")
            result["after_twelve"] = call("state")
            call("gridKey", "z")
            call("waitIdle")
            result["after_twelve_undo"] = call("state")
            result["before_sixteen"] = call("state")
            call("gridKey", "6", True, True)
            result["sixteen_status"] = call("waitIdle")
            result["after_sixteen"] = call("state")
            call("gridKey", "z")
            call("waitIdle")
            result["after_sixteen_undo"] = call("state")

            # All with one matching window: the single cell is the work area, which
            # Tiling Assistant maximizes instead of tiling (gaps are off here).
            open_window(SOLO, "ut-solo")
            result["solo_identity"] = call("appIdentity", SOLO)
            result["filter_solo"] = call("setWindowFilter", ["class:ut-solo"])
            result["before_solo"] = call("state")
            call("gridKey", "a")
            result["solo_status"] = call("waitIdle")
            result["after_solo"] = call("state")
            call("gridKey", "z")
            result["solo_undo_status"] = call("waitIdle")
            result["after_solo_undo"] = call("state")

            # Focus outside the filter: ut-A is focused but not a terminal, so it must
            # not be raised back over the terminal grid; Undo refocuses it.
            result["filter_focus_outside"] = call("setWindowFilter", ["terminals"])
            result["focus_outside_focused"] = call("focus", "ut-A")
            result["before_focus_outside"] = call("state")
            call("gridKey", "a")
            result["focus_outside_status"] = call("waitIdle")
            result["after_focus_outside"] = call("state")
            result["focus_outside_stacking"] = call("stacking")
            call("gridKey", "z")
            call("waitIdle")
            result["after_focus_outside_undo"] = call("state")
            result["focus_outside_undo_focus"] = call("stacking")["focus"]
            result["filter_final"] = call("setWindowFilter", [])
    except Exception as exc:  # reported, then the outer run fails
        result["error"] = repr(exc)
    finally:
        print("RESULT " + json.dumps(result), flush=True)
        if shell:
            shell.stop()


def frames(snapshot, *titles):
    by_title = {w["title"]: w["frame"] for w in snapshot}
    return [by_title.get(t) for t in titles]


def near(a: int, b: float) -> bool:
    return abs(a - b) <= TOLERANCE


def columns_problems(wa, rects, label):
    """rects must be left-to-right, full-height, contiguous, equal-width columns."""
    problems = []
    if any(r is None for r in rects):
        return [f"{label}: missing window"]
    width = wa["width"] / len(rects)
    edge = wa["x"]
    for i, r in enumerate(rects):
        if not near(r["x"], edge) or not near(r["width"], width):
            problems.append(f"{label}: column {i} is {r}, want x~{edge} width~{width:.0f}")
        if not near(r["y"], wa["y"]) or not near(r["height"], wa["height"]):
            problems.append(f"{label}: column {i} is not full height: {r}")
        edge = r["x"] + r["width"]
    if not near(edge, wa["x"] + wa["width"]):
        problems.append(f"{label}: columns end at {edge}, work area ends at {wa['x'] + wa['width']}")
    return problems


def grid_cells(wa, shape):
    """Row-major cells with shape[r] columns in row r, on shared integer edges:
    row r spans floor(r*H/rows)..floor((r+1)*H/rows), column c of n spans floor(c*W/n)..floor((c+1)*W/n)."""
    rows = len(shape)
    cells = []
    for row, columns in enumerate(shape):
        y = wa["y"] + row * wa["height"] // rows
        height = wa["y"] + (row + 1) * wa["height"] // rows - y
        for col in range(columns):
            x = wa["x"] + col * wa["width"] // columns
            cells.append(dict(x=x, y=y, width=wa["x"] + (col + 1) * wa["width"] // columns - x, height=height))
    return cells


def overlaps(a, b, inset=TOLERANCE + 1):
    """Whether frame `a` covers part of rect `b` shrunk by `inset` on every side,
    so frames that meet `b` within TOLERANCE at a shared edge do not count."""
    left, top = b["x"] + inset, b["y"] + inset
    right, bottom = b["x"] + b["width"] - inset, b["y"] + b["height"] - inset
    return a["x"] < right and a["x"] + a["width"] > left and a["y"] < bottom and a["y"] + a["height"] > top


def grid_problems(wa, snapshot, count, label):
    """Every selected real frame occupies a unique grid cell within two pixels."""
    rects = frames(snapshot, *(f"ut-{chr(65 + i)}" for i in range(count)))
    if any(rect is None for rect in rects):
        return [f"{label}: missing grid window"]
    remaining = grid_cells(wa, [count // 2] * 2)
    for rect in rects:
        match = next((cell for cell in remaining if all(near(rect[k], cell[k]) for k in rect)), None)
        if match is None:
            return [f"{label}: frame {rect} does not occupy an unused grid cell; remaining={remaining}"]
        remaining.remove(match)
    return []


def layout_problems(wa, before, after, candidates, shape, label):
    """The first min(cells, candidates) cells of `shape` (columns per row) each hold one
    candidate's frame within TOLERANCE. A candidate left out, and every other ut- window,
    keeps its exact state from `before`."""
    old = {w["title"]: w for w in before}
    new = {w["title"]: w for w in after}
    if set(old) != set(new):
        return [f"{label}: window set changed from {sorted(old)} to {sorted(new)}"]
    missing = [title for title in candidates if title not in new]
    if missing:
        return [f"{label}: missing windows {missing}"]
    cells = grid_cells(wa, shape)
    want = min(len(cells), len(candidates))
    remaining = cells[:want]
    problems = []
    for title in candidates:
        frame = new[title]["frame"]
        match = next((cell for cell in remaining if all(near(frame[k], cell[k]) for k in cell)), None)
        if match is not None:
            remaining.remove(match)
        elif new[title] != old[title]:
            problems.append(f"{label}: {title} moved to {frame}, not one of the first {want} free cells of shape {shape}")
    if remaining:
        problems.append(f"{label}: cells {remaining} are empty; want the first {want} of {len(cells)} cells "
                        f"of shape {shape} filled by {candidates}")
    for title in sorted(set(old) - set(candidates)):
        if new[title] != old[title]:
            problems.append(f"{label}: {title} is not a candidate but changed: {old[title]} -> {new[title]}")
    return problems


LOG_ERROR = re.compile(r"JS ERROR|Unhandled promise rejection|-CRITICAL \*\*")
STACK_LINE = re.compile(r"^\s*(\S*@\S+:\d+(:\d+)?|== Stack trace for context .*|#\d+\s.*)$")


def extension_log_errors(log: Path) -> list:
    """shell.log error entries (the error line plus the stack lines after it) that mention tiling-columns:
    JS ERROR, unhandled rejections, and CRITICAL logs such as console.error or disposed-object access."""
    try:
        lines = log.read_text(errors="replace").splitlines()
    except OSError as error:
        return [f"could not read {log}: {error}"]
    found = []
    for i, line in enumerate(lines):
        if not LOG_ERROR.search(line):
            continue
        entry = [line]
        for following in lines[i + 1:]:
            if LOG_ERROR.search(following) or not STACK_LINE.match(following):
                break
            entry.append(following)
        if any(UUID in part for part in entry):
            found.append("\n".join(entry[:12]))
    return found


def warnings(runs):
    """Picker clicks that fell back to emitting `clicked` because the pointer could not reach the actor."""
    return [f"[{mode}] {key}: {value['click']['what']} was not under the pointer; emitted clicked instead: {value['click']}"
            for mode, run in runs.items() for key, value in run.items()
            if isinstance(value, dict) and isinstance(value.get("click"), dict) and value["click"].get("method") == "emit"]


def log_problems(runs):
    problems = []
    for mode, run in runs.items():
        errors = run.get("extension_log_errors", [])
        if errors:
            problems.append(f"[{mode}] shell.log has {len(errors)} error(s) from {UUID}; first: " +
                            " || ".join(error.replace("\n", " | ") for error in errors[:3]))
    return problems


def check(runs):
    failures = []
    for mode, run in runs.items():
        if "error" in run:
            failures.append(f"[{mode}] {run['error']}")
        elif run["ready"]["startingUp"] or run["ready"]["actionMode"] != 1:  # Shell.ActionMode.NORMAL
            failures.append(f"[{mode}] shell not ready for keybindings: {run['ready']}")
    if failures:
        return failures + log_problems(runs)

    stock, cols = runs["stock"], runs["columns"]
    wa = stock["ready"]["workArea"]
    half = wa["width"] / 2
    left_half = {"x": wa["x"], "y": wa["y"], "width": half, "height": wa["height"]}
    right_half = {"x": wa["x"] + half, "y": wa["y"], "width": half, "height": wa["height"]}

    def same(r, want):
        return r is not None and all(near(r[k], want[k]) for k in ("x", "y", "width", "height"))

    if stock["ready"]["tilingAssistant"] != ACTIVE or stock["ready"]["columns"] is not None:
        failures.append(f"[stock] extension states {stock['ready']}")
    if cols["ready"]["tilingAssistant"] != ACTIVE or cols["ready"]["columns"] != ACTIVE:
        failures.append(f"[columns] extension states {cols['ready']}")
    if cols["ready"]["workArea"] != wa:
        failures.append(f"work areas differ: {wa} vs {cols['ready']['workArea']}")

    # Stock Tiling Assistant: C covers B, D covers C, E covers A.
    a, b, c = frames(stock["after_C_super_right"], "ut-A", "ut-B", "ut-C")
    if not (same(a, left_half) and same(b, right_half) and same(c, right_half)):
        failures.append(f"[stock] after C Super+Right want A left half, B and C right half; got {a} {b} {c}")
    (d,) = frames(stock["after_D_drag_right"], "ut-D")
    if not stock["drag"]["grabbed"] or not same(d, right_half):
        failures.append(f"[stock] D drag: grabbed={stock['drag']['grabbed']} want right half, got {d}")
    (e,) = frames(stock["after_E_super_left"], "ut-E")
    if not same(e, left_half):
        failures.append(f"[stock] E Super+Left want left half, got {e}")

    # With tiling-columns: every step adds a column.
    failures += columns_problems(wa, frames(cols["after_C_super_right"], "ut-A", "ut-B", "ut-C"),
                                 "[columns] A|B + C Super+Right")
    if not cols["drag"]["grabbed"]:
        failures.append("[columns] D drag never started a grab")
    if cols["popup_after_drag"]:
        failures.append("[columns] a modal (Tiling Popup) opened after inserting D; columns should leave no free space")
    failures += columns_problems(wa, frames(cols["after_D_drag_right"], "ut-A", "ut-B", "ut-C", "ut-D"),
                                 "[columns] + D dragged to right edge")
    failures += columns_problems(wa, frames(cols["after_E_super_left"], "ut-E", "ut-A", "ut-B", "ut-C", "ut-D"),
                                 "[columns] + E Super+Left")

    # Disabling restores stock behavior.
    if cols["columns_after_disable"] == ACTIVE:
        failures.append("[columns] extension still ACTIVE after disableExtension")
    (f,) = frames(cols["after_disable_K_super_right"], "ut-K")
    if not same(f, right_half):
        failures.append(f"[columns] after disable, K Super+Right want right half, got {f}")

    failures += grid_problems(wa, cols["after_six"], 6, "six-window shortcut")
    failures += grid_problems(wa, cols["after_eight_fullscreen"], 8, "eight-window shortcut from fullscreen")
    failures += grid_problems(wa, cols["after_eight"], 8, "eight-window shortcut")
    failures += grid_problems(wa, cols["after_exclusions"], 8, "minimized and other-workspace exclusions")
    for before, after, label in [
        ("before_six", "after_six_undo", "six-window undo"),
        ("before_F_maximize", "after_F_unmaximize", "native unmaximize after undo"),
        ("before_eight_fullscreen", "after_fullscreen_undo", "fullscreen undo"),
        ("before_H_fullscreen", "after_H_unfullscreen", "native leave fullscreen after undo"),
        ("after_exclusions", "after_cancel", "picker cancel"),
        ("after_exclusions", "after_place_undo", "single placement undo"),
        ("after_disable_K_super_right", "after_disabled_shortcut", "removed shortcut"),
        ("before_overflow", "after_overflow_undo", "overflow arrangement undo"),
        ("before_tiled_native_max", "after_tiled_native_max_restore", "tiled native maximize restore"),
        ("before_tiled_native_max", "after_tiled_native_full_restore", "tiled native fullscreen restore"),
        ("before_gapped_max", "after_gapped_max_undo", "maximized-with-gaps undo"),
    ]:
        if cols[before] != cols[after]:
            failures.append(f"{label}: state was not restored: before={cols[before]} after={cols[after]}")
    for title in ["ut-I", "ut-J"]:
        before = next(w for w in cols["before_exclusions"] if w["title"] == title)
        after = next(w for w in cols["after_exclusions"] if w["title"] == title)
        if before != after:
            failures.append(f"excluded window {title} changed: {before} -> {after}")
    for key, count in [("picker_eight", 8), ("picker_six", 6)]:
        status = cols[key]
        dialog = status["dialog"]
        if not (status["panel"] and status["modalCount"] == 1 and dialog and
                dialog["count"] == count and dialog["cells"] == [str(i + 1) for i in range(count)] and dialog["title"] == "ut-H"):
            failures.append(f"{key}: incorrect visible picker state {status}")
    h = next(w for w in cols["after_place"] if w["title"] == "ut-H")
    target = dict(x=wa["x"] + 2 * wa["width"] // 3, y=wa["y"],
                  width=wa["width"] - 2 * wa["width"] // 3, height=wa["height"] // 2)
    if not same(h["frame"], target) or cols["after_place_status"]["modalCount"]:
        failures.append(f"number-key placement failed: {h}; status={cols['after_place_status']}")
    status = cols["after_disable_status"]
    if status["controls"] or status["panel"] or status["modalCount"]:
        failures.append(f"disable left controls or an input grab: {status}")
    if not cols["reenabled_picker"]["dialog"] or cols["after_reenable_cancel"]["modalCount"]:
        failures.append("re-enable did not restore a working, dismissible picker")
    selected = ["ut-A", "ut-B", "ut-L", "ut-M", "ut-N", "ut-O"]
    for title in selected:
        if cols["overflow_groups"][title] != selected:
            failures.append(f"overflow group {title}: {cols['overflow_groups'][title]}, want {selected}")
    for title in ["ut-C", "ut-D"]:
        if set(cols["overflow_groups"][title]) & set(selected):
            failures.append(f"overflow retained stale group reference: {title} -> {cols['overflow_groups'][title]}")
        before = next(w for w in cols["before_overflow"] if w["title"] == title)
        after = next(w for w in cols["after_overflow"] if w["title"] == title)
        if before != after:
            failures.append(f"overflow changed excluded window {title}")
    b = next(w for w in cols["gapped_max_workspace_change"] if w["title"] == "ut-B")
    if b["tiled"] != wa or b["workspace"] != 1:
        failures.append(f"gapped-max did not retain its workarea on workspace change: {b}")
    if cols["gapped_max_signals"] != {"WS_CHANGED": True, "UNMANAGING": True}:
        failures.append(f"gapped-max hooks were not restored: {cols['gapped_max_signals']}")
    cancel = cols["cancel_during_native_preparation"]
    if cancel["result"].get("reason") != "disabled" or cancel["waiters"] or cancel["before"] != cancel["after"] or cancel["status"]["modalCount"] or cancel["status"]["panel"]:
        failures.append(f"disable during native preparation leaked work: {cancel}")

    # Program-type filter (Terminals) and the 12/16 layouts.
    reenabled = cols["filter_reenabled"]
    if reenabled["state"] != ACTIVE or not reenabled["controls"]:
        failures.append(f"re-enabling tiling-columns for the filter steps failed: {reenabled}")
    for identity in cols["terminal_identity"]:
        if identity.get("wmClass") != "ut-term" or identity.get("appId") != "ut-term.desktop" or \
                "TerminalEmulator" not in (identity.get("categories") or "").split(";"):
            failures.append(f"{identity['title']}: want WM class ut-term mapped to ut-term.desktop with category "
                            f"TerminalEmulator, got {identity}")
    if cols["filter_initial"] != []:
        failures.append(f"window-filter was {cols['filter_initial']} before the picker steps; want [] "
                        "(clicking Terminals would otherwise deselect it)")
    # The chip and Arrange clicks must be real pointer clicks: an `emit` fallback means the
    # pointer could not reach them, which a user could not do either.
    clicks = [("terminals_chip", "Terminals chip", True), ("terminals_all_layout", "All layout", False),
              ("terminals_arrange", "Arrange windows", True), ("twelve_all_windows_chip", "All windows chip", True),
              ("twelve_layout", "12 layout", False), ("twelve_cancel_status", "Cancel", False)]
    for key, what, pointer_only in clicks:
        click = cols[key]["click"]
        if click["method"] not in (("pointer",) if pointer_only else ("pointer", "emit")):
            failures.append(f"picker {what} was not clicked with the pointer: {click}" if click["method"] == "emit"
                            else f"picker {what} was not clicked: {click}")
    dialog = cols["terminals_all_layout"]["dialog"] or {}
    if not (dialog.get("selected") == ["terminals"] and dialog.get("count") == "all" and
            dialog.get("rows") == [3] and dialog.get("title") == "ut-T1" and dialog.get("arrangeReactive")):
        failures.append(f"picker Terminals + All: want Terminals selected, All layout, one preview row of 3, "
                        f"ut-T1 selected and Arrange sensitive; got {dialog}")
    chips = dialog.get("chips") or []
    terminals = next((chip for chip in chips if chip["id"] == "terminals"), None)
    if not (terminals and terminals["count"] == 3 and terminals["checked"]):
        failures.append(f"picker Terminals + All: want a checked Terminals chip counting 3 windows; chips {chips}")
    if dialog.get("fit") != "All \u00b7 3":
        failures.append(f"picker Terminals + All: All selector reads {dialog.get('fit')!r}, want 'All \u00b7 3'")
    if "Arrange 3 windows (Terminals)" not in (dialog.get("summary") or ""):
        failures.append(f"picker Terminals + All: summary {dialog.get('summary')!r} lacks 'Arrange 3 windows (Terminals)'")
    dialog = cols["twelve_layout"]["dialog"] or {}
    if not (dialog.get("selected") == [] and dialog.get("count") == 12 and dialog.get("rows") == [6, 6] and
            dialog.get("cells") == [str(i + 1) for i in range(12)]):
        failures.append(f"picker All windows + 12: want no filter and a 6×2 preview numbered 1-12; got {dialog}")
    chips = dialog.get("chips") or []
    if not any(chip["id"] is None and chip["label"] == "All windows" and chip["checked"] for chip in chips):
        failures.append(f"picker All windows + 12: want the All windows chip checked; chips {chips}")
    for key in ["screenshot_all_terminals", "screenshot_twelve"]:
        shot = cols[key]
        bounds = {k: shot[k] for k in ("x", "y", "width", "height")}
        if shot["actor"] == "dialogLayout":
            failures.append(f"{key}: measured ModalDialog.dialogLayout, which fills the monitor; the visible "
                            f"Dialog._dialog box was not found: {shot}")
        elif not shot["settled"]:
            failures.append(f"{key}: picker box bounds were still changing after {shot['frames']} frames: {shot}")
        elif shot["width"] >= WIDTH or shot["height"] >= HEIGHT:
            failures.append(f"{key}: measured picker box {bounds} is as large as the {WIDTH}×{HEIGHT} monitor, "
                            "so the harness read a container, not the visible dialog")
        elif shot["clipped"]:
            failures.append(f"{key}: picker dialog {bounds} does not fit inside the {WIDTH}×{HEIGHT} monitor; "
                            "part of it is off screen")
    if cols["modal_after_terminals_arrange"]:
        failures.append("picker was still open after clicking Arrange windows")
    failures += layout_problems(wa, cols["before_terminals_picker"], cols["after_terminals_picker"], TERMINALS, [3],
                                "picker Terminals + All")
    if cols["filter_after_terminals_picker"] != ["terminals"]:
        failures.append(f"picker Arrange saved window-filter {cols['filter_after_terminals_picker']}, want ['terminals']")
    failures += layout_problems(wa, cols["before_all_shortcut"], cols["after_all_shortcut"], TERMINALS, [3],
                                "Super+Alt+A with the saved Terminals filter")
    status = cols["twelve_cancel_status"]
    if status["modalCount"] or status["dialog"]:
        failures.append(f"the Cancel button did not close the picker: {status}")
    if cols["filter_after_twelve_cancel"] != ["terminals"]:
        failures.append(f"picker Cancel changed window-filter to {cols['filter_after_twelve_cancel']}; Cancel must never write it")
    if cols["filter_after_reset"] != []:
        failures.append(f"window-filter reset left {cols['filter_after_reset']}")
    for before, after, shape, label in [("before_twelve", "after_twelve", [6, 6], "Super+Alt+Shift+2 (12, 6×2)"),
                                        ("before_sixteen", "after_sixteen", [8, 8], "Super+Alt+Shift+6 (16, 8×2)")]:
        eligible = [w["title"] for w in cols[before]
                    if not w["minimized"] and w["workspace"] == cols["active_workspace"]]
        if len(eligible) <= shape[0]:
            failures.append(f"{label}: only {len(eligible)} eligible windows {eligible}; the check needs more "
                            f"than {shape[0]} to reach the second row")
        failures += layout_problems(wa, cols[before], cols[after], eligible, shape, label)
    for before, after, label in [
        ("before_terminals_picker", "after_terminals_picker_undo", "picker Terminals + All undo"),
        ("before_all_shortcut", "after_all_shortcut_undo", "Super+Alt+A undo"),
        ("after_all_shortcut_undo", "after_twelve_cancel", "picker All windows + 12 cancel"),
        ("before_twelve", "after_twelve_undo", "Super+Alt+Shift+2 undo"),
        ("before_sixteen", "after_sixteen_undo", "Super+Alt+Shift+6 undo"),
    ]:
        if cols[before] != cols[after]:
            failures.append(f"{label}: state was not restored: before={cols[before]} after={cols[after]}")

    # All with one matching window: maximized (natively, or to the work area with gaps).
    identity = cols["solo_identity"]
    if identity.get("wmClass") != "ut-solo" or identity.get("hasAppInfo"):
        failures.append(f"{SOLO}: want WM class ut-solo and no desktop file (group class:ut-solo), got {identity}")
    if cols["filter_solo"] != ["class:ut-solo"]:
        failures.append(f"window-filter for All·1 is {cols['filter_solo']}, want ['class:ut-solo']")
    old = {w["title"]: w for w in cols["before_solo"]}
    new = {w["title"]: w for w in cols["after_solo"]}
    undone = {w["title"]: w for w in cols["after_solo_undo"]}
    solo, solo_before, solo_undone = new.get(SOLO), old.get(SOLO), undone.get(SOLO)
    if solo is None or solo_before is None or solo_undone is None:
        failures.append(f"All·1: {SOLO} missing before={solo_before} after={solo} after undo={solo_undone}")
    else:
        native = solo["maximized"] == MAXIMIZED_BOTH and same(solo["frame"], wa)
        frame = solo["frame"]
        gapped = solo["tiled"] == wa and frame["x"] >= wa["x"] and frame["y"] >= wa["y"] and \
            frame["x"] + frame["width"] <= wa["x"] + wa["width"] and frame["y"] + frame["height"] <= wa["y"] + wa["height"]
        if not (native or gapped):
            failures.append(f"Super+Alt+A with only {SOLO} matching: want it maximized (maximized={MAXIMIZED_BOTH}, "
                            f"frame {wa}) or gap-maximized (tiled {wa}, frame inside it); got {solo}; "
                            f"status {cols['solo_status']}")
        if not cols["solo_status"]["canUndo"]:
            failures.append(f"Super+Alt+A with only {SOLO} matching left no Undo entry, so the arrangement failed "
                            f"or was rolled back: {cols['solo_status']}")
        if solo_undone["maximized"] or solo_undone["tiled"] or not same(solo_undone["frame"], solo_before["frame"]):
            failures.append(f"Super+Alt+Z after All·1: want {SOLO} un-maximized and untiled at {solo_before['frame']} "
                            f"(before: {solo_before}); got {solo_undone}; status {cols['solo_undo_status']}")
    for snapshot, label in [(new, "Super+Alt+A All·1"), (undone, "Super+Alt+Z after All·1")]:
        for title in sorted((set(old) | set(snapshot)) - {SOLO}):
            if old.get(title) != snapshot.get(title):
                failures.append(f"{label}: {title} is not in the filter but changed: {old.get(title)} -> {snapshot.get(title)}")

    # Focus outside the filter: the grid of terminals stays on top.
    if cols["filter_focus_outside"] != ["terminals"]:
        failures.append(f"window-filter for the focus check is {cols['filter_focus_outside']}, want ['terminals']")
    if cols["focus_outside_focused"] != "ut-A":
        failures.append(f"focus check needs ut-A focused before Super+Alt+A; focus was {cols['focus_outside_focused']}")
    failures += layout_problems(wa, cols["before_focus_outside"], cols["after_focus_outside"], TERMINALS, [3],
                                "Super+Alt+A (Terminals) with ut-A focused")
    stack = cols["focus_outside_stacking"]
    if stack["focus"] not in TERMINALS:
        failures.append(f"after Super+Alt+A (Terminals) with ut-A focused, focus is {stack['focus']}; "
                        f"want one of {TERMINALS}, the focused window being outside the filter")
    order = [w["title"] for w in stack["windows"]]
    for index, cell in enumerate(grid_cells(wa, [3])):
        top = next((w for w in stack["windows"] if overlaps(w["frame"], cell)), None)
        if top is None or top["title"] not in TERMINALS:
            failures.append(f"terminal cell {index + 1} {cell}: topmost window is {top}, want one of {TERMINALS}; "
                            f"stacking top-down {order}")
    if cols["before_focus_outside"] != cols["after_focus_outside_undo"]:
        failures.append(f"Super+Alt+Z after the focus check: state was not restored: "
                        f"before={cols['before_focus_outside']} after={cols['after_focus_outside_undo']}")
    if cols["focus_outside_undo_focus"] != "ut-A":
        failures.append(f"Super+Alt+Z after the focus check focused {cols['focus_outside_undo_focus']}, want ut-A "
                        "(Undo returns focus to the window focused before the arrangement)")
    if cols["filter_final"] != []:
        failures.append(f"window-filter reset at the end left {cols['filter_final']}")
    return failures + log_problems(runs)


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "--inner":
        inner(sys.argv[2], Path(sys.argv[3]))
    else:
        sys.exit(outer("--keep" in sys.argv))
