from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

SCHEMA = "org.gnome.settings-daemon.plugins.media-keys"
CUSTOM = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding"
PREFIX = "ubuntu-tiling-"
PATH_ROOT = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/"


def _gsettings(*args: str) -> str:
    binary = shutil.which("gsettings")
    if not binary:
        raise RuntimeError("gsettings not found")
    result = subprocess.run([binary, *args], check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"gsettings {' '.join(args)} failed")
    return result.stdout.strip()


def _parse_list(raw: str) -> list[str]:
    if not raw or raw == "@as []":
        return []
    try:
        return list(json.loads(raw.replace("'", '"')))
    except json.JSONDecodeError:
        return []


def bindings(command_path: str) -> list[tuple[str, str, str, str]]:
    items: list[tuple[str, str, str, str]] = [
        ("editor", "Ubuntu Tiling Editor", f"{command_path} edit", "<Super><Alt>e"),
        ("picker", "Ubuntu Tiling Picker", f"{command_path} picker", "<Super><Alt>space"),
    ]
    for i in range(1, 10):
        items.append((f"snap{i}", f"Ubuntu Tiling Snap {i}", f"{command_path} snap {i}", f"<Super><Alt>{i}"))
    return items


def install(command_path: str) -> list[str]:
    command_path = str(Path(command_path).resolve())
    existing = _parse_list(_gsettings("get", SCHEMA, "custom-keybindings"))
    kept = [item for item in existing if PREFIX not in item]
    installed: list[str] = []
    for key, name, command, accel in bindings(command_path):
        rel = f"{PATH_ROOT}{PREFIX}{key}/"
        kept.append(rel)
        reloc = f"{CUSTOM}:{rel}"
        _gsettings("set", reloc, "name", f"'{name}'")
        _gsettings("set", reloc, "command", f"'{command}'")
        _gsettings("set", reloc, "binding", f"'{accel}'")
        installed.append(f"{accel} -> {command}")
    rendered = json.dumps(kept)
    _gsettings("set", SCHEMA, "custom-keybindings", rendered)
    return installed


def uninstall() -> None:
    existing = _parse_list(_gsettings("get", SCHEMA, "custom-keybindings"))
    kept = [item for item in existing if PREFIX not in item]
    _gsettings("set", SCHEMA, "custom-keybindings", json.dumps(kept))
    for key, *_rest in bindings("/usr/bin/true"):
        rel = f"{PATH_ROOT}{PREFIX}{key}/"
        reloc = f"{CUSTOM}:{rel}"
        try:
            _gsettings("reset", reloc, "name")
            _gsettings("reset", reloc, "command")
            _gsettings("reset", reloc, "binding")
        except RuntimeError:
            pass
