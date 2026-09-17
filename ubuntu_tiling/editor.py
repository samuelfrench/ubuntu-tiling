from __future__ import annotations

from dataclasses import dataclass

from ubuntu_tiling.config import AppConfig, save_config
from ubuntu_tiling.geometry import (
    MIN_ZONE,
    Frac,
    Monitor,
    Rect,
    Zone,
    columns,
    grid,
    main_stack,
    number_left_to_right,
    split_rect,
)
from ubuntu_tiling.overlay import HINT, paint_chrome, paint_zone
from ubuntu_tiling.wm import WindowManager


EDGE = 10


@dataclass
class Drag:
    kind: str
    start_x: int
    start_y: int
    origin: Rect | None = None
    index: int | None = None
    edges: str = ""


def _gtk():
    import gi

    gi.require_version("Gtk", "3.0")
    gi.require_version("Gdk", "3.0")
    from gi.repository import Gdk, Gtk

    return Gdk, Gtk


def hit_edges(rect: Rect, x: int, y: int) -> str:
    if not rect.contains_point(x, y) and not (
        rect.x - EDGE <= x <= rect.right + EDGE and rect.y - EDGE <= y <= rect.bottom + EDGE
    ):
        return ""
    edges = ""
    if abs(x - rect.x) <= EDGE:
        edges += "w"
    elif abs(x - rect.right) <= EDGE:
        edges += "e"
    if abs(y - rect.y) <= EDGE:
        edges += "n"
    elif abs(y - rect.bottom) <= EDGE:
        edges += "s"
    if edges:
        return edges
    if rect.contains_point(x, y):
        return "m"
    return ""


def apply_resize(origin: Rect, edges: str, dx: int, dy: int, bounds: Rect) -> Rect:
    x, y, w, h = origin.x, origin.y, origin.w, origin.h
    if "w" in edges:
        x = origin.x + dx
        w = origin.w - dx
    if "e" in edges:
        w = origin.w + dx
    if "n" in edges:
        y = origin.y + dy
        h = origin.h - dy
    if "s" in edges:
        h = origin.h + dy
    if "m" in edges:
        x = origin.x + dx
        y = origin.y + dy
    rect = Rect(x, y, w, h)
    if rect.w < MIN_ZONE:
        if "w" in edges:
            rect = Rect(origin.right - MIN_ZONE, rect.y, MIN_ZONE, rect.h)
        else:
            rect = Rect(rect.x, rect.y, MIN_ZONE, rect.h)
    if rect.h < MIN_ZONE:
        if "n" in edges:
            rect = Rect(rect.x, origin.bottom - MIN_ZONE, rect.w, MIN_ZONE)
        else:
            rect = Rect(rect.x, rect.y, rect.w, MIN_ZONE)
    return rect.clamp_to(bounds)


class ZoneEditor:
    def __init__(self, wm: WindowManager, config: AppConfig, monitor: Monitor) -> None:
        self.wm = wm
        self.config = config
        self.monitor = monitor
        self.workarea = wm.workarea(monitor)
        layout = config.monitor_layout(monitor.connector)
        self.zones = list(layout.zones) if layout else columns(4)
        self.selected: int | None = 0 if self.zones else None
        self.undo: list[list[Zone]] = []
        self.drag: Drag | None = None
        self.preview: Rect | None = None
        self.saved = False
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
        self.window.set_type_hint(Gdk.WindowTypeHint.NORMAL)
        self.window.move(monitor.x, monitor.y)
        self.window.set_default_size(monitor.w, monitor.h)
        self.window.resize(monitor.w, monitor.h)
        screen = self.window.get_screen()
        visual = screen.get_rgba_visual()
        if visual is not None:
            self.window.set_visual(visual)
        self.area = Gtk.DrawingArea()
        self.area.set_size_request(monitor.w, monitor.h)
        self.window.add(self.area)
        self.area.connect("draw", self._on_draw)
        self.window.connect("button-press-event", self._on_press)
        self.window.connect("button-release-event", self._on_release)
        self.window.connect("motion-notify-event", self._on_motion)
        self.window.connect("key-press-event", self._on_key)
        self.window.connect("delete-event", lambda *_: Gtk.main_quit())
        self.window.set_events(
            Gdk.EventMask.BUTTON_PRESS_MASK
            | Gdk.EventMask.BUTTON_RELEASE_MASK
            | Gdk.EventMask.POINTER_MOTION_MASK
            | Gdk.EventMask.KEY_PRESS_MASK
        )
        self.window.set_can_focus(True)

    def _rects(self) -> list[Rect]:
        return [z.frac.to_rect(self.workarea) for z in self.zones]

    def _push_undo(self) -> None:
        self.undo.append(list(self.zones))
        if len(self.undo) > 40:
            self.undo.pop(0)

    def _renumber(self) -> None:
        self.zones = number_left_to_right(self.zones, self.workarea)

    def _on_draw(self, _area, cr) -> bool:
        paint_chrome(cr, self.monitor, self.workarea, HINT + f"   gap {self.config.gap}px")
        rects = self._rects()
        for i, (zone, rect) in enumerate(zip(self.zones, rects)):
            paint_zone(cr, zone, rect, selected=i == self.selected)
        if self.preview is not None and self.preview.w >= 8 and self.preview.h >= 8:
            paint_zone(cr, Zone("+", Frac(0, 0, 1, 1)), self.preview, selected=True, label="+")
        return False

    def _event_xy(self, event) -> tuple[int, int]:
        return int(event.x) + self.monitor.x, int(event.y) + self.monitor.y

    def _zone_index_at(self, x: int, y: int) -> int | None:
        hits = [(i, r) for i, r in enumerate(self._rects()) if r.contains_point(x, y) or hit_edges(r, x, y)]
        if not hits:
            return None
        return min(hits, key=lambda item: item[1].area())[0]

    def _on_press(self, _widget, event) -> bool:
        x, y = self._event_xy(event)
        if event.button == 3:
            idx = self._zone_index_at(x, y)
            if idx is not None:
                self._push_undo()
                del self.zones[idx]
                self._renumber()
                self.selected = min(idx, len(self.zones) - 1) if self.zones else None
                self.area.queue_draw()
            return True
        if event.type == self.Gdk.EventType.DOUBLE_BUTTON_PRESS and event.button == 1:
            idx = self._zone_index_at(x, y)
            if idx is not None:
                self._split(idx)
            return True
        if event.button != 1:
            return False
        idx = self._zone_index_at(x, y)
        if idx is None:
            if not self.workarea.contains_point(x, y):
                return True
            self.drag = Drag("create", x, y)
            self.selected = None
            return True
        rect = self._rects()[idx]
        edges = hit_edges(rect, x, y) or "m"
        self.selected = idx
        self._push_undo()
        self.drag = Drag("edit", x, y, origin=rect, index=idx, edges=edges)
        self.area.queue_draw()
        return True

    def _on_motion(self, _widget, event) -> bool:
        if self.drag is None:
            return False
        x, y = self._event_xy(event)
        if self.drag.kind == "create":
            x0, x1 = sorted((self.drag.start_x, x))
            y0, y1 = sorted((self.drag.start_y, y))
            preview = Rect(x0, y0, x1 - x0, y1 - y0).clamp_to(self.workarea)
            self.preview = preview
            self.area.queue_draw()
            return True
        if self.drag.origin is None or self.drag.index is None:
            return False
        dx = x - self.drag.start_x
        dy = y - self.drag.start_y
        rect = apply_resize(self.drag.origin, self.drag.edges, dx, dy, self.workarea)
        zone = self.zones[self.drag.index]
        self.zones[self.drag.index] = Zone(zone.id, Frac.from_rect(rect, self.workarea))
        self.area.queue_draw()
        return True

    def _on_release(self, _widget, event) -> bool:
        if self.drag is None:
            return False
        x, y = self._event_xy(event)
        if self.drag.kind == "create":
            x0, x1 = sorted((self.drag.start_x, x))
            y0, y1 = sorted((self.drag.start_y, y))
            rect = Rect(x0, y0, x1 - x0, y1 - y0).clamp_to(self.workarea)
            if rect.w >= MIN_ZONE and rect.h >= MIN_ZONE:
                self._push_undo()
                self.zones.append(Zone("tmp", Frac.from_rect(rect, self.workarea)))
                self._renumber()
                self.selected = len(self.zones) - 1
        else:
            self._renumber()
        self.drag = None
        self.preview = None
        self.area.queue_draw()
        return True

    def _split(self, idx: int) -> None:
        rect = self._rects()[idx]
        axis = "v" if rect.w >= rect.h else "h"
        a, b = split_rect(rect, axis)
        if a.w < MIN_ZONE or a.h < MIN_ZONE or b.w < MIN_ZONE or b.h < MIN_ZONE:
            return
        self._push_undo()
        self.zones.pop(idx)
        self.zones.insert(idx, Zone("tmp", Frac.from_rect(b, self.workarea)))
        self.zones.insert(idx, Zone("tmp", Frac.from_rect(a, self.workarea)))
        self._renumber()
        self.selected = idx
        self.area.queue_draw()

    def _set_preset(self, zones: list[Zone]) -> None:
        self._push_undo()
        self.zones = zones
        self.selected = 0 if zones else None
        self.area.queue_draw()

    def _save(self) -> None:
        self._renumber()
        self.config.gap = max(0, self.config.gap)
        self.config.set_monitor_zones(self.monitor.connector, self.zones)
        save_config(self.config)
        self.saved = True

    def _on_key(self, _widget, event) -> bool:
        key = event.keyval
        Gdk = self.Gdk
        if key in (Gdk.KEY_Escape,):
            self.Gtk.main_quit()
            return True
        if key in (Gdk.KEY_Return, Gdk.KEY_KP_Enter):
            self._save()
            self.Gtk.main_quit()
            return True
        if key in (Gdk.KEY_s, Gdk.KEY_S) and event.state & Gdk.ModifierType.CONTROL_MASK:
            self._save()
            return True
        if key in (Gdk.KEY_z, Gdk.KEY_Z) and event.state & Gdk.ModifierType.CONTROL_MASK and self.undo:
            self.zones = self.undo.pop()
            self.selected = 0 if self.zones else None
            self.area.queue_draw()
            return True
        if key in (Gdk.KEY_Delete, Gdk.KEY_BackSpace) and self.selected is not None:
            self._push_undo()
            del self.zones[self.selected]
            self._renumber()
            self.selected = min(self.selected, len(self.zones) - 1) if self.zones else None
            self.area.queue_draw()
            return True
        if key in (Gdk.KEY_g, Gdk.KEY_G):
            cycle = [0, 4, 8, 12, 16, 24]
            self.config.gap = cycle[(cycle.index(self.config.gap) + 1) % len(cycle)] if self.config.gap in cycle else 8
            self.area.queue_draw()
            return True
        if key == Gdk.KEY_2:
            self._set_preset(columns(2))
            return True
        if key == Gdk.KEY_3:
            self._set_preset(columns(3))
            return True
        if key == Gdk.KEY_4:
            self._set_preset(columns(4))
            return True
        if key == Gdk.KEY_5:
            self._set_preset(columns(5))
            return True
        if key in (Gdk.KEY_m, Gdk.KEY_M):
            self._set_preset(main_stack())
            return True
        if key in (Gdk.KEY_x, Gdk.KEY_X):
            self._set_preset(grid(2, 2))
            return True
        if key in (Gdk.KEY_h, Gdk.KEY_H) and self.selected is not None:
            self._split(self.selected)
            return True
        if key in (Gdk.KEY_c, Gdk.KEY_C):
            self._set_preset([])
            return True
        return False

    def run(self) -> bool:
        self.window.show_all()
        self.window.present()
        self.window.fullscreen_on_monitor(self.window.get_screen(), 0)
        self.window.move(self.monitor.x, self.monitor.y)
        self.window.resize(self.monitor.w, self.monitor.h)
        self.window.grab_add()
        self.Gtk.main()
        self.window.grab_remove()
        self.window.destroy()
        return self.saved


def run_editor(wm: WindowManager, config: AppConfig) -> bool:
    monitors = wm.monitors()
    if not monitors:
        raise RuntimeError("no monitors")
    config.ensure_monitors(monitors)
    primary = next((m for m in monitors if m.primary), monitors[0])
    editor = ZoneEditor(wm, config, primary)
    return editor.run()
