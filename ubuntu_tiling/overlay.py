from __future__ import annotations

import tkinter as tk

from ubuntu_tiling.geometry import Monitor, Rect, Zone

EDITOR_SHORTCUTS = [
    ("Enter", "save"),
    ("Esc", "cancel"),
    ("2 3 4 5", "columns"),
    ("M", "master stack"),
    ("X", "2x2"),
    ("G", "gap"),
    ("H", "split"),
    ("Del", "remove"),
    ("Ctrl+Z", "undo"),
    ("drag", "create / resize"),
]

SNAP_SHORTCUTS = [
    ("Super+Alt+E", "editor"),
    ("Super+Alt+Space", "picker"),
    ("Super+Alt+1..9", "snap zone"),
]

PICKER_SHORTCUTS = [
    ("1..9", "snap that zone"),
    ("click", "snap clicked zone"),
    ("Esc", "cancel"),
    ("Super+Alt+1..9", "snap without picker"),
]


def make_root(monitor: Monitor, title: str) -> tk.Tk:
    root = tk.Tk()
    root.title(title)
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    try:
        root.attributes("-alpha", 0.9)
    except tk.TclError:
        pass
    root.geometry(f"{monitor.w}x{monitor.h}+{monitor.x}+{monitor.y}")
    root.configure(bg="#111418")
    root.focus_force()
    return root


def make_canvas(root: tk.Tk, monitor: Monitor) -> tk.Canvas:
    canvas = tk.Canvas(
        root,
        width=monitor.w,
        height=monitor.h,
        bg="#111418",
        highlightthickness=0,
        bd=0,
    )
    canvas.pack(fill=tk.BOTH, expand=True)
    return canvas


def _keycap(canvas: tk.Canvas, x: int, y: int, key: str, label: str) -> int:
    box_w = max(52, 8 * len(key) + 20)
    canvas.create_rectangle(x, y, x + box_w, y + 30, fill="#16302c", outline="#73f2e0", width=2, tags="chrome")
    canvas.create_text(
        x + box_w / 2,
        y + 15,
        text=key,
        fill="#73f2e0",
        font=("Sans", 11, "bold"),
        tags="chrome",
    )
    canvas.create_text(
        x + box_w + 10,
        y + 15,
        text=label,
        fill="#f2f6f5",
        font=("Sans", 12),
        anchor="w",
        tags="chrome",
    )
    return box_w + 10 + 8 * len(label) + 28


def paint_shortcuts(canvas: tk.Canvas, monitor: Monitor, workarea: Rect, rows: list[list[tuple[str, str]]]) -> None:
    mx, my = monitor.x, monitor.y
    bar_h = 28 + 38 * len(rows)
    top = workarea.bottom - my - bar_h - 12
    left = workarea.x - mx + 20
    canvas.create_rectangle(
        workarea.x - mx + 8,
        top - 10,
        workarea.right - mx - 8,
        workarea.bottom - my - 8,
        fill="#0c1214",
        outline="#2eb8a8",
        width=1,
        tags="chrome",
    )
    canvas.create_text(
        left,
        top - 2,
        anchor="w",
        fill="#8cd9d1",
        font=("Sans", 11, "bold"),
        text="KEYBOARD",
        tags="chrome",
    )
    y = top + 16
    for row in rows:
        x = left
        for key, label in row:
            x += _keycap(canvas, x, y, key, label)
        y += 38


def paint_chrome(canvas: tk.Canvas, monitor: Monitor, workarea: Rect, subtitle: str, shortcut_rows: list[list[tuple[str, str]]]) -> None:
    canvas.delete("chrome")
    mx, my = monitor.x, monitor.y
    if workarea.y > monitor.y:
        canvas.create_rectangle(0, 0, monitor.w, workarea.y - my, fill="#05070a", outline="", tags="chrome")
    if workarea.x > monitor.x:
        canvas.create_rectangle(0, 0, workarea.x - mx, monitor.h, fill="#05070a", outline="", tags="chrome")
    right = monitor.rect.right - workarea.right
    if right > 0:
        canvas.create_rectangle(workarea.right - mx, 0, monitor.w, monitor.h, fill="#05070a", outline="", tags="chrome")
    bottom = monitor.rect.bottom - workarea.bottom
    if bottom > 0:
        canvas.create_rectangle(0, workarea.bottom - my, monitor.w, monitor.h, fill="#05070a", outline="", tags="chrome")
    canvas.create_text(
        workarea.x - mx + 24,
        workarea.y - my + 24,
        anchor="w",
        fill="#f2f6f5",
        font=("Sans", 22, "bold"),
        text="Ubuntu Tiling",
        tags="chrome",
    )
    canvas.create_text(
        workarea.x - mx + 24,
        workarea.y - my + 50,
        anchor="w",
        fill="#8cd9d1",
        font=("Sans", 13),
        text=subtitle,
        tags="chrome",
    )
    paint_shortcuts(canvas, monitor, workarea, shortcut_rows)


def paint_zone(
    canvas: tk.Canvas,
    zone: Zone,
    rect: Rect,
    monitor: Monitor,
    selected: bool,
    label: str | None = None,
    shortcut: str | None = None,
) -> None:
    x0 = rect.x - monitor.x
    y0 = rect.y - monitor.y
    x1 = x0 + rect.w
    y1 = y0 + rect.h
    fill = "#2eb8a8" if selected else "#246b7a"
    outline = "#73f2e0" if selected else "#8cd9d1"
    width = 4 if selected else 2
    canvas.create_rectangle(x0, y0, x1, y1, fill=fill, outline=outline, width=width, tags=("zone", f"zone-{zone.id}"))
    canvas.create_text(
        (x0 + x1) / 2,
        (y0 + y1) / 2 - (18 if shortcut else 0),
        fill="#ffffff",
        font=("Sans", 56, "bold"),
        text=label or zone.id,
        tags=("zone", f"zone-{zone.id}"),
    )
    if shortcut:
        canvas.create_text(
            (x0 + x1) / 2,
            (y0 + y1) / 2 + 36,
            fill="#e7fffb",
            font=("Sans", 16, "bold"),
            text=shortcut,
            tags=("zone", f"zone-{zone.id}"),
        )


def zone_shortcut(zone_id: str) -> str | None:
    if zone_id.isdigit() and 1 <= int(zone_id) <= 9:
        return f"Super+Alt+{zone_id}"
    return None
