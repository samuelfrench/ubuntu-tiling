from pathlib import Path

from ubuntu_tiling.config import AppConfig, load_config, preset_zones, save_config
from ubuntu_tiling.geometry import Monitor, Zone, Frac


def test_config_roundtrip(tmp_path: Path):
    path = tmp_path / "config.json"
    config = AppConfig(gap=12, active_layout="default")
    config.set_monitor_zones("DisplayPort-3", preset_zones("4"))
    save_config(config, path)
    loaded = load_config(path)
    assert loaded.gap == 12
    layout = loaded.monitor_layout("DisplayPort-3")
    assert layout is not None
    assert len(layout.zones) == 4
    assert layout.zones[0].id == "1"


def test_ensure_monitors_fills_empty():
    config = AppConfig()
    mon = Monitor("DisplayPort-3", 0, 0, 5120, 1440, True)
    config.ensure_monitors([mon])
    layout = config.monitor_layout("DisplayPort-3")
    assert layout is not None
    assert len(layout.zones) == 4


def test_ensure_monitors_keeps_custom():
    config = AppConfig()
    custom = [Zone("1", Frac(0, 0, 0.5, 1)), Zone("2", Frac(0.5, 0, 0.5, 1))]
    config.set_monitor_zones("DisplayPort-3", custom)
    config.ensure_monitors([Monitor("DisplayPort-3", 0, 0, 5120, 1440, True)])
    assert [z.frac.w for z in config.monitor_layout("DisplayPort-3").zones] == [0.5, 0.5]


def test_unknown_preset():
    try:
        preset_zones("nope")
    except KeyError:
        return
    raise AssertionError("expected KeyError")
