from ubuntu_tiling.geometry import (
    Frac,
    Monitor,
    Rect,
    Strut,
    Zone,
    apply_struts,
    columns,
    default_zones_for_aspect,
    grid,
    main_stack,
    materialize,
    number_left_to_right,
    parse_xrandr,
    split_rect,
    zone_at,
)

XRANDR = """
Screen 0: minimum 320 x 200, current 5120 x 1440, maximum 16384 x 16384
HDMI-A-1 disconnected (normal left inverted right x axis y axis)
DisplayPort-3 connected primary 5120x1440+0+0 (normal left inverted right x axis y axis) 1200mm x 340mm
DisplayPort-4 disconnected (normal left inverted right x axis y axis)
"""


def test_parse_xrandr_ultrawide():
    monitors = parse_xrandr(XRANDR)
    assert len(monitors) == 1
    mon = monitors[0]
    assert mon.connector == "DisplayPort-3"
    assert mon.primary
    assert mon.w == 5120
    assert mon.h == 1440
    assert mon.x == 0
    assert mon.y == 0


def test_struts_match_verified_workarea():
    monitor = Rect(0, 0, 5120, 1440)
    struts = [
        Strut(left=66, left_end_y=1439),
        Strut(top=32, top_end_x=5119),
    ]
    work = apply_struts(monitor, struts, 5120, 1440)
    assert work == Rect(66, 32, 5054, 1408)


def test_column_preset_covers_workarea():
    work = Rect(66, 32, 5054, 1408)
    zones = columns(4)
    rects = [z.frac.to_rect(work) for z in zones]
    assert rects[0].x == 66
    assert rects[-1].right == work.right
    assert sum(r.w for r in rects) == work.w
    assert [z.id for z in zones] == ["1", "2", "3", "4"]


def test_gap_insets_without_dropping_zones():
    work = Rect(66, 32, 5054, 1408)
    placed = materialize(columns(4), work, 8)
    assert len(placed) == 4
    assert all(rect.w > 1000 and rect.h > 1300 for _, rect in placed)


def test_frac_roundtrip():
    work = Rect(66, 32, 5054, 1408)
    original = Rect(66, 32, 1263, 1408)
    frac = Frac.from_rect(original, work)
    back = frac.to_rect(work)
    assert abs(back.x - original.x) <= 1
    assert abs(back.w - original.w) <= 1


def test_zone_at_picks_smallest_containing():
    zones = [
        Zone("1", Frac(0, 0, 1, 1)),
        Zone("2", Frac(0, 0, 0.25, 1)),
    ]
    work = Rect(0, 0, 1000, 1000)
    placed = materialize(zones, work, 0)
    hit = zone_at(placed, 10, 10)
    assert hit is not None
    assert hit[0].id == "2"


def test_default_ultrawide_is_four_columns():
    zones = default_zones_for_aspect(5120 / 1440)
    assert [z.id for z in zones] == ["1", "2", "3", "4"]


def test_split_and_renumber():
    work = Rect(0, 0, 1000, 1000)
    left, right = split_rect(Rect(0, 0, 1000, 1000), "v")
    zones = number_left_to_right(
        [Zone("tmp", Frac.from_rect(right, work)), Zone("tmp", Frac.from_rect(left, work))],
        work,
    )
    assert [z.id for z in zones] == ["1", "2"]
    assert zones[0].frac.x < zones[1].frac.x


def test_grid_and_main():
    assert len(grid(2, 2)) == 4
    assert len(main_stack(0.6, 2)) == 3
