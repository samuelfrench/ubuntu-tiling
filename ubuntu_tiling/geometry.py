from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


MIN_ZONE = 80


@dataclass(frozen=True)
class Rect:
    x: int
    y: int
    w: int
    h: int

    @property
    def right(self) -> int:
        return self.x + self.w

    @property
    def bottom(self) -> int:
        return self.y + self.h

    def contains_point(self, x: int, y: int) -> bool:
        return self.x <= x < self.right and self.y <= y < self.bottom

    def intersect(self, other: Rect) -> Rect | None:
        x0 = max(self.x, other.x)
        y0 = max(self.y, other.y)
        x1 = min(self.right, other.right)
        y1 = min(self.bottom, other.bottom)
        if x1 <= x0 or y1 <= y0:
            return None
        return Rect(x0, y0, x1 - x0, y1 - y0)

    def inset(self, gap: int) -> Rect:
        if gap <= 0:
            return self
        w = self.w - 2 * gap
        h = self.h - 2 * gap
        if w < 32 or h < 32:
            return self
        return Rect(self.x + gap, self.y + gap, w, h)

    def clamp_to(self, bounds: Rect) -> Rect:
        inter = self.intersect(bounds)
        return inter if inter is not None else bounds

    def area(self) -> int:
        return max(0, self.w) * max(0, self.h)


@dataclass(frozen=True)
class Frac:
    x: float
    y: float
    w: float
    h: float

    def clamped(self) -> Frac:
        x = min(1.0, max(0.0, self.x))
        y = min(1.0, max(0.0, self.y))
        w = min(1.0 - x, max(0.0, self.w))
        h = min(1.0 - y, max(0.0, self.h))
        return Frac(x, y, w, h)

    def to_rect(self, basis: Rect) -> Rect:
        f = self.clamped()
        x0 = basis.x + int(f.x * basis.w)
        y0 = basis.y + int(f.y * basis.h)
        x1 = basis.x + int((f.x + f.w) * basis.w)
        y1 = basis.y + int((f.y + f.h) * basis.h)
        return Rect(x0, y0, max(0, x1 - x0), max(0, y1 - y0))

    def to_dict(self) -> dict[str, float]:
        f = self.clamped()
        return {"x": f.x, "y": f.y, "w": f.w, "h": f.h}

    @staticmethod
    def from_dict(data: dict) -> Frac:
        return Frac(float(data["x"]), float(data["y"]), float(data["w"]), float(data["h"])).clamped()

    @staticmethod
    def from_rect(rect: Rect, basis: Rect) -> Frac:
        if basis.w <= 0 or basis.h <= 0:
            return Frac(0.0, 0.0, 1.0, 1.0)
        return Frac(
            (rect.x - basis.x) / basis.w,
            (rect.y - basis.y) / basis.h,
            rect.w / basis.w,
            rect.h / basis.h,
        ).clamped()


@dataclass(frozen=True)
class Zone:
    id: str
    frac: Frac

    def to_dict(self) -> dict:
        return {"id": self.id, **self.frac.to_dict()}

    @staticmethod
    def from_dict(data: dict) -> Zone:
        return Zone(str(data["id"]), Frac.from_dict(data))


@dataclass(frozen=True)
class Monitor:
    connector: str
    x: int
    y: int
    w: int
    h: int
    primary: bool = False

    @property
    def rect(self) -> Rect:
        return Rect(self.x, self.y, self.w, self.h)

    @property
    def aspect(self) -> float:
        return self.w / self.h if self.h else 1.0


@dataclass(frozen=True)
class Strut:
    left: int = 0
    right: int = 0
    top: int = 0
    bottom: int = 0
    left_start_y: int = 0
    left_end_y: int = 0
    right_start_y: int = 0
    right_end_y: int = 0
    top_start_x: int = 0
    top_end_x: int = 0
    bottom_start_x: int = 0
    bottom_end_x: int = 0


def ranges_overlap(a0: int, a1: int, b0: int, b1: int) -> bool:
    return a0 < b1 and b0 < a1


def apply_struts(monitor: Rect, struts: Iterable[Strut], screen_w: int, screen_h: int) -> Rect:
    x, y, w, h = monitor.x, monitor.y, monitor.w, monitor.h
    right = x + w
    bottom = y + h
    for strut in struts:
        if strut.left and ranges_overlap(y, bottom, strut.left_start_y, strut.left_end_y + 1):
            edge = strut.left
            if x < edge:
                new_x = min(right, max(x, edge))
                w -= new_x - x
                x = new_x
        if strut.right and ranges_overlap(y, bottom, strut.right_start_y, strut.right_end_y + 1):
            edge = screen_w - strut.right
            if right > edge:
                w = max(0, edge - x)
                right = x + w
        if strut.top and ranges_overlap(x, right, strut.top_start_x, strut.top_end_x + 1):
            edge = strut.top
            if y < edge:
                new_y = min(bottom, max(y, edge))
                h -= new_y - y
                y = new_y
        if strut.bottom and ranges_overlap(x, right, strut.bottom_start_x, strut.bottom_end_x + 1):
            edge = screen_h - strut.bottom
            if bottom > edge:
                h = max(0, edge - y)
                bottom = y + h
    return Rect(x, y, max(0, w), max(0, h))


def materialize(zones: Iterable[Zone], workarea: Rect, gap: int) -> list[tuple[Zone, Rect]]:
    out: list[tuple[Zone, Rect]] = []
    for zone in zones:
        rect = zone.frac.to_rect(workarea).inset(gap)
        if rect.w >= 32 and rect.h >= 32:
            out.append((zone, rect))
    return out


def zone_at(zones: list[tuple[Zone, Rect]], x: int, y: int) -> tuple[Zone, Rect] | None:
    hits = [(zone, rect) for zone, rect in zones if rect.contains_point(x, y)]
    if not hits:
        return None
    return min(hits, key=lambda item: item[1].area())


def number_left_to_right(zones: list[Zone], workarea: Rect) -> list[Zone]:
    ordered = sorted(zones, key=lambda z: (z.frac.to_rect(workarea).y, z.frac.to_rect(workarea).x))
    return [Zone(str(i), z.frac) for i, z in enumerate(ordered, start=1)]


def split_rect(rect: Rect, axis: str) -> tuple[Rect, Rect]:
    if axis == "h":
        mid = rect.y + rect.h // 2
        return Rect(rect.x, rect.y, rect.w, mid - rect.y), Rect(rect.x, mid, rect.w, rect.bottom - mid)
    mid = rect.x + rect.w // 2
    return Rect(rect.x, rect.y, mid - rect.x, rect.h), Rect(mid, rect.y, rect.right - mid, rect.h)


def columns(n: int) -> list[Zone]:
    n = max(1, n)
    return [Zone(str(i + 1), Frac(i / n, 0.0, 1.0 / n, 1.0)) for i in range(n)]


def rows(n: int) -> list[Zone]:
    n = max(1, n)
    return [Zone(str(i + 1), Frac(0.0, i / n, 1.0, 1.0 / n)) for i in range(n)]


def grid(cols: int, row_count: int) -> list[Zone]:
    cols = max(1, cols)
    row_count = max(1, row_count)
    zones: list[Zone] = []
    i = 1
    for r in range(row_count):
        for c in range(cols):
            zones.append(Zone(str(i), Frac(c / cols, r / row_count, 1.0 / cols, 1.0 / row_count)))
            i += 1
    return zones


def main_stack(main: float = 0.6, stack: int = 2) -> list[Zone]:
    main = min(0.85, max(0.2, main))
    stack = max(1, stack)
    zones = [Zone("1", Frac(0.0, 0.0, main, 1.0))]
    sh = 1.0 / stack
    for i in range(stack):
        zones.append(Zone(str(i + 2), Frac(main, i * sh, 1.0 - main, sh)))
    return zones


def default_zones_for_aspect(aspect: float) -> list[Zone]:
    if aspect >= 2.8:
        return columns(4)
    if aspect >= 1.8:
        return columns(3)
    return columns(2)


XRANDR_CONNECTED = (
    r"^(?P<name>\S+) connected(?P<primary> primary)? "
    r"(?P<w>\d+)x(?P<h>\d+)\+(?P<x>\d+)\+(?P<y>\d+)"
)


def parse_xrandr(text: str) -> list[Monitor]:
    import re

    pattern = re.compile(XRANDR_CONNECTED)
    monitors: list[Monitor] = []
    for line in text.splitlines():
        match = pattern.match(line)
        if not match:
            continue
        monitors.append(
            Monitor(
                connector=match.group("name"),
                x=int(match.group("x")),
                y=int(match.group("y")),
                w=int(match.group("w")),
                h=int(match.group("h")),
                primary=bool(match.group("primary")),
            )
        )
    if monitors and not any(m.primary for m in monitors):
        first = monitors[0]
        monitors[0] = Monitor(first.connector, first.x, first.y, first.w, first.h, True)
    return monitors
