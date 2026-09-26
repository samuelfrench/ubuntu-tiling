#!/usr/bin/python3
"""Headless GNOME Shell integration test for tiling-columns.

Runs an isolated GNOME Shell (private D-Bus session via dbus-run-session, private
XDG dirs so dconf and extensions never touch the live session) twice:

  stock    Tiling Assistant only: the third window covers the right half.
  columns  Tiling Assistant + tiling-columns: windows become columns.

Input is real: Super+Left/Right through a Clutter virtual keyboard and a
Super+drag through a virtual pointer. Exit status 0 means every check passed.

Needs GNOME Shell 46, the Ubuntu Tiling Assistant package, and /usr/bin/python3
with python3-gi + GTK 3. Usage: tests/integration/run.py [--keep]
"""
import json
import os
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
ACTIVE = 1  # ExtensionState.ACTIVE in GNOME Shell 46
TOLERANCE = 2


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
            env=env_for(root), capture_output=True, text=True, timeout=300)
        result = next((json.loads(line[7:]) for line in proc.stdout.splitlines()
                       if line.startswith("RESULT ")), None)
        if result is None:
            print(f"[{mode}] no result (exit {proc.returncode}); shell log {root}/shell.log")
            print(proc.stdout[-3000:], proc.stderr[-3000:])
            return 1
        runs[mode] = result
        (root / "result.json").write_text(json.dumps(result, indent=1))
        if keep:
            print(f"[{mode}] kept {root}")
        else:
            cleanup(root)

    failures = check(runs)
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

    def open_window(self, title: str):
        self._clients.append(subprocess.Popen(
            ["/usr/bin/python3", str(HERE / "client.py"), title],
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
            ev(f"Main.extensionManager.disableExtension('{UUID}')")
            time.sleep(0.5)
            result["columns_after_disable"] = ev(f"Main.extensionManager.lookup('{UUID}').state")
            open_window("ut-F")
            call("superArrow", "right")
            result["after_disable_F_super_right"] = call("state")
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


def check(runs):
    failures = []
    for mode, run in runs.items():
        if "error" in run:
            failures.append(f"[{mode}] {run['error']}")
        elif run["ready"]["startingUp"] or run["ready"]["actionMode"] != 1:  # Shell.ActionMode.NORMAL
            failures.append(f"[{mode}] shell not ready for keybindings: {run['ready']}")
    if failures:
        return failures

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
    (f,) = frames(cols["after_disable_F_super_right"], "ut-F")
    if not same(f, right_half):
        failures.append(f"[columns] after disable, F Super+Right want right half, got {f}")
    return failures


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "--inner":
        inner(sys.argv[2], Path(sys.argv[3]))
    else:
        sys.exit(outer("--keep" in sys.argv))
