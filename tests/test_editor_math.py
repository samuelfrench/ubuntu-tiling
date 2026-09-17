from ubuntu_tiling.editor import apply_resize, hit_edges
from ubuntu_tiling.geometry import Rect


def test_hit_edges_east():
    rect = Rect(100, 100, 400, 400)
    assert "e" in hit_edges(rect, 500, 300)
    assert hit_edges(rect, 300, 300) == "m"
    assert hit_edges(rect, 10, 10) == ""


def test_resize_east_clamped():
    origin = Rect(100, 100, 400, 400)
    bounds = Rect(0, 0, 1000, 1000)
    resized = apply_resize(origin, "e", 50, 0, bounds)
    assert resized == Rect(100, 100, 450, 400)


def test_resize_keeps_minimum():
    origin = Rect(100, 100, 400, 400)
    bounds = Rect(0, 0, 1000, 1000)
    resized = apply_resize(origin, "e", -500, 0, bounds)
    assert resized.w == 80
