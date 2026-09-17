from __future__ import annotations

from ubuntu_tiling.config import AppConfig
from ubuntu_tiling.geometry import Monitor
from ubuntu_tiling.overlay import (
    PICKER_SHORTCUTS,
    SNAP_SHORTCUTS,
    make_canvas,
    make_root,
    paint_chrome,
    paint_zone,
    zone_shortcut,
)
from ubuntu_tiling.wm import SnapTarget, WindowManager


class ZonePicker:
    def __init__(
        self,
        wm: WindowManager,
        config: AppConfig,
        monitor: Monitor,
        target_window: int | None,
        targets: list[SnapTarget],
    ) -> None:
        self.wm = wm
        self.config = config
        self.monitor = monitor
        self.workarea = wm.workarea(monitor)
        self.target_window = target_window
        self.targets = [t for t in targets if t.connector == monitor.connector]
        self.choice: SnapTarget | None = None
        self.root = make_root(monitor, "Ubuntu Tiling")
        self.canvas = make_canvas(self.root, monitor)
        self.canvas.bind("<ButtonPress-1>", self._on_click)
        self.root.bind("<Key>", self._on_key)
        self.canvas.bind("<Key>", self._on_key)
        self.root.protocol("WM_DELETE_WINDOW", self._cancel)
        self.canvas.focus_set()
        self._redraw()

    def _redraw(self) -> None:
        self.canvas.delete("zone")
        paint_chrome(
            self.canvas,
            self.monitor,
            self.workarea,
            "click a numbered section or press its key",
            [SNAP_SHORTCUTS, PICKER_SHORTCUTS],
        )
        for target in self.targets:
            paint_zone(
                self.canvas,
                target.zone,
                target.rect,
                self.monitor,
                selected=False,
                shortcut=zone_shortcut(target.zone.id),
            )
        self.canvas.tag_raise("chrome")

    def _pick(self, target: SnapTarget) -> None:
        self.choice = target
        self.root.destroy()

    def _cancel(self) -> None:
        self.choice = None
        self.root.destroy()

    def _on_click(self, event) -> None:
        x = int(event.x) + self.monitor.x
        y = int(event.y) + self.monitor.y
        for target in self.targets:
            if target.rect.contains_point(x, y):
                self._pick(target)
                return

    def _on_key(self, event) -> None:
        if event.keysym == "Escape":
            self._cancel()
            return
        key = event.keysym
        if key.startswith("KP_"):
            key = key[3:]
        if key.isdigit():
            for target in self.targets:
                if target.zone.id == key:
                    self._pick(target)
                    return

    def run(self) -> SnapTarget | None:
        self.root.mainloop()
        return self.choice


def run_picker(wm: WindowManager, config: AppConfig, target_window: int | None) -> SnapTarget | None:
    monitors = wm.monitors()
    if not monitors:
        raise RuntimeError("no monitors")
    config.ensure_monitors(monitors)
    primary = next((m for m in monitors if m.primary), monitors[0])
    targets = wm.materialized(config)
    if not targets:
        raise RuntimeError("no zones saved; run ubuntu-tiling edit first")
    picker = ZonePicker(wm, config, primary, target_window, targets)
    return picker.run()
