from __future__ import annotations

from ubuntu_tiling.config import AppConfig
from ubuntu_tiling.geometry import Monitor
from ubuntu_tiling.overlay import paint_chrome, paint_zone
from ubuntu_tiling.wm import SnapTarget, WindowManager


def _gtk():
    import gi

    gi.require_version("Gtk", "3.0")
    gi.require_version("Gdk", "3.0")
    from gi.repository import Gdk, Gtk

    return Gdk, Gtk


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
        Gdk, Gtk = _gtk()
        self.Gdk = Gdk
        self.Gtk = Gtk
        self.window = Gtk.Window()
        self.window.set_title("Ubuntu Tiling")
        self.window.set_wmclass("ubuntu-tiling", "ubuntu-tiling")
        self.window.set_decorated(False)
        self.window.set_skip_taskbar_hint(True)
        self.window.set_skip_pager_hint(True)
        self.window.set_keep_above(True)
        self.window.set_app_paintable(True)
        self.window.move(monitor.x, monitor.y)
        self.window.set_default_size(monitor.w, monitor.h)
        screen = self.window.get_screen()
        visual = screen.get_rgba_visual()
        if visual is not None:
            self.window.set_visual(visual)
        self.area = Gtk.DrawingArea()
        self.window.add(self.area)
        self.area.connect("draw", self._on_draw)
        self.window.connect("button-press-event", self._on_press)
        self.window.connect("key-press-event", self._on_key)
        self.window.connect("delete-event", lambda *_: Gtk.main_quit())
        self.window.set_events(
            Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.KEY_PRESS_MASK
        )
        self.window.set_can_focus(True)

    def _on_draw(self, _area, cr) -> bool:
        paint_chrome(
            cr,
            self.monitor,
            self.workarea,
            "click a zone or press 1-9 to snap the previous window   Esc cancels",
        )
        for target in self.targets:
            paint_zone(cr, target.zone, target.rect, selected=False)
        return False

    def _event_xy(self, event) -> tuple[int, int]:
        return int(event.x) + self.monitor.x, int(event.y) + self.monitor.y

    def _pick(self, target: SnapTarget) -> None:
        self.choice = target
        self.Gtk.main_quit()

    def _on_press(self, _widget, event) -> bool:
        x, y = self._event_xy(event)
        for target in self.targets:
            if target.rect.contains_point(x, y):
                self._pick(target)
                return True
        return True

    def _on_key(self, _widget, event) -> bool:
        key = event.keyval
        if key == self.Gdk.KEY_Escape:
            self.Gtk.main_quit()
            return True
        names = {
            self.Gdk.KEY_1: "1",
            self.Gdk.KEY_2: "2",
            self.Gdk.KEY_3: "3",
            self.Gdk.KEY_4: "4",
            self.Gdk.KEY_5: "5",
            self.Gdk.KEY_6: "6",
            self.Gdk.KEY_7: "7",
            self.Gdk.KEY_8: "8",
            self.Gdk.KEY_9: "9",
            self.Gdk.KEY_KP_1: "1",
            self.Gdk.KEY_KP_2: "2",
            self.Gdk.KEY_KP_3: "3",
            self.Gdk.KEY_KP_4: "4",
            self.Gdk.KEY_KP_5: "5",
            self.Gdk.KEY_KP_6: "6",
            self.Gdk.KEY_KP_7: "7",
            self.Gdk.KEY_KP_8: "8",
            self.Gdk.KEY_KP_9: "9",
        }
        zone_id = names.get(key)
        if zone_id:
            for target in self.targets:
                if target.zone.id == zone_id:
                    self._pick(target)
                    return True
        return True

    def run(self) -> SnapTarget | None:
        self.window.show_all()
        self.window.present()
        self.window.fullscreen_on_monitor(self.window.get_screen(), 0)
        self.window.grab_add()
        self.Gtk.main()
        self.window.grab_remove()
        self.window.destroy()
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
