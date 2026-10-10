#!/usr/bin/env python3
"""Exercise the installer with private settings and no GNOME Shell process."""
import ast
import os
from pathlib import Path
import subprocess
import sys

from run import REPO, UUID, bus_command, cleanup, env_for, prepare_root


def command(*args):
    return subprocess.run(args, cwd=REPO, check=True, capture_output=True, text=True).stdout.strip()


def settings(key):
    value = command("gsettings", "get", "org.gnome.shell", key)
    return [] if value.startswith("@as") else ast.literal_eval(value)


def inner():
    enabled = ["tiling-assistant@ubuntu.com", "unrelated@test"]
    command("gsettings", "set", "org.gnome.shell", "enabled-extensions", str(enabled))
    command("gsettings", "set", "org.gnome.shell", "disabled-extensions", str([UUID, "disabled@test"]))
    for _ in range(2):
        command("./install.sh")
        assert settings("enabled-extensions") == enabled + [UUID]
        assert settings("disabled-extensions") == ["disabled@test"]
    source = REPO / "extension"
    destination = Path(os.environ["XDG_DATA_HOME"]) / "gnome-shell/extensions" / UUID
    for path in source.rglob("*"):
        if path.is_file() and path.name != "gschemas.compiled":
            assert path.read_bytes() == (destination / path.relative_to(source)).read_bytes(), path
    assert (destination / "schemas/gschemas.compiled").stat().st_size > 0
    command("./install.sh", "uninstall")
    assert not destination.exists()
    assert settings("enabled-extensions") == enabled
    # gnome-extensions may record this UUID as disabled; other entries stay.
    assert [item for item in settings("disabled-extensions") if item != UUID] == ["disabled@test"]
    print("PASS: isolated install, reinstall and uninstall; exact files, compiled schema and unrelated settings preserved")


if __name__ == "__main__":
    if "--inner" in sys.argv:
        inner()
    else:
        root = prepare_root("package")
        try:
            subprocess.run(bus_command(root, sys.executable, __file__, "--inner"),
                           cwd=REPO, env=env_for(root), check=True)
        finally:
            cleanup(root)
