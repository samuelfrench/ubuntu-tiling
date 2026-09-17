from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

from ubuntu_tiling import __version__
from ubuntu_tiling.config import CONFIG_PATH, AppConfig, load_config, preset_zones, save_config
from ubuntu_tiling.geometry import materialize
from ubuntu_tiling.keys import install as install_keys, uninstall as uninstall_keys
from ubuntu_tiling.wm import WindowManager

REPO_ROOT = Path(__file__).resolve().parent.parent
BIN_SRC = REPO_ROOT / "bin" / "ubuntu-tiling"
DESKTOP_SRC = REPO_ROOT / "share" / "applications" / "ubuntu-tiling.desktop"
EXTENSION_SRC = REPO_ROOT / "gnome-extension"
EXTENSION_UUID = "ubuntu-tiling@samuelfrench.github.io"


def _command_path() -> Path:
    local = Path.home() / ".local" / "bin" / "ubuntu-tiling"
    if local.exists():
        return local
    if BIN_SRC.exists():
        return BIN_SRC
    return Path("ubuntu-tiling")


def _print(msg: str) -> None:
    print(msg)


def cmd_doctor(wm: WindowManager, config: AppConfig) -> int:
    _print(f"ubuntu-tiling {__version__}")
    _print(f"python {sys.executable}")
    _print(f"session {wm.session_type or 'unknown'} DISPLAY={os.environ.get('DISPLAY', '')!r}")
    _print(f"backend {wm.backend}")
    _print(f"config {CONFIG_PATH}")
    try:
        monitors = wm.monitors()
    except RuntimeError as exc:
        _print(f"monitors error: {exc}")
        monitors = []
    for mon in monitors:
        work = wm.workarea(mon)
        _print(
            f"monitor {mon.connector}{' primary' if mon.primary else ''} "
            f"{mon.w}x{mon.h}+{mon.x}+{mon.y} workarea {work.w}x{work.h}+{work.x}+{work.y}"
        )
        layout = config.monitor_layout(mon.connector)
        if layout:
            _print(f"  zones {len(layout.zones)} gap {config.gap}")
            for zone, rect in materialize(layout.zones, work, config.gap):
                _print(f"  {zone.id}: {rect.w}x{rect.h}+{rect.x}+{rect.y}")
    active = wm.active_window()
    if active:
        _print(f"active {wm.describe(active)}")
    else:
        _print("active none")
    return 0 if wm.backend != "none" else 2


def cmd_list(wm: WindowManager, config: AppConfig) -> int:
    config.ensure_monitors(wm.monitors())
    for target in wm.materialized(config):
        r = target.rect
        _print(f"{target.zone.id}\t{target.connector}\t{r.w}x{r.h}+{r.x}+{r.y}")
    return 0


def cmd_snap(wm: WindowManager, config: AppConfig, zone_id: str, window: int | None) -> int:
    config.ensure_monitors(wm.monitors())
    save_config(config)
    target = wm.target_by_id(config, zone_id)
    if window is None:
        window = wm.active_window()
    wm.snap_window(window, target.rect)
    label = wm.describe(window) if window else "focused"
    _print(f"snapped {label} -> zone {target.zone.id} {target.rect.w}x{target.rect.h}+{target.rect.x}+{target.rect.y}")
    return 0


def cmd_edit(wm: WindowManager, config: AppConfig) -> int:
    from ubuntu_tiling.editor import run_editor

    config.ensure_monitors(wm.monitors())
    saved = run_editor(wm, config)
    _print("saved" if saved else "cancelled")
    return 0


def cmd_picker(wm: WindowManager, config: AppConfig) -> int:
    from ubuntu_tiling.picker import run_picker

    window = wm.active_window()
    config.ensure_monitors(wm.monitors())
    choice = run_picker(wm, config, window)
    if choice is None:
        _print("cancelled")
        return 0
    wm.snap_window(window, choice.rect)
    _print(f"snapped zone {choice.zone.id}")
    return 0


def cmd_layout(wm: WindowManager, config: AppConfig, preset: str) -> int:
    monitors = wm.monitors()
    config.ensure_monitors(monitors)
    zones = preset_zones(preset)
    primary = next((m for m in monitors if m.primary), monitors[0])
    config.set_monitor_zones(primary.connector, zones)
    save_config(config)
    _print(f"layout {preset} on {primary.connector} ({len(zones)} zones)")
    return 0


def _install_extension() -> str:
    dest = Path.home() / ".local/share/gnome-shell/extensions" / EXTENSION_UUID
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("metadata.json", "extension.js"):
        shutil.copy2(EXTENSION_SRC / name, dest / name)
    return str(dest)


def cmd_install() -> int:
    local_bin = Path.home() / ".local" / "bin"
    local_bin.mkdir(parents=True, exist_ok=True)
    target = local_bin / "ubuntu-tiling"
    if target.exists() or target.is_symlink():
        target.unlink()
    target.symlink_to(BIN_SRC)
    apps = Path.home() / ".local/share/applications"
    apps.mkdir(parents=True, exist_ok=True)
    desktop_dest = apps / "ubuntu-tiling.desktop"
    desktop_text = DESKTOP_SRC.read_text(encoding="utf-8").replace("@BIND@", str(target))
    desktop_dest.write_text(desktop_text, encoding="utf-8")
    ext = _install_extension()
    installed = install_keys(str(target))
    _print(f"linked {target} -> {BIN_SRC}")
    _print(f"desktop {desktop_dest}")
    _print(f"extension files {ext} (enable on Wayland, then restart GNOME)")
    for line in installed:
        _print(f"key {line}")
    return 0


def cmd_uninstall() -> int:
    uninstall_keys()
    local = Path.home() / ".local/bin/ubuntu-tiling"
    if local.is_symlink() or local.exists():
        local.unlink()
        _print(f"removed {local}")
    desktop = Path.home() / ".local/share/applications/ubuntu-tiling.desktop"
    if desktop.exists():
        desktop.unlink()
        _print(f"removed {desktop}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ubuntu-tiling", description="Define screen zones and snap windows to them.")
    parser.add_argument("--version", action="version", version=f"ubuntu-tiling {__version__}")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("doctor", help="print session, monitors, backend, zones")
    sub.add_parser("list", help="list materialized zones")
    sub.add_parser("edit", help="fullscreen zone editor")
    sub.add_parser("picker", help="click a zone to snap the focused window")
    snap = sub.add_parser("snap", help="snap the focused window to a zone id")
    snap.add_argument("zone")
    snap.add_argument("--window", type=lambda v: int(v, 0), default=None)
    lay = sub.add_parser("layout", help="apply a named preset to the primary monitor")
    lay.add_argument("preset", choices=["2", "3", "4", "5", "columns-2", "columns-3", "columns-4", "columns-5", "grid-2x2", "main", "ultrawide"])
    sub.add_parser("install", help="symlink, desktop file, GNOME keybindings, extension files")
    sub.add_parser("uninstall", help="remove keybindings and symlink")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd == "install":
        return cmd_install()
    if args.cmd == "uninstall":
        return cmd_uninstall()
    config = load_config()
    wm = WindowManager()
    try:
        if args.cmd == "doctor":
            return cmd_doctor(wm, config)
        if args.cmd == "list":
            return cmd_list(wm, config)
        if args.cmd == "edit":
            return cmd_edit(wm, config)
        if args.cmd == "picker":
            return cmd_picker(wm, config)
        if args.cmd == "snap":
            return cmd_snap(wm, config, args.zone, args.window)
        if args.cmd == "layout":
            return cmd_layout(wm, config, args.preset)
        return 2
    except (KeyError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        wm.close()
