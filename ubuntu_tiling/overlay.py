from __future__ import annotations

from ubuntu_tiling.geometry import Monitor, Rect, Zone

HINT = (
    "drag empty space to create a zone   drag edges to resize   double-click to split   "
    "Del removes   2-5 column presets   G gap   Enter save   Esc cancel"
)


def rounded_rect(cr, rect: Rect, radius: float) -> None:
    x, y, w, h = rect.x, rect.y, rect.w, rect.h
    radius = min(radius, w / 2, h / 2)
    cr.new_sub_path()
    cr.arc(x + w - radius, y + radius, radius, -1.5708, 0)
    cr.arc(x + w - radius, y + h - radius, radius, 0, 1.5708)
    cr.arc(x + radius, y + h - radius, radius, 1.5708, 3.1416)
    cr.arc(x + radius, y + radius, radius, 3.1416, 4.7124)
    cr.close_path()


def paint_chrome(cr, monitor: Monitor, workarea: Rect, hint: str = HINT) -> None:
    cr.set_source_rgba(0.02, 0.03, 0.04, 0.62)
    cr.rectangle(monitor.x, monitor.y, monitor.w, monitor.h)
    cr.fill()
    cr.set_source_rgba(0.0, 0.0, 0.0, 0.35)
    if workarea.y > monitor.y:
        cr.rectangle(monitor.x, monitor.y, monitor.w, workarea.y - monitor.y)
        cr.fill()
    if workarea.x > monitor.x:
        cr.rectangle(monitor.x, monitor.y, workarea.x - monitor.x, monitor.h)
        cr.fill()
    right = monitor.rect.right - workarea.right
    if right > 0:
        cr.rectangle(workarea.right, monitor.y, right, monitor.h)
        cr.fill()
    bottom = monitor.rect.bottom - workarea.bottom
    if bottom > 0:
        cr.rectangle(monitor.x, workarea.bottom, monitor.w, bottom)
        cr.fill()
    cr.set_source_rgba(1, 1, 1, 0.88)
    cr.select_font_face("Sans")
    cr.set_font_size(18)
    cr.move_to(workarea.x + 24, workarea.y + 32)
    cr.show_text("Ubuntu Tiling")
    cr.set_font_size(13)
    cr.set_source_rgba(1, 1, 1, 0.7)
    cr.move_to(workarea.x + 24, workarea.bottom - 20)
    cr.show_text(hint)


def paint_zone(cr, zone: Zone, rect: Rect, selected: bool, label: str | None = None) -> None:
    if selected:
        cr.set_source_rgba(0.18, 0.72, 0.66, 0.42)
    else:
        cr.set_source_rgba(0.14, 0.42, 0.48, 0.32)
    rounded_rect(cr, rect, 10)
    cr.fill_preserve()
    if selected:
        cr.set_source_rgba(0.45, 0.95, 0.88, 0.95)
        cr.set_line_width(3)
    else:
        cr.set_source_rgba(0.55, 0.85, 0.82, 0.75)
        cr.set_line_width(2)
    cr.stroke()
    text = label or zone.id
    cr.set_source_rgba(1, 1, 1, 0.95)
    cr.set_font_size(min(64, max(28, rect.h // 6)))
    extents = cr.text_extents(text)
    cr.move_to(rect.x + (rect.w - extents.width) / 2 - extents.x_bearing, rect.y + (rect.h + extents.height) / 2)
    cr.show_text(text)
