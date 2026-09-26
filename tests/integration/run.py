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


def outer(keep: bool) -> int:
    runs = {}
    for mode in ("stock", "columns"):
        root = Path(tempfile.mkdtemp(prefix=f"ut-{mode}-"))
        extensions = root / "data/gnome-shell/extensions"
        shutil.copytree(HERE / "driver", extensions / DRIVER)
        if mode == "columns":
            shutil.copytree(REPO / "extension", extensions / UUID)
        for sub in ("config", "cache", "state"):
            (root / sub).mkdir()
        env = {k: v for k, v in os.environ.items()
               if k not in {"DISPLAY", "WAYLAND_DISPLAY", "GNOME_SHELL_SESSION_MODE",
                            "DBUS_SESSION_BUS_ADDRESS", "XAUTHORITY"}}
        env.update(XDG_CONFIG_HOME=str(root / "config"), XDG_DATA_HOME=str(root / "data"),
                   XDG_CACHE_HOME=str(root / "cache"), XDG_STATE_HOME=str(root / "state"),
                   NO_AT_BRIDGE="1")
        proc = subprocess.run(
            ["dbus-run-session", "--", "/usr/bin/python3", __file__, "--inner", mode, str(root)],
            env=env, capture_output=True, text=True, timeout=300)
        result = next((json.loads(line[7:]) for line in proc.stdout.splitlines()
                       if line.startswith("RESULT ")), None)
        if result is None:
            print(f"[{mode}] no result (exit {proc.returncode}); shell log {root}/shell.log")
            print(proc.stdout[-3000:], proc.stderr[-3000:])
            return 1
        runs[mode] = result
        if not keep:
            shutil.rmtree(root, ignore_errors=True)
        else:
            print(f"[{mode}] kept {root}")

    failures = check(runs)
    for line in failures:
        print("FAIL", line)
    print("PASS" if not failures else f"{len(failures)} check(s) failed")
    return 1 if failures else 0


def inner(mode: str, root: Path) -> None:
    import gi
    gi.require_version("Gio", "2.0")
    from gi.repository import Gio, GLib

    enabled = [TILING_ASSISTANT, DRIVER] + ([UUID] if mode == "columns" else [])
    subprocess.run(["gsettings", "set", "org.gnome.shell", "enabled-extensions", str(enabled)], check=True)
    subprocess.run(["gsettings", "set", "org.gnome.shell", "welcome-dialog-last-shown-version", "'999'"], check=True)

    display = f"ut-wayland-{os.getpid()}"
    log = open(root / "shell.log", "w")
    shell = subprocess.Popen(
        ["gnome-shell", "--headless", "--wayland", "--no-x11", "--mode=user",
         "--virtual-monitor", f"{WIDTH}x{HEIGHT}", "--wayland-display", display],
        stdout=log, stderr=subprocess.STDOUT)
    clients = []
    bus = Gio.bus_get_sync(Gio.BusType.SESSION)

    def ev(code: str):
        reply = bus.call_sync("org.gnome.Shell", "/org/gnome/Shell", "org.gnome.Shell", "Eval",
                              GLib.Variant("(s)", (code,)), GLib.VariantType("(bs)"),
                              Gio.DBusCallFlags.NONE, 60000, None)
        ok, out = reply.unpack()
        if not ok:
            raise RuntimeError(f"Eval failed: {out!r} for {code[:120]}")
        return json.loads(out) if out else None

    scenario = (HERE / "scenario.js").as_uri()

    def call(fn: str, *args):
        return ev(f"import('{scenario}').then(m => m.{fn}(...{json.dumps(list(args))}))")

    def open_window(title: str):
        clients.append(subprocess.Popen(
            ["/usr/bin/python3", str(HERE / "client.py"), title],
            env={**os.environ, "WAYLAND_DISPLAY": display, "GDK_BACKEND": "wayland"},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        if not call("waitForWindow", title):
            raise RuntimeError(f"window {title} never appeared")
        focused = call("focus", title)
        if focused != title:
            raise RuntimeError(f"focus went to {focused!r}, wanted {title}")

    result = {"mode": mode}
    try:
        for _ in range(120):
            try:
                if ev("1+1") == 2:
                    break
            except Exception:
                pass
            time.sleep(0.25)
        else:
            raise RuntimeError("shell never answered Eval")

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
        for client in clients:
            client.terminate()
        shell.send_signal(signal.SIGTERM)
        try:
            shell.wait(timeout=15)
        except subprocess.TimeoutExpired:
            shell.kill()


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
