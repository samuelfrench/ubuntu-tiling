from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from ubuntu_tiling.geometry import Frac, Monitor, Zone, columns, default_zones_for_aspect, grid, main_stack


CONFIG_DIR = Path.home() / ".config" / "ubuntu-tiling"
CONFIG_PATH = CONFIG_DIR / "config.json"
SCHEMA_VERSION = 1


@dataclass
class MonitorLayout:
    connector: str
    zones: list[Zone] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"connector": self.connector, "zones": [z.to_dict() for z in self.zones]}

    @staticmethod
    def from_dict(data: dict) -> MonitorLayout:
        zones = [Zone.from_dict(z) for z in data.get("zones", [])]
        return MonitorLayout(str(data.get("connector", "primary")), zones)


@dataclass
class AppConfig:
    version: int = SCHEMA_VERSION
    gap: int = 8
    active_layout: str = "default"
    layouts: dict[str, list[MonitorLayout]] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "gap": self.gap,
            "active_layout": self.active_layout,
            "layouts": {
                name: [mon.to_dict() for mon in mons]
                for name, mons in self.layouts.items()
            },
        }

    @staticmethod
    def from_dict(data: dict) -> AppConfig:
        layouts: dict[str, list[MonitorLayout]] = {}
        raw_layouts = data.get("layouts") or {}
        for name, mons in raw_layouts.items():
            layouts[name] = [MonitorLayout.from_dict(m) for m in mons]
        gap = int(data.get("gap", 8))
        return AppConfig(
            version=int(data.get("version", SCHEMA_VERSION)),
            gap=max(0, min(64, gap)),
            active_layout=str(data.get("active_layout", "default")),
            layouts=layouts,
        )

    def ensure_monitors(self, monitors: list[Monitor]) -> None:
        layout = self.layouts.setdefault(self.active_layout, [])
        by_name = {item.connector: item for item in layout}
        changed = False
        for mon in monitors:
            if mon.connector in by_name and by_name[mon.connector].zones:
                continue
            zones = default_zones_for_aspect(mon.aspect)
            entry = MonitorLayout(mon.connector, zones)
            if mon.connector in by_name:
                by_name[mon.connector].zones = zones
            else:
                layout.append(entry)
            changed = True
        if changed:
            self.layouts[self.active_layout] = layout

    def monitor_layout(self, connector: str) -> MonitorLayout | None:
        for item in self.layouts.get(self.active_layout, []):
            if item.connector == connector:
                return item
        return None

    def set_monitor_zones(self, connector: str, zones: list[Zone]) -> None:
        layout = self.layouts.setdefault(self.active_layout, [])
        for item in layout:
            if item.connector == connector:
                item.zones = zones
                return
        layout.append(MonitorLayout(connector, zones))

    def all_zones(self) -> list[tuple[str, Zone]]:
        out: list[tuple[str, Zone]] = []
        for item in self.layouts.get(self.active_layout, []):
            for zone in item.zones:
                out.append((item.connector, zone))
        return out


def load_config(path: Path | None = None) -> AppConfig:
    path = path or CONFIG_PATH
    if not path.exists():
        return AppConfig()
    with path.open("r", encoding="utf-8") as fh:
        return AppConfig.from_dict(json.load(fh))


def save_config(config: AppConfig, path: Path | None = None) -> None:
    path = path or CONFIG_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(config.to_dict(), indent=2) + "\n"
    fd, tmp_name = tempfile.mkstemp(prefix="ubuntu-tiling-", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def preset_zones(name: str) -> list[Zone]:
    presets = {
        "2": columns(2),
        "3": columns(3),
        "4": columns(4),
        "5": columns(5),
        "columns-2": columns(2),
        "columns-3": columns(3),
        "columns-4": columns(4),
        "columns-5": columns(5),
        "grid-2x2": grid(2, 2),
        "main": main_stack(),
        "ultrawide": columns(4),
    }
    if name not in presets:
        raise KeyError(f"unknown preset: {name}")
    return presets[name]


def empty_frac() -> Frac:
    return Frac(0.0, 0.0, 1.0, 1.0)
