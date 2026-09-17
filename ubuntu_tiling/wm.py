from __future__ import annotations

import os
from dataclasses import dataclass

from ubuntu_tiling.geometry import Monitor, Rect, Zone, materialize, zone_at
from ubuntu_tiling import gnome
from ubuntu_tiling.config import AppConfig
from ubuntu_tiling.x11 import X11Session


@dataclass
class SnapTarget:
    connector: str
    zone: Zone
    rect: Rect


class WindowManager:
    def __init__(self) -> None:
        self.session_type = (os.environ.get("XDG_SESSION_TYPE") or "").lower()
        self._x11: X11Session | None = None
        if self.session_type != "wayland" and os.environ.get("DISPLAY"):
            try:
                self._x11 = X11Session()
            except RuntimeError:
                self._x11 = None
        self._gnome = gnome.available()

    @property
    def backend(self) -> str:
        if self._x11 is not None:
            return "x11"
        if self._gnome:
            return "gnome-extension"
        return "none"

    def close(self) -> None:
        if self._x11 is not None:
            self._x11.close()
            self._x11 = None

    def __enter__(self) -> WindowManager:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def require_backend(self) -> str:
        name = self.backend
        if name == "none":
            raise RuntimeError(
                "no window backend: on X11 need DISPLAY; on GNOME Wayland enable the ubuntu-tiling shell extension"
            )
        return name

    def monitors(self) -> list[Monitor]:
        if self._x11 is not None:
            return self._x11.monitors()
        raise RuntimeError("cannot list monitors without X11 (Wayland needs the editor to run under XWayland or xrandr)")

    def workarea(self, monitor: Monitor) -> Rect:
        if self._x11 is not None:
            return self._x11.workarea(monitor)
        return monitor.rect

    def active_window(self) -> int | None:
        if self._x11 is not None:
            win = self._x11.active_window()
            if win and not self._x11.is_skippable(win):
                return win
            return win
        return gnome.focus_xid()

    def snap_window(self, window: int | None, rect: Rect) -> None:
        backend = self.require_backend()
        if backend == "x11":
            assert self._x11 is not None
            if window is None:
                window = self._x11.active_window()
            if window is None:
                raise RuntimeError("no active window")
            self._x11.move_resize(window, rect)
            return
        gnome.move_resize(rect, window)

    def describe(self, window: int) -> str:
        if self._x11 is not None:
            return self._x11.describe(window)
        return f"window {window}"

    def materialized(self, config: AppConfig) -> list[SnapTarget]:
        targets: list[SnapTarget] = []
        for monitor in self.monitors():
            layout = config.monitor_layout(monitor.connector)
            if layout is None or not layout.zones:
                continue
            work = self.workarea(monitor)
            for zone, rect in materialize(layout.zones, work, config.gap):
                targets.append(SnapTarget(monitor.connector, zone, rect))
        return targets

    def target_by_id(self, config: AppConfig, zone_id: str) -> SnapTarget:
        matches = [t for t in self.materialized(config) if t.zone.id == str(zone_id)]
        if not matches:
            raise KeyError(f"no zone {zone_id}")
        return matches[0]

    def target_at(self, config: AppConfig, x: int, y: int) -> SnapTarget | None:
        packed = [(t.zone, t.rect) for t in self.materialized(config)]
        hit = zone_at(packed, x, y)
        if hit is None:
            return None
        zone, rect = hit
        for target in self.materialized(config):
            if target.zone.id == zone.id and target.rect == rect:
                return target
        return None
