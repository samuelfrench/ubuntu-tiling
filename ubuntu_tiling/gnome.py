from __future__ import annotations

import shutil
import subprocess

from ubuntu_tiling.geometry import Rect

DEST = "org.github.samuelfrench.UbuntuTiling"
PATH = "/org/github/samuelfrench/UbuntuTiling"
IFACE = "org.github.samuelfrench.UbuntuTiling"


class GnomeTilingUnavailable(RuntimeError):
    pass


def _gdbus(*args: str) -> subprocess.CompletedProcess[str]:
    binary = shutil.which("gdbus")
    if not binary:
        raise GnomeTilingUnavailable("gdbus not found")
    return subprocess.run(
        [binary, "call", "--session", "--dest", DEST, "--object-path", PATH, "--method", *args],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )


def available() -> bool:
    try:
        result = _gdbus(f"{IFACE}.GetFocusXid")
    except (GnomeTilingUnavailable, subprocess.TimeoutExpired, OSError):
        return False
    return result.returncode == 0


def move_resize(rect: Rect, window_xid: int | None = None) -> None:
    if window_xid:
        result = _gdbus(f"{IFACE}.MoveResizeWindow", str(window_xid), str(rect.x), str(rect.y), str(rect.w), str(rect.h))
    else:
        result = _gdbus(f"{IFACE}.MoveResize", str(rect.x), str(rect.y), str(rect.w), str(rect.h))
    if result.returncode != 0:
        raise GnomeTilingUnavailable(result.stderr.strip() or "gnome extension call failed")


def focus_xid() -> int | None:
    result = _gdbus(f"{IFACE}.GetFocusXid")
    if result.returncode != 0:
        return None
    digits = "".join(ch for ch in result.stdout if ch.isdigit())
    return int(digits) if digits else None
